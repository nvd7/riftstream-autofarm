"use strict";

/* =========================================================================
 * RiftStream AutoFarm — service worker
 * =========================================================================
 * O jogo roda no chat da Twitch. Esta extensão NÃO envia mensagens no chat:
 *  - lista as lives online do ranking público quando você pede;
 *  - abre o chat/live que você escolher, para você digitar o comando;
 *  - usa a API do site para equipar itens melhores, subir gemas, forjar etc.
 *
 * Aviso: automação viola os Termos do RiftStream e possivelmente os da Twitch.
 * Use por sua conta e risco.
 * ========================================================================= */

const API_BASE = "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com";
const SITE_URL = "https://riftstream.com.br";
const STORAGE_KEY = "rsaf_state_v1";
const ALARM_NAME = "rsaf_tick";
const EQUIP_SLOTS = ["weapon", "helmet", "armor", "ring"];
const GEM_TYPES = ["ruby", "sapphire", "topaz", "emerald", "amethyst"];
const RARITY = ["Comum", "Incomum", "Raro", "Épico", "Lendário", "Evento", "Imortal", "Arcano"];

/* Regras da forja do próprio site (forjar NÃO é VIP; "fundir tudo" é que é). */
const FORGE_SLOTS = ["ring", "weapon", "helmet", "armor"];
const FORGE_COST_FACTOR = [1, 1.35, 1.8, 2.5, 4, 3, 7, 11];
const ENHANCE_MAX_DONORS = 10;

/* "Gastar ouro": níveis de atributo (POST /api/me/character/stats/{chave}). */
const STAT_LABELS = { str: "Força", vit: "Vitalidade", def: "Defesa", agi: "Agilidade", luk: "Sorte" };
const STAT_ORDER = ["luk", "str", "vit", "def", "agi"];

/* Páginas da Twitch que não são canais. */
const TWITCH_RESERVED = new Set([
  "directory", "downloads", "settings", "subscriptions", "inventory", "wallet",
  "drops", "friends", "search", "videos", "jobs", "turbo", "prime", "store",
  "following", "about", "security", "activate", "login", "signup", "onboarding",
  "collections", "schedule", "p", "gift-cards", "legal", "creatorcamp", "polls"
]);

const DEFAULT_SETTINGS = {
  strategy: "zone",          // zone | players | balanced
  maintenanceMin: 5,         // 2..60
  minPlayers: 3,             // filtro da lista de lives
  goldReserve: 50000,
  sellRarity: 2,
  sellLevel: 40,
  autoStats: true,           // gasta ouro subindo atributos
  statPriority: "balanced",  // balanced | str | vit | def | agi | luk
  autoEquip: true,
  autoGems: true,
  autoForge: false,          // destrutivo: desligado por padrão
  autoEnhance: false,        // destrutivo: desligado por padrão
  autoSocket: false,
  autoOrganize: true,
  autoSell: false,
  chatOnly: true,            // abrir só o chat (popout) por padrão
  muteTab: true
};

const DEFAULT_TIMERS = {
  lastMaintenance: 0,
  lastStats: 0,
  lastForge: 0,
  lastEnhance: 0,
  lastGems: 0,
  lastOrganize: 0,
  lastOrganizedAt: 0,
  lastEquipSig: "",
  autosellCfg: ""
};

const DEFAULT_RUNTIME = {
  status: "parado",
  lastError: null,
  lastAction: "",
  character: null,
  candidates: [],
  scanAt: 0,
  scanError: null,
  awaitingCharacter: false,
  lastTransient: 0,
  forgeNoteAt: 0,
  enhanceNoteAt: 0,
  autosellDisabled: false
};

const DEFAULT_STATE = {
  running: false,            // manutenção automática do inventário
  token: null,
  settings: { ...DEFAULT_SETTINGS },
  meta: { settingsVersion: 2 }, // migrações de configuração
  current: null,             // { login, tabId, openedAt }
  timers: { ...DEFAULT_TIMERS },
  runtime: { ...DEFAULT_RUNTIME },
  log: []
};

let memory = null;
let tickBusy = false;

/* ------------------------------- utilidades ------------------------------ */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plural = (n, one, many) => `${num(n, 0)} ${num(n, 0) === 1 ? one : many}`;
const bool = (v, fallback) => (v === undefined ? fallback : !!v);

function normalizeSettings(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = {
    strategy: ["zone", "players", "balanced"].includes(r.strategy) ? r.strategy : "zone",
    maintenanceMin: clamp(num(r.maintenanceMin, 5), 2, 60),
    minPlayers: clamp(num(r.minPlayers, 3), 1, 500),
    goldReserve: clamp(num(r.goldReserve, 50000), 0, 1000000000),
    sellRarity: clamp(num(r.sellRarity, 2), -1, 3),
    sellLevel: clamp(num(r.sellLevel, 40), 0, 9999),
    statPriority: ["balanced", "str", "vit", "def", "agi", "luk"].includes(r.statPriority) ? r.statPriority : "balanced",
    chatOnly: bool(r.chatOnly, true),
    muteTab: bool(r.muteTab, true)
  };
  for (const k of ["autoStats", "autoEquip", "autoGems", "autoForge", "autoEnhance", "autoSocket", "autoOrganize", "autoSell"]) {
    s[k] = bool(r[k], DEFAULT_SETTINGS[k]);
  }
  return s;
}

function normalizeState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const meta = r.meta && typeof r.meta === "object" ? { ...r.meta } : {};
  const settings = normalizeSettings(r.settings);
  // v1.1 -> v1.2: as funções destrutivas passam a existir e devem começar
  // desligadas, mesmo que a configuração antiga tivesse autoForge = true.
  if (num(meta.settingsVersion, 1) < 2) {
    settings.autoForge = false;
    settings.autoEnhance = false;
    meta.settingsVersion = 2;
  }
  const current = r.current && typeof r.current === "object"
    ? {
        login: r.current.login || null,
        tabId: r.current.tabId ?? null,
        openedAt: r.current.openedAt ?? r.current.since ?? 0
      }
    : null;
  return {
    ...DEFAULT_STATE,
    ...r,
    meta,
    settings,
    current,
    timers: { ...DEFAULT_TIMERS, ...(r.timers || {}) },
    runtime: { ...DEFAULT_RUNTIME, ...(r.runtime || {}) },
    log: Array.isArray(r.log) ? r.log.slice(0, 80) : []
  };
}

async function loadState() {
  if (!memory) {
    const got = await chrome.storage.local.get(STORAGE_KEY);
    memory = normalizeState(got[STORAGE_KEY]);
  }
  return memory;
}

async function saveState() {
  if (memory) {
    try { await chrome.storage.local.set({ [STORAGE_KEY]: memory }); } catch { /* ignore */ }
  }
}

function log(state, msg, level = "info") {
  state.log.unshift({ t: Date.now(), msg: String(msg).slice(0, 300), level });
  state.log = state.log.slice(0, 80);
}

function publicState(state) {
  return {
    running: state.running,
    hasToken: !!state.token,
    settings: state.settings,
    current: state.current,
    runtime: state.runtime,
    log: state.log.slice(0, 50)
  };
}

/* --------------------------------- API ---------------------------------- */

class ApiError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
  }
}

/* O RiftStream responde 503 "Service Unavailable" de forma intermitente; na
 * prática, insistir resolve. As leituras (GET) são repetidas com um pequeno
 * intervalo. Escritas (POST/PUT) NÃO são repetidas para não duplicar efeitos. */
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransient(e) {
  if (e instanceof ApiError) return RETRY_STATUS.has(e.status);
  return e instanceof TypeError; // falha de rede do fetch
}

function retryDelay(attempt, retryAfter) {
  const after = num(retryAfter, 0);
  if (after > 0) return Math.min(after * 1000, 3000);
  return Math.min(200 * 2 ** attempt, 1200) + Math.floor(Math.random() * 120);
}

function errText(e, fallback = "falha na API") {
  if (isTransient(e)) return "RiftStream indisponível agora";
  return e?.message || fallback;
}

async function rawApi(path, { method = "GET", body, token, retries } = {}) {
  const attempts = Math.max(1, retries === undefined ? (method === "GET" ? 4 : 1) : num(retries, 1));
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store"
      });
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = await res.json();
          msg = j.message ?? j.title ?? j.error ?? msg;
        } catch { /* ignore */ }
        const err = new ApiError(res.status, msg || `HTTP ${res.status}`);
        if (RETRY_STATUS.has(res.status) && attempt < attempts - 1) {
          lastErr = err;
          await delay(retryDelay(attempt, res.headers.get("retry-after")));
          continue;
        }
        throw err;
      }
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      lastErr = e;
      if (attempt < attempts - 1) {
        await delay(retryDelay(attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Falha de rede.");
}

async function api(state, path, opts = {}) {
  if (!state.token) throw new Error("Sem login. Abra riftstream.com.br e entre com a Twitch.");
  try {
    return await rawApi(path, { ...opts, token: state.token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      state.token = null;
      await saveState();
      throw new Error("Sessão expirada. Abra riftstream.com.br e entre de novo.");
    }
    throw e;
  }
}

const publicApi = (path) => rawApi(path, {});

/* -------------------------------- token --------------------------------- */

async function tokenFromOpenTab() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ["https://riftstream.com.br/*"] }); } catch { return null; }
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "RSAF_GET_TOKEN" });
      if (res?.token) return res.token;
    } catch { /* content script ainda não injetado */ }
  }
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try { return localStorage.getItem("og.token"); } catch { return null; }
        }
      });
      if (r?.result) return r.result;
    } catch { /* ignore */ }
  }
  return null;
}

async function ensureToken(state, force = false) {
  if (state.token && !force) return state.token;
  const token = await tokenFromOpenTab();
  if (!token) {
    throw new Error("Abra riftstream.com.br, entre com a Twitch e clique em Ativar de novo.");
  }
  state.token = token;
  await saveState();
  return token;
}

/* ------------------------------ personagem ------------------------------ */

function summarizeCharacter(ch) {
  if (!ch) return null;
  const cc = ch.currentChannel || null;
  return {
    name: ch.name || ch.displayName || "",
    cls: ch.cls || "",
    level: ch.level ?? 0,
    power: ch.power ?? 0,
    gold: ch.gold ?? 0,
    xp: ch.xp ?? ch.exp ?? 0,
    xpToNext: ch.expToNext ?? ch.xpToNext ?? 0,
    items: Array.isArray(ch.items) ? ch.items.length : 0,
    gems: Array.isArray(ch.gems) ? ch.gems.reduce((a, g) => a + (g.count || 0), 0) : 0,
    reviveIn: ch.reviveIn ?? 0,
    statLevels: ch.statLevels || null,
    statCosts: ch.statCosts || null,
    lukCap: ch.lukCap ?? 100,
    afk: isAfk(ch),
    afkMinutes: ch.afkMinutes ?? 30,
    lastActiveAt: ch.lastActiveAt || null,
    channel: cc
      ? {
          login: cc.login,
          name: cc.displayName || cc.login,
          zone: cc.zone ?? 0,
          wave: cc.wave ?? 0,
          lastActiveAt: cc.lastActiveAt || cc.lastReportAt || null,
          afkMinutes: cc.afkMinutes ?? ch.afkMinutes ?? 30
        }
      : null
  };
}

function isAfk(ch) {
  if (!ch?.currentChannel) return false;
  const stamp = ch.lastActiveAt || ch.currentChannel.lastActiveAt || ch.currentChannel.lastReportAt;
  if (!stamp) return false;
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return false;
  const minutes = ch.afkMinutes ?? ch.currentChannel.afkMinutes ?? 30;
  return Date.now() - t > minutes * 60000;
}

async function getCharacter(state) {
  const ch = await api(state, "/api/me/character");
  state.runtime.character = summarizeCharacter(ch);
  return ch;
}

async function getCharacterSafe(state) {
  try {
    return await getCharacter(state);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      state.runtime.character = null;
      return null;
    }
    throw e;
  }
}

/* --------------------------------- tabs --------------------------------- */

async function getTab(tabId) {
  if (!tabId) return null;
  try { return await chrome.tabs.get(tabId); } catch { return null; }
}

function urlMatchesLogin(url, login) {
  const u = String(url || "").toLowerCase();
  const l = String(login || "").toLowerCase();
  if (!l) return false;
  return u.includes(`/popout/${l}/chat`) || new RegExp(`twitch\\.tv/${esc(l)}(/|\\?|$)`).test(u);
}

function channelUrl(login, chatOnly) {
  return chatOnly
    ? `https://www.twitch.tv/popout/${encodeURIComponent(login)}/chat?popout=`
    : `https://www.twitch.tv/${encodeURIComponent(login)}`;
}

/* Abre o chat/live do canal escolhido. Não envia nenhuma mensagem: o usuário
 * digita o comando no chat. */
async function openChannel(state, login, { active = true, reason = "" } = {}) {
  const clean = String(login || "").trim().replace(/^kick:/i, "").toLowerCase();
  if (!clean) throw new Error("Canal inválido.");

  const url = channelUrl(clean, state.settings.chatOnly);

  let tabId = state.current?.tabId || null;
  const existing = await getTab(tabId);
  if (!existing) tabId = null;

  if (tabId) {
    await chrome.tabs.update(tabId, { url, active });
  } else {
    const created = await chrome.tabs.create({ url, active });
    tabId = created.id;
  }

  state.current = { login: clean, tabId, openedAt: Date.now() };
  try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch { /* ignore */ }
  if (state.settings.muteTab) {
    try { await chrome.tabs.update(tabId, { muted: true }); } catch { /* ignore */ }
  }

  const where = state.settings.chatOnly ? "chat" : "live";
  log(state, `Abrindo ${where} de ${clean}${reason ? ` (${reason})` : ""}. Envie o comando no chat.`, "ok");
  await saveState();
  return state.current;
}

/* ------------------------------ ranking/lives --------------------------- */

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

async function scanChannels(state, { force = false } = {}) {
  const s = state.settings;
  const now = Date.now();
  if (!force && state.runtime.candidates?.length && now - num(state.runtime.scanAt, 0) < 60000) {
    return state.runtime.candidates;
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
      .filter((x) => x?.login && x.online && num(x.playersNow, 0) >= s.minPlayers)
      .slice(0, limit);

  let picked = [...pick(runs?.items, 12), ...pick(crowds?.items, 6)];
  if (!picked.length) {
    // Se ninguém atingiu o mínimo, não deixa a lista vazia.
    picked = [
      ...(runs?.items || []).filter((x) => x?.login && x.online).slice(0, 12),
      ...(crowds?.items || []).filter((x) => x?.login && x.online).slice(0, 6)
    ];
  }
  for (const item of picked) map.set(item.login, item);

  const base = [...map.values()];
  const details = await mapLimit(base, 6, async (item) => {
    try {
      const d = await publicApi(`/api/ranking/channel/${encodeURIComponent(item.login)}`);
      if (!d?.login) return null;
      const login = d.twitchLogin || (String(d.login).startsWith("kick:") ? null : d.login);
      if (!login) return null; // canal só da Kick
      if (!d.live && !d.online) return null;
      const c = {
        login: String(login).toLowerCase(),
        name: d.displayName || item.name || login,
        zone: num(d.zone, 0),
        wave: num(d.wave, 0),
        playersNow: num(d.playersNow, 0),
        live: !!d.live,
        online: !!d.online,
        open: false,
        score: 0
      };
      c.score = scoreChannel(c, s.strategy);
      return c;
    } catch (e) {
      problems.push(`${item.login}: ${e.message}`);
      return null;
    }
  });

  const list = details.filter(Boolean);

  // Inclui as lives que o usuário já tem abertas na Twitch.
  const open = await openTwitchLogins();
  for (const item of open) {
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
      playersNow: num(d?.playersNow, 0),
      live: d ? !!d.live : true,
      online: d ? !!d.online : true,
      open: true,
      score: 0
    };
    c.score = scoreChannel(c, s.strategy);
    list.push(c);
  }

  const sorted = list.slice().sort((a, b) => b.score - a.score);
  const finalList = [...sorted.filter((c) => c.open), ...sorted.filter((c) => !c.open)];

  state.runtime.candidates = finalList.slice(0, 8);
  state.runtime.scanAt = Date.now();
  if (state.runtime.candidates.length) {
    state.runtime.scanError = null;
  } else if (!problems.length) {
    state.runtime.scanError = "O ranking não retornou nenhuma live online agora.";
  } else if (problems.some((p) => /503|502|504|429|Service Unavailable|Failed to fetch|NetworkError|indisponível/i.test(p))) {
    state.runtime.scanError = "O RiftStream está indisponível agora. Espere alguns segundos e clique em “Procurar lives” de novo.";
  } else {
    state.runtime.scanError = `Não consegui consultar o ranking: ${problems[0]}`;
  }

  return state.runtime.candidates;
}

/* ------------------------------- manutenção ----------------------------- */

/* ---- Gastar ouro (atributos) ------------------------------------------ */

function nextStat(ch, priority) {
  const levels = ch.statLevels || {};
  const costs = ch.statCosts || {};
  const lukCap = num(ch.lukCap, 100);

  let keys = STAT_ORDER.filter((k) => !(k === "luk" && num(levels[k], 0) >= lukCap));
  keys = keys.filter((k) => num(costs[k], -1) >= 0);
  if (!keys.length) return null;

  if (priority && priority !== "balanced" && keys.includes(priority)) return priority;
  // Equilibrado: sempre o atributo mais barato no momento.
  keys.sort((a, b) => num(costs[a], 0) - num(costs[b], 0));
  return keys[0];
}

async function autoStats(state, ch) {
  const now = Date.now();
  if (now - num(state.timers.lastStats, 0) < 5 * 60000) return 0;
  if (!ch.statCosts || !ch.statLevels) return 0;
  state.timers.lastStats = now;

  const reserve = state.settings.goldReserve;
  const priority = state.settings.statPriority;
  let gold = num(ch.gold, 0);
  let done = 0;

  for (let i = 0; i < 40; i++) {
    const stat = nextStat(ch, priority);
    if (!stat) break;
    const cost = num(ch.statCosts?.[stat], 0);
    if (!cost || gold - cost < reserve) break;

    try {
      const res = await api(state, `/api/me/character/stats/${stat}`, {
        method: "POST",
        body: { amount: 1 }
      });
      const next = res?.character || res;
      if (next && next.statLevels) {
        ch = next;
        state.runtime.character = summarizeCharacter(ch);
        gold = num(ch.gold, gold - cost);
      } else {
        gold -= cost;
        ch.statLevels[stat] = num(ch.statLevels[stat], 0) + 1;
        // estima o próximo custo para não repetir um valor velho
        ch.statCosts[stat] = Math.round(cost * 1.12);
      }
      done++;
    } catch (e) {
      log(state, `Atributos: ${errText(e)}`, "warn");
      break;
    }
  }

  if (done > 0) {
    const where = priority === "balanced" ? "equilibrado" : STAT_LABELS[priority];
    log(state, `Gastou ouro: ${plural(done, "nível de atributo", "níveis de atributo")} (${where}).`, "ok");
  }
  return done;
}

function invSignature(ch) {
  const ids = (ch?.items || []).map((i) => String(i.id || "")).sort();
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return `${ids.length}:${(h >>> 0).toString(36)}`;
}

async function autoEquip(state, ch) {
  const sig = invSignature(ch);
  if (sig === state.timers.lastEquipSig) return 0;

  const bySlot = {};
  for (const it of ch.items || []) {
    if (!it || it.equipped) continue;
    if (!EQUIP_SLOTS.includes(it.slot)) continue;
    if (it.classReq && it.classReq !== ch.cls) continue;
    (bySlot[it.slot] ||= []).push(it);
  }

  let power = num(ch.power, 0);
  let changed = 0;

  for (const slot of EQUIP_SLOTS) {
    const list = (bySlot[slot] || [])
      .slice()
      .sort((a, b) =>
        (num(b.itemLevel, 0) + num(b.rarity, 0) * 8) -
        (num(a.itemLevel, 0) + num(a.rarity, 0) * 8)
      )
      .slice(0, 5);

    for (const it of list) {
      try {
        const cmp = await api(state, `/api/me/items/${encodeURIComponent(it.id)}/compare`);
        if (cmp && num(cmp.newPower, 0) > num(cmp.power, power)) {
          await api(state, `/api/me/items/${encodeURIComponent(it.id)}/equip`, { method: "POST" });
          power = num(cmp.newPower, power);
          changed++;
          log(state, `Equipado: ${it.name || it.id} (+${(num(cmp.newPower, 0) - num(cmp.power, 0)).toLocaleString("pt-BR")} FC).`, "ok");
        }
      } catch { /* item não equipável / comparação indisponível */ }
    }
  }

  state.timers.lastEquipSig = sig;
  return changed;
}

async function autoGems(state, ch) {
  const now = Date.now();
  if (now - num(state.timers.lastGems, 0) < 8 * 60000) return 0;
  state.timers.lastGems = now;

  const preview = await api(state, "/api/me/gems/combine-all");
  if (!preview || num(preview.merges, 0) === 0) return 0;
  if (preview.canAfford === false) {
    log(state, `Gemas: ${plural(preview.merges, "combinação possível", "combinações possíveis")}, mas falta ouro (${num(preview.cost, 0).toLocaleString("pt-BR")}g).`, "warn");
    return 0;
  }
  const res = await api(state, "/api/me/gems/combine-all", { method: "POST" });
  const merges = num(res?.merges ?? preview.merges, 0);
  if (merges > 0) {
    log(state, `Gemas: ${plural(merges, "combinação", "combinações")} por ${num(res?.cost ?? preview.cost, 0).toLocaleString("pt-BR")}g.`, "ok");
  }
  return merges;
}

function pickGem(gems, cls) {
  const prio = {
    warrior: ["ruby", "topaz", "amethyst", "sapphire", "emerald"],
    cleric: ["emerald", "sapphire", "amethyst", "ruby", "topaz"],
    archer: ["topaz", "ruby", "sapphire", "amethyst", "emerald"]
  }[cls] || GEM_TYPES;

  const avail = (gems || [])
    .filter((g) => g && GEM_TYPES.includes(g.type) && num(g.count, 0) > 0 && num(g.tier, 1) >= 2)
    .slice();

  avail.sort((a, b) => {
    const dt = num(b.tier, 1) - num(a.tier, 1);
    if (dt) return dt;
    return prio.indexOf(a.type) - prio.indexOf(b.type);
  });
  return avail[0] || null;
}

async function autoSocket(state, ch) {
  if (num(ch.gold, 0) <= state.settings.goldReserve) return 0;
  const gems = (ch.gems || []).map((g) => ({ ...g }));
  if (!gems.length) return 0;

  const equipped = (ch.items || []).filter((it) =>
    it.equipped && EQUIP_SLOTS.includes(it.slot) && num(it.itemLevel, 0) >= 20 &&
    num(it.sockets, 0) > (it.gems?.length || 0)
  );

  let done = 0;
  for (const item of equipped) {
    let free = num(item.sockets, 0) - (item.gems?.length || 0);
    while (free > 0) {
      const gem = pickGem(gems, ch.cls);
      if (!gem) break;
      try {
        const res = await api(state, `/api/me/items/${encodeURIComponent(item.id)}/socket`, {
          method: "POST",
          body: { type: gem.type, tier: num(gem.tier, 1) }
        });
        gem.count = Math.max(0, num(gem.count, 0) - 1);
        free--;
        done++;
        log(state, `Engastou ${gem.type} T${gem.tier} em ${item.name || item.id}${res?.cost ? ` (${res.cost}g)` : ""}.`, "ok");
      } catch (e) {
        log(state, `Engaste falhou em ${item.name || item.id}: ${errText(e)}`, "warn");
        return done;
      }
    }
  }
  return done;
}

/* ---- Forja (sem VIP) -------------------------------------------------- */

function rarityTier(it) {
  const r = num(it?.rarity, 0);
  return r === 5 ? 3 : r; // Evento conta como Épico, igual ao site
}

function forgeTier(it) {
  const s = rarityTier(it);
  if (s === 4 && FORGE_SLOTS.includes(it.slot)) return 6; // Lendário de equipamento vira Imortal
  if (s === 6 && FORGE_SLOTS.includes(it.slot)) return 7; // Imortal de equipamento vira Arcano
  return s + 1;
}

function forgeNeeded(tier) {
  return tier >= 3 ? 4 : 3;
}

function forgeEligible(it) {
  if (!it || it.equipped || it.favorite) return false;
  if (it.slot === "cosmetic" || it.slot === "consumable") return false;
  if ((it.gems?.length ?? 0) > 0) return false;
  const s = rarityTier(it);
  return s < 4 || (s === 4 && FORGE_SLOTS.includes(it.slot)) || (s === 6 && FORGE_SLOTS.includes(it.slot));
}

function forgeCost(items, tier) {
  const levels = items.map((i) => num(i.itemLevel, 0));
  const avg = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  const mid = Math.floor((Math.floor(avg * 1.15) + Math.floor(avg * 1.3)) / 2);
  return Math.round((5 + mid * 2) * (FORGE_COST_FACTOR[tier] ?? 1) * 2);
}

function forgeGroups(ch) {
  const byKey = new Map();
  for (const it of ch.items || []) {
    if (!forgeEligible(it)) continue;
    const key = `${it.slot}|${rarityTier(it)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }

  const groups = [];
  for (const items of byKey.values()) {
    const tier = forgeTier(items[0]);
    const need = forgeNeeded(tier);
    if (items.length < need) continue;
    const set = items
      .slice()
      .sort((a, b) => num(b.itemLevel, 0) - num(a.itemLevel, 0))
      .slice(0, need);
    groups.push({
      ids: set.map((i) => i.id),
      cost: Math.round(forgeCost(set, tier) * 1.15), // margem de segurança
      label: `${set[0].name || set[0].id} ×${need}`
    });
  }
  return groups;
}

async function itemsGone(state, ids) {
  try {
    const fresh = await getCharacterSafe(state);
    if (!fresh) return { fresh: null, gone: false };
    const have = new Set((fresh.items || []).map((i) => String(i.id)));
    return { fresh, gone: ids.length > 0 && ids.every((id) => !have.has(String(id))) };
  } catch {
    return { fresh: null, gone: false };
  }
}

async function forgeGroup(state, group) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await api(state, "/api/me/items/fuse", {
        method: "POST",
        body: { itemIds: group.ids, scrollItemId: null }
      });
      return res;
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt >= 3) throw e;
      await delay(retryDelay(attempt));
      // Se a resposta se perdeu mas a forja aconteceu, os itens já sumiram.
      const check = await itemsGone(state, group.ids);
      if (check.gone) return { character: check.fresh, result: null, confirmed: true };
    }
  }
  throw lastErr;
}

async function autoForge(state, ch) {
  const now = Date.now();
  if (now - num(state.timers.lastForge, 0) < 30 * 1000) return 0;

  const groups = forgeGroups(ch);
  if (!groups.length) {
    if (now - num(state.runtime.forgeNoteAt, 0) > 10 * 60000) {
      state.runtime.forgeNoteAt = now;
      log(state, "Forja: nenhum grupo de 3–4 itens iguais disponível agora.", "info");
    }
    return 0;
  }
  state.timers.lastForge = now;

  const reserve = state.settings.goldReserve;
  let gold = num(ch.gold, 0);
  let done = 0;

  for (const group of groups) {
    if (gold - group.cost < reserve) {
      if (now - num(state.runtime.forgeNoteAt, 0) > 10 * 60000) {
        state.runtime.forgeNoteAt = now;
        log(state, `Forja: parada, ouro insuficiente (≈${group.cost.toLocaleString("pt-BR")}g por forja).`, "warn");
      }
      break;
    }
    try {
      const res = await forgeGroup(state, group);
      if (res?.character) {
        ch = res.character;
        state.runtime.character = summarizeCharacter(ch);
        gold = num(res.character.gold, gold - group.cost);
      } else {
        gold -= group.cost;
      }
      if (res?.result) {
        done++;
        const rn = RARITY[num(res.result.rarity, 0)] || "?";
        log(state, `Forja: ${group.label} → ${res.result.name || "item"} (${rn}) por ${group.cost.toLocaleString("pt-BR")}g.`, "ok");
      } else if (res?.confirmed) {
        done++;
        log(state, `Forja: ${group.label} aplicada (resposta perdida, confirmada no inventário).`, "ok");
      } else {
        log(state, `Forja: ${group.label} falhou e os itens foram perdidos.`, "warn");
      }
    } catch (e) {
      log(state, `Forja falhou: ${errText(e)}`, "warn");
      break;
    }
  }
  return done;
}

/* ---- Aprimoramento (sem VIP) ------------------------------------------ */

function enhancePlan(ch) {
  const bySlot = new Map();
  for (const it of ch.items || []) {
    if (!it || !EQUIP_SLOTS.includes(it.slot)) continue;
    if (!bySlot.has(it.slot)) bySlot.set(it.slot, []);
    bySlot.get(it.slot).push(it);
  }

  const plan = [];
  for (const slot of EQUIP_SLOTS) {
    const list = bySlot.get(slot) || [];
    if (!list.length) continue;
    const equipped = list.find((i) => i.equipped);
    const target = equipped || list.slice().sort((a, b) => num(b.itemLevel, 0) - num(a.itemLevel, 0))[0];

    const donors = list
      .filter((i) => i.id !== target.id && !i.equipped && !i.favorite && (i.gems?.length ?? 0) === 0)
      // Nunca destrói algo melhor que o alvo.
      .filter((i) => num(i.itemLevel, 0) < num(target.itemLevel, 0) && num(i.rarity, 0) <= num(target.rarity, 0))
      .sort((a, b) => num(a.itemLevel, 0) - num(b.itemLevel, 0))
      .slice(0, ENHANCE_MAX_DONORS);

    if (!donors.length) continue;
    plan.push({
      targetId: target.id,
      donorIds: donors.map((i) => i.id),
      label: target.name || target.id
    });
  }
  return plan;
}

async function enhanceGroup(state, p, gold, reserve) {
  let lastErr = null;
  let knownCost = 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const preview = await api(state, "/api/me/items/enhance/preview", {
        method: "POST",
        body: { targetId: p.targetId, donorIds: p.donorIds }
      });
      knownCost = num(preview?.gold, 0);
      if (gold - knownCost < reserve) return { skip: true, cost: knownCost };

      const res = await api(state, "/api/me/items/enhance", {
        method: "POST",
        body: { targetId: p.targetId, donorIds: p.donorIds }
      });
      return { res, cost: knownCost };
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt >= 3) throw e;
      await delay(retryDelay(attempt));
      // Se a resposta se perdeu mas o aprimoramento aconteceu, os doadores
      // já sumiram do inventário. Confirmar evita aprimorar duas vezes.
      const check = await itemsGone(state, p.donorIds);
      if (check.gone) return { confirmed: true, character: check.fresh, cost: knownCost };
    }
  }
  throw lastErr;
}

async function autoEnhance(state, ch) {
  const now = Date.now();
  if (now - num(state.timers.lastEnhance, 0) < 45 * 1000) return 0;

  const plan = enhancePlan(ch);
  if (!plan.length) {
    if (now - num(state.runtime.enhanceNoteAt, 0) > 10 * 60000) {
      state.runtime.enhanceNoteAt = now;
      log(state, "Aprimoramento: nenhum alvo com doadores mais fracos agora.", "info");
    }
    return 0;
  }
  state.timers.lastEnhance = now;

  const reserve = state.settings.goldReserve;
  let gold = num(ch.gold, 0);
  let done = 0;

  for (const p of plan) {
    try {
      const out = await enhanceGroup(state, p, gold, reserve);
      if (out.skip) {
        if (now - num(state.runtime.enhanceNoteAt, 0) > 10 * 60000) {
          state.runtime.enhanceNoteAt = now;
          log(state, `Aprimoramento: parado, ouro insuficiente (≈${out.cost.toLocaleString("pt-BR")}g).`, "warn");
        }
        break;
      }
      const next = out.res?.character || (out.res?.items ? out.res : null);
      if (next) {
        ch = next;
        state.runtime.character = summarizeCharacter(ch);
        gold = num(next.gold, gold - out.cost);
      } else {
        gold -= out.cost;
      }
      done++;
      if (out.confirmed) {
        log(state, `Aprimorado: ${p.label} aplicado (resposta perdida, confirmado no inventário).`, "ok");
      } else {
        log(state, `Aprimorado: ${p.label} (+${plural(p.donorIds.length, "item destruído", "itens destruídos")}, ${out.cost.toLocaleString("pt-BR")}g).`, "ok");
      }
    } catch (e) {
      log(state, `Aprimorar falhou: ${errText(e)}`, "warn");
      break;
    }
  }
  return done;
}

async function applyAutosell(state) {
  const s = state.settings;
  if (state.runtime.autosellDisabled) return;

  if (!s.autoSell) {
    // Só desliga no servidor se foi a extensão que configurou.
    if (state.timers.autosellCfg && state.timers.autosellCfg !== "off") {
      try {
        await api(state, "/api/shop/autosell", { method: "PUT", body: { rarity: -1, level: 0 } });
        state.timers.autosellCfg = "off";
        log(state, "Venda automática desligada.", "info");
      } catch { /* ignore */ }
    }
    return;
  }

  const cfg = `${s.sellRarity}:${s.sellLevel}`;
  if (state.timers.autosellCfg === cfg) return;
  try {
    await api(state, "/api/shop/autosell", {
      method: "PUT",
      body: { rarity: s.sellRarity, level: s.sellLevel }
    });
    state.timers.autosellCfg = cfg;
    log(state, `Venda automática configurada (raridade ≤ ${s.sellRarity}, nível ≤ ${s.sellLevel}).`, "ok");
  } catch (e) {
    if (isTransient(e)) {
      log(state, "Venda automática: servidor indisponível, tento de novo depois.", "warn");
      return;
    }
    state.runtime.autosellDisabled = true;
    log(state, `Venda automática indisponível (VIP): ${e.message}`, "warn");
  }
}

async function maintain(state, ch) {
  if (!ch || !Array.isArray(ch.items)) return ch;
  const s = state.settings;

  if (s.autoStats) {
    try {
      const n = await autoStats(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = plural(n, "nível de atributo", "níveis de atributo");
      }
    } catch (e) {
      log(state, `Atributos falharam: ${errText(e)}`, "warn");
    }
  }

  if (s.autoEquip) {
    try {
      const n = await autoEquip(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = plural(n, "item equipado", "itens equipados");
      }
    } catch (e) {
      log(state, `Equipar falhou: ${errText(e)}`, "warn");
    }
  }

  if (s.autoGems) {
    try {
      const n = await autoGems(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = `Gemas: ${plural(n, "combinação", "combinações")}`;
      }
    } catch (e) {
      log(state, `Gemas falharam: ${errText(e)}`, "warn");
    }
  }

  if (s.autoSocket) {
    try {
      const n = await autoSocket(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = plural(n, "gema engastada", "gemas engastadas");
      }
    } catch (e) {
      log(state, `Engaste falhou: ${errText(e)}`, "warn");
    }
  }

  if (s.autoOrganize) {
    const now = Date.now();
    if (now - num(state.timers.lastOrganize, 0) > 6 * 60 * 60000) {
      state.timers.lastOrganize = now;
      try {
        await api(state, "/api/me/items/organize", { method: "POST", body: { by: "level" } });
        log(state, "Baús organizados por nível.", "ok");
      } catch (e) {
        log(state, `Organizar falhou: ${errText(e)}`, "warn");
      }
    }
  }

  await applyAutosell(state);
  if (ch) state.runtime.character = summarizeCharacter(ch);
  return ch;
}

/* Forja e aprimoramento rodam em todo ciclo (1 min), não só na manutenção
 * periódica: são as ações que o usuário quer ver acontecendo rápido. */
async function maintainFast(state, ch) {
  if (!ch || !Array.isArray(ch.items)) return ch;
  const s = state.settings;
  if (!s.autoForge && !s.autoEnhance) return ch;

  if (s.autoForge) {
    try {
      const n = await autoForge(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = `Forja: ${plural(n, "forja", "forjas")}`;
      }
    } catch (e) {
      log(state, `Forja falhou: ${errText(e)}`, "warn");
    }
  }

  if (s.autoEnhance) {
    try {
      const n = await autoEnhance(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = `${plural(n, "item aprimorado", "itens aprimorados")}`;
      }
    } catch (e) {
      log(state, `Aprimorar falhou: ${errText(e)}`, "warn");
    }
  }

  if (ch) state.runtime.character = summarizeCharacter(ch);
  return ch;
}

/* --------------------------------- tick --------------------------------- */

async function tick() {
  if (tickBusy) return;
  tickBusy = true;
  let state = null;
  try {
    state = await loadState();
    if (!state.running) return;

    await ensureToken(state);

    let ch = await getCharacterSafe(state);
    const now = Date.now();

    if (!ch) {
      state.runtime.status = "aguardando";
      state.runtime.lastError = null;
      if (!state.runtime.awaitingCharacter) {
        state.runtime.awaitingCharacter = true;
        log(state, "Sem personagem ainda. Procure uma live, entre no chat e use $jogar.", "info");
      }
      return;
    }
    state.runtime.awaitingCharacter = false;

    // Forja/aprimoramento não esperam o intervalo da manutenção.
    const fast = await maintainFast(state, ch);
    if (fast) ch = fast;

    if (now - num(state.timers.lastMaintenance, 0) >= state.settings.maintenanceMin * 60000) {
      state.timers.lastMaintenance = now;
      const after = await maintain(state, ch);
      if (after) ch = after;
    }

    if (state.current?.tabId) {
      const tab = await getTab(state.current.tabId);
      if (!tab) {
        state.current = null;
      } else if (tab.discarded) {
        try { await chrome.tabs.reload(state.current.tabId); } catch { /* ignore */ }
      }
    }

    state.runtime.status = "ativo";
    state.runtime.lastError = null;
    state.runtime.character = summarizeCharacter(ch);
  } catch (e) {
    if (state) {
      if (isTransient(e)) {
        // 503/erro de rede: não é erro real, é soluço do servidor.
        state.runtime.status = "instavel";
        state.runtime.lastError = null;
        state.runtime.awaitingCharacter = false;
        if (Date.now() - num(state.runtime.lastTransient, 0) > 5 * 60000) {
          state.runtime.lastTransient = Date.now();
          log(state, `${errText(e)}. Vou tentar de novo no próximo ciclo.`, "warn");
        }
      } else {
        state.runtime.status = "erro";
        state.runtime.lastError = e.message || String(e);
        log(state, `Erro: ${e.message || e}`, "error");
        if (/sess[ãa]o|token|login/i.test(e.message || "")) state.token = null;
      }
    }
  } finally {
    if (state) {
      await saveState();
      updateBadge(state);
    }
    tickBusy = false;
  }
}

function updateBadge(state) {
  try {
    const status = state.runtime.status;
    const text = state.running ? (status === "erro" ? "!" : status === "instavel" ? "~" : "ON") : "";
    const color = status === "erro" ? "#e05252" : status === "instavel" ? "#e0b84a" : "#35c96f";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setTitle({ title: `RiftStream AutoFarm — ${status || "parado"}` });
  } catch { /* ignore */ }
}

/* ------------------------------- mensagens ------------------------------- */

async function handleMessage(msg) {
  const state = await loadState();

  switch (msg.type) {
    case "RSAF_GET_STATE":
      return publicState(state);

    case "RSAF_START": {
      try {
        await ensureToken(state, true);
      } catch (e) {
        try { await chrome.tabs.create({ url: `${SITE_URL}/character`, active: true }); } catch { /* ignore */ }
        throw new Error("Abra riftstream.com.br, entre com a Twitch e clique em Ativar de novo.");
      }
      state.running = true;
      state.runtime.status = "iniciando";
      state.runtime.lastError = null;
      state.runtime.awaitingCharacter = false;
      log(state, "Manutenção automática ligada.");
      await saveState();
      try { chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 }); } catch { /* ignore */ }
      tick();
      return publicState(state);
    }

    case "RSAF_STOP": {
      state.running = false;
      state.runtime.status = "parado";
      log(state, "Manutenção automática pausada.");
      await saveState();
      try { await chrome.alarms.clear(ALARM_NAME); } catch { /* ignore */ }
      updateBadge(state);
      return publicState(state);
    }

    case "RSAF_SAVE_SETTINGS": {
      const prev = state.settings;
      state.settings = normalizeSettings(msg.settings);
      const turnedOn = (k) => !prev[k] && state.settings[k];
      // Ao ligar forja/aprimoramento, roda já no próximo tick, sem esperar.
      if (turnedOn("autoForge")) state.timers.lastForge = 0;
      if (turnedOn("autoEnhance")) state.timers.lastEnhance = 0;
      state.runtime.autosellDisabled = false;
      log(state, "Configurações salvas.");
      await saveState();
      if (state.running) {
        applyAutosell(state).catch(() => {});
        if (turnedOn("autoForge") || turnedOn("autoEnhance")) tick();
        saveState().catch(() => {});
      }
      updateBadge(state);
      return publicState(state);
    }

    case "RSAF_SCAN": {
      let list = [];
      // 503 é intermitente: insiste rápido e repetidamente até o ranking voltar.
      for (let attempt = 0; attempt < 4; attempt++) {
        list = await scanChannels(state, { force: true });
        if (list.length) break;
        if (!/indisponível/i.test(state.runtime.scanError || "")) break;
        if (attempt < 3) await delay(800 + attempt * 400);
      }
      if (list.length) {
        state.runtime.scanError = null;
        state.runtime.lastTransient = 0;
        if (state.running) {
          state.runtime.status = "ativo";
          state.runtime.lastError = null;
        }
        log(state, `Busca de lives: ${plural(list.length, "live encontrada", "lives encontradas")}.`);
      } else {
        log(state, state.runtime.scanError || "Nenhuma live encontrada.", "warn");
      }
      await saveState();
      return publicState(state);
    }

    case "RSAF_OPEN_CHANNEL": {
      const login = String(msg.login || "").trim();
      if (!login) throw new Error("Canal inválido.");
      await openChannel(state, login, { active: true, reason: "escolhida por você" });
      return publicState(state);
    }

    case "RSAF_MAINTENANCE": {
      await ensureToken(state);
      let ch = await getCharacterSafe(state);
      if (!ch) throw new Error("Personagem não encontrado. Entre em uma live e use $jogar no chat.");
      ch = (await maintain(state, ch)) || ch;
      ch = (await maintainFast(state, ch)) || ch;
      state.runtime.status = "ativo";
      state.runtime.lastError = null;
      state.runtime.lastTransient = 0;
      await saveState();
      return publicState(state);
    }

    case "RSAF_OPEN_SITE": {
      const tabs = await chrome.tabs.query({ url: ["https://riftstream.com.br/*"] });
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        await chrome.tabs.create({ url: `${SITE_URL}/character`, active: true });
      }
      return { ok: true };
    }

    case "RSAF_OPEN_LIVE": {
      const login = state.current?.login;
      const url = login ? `https://www.twitch.tv/${encodeURIComponent(login)}` : "https://www.twitch.tv/";
      await chrome.tabs.create({ url, active: true });
      return { ok: true };
    }

    case "RSAF_RESET_LOG": {
      state.log = [];
      await saveState();
      return publicState(state);
    }

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
    loadState()
      .then(async (state) => {
        if (state.token !== msg.token) {
          state.token = msg.token;
          await saveState();
        }
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === "RSAF_TWITCH_READY") {
    sendResponse({ ok: true });
    return false;
  }

  if (!msg.type.startsWith("RSAF_")) return false;

  handleMessage(msg)
    .then((res) => sendResponse(res))
    .catch((e) => sendResponse({ error: e?.message || String(e) }));

  return true;
});

/* ------------------------------- ciclo de vida --------------------------- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) tick();
});

async function boot() {
  const state = await loadState();
  updateBadge(state);
  if (state.running) {
    try { chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 }); } catch { /* ignore */ }
    tick();
  }
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
