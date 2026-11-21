"use strict";

/*
 * Keepalive do chat da Twitch.
 *
 * O RiftStream considera o jogador AFK quando `agora - lastActiveAt` passa de
 * `afkMinutes` (30 por padrão, 120 para VIP). `lastActiveAt` só é atualizado
 * quando um comando é enviado no chat da live — logo, sem mensagem, o herói sai
 * do jogo por mais que a aba do site continue aberta.
 *
 * Este script recebe um pedido do service worker (que não sofre o throttle de
 * aba em segundo plano) e envia um comando curto, conferindo se a caixa de
 * texto esvaziou de verdade depois do envio.
 *
 * Regras:
 *  - nunca envia se o usuário estiver com texto digitado na caixa;
 *  - nunca envia se a conta estiver deslogada;
 *  - respeita um intervalo mínimo entre envios, mesmo forçado;
 *  - registra quando o próprio usuário digitou, para o coordenador não
 *    atropelar uma mensagem humana.
 */

(() => {
  if (window.__rsafChatKeeper) return;
  window.__rsafChatKeeper = true;

  // O chat da Twitch é um editor Slate: o texto aparece no DOM, mas o estado
  // interno (que habilita o botão e alimenta o Enter) só muda com paste,
  // beforeinput ou execCommand. Setar value/textContent "escreve" e não envia.
  const INPUT = '[data-a-target="chat-input"], [data-slate-editor="true"], ' +
    '.chat-wysiwyg-input__editor, div[contenteditable="true"][role="textbox"]';
  const SEND = 'button[data-a-target="chat-send-button"]';
  const HUMAN_KEY = "rsafChatHuman";
  const COOLDOWN_OK = 90 * 1000;
  const COOLDOWN_FAIL = 15 * 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastOk = 0;
  let lastTry = 0;

  function visivel(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function editavel(el) {
    return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" ||
      el.isContentEditable || el.getAttribute("contenteditable") === "true" ||
      el.getAttribute("data-slate-editor") === "true");
  }

  function findInput() {
    for (const alvo of document.querySelectorAll(INPUT)) {
      if (visivel(alvo) && editavel(alvo)) return alvo;
      const filho = alvo.querySelector?.('textarea, [contenteditable="true"], [data-slate-editor="true"]');
      if (visivel(filho)) return filho;
    }
    return null;
  }

  function isLoggedOut() {
    if (document.querySelector('[data-a-target="login-button"]')) return true;
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.some((d) =>
      /junte-se hoje|join today|log in|sign in|entrar/i.test(d.innerText || "")
    );
  }

  async function waitFor(fn, timeout, interval = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function isTextarea(el) {
    return el && el.tagName === "TEXTAREA";
  }

  // Zero-width e NBSP ficam no editor do Slate e faziam "campo preenchido"
  // parecer "usuário digitando" para sempre.
  function textoDe(el) {
    if (!el) return "";
    const bruto = isTextarea(el)
      ? el.value
      : (el.innerText ?? el.textContent);
    return String(bruto || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .trim();
  }

  async function inserir(el, texto) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      try { el.focus(); } catch { /* ignore */ }
    }

    // Campo nativo: o setter da prototype + input é o caminho que o React lê.
    if (isTextarea(el)) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, texto);
      else el.value = texto;
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true, cancelable: true, inputType: "insertText", data: texto
      }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(120);
      if (textoDe(el).includes(texto)) return "input";
    }

    // 1. Colar: o Slate trata paste e atualiza o estado interno.
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", texto);
      el.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: dt
      }));
    } catch { /* ClipboardEvent indisponível */ }
    await sleep(220);
    if (textoDe(el).includes(texto)) return "paste";

    // 2. beforeinput: o evento que o Slate escuta para inserir de verdade.
    try {
      el.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, inputType: "insertText", data: texto
      }));
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true, cancelable: true, inputType: "insertText", data: texto
      }));
    } catch { /* InputEvent indisponível */ }
    await sleep(180);
    if (textoDe(el).includes(texto)) return "beforeinput";

    // 3. execCommand: dispara edição nativa no elemento focado.
    try { document.execCommand("insertText", false, texto); } catch { /* ignore */ }
    await sleep(180);
    if (textoDe(el).includes(texto)) return "exec";

    // 4. Último recurso: DOM puro (escreve, mas pode não habilitar o envio).
    try {
      el.textContent = texto;
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true, cancelable: true, inputType: "insertText", data: texto
      }));
    } catch { /* ignore */ }
    await sleep(120);
    return textoDe(el).includes(texto) ? "dom" : null;
  }

  function limpar(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (isTextarea(el)) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, "");
      else el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false, null);
    } catch { /* ignore */ }
    if (textoDe(el)) {
      el.textContent = "";
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true, cancelable: true, inputType: "deleteContentBackward", data: null
      }));
    }
  }

  function acharBotao() {
    const btn = document.querySelector(SEND);
    if (!btn || !btn.isConnected) return null;
    if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return null;
    return btn;
  }

  function clicar(el) {
    for (const [Ctor, tipo] of [
      [PointerEvent, "pointerdown"], [MouseEvent, "mousedown"],
      [PointerEvent, "pointerup"], [MouseEvent, "mouseup"]
    ]) {
      try { el.dispatchEvent(new Ctor(tipo, { bubbles: true, cancelable: true, composed: true })); } catch { /* ignore */ }
    }
    try { el.click(); } catch { /* ignore */ }
  }

  function teclarEnter(el) {
    for (const tipo of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(tipo, {
        key: "Enter", code: "Enter", keyCode: 13, which: 13, charCode: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    }
  }

  // Botão primeiro (é o caminho que o Twitch usa), Enter depois. Só considera
  // enviado quando o campo esvazia de verdade — o mesmo sinal da tela.
  async function enviar(el) {
    const botao = await waitFor(acharBotao, 2500);
    if (botao) {
      clicar(botao);
      if (await waitFor(() => (textoDe(el) ? null : true), 3000)) return "botao";
    }

    teclarEnter(el);
    if (await waitFor(() => (textoDe(el) ? null : true), 2500)) return "enter";

    const reserva = document.querySelector(SEND);
    if (reserva) {
      clicar(reserva);
      if (await waitFor(() => (textoDe(el) ? null : true), 2000)) return "botao-reserva";
    }
    return null;
  }

  async function sendChat(text, { force = false } = {}) {
    const now = Date.now();
    if (!force && lastOk && now - lastOk < COOLDOWN_OK) {
      return { ok: false, reason: "cooldown", retryIn: COOLDOWN_OK - (now - lastOk) };
    }
    if (!force && lastTry && now - lastTry < COOLDOWN_FAIL) {
      return { ok: false, reason: "cooldown", retryIn: COOLDOWN_FAIL - (now - lastTry) };
    }
    if (isLoggedOut()) return { ok: false, reason: "conta deslogada" };

    const el = await waitFor(findInput, 8000);
    if (!el) return { ok: false, reason: "sem campo de chat" };
    if (textoDe(el)) return { ok: false, reason: "você está digitando" };

    const clean = String(text || "$me").trim().slice(0, 200);
    if (!clean) return { ok: false, reason: "texto_vazio" };

    lastTry = Date.now();
    const via = await inserir(el, clean);
    if (!via) return { ok: false, reason: "não consegui escrever no chat" };

    await sleep(160);
    // O usuário assumiu o campo durante a inserção: não atropela.
    if (textoDe(el) !== clean) {
      limpar(el);
      return { ok: false, reason: "você assumiu o campo", via };
    }

    const envio = await enviar(el);
    if (!envio) {
      limpar(el);
      return { ok: false, reason: "texto ficou no campo, envio não saiu", via };
    }

    lastOk = Date.now();
    return { ok: true, at: lastOk, text: clean, via, send: envio, url: location.href };
  }

  // Qualquer tecla dentro da caixa do chat conta como atividade humana.
  document.addEventListener("keydown", (ev) => {
    const el = findInput();
    if (!el) return;
    const alvo = ev.target;
    if (alvo !== el && !el.contains(alvo)) return;
    try {
      chrome.storage.local.set({ [HUMAN_KEY]: Date.now() });
    } catch { /* extensão recarregada */ }
  }, true);

  /* ------------------------------ raid (opt-in) ---------------------------- */
  //
  // A raid do Covil de Vexxaris é anunciada no chat com o código. Este observador
  // só existe quando o jogador liga "entrar em raids sozinho" nas opções; ele lê
  // exclusivamente mensagens do chat em busca de "raid" + um código numérico e
  // não guarda, não envia nem interpreta nenhum outro texto.
  const RAID_RE = /\braid\b[^\d]{0,24}(\d{4,8})|c[óo]digo[^\d]{0,24}(\d{4,8})/i;
  const vistos = new Map();
  let raidOn = false;
  let observer = null;

  function loginDaPagina() {
    const parts = location.pathname.split("/").filter(Boolean).map((p) => p.toLowerCase());
    if (parts[0] === "popout" && parts[1]) return parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }

  function olharMensagem(el) {
    if (!raidOn || !el) return;
    const alvo = el.closest?.('[data-test-selector="chat-line-message"], .chat-line__message') || el;
    const texto = String(alvo.innerText || "").slice(0, 400);
    if (!texto || !/raid/i.test(texto)) return;
    const m = RAID_RE.exec(texto.replace(/\s+/g, " "));
    if (!m) return;
    const code = m[1] || m[2];
    if (!code) return;
    const agora = Date.now();
    for (const [k, t] of vistos) if (agora - t > 10 * 60000) vistos.delete(k);
    if (vistos.has(code)) return;
    vistos.set(code, agora);
    if (vistos.size > 5) vistos.delete(vistos.keys().next().value);
    try {
      chrome.runtime.sendMessage({ type: "RSAF_RAID_CODE", code, login: loginDaPagina() }).catch(() => {});
    } catch { /* extensão recarregada */ }
  }

  function ligarObservador() {
    if (observer || !raidOn) return;
    observer = new MutationObserver((listas) => {
      for (const lista of listas) {
        for (const no of lista.addedNodes) {
          if (no.nodeType !== 1) continue;
          if (no.matches?.('[data-test-selector="chat-line-message"], .chat-line__message')) olharMensagem(no);
          else no.querySelectorAll?.('[data-test-selector="chat-line-message"], .chat-line__message')
            .forEach(olharMensagem);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function aplicarRaid(valor) {
    raidOn = !!valor;
    if (raidOn) ligarObservador();
  }

  try {
    chrome.storage.local.get("rsaf").then((r) => {
      aplicarRaid(r?.rsaf?.settings?.autoPlay?.raid === true);
    }).catch(() => {});
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== "local" || !mudancas.rsaf) return;
      aplicarRaid(mudancas.rsaf.newValue?.settings?.autoPlay?.raid === true);
    });
  } catch { /* extensão recarregada */ }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "RSAF_CHAT_SEND") {
      sendChat(msg.text, { force: msg.force === true })
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, reason: e?.message || "erro" }));
      return true;
    }

    if (msg?.type === "RSAF_CHAT_STATE") {
      sendResponse({
        ok: true,
        keeper: 2,
        url: location.href,
        loggedOut: isLoggedOut(),
        hasInput: !!findInput(),
        idle: !textoDe(findInput()),
        lastOk
      });
      return false;
    }

    return false;
  });
})();
