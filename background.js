"use strict";

/* =========================================================================
 * RiftStream AutoFarm — service worker (coordenador)
 * =========================================================================
 * A automação do inventário roda DENTRO da página do jogo (content/engine.js):
 * assim o token é o mesmo do site e o endereço da API é descoberto na página.
 *
 * Aqui ficam apenas as tarefas de bastidor:
 *  - acordar as abas do RiftStream a cada minuto e reanimar a engine se ela
 *    tiver morrido (aba congelada, renderer reiniciado, extensão atualizada);
 *  - buscar as lives online no ranking público;
 *  - manter o herói fora do AFK enviando um comando curto no chat da live,
 *    no último quarto da janela de `afkMinutes` do servidor;
 *  - manter o badge e o estado que o popup mostra.
 * ========================================================================= */

const API_BASE = "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com";
const SITE_URL = "https://riftstream.com.br";
const KEY = "rsaf";
const LIVES_KEY = "rsafLives";
const STATUS_KEY = "rsafStatus";
const LOG_KEY = "rsafLog";
const TOKEN_KEY = "rsafToken";
const CHAT_KEY = "rsafChat";
const CHAT_CLOCK_KEY = "rsafChatClock";
const CHAT_HUMAN_KEY = "rsafChatHuman";
const TAB_MISS_KEY = "rsafTabMiss";
const ALARM_NAME = "rsaf_tick";
const RIFT_URLS = ["https://riftstream.com.br/*", "https://www.riftstream.com.br/*"];
const TWITCH_URLS = ["https://www.twitch.tv/*", "https://twitch.tv/*"];
const CHAT_DEFAULTS = { ligado: true, minutos: 0, texto: "$jump" };
// $jump/$pular são cosméticos (o herói só pula) e não geram resposta do bot —
// o ping mais discreto que o jogo aceita. $me é a rede de segurança.
const CHAT_FALLBACK = ["$jump", "$pular", "$me"];
const CHAT_RETRY_MS = 2 * 60 * 1000;
const CHAT_CANSADO_MS = 30 * 60 * 1000;
const CHAT_MARGEM_MIN = 4;
// Janela usada quando `/api/me` nunca respondeu (30 é o padrão do jogo).
const CHAT_JANELA_PADRAO = 30;
// Falha de leitura também tem TTL: sem isso o worker bate em 401 a cada minuto.
const CHAT_CLOCK_ERR_MS = 5 * 60 * 1000;
const CHAT_CLOCK_401_MS = 15 * 60 * 1000;
const GAME_OPEN_GAP = 10 * 60 * 1000;
const REIDRATA_GAP = 5 * 60 * 1000;
const PLAY_KEY = "rsafPlay";
const RAID_KEY = "rsafRaid";
// O jogo só aceita um personagem por canal, e `$jogar` é o comando que entra.
const PLAY_DEFAULTS = { ligado: true, classe: "auto", autoLive: true, raid: false };
const PLAY_VERIFY_MS = 75 * 1000;      // tempo para o servidor refletir o `$jogar`
const PLAY_RETRY_MS = 5 * 60 * 1000;   // tentativa após falha (sem efeito)
const PLAY_MORTO_MS = 20 * 60 * 1000;  // três falhas seguidas: espera mais
const PLAY_BAD_LIVE_MS = 25 * 60 * 1000; // live que ignorou o $jogar fica de fora
const PLAY_RAID_GAP_MS = 6 * 60 * 60 * 1000; // mesma live não repete raid cedo

let lastGameOpen = 0;
let lastReidrata = 0;

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
      // `create` sobrescreve: garante 1 min mesmo em instalação antiga (0.5).
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
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

// A engine é idempotente (guarda `window.__rsafEngine`), então reinjetar é
// seguro. É o que salva a madrugada depois de uma atualização da extensão:
// os content scripts antigos ficam órfãos e o `sendMessage` falha calado.
async function reidratarAba(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/engine.js"] });
    return true;
  } catch {
    return false;
  }
}

async function acordarAbas(force = false) {
  const tabs = await gameTabs();
  const misses = await get(TAB_MISS_KEY, {});
  let enviados = 0;
  let reanimadas = 0;

  for (const tab of tabs) {
    if (!tab.id) continue;
    const chave = String(tab.id);
    try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch { /* ignore */ }

    if (tab.discarded) {
      try { await chrome.tabs.reload(tab.id); } catch { /* ignore */ }
      continue;
    }

    let ok = false;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { rodada: true, forcar: force });
      ok = !!r;
    } catch { ok = false; }

    if (ok) {
      enviados++;
      if (misses[chave]) {
        delete misses[chave];
        await set({ [TAB_MISS_KEY]: misses });
      }
      continue;
    }

    // Sem resposta = content script morto. Reinjeta antes de recarregar:
    // recarregar no meio de uma rodada custa o progresso daquela aba.
    const faltas = num(misses[chave], 0) + 1;
    misses[chave] = faltas;

    if (faltas === 1 && (await reidratarAba(tab.id))) {
      reanimadas++;
      await addLog("Engine reinjetada na aba do jogo.", "warn");
    } else if (faltas >= 2) {
      try { await chrome.tabs.reload(tab.id); } catch { /* ignore */ }
      await addLog("Aba do jogo não respondeu; recarreguei.", "warn");
      delete misses[chave];
    }

    await set({ [TAB_MISS_KEY]: misses });
  }

  return { tabs: tabs.length, enviados, reanimadas };
}

async function ensureGameTab() {
  const tabs = await gameTabs();
  if (tabs.length) return tabs[0].id;
  if (Date.now() - lastGameOpen < GAME_OPEN_GAP) return null;
  lastGameOpen = Date.now();
  try {
    const created = await chrome.tabs.create({ url: `${SITE_URL}/character`, active: false });
    await addLog("Nenhuma aba do jogo aberta; reabri o RiftStream.", "warn");
    return created.id;
  } catch {
    return null;
  }
}

/* -------------------------------- chat/AFK ------------------------------- */

function chatCfg(cfg) {
  const c = cfg?.settings?.chatKeep || {};
  return {
    ligado: c.ligado !== false,
    minutos: Math.max(0, Math.min(55, Math.round(num(c.minutos, 0)))),
    texto: String(c.texto || CHAT_DEFAULTS.texto).trim().slice(0, 200) || CHAT_DEFAULTS.texto
  };
}

async function loadChat() {
  return await get(CHAT_KEY, {
    lastAt: 0, fails: 0, lastError: null, retryAt: 0,
    sentAt: 0, sentText: null, sentChannel: "", verifyAt: 0,
    badPorCanal: {}
  });
}

async function loadClock() {
  return await get(CHAT_CLOCK_KEY, {
    ok: false, at: 0, readAt: 0, reason: null, status: 0,
    janela: null, restanteMin: null, afk: null, canal: null
  });
}

// Quem já se provou inócuo naquele canal não volta para a fila até um envio
// dar certo por lá — trocar de live não herda o bloqueio da anterior.
function canalBad(chat) {
  const mapa = chat?.badPorCanal;
  if (!mapa || typeof mapa !== "object" || Array.isArray(mapa)) return {};
  const copia = { ...mapa };
  const chaves = Object.keys(copia);
  // Memória curta: só os últimos canais visitados, para o storage não crescer.
  if (chaves.length > 8) for (const k of chaves.slice(0, chaves.length - 8)) delete copia[k];
  return copia;
}

function filaChat(c, chat, login) {
  const bad = canalBad(chat)[String(login || "")] || [];
  const fila = [...new Set([c.texto, ...CHAT_FALLBACK])].filter((t) => !bad.includes(t));
  return fila[0] || null;
}

function findField(obj, key, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const value of Object.values(obj)) {
    if (!value || typeof value !== "object") continue;
    const hit = findField(value, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/*
 * Fonte da verdade do AFK: o site calcula
 *   agora - lastActiveAt > afkMinutes * 60000
 * e mostra "fale no chat para voltar ao jogo". `lastActiveAt` só anda com
 * comando no chat, então relógio local nenhum substitui essa leitura.
 */
async function afkClock(force = false) {
  const cache = await loadClock();
  const agora = Date.now();
  const ttl = Number.isFinite(cache.restanteMin) && cache.restanteMin <= 8 ? 45000 : 4 * 60000;
  if (!force) {
    if (cache.ok && agora - num(cache.readAt, 0) < ttl) return cache;
    // Falha recente também tem TTL: 401 é token vencido (só o login resolve) e
    // os outros erros já custaram 12 s de timeout — repetir a cada minuto só
    // gasta bateria. O caminho de verificação usa force e ignora isso.
    const espera = num(cache.status, 0) === 401 ? CHAT_CLOCK_401_MS : CHAT_CLOCK_ERR_MS;
    if (!cache.ok && num(cache.at, 0) && agora - num(cache.at, 0) < espera) return cache;
  }

  const token = await get(TOKEN_KEY, null);
  if (!token) return { ...cache, ok: false, at: agora, reason: "sem token" };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: ctl.signal
    });
    if (!res.ok) {
      return { ...cache, ok: false, at: agora, status: res.status, reason: `HTTP ${res.status}` };
    }

    const me = await res.json();
    const last = Date.parse(String(findField(me, "lastActiveAt") || ""));
    const janela = Math.max(5, Math.round(num(findField(me, "afkMinutes"), CHAT_JANELA_PADRAO)));
    const canal = findField(me, "currentChannel");
    const restanteMin = Number.isFinite(last)
      ? Math.round((last + janela * 60000 - agora) / 60000)
      : null;

    return {
      ok: true,
      at: agora,
      readAt: agora,
      status: 200,
      lastActiveAt: Number.isFinite(last) ? last : null,
      janela,
      restanteMin,
      afk: restanteMin !== null ? restanteMin <= 0 : null,
      canal: canal?.login ? String(canal.login).replace(/^kick:/i, "").toLowerCase() : null
    };
  } catch (e) {
    return {
      ...cache, ok: false, at: agora, status: 0,
      reason: e?.name === "AbortError" ? "timeout" : (e?.message || "erro")
    };
  } finally {
    clearTimeout(timer);
  }
}

async function twitchTabs() {
  try { return await chrome.tabs.query({ url: TWITCH_URLS }); } catch { return []; }
}

function twitchLoginFromTab(url) {
  try {
    const u = new URL(String(url || ""));
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).toLowerCase());
    if (parts[0] === "popout") return parts[1] || "";
    return parts[0] || "";
  } catch {
    return "";
  }
}

function waitTabComplete(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const fim = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      resolve(false);
    }, timeout);
    function fn(id, info) {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(fim);
      chrome.tabs.onUpdated.removeListener(fn);
      resolve(true);
    }
    chrome.tabs.onUpdated.addListener(fn);
  });
}

// Versão do content script do chat. O service worker só aceita um keeper que
// responda com esta versão; script antigo preso na aba (de antes de uma
// atualização) é substituído, e se nem a injeção resolver, a aba é recarregada
// uma vez — é o que impede o chat de continuar com o envio quebrado da 3.2.1.
const KEEPER_VERSION = 2;
const KEEPER_FIX_KEY = "rsafKeeperFix";

async function keeperReady(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: "RSAF_CHAT_STATE" });
    return !!(r?.ok && num(r.keeper, 0) >= KEEPER_VERSION);
  } catch {
    return false;
  }
}

async function ensureKeeper(tabId) {
  if (await keeperReady(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/chatkeeper.js"] });
  } catch { /* aba fechada ou sem permissão */ }
  if (await keeperReady(tabId)) return true;

  // Uma recarga por aba a cada 10 min: o manifest reinjeta o keeper novo.
  const marcas = await get(KEEPER_FIX_KEY, {});
  const agora = Date.now();
  if (agora - num(marcas[String(tabId)], 0) < 10 * 60000) return false;
  marcas[String(tabId)] = agora;
  await set({ [KEEPER_FIX_KEY]: marcas });
  try {
    await chrome.tabs.reload(tabId);
  } catch {
    return false;
  }
  await waitTabComplete(tabId);
  for (let i = 0; i < 12; i += 1) {
    if (await keeperReady(tabId)) return true;
    await delay(500);
  }
  return false;
}

async function ensureChatTab(login) {
  const querido = String(login || "").replace(/^kick:/i, "").toLowerCase();
  const lives = await loadLives();
  const tabs = await twitchTabs();

  const mesmaLive = querido ? tabs.find((t) => twitchLoginFromTab(t.url) === querido) : null;
  const conhecida = tabs.find((t) => t.id === lives.current?.tabId);
  // Com canal conhecido só serve aba daquele canal: `$jump` em outra live não
  // renova o `lastActiveAt` do jogo e ainda aparece no chat de estranhos.
  const escolhida = mesmaLive || (querido ? null : conhecida || tabs[0]);

  if (escolhida?.id) {
    try { await chrome.tabs.update(escolhida.id, { autoDiscardable: false }); } catch { /* ignore */ }
    if (escolhida.discarded) {
      try { await chrome.tabs.reload(escolhida.id); } catch { /* ignore */ }
      await waitTabComplete(escolhida.id);
    }
    return escolhida.id;
  }

  if (!querido) return null;
  try {
    const created = await chrome.tabs.create({
      url: `https://www.twitch.tv/popout/${encodeURIComponent(querido)}/chat?popout=`,
      active: false
    });
    try { await chrome.tabs.update(created.id, { muted: true }); } catch { /* ignore */ }
    try { await chrome.tabs.update(created.id, { autoDiscardable: false }); } catch { /* ignore */ }
    await waitTabComplete(created.id);
    return created.id;
  } catch {
    return null;
  }
}

async function chatTick({ force = false } = {}) {
  const cfg = await loadCfg();
  if (!cfg.running) return { sent: false, reason: "parado" };

  const c = chatCfg(cfg);
  if (!c.ligado && !force) return { sent: false, reason: "desligado" };

  const agora = Date.now();
  const chat = await loadChat();
  const humano = num(await get(CHAT_HUMAN_KEY, 0), 0);
  let clock = await afkClock(force);

  // Confere se o comando anterior renovou `lastActiveAt` de verdade. Se o bot
  // ignorar o comando, o relógio não anda e a fila troca para o próximo — em
  // vez de repetir um ping morto a noite inteira.
  if (chat.verifyAt && agora >= num(chat.verifyAt, 0) && chat.sentAt) {
    const novo = await afkClock(true);
    const andou = novo.ok && novo.lastActiveAt && novo.lastActiveAt >= num(chat.sentAt, 0) - 120000;
    const canal = String(chat.sentChannel || "");
    const mapa = canalBad(chat);
    if (novo.ok && !andou) {
      const falhou = String(chat.sentText || c.texto);
      mapa[canal] = [...new Set([...(mapa[canal] || []), falhou])];
      Object.assign(chat, {
        verifyAt: 0, sentAt: 0, badPorCanal: mapa,
        lastError: `sem efeito: ${falhou}`, retryAt: 0
      });
      const proximo = filaChat(c, chat, canal);
      if (proximo) {
        await set({ [CHAT_KEY]: chat });
        await addLog(`Chat: "${falhou}" não renovou o relógio do jogo; troco para "${proximo}".`, "warn");
        force = true;
      } else {
        // Nenhum comando conhecido funciona neste canal. Insistir de minuto em
        // minuto só faria barulho no chat alheio: para por meia hora.
        chat.retryAt = agora + CHAT_CANSADO_MS;
        await set({ [CHAT_KEY]: chat });
        await addLog(`Chat: "${falhou}" não renovou o relógio e a fila acabou em "${canal || "canal atual"}"; paro por 30 min.`, "warn");
      }
    } else if (novo.ok) {
      mapa[canal] = [];
      Object.assign(chat, { verifyAt: 0, badPorCanal: mapa, lastError: null });
      await set({ [CHAT_KEY]: chat });
      clock = novo;
    } else if (agora - num(chat.sentAt, 0) > 10 * 60000) {
      // Não deu para confirmar (token vencido, rede): depois de 10 min desiste
      // em vez de forçar um `/api/me` novo a cada minuto.
      Object.assign(chat, { verifyAt: 0, sentAt: 0, lastError: novo.reason || "relógio indisponível" });
      await set({ [CHAT_KEY]: chat });
    }
  }
  await set({ [CHAT_CLOCK_KEY]: clock });

  // Cadência: o modo manual manda no relógio; o automático usa o último terço
  // da janela do servidor. Quando `/api/me` falha, a janela da última leitura
  // continua valendo (VIP de 120 min não vira um chute de 20) e a contagem
  // segue andando pelo carimbo `readAt` em vez de congelar.
  const ultimo = Math.max(num(chat.lastAt, 0), humano);
  const janelaServidor = Math.max(5, num(clock.janela, 0) || CHAT_JANELA_PADRAO);
  const fixo = c.minutos >= 10;
  const janela = fixo ? c.minutos : janelaServidor;
  const idadeMin = num(clock.readAt, 0) ? Math.max(0, (agora - num(clock.readAt, 0)) / 60000) : 0;

  let restante;
  if (fixo) restante = ultimo ? (ultimo + janela * 60000 - agora) / 60000 : 0;
  else if (Number.isFinite(clock.restanteMin)) restante = clock.restanteMin - idadeMin;
  else if (ultimo) restante = (ultimo + janela * 60000 - agora) / 60000;
  else restante = 0; // sem relógio e sem envio anterior: um ping calibra a cadência

  const margem = fixo ? 0 : Math.max(CHAT_MARGEM_MIN, Math.round(janela * 0.3));
  const due = force || restante <= margem;
  const restanteMin = Math.round(restante);

  if (!due) {
    return { sent: false, reason: "aguardando", restanteMin, janela };
  }
  if (!force && agora < num(chat.retryAt, 0)) {
    return { sent: false, reason: "backoff", restanteMin, janela };
  }

  const lives = await loadLives();
  const login = clock.canal || lives.current?.login || "";
  // `force` aqui é o botão "Enviar agora" ou a troca de comando: nesses casos
  // vale tentar o comando configurado mesmo que ele já tenha falhado no canal.
  let texto = filaChat(c, chat, login);
  if (!texto) {
    // Fila esgotada e cooldown vencido: dá nova chance ao comando configurado
    // em vez de ficar mudo para sempre. Se ele voltar a funcionar, a
    // verificação de efeito limpa o bloqueio do canal sozinha.
    const mapa = canalBad(chat);
    mapa[login] = [];
    Object.assign(chat, { badPorCanal: mapa });
    await set({ [CHAT_KEY]: chat });
    texto = c.texto;
  }
  const tabId = await ensureChatTab(login);
  if (!tabId) {
    await addLog("Keepalive do chat sem aba da Twitch disponível.", "warn");
    return { sent: false, reason: "sem aba da Twitch", restanteMin, janela };
  }

  if (!(await ensureKeeper(tabId))) {
    await set({
      [CHAT_KEY]: { ...chat, lastAt: num(chat.lastAt, 0), fails: num(chat.fails, 0) + 1, lastError: "sem content script", retryAt: agora + CHAT_RETRY_MS }
    });
    return { sent: false, reason: "sem content script", restanteMin, janela };
  }

  let r = null;
  try {
    r = await chrome.tabs.sendMessage(tabId, { type: "RSAF_CHAT_SEND", text: texto, force });
  } catch {
    r = null;
  }

  if (!r?.ok) {
    const motivo = `${r?.reason || "sem resposta"}${r?.via ? ` (${r.via})` : ""}`;
    await set({
      [CHAT_KEY]: { ...chat, lastAt: num(chat.lastAt, 0), fails: num(chat.fails, 0) + 1, lastError: motivo, retryAt: agora + CHAT_RETRY_MS }
    });
    await addLog(`Chat: "${texto}" não saiu (${motivo}); tento em 2 min.`, "warn");
    return { sent: false, reason: motivo, retryIn: CHAT_RETRY_MS, restanteMin, janela };
  }

  // 60 s depois o próximo tick lê /api/me e confirma se `lastActiveAt` avançou.
  await set({
    [CHAT_KEY]: {
      ...chat, lastAt: agora, fails: 0, lastError: null, retryAt: 0,
      sentAt: agora, sentText: texto, sentChannel: login, verifyAt: agora + 60000
    }
  });
  const falta = restanteMin;
  const estava = clock.afk ? " (estava AFK, voltando)" : "";
  await addLog(`Chat: "${texto}" enviado em ${login || "canal atual"} (faltavam ${falta} min de AFK)${estava}.`, "ok");
  return { sent: true, at: agora, texto, restanteMin, janela };
}

/* ------------------------------- jogar sozinho --------------------------- */

// O jogo só mantém o herói em UM canal e o AFK é por relógio do servidor. O
// keepalive resolve o AFK; este módulo resolve o outro lado: entrar (ou voltar)
// no jogo sozinho — inclusive quando o navegador ficou fechado a noite inteira,
// quando o token expirou e quando a live escolhida saiu do ar.
function playCfg(cfg) {
  const p = { ...PLAY_DEFAULTS, ...(cfg?.settings?.autoPlay || {}) };
  const classe = ["auto", "guerreiro", "clerigo", "arqueiro"].includes(p.classe) ? p.classe : "auto";
  return {
    ligado: p.ligado !== false,
    classe,
    autoLive: p.autoLive !== false,
    raid: p.raid === true
  };
}

async function loadPlay() {
  return await get(PLAY_KEY, {
    jogando: false, canal: null, alvo: null, lastAt: 0, sentAt: 0, sentText: null,
    sentChannel: "", verifyAt: 0, fails: 0, lastError: null, retryAt: 0, bad: {}
  });
}

// Live alvo: a escolhida pelo jogador; sem ela, a melhor do ranking (estratégia
// configurada). Nunca abre aba só para consultar — o `ensureChatTab` é quem abre.
async function liveDoJogo(lives, autoLive, bad = {}) {
  // Escolha manual do jogador manda. A escolha automática é reavaliada a cada
  // tentativa: se a live caiu do ar, a próxima do ranking assume.
  if (lives.current?.login && !lives.current.auto) return String(lives.current.login).toLowerCase();
  if (!autoLive) return lives.current?.login ? String(lives.current.login).toLowerCase() : null;
  let lista = lives.candidates || [];
  if (!lista.length) {
    try { lista = await scanChannels({ force: true }); } catch { lista = []; }
  }
  // Live que acabou de recusar o comando fica de fora por um tempo: insistir
  // nela a noite toda quando o bot dela está fora do ar é desperdício.
  const agora = Date.now();
  const sadias = lista.filter((c) => !(num(bad[c.login], 0) > agora));
  const escolhida = (sadias.find((c) => c.open) || sadias[0] || lista.find((c) => c.open) || lista[0])?.login;
  if (!escolhida) return null;
  const atual = await loadLives();
  await saveLives({
    ...atual,
    current: { login: String(escolhida).toLowerCase(), tabId: atual.current?.tabId || null, openedAt: Date.now(), auto: true }
  });
  return String(escolhida).toLowerCase();
}

async function playTick({ force = false } = {}) {
  const cfg = await loadCfg();
  if (!cfg.running) return { sent: false, reason: "parado" };

  const p = playCfg(cfg);
  if (!p.ligado && !force) return { sent: false, reason: "desligado" };

  const agora = Date.now();
  const play = await loadPlay();

  // Confirma o `$jogar` anterior. O servidor move o personagem para o canal do
  // comando; se `currentChannel` não apareceu em 75 s, o comando não pegou.
  if (play.verifyAt && agora >= num(play.verifyAt, 0) && play.sentAt) {
    const novo = await afkClock(true);
    if (novo.ok && novo.canal) {
      Object.assign(play, {
        jogando: true, canal: novo.canal, alvo: novo.canal,
        verifyAt: 0, sentAt: 0, fails: 0, lastError: null, retryAt: 0
      });
      await set({ [PLAY_KEY]: play });
      await addLog(`Jogo: herói está em ${novo.canal}.`, "ok");
      return { sent: false, reason: "em jogo", canal: novo.canal };
    }
    if (novo.ok) {
      play.fails = num(play.fails, 0) + 1;
      play.verifyAt = 0;
      play.sentAt = 0;
      play.lastError = `sem efeito: ${play.sentText || "$jogar"}`;
      play.retryAt = agora + (play.fails >= 3 ? PLAY_MORTO_MS : PLAY_RETRY_MS);
      // A live que ignorou o `$jogar` fica em quarentena; a próxima tentativa
      // pode usar outra do ranking (só no modo automático — escolha manual é
      // do jogador e continua valendo).
      if (play.sentChannel) {
        const bad = { ...(play.bad || {}) };
        for (const [k, v] of Object.entries(bad)) if (num(v, 0) <= agora) delete bad[k];
        bad[play.sentChannel] = agora + PLAY_BAD_LIVE_MS;
        play.bad = bad;
      }
      await set({ [PLAY_KEY]: play });
      await addLog(
        `Jogo: "${play.sentText}" não colocou o herói em jogo ` +
        `(${play.fails}ª falha); tento de novo em ${play.fails >= 3 ? 20 : 5} min.`,
        "warn"
      );
      return { sent: false, reason: "sem efeito", retryAt: play.retryAt };
    }
    if (agora - num(play.sentAt, 0) > 5 * 60000) {
      play.verifyAt = 0;
      play.sentAt = 0;
      play.lastError = novo.reason || "relógio indisponível";
      await set({ [PLAY_KEY]: play });
    }
    return { sent: false, reason: "relógio indisponível" };
  }

  const clock = await afkClock(force);
  if (!clock.ok) return { sent: false, reason: clock.reason || "sem relógio" };

  if (clock.canal) {
    if (!play.jogando || play.canal !== clock.canal) {
      play.jogando = true;
      play.canal = clock.canal;
      play.alvo = clock.canal;
    }
    if (play.lastError || play.fails) {
      Object.assign(play, { fails: 0, lastError: null, retryAt: 0 });
    }
    await set({ [PLAY_KEY]: play });
    return { sent: false, reason: "em jogo", canal: clock.canal };
  }

  // `$jogar` anterior ainda dentro da janela de confirmação: esperar é
  // obrigatório, senão cada minuto manda outro comando no chat.
  if (play.verifyAt && agora < num(play.verifyAt, 0)) {
    return { sent: false, reason: "aguardando confirmação" };
  }

  if (!force && agora < num(play.retryAt, 0)) {
    return { sent: false, reason: "backoff", retryAt: play.retryAt };
  }

  const lives = await loadLives();
  const alvo = await liveDoJogo(lives, p.autoLive, play.bad || {});
  if (play.jogando || play.canal) Object.assign(play, { jogando: false, canal: null });
  if (!alvo) {
    play.lastError = "sem live online para entrar";
    play.retryAt = agora + PLAY_RETRY_MS;
    await set({ [PLAY_KEY]: play });
    return { sent: false, reason: "sem live" };
  }

  // Se o URL atual já é da live certa, reaproveita. Fora isso abre o popout em
  // segundo plano, silenciado e não descartável — nunca rouba o foco.
  const tabId = await ensureChatTab(alvo);
  if (!tabId) {
    play.lastError = "sem aba da Twitch";
    play.retryAt = agora + PLAY_RETRY_MS;
    await set({ [PLAY_KEY]: play });
    return { sent: false, reason: "sem aba" };
  }

  const texto = p.classe === "auto" ? "$jogar" : `$jogar ${p.classe}`;
  let r = null;
  try {
    r = await chrome.tabs.sendMessage(tabId, { type: "RSAF_CHAT_SEND", text: texto, force: true });
  } catch {
    r = null;
  }
  if (!r?.ok) {
    const motivo = r?.reason || "sem resposta";
    Object.assign(play, { lastError: motivo, retryAt: agora + CHAT_RETRY_MS, jogando: false });
    await set({ [PLAY_KEY]: play });
    await addLog(`Jogo: "${texto}" não saiu (${motivo}); tento em 2 min.`, "warn");
    return { sent: false, reason: motivo };
  }

  Object.assign(play, {
    jogando: false, canal: null, alvo, lastAt: agora, sentAt: agora, sentText: texto,
    sentChannel: alvo, verifyAt: agora + PLAY_VERIFY_MS, lastError: null, retryAt: 0
  });
  await set({ [PLAY_KEY]: play });
  await addLog(`Jogo: "${texto}" enviado em ${alvo}; confiro o herói em 75 s.`, "ok");
  return { sent: true, texto, canal: alvo };
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
  const [cfg, lives, status, log, token, chat, clock, play] = await Promise.all([
    loadCfg(),
    loadLives(),
    get(STATUS_KEY, {}),
    get(LOG_KEY, []),
    get(TOKEN_KEY, null),
    loadChat(),
    loadClock(),
    loadPlay()
  ]);
  return {
    running: cfg.running,
    hasToken: !!token,
    settings: cfg.settings,
    current: lives.current,
    chat,
    chatClock: clock,
    play,
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

    case "RSAF_CHAT_NOW": {
      const r = await chatTick({ force: true });
      if (!r.sent) await addLog(`Envio manual do chat não saiu: ${r.reason}.`, "warn");
      return { ...(await publicState()), chatResult: r };
    }

    case "RSAF_PLAY_NOW": {
      const r = await playTick({ force: true });
      if (!r.sent) await addLog(`Entrada manual no jogo não saiu: ${r.reason}.`, "warn");
      return { ...(await publicState()), playResult: r };
    }

    case "RSAF_RAID_CODE": {
      const code = String(msg.code || "").replace(/\D/g, "").slice(0, 8);
      if (code.length < 4) return { ok: false, reason: "código inválido" };
      const cfg = await loadCfg();
      const p = playCfg(cfg);
      if (!cfg.running || !p.raid) return { ok: false, reason: "raid desligada" };

      const ultimo = await get(RAID_KEY, { code: null, canal: null, at: 0 });
      if (ultimo.code === code && Date.now() - num(ultimo.at, 0) < PLAY_RAID_GAP_MS) {
        return { ok: false, reason: "já entrei nesse código" };
      }

      const lives = await loadLives();
      const canal = String(msg.login || ultimo.canal || lives.current?.login || "").toLowerCase();
      const tabId = await ensureChatTab(canal);
      if (!tabId) return { ok: false, reason: "sem aba da Twitch" };

      const texto = `$raid ${code}`;
      let r = null;
      try { r = await chrome.tabs.sendMessage(tabId, { type: "RSAF_CHAT_SEND", text: texto, force: true }); } catch { r = null; }
      if (!r?.ok) return { ok: false, reason: r?.reason || "sem resposta" };

      await set({ [RAID_KEY]: { code, canal, at: Date.now() } });
      await addLog(`Raid: "${texto}" enviado em ${canal || "canal atual"}.`, "ok");
      return { ok: true, texto };
    }

    case "RSAF_CHAT_STATE": {
      return { ...(await publicState()), chatResult: { sent: false, reason: "consulta" } };
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

  const agora = Date.now();
  const marca = num(await get("rsafLastTick", 0), 0);
  const dormiu = marca > 0 && agora - marca > 3 * 60 * 1000;
  await set({ rsafLastTick: agora });

  await acordarAbas();
  await ensureGameTab();
  // Entrar/voltar ao jogo vem antes do keepalive: `$jump` não coloca o herói
  // em jogo, e mandar os dois no mesmo minuto só faria barulho no chat.
  const jogo = await playTick();
  if (!jogo.sent) await chatTick();

  if (dormiu) {
    await addLog(`Voltei de suspensão (${Math.round((agora - marca) / 60000)} min parado); abas e AFK conferidos.`, "info");
  }
  await syncBadge();
});

chrome.storage.onChanged.addListener((m) => {
  if (m[KEY]) {
    syncBadge();
    syncAlarm();
  }
});

// Depois de instalar/atualizar, os content scripts das abas antigas ficam
// órfãos. Reinjeta em todas para o farm não morrer esperando um F5.
async function reidratarTudo() {
  let total = 0;
  for (const tab of await gameTabs()) {
    if (!tab.id || tab.discarded) continue;
    if (await reidratarAba(tab.id)) total++;
  }
  for (const tab of await twitchTabs()) {
    if (!tab.id || tab.discarded) continue;
    if (await ensureKeeper(tab.id)) total++;
  }
  return total;
}

async function boot() {
  await syncBadge();
  await syncAlarm();
  const total = await reidratarTudo();
  await addLog(
    total
      ? `Extensão atualizada. Scripts reinjetados em ${plural(total, "aba", "abas")}.`
      : "Extensão atualizada. Abra o site e use o painel ◆ no canto.",
    "info"
  );
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
