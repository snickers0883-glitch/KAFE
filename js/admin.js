/**
 * Админ-панель: вход, редактор меню, кастомизатор сайта, брони, смена пароля.
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "");
  const demo = !API.hasBackend();

  let token = sessionStorage.getItem("vk_token") || "";
  let menu = [], bookings = [], settings = {};
  // в демо-режиме правки живут только в памяти страницы
  const demoStore = { menu: JSON.parse(JSON.stringify(API.DEMO.menu)), settings: { ...API.DEMO.settings }, bookings: [] };

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg;
    t.classList.remove("opacity-0", "translate-y-4");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("opacity-0", "translate-y-4"), 2400);
  }

  /* ---------- API-обёртка ---------- */
  async function call(action, data = {}) {
    if (demo) return demoCall(action, data);
    try { return await API.post({ action, token, ...data }); }
    catch (e) {
      if (/Сессия истекла/.test(e.message)) { logout(true); }
      throw e;
    }
  }

  function demoCall(action, d) {
    switch (action) {
      case "login": return { ok: true, token: "demo", login: d.login };
      case "menu_list": return { ok: true, menu: demoStore.menu };
      case "menu_save": {
        const it = { ...d.item }; it.id = it.id || "m" + Date.now();
        const i = demoStore.menu.findIndex((m) => m.id === it.id);
        if (i >= 0) demoStore.menu[i] = it; else demoStore.menu.push(it);
        return { ok: true };
      }
      case "menu_delete": demoStore.menu = demoStore.menu.filter((m) => m.id !== d.id); return { ok: true };
      case "settings_save": Object.assign(demoStore.settings, d.settings); return { ok: true };
      case "bookings_list": return { ok: true, bookings: demoStore.bookings };
      default: return { ok: true };
    }
  }

  /* ---------- Вход / выход ---------- */
  function showApp() {
    $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
    $("#demoBadge").classList.toggle("hidden", !demo);
    loadAll();
  }
  function logout(expired) {
    if (!demo && token) API.post({ action: "logout", token }).catch(() => {});
    token = ""; sessionStorage.removeItem("vk_token");
    $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
    $("#lMsg").textContent = expired === true ? "Сессия истекла. Войдите снова." : "";
  }
  $("#logout").addEventListener("click", () => logout());

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#lBtn"), msg = $("#lMsg"); msg.textContent = ""; btn.disabled = true;
    try {
      const r = await call("login", { login: $("#lLogin").value, password: $("#lPass").value });
      token = r.token; sessionStorage.setItem("vk_token", token);
      $("#lPass").value = ""; showApp();
    } catch (err) { msg.textContent = err.message; }
    finally { btn.disabled = false; }
  });

  /* ---------- Вкладки ---------- */
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === b));
    ["menu", "site", "bookings", "account"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
    if (b.dataset.tab === "bookings") loadBookings();
  }));

  async function loadAll() {
    try {
      const [m, p] = await Promise.all([
        call("menu_list"),
        demo ? { settings: demoStore.settings } : API.get({ action: "public" }),
      ]);
      menu = m.menu; settings = { ...API.DEMO.settings, ...p.settings };
      renderMenu(); renderSiteForm();
      loadBookings(true);
    } catch (e) { toast(e.message); }
  }

  /* ---------- МЕНЮ ---------- */
  function renderMenu() {
    const sorted = [...menu].sort((a, b) => (a.category > b.category ? 1 : a.category < b.category ? -1 : (Number(a.sort) || 0) - (Number(b.sort) || 0)));
    $("#menuBody").innerHTML = sorted.map((m) => `
      <tr>
        <td class="w-16"><img src="${esc(safeUrl(m.image) || API.art(m.id || m.name, m.category))}" class="h-12 w-12 rounded-full object-cover" alt="" onerror="this.onerror=null;this.src='${API.art(m.id || m.name, m.category).replace(/'/g, "%27")}'"></td>
        <td><div class="font-medium">${esc(m.name)}</div><div class="max-w-xs truncate text-xs text-espresso/60">${esc(m.description)}</div></td>
        <td>${m.category === "coffee" ? "Кофе" : "Десерты"}</td>
        <td>${esc(m.price)} ₸</td>
        <td>${m.available === false ? '<span class="text-espresso/40">скрыто</span>' : "✓"}</td>
        <td class="whitespace-nowrap text-right">
          <button class="btn btn-ghost !py-1" data-edit="${esc(m.id)}">Изменить</button>
          <button class="btn btn-danger !py-1" data-del="${esc(m.id)}">Удалить</button>
        </td>
      </tr>`).join("") || '<tr><td colspan="6" class="p-6 text-center text-espresso/50">Меню пусто — добавьте первую позицию</td></tr>';
  }

  $("#menuBody").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) openModal(menu.find((m) => m.id === ed.dataset.edit));
    if (del) {
      const it = menu.find((m) => m.id === del.dataset.del);
      if (!confirm(`Удалить «${it.name}»? Это нельзя отменить.`)) return;
      try { await call("menu_delete", { id: it.id }); toast("Удалено"); await reloadMenu(); } catch (err) { toast(err.message); }
    }
  });
  async function reloadMenu() { menu = (await call("menu_list")).menu; renderMenu(); }

  const modal = $("#modal");
  function openModal(it) {
    $("#modalTitle").textContent = it ? "Редактирование" : "Новая позиция";
    $("#fId").value = it?.id || ""; $("#fName").value = it?.name || ""; $("#fCat").value = it?.category || "coffee";
    $("#fPrice").value = it?.price ?? ""; $("#fDesc").value = it?.description || ""; $("#fImg").value = it?.image || "";
    $("#fSort").value = it?.sort ?? 0; $("#fAvail").checked = it ? it.available !== false : true; $("#fMsg").textContent = "";
    preview(); modal.classList.remove("hidden"); modal.classList.add("flex"); $("#fName").focus();
  }
  function closeModal() { modal.classList.add("hidden"); modal.classList.remove("flex"); }
  function preview() {
    const u = safeUrl($("#fImg").value.trim()), im = $("#fPreview");
    im.classList.toggle("hidden", !u); if (u) im.src = u;
  }
  $("#addItem").addEventListener("click", () => openModal());
  $("#fCancel").addEventListener("click", closeModal);
  $("#fImg").addEventListener("input", preview);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  $("#itemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const img = $("#fImg").value.trim();
    if (img && !safeUrl(img)) return ($("#fMsg").textContent = "Ссылка на картинку должна начинаться с https://");
    const btn = $("#fSave"); btn.disabled = true;
    try {
      await call("menu_save", { item: {
        id: $("#fId").value || undefined, name: $("#fName").value.trim(), category: $("#fCat").value,
        price: Number($("#fPrice").value), description: $("#fDesc").value.trim(), image: img,
        sort: Number($("#fSort").value) || 0, available: $("#fAvail").checked,
      } });
      closeModal(); toast("Сохранено — сайт обновлён ✓"); await reloadMenu();
    } catch (err) { $("#fMsg").textContent = err.message; }
    finally { btn.disabled = false; }
  });

  /* ---------- КАСТОМИЗАТОР САЙТА ---------- */
  const SITE_FIELDS = [
    ["Главный экран", [
      ["hero_eyebrow", "Надпись над заголовком"], ["hero_title", "Заголовок (Enter — перенос строки)", "textarea"],
      ["hero_text", "Описание", "textarea"], ["hero_button", "Текст кнопки"], ["hero_image", "Фоновая картинка (https://…)", "img"]]],
    ["Кофе и десерты", [
      ["coffee_title", "Заголовок «Кофе»"], ["coffee_subtitle", "Подзаголовок «Кофе»", "textarea"],
      ["dessert_title", "Заголовок «Десерты»"], ["dessert_subtitle", "Подзаголовок «Десерты»", "textarea"],
      ["dessert_image", "Картинка блока десертов (https://…)", "img"]]],
    ["Бронь", [["booking_title", "Заголовок"], ["booking_subtitle", "Подзаголовок", "textarea"]]],
    ["Контакты", [
      ["contacts_title", "Заголовок"], ["address", "Адрес (копируется кнопкой)"], ["map_query", "Адрес для карты (добавьте город для точности)"],
      ["phone", "Телефон"], ["hours", "Часы работы"], ["instagram", "Ссылка на Instagram"]]],
    ["Общее", [["brand_name", "Название кофейни"], ["footer_text", "Текст в подвале"]]],
  ];

  function renderSiteForm() {
    $("#siteForm").innerHTML = SITE_FIELDS.map(([title, fields]) => `
      <fieldset class="rounded-2xl bg-white/70 p-5 ring-1 ring-sand">
        <legend class="px-2 font-serif text-lg">${title}</legend>
        <div class="grid gap-4 md:grid-cols-2">
          ${fields.map(([k, label, type]) => {
            const v = esc(settings[k] ?? "");
            const wide = type === "textarea" || type === "img" ? "md:col-span-2" : "";
            const input = type === "textarea"
              ? `<textarea data-k="${k}" rows="2" class="field">${v}</textarea>`
              : `<input data-k="${k}" class="field" value="${v}" ${type === "img" ? 'placeholder="https://…"' : ""}>`;
            const prev = type === "img" && safeUrl(settings[k]) ? `<img src="${v}" class="mt-2 h-24 rounded-lg object-cover" alt="" onerror="this.style.display='none'">` : "";
            return `<label class="block ${wide}"><span class="lbl">${label}</span>${input}${prev}</label>`;
          }).join("")}
        </div>
      </fieldset>`).join("");
  }

  $("#saveSite").addEventListener("click", async () => {
    const data = {};
    $$("#siteForm [data-k]").forEach((el) => (data[el.dataset.k] = el.value));
    for (const k of ["hero_image", "dessert_image", "instagram"]) {
      if (data[k] && !safeUrl(data[k])) return toast("Ссылки должны начинаться с https://");
    }
    const btn = $("#saveSite"); btn.disabled = true;
    try { await call("settings_save", { settings: data }); Object.assign(settings, data); toast("Сохранено — сайт обновлён ✓"); }
    catch (e) { toast(e.message); } finally { btn.disabled = false; }
  });

  /* ---------- БРОНИ ---------- */
  const STATUS = { new: "Новая", confirmed: "Подтверждена", cancelled: "Отменена" };
  async function loadBookings(silent) {
    try {
      bookings = (await call("bookings_list")).bookings.slice().reverse();
      renderBookings();
    } catch (e) { if (!silent) toast(e.message); }
  }
  function renderBookings() {
    const n = bookings.filter((b) => b.status === "new").length;
    const badge = $("#newCount"); badge.textContent = n; badge.classList.toggle("hidden", !n);
    $("#bookBody").innerHTML = bookings.map((b) => `
      <tr>
        <td class="whitespace-nowrap text-xs text-espresso/60">${esc(b.created)}</td>
        <td class="font-medium">${esc(b.name)}</td>
        <td><a class="text-mocha underline" href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a></td>
        <td class="whitespace-nowrap">${esc(b.date)}</td><td>${esc(b.time)}</td><td>${esc(b.guests)}</td>
        <td><select class="field !w-auto !py-1" data-status="${esc(b.id)}">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select></td>
        <td class="text-right"><button class="btn btn-danger !py-1" data-bdel="${esc(b.id)}">Удалить</button></td>
      </tr>`).join("") || '<tr><td colspan="8" class="p-6 text-center text-espresso/50">Пока нет заявок</td></tr>';
  }
  $("#reloadBookings").addEventListener("click", () => loadBookings());
  $("#bookBody").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-status]"); if (!s) return;
    try { await call("booking_status", { id: s.dataset.status, status: s.value }); toast("Статус обновлён"); await loadBookings(true); }
    catch (err) { toast(err.message); }
  });
  $("#bookBody").addEventListener("click", async (e) => {
    const d = e.target.closest("[data-bdel]"); if (!d) return;
    if (!confirm("Удалить заявку?")) return;
    try { await call("booking_delete", { id: d.dataset.bdel }); toast("Удалено"); await loadBookings(true); } catch (err) { toast(err.message); }
  });

  /* ---------- ПАРОЛЬ ---------- */
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await call("change_password", { oldPassword: $("#pwOld").value, newPassword: $("#pwNew").value });
      $("#pwForm").reset(); toast("Пароль изменён ✓");
    } catch (err) { toast(err.message); }
  });

  if (token) showApp();
})();
