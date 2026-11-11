"use strict";

/*
 * Ponte entre o site do RiftStream e a extensão.
 * O token de login fica em localStorage["og.token"] (mesmo usado pelo site).
 */

function readToken() {
  try {
    return localStorage.getItem("og.token");
  } catch {
    return null;
  }
}

function pushToken() {
  const token = readToken();
  if (!token) return;
  try {
    chrome.runtime.sendMessage({ type: "RSAF_TOKEN", token }).catch(() => {});
  } catch { /* extensão recarregada */ }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RSAF_GET_TOKEN") {
    sendResponse({ token: readToken() });
    return false;
  }
  return false;
});

pushToken();

// O site pode trocar/limpar o token (login/logout). Reenvia quando mudar.
let lastToken = readToken();
window.addEventListener("storage", (ev) => {
  if (ev.key === "og.token") {
    const t = readToken();
    if (t && t !== lastToken) {
      lastToken = t;
      pushToken();
    }
  }
});

// Pequeno polling de segurança (caso o login aconteça via History API).
setInterval(() => {
  const t = readToken();
  if (t && t !== lastToken) {
    lastToken = t;
    pushToken();
  }
}, 5000);
