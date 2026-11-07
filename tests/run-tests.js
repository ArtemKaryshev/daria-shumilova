/*
 * Автотесты сайта и админ-панели (Playwright, без установки тестового раннера).
 * Запуск из корня проекта:  node tests/run-tests.js
 * Supabase имитируется: запросы к https://mock.supabase.test перехватываются тестом.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8790;
const BASE = `http://localhost:${PORT}/`;
const MOCK = "https://mock.supabase.test";
const DEFAULT = JSON.parse(fs.readFileSync(path.join(ROOT, "content/default.json"), "utf8"));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/* ---------- статический сервер ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

/* ---------- имитация Supabase в браузере ---------- */
const MOCK_CLIENT = `
window.supabase = { createClient(url, key) {
  const j = (r) => r.json();
  let session = JSON.parse(localStorage.getItem("mock_session") || "null");
  const listeners = [];
  return {
    auth: {
      async getSession() { return { data: { session } }; },
      async getUser() { return { data: { user: session && session.user } }; },
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        const r = await fetch(url + "/auth/v1/token", { method: "POST", body: JSON.stringify({ email, password }) }).then(j);
        if (r.error) return { data: {}, error: { message: r.error } };
        session = { user: r.user }; localStorage.setItem("mock_session", JSON.stringify(session));
        return { data: { user: r.user, session }, error: null };
      },
      async signOut() { session = null; localStorage.removeItem("mock_session"); return { error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      async resetPasswordForEmail() { return { error: null }; }
    },
    async rpc(name) {
      const r = await fetch(url + "/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify({ user: session && session.user }) }).then(j);
      return { data: r, error: null };
    },
    from(table) {
      return {
        select() { return { eq() { return { async maybeSingle() {
          const rows = await fetch(url + "/rest/v1/" + table + "?id=eq.1&select=data").then(j);
          return { data: rows[0] || null, error: null };
        } }; } }; },
        async upsert(row) {
          const r = await fetch(url + "/rest/v1/" + table, { method: "POST", body: JSON.stringify({ row, user: session && session.user }) });
          return r.ok ? { error: null } : { error: { message: "denied " + r.status } };
        }
      };
    },
    storage: { from(bucket) { return {
      async upload(p, file) {
        const r = await fetch(url + "/storage/v1/object/" + bucket + "/" + p, { method: "POST", body: file });
        return r.ok ? { data: { path: p }, error: null } : { error: { message: "upload failed" } };
      },
      getPublicUrl(p) { return { data: { publicUrl: url + "/storage/v1/object/public/" + bucket + "/" + p } }; }
    }; } }
  };
} };`;

function mockBackend(db) {
  return async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    const body = () => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
    if (p === "/auth/v1/token") {
      const { email, password } = body();
      if (password !== "correct-pass") return route.fulfill({ json: { error: "Invalid login credentials" } });
      return route.fulfill({ json: { user: { id: email === "admin@test.ru" ? "u-admin" : "u-other", email } } });
    }
    if (p === "/rest/v1/rpc/is_admin") return route.fulfill({ json: body().user?.id === "u-admin" });
    if (p === "/rest/v1/site_content" && req.method() === "GET") {
      db.reads++;
      if (db.fail) return route.fulfill({ status: 500, body: "boom" });
      return route.fulfill({ json: db.data ? [{ data: db.data }] : [] });
    }
    if (p === "/rest/v1/site_content" && req.method() === "POST") {
      const b = body();
      if (b.user?.id !== "u-admin") return route.fulfill({ status: 403, body: "rls" });
      db.data = b.row.data; db.saves++;
      return route.fulfill({ status: 201, body: "" });
    }
    if (p.startsWith("/storage/v1/object/public/")) return route.fulfill({ body: PNG, contentType: "image/png" });
    if (p.startsWith("/storage/v1/object/")) { db.uploads.push(p); return route.fulfill({ json: { Key: p } }); }
    return route.fulfill({ status: 404, body: "" });
  };
}

async function withMock(page, db, { mockClient = true } = {}) {
  await page.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: `window.SITE_CONFIG={SUPABASE_URL:"${MOCK}",SUPABASE_ANON_KEY:"test-key",STORAGE_BUCKET:"media"};` }));
  if (mockClient) await page.route("**/assets/vendor/supabase.js", (r) => r.fulfill({ contentType: "text/javascript", body: MOCK_CLIENT }));
  await page.route(MOCK + "/**", mockBackend(db));
}

/* ---------- мини-раннер ---------- */
const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log("  ✓ " + name); }
  catch (e) { results.push([false, name, e]); console.log("  ✗ " + name + "\n      " + (e.message || e).split("\n")[0] + "\n      " + ((e.stack || "").split("\n").find((l) => l.includes("run-tests.js")) || "").trim()); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...opts });
    const page = await ctx.newPage();
    // По умолчанию тесты работают без настоящей базы: подставляем пустой config.js
    await page.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.SITE_CONFIG={SUPABASE_URL:\"\",SUPABASE_ANON_KEY:\"\",STORAGE_BUCKET:\"media\"};" }));
    page.errors = [];
    page.on("pageerror", (e) => page.errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) page.errors.push(m.text()); });
    return page;
  };

  console.log("\nПубличный сайт");

  await test("рендерит шапку, ФИО с отчеством и три блока в шапке", async () => {
    const page = await newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const h1 = await page.textContent("#heroName");
    assert(/Дарья Александровна\s*Шумилова/.test(h1), "ФИО: " + h1);
    assert((await page.$$(".hcard")).length === 3, "должно быть 3 блока в шапке");
    const cards = await page.textContent("#headerCards");
    assert(/Грамоты/.test(cards) && /Педагогическая деятельность/.test(cards) && /Связаться/.test(cards), "блоки шапки");
    assert(await page.$eval(".portrait", (e) => getComputedStyle(e).borderTopLeftRadius === "50%"), "фото должно быть круглым");
    assert(page.errors.length === 0, "ошибки в консоли: " + page.errors.join("; "));
    await page.context().close();
  });

  await test("показывает все достижения и фильтрует по категориям", async () => {
    const page = await newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const total = DEFAULT.achievements.filter((a) => !a.hidden).length;
    assert((await page.$$(".ach")).length === total, "ожидалось " + total);
    await page.click('.filter[data-f="sport"]');
    const n = await page.$$eval(".ach", (els) => els.length);
    assert(n === DEFAULT.achievements.filter((a) => a.category === "sport").length, "фильтр «Спорт»: " + n);
    await page.click('.filter[data-f="all"]');
    assert((await page.$$(".ach")).length === total, "сброс фильтра");
    const first = await page.textContent(".ach h3");
    assert(DEFAULT.achievements.find((a) => a.title === first).featured, "главные достижения идут первыми");
    await page.context().close();
  });

  await test("на сайте нет длинных тире", async () => {
    const page = await newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const txt = await page.evaluate(() => document.body.innerText + " " + document.title);
    assert(!/[—–]/.test(txt), "найдено тире: " + (txt.match(/.{0,30}[—–].{0,30}/) || [""])[0]);
    await page.context().close();
  });

  await test("мобильная версия: нет горизонтальной прокрутки, меню открывается", async () => {
    const page = await newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 0, "горизонтальная прокрутка " + over + "px");
    assert(!(await page.isVisible("#navLinks a[href='#contacts']")), "меню скрыто до нажатия");
    await page.click("#burger");
    assert(await page.isVisible("#navLinks a[href='#contacts']"), "меню открылось");
    await page.click("#navLinks a[href='#contacts']");
    assert(!(await page.isVisible("#navLinks a[href='#about']")), "меню закрылось после перехода");
    await page.context().close();
  });

  await test("контент из базы: контакты, фото, лайтбокс, копирование почты", async () => {
    const db = { data: JSON.parse(JSON.stringify(DEFAULT)), reads: 0, saves: 0, uploads: [] };
    db.data.contacts.email = "daria@example.ru"; db.data.contacts.telegram = "@daria_teacher";
    db.data.hero.photo = MOCK + "/storage/v1/object/public/media/p.png";
    db.data.achievements[0].image = MOCK + "/storage/v1/object/public/media/a.png";
    const page = await newPage();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await withMock(page, db);
    await page.goto(BASE, { waitUntil: "networkidle" });
    assert(db.reads >= 1, "сайт не обратился к базе");
    assert(await page.$(".portrait img"), "фото не показано");
    const tg = await page.getAttribute('.ccard a[href^="https://t.me/"]', "href");
    assert(tg === "https://t.me/daria_teacher", "ссылка Telegram: " + tg);
    assert(await page.$('.hcard--contact a[href="mailto:daria@example.ru"]'), "почта в блоке шапки");
    await page.click(".ach__media");
    assert(await page.isVisible("#lightbox"), "лайтбокс не открылся");
    await page.keyboard.press("Escape");
    assert(!(await page.isVisible("#lightbox")), "лайтбокс не закрылся");
    await page.click(".ccard__copy");
    assert((await page.evaluate(() => navigator.clipboard.readText())) === "daria@example.ru", "почта не скопирована");
    await page.context().close();
  });

  await test("если база недоступна, показывается резервное содержимое", async () => {
    const db = { data: null, fail: true, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE, { waitUntil: "networkidle" });
    assert(db.reads >= 1, "запрос к базе не отправлен");
    assert(/Шумилова/.test(await page.textContent("#heroName")), "резервный контент не загрузился");
    await page.context().close();
  });

  await test("защита от HTML-инъекций в тексте", async () => {
    const db = { data: JSON.parse(JSON.stringify(DEFAULT)), reads: 0, saves: 0, uploads: [] };
    db.data.achievements[0].title = '<img src=x onerror="window.__xss=1">Тест';
    db.data.achievements[0].link = "javascript:alert(1)";
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE, { waitUntil: "networkidle" });
    assert(!(await page.evaluate(() => window.__xss)), "скрипт выполнился");
    assert(!(await page.$('a[href^="javascript:"]')), "опасная ссылка попала на страницу");
    await page.context().close();
  });

  console.log("\nАдмин-панель");

  await test("демо-режим без Supabase: редактирование сохраняется в браузере", async () => {
    const page = await newPage();
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    assert(await page.isVisible("#appView"), "панель не открылась");
    assert(/Демо-режим/.test(await page.textContent("#banner")), "нет предупреждения о демо-режиме");
    const input = page.getByLabel("Должность", { exact: true });
    await input.fill("Учитель начальных классов (тест)");
    await page.click("#saveBtn");
    await page.waitForFunction(() => /тест/.test(localStorage.getItem("portfolio_demo_content") || ""));
    await page.context().close();
  });

  await test("вход: неверный пароль и пользователь без прав отклоняются", async () => {
    const db = { data: JSON.parse(JSON.stringify(DEFAULT)), reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    assert(await page.isVisible("#loginForm"), "нет формы входа");
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "wrong");
    await page.click("#loginBtn");
    await page.waitForFunction(() => /Неверный/.test(document.querySelector("#loginMsg").textContent));
    await page.fill("#loginEmail", "other@test.ru"); await page.fill("#loginPass", "correct-pass");
    await page.click("#loginBtn");
    await page.waitForFunction(() => /нет прав/.test(document.querySelector("#loginMsg").textContent));
    assert(!(await page.isVisible("#appView")), "посторонний попал в панель");
    await page.context().close();
  });

  await test("полный сценарий: вход, правка, новое достижение с фото, сохранение, результат на сайте", async () => {
    const db = { data: null, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "correct-pass");
    await page.click("#loginBtn");
    await page.waitForSelector("#appView:not([hidden])");
    assert(/База пока пустая/.test(await page.textContent("#banner")), "нет подсказки про пустую базу");

    // Контакты
    await page.click('#sideNav [data-s="contacts"]');
    await page.locator("#editor label", { hasText: "Telegram" }).locator("input").fill("@daria_teacher");
    await page.locator("#editor label", { hasText: "E-mail" }).locator("input").fill("daria@example.ru");

    // Новое достижение
    await page.click('#sideNav [data-s="achievements"]');
    const before = await page.$$eval("#editor .item", (e) => e.length);
    await page.click("#editor .items-toolbar .btn");
    assert((await page.$$eval("#editor .item", (e) => e.length)) === before + 1, "достижение не добавилось");
    const item = page.locator("#editor .item.is-open");
    await item.locator("label", { hasText: "Название" }).locator("input").fill("Грамота за лучший урок");
    await item.locator("label", { hasText: "Кем выдано" }).locator("input").fill("Школа № 1");
    await item.locator("select").selectOption("award");
    await item.locator('input[type="file"]').setInputFiles({ name: "gramota.png", mimeType: "image/png", buffer: PNG });
    await page.waitForFunction(() => /Файл загружен/.test(document.querySelector("#toast").textContent) && document.querySelector("#editor .item.is-open .img__preview img"));
    await page.waitForSelector(".cropper", { timeout: 3000 });
    await page.click('.cropper [data-c="ok"]');
    assert(db.uploads.length === 1, "файл не загружен в хранилище");
    assert(/несохранённые/.test(await page.textContent("#saveState")), "нет пометки о несохранённых изменениях");

    // Перемещение вниз и удаление пункта списка в другом разделе
    await page.click('#sideNav [data-s="stats"]');
    const statsBefore = await page.$$eval("#editor .item", (e) => e.length);
    page.once("dialog", (d) => d.accept());
    await page.locator("#editor .item").last().locator('[data-a="del"]').click();
    assert((await page.$$eval("#editor .item", (e) => e.length)) === statsBefore - 1, "цифра не удалилась");

    await page.click("#saveBtn");
    await page.waitForFunction(() => /сохранены/.test(document.querySelector("#saveState").textContent));
    assert(db.saves === 1, "сохранение не дошло до базы");
    assert(db.data.achievements[0].title === "Грамота за лучший урок", "новое достижение не первым");
    assert(/\/storage\/v1\/object\/public\/media\/uploads\//.test(db.data.achievements[0].image), "ссылка на фото не сохранена");
    assert(db.data.stats.length === statsBefore - 1, "удаление цифры не сохранилось");

    // Проверяем публичный сайт
    const site = await newPage();
    await withMock(site, db);
    await site.goto(BASE, { waitUntil: "networkidle" });
    assert(/Грамота за лучший урок/.test(await site.textContent("#achGrid")), "новое достижение не появилось на сайте");
    assert(await site.$('a[href="https://t.me/daria_teacher"]'), "Telegram не появился на сайте");
    assert((await site.$$(".stat")).length === statsBefore - 1, "цифры на сайте не обновились");
    await site.context().close();

    // Сессия сохраняется после перезагрузки, выход работает
    await page.reload({ waitUntil: "networkidle" });
    assert(await page.isVisible("#appView"), "сессия не сохранилась");
    await page.click("#logoutBtn");
    assert(await page.isVisible("#loginForm"), "выход не сработал");
    assert(page.errors.length === 0, "ошибки: " + page.errors.join("; "));
    await page.context().close();
  });

  await test("экспорт резервной копии content.json", async () => {
    const page = await newPage();
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.click('#sideNav [data-s="_account"]');
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#expBtn")]);
    const data = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    assert(data.hero && data.achievements.length, "файл пустой");
    await page.context().close();
  });

  await test("настоящая библиотека Supabase из проекта загружается и показывает форму входа", async () => {
    const db = { data: null, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db, { mockClient: false });
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    assert(await page.evaluate(() => typeof window.supabase?.createClient === "function"), "библиотека не загрузилась");
    assert(await page.isVisible("#loginForm"), "форма входа не показана");
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "x");
    await page.click("#loginBtn");
    await page.waitForFunction(() => document.querySelector("#loginMsg").textContent.length > 0);
    await page.context().close();
  });

  console.log("\nДокументы, кадрирование и блоки");

  await test("сканы из карты достижений загружаются на сайте", async () => {
    const page = await newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const imgs = await page.$$eval(".ach__media img", (els) => els.map((e) => ({ src: e.getAttribute("src"), ok: e.complete && e.naturalWidth > 0, style: e.getAttribute("style") })));
    assert(imgs.length === 6, "ожидалось 6 сканов, найдено " + imgs.length);
    imgs.forEach((i) => { assert(i.ok, "не загрузилось: " + i.src); assert(/object-position/.test(i.style), "нет кадра у " + i.src); });
    await page.context().close();
  });

  await test("кадр фото: перетаскивание и масштаб сохраняются и применяются на сайте", async () => {
    const db = { data: null, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "correct-pass");
    await page.click("#loginBtn");
    await page.waitForSelector("#appView:not([hidden])");
    // Фото в шапке: ссылка на картинку из проекта
    const url = page.locator('#editor input[type="url"]').first();
    await url.fill("assets/img/docs/festival-sertifikat.jpg"); await url.dispatchEvent("change");
    await page.click('#editor [data-act="crop"]');
    await page.waitForSelector(".cropper__frame img");
    await page.waitForFunction(() => document.querySelector(".cropper__frame img").naturalWidth > 0);
    assert(await page.$eval(".cropper__frame", (e) => getComputedStyle(e).borderTopLeftRadius === "50%"), "рамка для аватарки должна быть круглой");
    await page.$eval('.cropper input[type=range]', (r) => { r.value = "2"; r.dispatchEvent(new Event("input", { bubbles: true })); });
    const box = await page.$eval(".cropper__frame", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 80, { steps: 6 }); await page.mouse.up();
    await page.click('.cropper [data-c="ok"]');
    assert(!(await page.$(".cropper")), "окно кадра не закрылось");
    const prevStyle = await page.getAttribute("#editor .img__preview img", "style");
    assert(/scale\(2\)/.test(prevStyle), "превью не обновилось: " + prevStyle);
    await page.click("#saveBtn");
    await page.waitForFunction(() => /сохранены/.test(document.querySelector("#saveState").textContent));
    const pos = db.data.hero.photo_pos;
    assert(pos && pos.z === 2 && pos.x < 50 && pos.y < 50, "кадр не сохранился: " + JSON.stringify(pos));
    const site = await newPage();
    await withMock(site, db);
    await site.goto(BASE, { waitUntil: "networkidle" });
    const st = await site.getAttribute(".portrait img", "style");
    assert(st.includes(`object-position:${pos.x}% ${pos.y}%`) && st.includes("scale(2)"), "на сайте другой кадр: " + st);
    await site.context().close(); await page.context().close();
  });

  await test("блоки: новый блок, удаление, скрытие, порядок, возврат блока", async () => {
    const db = { data: null, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "correct-pass");
    await page.click("#loginBtn");
    await page.waitForSelector("#appView:not([hidden])");
    await page.click('#sideNav [data-s="layout"]');
    const rows = () => page.$$eval("#editor .item .t", (e) => e.map((x) => x.textContent));
    assert((await rows()).length === 8, "ожидалось 8 стандартных блоков");
    // Новый блок
    await page.click("#editor .items-toolbar .btn");
    const it = page.locator("#editor .item.is-open");
    await it.getByLabel("Заголовок", { exact: true }).fill("Мои проекты");
    await it.locator(".list textarea").first().fill("Проект «Мозаика наших семей».");
    await it.locator("summary").click();
    await it.getByLabel("Пункт в верхнем меню").fill("Проекты");
    let r = await rows();
    assert(r[r.length - 2] === "Мои проекты" && r[r.length - 1] === "Контакты", "новый блок должен встать перед контактами: " + r.join(", "));
    // Поднять новый блок на самый верх
    for (let i = 0; i < 8; i++) await page.locator("#editor .item", { hasText: "Мои проекты" }).locator('.item__head [data-a="up"]').click();
    assert((await rows())[0] === "Мои проекты", "блок не поднялся");
    // Удалить «Образование», скрыть «Цифры»
    page.once("dialog", (d) => d.accept());
    await page.locator("#editor .item", { hasText: "Образование" }).locator('.item__head [data-a="del"]').click();
    assert(!(await rows()).includes("Образование"), "блок не удалился");
    await page.locator("#editor .item .item__head", { hasText: "Цифры" }).click();
    await page.locator("#editor .item.is-open", { hasText: "Цифры" }).getByLabel("Скрыть на сайте").check();
    await page.click("#saveBtn");
    await page.waitForFunction(() => /сохранены/.test(document.querySelector("#saveState").textContent));

    const site = await newPage();
    await withMock(site, db);
    await site.goto(BASE, { waitUntil: "networkidle" });
    const order = await site.$$eval("main > section", (els) => els.filter((e) => getComputedStyle(e).display !== "none").map((e) => e.id));
    assert(order[0] === "top" && /^b-c/.test(order[1]), "новый блок не сразу после шапки: " + order.join(","));
    assert(!order.includes("education"), "удалённый блок виден");
    assert(!order.includes("statsBand"), "скрытый блок виден");
    assert(/Мои проекты/.test(await site.textContent("main")), "текст блока не показан");
    assert(await site.$('#navLinks a[href^="#b-c"]'), "пункт меню нового блока не появился");
    await site.context().close();

    // Вернуть удалённый блок
    await page.selectOption("#editor select.restore", "education");
    assert((await rows()).includes("Образование"), "блок не вернулся");
    await page.context().close();
  });

  await test("обновление: сканы добавляются к уже сохранённому в базе содержимому без потери правок", async () => {
    const old = JSON.parse(JSON.stringify(DEFAULT));
    old.achievements = old.achievements.filter((a) => !/многоборье|скакалку/.test(a.title)).map((a) => ({ ...a, image: "", image_pos: undefined }));
    old.hero.tagline = "Мой собственный текст";
    old.achievements.push({ title: "Моё достижение", category: "award", year: "2026", image: "", hidden: false });
    const db = { data: old, reads: 0, saves: 0, uploads: [] };
    const page = await newPage();
    await withMock(page, db);
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.fill("#loginEmail", "admin@test.ru"); await page.fill("#loginPass", "correct-pass");
    await page.click("#loginBtn");
    await page.waitForSelector(".banner--update");
    assert(/4 скан.+2 новых/.test(await page.textContent(".banner--update")), await page.textContent(".banner--update"));
    await page.click('.banner--update [data-u="add"]');
    await page.click("#saveBtn");
    await page.waitForFunction(() => /сохранены/.test(document.querySelector("#saveState").textContent));
    const a = db.data.achievements;
    assert(a.filter((x) => /assets\/img\/docs\//.test(x.image)).length === 6, "сканов в базе: " + a.filter((x) => x.image).length);
    assert(a.some((x) => x.title === "Моё достижение") && db.data.hero.tagline === "Мой собственный текст", "правки потерялись");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("#appView:not([hidden])");
    assert(!(await page.$(".banner--update")), "баннер не должен появляться повторно");
    const site = await newPage();
    await withMock(site, db);
    await site.goto(BASE, { waitUntil: "networkidle" });
    assert((await site.$$(".ach__media img")).length === 6, "сканы не показаны на сайте");
    await site.context().close(); await page.context().close();
  });

  console.log("\nАдмин-панель на телефоне");
  await test("меню разделов открывается на мобильном", async () => {
    const page = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(BASE + "admin.html", { waitUntil: "networkidle" });
    await page.click("#sideToggle");
    await page.click('#sideNav [data-s="achievements"]');
    assert((await page.textContent("#sectionTitle")) === "Достижения", "раздел не открылся");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 0, "горизонтальная прокрутка " + over);
    await page.context().close();
  });

  await browser.close(); server.close();
  const failed = results.filter((r) => !r[0]);
  console.log(`\nИтого: ${results.length - failed.length} из ${results.length} тестов пройдено`);
  process.exit(failed.length ? 1 : 0);
})();
