"use strict";

/* =========================================================================
 * RiftStream AutoFarm — service worker
 * =========================================================================
 * O jogo em si roda no chat da Twitch (comandos $jogar / $me). Este worker:
 *  - encontra as lives online com melhor zona/público pelo ranking público;
 *  - abre a live/chat da Twitch e envia $jogar / $me periodicamente;
 *  - usa a API do site para equipar itens melhores, subir gemas, forjar etc.
 *
 * Aviso: automação viola os Termos do RiftStream e possivelmente os da Twitch.
 * Use por sua conta e risco.
 * ========================================================================= */

const API_BASE = "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com";
const SITE_URL = "https://riftstream.com.br";
const STORAGE_KEY = "rsaf_state_v1";
const ALARM_NAME = "rsaf_tick";
const CLASS_CMD = { warrior: "guerreiro", cleric: "clerigo", archer: "arqueiro" };
const EQUIP_SLOTS = ["weapon", "helmet", "armor", "ring"];
const GEM_TYPES = ["ruby", "sapphire", "topaz", "emerald", "amethyst"];

const DEFAULT_SETTINGS = {
  strategy: "zone",          // zone | players | balanced
  heartbeatMin: 10,          // 5..25 (AFK normal = 30 min)
  maintenanceMin: 5,         // 2..60
  autoEquip: true,
  autoGems: true,
  autoForge: true,
  autoSocket: false,
  autoOrganize: false,
  autoSell: false,
  sellRarity: 2,
  sellLevel: 40,
  autoSwitch: true,
  minPlayers: 3,
  switchHysteresis: 2,
  goldReserve: 50000,
  chatOnly: true,
  muteTab: true,
  fallbackClass: "archer"
};

const DEFAULT_TIMERS = {
  lastHeartbeat: 0,
  lastAfkPoke: 0,
  lastJoinSentAt: 0,
  lastMaintenance: 0,
  lastChannelCheck: 0,
  lastForge: 0,
  lastGems: 0,
  lastOrganize: 0,
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
  channelMisses: 0,
  autosellDisabled: false
};

const DEFAULT_STATE = {
  running: false,
  token: null,
  settings: { ...DEFAULT_SETTINGS },
  current: null, // { login, tabId, joinedAt }
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
const normLogin = (s) => String(s || "").replace(/^kick:/i, "").toLowerCase();
const plural = (n, one, many) => `${num(n, 0)} ${num(n, 0) === 1 ? one : many}`;

function normalizeSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  s.strategy = ["zone", "players", "balanced"].includes(s.strategy) ? s.strategy : "zone";
  s.heartbeatMin = clamp(num(s.heartbeatMin, 10), 5, 25);
  s.maintenanceMin = clamp(num(s.maintenanceMin, 5), 2, 60);
  s.minPlayers = clamp(num(s.minPlayers, 3), 1, 500);
  s.switchHysteresis = clamp(num(s.switchHysteresis, 2), 1, 10);
  s.goldReserve = clamp(num(s.goldReserve, 50000), 0, 1000000000);
  s.sellRarity = clamp(num(s.sellRarity, 2), -1, 3);
  s.sellLevel = clamp(num(s.sellLevel, 40), 0, 9999);
  s.fallbackClass = ["warrior", "cleric", "archer"].includes(s.fallbackClass)
    ? s.fallbackClass
    : "archer";
  ["autoEquip", "autoGems", "autoForge", "autoSocket", "autoOrganize", "autoSell",
    "autoSwitch", "chatOnly", "muteTab"].forEach((k) => { s[k] = !!s[k]; });
  return s;
}

function normalizeState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_STATE,
    ...r,
    settings: normalizeSettings(r.settings),
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

async function rawApi(path, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
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
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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
    throw new Error("Abra riftstream.com.br, entre com a Twitch e clique em Iniciar.");
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

function classCommand(cls) {
  return CLASS_CMD[cls] || CLASS_CMD.archer;
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

async function sendChat(state, tabId, text, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const tab = await getTab(tabId);
    if (!tab) throw new Error("A aba da Twitch foi fechada.");
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "RSAF_SEND_CHAT", text });
      if (res?.ok) return true;
      lastErr = new Error(res?.error || "A Twitch não aceitou a mensagem.");
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await delay(2500 + i * 800);
  }
  throw lastErr || new Error("Falha ao enviar mensagem no chat.");
}

async function openChannel(state, login, reason = "") {
  const clean = String(login || "").trim().replace(/^kick:/i, "");
  if (!clean) throw new Error("Canal inválido.");

  const url = channelUrl(clean, state.settings.chatOnly);

  // Reaproveita a aba atual do farm quando possível.
  let tabId = state.current?.tabId || null;
  let tab = await getTab(tabId);
  if (!tab) tabId = null;

  if (tabId) {
    await chrome.tabs.update(tabId, { url, active: false });
  } else {
    const created = await chrome.tabs.create({ url, active: false });
    tabId = created.id;
  }

  state.current = { login: clean, tabId, joinedAt: 0, since: Date.now() };
  try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch { /* ignore */ }
  if (state.settings.muteTab) {
    try { await chrome.tabs.update(tabId, { muted: true }); } catch { /* ignore */ }
  }
  const where = state.settings.chatOnly ? "chat" : "live";
  log(state, `Abrindo ${where} de ${clean}${reason ? ` (${reason})` : ""}.`);
  await saveState();

  // Espera a página carregar o suficiente e manda o $jogar.
  const ch = await getCharacterSafe(state).catch(() => null);
  const cls = ch?.cls || state.settings.fallbackClass;
  await sendChat(state, tabId, `$jogar ${classCommand(cls)}`, 6);
  state.timers.lastHeartbeat = Date.now();
  state.timers.lastJoinSentAt = Date.now();
  state.current.joinedAt = Date.now();
  log(state, `Entrou em ${clean} com $jogar ${classCommand(cls)}.`);
  await saveState();
  return state.current;
}

async function ensureTargetTab(state) {
  const cur = state.current;
  if (!cur?.tabId) return false;
  const tab = await getTab(cur.tabId);
  if (!tab) {
    state.current = null;
    await saveState();
    return false;
  }
  if (tab.discarded) {
    try { await chrome.tabs.reload(cur.tabId); } catch { /* ignore */ }
    return true;
  }
  if (!urlMatchesLogin(tab.url, cur.login)) {
    await openChannel(state, cur.login, "aba estava em outra página");
    return true;
  }
  return false;
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

async function scanChannels(state) {
  const s = state.settings;
  const [runs, crowds] = await Promise.all([
    publicApi("/api/ranking/runs?page=1&size=40&online=true").catch(() => ({ items: [] })),
    publicApi("/api/ranking/crowds?page=1&size=40&online=true").catch(() => ({ items: [] }))
  ]);

  const map = new Map();
  const pick = (items, limit) =>
    (items || [])
      .filter((x) => x?.login && x.online && num(x.playersNow, 0) >= s.minPlayers)
      .slice(0, limit);

  let picked = [...pick(runs?.items, 12), ...pick(crowds?.items, 6)];
  if (!picked.length) {
    // Se ninguém atingiu o mínimo, não deixa o farm sem candidatos.
    picked = [
      ...(runs?.items || []).filter((x) => x?.login && x.online).slice(0, 12),
      ...(crowds?.items || []).filter((x) => x?.login && x.online).slice(0, 6)
    ];
  }
  for (const item of picked) map.set(item.login, item);

  const base = [...map.values()];
  const details = await mapLimit(base, 6, async (item) => {
    const d = await publicApi(`/api/ranking/channel/${encodeURIComponent(item.login)}`);
    if (!d?.login) return null;
    const login = d.twitchLogin || (String(d.login).startsWith("kick:") ? null : d.login);
    if (!login) return null; // canal só da Kick
    if (!d.live && !d.online) return null;
    const c = {
      login,
      name: d.displayName || item.name || login,
      zone: num(d.zone, 0),
      wave: num(d.wave, 0),
      bestZone: num(d.bestZone, 0),
      bestWave: num(d.bestWave, 0),
      playersNow: num(d.playersNow, 0),
      live: !!d.live,
      online: !!d.online,
      score: 0
    };
    c.score = scoreChannel(c, s.strategy);
    return c;
  });

  const list = details.filter(Boolean).sort((a, b) => b.score - a.score);
  state.runtime.candidates = list.slice(0, 8);
  state.runtime.scanAt = Date.now();
  return list;
}

async function currentChannelDetail(state) {
  if (!state.current?.login) return null;
  try {
    return await publicApi(`/api/ranking/channel/${encodeURIComponent(state.current.login)}`);
  } catch {
    // undefined = falha transitória (503, rede). Não confundir com "offline".
    return undefined;
  }
}

async function ensureChannel(state) {
  const s = state.settings;
  const list = await scanChannels(state);
  const best = list[0];
  const cur = await currentChannelDetail(state);
  const misses = num(state.runtime.channelMisses, 0);

  if (!state.current?.tabId) {
    if (!best) throw new Error("Nenhuma live online encontrada agora.");
    return openChannel(state, best.login, "primeira live");
  }

  // Ranking sem resposta: mantém o canal atual e tenta de novo no próximo ciclo.
  if (cur === undefined && misses < 2) {
    state.runtime.channelMisses = misses + 1;
    state.runtime.candidates = list.slice(0, 8);
    return state.current;
  }
  if (cur !== undefined) state.runtime.channelMisses = 0;

  const curOk = cur && cur.online && cur.live &&
    (cur.twitchLogin || !String(cur.login).startsWith("kick:"));
  if (!curOk) {
    if (!best) {
      if (cur === undefined) return state.current;
      throw new Error("Seu canal saiu do ar e nenhuma live online foi encontrada agora.");
    }
    return openChannel(state, best.login, cur === undefined ? "ranking sem resposta" : "canal anterior offline");
  }
  // Escolha manual do usuário vale por 30 min (a não ser que a live caia).
  if (state.current.manualUntil && Date.now() < state.current.manualUntil) {
    return state.current;
  }
  if (!s.autoSwitch) return state.current;

  const curZone = num(cur.zone, 0);
  const bestZone = num(best?.zone, 0);
  if (best && bestZone > 0 && (bestZone >= curZone + s.switchHysteresis || curZone === 0)) {
    return openChannel(state, best.login, `zona ${bestZone}-${best.wave} vs ${curZone}-${num(cur.wave, 0)}`);
  }
  state.runtime.candidates = list.slice(0, 8);
  return state.current;
}

/* ------------------------------- manutenção ----------------------------- */

function invSignature(ch) {
  const ids = (ch?.items || []).map((i) => String(i.id || "")).sort();
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return `${ids.length}:${(h >>> 0).toString(36)}`;
}

async function autoEquip(state, ch) {
  const s = state.settings;
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
        log(state, `Engaste falhou em ${item.name || item.id}: ${e.message}`, "warn");
        return done;
      }
    }
  }
  return done;
}

async function autoForge(state, ch) {
  const now = Date.now();
  if (now - num(state.timers.lastForge, 0) < 30 * 60000) return 0;
  if (num(ch.gold, 0) <= state.settings.goldReserve) return 0;
  state.timers.lastForge = now;
  try {
    const res = await api(state, "/api/me/items/fuse-all", { method: "POST" });
    const fusions = num(res?.fusions, 0);
    if (fusions > 0) {
      log(state, `Forja: ${plural(fusions, "fusão", "fusões")} por ${num(res?.cost, 0).toLocaleString("pt-BR")}g.`, "ok");
    }
    return fusions;
  } catch (e) {
    if (/vip/i.test(e.message || "")) {
      state.settings.autoForge = false;
      log(state, "Forja automática é exclusiva VIP; desativei a opção.", "warn");
    } else {
      log(state, `Forja falhou: ${e.message}`, "warn");
    }
    return 0;
  }
}

async function applyAutosell(state) {
  const s = state.settings;
  if (state.runtime.autosellDisabled) return;

  if (!s.autoSell) {
    // Só desliga no servidor se foi a extensão que configurou.
    if (state.timers.autosellCfg && state.timers.autosellCfg !== "off") {
      try {
        await api(state, "/api/shop/autosell", {
          method: "PUT",
          body: { rarity: -1, level: 0 }
        });
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
    state.runtime.autosellDisabled = true;
    log(state, `Venda automática indisponível (VIP): ${e.message}`, "warn");
  }
}

async function maintain(state, ch) {
  if (!ch || !Array.isArray(ch.items)) return ch;
  const s = state.settings;

  if (s.autoEquip) {
    try {
      const n = await autoEquip(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = plural(n, "item equipado", "itens equipados");
      }
    } catch (e) {
      log(state, `Equipar falhou: ${e.message}`, "warn");
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
      log(state, `Gemas falharam: ${e.message}`, "warn");
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
      log(state, `Engaste falhou: ${e.message}`, "warn");
    }
  }

  if (s.autoForge) {
    try {
      const n = await autoForge(state, ch);
      if (n > 0) {
        ch = (await getCharacterSafe(state)) || ch;
        state.runtime.lastAction = `Forja: ${plural(n, "fusão", "fusões")}`;
      }
    } catch (e) {
      log(state, `Forja falhou: ${e.message}`, "warn");
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
        log(state, `Organizar falhou: ${e.message}`, "warn");
      }
    }
  }

  await applyAutosell(state);
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

    // Garante que a aba é a da live certa.
    if (!state.current?.tabId) {
      await ensureChannel(state);
    } else {
      const navigated = await ensureTargetTab(state);
      if (navigated) {
        state.runtime.status = "rodando";
        return;
      }
      if (!state.current?.tabId) {
        await ensureChannel(state);
        state.runtime.status = "rodando";
        return;
      }
    }

    let ch = await getCharacterSafe(state);

    if (!ch) {
      const cls = state.settings.fallbackClass;
      await sendChat(state, state.current.tabId, `$jogar ${classCommand(cls)}`, 3);
      state.timers.lastJoinSentAt = Date.now();
      await delay(6000);
      ch = await getCharacterSafe(state);
      if (!ch) throw new Error("Personagem ainda não apareceu. Confirme se a live tem o bot e tente de novo.");
    }

    const now = Date.now();
    const joined = ch.currentChannel &&
      normLogin(ch.currentChannel.login) === normLogin(state.current.login);
    const afk = isAfk(ch);
    const heartbeatDue = now - num(state.timers.lastHeartbeat, 0) >= state.settings.heartbeatMin * 60000;
    const joinCooldownOk = now - num(state.timers.lastJoinSentAt, 0) > 2 * 60000;

    if (!joined && joinCooldownOk) {
      await sendChat(state, state.current.tabId, `$jogar ${classCommand(ch.cls)}`, 3);
      state.timers.lastJoinSentAt = now;
      state.timers.lastHeartbeat = now;
      log(state, `Personagem fora do canal: enviado $jogar ${classCommand(ch.cls)}.`, "ok");
    } else if (joined && ((afk && now - num(state.timers.lastAfkPoke, 0) > 90000) || heartbeatDue)) {
      await sendChat(state, state.current.tabId, "$me", 2);
      state.timers.lastHeartbeat = now;
      if (afk) state.timers.lastAfkPoke = now;
      log(state, afk ? "AFK detectado: enviado $me." : "Heartbeat $me enviado.", afk ? "warn" : "info");
    }

    if (now - num(state.timers.lastMaintenance, 0) >= state.settings.maintenanceMin * 60000) {
      state.timers.lastMaintenance = now;
      ch = await maintain(state, ch);
    }

    if (now - num(state.timers.lastChannelCheck, 0) >= 10 * 60000) {
      state.timers.lastChannelCheck = now;
      await ensureChannel(state);
    }

    state.runtime.status = "rodando";
    state.runtime.lastError = null;
    state.runtime.character = summarizeCharacter(ch);
  } catch (e) {
    if (state) {
      state.runtime.status = "erro";
      state.runtime.lastError = e.message || String(e);
      log(state, `Erro: ${e.message || e}`, "error");
      if (/sess[ãa]o|token|login/i.test(e.message || "")) state.token = null;
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
    const text = state.running ? (state.runtime.status === "erro" ? "!" : "ON") : "";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: state.runtime.status === "erro" ? "#e05252" : "#35c96f" });
    chrome.action.setTitle({ title: `RiftStream AutoFarm — ${state.runtime.status || "parado"}` });
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
        throw new Error("Abra riftstream.com.br, entre com a Twitch e clique em Iniciar de novo.");
      }
      state.running = true;
      state.runtime.status = "iniciando";
      state.runtime.lastError = null;
      log(state, "AutoFarm iniciado.");
      await saveState();
      try { chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 }); } catch { /* ignore */ }
      tick();
      return publicState(state);
    }

    case "RSAF_STOP": {
      state.running = false;
      state.runtime.status = "parado";
      log(state, "AutoFarm parado.");
      await saveState();
      try { await chrome.alarms.clear(ALARM_NAME); } catch { /* ignore */ }
      updateBadge(state);
      return publicState(state);
    }

    case "RSAF_SAVE_SETTINGS": {
      state.settings = normalizeSettings(msg.settings);
      state.runtime.autosellDisabled = false;
      log(state, "Configurações salvas.");
      await saveState();
      if (state.running) {
        applyAutosell(state).catch(() => {});
        saveState().catch(() => {});
      }
      updateBadge(state);
      return publicState(state);
    }

    case "RSAF_REFRESH_CHANNELS": {
      await scanChannels(state);
      await saveState();
      return publicState(state);
    }

    case "RSAF_SWITCH_CHANNEL": {
      const login = String(msg.login || "").trim().replace(/^kick:/i, "");
      if (!login) throw new Error("Canal inválido.");
      await ensureToken(state);
      await openChannel(state, login, "escolhido no painel");
      if (state.current) state.current.manualUntil = Date.now() + 30 * 60000;
      state.running = true;
      state.runtime.status = "rodando";
      await saveState();
      try { chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 }); } catch { /* ignore */ }
      tick();
      return publicState(state);
    }

    case "RSAF_MAINTENANCE": {
      await ensureToken(state);
      const ch = await getCharacterSafe(state);
      if (!ch) throw new Error("Personagem não encontrado. Entre na live com $jogar primeiro.");
      await maintain(state, ch);
      await saveState();
      return publicState(state);
    }

    case "RSAF_TEST_CHAT": {
      if (!state.current?.tabId) {
        throw new Error("Nenhuma live aberta ainda. Inicie o AutoFarm primeiro.");
      }
      await sendChat(state, state.current.tabId, "$me", 2);
      log(state, "Teste de chat enviado ($me).", "ok");
      await saveState();
      return { ok: true };
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
