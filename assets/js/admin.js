/* Админ-панель: вход через Supabase Auth, редактирование содержимого, загрузка изображений */
(function () {
  const { cfg, esc, isConfigured, loadDefault, CATEGORIES, frameStyle, normPos, BLOCKS, getLayout } = window.Common;
  const $ = (s, r = document) => r.querySelector(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DEMO = !isConfigured();
  const BUCKET = cfg.STORAGE_BUCKET || "media";

  let sb = null;
  let content = null;      // редактируемая копия
  let savedJson = "";      // последнее сохранённое состояние
  let current = "hero";
  const openItems = new Set();

  /* ---------------- Схема редактора ---------------- */
  const T = (key, label, extra = {}) => ({ key, label, type: "text", ...extra });
  const TA = (key, label, extra = {}) => ({ key, label, type: "textarea", ...extra });

  const MORE = (fields) => ({ type: "more", label: "Дополнительно", wide: true, fields });
  const BLOCK_EDIT = { stats: "stats", about: "about", achievements: "achievements", experience: "experience", education: "education", approach: "competencies", gallery: "gallery", contacts: "contacts" };
  const blockTitle = (x) => x.block === "custom" ? (x.title || "Свой блок") : ((BLOCKS.find((b) => b.id === x.block) || {}).title || x.block);

  const SECTIONS = [
    { group: "Страница", id: "hero", title: "Шапка", hint: "Имя, фото и три карточки в самом верху", kind: "multi", parts: [
      { key: "hero", fields: [
        T("name", "Имя"), T("role", "Должность"),
        TA("tagline", "Коротко о себе", { wide: true }),
        { key: "photo", label: "Фото", type: "image", wide: true, crop: { shape: "circle", ratio: 1 } },
        T("status", "Статус", { wide: true, hint: "Зелёная строка под текстом. Пусто: не показывать" }),
        { key: "badges", label: "Плашки под кнопками", type: "list", wide: true },
        MORE([T("eyebrow", "Город"), T("short_name", "Имя в меню"), T("full_name", "Полное ФИО"), T("cta_primary", "Главная кнопка"), T("cta_secondary", "Вторая кнопка")])
      ]},
      { key: "header_cards", title: "Три карточки под шапкой", fields: [
        T("awards_title", "Грамоты: заголовок"), TA("awards_text", "Грамоты: текст"),
        T("teaching_title", "Деятельность: заголовок"), TA("teaching_text", "Деятельность: текст"),
        T("contact_title", "Контакты: заголовок"), TA("contact_text", "Контакты: текст")
      ]}
    ]},
    { group: "Страница", id: "layout", title: "Блоки страницы", hint: "Порядок блоков, скрытие, удаление и новые блоки", kind: "array", addLabel: "Новый блок",
      template: { block: "custom", key: "", title: "Новый блок", subtitle: "", paragraphs: [""], points: [], image: "", image_side: "right", bg: "cream", link: "", link_label: "", menu: "", hidden: false },
      onAdd: (x) => { x.key = "c" + Math.random().toString(36).slice(2, 8); },
      itemTitle: blockTitle,
      itemSub: (x) => [x.block === "custom" ? "свой блок" : "", x.menu ? "в меню: " + x.menu : ""].filter(Boolean).join(" · "),
      deleteText: (x) => x.block === "custom" ? "Удалить блок «" + blockTitle(x) + "»?" : "Убрать блок «" + blockTitle(x) + "» со страницы? Его содержимое сохранится, блок можно вернуть.",
      fields: (x) => x.block === "custom" ? [
        T("title", "Заголовок", { wide: true }),
        { key: "paragraphs", label: "Текст", type: "list", multiline: true, wide: true, addText: "+ Абзац" },
        { key: "points", label: "Пункты списка", type: "list", wide: true },
        { key: "image", label: "Фото", type: "image", wide: true, crop: { shape: "rect", ratio: 4 / 3 } },
        { key: "hidden", label: "Скрыть на сайте", type: "checkbox" },
        MORE([
          T("subtitle", "Подзаголовок", { wide: true }),
          { key: "bg", label: "Фон", type: "select", options: [["cream", "Кремовый"], ["sky", "Голубой"], ["pink", "Розовый"], ["sand", "Бежевый"], ["ink", "Тёмно-синий"]] },
          { key: "image_side", label: "Фото", type: "select", options: [["right", "Справа"], ["left", "Слева"]] },
          T("link", "Кнопка: ссылка", { placeholder: "https://…" }), T("link_label", "Кнопка: текст"),
          T("menu", "Пункт в верхнем меню", { wide: true, hint: "Пусто: не показывать в меню" })
        ])
      ] : [
        { key: "hidden", label: "Скрыть на сайте", type: "checkbox" },
        T("menu", "Пункт в верхнем меню", { hint: "Пусто: не показывать в меню" }),
        { type: "goto", label: "Изменить содержимое", to: (o) => BLOCK_EDIT[o.block], wide: true }
      ] },

    { group: "Содержимое", id: "achievements", title: "Достижения", kind: "array", addLabel: "Добавить достижение", addTop: true,
      template: { title: "Новое достижение", category: "award", year: String(new Date().getFullYear()), organization: "", description: "", image: "", link: "", link_label: "", featured: false, hidden: false },
      itemTitle: (x) => x.title, itemSub: (x) => [CATEGORIES[x.category], x.year].filter(Boolean).join(" · "), thumb: "image",
      fields: [
        T("title", "Название", { wide: true }),
        { key: "category", label: "Категория", type: "select", options: Object.entries(CATEGORIES) },
        T("year", "Год"),
        T("organization", "Кем выдано", { wide: true }),
        TA("description", "Описание", { wide: true }),
        { key: "image", label: "Скан или фото", type: "image", wide: true, crop: { shape: "rect", ratio: 16 / 10 } },
        { key: "featured", label: "Главное (показывать первым)", type: "checkbox" },
        { key: "hidden", label: "Скрыть на сайте", type: "checkbox" },
        MORE([T("link", "Ссылка", { placeholder: "https://…" }), T("link_label", "Текст ссылки", { placeholder: "Подробнее" })])
      ]},
    { group: "Содержимое", id: "stats", title: "Цифры", kind: "array", addLabel: "Добавить цифру",
      template: { value: "", label: "" }, itemTitle: (x) => x.value, itemSub: (x) => x.label,
      fields: [T("value", "Число", { placeholder: "40+" }), T("label", "Подпись")] },
    { group: "Содержимое", id: "about", title: "Обо мне", kind: "object", fields: [
      T("title", "Заголовок", { wide: true }),
      { key: "paragraphs", label: "Текст", type: "list", multiline: true, wide: true, addText: "+ Абзац" },
      TA("quote", "Цитата", { wide: true }),
      T("why_title", "Заголовок справа", { wide: true }),
      { key: "why", label: "Пункты справа", type: "list", wide: true }
    ]},
    { group: "Содержимое", id: "experience", title: "Опыт работы", kind: "array", addLabel: "Добавить место работы", addTop: true,
      template: { title: "", place: "", period: "", bullets: [] }, itemTitle: (x) => x.title, itemSub: (x) => [x.place, x.period].filter(Boolean).join(" · "),
      fields: [T("title", "Должность"), T("period", "Период"), T("place", "Место", { wide: true }),
        { key: "bullets", label: "Что делала", type: "list", multiline: true, wide: true }] },
    { group: "Содержимое", id: "education", title: "Образование", kind: "array", addLabel: "Добавить",
      template: { period: "", institution: "", specialty: "", note: "" }, itemTitle: (x) => x.institution, itemSub: (x) => x.period,
      fields: [T("institution", "Учебное заведение", { wide: true }), T("period", "Годы"), T("specialty", "Специальность"), TA("note", "Примечание", { wide: true })] },
    { group: "Содержимое", id: "competencies", title: "Подход: компетенции", kind: "array", addLabel: "Добавить карточку",
      template: { title: "", icon: "spark", items: [] }, itemTitle: (x) => x.title, itemSub: (x) => (x.items || []).length + " пунктов",
      fields: [T("title", "Название"),
        { key: "icon", label: "Иконка", type: "select", options: [["book", "Книга"], ["heart", "Сердце"], ["spark", "Звёздочка"], ["users", "Дети"], ["school", "Шапочка"], ["award", "Награда"], ["flower", "Цветок"]] },
        { key: "items", label: "Пункты", type: "list", wide: true }] },
    { group: "Содержимое", id: "qualities", title: "Подход: качества", kind: "array", addLabel: "Добавить качество",
      template: { title: "", text: "" }, itemTitle: (x) => x.title, itemSub: (x) => x.text,
      fields: [T("title", "Качество", { wide: true }), TA("text", "Пояснение", { wide: true })] },
    { group: "Содержимое", id: "gallery", title: "Фотогалерея", hint: "Публикуйте фото детей только с согласия родителей", kind: "array", addLabel: "Добавить фото", addTop: true,
      template: { image: "", caption: "" }, itemTitle: (x) => x.caption || "Фото без подписи", thumb: "image",
      fields: [{ key: "image", label: "Фото", type: "image", wide: true }, T("caption", "Подпись", { wide: true })] },
    { group: "Содержимое", id: "contacts", title: "Контакты", hint: "Пустые поля на сайте не показываются", kind: "object", fields: [
      T("telegram", "Telegram", { placeholder: "@username" }), T("email", "E-mail", { placeholder: "name@mail.ru" }),
      T("vk", "ВКонтакте", { placeholder: "vk.com/username" }), T("max", "MAX"),
      T("city", "Город"), TA("note", "Текст в блоке", { wide: true })
    ]},
    { group: "Содержимое", id: "extra", title: "Готовность к работе", kind: "array", addLabel: "Добавить строку",
      template: { label: "", value: "" }, itemTitle: (x) => x.label, itemSub: (x) => x.value,
      fields: [T("label", "Название"), T("value", "Значение")] },

    { group: "Настройки", id: "seo", title: "Название в поиске", kind: "object", fields: [
      T("title", "Заголовок вкладки", { wide: true }), TA("description", "Описание для поиска и мессенджеров", { wide: true })
    ]},
    { group: "Настройки", id: "_account", title: "Копия и пароль", kind: "special" }
  ];

  /* ---------------- Утилиты ---------------- */
  function toast(msg, err) {
    const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("is-on"), err ? 4500 : 2400);
  }
  const isDirty = () => JSON.stringify(content) !== savedJson;
  function markDirty() {
    const d = isDirty();
    $("#saveBtn").disabled = !d;
    const s = $("#saveState");
    s.textContent = d ? "Есть несохранённые изменения" : "Все изменения сохранены";
    s.classList.toggle("dirty", d);
  }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function ensure(obj, key, def) { if (obj[key] == null) obj[key] = def; return obj[key]; }

  /* ---------------- Загрузка изображений ---------------- */
  function resizeImage(file, max = 1800, quality = 0.86) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        if (k === 1 && file.size < 1.5e6) { URL.revokeObjectURL(url); return resolve(file); }
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  async function uploadFile(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error("Файл больше 10 МБ");
    const f = await resizeImage(file);
    if (DEMO) {
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    }
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `uploads/${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { cacheControl: "31536000", upsert: false, contentType: f.type });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /* ---------------- Редактор кадра ---------------- */
  function openCropper(src, crop, startPos, onApply) {
    let pos = normPos(startPos);
    const circle = crop.shape === "circle";
    const ov = el(`<div class="cropper" role="dialog" aria-modal="true" aria-label="Настройка кадра">
      <div class="cropper__card">
        <h2>Настройка кадра</h2>
        <p class="muted">Перетаскивайте фото мышкой или пальцем, приближайте ползунком или колёсиком мыши. Так фото будет выглядеть на сайте.</p>
        <div class="cropper__stage">
          <div class="cropper__frame ${circle ? "cropper__frame--circle" : ""}" tabindex="0" style="aspect-ratio:${crop.ratio}">
            <img alt="" draggable="false">
          </div>
        </div>
        <label class="cropper__zoom">Масштаб
          <span class="cropper__zoomrow"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01"><span aria-hidden="true">+</span></span>
        </label>
        <div class="cropper__actions">
          <button type="button" class="btn btn--ghost" data-c="reset">Сбросить</button>
          <span style="flex:1"></span>
          <button type="button" class="btn btn--ghost" data-c="cancel">Отмена</button>
          <button type="button" class="btn btn--gold" data-c="ok">Применить</button>
        </div>
      </div></div>`);
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    const frame = ov.querySelector(".cropper__frame"), img = frame.querySelector("img"), zoom = ov.querySelector('input[type=range]');
    const apply = () => { img.setAttribute("style", frameStyle(pos)); zoom.value = pos.z; };
    // Насколько изображение выходит за рамку (в пикселях) по каждой оси
    const overflow = () => {
      const W = frame.clientWidth, H = frame.clientHeight, w = img.naturalWidth || 1, h = img.naturalHeight || 1;
      const k = Math.max(W / w, H / h);
      return { x: pos.z * w * k - W, y: pos.z * h * k - H };
    };
    const move = (dx, dy) => {
      const o = overflow();
      if (o.x > 0.5) pos.x = Math.min(100, Math.max(0, pos.x - (dx / o.x) * 100));
      if (o.y > 0.5) pos.y = Math.min(100, Math.max(0, pos.y - (dy / o.y) * 100));
      apply();
    };
    const setZoom = (z) => { pos.z = Math.min(4, Math.max(1, Math.round(z * 100) / 100)); apply(); };
    img.src = src; apply();

    let drag = null;
    frame.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; frame.setPointerCapture(e.pointerId); frame.classList.add("is-drag"); e.preventDefault(); });
    frame.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      move(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = () => { drag = null; frame.classList.remove("is-drag"); };
    frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end);
    frame.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(pos.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); }, { passive: false });
    frame.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 20 : 5;
      const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
      if (e.key === "+" || e.key === "=") setZoom(pos.z + 0.1);
      if (e.key === "-") setZoom(pos.z - 0.1);
    });
    zoom.addEventListener("input", () => setZoom(parseFloat(zoom.value)));

    const close = () => { ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", onEsc); };
    const onEsc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onEsc);
    ov.addEventListener("click", (e) => {
      const c = e.target.closest("[data-c]")?.dataset.c;
      if (e.target === ov || c === "cancel") close();
      if (c === "reset") { pos = normPos(null); apply(); }
      if (c === "ok") { close(); onApply({ x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, z: pos.z }); }
    });
    frame.focus();
  }

  /* ---------------- Поля ---------------- */
  function fieldNode(f, obj, onChange) {
    const wide = f.wide ? " field--wide" : "";
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : "";
    const id = "f" + Math.random().toString(36).slice(2, 9);

    if (f.type === "text" || f.type === "textarea") {
      const tag = f.type === "text"
        ? `<input type="text" id="${id}" placeholder="${esc(f.placeholder || "")}">`
        : `<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}"></textarea>`;
      const n = el(`<label class="field${wide}">${esc(f.label)}${tag}${hint}</label>`);
      const inp = n.querySelector("input,textarea"); inp.value = obj[f.key] == null ? "" : obj[f.key];
      inp.addEventListener("input", () => { obj[f.key] = inp.value; onChange(f.key); });
      return n;
    }
    if (f.type === "select") {
      const n = el(`<label class="field${wide}">${esc(f.label)}<select id="${id}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>${hint}</label>`);
      const s = n.querySelector("select"); s.value = obj[f.key] || f.options[0][0];
      s.addEventListener("change", () => { obj[f.key] = s.value; onChange(f.key); });
      return n;
    }
    if (f.type === "checkbox") {
      const n = el(`<label class="check field${wide}"><input type="checkbox" id="${id}">${esc(f.label)}</label>`);
      const c = n.querySelector("input"); c.checked = !!obj[f.key];
      c.addEventListener("change", () => { obj[f.key] = c.checked; onChange(f.key); });
      return n;
    }
    if (f.type === "image") {
      const posKey = f.key + "_pos";
      const crop = f.crop || null;
      const shapeCls = crop ? (crop.shape === "circle" ? " img__preview--circle" : " img__preview--rect") : "";
      const n = el(`<div class="field${wide}"><label>${esc(f.label)}</label>${hint}
        <div class="img"><div class="img__preview${shapeCls}"></div>
          <div class="img__ctrls">
            <div class="img__btns">
              <label class="btn btn--ghost btn--small" style="display:inline-flex">Загрузить файл<input type="file" accept="image/*,application/pdf" hidden></label>
              ${crop ? '<button type="button" class="btn btn--primary btn--small" data-act="crop">Настроить кадр</button>' : ""}
              <button type="button" class="btn btn--danger btn--small" data-act="clear">Убрать</button>
            </div>
            <input type="url" placeholder="или вставьте ссылку на изображение">
            <span class="hint img__status"></span>
          </div></div></div>`);
      const prev = n.querySelector(".img__preview"), url = n.querySelector('input[type=url]'), file = n.querySelector('input[type=file]'), st = n.querySelector(".img__status");
      const cropBtn = n.querySelector('[data-act=crop]');
      const isPdf = (v) => /\.pdf($|\?)/i.test(v) || v.startsWith("data:application/pdf");
      const draw = () => {
        const v = obj[f.key] || "";
        url.value = v.startsWith("data:") ? "" : v;
        const style = crop ? frameStyle(obj[posKey]) : "";
        prev.innerHTML = !v ? "Нет изображения" : isPdf(v) ? "PDF-файл" : `<img src="${esc(v)}" alt="" style="${style}">`;
        if (cropBtn) cropBtn.hidden = !v || isPdf(v);
      };
      draw();
      const resetPos = () => { delete obj[posKey]; };
      const openCrop = () => {
        const v = obj[f.key] || "";
        if (!crop || !v || isPdf(v)) return;
        openCropper(v, crop, obj[posKey], (pos) => { obj[posKey] = pos; draw(); onChange(posKey); toast("Кадр сохранён. Не забудьте нажать «Сохранить»"); });
      };
      if (cropBtn) cropBtn.addEventListener("click", openCrop);
      if (crop) { prev.style.cursor = "pointer"; prev.title = "Настроить кадр"; prev.addEventListener("click", openCrop); }
      url.addEventListener("change", () => { obj[f.key] = url.value.trim(); resetPos(); draw(); onChange(f.key); });
      n.querySelector('[data-act=clear]').addEventListener("click", () => { obj[f.key] = ""; resetPos(); draw(); onChange(f.key); });
      file.addEventListener("change", async () => {
        const fl = file.files[0]; if (!fl) return;
        st.textContent = "Загрузка…";
        try {
          obj[f.key] = await uploadFile(fl); resetPos(); st.textContent = ""; draw(); onChange(f.key);
          toast("Файл загружен. Настройте кадр и нажмите «Сохранить»");
          if (crop) setTimeout(openCrop, 50);
        }
        catch (e) { console.error(e); st.textContent = ""; toast("Не удалось загрузить: " + (e.message || e), true); }
        file.value = "";
      });
      return n;
    }
    if (f.type === "more") {
      const n = el(`<details class="more field--wide"><summary>${esc(f.label)}</summary></details>`);
      n.appendChild(fieldsGrid(f.fields, obj, onChange));
      return n;
    }
    if (f.type === "goto") {
      const to = f.to(obj);
      const n = el(`<div class="field${wide}"><button type="button" class="btn btn--ghost btn--small">${esc(f.label)} →</button></div>`);
      n.querySelector("button").addEventListener("click", () => { current = to; openItems.clear(); renderNav(); renderSection(); window.scrollTo(0, 0); });
      return n;
    }
    if (f.type === "list") {
      const list = ensure(obj, f.key, []);
      const n = el(`<div class="field${wide}"><label>${esc(f.label)}</label>${hint}<div class="list"></div><button type="button" class="btn btn--ghost btn--small addbtn">${esc(f.addText || "+ Пункт")}</button></div>`);
      const box = n.querySelector(".list");
      const draw = () => {
        box.innerHTML = "";
        list.forEach((v, i) => {
          const row = el(`<div class="list__row">${f.multiline ? "<textarea rows=\"2\"></textarea>" : '<input type="text">'}
            <button type="button" class="iconbtn" data-a="up" title="Выше" aria-label="Выше">↑</button>
            <button type="button" class="iconbtn" data-a="down" title="Ниже" aria-label="Ниже">↓</button>
            <button type="button" class="iconbtn iconbtn--danger" data-a="del" title="Удалить" aria-label="Удалить">✕</button></div>`);
          const inp = row.querySelector("input,textarea"); inp.value = v;
          inp.addEventListener("input", () => { list[i] = inp.value; onChange(f.key); });
          row.addEventListener("click", (e) => {
            const a = e.target.dataset.a; if (!a) return;
            if (a === "del") list.splice(i, 1);
            if (a === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
            if (a === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
            draw(); onChange(f.key);
          });
          box.appendChild(row);
        });
      };
      draw();
      n.querySelector(".addbtn").addEventListener("click", () => { list.push(""); draw(); onChange(f.key); const ins = box.querySelectorAll("input,textarea"); ins[ins.length - 1]?.focus(); });
      return n;
    }
    return el("<div></div>");
  }

  function fieldsGrid(fields, obj, onChange) {
    const g = el(`<div class="grid2"></div>`);
    fields.forEach((f) => g.appendChild(fieldNode(f, obj, onChange)));
    return g;
  }

  /* ---------------- Разделы ---------------- */
  function renderNav() {
    let g = "";
    $("#sideNav").innerHTML = SECTIONS.map((s) => {
      const head = s.group !== g ? `<div class="side__group">${esc((g = s.group))}</div>` : "";
      const c = s.kind === "array" && Array.isArray(content[s.id]) ? `<span class="count">${content[s.id].length}</span>` : "";
      return `${head}<button type="button" data-s="${s.id}" class="${s.id === current ? "is-active" : ""}">${esc(s.title)}${c}</button>`;
    }).join("");
  }

  function renderSection() {
    const s = SECTIONS.find((x) => x.id === current) || SECTIONS[0];
    $("#sectionTitle").textContent = s.title;
    $("#sectionHint").textContent = s.hint || "";
    const ed = $("#editor"); ed.innerHTML = "";
    const changed = () => { markDirty(); };

    if (s.kind === "object") {
      const obj = ensure(content, s.id, {});
      const p = el(`<div class="panel"></div>`); p.appendChild(fieldsGrid(s.fields, obj, changed)); ed.appendChild(p);
    } else if (s.kind === "multi") {
      s.parts.forEach((part) => {
        const obj = ensure(content, part.key, {});
        const p = el(`<div class="panel"></div>`);
        if (part.title) p.appendChild(el(`<h3 class="panel__title">${esc(part.title)}</h3>`));
        p.appendChild(fieldsGrid(part.fields, obj, changed)); ed.appendChild(p);
      });
    } else if (s.kind === "array") {
      renderArray(s, ed);
    } else if (s.id === "_account") {
      renderAccount(ed);
    }
  }

  function renderArray(s, ed) {
    const list = ensure(content, s.id, []);
    const bar = el(`<div class="items-toolbar"><button type="button" class="btn btn--primary">+ ${esc(s.addLabel || "Добавить")}</button><span class="hint">Нажмите на строку, чтобы изменить</span></div>`);
    bar.querySelector("button").addEventListener("click", () => {
      const item = clone(s.template);
      if (s.onAdd) s.onAdd(item);
      if (s.addTop) list.unshift(item);
      else if (s.id === "layout") { const ci = list.findIndex((x) => x.block === "contacts"); list.splice(ci < 0 ? list.length : ci, 0, item); }
      else list.push(item);
      openItems.clear(); openItems.add(item);
      markDirty(); renderNav(); renderSection();
      $("#editor .item.is-open input, #editor .item.is-open textarea")?.focus();
    });
    if (s.id === "layout") {
      const missing = BLOCKS.filter((b) => !list.some((x) => x.block === b.id));
      if (missing.length) {
        const sel = el(`<select class="restore" aria-label="Вернуть блок"><option value="">Вернуть убранный блок…</option>${missing.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("")}</select>`);
        sel.addEventListener("change", () => {
          const b = BLOCKS.find((x) => x.id === sel.value); if (!b) return;
          const order = BLOCKS.map((x) => x.id);
          let at = list.findIndex((x) => x.block !== "custom" && order.indexOf(x.block) > order.indexOf(b.id));
          list.splice(at < 0 ? list.length : at, 0, { block: b.id, hidden: false, menu: b.menu });
          markDirty(); renderNav(); renderSection(); toast("Блок «" + b.title + "» возвращён");
        });
        bar.insertBefore(sel, bar.querySelector(".hint"));
      }
    }
    ed.appendChild(bar);
    const box = el(`<div class="items"></div>`); ed.appendChild(box);
    if (!list.length) box.appendChild(el(`<div class="panel"><p class="muted">Пока пусто. Нажмите «${esc(s.addLabel || "Добавить")}».</p></div>`));

    list.forEach((item, i) => {
      const open = openItems.has(item);
      const thumbUrl = s.thumb && item[s.thumb] && !/pdf/i.test(item[s.thumb]) ? item[s.thumb] : "";
      const node = el(`<div class="item ${open ? "is-open" : ""} ${item.hidden ? "is-hidden-item" : ""}">
        <div class="item__head" role="button" tabindex="0" aria-expanded="${open}">
          ${s.thumb ? (thumbUrl ? `<img class="item__thumb" src="${esc(thumbUrl)}" alt="">` : `<span class="item__thumb"></span>`) : ""}
          <span class="item__title"><span class="t"></span><small class="st"></small></span>
          ${item.featured ? '<span class="item__tag item__tag--gold">главное</span>' : ""}
          ${item.hidden ? '<span class="item__tag">скрыто</span>' : ""}
          <button type="button" class="iconbtn" data-a="up" title="Выше" aria-label="Выше">↑</button>
          <button type="button" class="iconbtn" data-a="down" title="Ниже" aria-label="Ниже">↓</button>
          <button type="button" class="iconbtn iconbtn--danger" data-a="del" title="Удалить" aria-label="Удалить">✕</button>
        </div></div>`);
      const setHead = () => {
        node.querySelector(".t").textContent = (s.itemTitle && s.itemTitle(item)) || "Без названия";
        node.querySelector(".st").textContent = (s.itemSub && s.itemSub(item)) || "";
      };
      setHead();
      const head = node.querySelector(".item__head");
      const toggle = () => { if (openItems.has(item)) openItems.delete(item); else openItems.add(item); renderSection(); };
      head.addEventListener("click", (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a;
        if (!a) return toggle();
        e.stopPropagation();
        if (a === "del") {
          if (!confirm(s.deleteText ? s.deleteText(item) : "Удалить «" + ((s.itemTitle && s.itemTitle(item)) || "элемент") + "»?")) return;
          list.splice(i, 1);
        }
        if (a === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        if (a === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        markDirty(); renderNav(); renderSection();
      });
      head.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === head) { e.preventDefault(); toggle(); } });
      if (open) {
        const body = el(`<div class="item__body"></div>`);
        body.appendChild(fieldsGrid(typeof s.fields === "function" ? s.fields(item) : s.fields, item, (k) => {
          setHead(); markDirty();
          if (k === "featured" || k === "hidden" || (s.thumb && (k === s.thumb || k === s.thumb + "_pos"))) renderSection();
        }));
        node.appendChild(body);
      }
      box.appendChild(node);
    });
  }

  function renderAccount(ed) {
    const p = el(`<div class="panel">
      <h3>Резервная копия</h3>
      <p class="muted">Скачайте файл со всем содержимым сайта, чтобы ничего не потерять. Его же можно загрузить обратно.</p>
      <div class="img__btns">
        <button type="button" class="btn btn--ghost" id="expBtn">Скачать content.json</button>
        <label class="btn btn--ghost">Загрузить из файла<input type="file" id="impFile" accept="application/json,.json" hidden></label>
        <button type="button" class="btn btn--danger" id="resetBtn">Вернуть исходное содержимое</button>
      </div>
      <p class="hint">Совет: скачанный content.json можно положить в папку <b>content/</b> проекта под именем <b>default.json</b>: это резервная копия, которую сайт покажет, если база недоступна.</p>
    </div>`);
    ed.appendChild(p);
    $("#expBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "content.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("#impFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (typeof data !== "object" || !data.hero) throw new Error("Это не файл содержимого сайта");
        content = data; if (!Array.isArray(content.layout)) content.layout = clone(getLayout(content)); markDirty(); renderNav(); renderSection(); toast("Файл загружен. Нажмите «Сохранить»");
      } catch (err) { toast("Ошибка: " + err.message, true); }
      e.target.value = "";
    });
    $("#resetBtn").addEventListener("click", async () => {
      if (!confirm("Заменить всё содержимое исходным вариантом? Ваши правки пропадут после сохранения.")) return;
      content = await loadDefault(); content.layout = clone(getLayout(content)); markDirty(); renderNav(); renderSection(); toast("Исходное содержимое загружено. Нажмите «Сохранить», чтобы применить");
    });

    if (!DEMO) {
      const pw = el(`<form class="panel" id="pwForm">
        <h3>Смена пароля</h3>
        <div class="grid2">
          <label>Новый пароль<input type="password" id="pw1" minlength="8" required autocomplete="new-password"></label>
          <label>Повторите пароль<input type="password" id="pw2" minlength="8" required autocomplete="new-password"></label>
        </div>
        <button class="btn btn--primary" type="submit" style="justify-self:start">Сменить пароль</button>
      </form>`);
      ed.appendChild(pw);
      pw.addEventListener("submit", async (e) => {
        e.preventDefault();
        if ($("#pw1").value !== $("#pw2").value) return toast("Пароли не совпадают", true);
        const { error } = await sb.auth.updateUser({ password: $("#pw1").value });
        if (error) toast("Ошибка: " + error.message, true); else { toast("Пароль изменён"); pw.reset(); }
      });
    }
  }

  /* ---------------- Сохранение ---------------- */
  async function save() {
    const btn = $("#saveBtn"); btn.disabled = true; btn.textContent = "Сохранение…";
    try {
      if (DEMO) {
        localStorage.setItem("portfolio_demo_content", JSON.stringify(content));
      } else {
        const { error } = await sb.from("site_content").upsert({ id: 1, data: content });
        if (error) throw error;
      }
      savedJson = JSON.stringify(content);
      toast(DEMO ? "Сохранено в браузере (демо-режим)" : "Сохранено! Изменения уже на сайте");
    } catch (e) {
      console.error(e);
      toast("Не удалось сохранить: " + (e.message || e), true);
    } finally {
      btn.textContent = "Сохранить"; markDirty();
    }
  }

  /* ---------------- Запуск ---------------- */
  async function loadForEdit() {
    if (DEMO) {
      let d = null;
      try { d = JSON.parse(localStorage.getItem("portfolio_demo_content") || "null"); } catch (e) {}
      return { data: d || (await loadDefault()), fresh: false };
    }
    const { data, error } = await sb.from("site_content").select("data").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data && data.data && Object.keys(data.data).length) return { data: data.data, fresh: false };
    return { data: await loadDefault(), fresh: true };
  }

  async function showApp(user) {
    $("#authView").hidden = true;
    $("#appView").hidden = false;
    $("#userEmail").textContent = DEMO ? "демо-режим" : (user && user.email) || "";
    let fresh = false;
    try { const r = await loadForEdit(); content = r.data; fresh = r.fresh; }
    catch (e) { toast("Ошибка загрузки: " + e.message, true); content = await loadDefault(); }
    if (!Array.isArray(content.layout)) content.layout = clone(getLayout(content));
    savedJson = fresh ? "" : JSON.stringify(content);
    const banner = $("#banner");
    if (DEMO) {
      banner.hidden = false; banner.className = "banner warn";
      banner.innerHTML = "<b>Демо-режим:</b> база не подключена, правки сохраняются только в этом браузере.";
    } else if (fresh) {
      banner.hidden = false; banner.className = "banner";
      banner.innerHTML = "База пока пустая, загружено исходное содержимое. Нажмите <b>«Сохранить»</b>, чтобы записать его в базу.";
    } else banner.hidden = true;
    if (!fresh) await offerUpdates(banner);
    renderNav(); renderSection(); markDirty();
  }

  // Новые материалы из обновления сайта (сканы и достижения из content/default.json),
  // которых ещё нет в сохранённом содержимом. Добавляются по кнопке, ничего не удаляя.
  async function offerUpdates(banner) {
    const prevBox = document.querySelector(".banner--update");
    if (prevBox) prevBox.remove();
    let def;
    try { def = await loadDefault(); } catch (e) { return; }
    const norm = (t) => String(t || "").trim().toLowerCase();
    const mine = Array.isArray(content.achievements) ? content.achievements : (content.achievements = []);
    const dismissed = new Set(content._dismissed_updates || []);
    const imgs = [], adds = [];
    (def.achievements || []).forEach((d) => {
      if (dismissed.has(norm(d.title))) return;
      const m = mine.find((x) => norm(x.title) === norm(d.title));
      if (m) { if (!m.image && d.image) imgs.push([m, d]); }
      else if (d.image) adds.push(d);
    });
    if (!imgs.length && !adds.length) return;
    const parts = [];
    if (imgs.length) parts.push(imgs.length + " " + (imgs.length === 1 ? "скан к достижению" : "сканов к достижениям"));
    if (adds.length) parts.push(adds.length + " " + (adds.length === 1 ? "новое достижение" : "новых достижения"));
    const box = el(`<div class="banner banner--update"><span><b>Есть новые материалы:</b> ${parts.join(" и ")}. Ваши правки не изменятся.</span>
      <span class="banner__btns"><button type="button" class="btn btn--primary btn--small" data-u="add">Добавить</button><button type="button" class="btn btn--ghost btn--small" data-u="skip">Не нужно</button></span></div>`);
    banner.after(box);
    box.addEventListener("click", (e) => {
      const u = e.target.closest("[data-u]")?.dataset.u; if (!u) return;
      if (u === "add") {
        imgs.forEach(([m, d]) => { m.image = d.image; if (d.image_pos) m.image_pos = clone(d.image_pos); });
        adds.forEach((d) => mine.push(clone(d)));
        toast("Добавлено. Нажмите «Сохранить», чтобы показать на сайте");
      } else {
        content._dismissed_updates = Array.from(new Set([...dismissed, ...imgs.map(([, d]) => norm(d.title)), ...adds.map((d) => norm(d.title))]));
      }
      box.remove(); markDirty(); renderNav(); renderSection();
    });
  }

  function showLogin() { $("#appView").hidden = true; $("#authView").hidden = false; $("#loginForm").hidden = false; $("#recoveryForm").hidden = true; }

  async function checkAdmin() {
    const { data, error } = await sb.rpc("is_admin");
    if (error) { console.error(error); return false; }
    return data === true;
  }

  function bindUI() {
    $("#sideNav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-s]"); if (!b) return;
      current = b.dataset.s; openItems.clear(); renderNav(); renderSection();
      $("#side").classList.remove("is-open"); window.scrollTo(0, 0);
    });
    $("#saveBtn").addEventListener("click", save);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("#appView").hidden) { e.preventDefault(); if (isDirty()) save(); }
    });
    window.addEventListener("beforeunload", (e) => { if (content && isDirty()) { e.preventDefault(); e.returnValue = ""; } });
    $("#sideToggle").addEventListener("click", (e) => { e.stopPropagation(); $("#side").classList.toggle("is-open"); });
    document.addEventListener("click", (e) => { const s = $("#side"); if (s.classList.contains("is-open") && !s.contains(e.target)) s.classList.remove("is-open"); });

    $("#logoutBtn").addEventListener("click", async () => {
      if (isDirty() && !confirm("Есть несохранённые изменения. Всё равно выйти?")) return;
      content = null;
      if (DEMO) { location.reload(); return; }
      await sb.auth.signOut(); showLogin();
    });

    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#loginMsg"); msg.className = "auth__msg"; msg.textContent = "";
      const btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "Вход…";
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPass").value });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Неверный e-mail или пароль" : error.message);
        if (!(await checkAdmin())) { await sb.auth.signOut(); throw new Error("У этого пользователя нет прав администратора"); }
        $("#loginPass").value = "";
        await showApp(data.user);
      } catch (err) { msg.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = "Войти"; }
    });

    $("#forgotBtn").addEventListener("click", async () => {
      const email = $("#loginEmail").value.trim(); const msg = $("#loginMsg");
      if (!email) { msg.className = "auth__msg"; msg.textContent = "Введите e-mail в поле выше"; return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
      msg.className = "auth__msg" + (error ? "" : " ok");
      msg.textContent = error ? error.message : "Если такой пользователь есть, на почту придёт письмо со ссылкой";
    });

    $("#recoveryForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const msg = $("#recoveryMsg");
      if ($("#newPass1").value !== $("#newPass2").value) { msg.textContent = "Пароли не совпадают"; return; }
      const { error } = await sb.auth.updateUser({ password: $("#newPass1").value });
      if (error) { msg.textContent = error.message; return; }
      history.replaceState(null, "", location.pathname);
      const { data } = await sb.auth.getUser();
      if (await checkAdmin()) showApp(data.user); else showLogin();
    });
  }

  async function init() {
    bindUI();
    if (DEMO) { await showApp(null); return; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    let recovering = false;
    sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        $("#appView").hidden = true; $("#authView").hidden = false; $("#loginForm").hidden = true; $("#recoveryForm").hidden = false;
      }
    });
    const { data } = await sb.auth.getSession();
    if (recovering || /type=recovery/.test(location.hash)) return;
    if (data.session && (await checkAdmin())) await showApp(data.session.user);
    else showLogin();
  }

  init().catch((e) => { console.error(e); toast("Ошибка запуска: " + e.message, true); showLogin(); });
})();
