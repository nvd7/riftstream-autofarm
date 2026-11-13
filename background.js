"use strict";

/* =========================================================================
 * RiftStream AutoFarm — service worker (coordenador)
 * =========================================================================
 * A automação do inventário roda DENTRO da página do jogo (content/engine.js):
 * assim o token é o mesmo do site e o endereço da API é descoberto na página.
 *
 * Aqui ficam apenas as tarefas de bastidor:
 *  - acordar as abas do RiftStream a cada ~30 s para rodar uma rodada;
 *  - buscar as lives online no ranking público;
 *  - abrir o chat/live escolhido (sem enviar mensagem nenhuma);
 *  - manter o badge e o estado que o popup mostra.
 * ========================================================================= */

const API_BASE = "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com";
const SITE_URL = "https://riftstream.com.br";
const KEY = "rsaf";
const LIVES_KEY = "rsafLives";
const STATUS_KEY = "rsafStatus";
const LOG_KEY = "rsafLog";
const TOKEN_KEY = "rsafToken";
const ALARM_NAME = "rsaf_tick";
const RIFT_URLS = ["https://riftstream.com.br/*", "https://www.riftstream.com.br/*"];

const TWITCH_RESERVED = new Set([
  "directory", "downloads", "settings", "subscriptions", "inventory", "wallet",
  "drops", "friends", "search", "videos", "jobs", "turbo", "prime", "store",
  "following", "about", "security", "activate", "login", "signup", "onboarding",
  "collections", "schedule", "p", "gift-cards", "legal", "creatorcamp", "polls"
]);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------- storage -------------------------------- */

async function get(key, fallback) {
  try {
    const r = await chrome.storage.local.get(key);
    return r[key] ?? fallback;
  } catch {
    return fallback;
  }
}

async function set(obj) {
  try { await chrome.storage.local.set(obj); } catch { /* ignore */ }
}

async function loadCfg() {
  const cfg = await get(KEY, {});
  return {
    running: cfg.running === true,
    settings: cfg.settings || {}
  };
}

async function loadLives() {
  return await get(LIVES_KEY, { candidates: [], scanAt: 0, scanError: null, current: null });
}

async function saveLives(data) {
  await set({ [LIVES_KEY]: data });
}

async function addLog(msg, level = "info") {
  const log = await get(LOG_KEY, []);
  log.unshift({ t: Date.now(), msg: String(msg).slice(0, 300), level });
  await set({ [LOG_KEY]: log.slice(0, 60) });
}

/* --------------------------------- badge --------------------------------- */

async function syncBadge() {
  const cfg = await loadCfg();
  const text = cfg.running ? "ON" : "";
  const color = "#35c96f";
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setTitle({
      title: `RiftStream AutoFarm — ${cfg.running ? "ligado" : "parado"}`
    });
  } catch { /* ignore */ }
}

async function syncAlarm() {
  const cfg = await loadCfg();
  try {
    if (cfg.running) {
      const atual = await chrome.alarms.get(ALARM_NAME);
      if (!atual) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
    } else {
      await chrome.alarms.clear(ALARM_NAME);
    }
  } catch { /* ignore */ }
}

/* ------------------------------- abas do jogo ---------------------------- */

async function gameTabs() {
  try {
    return await chrome.tabs.query({ url: RIFT_URLS });
  } catch {
    return [];
  }
}

async function acordarAbas(force = false) {
  const tabs = await gameTabs();
  let enviados = 0;
  for (const tab of tabs) {
    if (!tab.id) continue;
    try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch { /* ignore */ }
    if (tab.discarded) {
      try { await chrome.tabs.reload(tab.id); } catch { /* ignore */ }
      continue;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { rodada: true, forcar: force });
      enviados++;
    } catch { /* content script ainda carregando */ }
  }
  return { tabs: tabs.length, enviados };
}

/* ------------------------------ ranking/lives ---------------------------- */

function publicApi(path) {
  return fetch(API_BASE + path, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

function scoreChannel(c, strategy) {
  const z = Math.max(0, num(c.zone, 0));
  const w = Math.max(0, num(c.wave, 0));
  const p = Math.max(0, num(c.playersNow, 0));
  if (strategy === "players") return p * 1000 + z * 100 + w;
  if (strategy === "balanced") return (z * 100 + w) * 10 + Math.min(p, 250) * 3 + Math.log1p(p) * 40;
  return z * 1000 + w * 10 + Math.log1p(p) * 50;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); } catch { out[i] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

function twitchLoginFromUrl(url) {
  try {
    const u = new URL(String(url || ""));
    if (!/(^|\.)twitch\.tv$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
    if (!parts.length) return null;
    if (parts[0] === "popout" && parts[1]) return TWITCH_RESERVED.has(parts[1]) ? null : parts[1];
    if (parts.length === 1) return TWITCH_RESERVED.has(parts[0]) ? null : parts[0];
  } catch { /* ignore */ }
  return null;
}

async function openTwitchLogins() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ["https://www.twitch.tv/*", "https://twitch.tv/*"] });
  } catch { return []; }
  const out = new Map();
  for (const t of tabs) {
    const login = twitchLoginFromUrl(t.url);
    if (login && !out.has(login)) out.set(login, t.id ?? null);
  }
  return [...out.keys()].map((login) => ({ login }));
}

async function scanChannels({ force = false } = {}) {
  const cfg = await loadCfg();
  const estratégia = cfg.settings.strategy || "zone";
  const minPlayers = num(cfg.settings.minPlayers, 3);
  const lives = await loadLives();
  const now = Date.now();
  if (!force && lives.candidates?.length && now - num(lives.scanAt, 0) < 60000) {
    return lives.candidates;
  }

  const problems = [];
  const getList = (path) =>
    publicApi(path).catch((e) => {
      problems.push(`${path}: ${e.message}`);
      return { items: [] };
    });

  const [runs, crowds] = await Promise.all([
    getList("/api/ranking/runs?page=1&size=40&online=true"),
    getList("/api/ranking/crowds?page=1&size=40&online=true")
  ]);

  const map = new Map();
  const pick = (items, limit) =>
    (items || [])
      .filter((x) => x?.login && x.online && num(x.playersNow, 0) >= minPlayers)
      .slice(0, limit);

  let picked = [...pick(runs?.items, 12), ...pick(crowds?.items, 6)];
  if (!picked.length) {
    picked = [
      ...(runs?.items || []).filter((x) => x?.login && x.online).slice(0, 12),
      ...(crowds?.items || []).filter((x) => x?.login && x.online).slice(0, 6)
    ];
  }
  for (const item of picked) map.set(item.login, item);

  const details = await mapLimit([...map.values()], 6, async (item) => {
    try {
      const d = await publicApi(`/api/ranking/channel/${encodeURIComponent(item.login)}`);
      if (!d?.login) return null;
      const login = d.twitchLogin || (String(d.login).startsWith("kick:") ? null : d.login);
      if (!login) return null;
      if (!d.live && !d.online) return null;
      const c = {
        login: String(login).toLowerCase(),
        name: d.displayName || item.name || login,
        zone: num(d.zone, 0),
        wave: num(d.wave, 0),
        // O detalhe do canal limita playersNow a 60; o ranking público traz o
        // número real (até 250). Fica com o maior para não mostrar 60 em live cheia.
        playersNow: Math.max(num(item.playersNow, 0), num(d.playersNow, 0)),
        live: !!d.live,
        online: !!d.online,
        open: false
      };
      c.score = scoreChannel(c, estratégia);
      return c;
    } catch (e) {
      problems.push(`${item.login}: ${e.message}`);
      return null;
    }
  });

  const list = details.filter(Boolean);

  // Inclui as lives que o usuário já tem abertas na Twitch.
  for (const item of await openTwitchLogins()) {
    const found = list.find((c) => c.login === item.login);
    if (found) {
      found.open = true;
      continue;
    }
    let d = null;
    try { d = await publicApi(`/api/ranking/channel/${encodeURIComponent(item.login)}`); } catch { /* ignore */ }
    if (d?.login && !d.twitchLogin && String(d.login).startsWith("kick:")) continue;
    const c = {
      login: item.login,
      name: d?.displayName || item.login,
      zone: num(d?.zone, 0),
      wave: num(d?.wave, 0),
      playersNow: Math.max(num(d?.playersNow, 0), 0),
      live: d ? !!d.live : true,
      online: d ? !!d.online : true,
      open: true
    };
    c.score = scoreChannel(c, estratégia);
    list.push(c);
  }

  const sorted = list.slice().sort((a, b) => b.score - a.score);
  const finalList = [...sorted.filter((c) => c.open), ...sorted.filter((c) => !c.open)];

  let scanError = null;
  if (!finalList.length) {
    if (!problems.length) {
      scanError = "O ranking não retornou nenhuma live online agora.";
    } else if (problems.some((p) => /503|502|504|429|Service Unavailable|Failed to fetch|NetworkError|indisponível/i.test(p))) {
      scanError = "O RiftStream está indisponível agora. Espere alguns segundos e clique em “Procurar lives” de novo.";
    } else {
      scanError = `Não consegui consultar o ranking: ${problems[0]}`;
    }
  }

  await saveLives({
    ...lives,
    candidates: finalList.slice(0, 8),
    scanAt: Date.now(),
    scanError
  });
  return finalList.slice(0, 8);
}

/* ------------------------------ abrir canal ------------------------------ */

function channelUrl(login, chatOnly) {
  return chatOnly
    ? `https://www.twitch.tv/popout/${encodeURIComponent(login)}/chat?popout=`
    : `https://www.twitch.tv/${encodeURIComponent(login)}`;
}

async function getTab(tabId) {
  if (!tabId) return null;
  try { return await chrome.tabs.get(tabId); } catch { return null; }
}

async function openChannel(login) {
  const cfg = await loadCfg();
  const clean = String(login || "").trim().replace(/^kick:/i, "").toLowerCase();
  if (!clean) throw new Error("Canal inválido.");

  const lives = await loadLives();
  const chatOnly = cfg.settings.chatOnly !== false;
  const url = channelUrl(clean, chatOnly);

  let tabId = lives.current?.tabId || null;
  if (!(await getTab(tabId))) tabId = null;

  if (tabId) {
    await chrome.tabs.update(tabId, { url, active: true });
  } else {
    const created = await chrome.tabs.create({ url, active: true });
    tabId = created.id;
  }

  try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch { /* ignore */ }
  if (cfg.settings.muteTab !== false) {
    try { await chrome.tabs.update(tabId, { muted: true }); } catch { /* ignore */ }
  }

  await saveLives({ ...lives, current: { login: clean, tabId, openedAt: Date.now() } });
  await addLog(`Abrindo ${chatOnly ? "chat" : "live"} de ${clean}. Envie o comando no chat.`, "ok");
  return { login: clean, tabId, openedAt: Date.now() };
}

/* ------------------------------- mensagens ------------------------------- */

async function publicState() {
  const [cfg, lives, status, log, token] = await Promise.all([
    loadCfg(),
    loadLives(),
    get(STATUS_KEY, {}),
    get(LOG_KEY, []),
    get(TOKEN_KEY, null)
  ]);
  return {
    running: cfg.running,
    hasToken: !!token,
    settings: cfg.settings,
    current: lives.current,
    runtime: {
      status: cfg.running ? "ativo" : "parado",
      scanAt: lives.scanAt,
      scanError: lives.scanError,
      candidates: lives.candidates || [],
      character: status.character || null
    },
    status,
    log
  };
}

async function setRunning(running) {
  const cfg = await loadCfg();
  cfg.running = !!running;
  await set({ [KEY]: cfg });
  await syncAlarm();
  await syncBadge();
  await addLog(running ? "Farm automático ligado." : "Farm automático pausado.", running ? "ok" : "info");
  if (running) await acordarAbas();
}

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case "RSAF_GET_STATE":
      return publicState();

    case "RSAF_SET_RUNNING":
      await setRunning(msg.running);
      return publicState();

    case "RSAF_SCAN": {
      let list = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        list = await scanChannels({ force: true });
        if (list.length) break;
        const lives = await loadLives();
        if (!/indisponível/i.test(lives.scanError || "")) break;
        if (attempt < 3) await delay(800 + attempt * 400);
      }
      if (list.length) {
        await addLog(`Busca de lives: ${plural(list.length, "live encontrada", "lives encontradas")}.`);
      } else {
        const lives = await loadLives();
        await addLog(lives.scanError || "Nenhuma live encontrada.", "warn");
      }
      return publicState();
    }

    case "RSAF_OPEN_CHANNEL":
      await openChannel(msg.login);
      return publicState();

    case "RSAF_MAINTENANCE": {
      const r = await acordarAbas(true);
      await addLog(r.enviados
        ? "Rodada enviada para a aba do jogo."
        : "Abra riftstream.com.br numa aba para a rodada acontecer.", r.enviados ? "ok" : "warn");
      return { ...(await publicState()), dispatched: r.enviados };
    }

    case "RSAF_OPEN_SITE": {
      const tabs = await gameTabs();
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        await chrome.tabs.create({ url: `${SITE_URL}/character`, active: true });
      }
      return { ok: true };
    }

    case "RSAF_OPEN_PANEL": {
      const tabs = await gameTabs();
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        try { await chrome.tabs.sendMessage(tabs[0].id, { abrirPainel: true }); } catch { /* recarregando */ }
        return { ok: true };
      }
      const created = await chrome.tabs.create({ url: `${SITE_URL}/character`, active: true });
      const tabId = created.id;
      const ouvir = (id, info) => {
        if (id !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(ouvir);
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { abrirPainel: true }).catch(() => {});
        }, 1200);
      };
      chrome.tabs.onUpdated.addListener(ouvir);
      return { ok: true };
    }

    case "RSAF_OPEN_LIVE": {
      const lives = await loadLives();
      const login = lives.current?.login;
      const url = login ? `https://www.twitch.tv/${encodeURIComponent(login)}` : "https://www.twitch.tv/";
      await chrome.tabs.create({ url, active: true });
      return { ok: true };
    }

    case "RSAF_CLEAR_LOG":
      await set({ [LOG_KEY]: [] });
      return publicState();

    default:
      throw new Error("Comando desconhecido.");
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "RSAF_TOKEN") {
    const url = sender?.tab?.url || "";
    if (!url.includes("riftstream.com.br") || !msg.token) {
      sendResponse({ ok: false });
      return false;
    }
    set({ [TOKEN_KEY]: msg.token }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "RSAF_TWITCH_READY") {
    sendResponse({ ok: true });
    return false;
  }

  if (!msg.type.startsWith("RSAF_")) return false;

  handleMessage(msg, sender)
    .then((res) => sendResponse(res))
    .catch((e) => sendResponse({ error: e?.message || String(e) }));

  return true;
});

/* ------------------------------- ciclo de vida --------------------------- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const cfg = await loadCfg();
  if (!cfg.running) return;
  await acordarAbas();
  await syncBadge();
});

chrome.storage.onChanged.addListener((m) => {
  if (m[KEY]) {
    syncBadge();
    syncAlarm();
  }
});

async function boot() {
  await syncBadge();
  await syncAlarm();
  await addLog("Extensão atualizada. Abra o site e use o painel ◆ no canto.", "info");
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
