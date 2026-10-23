/**
 * Общий слой работы с Google Apps Script.
 *
 * ВАЖНО: товары хранятся ТОЛЬКО в базе (лист «Меню» в Google Таблице).
 * Блок PREVIEW ниже нужен лишь чтобы можно было открыть сайт без подключённой базы
 * и посмотреть дизайн. Как только в config.js указан APPS_SCRIPT_URL — он не используется.
 */
(function () {
  const cfg = () => window.CONFIG || {};
  const hasBackend = () => !!(cfg().APPS_SCRIPT_URL || "").trim();

  /* ---------- PREVIEW-данные (только без базы) ---------- */
  const PREVIEW = {
    settings: {
      brand_name: "Вкусный кофе",
      hero_eyebrow: "Кофейня и десерты",
      hero_title: "Вкусный кофе,\nсладкие моменты",
      hero_text: "Свежеобжаренные зёрна, нежные макаронс и десерты ручной работы. Ваш маленький ежедневный праздник.",
      hero_button: "Смотреть меню",
      hero_image: "",
      coffee_title: "Кофе",
      coffee_subtitle: "Каждая чашка — маленькая история о зерне, обжарке и вкусе.",
      dessert_title: "Десерты и вкусности",
      dessert_subtitle: "Макаронс, торты и выпечка — ежедневно, с любовью.",
      dessert_image: "",
      booking_title: "Забронировать столик",
      booking_subtitle: "Оставьте заявку — мы подтвердим бронь по телефону.",
      contacts_title: "Ждём вас в гости",
      address: "Ташкентская, 138",
      phone: "+7 000 000 00 00",
      hours: "Ежедневно, 08:00 – 22:00",
      instagram: "https://instagram.com/",
      map_query: "Ташкентская, 138",
      footer_text: "© Вкусный кофе. Все права защищены.",
    },
    menu: [
      ["c1", "coffee", "Капучино", 1800, "Шоколад, карамель, нежная молочная пена"],
      ["c2", "coffee", "Флэт уайт", 2000, "Насыщенный, сливочный, с нотой жареного ореха"],
      ["c3", "coffee", "Айс латте", 2200, "Освежающий, мягкий, с карамельным послевкусием"],
      ["c4", "coffee", "Эспрессо", 1400, "Тёмный шоколад, цитрусовая кислинка"],
      ["d1", "dessert", "Макаронс клубничный", 700, "Миндальные коржи и сливочный крем с клубникой"],
      ["d2", "dessert", "Розовый капкейк", 1500, "Ванильный бисквит и кремовая роза"],
      ["d3", "dessert", "Чизкейк с ягодами", 2600, "Нежный сливочный крем и ягодный соус"],
      ["d4", "dessert", "Круассан", 1600, "Хрустящий, слоёный, с маслом и ванилью"],
    ].map((r, i) => ({ id: r[0], category: r[1], name: r[2], price: r[3], description: r[4], image: "", available: true, sort: i + 1 })),
  };

  /* ---------- Запасные иллюстрации (если у позиции нет фото или оно не загрузилось) ---------- */
  const PALETTES = [
    ["#f6a5b8", "#fbd0da", "#b5476a"], ["#f9c0a8", "#fde0d2", "#c96a4a"], ["#c9b3e8", "#e6dcf5", "#7c5cb0"],
    ["#a8dccb", "#d5f0e6", "#3f8f77"], ["#f4d58d", "#fbeab9", "#b8892b"], ["#e8b4a0", "#f6d9cc", "#7a3b28"],
  ];
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  function art(seed, kind) {
    const [c1, c2, c3] = PALETTES[hash(seed) % PALETTES.length];
    const bg = "#fbd3dd";
    let body;
    if (kind === "coffee") {
      body = `
        <ellipse cx="200" cy="318" rx="130" ry="20" fill="#fff"/>
        <ellipse cx="200" cy="312" rx="105" ry="13" fill="#f3b6c6"/>
        <path d="M110 190h180v40c0 52-40 84-90 84s-90-32-90-84z" fill="#fff"/>
        <path d="M290 205c38-6 48 38 0 52" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"/>
        <ellipse cx="200" cy="190" rx="90" ry="20" fill="#c98f6b"/>
        <ellipse cx="200" cy="190" rx="70" ry="14" fill="#f1dcc9"/>
        <path d="M200 200c-30-6-26-26-10-26 6 0 10 4 10 8 0-4 4-8 10-8 16 0 20 20-10 26z" fill="#c98f6b" opacity=".75"/>`;
    } else {
      body = `
        <ellipse cx="200" cy="318" rx="115" ry="14" fill="rgba(122,29,58,.15)"/>
        <path d="M92 262Q92 312 200 312Q308 312 308 262Z" fill="${c1}"/>
        <rect x="84" y="232" width="232" height="34" rx="17" fill="${c3}" opacity=".85"/>
        <path d="M88 232Q88 140 200 140Q312 140 312 232Z" fill="${c1}"/>
        <path d="M92 230H308" stroke="${c2}" stroke-width="9" stroke-dasharray="1 8" stroke-linecap="round"/>
        <ellipse cx="150" cy="182" rx="42" ry="13" fill="#fff" opacity=".4" transform="rotate(-18 150 182)"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g" cx="50%" cy="30%"><stop offset="0" stop-color="#fff1f4"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs><rect width="400" height="400" fill="url(#g)"/>${body}</svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ---------- HTTP ---------- */
  async function parse(res) {
    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error("Сервер вернул неожиданный ответ. Проверьте развёртывание Apps Script."); }
    if (!data.ok) throw new Error(data.error || "Ошибка сервера");
    return data;
  }
  async function get(params) {
    return parse(await fetch(cfg().APPS_SCRIPT_URL + "?" + new URLSearchParams(params).toString()));
  }
  // text/plain — «простой» запрос без CORS-preflight (Apps Script не умеет OPTIONS).
  async function post(body) {
    return parse(await fetch(cfg().APPS_SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body),
    }));
  }

  window.API = { DEMO: PREVIEW, hasBackend, get, post, art };
})();
