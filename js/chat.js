/**
 * Виджет AI-бариста. Настройки (API_KEY, SYSTEM_PROMPT, провайдер) — в js/config.js.
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const box = $("#chatBox"), toggle = $("#chatToggle"), log = $("#chatLog"), form = $("#chatForm"), input = $("#chatInput");
  const history = []; // {role:'user'|'assistant', text}
  let busy = false;

  function open(v) {
    if (v) { box.classList.remove("hidden"); box.classList.add("flex"); requestAnimationFrame(() => box.classList.remove("opacity-0", "scale-95")); input.focus(); }
    else { box.classList.add("opacity-0", "scale-95"); setTimeout(() => { box.classList.add("hidden"); box.classList.remove("flex"); }, 200); }
  }
  toggle.addEventListener("click", () => open(box.classList.contains("hidden")));
  $("#chatClose").addEventListener("click", () => open(false));

  function bubble(text, who) {
    const d = document.createElement("div");
    d.className = who === "user"
      ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-wine px-4 py-2.5 text-white"
      : "mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-plum ring-1 ring-rose";
    d.textContent = text; // textContent — без XSS
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    return d;
  }
  function typing() {
    const d = document.createElement("div");
    d.className = "typing mr-auto rounded-2xl bg-white px-4 py-3 ring-1 ring-rose";
    d.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }

  // Системный промпт + актуальное меню (чтобы бариста не выдумывал позиции)
  function systemPrompt() {
    const st = window.SITE_STATE || { menu: [], settings: {} };
    const lines = (st.menu || []).filter((m) => m.available !== false && m.available !== "FALSE")
      .map((m) => `- ${m.category === "coffee" ? "Кофе" : "Десерт"}: ${m.name}, ${m.price} ₸. ${m.description}`);
    return CONFIG.SYSTEM_PROMPT + (lines.length ? "\n\nАктуальное меню:\n" + lines.join("\n") : "");
  }

  async function askDirect() {
    const key = (CONFIG.API_KEY || "").trim();
    if (!key) throw new Error("Не задан API_KEY в js/config.js");
    const sys = systemPrompt();

    if (CONFIG.AI_PROVIDER === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({
          model: CONFIG.AI_MODEL || "gpt-4o-mini",
          messages: [{ role: "system", content: sys }, ...history.map((h) => ({ role: h.role, content: h.text }))],
          temperature: 0.7, max_tokens: 400,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || "Ошибка OpenAI");
      return j.choices?.[0]?.message?.content?.trim();
    }

    // Gemini
    const model = CONFIG.AI_MODEL || "gemini-3.8-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: history.map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] })),
        generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
      }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message || "Ошибка Gemini");
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim();
  }

  async function askProxy() {
    const j = await API.post({ action: "chat", messages: history.slice(-10) });
    return j.reply;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = ""; busy = true;
    bubble(text, "user");
    history.push({ role: "user", text });
    if (history.length > 12) history.splice(0, history.length - 12);

    const t = typing();
    try {
      const reply = CONFIG.CHAT_MODE === "proxy" ? await askProxy() : await askDirect();
      t.remove();
      const out = reply || "Извините, не смог придумать ответ. Попробуйте переформулировать.";
      bubble(out, "bot"); history.push({ role: "assistant", text: out });
    } catch (err) {
      t.remove(); history.pop();
      bubble("Не получилось ответить: " + (err.message || "ошибка сети"), "bot");
    } finally { busy = false; input.focus(); }
  });

  bubble(CONFIG.CHAT_GREETING || "Привет!", "bot");
})();
