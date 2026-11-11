"use strict";

const $ = (id) => document.getElementById(id);
const CLASS_LABEL = { warrior: "Guerreiro", cleric: "Clérigo", archer: "Arqueiro" };

let state = null;
let localError = "";
let localErrorTimer = null;
let saveTimer = null;
let busy = false;

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("pt-BR") : "—");
const clsLabel = (c) => CLASS_LABEL[c] || (c ? String(c) : "—");

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
  } catch (e) {
    throw new Error("Não consegui falar com a extensão. Feche e abra o painel de novo.");
  }
  if (res?.error) throw new Error(res.error);
  return res;
}

function setVal(id, value) {
  const el = $(id);
  if (!el) return;
  if (document.activeElement === el) return;
  el.value = String(value ?? "");
}

function setCheck(id, value) {
  const el = $(id);
  if (el) el.checked = !!value;
}

function render() {
  const errorBox = $("errorBox");
  const err = localError || (state?.runtime?.status === "erro" ? state.runtime?.lastError : "");
  if (err) {
    errorBox.textContent = err;
    errorBox.classList.remove("hidden");
  } else {
    errorBox.classList.add("hidden");
  }

  if (!state) return;

  const status = state.runtime?.status || "parado";
  const pill = $("statusPill");
  pill.className = "pill";
  if (!state.running) {
    pill.textContent = "parado";
  } else if (status === "erro") {
    pill.textContent = "erro";
    pill.classList.add("err");
  } else if (status === "iniciando") {
    pill.textContent = "iniciando";
    pill.classList.add("wait");
  } else {
    pill.textContent = "farmando";
    pill.classList.add("on");
  }

  const btn = $("toggleBtn");
  btn.textContent = state.running ? "PARAR AUTOFARM" : "INICIAR AUTOFARM";
  btn.classList.toggle("stop", !!state.running);
  btn.disabled = busy;

  renderCharacter();
  renderCandidates();
  renderSettings();
  renderLog();

  const openLive = $("openLive");
  openLive.disabled = !state.current?.login;
  $("maintenanceBtn").disabled = busy;
}

function renderCharacter() {
  const box = $("charInfo");
  const c = state?.runtime?.character;
  box.textContent = "";

  if (!c) {
    const s = document.createElement("span");
    s.className = "muted";
    s.textContent = state?.hasToken
      ? "Sem personagem carregado. O farm busca assim que iniciar."
      : "Sem login detectado. Abra o site e entre com a Twitch.";
    box.appendChild(s);
    return;
  }

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = c.name || "Personagem";
  const cls = document.createElement("span");
  cls.className = "tag";
  cls.textContent = clsLabel(c.cls);
  name.appendChild(cls);
  if (c.afk) {
    const afk = document.createElement("span");
    afk.className = "tag afk";
    afk.textContent = "AFK";
    name.appendChild(afk);
  }
  box.appendChild(name);

  const stats = document.createElement("div");
  stats.className = "line";
  stats.append("Nv ");
  stats.appendChild(bold(fmt(c.level)));
  stats.append(" · FC ");
  stats.appendChild(bold(fmt(c.power)));
  stats.append(" · Ouro ");
  stats.appendChild(bold(fmt(c.gold)));
  box.appendChild(stats);

  const ch = document.createElement("div");
  ch.className = "line";
  if (c.channel) {
    ch.append("Jogando em ");
    ch.appendChild(bold(c.channel.name || c.channel.login));
    ch.append(` — Z${c.channel.zone ?? 0}-W${c.channel.wave ?? 0}`);
    if (c.reviveIn > 0) ch.append(` · revive em ${Math.ceil(c.reviveIn / 60)} min`);
  } else {
    ch.textContent = "Fora de uma live. O farm vai entrar na melhor.";
  }
  box.appendChild(ch);
}

function bold(text) {
  const b = document.createElement("b");
  b.textContent = text;
  return b;
}

function renderCandidates() {
  const box = $("candidates");
  box.textContent = "";
  const list = state?.runtime?.candidates || [];
  if (!list.length) {
    const s = document.createElement("span");
    s.className = "muted small";
    s.textContent = "Nenhuma live carregada. Clique em atualizar.";
    box.appendChild(s);
    return;
  }

  const currentLogin = String(state?.current?.login || "").toLowerCase();
  for (const c of list.slice(0, 5)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cand" + (String(c.login).toLowerCase() === currentLogin ? " current" : "");
    b.dataset.login = c.login;
    b.title = `Trocar para ${c.name || c.login} (zona ${c.zone}-${c.wave})`;

    const n = document.createElement("span");
    n.className = "cname";
    n.textContent = c.name || c.login;
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

function renderSettings() {
  const s = state?.settings;
  if (!s) return;
  setVal("strategy", s.strategy);
  setVal("heartbeatMin", s.heartbeatMin);
  setVal("maintenanceMin", s.maintenanceMin);
  setVal("minPlayers", s.minPlayers);
  setVal("goldReserve", s.goldReserve);
  setVal("fallbackClass", s.fallbackClass);
  setVal("switchHysteresis", s.switchHysteresis);
  setVal("sellRarity", s.sellRarity);
  setVal("sellLevel", s.sellLevel);
  setCheck("autoEquip", s.autoEquip);
  setCheck("autoGems", s.autoGems);
  setCheck("autoForge", s.autoForge);
  setCheck("autoSocket", s.autoSocket);
  setCheck("autoOrganize", s.autoOrganize);
  setCheck("autoSell", s.autoSell);
  setCheck("autoSwitch", s.autoSwitch);
  setCheck("chatOnly", s.chatOnly);
  setCheck("muteTab", s.muteTab);
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
  for (const item of list.slice(0, 40)) {
    const row = document.createElement("div");
    row.className = "entry" + (item.level === "ok" ? " ok" : item.level === "warn" ? " warn" : item.level === "error" ? " error" : "");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = new Date(item.t).toLocaleTimeString("pt-BR", { hour12: false });
    const m = document.createElement("span");
    m.textContent = item.msg;
    row.append(t, m);
    box.appendChild(row);
  }
}

async function refresh() {
  try {
    const next = await send("RSAF_GET_STATE");
    if (next) {
      state = next;
      render();
    }
  } catch (e) {
    setError(e.message);
  }
}

function gatherSettings() {
  return {
    strategy: $("strategy").value,
    heartbeatMin: Number($("heartbeatMin").value),
    maintenanceMin: Number($("maintenanceMin").value),
    minPlayers: Number($("minPlayers").value),
    goldReserve: Number($("goldReserve").value),
    fallbackClass: $("fallbackClass").value,
    switchHysteresis: Number($("switchHysteresis").value),
    sellRarity: Number($("sellRarity").value),
    sellLevel: Number($("sellLevel").value),
    autoEquip: $("autoEquip").checked,
    autoGems: $("autoGems").checked,
    autoForge: $("autoForge").checked,
    autoSocket: $("autoSocket").checked,
    autoOrganize: $("autoOrganize").checked,
    autoSell: $("autoSell").checked,
    autoSwitch: $("autoSwitch").checked,
    chatOnly: $("chatOnly").checked,
    muteTab: $("muteTab").checked
  };
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  const hint = $("saveHint");
  hint.textContent = "salvando...";
  hint.className = "muted small";
  saveTimer = setTimeout(async () => {
    try {
      const next = await send("RSAF_SAVE_SETTINGS", { settings: gatherSettings() });
      if (next) {
        state = next;
        render();
        const h = $("saveHint");
        h.textContent = "salvo";
        h.className = "small save-ok";
        setTimeout(() => {
          if ($("saveHint").textContent === "salvo") $("saveHint").textContent = "";
        }, 1800);
      }
    } catch (e) {
      setError(e.message);
    }
  }, 450);
}

function wire() {
  $("toggleBtn").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    localError = "";
    render();
    try {
      if (state?.running) {
        await send("RSAF_STOP");
      } else {
        await send("RSAF_START");
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      busy = false;
      render();
    }
  });

  $("openSite").addEventListener("click", () => send("RSAF_OPEN_SITE").catch((e) => setError(e.message)));
  $("openLive").addEventListener("click", () => send("RSAF_OPEN_LIVE").catch((e) => setError(e.message)));

  $("maintenanceBtn").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    $("maintenanceBtn").textContent = "Rodando...";
    render();
    try {
      await send("RSAF_MAINTENANCE");
      localError = "";
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      busy = false;
      $("maintenanceBtn").textContent = "Manutenção";
      render();
    }
  });

  $("refreshBtn").addEventListener("click", async () => {
    const b = $("refreshBtn");
    b.disabled = true;
    b.textContent = "buscando...";
    try {
      const next = await send("RSAF_REFRESH_CHANNELS");
      if (next) {
        state = next;
        render();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      b.disabled = false;
      b.textContent = "atualizar";
    }
  });

  $("candidates").addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".cand");
    if (!btn || busy) return;
    const login = btn.dataset.login;
    if (!login) return;
    busy = true;
    localError = "";
    render();
    try {
      const next = await send("RSAF_SWITCH_CHANNEL", { login });
      if (next) {
        state = next;
        render();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      busy = false;
      render();
    }
  });

  $("clearLog").addEventListener("click", async () => {
    try {
      const next = await send("RSAF_RESET_LOG");
      if (next) {
        state = next;
        render();
      }
    } catch (e) {
      setError(e.message);
    }
  });

  $("testChatBtn").addEventListener("click", async () => {
    const b = $("testChatBtn");
    b.disabled = true;
    b.textContent = "Testando...";
    try {
      await send("RSAF_TEST_CHAT");
      setError("");
      $("saveHint").textContent = "chat ok";
      $("saveHint").className = "small save-ok";
      setTimeout(() => { $("saveHint").textContent = ""; }, 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      b.disabled = false;
      b.textContent = "Testar chat";
    }
  });

  for (const el of document.querySelectorAll(
    "#strategy, #heartbeatMin, #maintenanceMin, #minPlayers, #goldReserve, #fallbackClass, " +
    "#switchHysteresis, #sellRarity, #sellLevel, #autoEquip, #autoGems, #autoForge, #autoSocket, " +
    "#autoOrganize, #autoSell, #autoSwitch, #chatOnly, #muteTab"
  )) {
    el.addEventListener("change", scheduleSave);
    if (el.tagName === "INPUT" && el.type === "number") {
      el.addEventListener("input", scheduleSave);
    }
  }
}

wire();
refresh();
setInterval(refresh, 2000);
