"use strict";

const $ = (id) => document.getElementById(id);
const KEY = "rsaf";
const CLASS_LABEL = { warrior: "Guerreiro", cleric: "Clérigo", archer: "Arqueiro" };

let state = null;
let cfg = { running: false, settings: {} };
let localError = "";
let localErrorTimer = null;
let saveTimer = null;
let busy = false;

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("pt-BR") : "—");
const clsLabel = (c) => CLASS_LABEL[c] || (c ? String(c) : "—");
const timeLabel = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour12: false });

function defaults() {
  return {
    equip: true,
    forge: {
      ligado: false,
      raridades: { comum: true, incomum: true, raro: false, epico: false, lendario: false },
      tipos: { arma: true, elmo: true, armadura: true, anel: true },
      minLevel: 0, maxLevel: 9999
    },
    stats: {
      ligado: true, modo: "igual",
      sel: { forca: true, vitalidade: true, defesa: true, agilidade: true, sorte: true },
      metas: {}
    },
    gems: { ligado: true, juntar: true, suprema: false },
    socket: { ligado: false },
    enhance: { ligado: false },
    sell: { ligado: false, rarity: 2, level: 40 },
    lote: { ligado: false, rarity: 2, level: 40 },
    organize: true,
    roleta: { ligada: false, vel: 4 },
    goldReserve: 50000,
    theme: "dark",
    font: 12
  };
}

function merge(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      merge(base[k], v);
    } else if (v !== undefined) {
      base[k] = v;
    }
  }
  return base;
}

function setError(message) {
  localError = message || "";
  if (localErrorTimer) clearTimeout(localErrorTimer);
  if (localError) {
    localErrorTimer = setTimeout(() => {
      localError = "";
      render();
    }, 12000);
  }
  render();
}

async function send(type, extra = {}) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type, ...extra });
  } catch {
    throw new Error("Não consegui falar com a extensão. Feche e abra o painel de novo.");
  }
  if (res?.error) throw new Error(res.error);
  return res;
}

function setVal(id, value) {
  const el = $(id);
  if (!el || document.activeElement === el) return;
  el.value = String(value ?? "");
}

function setCheck(id, value) {
  const el = $(id);
  if (el && document.activeElement !== el) el.checked = !!value;
}

function applyAppearance(s) {
  const dark = s?.theme !== "light";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const size = Math.min(18, Math.max(10, Number(s?.font) || 12));
  document.documentElement.style.setProperty("--font-size", `${size}px`);
}

function render() {
  const errorBox = $("errorBox");
  if (localError) {
    errorBox.textContent = localError;
    errorBox.className = "alert";
  } else {
    errorBox.className = "alert hidden";
  }

  if (!state) return;

  const running = !!cfg.running;
  const algumModulo = cfg.settings?.equip || cfg.settings?.forge?.ligado ||
    cfg.settings?.stats?.ligado || cfg.settings?.gems?.ligado ||
    cfg.settings?.socket?.ligado || cfg.settings?.enhance?.ligado ||
    cfg.settings?.sell?.ligado || cfg.settings?.lote?.ligado;

  const pill = $("statusPill");
  pill.className = "pill";
  if (!running) {
    pill.textContent = "parado";
  } else if (!algumModulo) {
    pill.textContent = "sem módulos";
    pill.classList.add("wait");
  } else {
    pill.textContent = "ligado";
    pill.classList.add("on");
  }

  setCheck("farmSwitch", running);
  $("masterHint").textContent = running
    ? (algumModulo ? "Ligado — manutenção a cada ~30 s" : "Ligado, mas nenhum módulo marcado")
    : "Desligado — nada é enviado ao jogo";

  applyAppearance(cfg.settings);

  renderCharacter();
  renderCandidates();
  renderModules();
  renderSettings();
  renderLog();

  $("openLive").disabled = !state.current?.login;
  $("maintenanceBtn").disabled = busy;
  $("scanBtn").disabled = busy;
}

function renderCharacter() {
  const box = $("charInfo");
  const c = state?.runtime?.character;
  box.textContent = "";

  if (!c) {
    const s = document.createElement("span");
    s.className = "muted";
    s.textContent = state?.hasToken
      ? "Sem personagem carregado. Entre em uma live e use $jogar no chat."
      : "Sem login detectado. Abra o site e entre com a Twitch.";
    box.appendChild(s);
    $("charAt").textContent = "";
    return;
  }

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = c.name || "Personagem";
  const cls = document.createElement("span");
  cls.className = "tag";
  cls.textContent = clsLabel(c.cls);
  name.appendChild(cls);
  box.appendChild(name);

  const stats = document.createElement("div");
  stats.className = "line";
  stats.innerHTML = `Nv <b>${fmt(c.level)}</b> · FC <b>${fmt(c.power)}</b> · Ouro <b>${fmt(c.gold)}</b>`;
  box.appendChild(stats);

  const extra = document.createElement("div");
  extra.className = "line muted small";
  extra.textContent = `${fmt(c.items)} itens · ${fmt(c.gems)} gemas`;
  box.appendChild(extra);

  $("charAt").textContent = c.at ? `atualizado ${timeLabel(c.at)}` : "";
}

function renderCandidates() {
  const box = $("candidates");
  box.textContent = "";
  const list = state?.runtime?.candidates || [];
  const scanError = state?.runtime?.scanError;

  const at = state?.runtime?.scanAt || 0;
  $("scanAt").textContent = at ? `busca às ${timeLabel(at)}` : "nunca buscou";

  if (!list.length) {
    const s = document.createElement("span");
    s.className = "muted small";
    s.textContent = scanError
      ? scanError
      : "Clique em “Procurar lives” para ver as opções.";
    box.appendChild(s);
    return;
  }

  const currentLogin = String(state?.current?.login || "").toLowerCase();
  for (const c of list.slice(0, 8)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cand" + (String(c.login).toLowerCase() === currentLogin ? " current" : "");
    b.dataset.login = c.login;
    b.title = `Abrir o chat de ${c.name || c.login} (zona ${c.zone}-${c.wave})`;

    const n = document.createElement("span");
    n.className = "cname";
    n.textContent = c.name || c.login;
    if (c.open) {
      const badge = document.createElement("span");
      badge.className = "cbadge";
      badge.textContent = "aberta";
      n.appendChild(badge);
    }
    const z = document.createElement("span");
    z.className = "czone";
    z.textContent = `Z${c.zone ?? 0}-W${c.wave ?? 0}`;
    const p = document.createElement("span");
    p.className = "cplayers";
    p.textContent = fmt(c.playersNow ?? 0);

    b.append(n, z, p);
    box.appendChild(b);
  }
}

const MODULOS = [
  ["Equipar o mais forte", (x) => !!x.equip, "equip"],
  ["Forja", (x) => x.forge?.ligado, "forja"],
  ["Atributos", (x) => x.stats?.ligado, "up"],
  ["Gemas", (x) => x.gems?.ligado, "gem"],
  ["Engaste", (x) => x.socket?.ligado, "socket"],
  ["Aprimoramento", (x) => x.enhance?.ligado, "enhance"],
  ["Venda individual", (x) => x.sell?.ligado, "sell"]
];

function renderModules() {
  const box = $("moduleList");
  box.textContent = "";
  const st = cfg.settings || defaults();
  const status = state?.status || {};

  for (const [nome, ligado, chave] of MODULOS) {
    const on = !!ligado(st);
    const item = document.createElement("div");
    item.className = "module";
    const dot = document.createElement("span");
    dot.className = "mdot" + (on ? " on" : "");
    const txt = document.createElement("div");
    txt.className = "mtxt";
    const b = document.createElement("b");
    b.textContent = nome;
    const small = document.createElement("small");
    small.textContent = status[chave] || (on ? "Aguardando rodada..." : "Desligado");
    txt.append(b, small);
    item.append(dot, txt);
    box.appendChild(item);
  }
}

function renderSettings() {
  const st = cfg.settings || defaults();
  setVal("strategy", st.strategy || "zone");
  setVal("minPlayers", st.minPlayers ?? 3);
  setVal("theme", st.theme === "light" ? "light" : "dark");
  setVal("font", st.font ?? 12);
  setVal("goldReserve", st.goldReserve ?? 0);
  setVal("chatMode", st.chatOnly === false ? "live" : "chat");
  setCheck("muteTab", st.muteTab !== false);
}

function renderLog() {
  const box = $("log");
  box.textContent = "";
  const list = state?.log || [];
  if (!list.length) {
    const s = document.createElement("span");
    s.className = "muted small";
    s.textContent = "Sem eventos ainda.";
    box.appendChild(s);
    return;
  }
  for (const entry of list.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "entry" + (entry.level === "ok" ? " ok" : entry.level === "warn" ? " warn" : entry.level === "error" ? " error" : "");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = timeLabel(entry.t);
    const m = document.createElement("span");
    m.textContent = entry.msg;
    row.append(t, m);
    box.appendChild(row);
  }
}

/* -------------------------------- ações -------------------------------- */

async function refresh() {
  const stored = await chrome.storage.local.get(KEY);
  if (stored[KEY]) {
    cfg = {
      running: stored[KEY].running === true,
      settings: merge(defaults(), stored[KEY].settings || {})
    };
  }
  try {
    state = await send("RSAF_GET_STATE");
    if (state?.settings) cfg.settings = merge(cfg.settings, state.settings);
    if (typeof state?.running === "boolean") cfg.running = state.running;
  } catch (e) {
    setError(e.message);
  }
  render();
}

let cfgTimer = null;
function scheduleSave() {
  clearTimeout(cfgTimer);
  $("saveHint").textContent = "salvando...";
  cfgTimer = setTimeout(async () => {
    await chrome.storage.local.set({ [KEY]: { running: cfg.running, settings: cfg.settings } });
    $("saveHint").textContent = "salvo ✓";
    setTimeout(() => { $("saveHint").textContent = ""; }, 1600);
    render();
  }, 260);
}

function gatherSettings() {
  const st = cfg.settings;
  st.strategy = $("strategy").value;
  st.minPlayers = Number($("minPlayers").value);
  st.theme = $("theme").value;
  st.font = Number($("font").value);
  st.goldReserve = Number($("goldReserve").value);
  st.chatOnly = $("chatMode").value === "chat";
  st.muteTab = $("muteTab").checked;
  return st;
}

function wire() {
  $("farmSwitch").addEventListener("change", async (e) => {
    try {
      state = await send("RSAF_SET_RUNNING", { running: e.target.checked });
      cfg.running = e.target.checked;
      render();
    } catch (err) {
      setError(err.message);
      e.target.checked = !e.target.checked;
    }
  });

  $("scanBtn").addEventListener("click", async () => {
    busy = true;
    render();
    try {
      state = await send("RSAF_SCAN");
    } catch (e) {
      setError(e.message);
    } finally {
      busy = false;
      render();
    }
  });

  $("candidates").addEventListener("click", async (e) => {
    const b = e.target.closest(".cand");
    if (!b) return;
    try {
      state = await send("RSAF_OPEN_CHANNEL", { login: b.dataset.login });
      render();
    } catch (err) {
      setError(err.message);
    }
  });

  $("openPanel").addEventListener("click", async () => {
    try { await send("RSAF_OPEN_PANEL"); } catch (e) { setError(e.message); }
  });

  $("openSite").addEventListener("click", async () => {
    try { await send("RSAF_OPEN_SITE"); } catch (e) { setError(e.message); }
  });

  $("openLive").addEventListener("click", async () => {
    try { await send("RSAF_OPEN_LIVE"); } catch (e) { setError(e.message); }
  });

  $("maintenanceBtn").addEventListener("click", async () => {
    busy = true;
    render();
    try {
      state = await send("RSAF_MAINTENANCE");
      if (!state?.dispatched) {
        setError("Abra riftstream.com.br numa aba para a rodada acontecer.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      busy = false;
      render();
    }
  });

  $("clearLog").addEventListener("click", async () => {
    try { state = await send("RSAF_CLEAR_LOG"); render(); } catch (e) { setError(e.message); }
  });

  for (const id of ["strategy", "minPlayers", "theme", "font", "goldReserve", "chatMode", "muteTab"]) {
    const el = $(id);
    el.addEventListener("change", () => {
      gatherSettings();
      scheduleSave();
    });
    if (el.tagName === "INPUT" && el.type === "number") {
      el.addEventListener("input", () => {
        gatherSettings();
        scheduleSave();
      });
    }
  }
}

wire();
refresh();
setInterval(refresh, 2500);
