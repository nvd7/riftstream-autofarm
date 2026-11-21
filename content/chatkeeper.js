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

  const INPUT = '[data-a-target="chat-input"]';
  const SEND = '[data-a-target="chat-send-button"]';
  const HUMAN_KEY = "rsafChatHuman";
  const COOLDOWN_OK = 90 * 1000;
  const COOLDOWN_FAIL = 15 * 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastOk = 0;
  let lastTry = 0;

  function findInput() {
    return document.querySelector(INPUT);
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

  function textOf(el) {
    if (!el) return "";
    return String(el.value ?? el.innerText ?? el.textContent ?? "");
  }

  function isTextarea(el) {
    return el && el.tagName === "TEXTAREA";
  }

  function insertText(el, text) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      try { el.focus(); } catch { /* ignore */ }
    }

    if (isTextarea(el)) {
      const proto = HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      try {
        document.execCommand("insertText", false, text);
      } catch { /* ignore */ }
      if (!textOf(el).includes(text)) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", {
          bubbles: true, inputType: "insertText", data: text
        }));
      }
    }
    return textOf(el).includes(text);
  }

  function clearText(el) {
    if (!el) return;
    if (isTextarea(el)) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, "");
      else el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      try { document.execCommand("selectAll", false, null); } catch { /* ignore */ }
      try { document.execCommand("delete", false, null); } catch { /* ignore */ }
    }
  }

  function pressEnter(el) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));
    }
  }

  function clickSend(el) {
    const btn = document.querySelector(SEND);
    if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
      btn.click();
      return true;
    }
    return false;
  }

  async function sendChat(text, { force = false } = {}) {
    const now = Date.now();
    if (!force && lastOk && now - lastOk < COOLDOWN_OK) {
      return { ok: false, reason: "cooldown", retryIn: COOLDOWN_OK - (now - lastOk) };
    }
    if (!force && lastTry && now - lastTry < COOLDOWN_FAIL) {
      return { ok: false, reason: "cooldown", retryIn: COOLDOWN_FAIL - (now - lastTry) };
    }
    if (isLoggedOut()) return { ok: false, reason: "logged_out" };

    const el = await waitFor(findInput, 8000);
    if (!el) return { ok: false, reason: "no_input" };
    if (textOf(el).trim()) return { ok: false, reason: "user_typing" };

    const clean = String(text || "$me").trim().slice(0, 200);
    if (!clean) return { ok: false, reason: "texto_vazio" };
    if (!insertText(el, clean)) return { ok: false, reason: "insert_failed" };

    lastTry = Date.now();
    await sleep(90);

    // Troca de texto com o usuário depois do foco: desiste sem enviar nada.
    if (textOf(el).trim() !== clean) {
      clearText(el);
      return { ok: false, reason: "user_typing" };
    }

    if (!clickSend(el)) pressEnter(el);

    let cleared = await waitFor(() => (textOf(findInput()).trim() ? null : true), 3000);
    if (!cleared) {
      // Segunda tentativa pelo outro caminho: algumas versões do chat ignoram
      // o clique no botão quando ele está coberto por um tooltip.
      pressEnter(el);
      cleared = await waitFor(() => (textOf(findInput()).trim() ? null : true), 2500);
    }

    if (!cleared) {
      clearText(el);
      return { ok: false, reason: "not_sent" };
    }

    lastOk = Date.now();
    return { ok: true, at: lastOk, text: clean, url: location.href };
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
        url: location.href,
        loggedOut: isLoggedOut(),
        hasInput: !!findInput(),
        idle: !textOf(findInput()).trim(),
        lastOk
      });
      return false;
    }

    return false;
  });
})();
