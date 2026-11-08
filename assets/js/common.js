/* Общие функции для сайта и админ-панели */
(function () {
  const cfg = window.SITE_CONFIG || {};

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^(https?:|mailto:|tel:)/i.test(s) || /^[./]?[\w\-./%]+$/.test(s)) return s;
    return "";
  }

  const isConfigured = () => Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  async function fetchWithTimeout(url, opts = {}, ms = 5000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(t); }
  }

  async function loadDefault() {
    const r = await fetch("content/default.json", { cache: "no-cache" });
    return r.json();
  }

  // Загружает содержимое: сначала из Supabase, при ошибке из content/default.json
  async function loadContent() {
    if (isConfigured()) {
      try {
        const url = cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/site_content?id=eq.1&select=data";
        const r = await fetchWithTimeout(url, {
          headers: { apikey: cfg.SUPABASE_ANON_KEY }
        });
        if (r.ok) {
          const rows = await r.json();
          if (rows && rows[0] && rows[0].data && Object.keys(rows[0].data).length) {
            return { data: rows[0].data, source: "supabase" };
          }
        }
      } catch (e) { console.warn("Supabase недоступен, показываю резервную копию", e); }
    }
    return { data: await loadDefault(), source: "default" };
  }

  const P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    award: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/><path d="m10 9 1.5 1.5L14.5 7.5"/></svg>`,
    book: `<svg viewBox="0 0 24 24" ${P}><path d="M3 5.5C3 4.7 3.7 4 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3z"/><path d="M21 5.5c0-.8-.7-1.5-1.5-1.5H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" ${P}><path d="M12 20s-7.5-4.4-9-9.3C2 7.3 4.3 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.6 1.1-1.6 2.7-2.6 4.6-2.6 3.1 0 5.4 2.8 4.4 6.2C19.5 15.6 12 20 12 20z"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.3 2.7L16 12l-2.7 1.3L12 16l-1.3-2.7L8 12l2.7-1.3z"/></svg>`,
    users: `<svg viewBox="0 0 24 24" ${P}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" ${P}><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24" ${P}><path d="M21 4 3 11l6 2.5L11.5 20l3-4.5L19 19z"/><path d="m9 13.5 7-5"/></svg>`,
    vk: `<svg viewBox="0 0 24 24" ${P}><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7 9c.3 3.7 2.2 6 5.5 6v-2.3c1.2.1 2.1 1 2.5 2.3H17c-.5-1.8-1.7-2.8-2.4-3.2.7-.4 1.7-1.5 2-2.8h-1.8c-.4 1.1-1.3 2.1-2.3 2.2V9h-1.8v4.5C9.7 13.2 8.9 11.7 8.8 9z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" ${P}><path d="M4 18.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H8z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg>`,
    map: `<svg viewBox="0 0 24 24" ${P}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
    check: `<svg viewBox="0 0 24 24" ${P}><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" ${P}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
    link: `<svg viewBox="0 0 24 24" ${P}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg>`,
    medal: `<svg viewBox="0 0 24 24" ${P}><path d="M7 3h10l-3 6h-4z"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.5v5"/></svg>`,
    school: `<svg viewBox="0 0 24 24" ${P}><path d="m2.5 9 9.5-5 9.5 5-9.5 5z"/><path d="M6.5 11.2v4.6c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.6"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" ${P}><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>`,
    close: `<svg viewBox="0 0 24 24" ${P}><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" ${P}><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    flower: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="2.4"/><path d="M12 9.6C10.2 7 10.6 3.5 12 3c1.4.5 1.8 4 0 6.6zM12 14.4c1.8 2.6 1.4 6.1 0 6.6-1.4-.5-1.8-4 0-6.6zM9.6 12C7 13.8 3.5 13.4 3 12c.5-1.4 4-1.8 6.6 0zM14.4 12c2.6-1.8 6.1-1.4 6.6 0-.5 1.4-4 1.8-6.6 0z"/></svg>`
  };
  const icon = (name) => ICONS[name] || ICONS.spark;

  const CATEGORIES = {
    award: "Награды и конкурсы",
    teaching: "Педагогика",
    event: "Форумы и мероприятия",
    sport: "Спорт"
  };

  function tgLink(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    if (/^https?:/i.test(s)) return s;
    return "https://t.me/" + s.replace(/^@/, "").replace(/^t\.me\//i, "");
  }
  function vkLink(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    if (/^https?:/i.test(s)) return s;
    return "https://vk.com/" + s.replace(/^@/, "").replace(/^vk\.com\//i, "");
  }

  // Кадр изображения: x, y — точка привязки в процентах (0..100), z — масштаб (1..4)
  function normPos(p) {
    const n = (v, d, lo, hi) => { const x = parseFloat(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
    p = p || {};
    return { x: n(p.x, 50, 0, 100), y: n(p.y, 50, 0, 100), z: n(p.z, 1, 1, 4) };
  }
  function frameStyle(p) {
    const { x, y, z } = normPos(p);
    return `object-fit:cover;object-position:${x}% ${y}%;transform:scale(${z});transform-origin:${x}% ${y}%`;
  }

  // Стандартные блоки страницы (шапка с фото всегда сверху и сюда не входит)
  const BLOCKS = [
    { id: "stats", dom: "statsBand", title: "Цифры", menu: "", tone: "ink" },
    { id: "about", dom: "about", title: "Обо мне", menu: "Обо мне", tone: "cream" },
    { id: "achievements", dom: "achievements", title: "Достижения и грамоты", menu: "Достижения", tone: "sky" },
    { id: "experience", dom: "experience", title: "Опыт работы", menu: "Опыт", tone: "cream" },
    { id: "education", dom: "education", title: "Образование", menu: "", tone: "sand" },
    { id: "approach", dom: "approach", title: "Подход и качества", menu: "Подход", tone: "cream" },
    { id: "gallery", dom: "gallery", title: "Фотогалерея", menu: "", tone: "pink" },
    { id: "contacts", dom: "contacts", title: "Контакты", menu: "Контакты", tone: "cream" }
  ];
  // Цвета, из которых можно выбирать фон любого блока
  const TONES = [
    { id: "cream", name: "Кремовый", hex: "#FBF5EC" },
    { id: "white", name: "Белый", hex: "#FFFCF7" },
    { id: "sky", name: "Голубой", hex: "#DCEDF8" },
    { id: "pink", name: "Светло-розовый", hex: "#FBE3E6" },
    { id: "rose", name: "Розовый", hex: "#F2B8C0" },
    { id: "sand", name: "Бежевый", hex: "#EBD9BF" },
    { id: "blue", name: "Синий", hex: "#2C5F8E" },
    { id: "ink", name: "Тёмно-синий", hex: "#1E2B44" }
  ];
  const toneOk = (t) => TONES.some((x) => x.id === t);
  const tone = (value, def) => (toneOk(value) ? value : def);
  const defaultLayout = () => BLOCKS.map((b) => ({ block: b.id, hidden: false, menu: b.menu }));
  const getLayout = (d) => (d && Array.isArray(d.layout) ? d.layout : defaultLayout());

  window.Common = { cfg, esc, safeUrl, isConfigured, loadContent, loadDefault, icon, CATEGORIES, tgLink, vkLink, normPos, frameStyle, BLOCKS, defaultLayout, getLayout, TONES, tone };
})();
