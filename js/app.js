/**
 * Логика публичного сайта: загрузка данных, рендер, бронь, копирование адреса.
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (Number(n) ? new Intl.NumberFormat("ru-RU").format(Number(n)) + " ₸" : esc(n));
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "");

  const pic = (item) => safeUrl(item.image) || API.art(item.id || item.name, item.category);
  const onErr = (item) => `this.onerror=null;this.src='${API.art(item.id || item.name, item.category).replace(/'/g, "%27")}'`;

  let state = { menu: [], settings: {} };
  window.SITE_STATE = state; // читает chat.js

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("opacity-0", "translate-y-4");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("opacity-0", "translate-y-4"), 2600);
  }

  /* ---------- Рендер настроек ---------- */
  function applySettings(s) {
    $$("[data-s]").forEach((el) => {
      const v = s[el.dataset.s];
      if (v === undefined) return;
      el.textContent = v;
      if (el.hasAttribute("data-s-tel")) el.href = "tel:" + String(v).replace(/[^\d+]/g, "");
    });
    $$("[data-s-img]").forEach((el) => {
      const key = el.dataset.sImg;
      const art = API.art(key, "dessert");
      el.onerror = () => { el.onerror = null; el.src = art; };
      el.src = safeUrl(s[key]) || art;
    });
    $$("[data-s-href]").forEach((el) => {
      const u = safeUrl(s[el.dataset.sHref]);
      el.style.display = u ? "" : "none";
      if (u) el.href = u;
    });
    if (s.brand_name) document.title = s.brand_name + (s.address ? " — " + s.address : "");
    const q = s.map_query || s.address;
    if (q) {
      const src = "https://www.google.com/maps?q=" + encodeURIComponent(q) + "&hl=ru&z=16&output=embed";
      const f = $("#mapFrame");
      if (f.getAttribute("src") !== src) f.setAttribute("src", src);
    }
  }

  /* ---------- Рендер меню ---------- */
  function card(item) {
    return `
      <article class="tile reveal p-5 text-center">
        <div class="mx-auto aspect-square w-full max-w-[210px] overflow-hidden rounded-full bg-rose ring-4 ring-white/80">
          <img class="zoom h-full w-full object-cover" src="${esc(pic(item))}" alt="${esc(item.name)}" loading="lazy" onerror="${onErr(item)}" />
        </div>
        <h3 class="h-serif mt-5 text-2xl">${esc(item.name)}</h3>
        <p class="mt-1.5 min-h-[2.5rem] text-sm leading-snug text-plum/70">${esc(item.description)}</p>
        <span class="pill mt-3">${money(item.price)}</span>
      </article>`;
  }

  function dessertRow(item) {
    return `
      <article class="tile reveal overflow-hidden">
        <div class="aspect-[4/3] overflow-hidden bg-rose">
          <img class="zoom h-full w-full object-cover" src="${esc(pic(item))}" alt="${esc(item.name)}" loading="lazy" onerror="${onErr(item)}" />
        </div>
        <div class="p-5">
          <div class="flex items-start justify-between gap-3">
            <h3 class="h-serif text-2xl leading-tight">${esc(item.name)}</h3>
            <span class="pill whitespace-nowrap !px-3 !py-1">${money(item.price)}</span>
          </div>
          <p class="mt-2 text-sm leading-snug text-plum/70">${esc(item.description)}</p>
        </div>
      </article>`;
  }

  function renderMenu(menu) {
    const sorted = [...menu].filter((m) => m.available !== false && m.available !== "FALSE")
      .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
    const coffee = sorted.filter((m) => m.category === "coffee");
    const dessert = sorted.filter((m) => m.category === "dessert");
    $("#coffeeGrid").innerHTML = coffee.length ? coffee.map(card).join("") : '<p class="col-span-full text-center text-plum/60">Меню скоро появится.</p>';
    $("#dessertGrid").innerHTML = dessert.length ? dessert.map(dessertRow).join("") : '<p class="text-plum/60">Десерты скоро появятся.</p>';
    observeReveal();
  }

  /* ---------- Анимация появления ---------- */
  let io;
  function observeReveal() {
    if (!("IntersectionObserver" in window)) { $$(".reveal").forEach((e) => e.classList.add("in")); return; }
    io = io || new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$(".reveal:not(.in)").forEach((e) => io.observe(e));
  }

  /* ---------- Загрузка данных ---------- */
  const CACHE_KEY = "vk_public_v1";

  function paint(data) {
    state.menu = data.menu || [];
    state.settings = { ...API.DEMO.settings, ...(data.settings || {}) };
    applySettings(state.settings);
    renderMenu(state.menu);
  }

  async function load() {
    if (!API.hasBackend()) { paint(API.DEMO); return; }
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c) paint(c); } catch (e) {}
    try {
      const data = await API.get({ action: "public" });
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      paint(data);
    } catch (e) {
      console.error(e);
      if (!state.menu.length) { paint(API.DEMO); toast("Не удалось загрузить меню, показаны примеры"); }
    }
  }

  /* ---------- Навигация ---------- */
  function initNav() {
    const nav = $("#navbar"), burger = $("#burger"), mob = $("#mobileNav"), header = $("#top");
    const onScroll = () => nav.classList.toggle("shadow-xl", window.scrollY > 30);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    burger.addEventListener("click", () => {
      const open = mob.classList.toggle("hidden") === false;
      burger.setAttribute("aria-expanded", open);
    });
    $$("a", mob).forEach((a) => a.addEventListener("click", () => mob.classList.add("hidden")));
  }

  /* ---------- Бронирование ---------- */
  function initBooking() {
    const form = $("#bookingForm"), msg = $("#bookMsg"), btn = $("#bookBtn");
    const dateInput = form.elements.date;
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    dateInput.min = today.toISOString().slice(0, 10);

    const say = (t, ok) => { msg.textContent = t; msg.className = "min-h-[1.25rem] text-sm " + (ok ? "text-green-800" : "text-red-700"); };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = form.elements;
      const payload = {
        action: "book",
        name: f.name.value.trim(), phone: f.phone.value.trim(),
        date: f.date.value, time: f.time.value, guests: f.guests.value,
        website: f.website.value, // honeypot
      };
      if (payload.name.length < 2) return say("Введите имя", false);
      if (!/^[+\d][\d\s()\-]{6,}$/.test(payload.phone)) return say("Проверьте номер телефона", false);
      if (!payload.date || !payload.time) return say("Укажите дату и время", false);

      btn.disabled = true; say("Отправляем…", true);
      try {
        if (API.hasBackend()) await API.post(payload);
        else await new Promise((r) => setTimeout(r, 600)); // демо
        say("Спасибо! Заявка принята — мы свяжемся с вами для подтверждения.", true);
        form.reset(); f.guests.value = "2";
        toast("Заявка отправлена ✓");
      } catch (err) {
        say(err.message || "Не удалось отправить. Попробуйте ещё раз.", false);
      } finally { btn.disabled = false; }
    });
  }

  /* ---------- Копирование адреса ---------- */
  function initCopy() {
    $("#copyAddr").addEventListener("click", async () => {
      const text = (state.settings.address || "Ташкентская, 138").trim();
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
          const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
        }
        toast("Адрес скопирован: " + text);
      } catch (e) { toast("Не удалось скопировать — выделите адрес вручную"); }
    });
  }

  window.SITE_UTILS = { toast, esc };
  initNav(); initBooking(); initCopy(); observeReveal(); load();
})();
