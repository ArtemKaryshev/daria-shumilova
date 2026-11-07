/* Рендер публичного сайта из содержимого (Supabase или content/default.json) */
(function () {
  const { esc, safeUrl, icon, CATEGORIES, tgLink, vkLink, loadContent, frameStyle, BLOCKS, getLayout } = window.Common;
  const $ = (s) => document.querySelector(s);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  const has = (v) => String(v == null ? "" : v).trim() !== "";

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  function contactItems(c) {
    const items = [];
    if (has(c.telegram)) items.push({ key: "telegram", label: "Telegram", value: "@" + String(c.telegram).replace(/^@|^https?:\/\/t\.me\//g, ""), href: tgLink(c.telegram), icon: "telegram" });
    if (has(c.max)) items.push({ key: "max", label: "MAX", value: c.max, href: /^https?:/.test(c.max) ? c.max : "", icon: "chat" });
    if (has(c.email)) items.push({ key: "email", label: "E-mail", value: c.email, href: "mailto:" + c.email, icon: "mail", copy: c.email });
    if (has(c.vk)) items.push({ key: "vk", label: "ВКонтакте", value: String(c.vk).replace(/^https?:\/\/(www\.)?vk\.com\//, "vk.com/"), href: vkLink(c.vk), icon: "vk" });
    return items;
  }

  function renderHero(d) {
    const h = d.hero || {};
    $("#heroEyebrow").textContent = h.eyebrow || "";
    const parts = String(h.name || "").trim().split(/\s+/);
    $("#heroName").innerHTML = parts.length > 1
      ? esc(parts.slice(0, -1).join(" ")) + " <span>" + esc(parts[parts.length - 1]) + "</span>"
      : esc(h.name || "");
    $("#heroRole").textContent = h.role || "";
    $("#heroTagline").textContent = h.tagline || "";
    const st = $("#heroStatus");
    st.hidden = !has(h.status); st.lastElementChild.textContent = h.status || "";
    $("#ctaPrimary").innerHTML = esc(h.cta_primary || "Связаться") + icon("arrow");
    $("#ctaSecondary").textContent = h.cta_secondary || "Достижения";

    const initials = ((parts[0] || "")[0] || "") + ((parts[parts.length - 1] || "")[0] || "");
    const photo = safeUrl(h.photo);
    $("#portrait").innerHTML = photo
      ? `<img src="${esc(photo)}" alt="${esc(h.full_name || h.name)}, фото" loading="eager" style="${frameStyle(h.photo_pos)}">`
      : `<div class="portrait__placeholder"><div><span>${esc(initials.toUpperCase())}</span><small>место для фото</small></div></div>`;

    $("#heroBadges").innerHTML = arr(h.badges).filter(has)
      .map((b, i) => `<li>${icon(i % 2 ? "award" : "medal")}${esc(b)}</li>`).join("");

    document.title = (d.seo && d.seo.title) || document.title;
    const md = document.querySelector('meta[name="description"]');
    if (d.seo && d.seo.description && md) md.setAttribute("content", d.seo.description);
    $("#brandName").textContent = h.short_name || h.name || "";
    document.querySelectorAll('[data-bind="hero.role"]').forEach((el) => (el.textContent = h.role || ""));
    $("#footerName").textContent = h.full_name || h.name || "";
    const mark = document.querySelector(".brand__mark"); if (mark) mark.textContent = initials.toUpperCase();
  }

  function renderHeaderCards(d) {
    const hc = d.header_cards || {};
    const awards = arr(d.achievements).filter((a) => !a.hidden);
    const awardCount = awards.filter((a) => a.category === "award").length;
    const contacts = contactItems(d.contacts || {});
    const contactHtml = contacts.length
      ? `<div class="hcard__contacts">${contacts.map((c) => c.href
          ? `<a class="chip-link" href="${esc(c.href)}" ${c.key === "email" ? "" : 'target="_blank" rel="noopener"'}>${icon(c.icon)}${esc(c.label)}</a>`
          : `<span class="chip-link">${icon(c.icon)}${esc(c.value)}</span>`).join("")}</div>`
      : `<a class="hcard__more" href="#contacts">Все контакты ${icon("arrow")}</a>`;

    $("#headerCards").innerHTML = `
      <article class="hcard hcard--awards reveal">
        <div class="hcard__icon">${icon("award")}</div>
        <h3>${esc(hc.awards_title || "Грамоты и награды")}</h3>
        <div class="hcard__count"><b>${awards.length}</b><span>${plural(awards.length, "достижение", "достижения", "достижений")} в портфолио</span></div>
        <p>${esc(hc.awards_text || "")}</p>
        <a class="hcard__more" href="#achievements">Смотреть грамоты ${icon("arrow")}</a>
      </article>
      <article class="hcard hcard--teaching reveal" style="--d:.08s">
        <div class="hcard__icon">${icon("users")}</div>
        <h3>${esc(hc.teaching_title || "Педагогическая деятельность")}</h3>
        <p>${esc(hc.teaching_text || "")}</p>
        <a class="hcard__more" href="#experience">Подробнее об опыте ${icon("arrow")}</a>
      </article>
      <article class="hcard hcard--contact reveal" style="--d:.16s">
        <div class="hcard__icon">${icon("chat")}</div>
        <h3>${esc(hc.contact_title || "Контакты")}</h3>
        <p>${esc(hc.contact_text || "")}</p>
        ${contactHtml}
      </article>`;
  }

  function renderStats(d) {
    const s = arr(d.stats).filter((x) => has(x.value));
    $("#stats").innerHTML = s.map((x, i) => `
      <div class="stat reveal" style="--d:${i * 0.07}s">
        <div class="stat__value">${esc(x.value)}</div>
        <div class="stat__label">${esc(x.label)}</div>
      </div>`).join("");
    $("#stats").closest("section").hidden = !s.length;
  }

  function renderAbout(d) {
    const a = d.about || {};
    $("#aboutTitle").textContent = a.title || "";
    $("#aboutText").innerHTML = arr(a.paragraphs).filter(has).map((p) => `<p>${esc(p)}</p>`).join("");
    const q = $("#aboutQuote"); q.hidden = !has(a.quote); q.textContent = a.quote || "";
    $("#whyTitle").textContent = a.why_title || "";
    $("#whyList").innerHTML = arr(a.why).filter(has).map((w) => `<li>${icon("check")}<span>${esc(w)}</span></li>`).join("");
    $(".why").hidden = !arr(a.why).filter(has).length;
  }

  let ACH = [];
  let currentFilter = "all";
  function achCard(a, i) {
    const img = safeUrl(a.image);
    const cat = CATEGORIES[a.category] ? a.category : "award";
    const link = safeUrl(a.link);
    const media = img
      ? `<button class="ach__media" type="button" data-lb="${esc(img)}" data-cap="${esc(a.title)}" aria-label="Открыть изображение: ${esc(a.title)}"><img src="${esc(img)}" alt="${esc(a.title)}" loading="lazy" style="${frameStyle(a.image_pos)}"></button>`
      : `<div class="ach__art" aria-hidden="true"></div>`;
    return `
      <article class="ach cat-${cat} ${a.featured ? "ach--featured" : ""} reveal" style="--d:${(i % 3) * 0.07}s" data-cat="${cat}">
        <div class="ach__top">${media}</div>
        <div class="ach__body">
          <div class="ach__meta"><span class="ach__cat">${esc(CATEGORIES[cat])}</span>${has(a.year) ? `<span class="ach__year">${esc(a.year)}</span>` : ""}${a.featured ? '<span class="ach__star">Главное</span>' : ""}</div>
          <h3>${esc(a.title)}</h3>
          ${has(a.organization) ? `<p class="ach__org">${esc(a.organization)}</p>` : ""}
          ${has(a.description) ? `<p class="ach__desc">${esc(a.description)}</p>` : ""}
          ${link ? `<a class="ach__link" href="${esc(link)}" target="_blank" rel="noopener">${icon("link")}${esc(a.link_label || "Подробнее")}</a>` : ""}
        </div>
      </article>`;
  }
  function renderAchievements(d) {
    ACH = arr(d.achievements).filter((a) => !a.hidden && has(a.title));
    ACH.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    const counts = ACH.reduce((m, a) => ((m[a.category] = (m[a.category] || 0) + 1), m), {});
    const cats = Object.keys(CATEGORIES).filter((c) => counts[c]);
    $("#filters").innerHTML = [`<button class="filter is-active" data-f="all" role="tab" aria-selected="true">Все<span>${ACH.length}</span></button>`]
      .concat(cats.map((c) => `<button class="filter" data-f="${c}" role="tab" aria-selected="false">${esc(CATEGORIES[c])}<span>${counts[c]}</span></button>`)).join("");
    drawAch();
  }
  function drawAch() {
    const list = currentFilter === "all" ? ACH : ACH.filter((a) => a.category === currentFilter);
    $("#achGrid").innerHTML = list.length ? list.map(achCard).join("") : `<p class="empty">Здесь скоро появятся достижения</p>`;
    observe($("#achGrid"));
  }

  function renderExperience(d) {
    const icons = ["users", "school", "flower", "spark", "heart"];
    $("#timeline").innerHTML = arr(d.experience).filter((e) => has(e.title)).map((e, i) => `
      <li class="tl reveal">
        <span class="tl__dot">${icon(/вожат/i.test(e.title) ? "flower" : icons[i % icons.length])}</span>
        <div class="tl__card">
          <div class="tl__head"><h3>${esc(e.title)}</h3>${has(e.period) ? `<span class="tl__period">${esc(e.period)}</span>` : ""}</div>
          ${has(e.place) ? `<p class="tl__place">${esc(e.place)}</p>` : ""}
          ${arr(e.bullets).filter(has).length ? `<ul>${arr(e.bullets).filter(has).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
        </div>
      </li>`).join("");
  }

  function renderEducation(d) {
    const list = arr(d.education).filter((e) => has(e.institution));
    $("#edu").innerHTML = list.map((e, i) => `
      <article class="edu__item reveal" style="--d:${i * 0.08}s">
        <div class="edu__icon">${icon("school")}</div>
        <div>
          ${has(e.period) ? `<div class="edu__period">${esc(e.period)}</div>` : ""}
          <h3>${esc(e.institution)}</h3>
          ${has(e.specialty) ? `<p class="edu__spec">${esc(e.specialty)}</p>` : ""}
          ${has(e.note) ? `<p class="edu__note">${esc(e.note)}</p>` : ""}
        </div>
      </article>`).join("");
    $("#education").hidden = !list.length;
  }

  function renderApproach(d) {
    $("#compGrid").innerHTML = arr(d.competencies).filter((c) => has(c.title)).map((c, i) => `
      <article class="comp reveal" style="--d:${i * 0.08}s">
        <div class="comp__icon">${icon(c.icon || "spark")}</div>
        <h3>${esc(c.title)}</h3>
        <ul>${arr(c.items).filter(has).map((x) => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>
      </article>`).join("");
    $("#qualities").innerHTML = arr(d.qualities).filter((q) => has(q.title)).map((q, i) => `
      <div class="quality reveal" style="--d:${(i % 3) * 0.06}s">
        <h4>${esc(q.title)}</h4>
        <p>${esc(q.text)}</p>
      </div>`).join("");
  }

  function renderGallery(d) {
    const g = arr(d.gallery).filter((x) => safeUrl(x.image));
    $("#gallery").hidden = !g.length;
    $("#galleryGrid").innerHTML = g.map((x) => `
      <button class="gallery__item reveal" type="button" data-lb="${esc(safeUrl(x.image))}" data-cap="${esc(x.caption || "")}">
        <img src="${esc(safeUrl(x.image))}" alt="${esc(x.caption || "Фото с занятия")}" loading="lazy">
        ${has(x.caption) ? `<span>${esc(x.caption)}</span>` : ""}
      </button>`).join("");
  }

  function renderContacts(d) {
    const c = d.contacts || {};
    $("#contactNote").textContent = c.note || "";
    const items = contactItems(c);
    if (has(c.city)) items.push({ key: "city", label: "Город", value: c.city, icon: "map" });
    const html = items.map((it) => {
      const inner = `<span class="ccard__icon">${icon(it.icon)}</span><span><small>${esc(it.label)}</small><b>${esc(it.value)}</b></span>`;
      const copy = it.copy ? `<button class="ccard__copy" type="button" data-copy="${esc(it.copy)}" aria-label="Скопировать адрес">${icon("copy")}</button>` : "<span></span>";
      return it.href
        ? `<div class="ccard"><a href="${esc(it.href)}" ${it.key === "email" ? "" : 'target="_blank" rel="noopener"'} style="display:contents;color:inherit;text-decoration:none">${inner}</a>${copy}</div>`
        : `<div class="ccard">${inner}${copy}</div>`;
    }).join("");
    const hasDirect = items.some((x) => x.key !== "city");
    $("#contactList").innerHTML = html + (hasDirect ? "" : `<p class="contact__empty">Контакты для связи скоро появятся.</p>`);
    $("#extraList").innerHTML = arr(d.extra).filter((x) => has(x.label) && has(x.value))
      .map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join("");
    $(".contact__right").hidden = !arr(d.extra).filter((x) => has(x.value)).length;
  }

  /* ---------- Блоки страницы ---------- */
  const BG = { cream: "", sky: "section--sky", pink: "section--pink", sand: "section--sand", ink: "section--ink" };
  function buildCustom(it, i) {
    const key = String(it.key || "c" + i).replace(/[^\w-]/g, "");
    const img = safeUrl(it.image);
    const paras = arr(it.paragraphs).filter(has);
    const pts = arr(it.points).filter(has);
    const link = safeUrl(it.link);
    const sec = document.createElement("section");
    sec.className = "section cblock-section " + (BG[it.bg] || "");
    sec.id = "b-" + key;
    sec.innerHTML = `
      <div class="container cblock ${img ? "cblock--img" : ""} ${it.image_side === "left" ? "cblock--left" : ""}">
        <div class="cblock__text reveal">
          <div class="section__head">
            ${has(it.title) ? `<h2 class="section__title">${esc(it.title)}</h2>` : ""}
            ${has(it.subtitle) ? `<p class="section__sub">${esc(it.subtitle)}</p>` : ""}
          </div>
          ${paras.map((x) => `<p class="cblock__p">${esc(x)}</p>`).join("")}
          ${pts.length ? `<ul class="cblock__list">${pts.map((x) => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>` : ""}
          ${link ? `<a class="btn btn--primary cblock__btn" href="${esc(link)}" ${/^https?:/.test(link) ? 'target="_blank" rel="noopener"' : ""}>${esc(it.link_label || "Подробнее")}${icon("arrow")}</a>` : ""}
        </div>
        ${img ? `<button type="button" class="cblock__media reveal" data-lb="${esc(img)}" data-cap="${esc(it.title || "")}" aria-label="Открыть изображение"><img src="${esc(img)}" alt="${esc(it.title || "")}" loading="lazy" style="${frameStyle(it.image_pos)}"></button>` : ""}
      </div>`;
    return sec;
  }

  function renderLayout(d) {
    const layout = getLayout(d);
    document.querySelectorAll(".cblock-section").forEach((e) => e.remove());
    BLOCKS.forEach((b) => { const n = document.getElementById(b.dom); if (n) n.dataset.off = "1"; });
    let anchor = $("#top");
    const menu = [];
    layout.forEach((it, i) => {
      let node;
      if (it.block === "custom") node = buildCustom(it, i);
      else {
        const b = BLOCKS.find((x) => x.id === it.block);
        node = b && document.getElementById(b.dom);
        if (!node) return;
      }
      if (it.hidden) node.dataset.off = "1"; else delete node.dataset.off;
      anchor.after(node); anchor = node;
      if (!it.hidden && has(it.menu)) menu.push({ id: node.id, label: it.menu, node });
    });
    // Пункты меню: только для блоков, которые реально видны
    const links = $("#navLinks");
    links.innerHTML = menu.filter((m) => !m.node.hidden).map((m) => `<a href="#${esc(m.id)}">${esc(m.label)}</a>`).join("");
    if ("IntersectionObserver" in window) {
      const so = new IntersectionObserver((ents) => ents.forEach((en) => {
        if (en.isIntersecting) links.querySelectorAll("a").forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
      }), { rootMargin: "-45% 0px -50% 0px" });
      menu.forEach((m) => so.observe(m.node));
    }
    // Ссылки на убранные или скрытые блоки (кнопки в шапке, «Подробнее») не показываем
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      if (a.closest("#navLinks")) return;
      const target = document.getElementById(a.getAttribute("href").slice(1));
      if (target && target.tagName === "SECTION") a.hidden = !!target.dataset.off || target.hidden;
    });
  }

  /* ---------- Поведение ---------- */
  let io;
  function observe(root) {
    const els = (root || document).querySelectorAll(".reveal:not(.is-in)");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
    io = io || new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }

  function bind() {
    const nav = $("#nav");
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 20);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

    const burger = $("#burger"), links = $("#navLinks");
    burger.innerHTML = icon("menu");
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      burger.innerHTML = icon(open ? "close" : "menu");
    });
    links.addEventListener("click", (e) => {
      if (e.target.closest("a")) { links.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); burger.innerHTML = icon("menu"); }
    });

    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest(".filter"); if (!b) return;
      currentFilter = b.dataset.f;
      document.querySelectorAll(".filter").forEach((f) => { f.classList.toggle("is-active", f === b); f.setAttribute("aria-selected", String(f === b)); });
      drawAch();
    });

    const lb = $("#lightbox");
    $("#lbClose").innerHTML = icon("close");
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-lb]");
      if (t) { $("#lbImg").src = t.dataset.lb; $("#lbImg").alt = t.dataset.cap || ""; $("#lbCap").textContent = t.dataset.cap || ""; lb.hidden = false; $("#lbClose").focus(); }
      const c = e.target.closest("[data-copy]");
      if (c) {
        e.preventDefault();
        const v = c.dataset.copy;
        (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast("Адрес скопирован"), () => toast(v));
      }
    });
    const closeLb = () => { lb.hidden = true; $("#lbImg").src = ""; };
    $("#lbClose").addEventListener("click", closeLb);
    lb.addEventListener("click", (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) closeLb(); });

    $("#year").textContent = new Date().getFullYear();
  }

  async function init() {
    bind();
    let data;
    try { ({ data } = await loadContent()); }
    catch (e) { console.error(e); return; }
    window.__CONTENT__ = data;
    const renders = [renderHero, renderHeaderCards, renderStats, renderAbout, renderAchievements, renderExperience, renderEducation, renderApproach, renderGallery, renderContacts];
    renders.concat([renderLayout]).forEach((fn) => { try { fn(data); } catch (e) { console.error(fn.name, e); } });
    document.documentElement.classList.add("is-ready");
    observe(document);
  }
  init();
})();
