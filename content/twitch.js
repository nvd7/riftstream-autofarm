"use strict";

/*
 * Content script da Twitch.
 * Recebe comandos da extensão e digita no chat (funciona na live normal e no
 * popout só de chat). Não usa API interna da Twitch: simula o usuário.
 */

(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isLoggedOut() {
    if (document.querySelector('[data-a-target="login-button"]')) return true;
    // O modal "Junte-se hoje à Twitch" aparece quando o chat recusa uma
    // mensagem por falta de sessão. Um botão "Entrar" solto na página não
    // conta, para não bloquear o envio em uma sessão válida.
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.some((d) =>
      /junte-se hoje|join today|entrar|log in|sign in/i.test(d.innerText || "")
    );
  }

  function findInput() {
    return document.querySelector('[data-a-target="chat-input"]');
  }

  async function waitFor(fn, timeout, interval = 350) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function selectContents(input) {
    input.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearInput(input) {
    try {
      selectContents(input);
      document.execCommand("delete", false, null);
    } catch { /* ignore */ }
    if ((input.innerText || "").trim() !== "") {
      try {
        input.textContent = "";
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      } catch { /* ignore */ }
    }
  }

  function typeText(input, text) {
    clearInput(input);
    selectContents(input);
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    if (!ok || !(input.innerText || "").includes(text)) {
      try {
        input.textContent = text;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      } catch { /* ignore */ }
    }
  }

  function pressEnter(input) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      try {
        input.dispatchEvent(new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      } catch { /* ignore */ }
    }
  }

  function collectErrors() {
    const nodes = [
      ...document.querySelectorAll(
        '[role="alert"], .chat-input__alert, [data-a-target="chat-error"], .chat-line__status'
      )
    ];
    return nodes
      .map((e) => (e.innerText || "").trim())
      .filter((t) => t && t.length < 200)
      .slice(-3)
      .join(" | ");
  }

  async function sendChat(text) {
    if (isLoggedOut()) {
      throw new Error("Você não está logado na Twitch. Entre na Twitch neste navegador.");
    }

    const input = await waitFor(findInput, 20000);
    if (!input) {
      throw new Error("Não achei o campo do chat. A live está aberta? O chat está visível?");
    }

    typeText(input, text);
    await sleep(400);

    if (!(input.innerText || "").includes(text)) {
      throw new Error("Não consegui escrever no chat da Twitch.");
    }

    const sendButton = document.querySelector('button[data-a-target="chat-send-button"]');
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    } else {
      pressEnter(input);
    }

    // A Twitch limpa o campo quando a mensagem é aceita.
    const cleared = await waitFor(() => {
      const el = findInput();
      if (!el) return false;
      return (el.innerText || "").trim() === "";
    }, 6000, 250);

    if (!cleared) {
      // Fallback: às vezes o editor some/recarrega, mas a mensagem foi enviada.
      const appeared = await waitFor(() => {
        const lines = document.querySelectorAll(
          '.chat-line__message, [data-a-target="chat-line-message"]'
        );
        for (const line of lines) {
          if ((line.innerText || "").includes(text)) return true;
        }
        return false;
      }, 2500, 250);

      if (!appeared) {
        const details = collectErrors();
        clearInput(input);
        if (isLoggedOut()) {
          throw new Error("Faça login na Twitch para enviar mensagens.");
        }
        throw new Error(details || "A Twitch não aceitou a mensagem (slow mode, só seguidores, etc.).");
      }
    }

    return true;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "RSAF_SEND_CHAT") {
      sendChat(String(msg.text || ""))
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
      return true;
    }
    if (msg?.type === "RSAF_PING") {
      sendResponse({ ok: true, url: location.href, loggedOut: isLoggedOut(), hasInput: !!findInput() });
      return false;
    }
    return false;
  });

  try {
    chrome.runtime.sendMessage({ type: "RSAF_TWITCH_READY", url: location.href }).catch(() => {});
  } catch { /* extensão recarregada */ }
})();
