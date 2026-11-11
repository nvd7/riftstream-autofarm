"use strict";

/*
 * Content script da Twitch.
 *
 * Esta extensão NÃO envia mensagens no chat. Este script apenas:
 *  - foca o campo do chat quando a página é aberta, para você digitar o
 *    comando ($jogar, $me...) e enviar com Enter;
 *  - responde a um "ping" com o estado do chat (logado? campo visível?).
 */

(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findInput() {
    return document.querySelector('[data-a-target="chat-input"]');
  }

  function isLoggedOut() {
    if (document.querySelector('[data-a-target="login-button"]')) return true;
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return dialogs.some((d) =>
      /junte-se hoje|join today|log in|sign in/i.test(d.innerText || "")
    );
  }

  async function waitFor(fn, timeout, interval = 400) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  async function focusInput() {
    const input = await waitFor(findInput, 20000);
    if (!input) return false;
    try { input.focus({ preventScroll: true }); } catch { try { input.focus(); } catch { /* ignore */ } }
    return true;
  }

  // Foca o chat quando a aba está visível (você abriu a live para digitar).
  if (!isLoggedOut()) {
    focusInput().catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "RSAF_FOCUS_CHAT") {
      focusInput()
        .then((ok) => sendResponse({ ok, loggedOut: isLoggedOut() }))
        .catch(() => sendResponse({ ok: false }));
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
