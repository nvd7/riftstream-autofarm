"use strict";

/*
 * RiftStream AutoFarm — painel flutuante (dentro do site do jogo)
 * =========================================================================
 * UI em Shadow DOM para não brigar com o CSS do RiftStream. Fala com a
 * engine apenas por chrome.storage.local.
 *
 * Layout: dock vertical — trilho de módulos à esquerda, conteúdo à direita,
 * ticker de rodada no rodapé. Paleta menta/ciano, números em fonte mono.
 * ========================================================================= */

(() => {
  if (document.getElementById("rsaf-panel")) return;

  const KEY = "rsaf";
  const STATS_KEY = "rsafStats";
  const STATUS_KEY = "rsafStatus";
  const UI_KEY = "rsafPanel";
  const PLAY_KEY = "rsafPlay";
  const CHAT_KEY = "rsafChat";
  const CHAT_CLOCK_KEY = "rsafChatClock";

  // Lê a versão direto do manifest para nunca ficar defasada no rodapé.
  let VERSION = "2.7.2";
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
      VERSION = chrome.runtime.getManifest().version || VERSION;
    }
  } catch {}
  const RARIDADES = [
    ["comum", "Comum", "#4de3b0"],
    ["incomum", "Incomum", "#5cc8ff"],
    ["raro", "Raro", "#9d8bff"],
    ["epico", "Épico ⚠", "#ffb454"],
    ["lendario", "Lendário ⚠", "#ff7a7a"],
    ["imortal", "Imortal ⚠", "#ff2d3d"]
  ];
  const TIPOS = [["arma", "Arma"], ["elmo", "Elmo"], ["armadura", "Armadura"], ["anel", "Anel"]];
  const ATRIBUTOS = [
    ["forca", "Força"], ["vitalidade", "Vitalidade"], ["defesa", "Defesa"],
    ["agilidade", "Agilidade"], ["sorte", "Sorte"]
  ];

  function defaults() {
    return {
      running: false,
      settings: {
        auto: false,
        equip: true,
        forge: {
          ligado: true,
          auto: true,
          raridades: { comum: true, incomum: true, raro: true, epico: true, lendario: true, imortal: true },
          tipos: { arma: true, elmo: true, armadura: true, anel: true },
          minLevel: 0,
          maxLevel: 9999,
          useScroll: true,
          estrategia: "bruto",
          chanceMinima: 0,
          arcano: true
        },
        stats: {
          ligado: true, modo: "otimo", foco: "fc",
          sel: { forca: true, vitalidade: true, defesa: true, agilidade: true, sorte: true },
          metas: {}
        },
        gems: { ligado: true, juntar: true, suprema: false },
        socket: { ligado: true },
        enhance: { ligado: true },
        sell: { ligado: true, rarity: 2, level: 9999 },
        lote: { ligado: false, rarity: 2, level: 40 },
        organize: true,
        roleta: { ligada: false, vel: 4 },
        goldReserve: 0,
        theme: "riftviolet",
        font: 12,
        alchemy: {
          ligado: true,
          reciclar: true,
          criar: true,
          subirNivel: true,
          slotAlvo: "arma",
          raridadeAlvo: 2
        },
        transmog: {
          ligado: true,
          alvoSlot: "arma",
          fonteSlot: "arma"
        },
        autoPlay: { ligado: true, classe: "auto", autoLive: true, raid: false },
        chatKeep: { ligado: true, minutos: 0, texto: "$jump" }
      }
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

  // O autosell do site não conhece a reserva da forja. Em configurações
  // antigas ele pode ter ficado ligado junto com o modo automático; o painel
  // mostra o mesmo estado efetivo que a engine aplica.
  function ajustarConflitosAuto() {
    if (cfg.settings.auto && cfg.settings.lote?.ligado) cfg.settings.lote.ligado = false;
  }

  const store = chrome.storage.local;
  let cfg = defaults();
  let stats = { forjaTotal: 0, forjaPerdidos: 0, equipTotal: 0, vendidos: 0, aprimorados: 0, gemTotais: {}, upNiveis: {}, upGasto: {},
    alchemyCriados: 0, alchemyReciclados: 0, alchemyUpados: 0, transmogFeitos: 0 };
  let status = {
    forja: "", up: "", gem: "", equip: "", sell: "", enhance: "", socket: "", organize: "",
    alchemy: "", transmog: "",
    character: null, lastAction: "", updatedAt: 0, counts: { forja: 0, venda: 0, alchemy: 0, transmog: 0 }, roundAt: 0
  };
  let ui = { aberto: true, aba: "inicio", x: null, y: null, minimizado: false };
  // Estado do "entrar no jogo sozinho", escrito pelo service worker.
  let play = { jogando: false, canal: null, verifyAt: 0, fails: 0, lastError: null };
  // Estado do keepalive do chat e da última leitura de `/api/me`.
  let chat = { lastAt: 0, sentAt: 0, sentText: null, sentChannel: "", verifyAt: 0, lastError: null, retryAt: 0 };
  let clock = { ok: false, readAt: 0, restanteMin: null, janela: null, afk: null, canal: null, reason: null };

  const host = document.createElement("div");
  host.id = "rsaf-panel";
  host.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;display:block";
  const raiz = host.attachShadow({ mode: "open" });

  raiz.innerHTML = `
  <style>
    :host, * { box-sizing: border-box; }
    .app{
      --fs:12px;
      --bg:#07060c; --bg2:#0e0b18; --surface:#141021; --surface2:#1d1730;
      --line:#2b2342; --line2:#3d2f5c; --text:#f6f3ff; --muted:#9a90b8;
      --mint:#a06bff; --mint-dim:#a06bff22; --cyan:#ff5fd2; --red:#ff5c8a;
      --mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
      --shadow:0 24px 70px #000000e6, 0 0 0 1px #a06bff1f;
      font:var(--fs)/1.45 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;
      color:var(--text);
    }
    .bubble{
      display:none; width:48px; height:48px; border-radius:13px; border:1px solid var(--line2);
      background:linear-gradient(145deg,var(--surface2),var(--bg2)); color:var(--mint);
      font-size:20px; cursor:pointer; box-shadow:var(--shadow);
      align-items:center; justify-content:center;
    }
    .bubble:hover{ transform:translateY(-2px); }

    .shell{
      display:none; width:430px; max-width:calc(100vw - 20px);
      max-height:min(660px,calc(100vh - 24px)); overflow:hidden;
      border-radius:14px; border:1px solid var(--line2);
      background:var(--bg); box-shadow:var(--shadow);
      flex-direction:column;
    }
    /* Fundo "SynEx": ondas violeta/rosa + estrelas, atrás de todo o conteúdo. */
    .waves{ position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:0; }
    .waves svg{ position:absolute; left:-12%; right:-12%; bottom:-2px; width:124%; height:62%; opacity:.55; }
    .waves .stars{
      position:absolute; inset:0;
      background-image:
        radial-gradient(1px 1px at 12% 18%, #ffffffcc 50%, transparent 50%),
        radial-gradient(1px 1px at 27% 72%, #c9a0ffaa 50%, transparent 50%),
        radial-gradient(1.5px 1.5px at 48% 34%, #ffffff99 50%, transparent 50%),
        radial-gradient(1px 1px at 63% 61%, #ff5fd2aa 50%, transparent 50%),
        radial-gradient(1px 1px at 78% 23%, #ffffff88 50%, transparent 50%),
        radial-gradient(1.5px 1.5px at 89% 79%, #a06bffaa 50%, transparent 50%);
      opacity:.7;
    }
    .app{
      position:relative;
    }
    .shell{
      position:relative;
      border-color:#a06bff40;
      box-shadow:var(--shadow), 0 0 28px #a06bff1a;
    }
    .head, .work, .ticker{ position:relative; z-index:1; }

    /* Identidade visual "SynEx": badge de processo e CTA em gradiente. */
    @keyframes synSheen{ to{ background-position:-230% 0; } }
    .badge{
      display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:20px;
      border:1px solid #a06bff55; background:#a06bff1c;
      color:#d9c6ff; font:700 8.5px/1 var(--mono); letter-spacing:1.1px; text-transform:uppercase;
    }
    .badge i{ width:6px; height:6px; border-radius:50%; background:var(--mint); box-shadow:0 0 8px var(--mint); }
    .badge.work i{ background:var(--cyan); box-shadow:0 0 8px var(--cyan); animation:pulse 1.1s infinite; }

    .head{
      display:flex; align-items:center; gap:10px; padding:9px 10px 9px 12px; cursor:grab;
      background:linear-gradient(100deg,#1b1230 0%,#0e0b18 42%,#26143c 58%,#0e0b18 74%,#1b1230 100%);
      background-size:230% 100%;
      animation:synSheen 9s linear infinite;
      border-bottom:1px solid #3d2f5c; user-select:none; flex:none;
    }
    .head:active{ cursor:grabbing; }
    .brand{ display:flex; align-items:center; gap:9px; flex:1; min-width:0; }
    .logo{
      width:28px; height:28px; border-radius:7px; display:grid; place-items:center;
      background:linear-gradient(145deg,#a06bff,#ff5fd2); color:#0a0512;
      font:800 15px/1 var(--mono); box-shadow:0 0 18px #a06bff66;
    }
    .brand b{ display:block; font:700 11.5px/1.15 var(--mono); letter-spacing:1.6px; }
    .brand small{ display:block; font:600 8.5px/1.2 var(--mono); letter-spacing:1.8px; color:var(--muted); margin-top:2px; }
    .head-actions{ display:flex; align-items:center; gap:5px; }
    .icon{
      width:24px; height:24px; border-radius:6px; border:1px solid var(--line);
      background:var(--surface); color:var(--muted); cursor:pointer; font-size:12px; line-height:1;
      display:grid; place-items:center; transition:.15s;
    }
    .icon:hover{ color:var(--mint); border-color:var(--mint); }
    .dot{ width:7px; height:7px; border-radius:50%; background:#4a3c66; flex:none; }
    .dot.on{ background:var(--mint); box-shadow:0 0 9px var(--mint); }
    .dot.work{ background:var(--cyan); box-shadow:0 0 9px var(--cyan); animation:pulse 1.1s infinite; }
    @keyframes pulse{ 50%{ opacity:.3 } }

    .work{ display:grid; grid-template-columns:64px minmax(0,1fr); min-height:0; flex:1; }

    .rail{
      display:flex; flex-direction:column; gap:3px; padding:8px 6px;
      background:var(--bg2); border-right:1px solid var(--line); flex:none;
    }
    .tab{
      position:relative; display:flex; flex-direction:column; align-items:center; gap:3px;
      padding:8px 2px 7px; border:1px solid transparent; border-left:2px solid transparent;
      border-radius:7px; background:transparent; color:var(--muted);
      font:600 8.5px/1.1 var(--mono); letter-spacing:.5px; text-transform:uppercase;
      cursor:pointer; transition:.14s;
    }
    .tab .ico{ font-size:14px; line-height:1; }
    .tab:hover{ color:var(--text); background:var(--surface); }
    .tab.on{
      color:var(--text); background:linear-gradient(90deg,#a06bff26,var(--surface2) 75%);
      border-left-color:var(--mint); box-shadow:inset 0 0 0 1px #a06bff38;
    }
    .tab.on .ico{ color:var(--mint); text-shadow:0 0 8px #a06bff88; }
    .tab i{ position:absolute; top:7px; right:9px; width:5px; height:5px; border-radius:50%; background:#4a3c66; }
    .tab i.vivo{ background:var(--mint); box-shadow:0 0 6px var(--mint); }
    .rail .spacer{ flex:1; }
    .rail .ver{ font:600 8px/1 var(--mono); color:#5c4d7d; text-align:center; padding-bottom:2px; }

    .main{ display:flex; flex-direction:column; min-width:0; min-height:0; }

    .power{
      display:flex; align-items:center; gap:10px; padding:9px 11px; flex:none;
      background:linear-gradient(90deg,var(--mint-dim),transparent);
      border-bottom:1px solid var(--line);
    }
    .power-txt{ flex:1; min-width:0; }
    .power-txt b{ display:block; font:700 10px/1.2 var(--mono); letter-spacing:1.2px; text-transform:uppercase; }
    .power-txt small{ display:block; font-size:10px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }

    .body{ padding:11px; overflow-y:auto; min-height:0; flex:1; }
    .body::-webkit-scrollbar{ width:7px; }
    .body::-webkit-scrollbar-thumb{ background:var(--line2); border-radius:6px; }
    .panel{ display:none; animation:in .16s ease-out; }
    .panel.on{ display:block; }
    @keyframes in{ from{ opacity:0; transform:translateY(4px) } }

    h3{
      margin:14px 0 6px; font:700 9px/1.2 var(--mono); letter-spacing:1.3px;
      text-transform:uppercase; color:var(--muted);
    }
    h3:first-child{ margin-top:0; }

    .row{
      display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:7px;
      background:var(--surface2); border:1px solid var(--line);
      border-left:2px solid transparent; font-weight:600; font-size:11.5px;
    }
    .row + .row{ margin-top:5px; }
    .row .grow{ flex:1; min-width:0; }
    .row small{ display:block; color:var(--muted); font-weight:500; font-size:10px; }

    .sw{
      position:relative; width:38px; height:20px; flex:none; border:1px solid var(--line2);
      border-radius:5px; background:var(--bg); cursor:pointer; transition:.16s;
    }
    .sw::after{
      content:""; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:3px;
      background:var(--muted); transition:left .16s, background .16s;
    }
    .sw.on{ background:var(--mint-dim); border-color:var(--mint); }
    .sw.on::after{ left:20px; background:var(--mint); box-shadow:0 0 8px var(--mint); }

    .chips{ display:flex; flex-wrap:wrap; gap:5px; }
    .chip{
      padding:5px 9px; border:1px solid var(--line2); border-radius:5px; background:transparent;
      color:var(--muted); font:600 10px/1 var(--mono); cursor:pointer; transition:.14s;
    }
    .chip:hover{ color:var(--text); border-color:var(--mint); }
    .chip.on{ background:var(--mint-dim); color:var(--c,var(--mint)); border-color:var(--c,var(--mint)); }

    .seg{ display:grid; grid-template-columns:1fr 1fr; margin:7px 0; border:1px solid var(--line2); border-radius:6px; overflow:hidden; }
    .seg button{ padding:7px 4px; border:0; background:transparent; color:var(--muted); font:600 10px/1 var(--mono); cursor:pointer; }
    .seg button.on{ background:var(--mint-dim); color:var(--mint); }

    /* Cartão de identidade do tema único — sem seletor, só informação. */
    .identity{
      display:flex; align-items:center; gap:9px; padding:9px 10px; margin:7px 0 3px;
      border:1px solid var(--line2); border-radius:9px;
      background:linear-gradient(120deg,#a06bff1f,#ff5fd214 55%,transparent);
    }
    .identity .mark{
      width:30px; height:30px; border-radius:8px; flex:none; display:grid; place-items:center;
      background:linear-gradient(145deg,#a06bff,#ff5fd2); color:#0a0512;
      font:800 14px/1 var(--mono); box-shadow:0 0 16px #a06bff55;
    }
    .identity b{ display:block; font:700 10px/1.2 var(--mono); letter-spacing:1.2px; }
    .identity small{ display:block; color:var(--muted); font:9.5px/1.3 var(--mono); margin-top:2px; }

    .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:7px; }
    .field{ display:flex; flex-direction:column; gap:4px; color:var(--muted); font:600 9px/1.2 var(--mono); letter-spacing:.4px; text-transform:uppercase; }
    .field input, .field select{
      width:100%; padding:6px 8px; border:1px solid var(--line2); border-radius:6px;
      background:var(--bg); color:var(--text); font:11.5px/1.2 var(--mono);
      text-transform:none; letter-spacing:0;
    }
    .field input:focus, .field select:focus{ outline:0; border-color:var(--mint); box-shadow:0 0 0 2px var(--mint-dim); }
    .field input:disabled{ opacity:.45; }
    input[type=range]{ accent-color:var(--mint); width:100%; }

    .meta{ display:grid; grid-template-columns:1fr 54px 72px; align-items:center; gap:7px; padding:3px 0; font-size:11px; }
    .meta span{ color:var(--muted); }
    .meta .nv{ text-align:right; color:var(--muted); font:10px var(--mono); }
    .meta input{
      width:100%; padding:4px 6px; border:1px solid var(--line2); border-radius:5px;
      background:var(--bg); color:var(--text); font:11px var(--mono); text-align:right;
    }
    .meta input:focus{ outline:0; border-color:var(--mint); }

    .statusbox{
      margin-top:11px; padding:9px 10px; border-radius:7px; border:1px solid var(--line);
      background:var(--surface2); border-left:2px solid var(--mint);
      font-size:11px; color:var(--text); word-break:break-word;
    }
    .statusbox small{ display:block; margin-top:3px; color:var(--muted); font:9.5px var(--mono); }
    .statusbox .by{ color:var(--mint); font-weight:700; }

    .risk{ margin:8px 0 0; padding:6px 8px; border-radius:5px; background:#ff5c8a1c; color:#ffa3bd; font-size:10.5px; }
    .hint{ margin:6px 0 0; color:var(--muted); font-size:10.5px; line-height:1.45; }

    .hero{
      padding:11px; border-radius:8px; border:1px solid var(--line2);
      background:linear-gradient(135deg,var(--surface2),var(--surface));
      position:relative; overflow:hidden;
    }
    .hero::after{
      content:""; position:absolute; inset:auto -30px -46px auto; width:120px; height:120px;
      border:1px solid var(--line2); border-radius:50%; opacity:.5;
    }
    .hero-top{ display:flex; align-items:baseline; gap:7px; position:relative; z-index:1; }
    .hero-top b{ font-size:13px; }
    .hero-top span{ color:var(--mint); font:600 9px var(--mono); text-transform:uppercase; letter-spacing:1px; }
    .hero-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; position:relative; z-index:1; }
    .hero-grid div{ background:#00000033; border:1px solid var(--line); border-radius:6px; padding:6px 8px; }
    .hero-grid span{ display:block; color:var(--muted); font:600 8.5px var(--mono); letter-spacing:.8px; text-transform:uppercase; }
    .hero-grid b{ display:block; font:700 13px var(--mono); margin-top:2px; }

    .diag{
      display:flex; gap:6px; margin-top:9px;
    }
    .diag div{ flex:1; padding:7px 8px; border-radius:6px; border:1px dashed var(--line2); background:transparent; }
    .diag b{ display:block; font:700 14px var(--mono); color:var(--mint); }
    .diag span{ display:block; font:600 8.5px var(--mono); color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }

    .list{ display:flex; flex-direction:column; gap:4px; margin-top:10px; }
    .item{
      display:flex; align-items:center; gap:8px; padding:6px 9px; border-radius:6px;
      background:var(--surface); border:1px solid var(--line); font-size:10.5px;
    }
    .item .t{ flex:1; min-width:0; }
    .item .t small{ display:block; color:var(--muted); font-size:9.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .item .s{ width:6px; height:6px; border-radius:50%; background:#3d5a51; flex:none; }
    .item .s.on{ background:var(--mint); box-shadow:0 0 6px var(--mint); }

    .counters{ display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:10px; }
    .counters div{ padding:7px; border-radius:6px; background:var(--surface); border:1px solid var(--line); text-align:center; }
    .counters b{ display:block; font:700 13px var(--mono); color:var(--mint); }
    .counters span{ display:block; color:var(--muted); font:600 8px var(--mono); text-transform:uppercase; letter-spacing:.4px; }

    .warn{ margin:11px 0 0; color:var(--muted); font-size:9.5px; line-height:1.4; border-left:2px solid var(--mint); padding-left:8px; }

    /* Aba Auto: painel central estilo SynEx — título, badge e CTA roxo. */
    .autoHero{
      padding:16px 13px 14px; border-radius:11px; border:1px solid #a06bff33;
      text-align:center;
      background:
        radial-gradient(120% 140% at 50% 0%, #a06bff24, transparent 62%),
        linear-gradient(160deg,#1b1430,#0e0b18 78%);
    }
    .autoHero .eyebrow{
      display:block; font:700 8px/1 var(--mono); letter-spacing:2px;
      text-transform:uppercase; color:#c9a0ff; margin-bottom:8px;
    }
    .autoHero h1{
      margin:0; font:700 16px/1.25 ui-sans-serif,system-ui,sans-serif;
      letter-spacing:-.3px; color:#fff;
    }
    .autoHero p{ margin:6px 0 0; font-size:10px; line-height:1.5; color:var(--muted); }
    .autoHero .badge{ margin-top:11px; }
    .autoBtn{
      display:flex; align-items:center; justify-content:center; gap:9px; width:100%; margin-top:12px;
      padding:13px 14px; border-radius:10px; cursor:pointer; text-align:center;
      border:1px solid #c9a0ff; color:#fff; font:800 11px/1 var(--mono); letter-spacing:1.2px;
      background:linear-gradient(100deg,#7c3aed 0%,#a855f7 48%,#d946ef 100%);
      box-shadow:0 8px 24px #7c3aed4d, inset 0 1px 0 #ffffff40;
      transition:.16s;
    }
    .autoBtn:hover{ filter:brightness(1.09); box-shadow:0 10px 32px #a855f770; transform:translateY(-1px); }
    .autoBtn .ai{ font-size:14px; }
    .autoBtn.on{ border-color:var(--red); background:linear-gradient(100deg,#7c3aed,#ff5c8a); }
    .autoBtn.on .ai{ animation:autoPulse 1.8s ease-in-out infinite; }
    @keyframes autoPulse{ 50%{ opacity:.5; } }
    .autoStop{
      width:100%; margin-top:8px; padding:9px; border-radius:8px; cursor:pointer;
      border:1px solid var(--line2); background:transparent; color:var(--muted);
      font:600 10px var(--mono); letter-spacing:.6px; text-transform:uppercase;
    }
    .autoStop:hover{ color:var(--text); border-color:var(--red); }
    .playBtn{
      width:100%; margin-top:8px; padding:9px; border-radius:8px; cursor:pointer;
      border:1px solid var(--line2); background:transparent; color:var(--text);
      font:600 10px var(--mono); letter-spacing:.6px; text-transform:uppercase;
    }
    .playBtn:hover{ border-color:var(--green, #4de3b0); color:var(--green, #4de3b0); }
    .playBtn:disabled{ opacity:.6; cursor:default; }
    @media (prefers-reduced-motion: reduce){ .autoBtn.on .ai{ animation:none; } }

    .ticker{
      display:flex; align-items:center; gap:8px; padding:7px 11px; border-top:1px solid var(--line);
      color:var(--muted); font:9.5px var(--mono); background:var(--bg2); flex:none;
    }
    .ticker .txt{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ticker b{ color:var(--mint); font-weight:600; flex:none; }
    .ticker .run{
      border:1px solid var(--line2); background:var(--surface); color:var(--mint); cursor:pointer;
      font:600 9px var(--mono); padding:4px 6px; border-radius:4px; flex:none;
    }
    .ticker .run:hover{ border-color:var(--mint); }

    .app[data-min="1"] .rail, .app[data-min="1"] .body,
    .app[data-min="1"] .ticker, .app[data-min="1"] .work{ display:none; }
    .app[data-aberto="0"] .shell{ display:none; }
    .app[data-aberto="0"] .bubble{ display:flex; }
    .app[data-aberto="1"] .shell{ display:flex; }
    /* Roleta da forja: a chamada da extensão é direta na API, então a tela do
       jogo não anima. Esta roleta mostra o giro e o resultado no painel. */
    .rl{ position:fixed; inset:0; display:grid; place-items:center; background:#000000a8;
      backdrop-filter:blur(3px); z-index:6; }
    .rl[hidden]{ display:none; }
    .rl-card{ width:min(330px,88vw); padding:18px 18px 15px; text-align:center;
      border-radius:14px; border:1px solid var(--line2); box-shadow:var(--shadow);
      background:linear-gradient(160deg,var(--surface2),var(--bg)); }
    .rl-eyebrow{ display:block; font:600 9px var(--mono); letter-spacing:1.4px;
      text-transform:uppercase; color:var(--muted); }
    .rl-window{ position:relative; height:54px; margin:12px 0 10px; overflow:hidden;
      border-radius:9px; border:1px solid var(--line2); background:var(--bg2);
      box-shadow:inset 0 10px 14px -8px #000, inset 0 -10px 14px -8px #000; }
    .rl-window::before{ content:"▶"; position:absolute; left:6px; top:50%; transform:translateY(-50%);
      font-size:9px; color:var(--mint); z-index:2; }
    .rl-reel{ display:flex; flex-direction:column; will-change:transform; }
    .rl-reel span{ display:flex; align-items:center; justify-content:center; height:30px;
      font:700 12px var(--mono); letter-spacing:.6px; color:var(--text); }
    .rl-reel span:nth-child(6n+1){ color:#c9c5d8; }
    .rl-reel span:nth-child(6n+2){ color:#6be08a; }
    .rl-reel span:nth-child(6n+3){ color:#58a8ff; }
    .rl-reel span:nth-child(6n+4){ color:#c77dff; }
    .rl-reel span:nth-child(6n+5){ color:#ffb62e; }
    .rl-reel span:nth-child(6n){ color:#ff2d3d; }
    @keyframes rlSpin{ from{ transform:translateY(0); } to{ transform:translateY(-50%); } }
    .rl-result{ display:block; font:700 14px ui-sans-serif,system-ui,sans-serif; }
    .rl-sub{ display:block; margin-top:4px; color:var(--muted); font:10px var(--mono); }
    @media (prefers-reduced-motion: reduce){ .panel, .dot.work{ animation:none } .rl-reel{ animation:none !important; } }
  </style>

  <div class="app" id="app" data-aberto="1" data-theme="riftviolet" data-mode="dark" data-min="0">
    <button class="bubble" id="bubble" title="Abrir RiftStream AutoFarm">◆</button>
    <div class="shell">
      <div class="waves" aria-hidden="true">
        <div class="stars"></div>
        <svg viewBox="0 0 800 320" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveA" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#a06bff" stop-opacity=".55" />
              <stop offset="100%" stop-color="#ff5fd2" stop-opacity=".12" />
            </linearGradient>
            <linearGradient id="waveB" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#ff5fd2" stop-opacity=".4" />
              <stop offset="100%" stop-color="#5b21b6" stop-opacity=".1" />
            </linearGradient>
          </defs>
          <path d="M-40 290 C 120 170 240 310 400 210 C 540 122 660 250 840 150 L840 340 L-40 340 Z" fill="url(#waveA)" opacity=".5" />
          <path d="M-40 320 C 140 230 280 340 440 260 C 590 185 700 290 840 210 L840 340 L-40 340 Z" fill="url(#waveB)" opacity=".45" />
          <path d="M-40 290 C 120 170 240 310 400 210 C 540 122 660 250 840 150" fill="none" stroke="#c9a0ff" stroke-opacity=".35" stroke-width="1" />
        </svg>
      </div>
      <header class="head" id="head">
        <div class="brand">
          <span class="logo">R</span>
          <div><b>RIFTSTREAM</b><small>AUTOFARM ENGINE</small></div>
        </div>
        <div class="head-actions">
          <span class="badge" id="headBadge"><i></i><span id="badgeHeadText">em espera</span></span>
          <button class="icon" id="min" title="Minimizar">–</button>
          <button class="icon" id="close" title="Fechar">✕</button>
        </div>
      </header>

      <div class="work">
        <nav class="rail" id="tabs">
          <button class="tab" data-tab="auto"><span class="ico">▶</span><span>Auto</span><i id="vivoAuto"></i></button>
          <button class="tab" data-tab="inicio"><span class="ico">◈</span><span>Base</span><i id="vivoInicio"></i></button>
          <button class="tab" data-tab="forja"><span class="ico">⚒</span><span>Forja</span><i id="vivoForja"></i></button>
          <button class="tab" data-tab="atributos"><span class="ico">↗</span><span>Upar</span><i id="vivoAtributos"></i></button>
          <button class="tab" data-tab="gemas"><span class="ico">◉</span><span>Gemas</span><i id="vivoGemas"></i></button>
          <button class="tab" data-tab="venda"><span class="ico">⌫</span><span>Venda</span><i id="vivoVenda"></i></button>
          <button class="tab" data-tab="alchemy"><span class="ico">⚗</span><span>Alquimia</span><i id="vivoAlchemy"></i></button>
          <button class="tab" data-tab="transmog"><span class="ico">🪞</span><span>Transmog</span><i id="vivoTransmog"></i></button>
          <button class="tab" data-tab="ajustes"><span class="ico">⚙</span><span>Ajustes</span><i id="vivoAjustes"></i></button>
          <span class="spacer"></span>
          <span class="ver">v${VERSION}</span>
        </nav>

        <div class="main">
          <div class="power">
            <div class="power-txt">
              <b>Motor</b>
              <small id="masterHint">Desligado — nada é enviado ao jogo</small>
            </div>
            <button class="sw" id="swFarm" title="Ligar/desligar tudo"></button>
          </div>

          <div class="body">
            <section class="panel" data-panel="auto">
              <div class="autoHero">
                <span class="eyebrow">Controle de farm</span>
                <h1>Build high, um toque só.</h1>
                <p id="autoSub">Equipar, forjar, upar, gemas, engaste, alquimia e venda em uma única passada agressiva.</p>
                <span class="badge" id="heroBadge"><i></i><span id="badgeText">processo inativo</span></span>
              </div>
              <button class="autoBtn" id="autoTudo">
                <span class="ai">▶</span> FARMAR SOZINHO →
              </button>
              <button class="autoStop" id="autoParar" hidden>Parar o farm</button>
              <div class="statusbox"><span id="stAuto">Pronto para começar</span><small id="ctAuto"></small></div>

              <div class="row" id="rowPlay">
                <span class="grow">Entrar no jogo sozinho<small id="playSub">Verificando…</small></span>
                <button class="sw" id="swPlay" title="Entrar/voltar ao jogo com $jogar"></button>
              </div>
              <button class="playBtn" id="playEntrar" type="button">Entrar agora</button>
              <div class="row" id="rowChat">
                <span class="grow">Chat anti-AFK<small id="chatSub">Verificando…</small></span>
                <button class="sw" id="swChat" title="Manda uma mensagem no chat antes do AFK do servidor"></button>
              </div>
              <button class="playBtn" id="chatEnviar" type="button">Enviar agora</button>
              <div class="list" id="autoList"></div>
              <p class="warn">
                O modo automático liga a forja (que pode perder itens e ouro) e a
                venda. O que é melhor que o item equipado fica protegido, mas o
                risco existe — prefira uma conta alternativa. Quer afinar algo?
                Use as outras abas.
              </p>
              <p class="hint">
                <b>Prioridade:</b> a forja reserva os itens que formam grupo
                (inclusive os quase completos). Venda, aprimoramento, alquimia e
                transmog só usam o que sobra. A venda automática do site fica
                desligada no modo automático para não vender o material da forja.
              </p>
            </section>

            <section class="panel" data-panel="inicio">
              <div class="hero">
                <div class="hero-top"><b id="charName">Sem personagem</b><span id="charCls"></span></div>
                <div class="hero-grid">
                  <div><span>Nível</span><b id="charLevel">—</b></div>
                  <div><span>Ouro</span><b id="charGold">—</b></div>
                  <div><span>Combate</span><b id="charPower">—</b></div>
                </div>
              </div>
              <div class="statusbox" id="rankBox" style="border-left-color:var(--cyan)">
                <span id="rankTxt">Ranking de jogadores: consultando…</span>
                <small id="rankSub"></small>
              </div>
              <div class="diag">
                <div><b id="diagForja">0</b><span>grupos prontos</span></div>
                <div><b id="diagVenda">0</b><span>vendáveis</span></div>
              </div>
              <div class="list" id="statusList"></div>
              <div class="counters" id="counters"></div>
              <p class="warn">
                Esta extensão não envia mensagens no chat. Automatizar o inventário
                viola os Termos do RiftStream — use por sua conta e risco.
              </p>
            </section>

            <section class="panel" data-panel="forja">
              <div class="row">
                <span class="grow">Equipar o mais forte<small>Troca quando a Força de Combate aumenta</small></span>
                <button class="sw" id="swEquip"></button>
              </div>
              <div class="row">
                <span class="grow">Forjar sozinho<small>Até 3 grupos por rodada, 3–4 itens iguais</small></span>
                <button class="sw" id="swForge"></button>
              </div>
              <div class="row">
                <span class="grow">Usar pergaminho<small>Aumenta a chance de sucesso da forja</small></span>
                <button class="sw" id="swForgeScroll"></button>
              </div>
              <div class="row">
                <span class="grow">Caçar set Arcano<small>4 Imortais viram Arcano; o melhor de cada tipo fica protegido</small></span>
                <button class="sw" id="swArcano"></button>
              </div>
              <h3>Forjar para</h3>
              <div class="chips" id="chipsRarity"></div>
              <h3>Roleta (Lendário para cima)</h3>
              <div class="chips" id="chipsEstrategia"></div>
              <label class="field">Chance mínima para arriscar (%)
                <input id="forgeChance" type="number" min="0" max="100" step="5" inputmode="numeric" />
              </label>
              <div class="statusbox"><span id="stArcano">—</span><small id="ctArcano"></small></div>
              <h3>Tipos de item</h3>
              <div class="chips" id="chipsType"></div>
              <h3>Faixa de nível (importante)</h3>
              <div class="grid2">
                <label class="field">Nível mínimo<input id="forgeMin" type="number" min="0" max="9999" step="5" inputmode="numeric" /></label>
                <label class="field">Nível máximo<input id="forgeMax" type="number" min="0" max="9999" step="5" inputmode="numeric" /></label>
              </div>
              <p class="hint">
                Só forja itens dentro desta faixa. Evita juntar um Nv. 80 com um
                Nv. 140 e gerar um resultado pior.
              </p>
              <p class="risk" id="forgeRisk" hidden>⚠ Forja com roleta: pode perder os itens e o ouro.</p>

              <div class="row" style="margin-top:12px">
                <span class="grow">Aprimorar itens<small>Usa os itens mais fracos como doadores</small></span>
                <button class="sw" id="swEnhance"></button>
              </div>
              <p class="risk" id="enhanceRisk" hidden>⚠ O aprimoramento destrói os itens doadores.</p>

              <div class="statusbox"><span id="stForja">Desligada</span><small id="ctForja"></small></div>
            </section>

            <section class="panel" data-panel="atributos">
              <div class="row">
                <span class="grow">Upar sozinho<small>Gasta o ouro acima da reserva</small></span>
                <button class="sw" id="swUp"></button>
              </div>
              <div class="seg" id="segModo">
                <button data-modo="otimo">Ótimo</button>
                <button data-modo="igual">Dividir ouro</button>
                <button data-modo="nivel">Até o nível</button>
              </div>
              <div id="boxOtimo">
                <h3>Foco do modo ótimo</h3>
                <div class="chips" id="chipsFoco">
                  <button data-foco="fc">FC (ranking) ★</button>
                  <button data-foco="equilibrado">Equilibrado</button>
                  <button data-foco="dano">Dano</button>
                  <button data-foco="tanque">Tanque</button>
                </div>
                <p class="hint">
                  <b>FC (ranking)</b> usa a conta do servidor — FC ∝ √(dps × vida
                  efetiva), com a velocidade cheia e o crítico acima de 60% em
                  dano crítico. Cada ouro vai para o atributo que mais aumenta
                  seu FC, que é o número do ranking de jogadores.
                </p>
              </div>
              <div id="boxIgual">
                <h3>Atributos para focar</h3>
                <div class="chips" id="chipsAttr"></div>
                <p class="hint">O mesmo tanto de ouro em cada atributo marcado.</p>
              </div>
              <div id="boxNivel" hidden>
                <h3>Metas por atributo</h3>
                <div id="metas"></div>
                <p class="hint">Deixe vazio o que não quer upar.</p>
              </div>
              <h3>Reserva de ouro</h3>
              <label class="field">Nunca gastar abaixo de (g)<input id="reserve" type="number" min="0" step="1000" inputmode="numeric" /></label>
              <p class="hint">Forja, aprimoramento, engaste e atributos respeitam esse valor.</p>
              <div class="statusbox"><span id="stUp">Desligado</span><small id="ctUp"></small></div>
            </section>

            <section class="panel" data-panel="gemas">
              <div class="row">
                <span class="grow">Gemas sozinho<small>Combina 3 em 3 automaticamente</small></span>
                <button class="sw" id="swGems"></button>
              </div>
              <h3>O que fazer</h3>
              <div class="chips" id="chipsGem"></div>
              <p class="hint">Juntar 3 em 3 é o mesmo que “Upar todas as gemas” do jogo e sempre dá certo.</p>
              <p class="risk" id="gemRisk" hidden>⚠ Suprema: junta 4 Perfeitas numa roleta. Se falhar, perde as 4 e o ouro.</p>
              <div class="row" style="margin-top:10px">
                <span class="grow">Engastar nos equipados<small>Usa as gemas melhores do inventário</small></span>
                <button class="sw" id="swSocket"></button>
              </div>
              <div class="statusbox"><span id="stGem">Desligado</span><small id="ctGem"></small></div>
            </section>

            <section class="panel" data-panel="venda">
              <div class="row">
                <span class="grow">Vender itens sozinho<small>Um por vez — não precisa de VIP</small></span>
                <button class="sw" id="swSell"></button>
              </div>
              <div class="grid2">
                <label class="field">Até a raridade
                  <select id="sellRarity">
                    <option value="0">Comum</option>
                    <option value="1">Incomum</option>
                    <option value="2">Raro</option>
                    <option value="3">Épico</option>
                  </select>
                </label>
                <label class="field">Nível até<input id="sellLevel" type="number" min="0" max="9999" step="5" inputmode="numeric" /></label>
              </div>
              <p class="hint">
                Nunca vende equipados, favoritos, itens com gemas nem o que a
                forja reservou (inclusive grupos incompletos). Nível 9999 = sem
                limite. Com <b>Reciclar itens soltos</b> ligado na Alquimia, o
                que ela reciclaria vai para a alquimia em vez da venda.
              </p>

              <div class="row" style="margin-top:12px">
                <span class="grow">Venda automática do site<small>Recurso exclusivo de VIP</small></span>
                <button class="sw" id="swLote"></button>
              </div>
              <div class="grid2">
                <label class="field">Até a raridade
                  <select id="loteRarity">
                    <option value="-1">Desligado</option>
                    <option value="0">Comum</option>
                    <option value="1">Incomum</option>
                    <option value="2">Raro</option>
                    <option value="3">Épico</option>
                  </select>
                </label>
                <label class="field">Nível até<input id="loteLevel" type="number" min="0" max="9999" step="5" inputmode="numeric" /></label>
              </div>
              <p class="hint">
                O autosell do site roda fora da extensão e pode vender o material
                antes de a forja usar. No modo automático ele fica desligado;
                ligar na mão sai do modo automático.
              </p>

              <div class="row" style="margin-top:12px">
                <span class="grow">Organizar baús<small>A cada 6 horas, por nível</small></span>
                <button class="sw" id="swOrganize"></button>
              </div>
              <div class="statusbox"><span id="stSell">Desligada</span><small id="ctSell"></small></div>
            </section>

            <section class="panel" data-panel="alchemy">
              <div class="row">
                <span class="grow">Alquimia sozinha<small>Recicla itens, cria peças garantidas e sobe de nível</small></span>
                <button class="sw" id="swAlchemy"></button>
              </div>
              <div class="row">
                <span class="grow">Reciclar itens soltos<small>Destroi itens não equipados/favoritos/sem gemas para virar fragmentos</small></span>
                <button class="sw" id="swAlchemyReciclar"></button>
              </div>
              <div class="row">
                <span class="grow">Criar peças com fragmentos<small>5 fragmentos iguais = item garantido, sem risco</small></span>
                <button class="sw" id="swAlchemyCriar"></button>
              </div>
              <div class="row">
                <span class="grow">Subir de nível<small>Paga o ouro indicado quando enche a EXP</small></span>
                <button class="sw" id="swAlchemySubir"></button>
              </div>
              <h3>Peça para criar</h3>
              <div class="seg" id="segAlchemySlot">
                <button data-slot="arma">Arma</button>
                <button data-slot="elmo">Elmo</button>
                <button data-slot="armadura">Armadura</button>
                <button data-slot="anel">Anel</button>
              </div>
              <h3>Raridade para criar</h3>
              <div class="seg" id="segAlchemyRaridade">
                <button data-raridade="0">Comum</button>
                <button data-raridade="1">Incomum</button>
                <button data-raridade="2">Raro</button>
              </div>
              <p class="hint">
                A reciclagem ignora itens equipados, favoritos, com gemas, peças
                melhores que a equipada, itens reservados para a forja (inclusive
                grupos incompletos) e o que a própria alquimia acabou de criar.
              </p>
              <div class="statusbox"><span id="stAlchemy">Desligada</span><small id="ctAlchemy"></small></div>
            </section>

            <section class="panel" data-panel="transmog">
              <div class="row">
                <span class="grow">Transmog sozinho<small>Troca a aparência de um item usando outro como molde</small></span>
                <button class="sw" id="swTransmog"></button>
              </div>
              <h3>Item alvo (recebe a aparência)</h3>
              <div class="seg" id="segTransmogAlvo">
                <button data-slot="arma">Arma</button>
                <button data-slot="elmo">Elmo</button>
                <button data-slot="armadura">Armadura</button>
                <button data-slot="anel">Anel</button>
              </div>
              <p class="hint">
                O molde é consumido e precisa ser do mesmo tipo do alvo. A automação
                usa o item equipado como alvo, escolhe o molde de melhor aparência
                que <b>não</b> esteja reservado para a forja e não repete o mesmo
                alvo depois de aplicar.
              </p>
              <div class="statusbox"><span id="stTransmog">Desligado</span><small id="ctTransmog"></small></div>
            </section>

            <section class="panel" data-panel="ajustes">
              <div class="identity">
                <span class="mark">V</span>
                <div><b>RIFT VIOLET</b><small>tema único · visual SynEx</small></div>
              </div>
              <h3>Tamanho da fonte</h3>
              <div class="row">
                <input id="fontRange" type="range" min="10" max="18" step="1" />
                <b id="fontVal" style="width:34px;text-align:right;font-family:var(--mono)">12px</b>
              </div>
              <h3>Roleta rápida</h3>
              <div class="row">
                <span class="grow">Acelerar animação<small>Só a animação — a chance não muda</small></span>
                <button class="sw" id="swRoleta"></button>
              </div>
              <div class="chips" id="chipsVel" style="margin-top:6px"></div>
              <h3>Painel</h3>
              <div class="row">
                <span class="grow">Posição<small>Arraste pelo cabeçalho para mover</small></span>
                <button class="icon" id="resetPos" title="Redefinir posição">⟲</button>
              </div>
              <p class="hint">
                Preferências ficam salvas no navegador e valem também para o popup
                da extensão.
              </p>
              <div class="statusbox" style="margin-top:12px">
                <span>FARMLINE · RiftStream AutoFarm</span><small>Versão ${VERSION} · made by <b class="by">nvd7</b></small>
              </div>
            </section>
          </div>

          <footer class="ticker">
            <span class="txt" id="footStatus">Pronto.</span>
            <b id="roundAge">—</b>
            <button class="run" id="runNow" title="Enviar uma rodada agora">rodar</button>
          </footer>
        </div>
      </div>
    </div>

    <div class="rl" id="rl" hidden aria-live="polite">
      <div class="rl-card">
        <span class="rl-eyebrow" id="rlKind">Roleta da forja</span>
        <div class="rl-window"><div class="rl-reel" id="rlReel"></div></div>
        <b class="rl-result" id="rlResult">Girando…</b>
        <small class="rl-sub" id="rlSub"></small>
      </div>
    </div>
  </div>`;

  document.documentElement.appendChild(host);

  const q = (id) => raiz.getElementById(id);
  const app = q("app");

  /* ---------------------------- roleta da forja ---------------------------- */

  const RL_NOMES = ["Comum", "Incomum", "Raro", "Épico", "Lendário", "Imortal"];
  const rlEl = q("rl");
  const rlReel = q("rlReel");
  const rlKind = q("rlKind");
  const rlResult = q("rlResult");
  const rlSub = q("rlSub");
  rlReel.innerHTML = [...RL_NOMES, ...RL_NOMES]
    .map((n) => `<span>${n}</span>`)
    .join("");

  const rlFila = [];
  let rlAtual = null;
  let rlAnimando = false;

  function rlSemMovimento() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  }

  function rlVelocidade() {
    const r = cfg.settings.roleta || {};
    return r.ligada ? Math.max(1, Number(r.vel) || 1) : 1;
  }

  function rlCor(raridade) {
    const achado = RARIDADES.find(([id]) => id === raridade);
    return achado ? achado[2] : "var(--mint)";
  }

  function rlTocar(job) {
    return new Promise((resolve) => {
      const reduzido = rlSemMovimento();
      const dur = reduzido ? 0 : Math.max(420, 1600 / rlVelocidade());
      if (!ui.aberto) { resolve(); return; }

      rlKind.textContent = "Roleta da forja";
      rlResult.textContent = "Girando…";
      rlResult.style.color = "";
      rlSub.textContent = job.rotulo || "";
      rlReel.style.animation = "none";
      void rlReel.offsetHeight;
      if (!reduzido) rlReel.style.animation = `rlSpin ${(0.4 / rlVelocidade()).toFixed(2)}s linear infinite`;
      rlEl.hidden = false;

      const inicio = Date.now();
      const esperar = () => {
        if (!job.fim) {
          if (Date.now() - inicio > 20000) { rlEl.hidden = true; resolve(); return; }
          setTimeout(esperar, 80);
          return;
        }
        const falta = dur - (Date.now() - inicio);
        if (falta > 0) { setTimeout(esperar, Math.min(120, falta)); return; }
        concluir();
      };
      const concluir = () => {
        const fim = job.fim;
        rlReel.style.animation = "none";
        rlResult.style.color = rlCor(job.raridade);
        if (fim.sucesso) {
          rlResult.textContent = fim.item || "Item forjado";
          rlSub.textContent = `Forjado${Number.isFinite(fim.chance) && fim.chance <= 1 ? ` · ${Math.round(fim.chance * 100)}% de chance` : ""}`;
        } else {
          rlResult.textContent = "A roleta falhou";
          rlSub.textContent = fim.erro ? `Erro: ${fim.erro}` : "Os itens usados foram perdidos";
        }
        setTimeout(() => { rlEl.hidden = true; resolve(); }, reduzido ? 700 : 1500);
      };
      setTimeout(esperar, 80);
    });
  }

  async function rlRodarFila() {
    if (rlAnimando) return;
    rlAnimando = true;
    while (rlFila.length) {
      rlAtual = rlFila.shift();
      await rlTocar(rlAtual);
      rlAtual = null;
    }
    rlAnimando = false;
  }

  document.addEventListener("rsaf:forja", (ev) => {
    const d = ev.detail || {};
    if (d.tipo === "start") {
      rlFila.push({ rotulo: d.rotulo, destino: d.destino, raridade: d.raridade, fim: null });
    } else {
      // O "fim" pertence ao giro que está na tela ou, se a engine respondeu
      // rápido, ao primeiro da fila que ainda não recebeu resultado.
      const job = (rlAtual && !rlAtual.fim ? rlAtual : null) || rlFila.find((j) => !j.fim);
      if (!job) return;
      job.fim = d;
    }
    rlRodarFila();
  });

  /* -------------------------------- tema ---------------------------------- */

  // Tema único. IDs antigos são normalizados pelo themes.js para não quebrar
  // configurações salvas; o painel só aplica as variáveis.
  function aplicarTema() {
    app.dataset.theme = "riftviolet";
    app.dataset.mode = "dark";
    if (typeof window.RSAF_varsPainel === "function") {
      for (const [k, v] of Object.entries(window.RSAF_varsPainel())) {
        app.style.setProperty(k, v);
      }
    }
  }

  /* ------------------------------ elementos ------------------------------- */

  const chipsRarity = RARIDADES.map(([id, nome, cor]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.style.setProperty("--c", cor);
    b.addEventListener("click", () => {
      cfg.settings.forge.raridades[id] = !cfg.settings.forge.raridades[id];
      salvarCfg();
    });
    q("chipsRarity").append(b);
    return [id, b];
  });

  const chipsType = TIPOS.map(([id, nome]) => {    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.addEventListener("click", () => {
      cfg.settings.forge.tipos[id] = !cfg.settings.forge.tipos[id];
      salvarCfg();
    });
    q("chipsType").append(b);
    return [id, b];
  });

  const ESTRATEGIAS_UI = [
    ["conservador", "Conservador", "Só arrisca com pergaminho e chance alta"],
    ["agressivo", "Agressivo", "Respeita a chance mínima e usa o gelo"],
    ["bruto", "Bruto", "Forja tudo que fecha grupo"]
  ];
  const chipsEstrategia = ESTRATEGIAS_UI.map(([id, nome, dica]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.title = dica;
    b.addEventListener("click", () => {
      cfg.settings.forge.estrategia = id;
      salvarCfg();
    });
    q("chipsEstrategia").append(b);
    return [id, b];
  });

  const chipsAttr = ATRIBUTOS.map(([id, nome]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.addEventListener("click", () => {
      cfg.settings.stats.sel[id] = !cfg.settings.stats.sel[id];
      salvarCfg();
    });
    q("chipsAttr").append(b);
    return [id, b];
  });

  const chipsGem = [
    ["juntar", "Juntar 3 em 3", "#4de3b0"],
    ["suprema", "Suprema ⚠", "#ff7a7a"]
  ].map(([id, nome, cor]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.style.setProperty("--c", cor);
    b.addEventListener("click", () => {
      cfg.settings.gems[id] = !cfg.settings.gems[id];
      salvarCfg();
    });
    q("chipsGem").append(b);
    return [id, b];
  });

  const chipsVel = [2, 4, 8].map((v) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `${v}x`;
    b.style.setProperty("--c", "#4de3b0");
    b.addEventListener("click", () => {
      cfg.settings.roleta.vel = v;
      salvarCfg();
    });
    q("chipsVel").append(b);
    return [v, b];
  });

  const linhasMeta = ATRIBUTOS.map(([id, nome]) => {
    const linha = document.createElement("div");
    linha.className = "meta";
    linha.innerHTML = `<span>${nome}</span><span class="nv"></span><input inputmode="numeric" placeholder="nível">`;
    const input = linha.querySelector("input");
    input.addEventListener("input", () => {
      const v = parseInt(input.value.replace(/\D/g, ""), 10);
      input.value = Number.isNaN(v) ? "" : v;
      if (Number.isNaN(v)) delete cfg.settings.stats.metas[id];
      else cfg.settings.stats.metas[id] = v;
      salvarCfg();
    });
    q("metas").append(linha);
    return { id, input, nv: linha.querySelector(".nv") };
  });

  /* ------------------------------ interações ------------------------------ */

  const ativo = (el) => raiz.activeElement === el;

  const algumModulo = (st, soLigados) => {
    const s = st || cfg.settings;
    const x = !!(s.equip || s.forge.ligado || s.stats.ligado || s.gems.ligado ||
      s.socket.ligado || s.enhance.ligado || s.sell.ligado || s.lote.ligado || s.organize ||
      s.alchemy?.ligado || s.transmog?.ligado);
    return soLigados ? x : x;
  };

  // Liga o motor junto ao ligar um módulo: evita o "não funciona" de deixar
  // tudo marcado e o master desligado.
  function mexerModulo(fn) {
    const antes = algumModulo();
    fn();
    if (!antes && algumModulo() && !cfg.running) cfg.running = true;
    salvarCfg();
  }

  q("swFarm").addEventListener("click", () => {
    cfg.running = !cfg.running;
    salvarCfg();
  });

  // ------------------------------ modo automático ---------------------------

  // Um botão só: build high sem freio. Tudo ligado, roleta sem chance mínima,
  // reserva zero — a engine para sozinha quando o custo passa do saldo.
  function aplicarAuto() {
    const st = cfg.settings;
    st.auto = true;

    st.equip = true;

    st.forge.ligado = true;
    st.forge.auto = true;
    st.forge.useScroll = true;
    st.forge.raridades = { comum: true, incomum: true, raro: true, epico: true, lendario: true, imortal: true };
    st.forge.tipos = { arma: true, elmo: true, armadura: true, anel: true };
    // Caçar arcano: 4 Imortais viram Arcano (25% base, +2% por falha até +10%
    // e +50% com o Supremo). Sem essa fusão o set arcano nunca chega.
    st.forge.arcano = true;
    st.forge.estrategia = "bruto";
    st.forge.chanceMinima = 0;

    st.stats.ligado = true;
    st.stats.modo = "otimo";
    // O ranking de jogadores é por FC: maximizar √ (dps × ehp) é maximizar FC.
    st.stats.foco = "fc";
    for (const k of Object.keys(st.stats.sel)) st.stats.sel[k] = true;

    st.gems.ligado = true;
    st.gems.juntar = true;
    st.gems.suprema = false;
    st.socket.ligado = true;
    st.enhance.ligado = true;

    st.sell.ligado = true;
    st.sell.rarity = 2;
    st.sell.level = 9999;
    st.organize = true;
    // O autosell do site roda fora da extensão e não respeita a reserva da
    // forja; no modo automático quem vende é a venda individual.
    st.lote.ligado = false;

    st.alchemy.ligado = true;
    st.alchemy.reciclar = true;
    st.alchemy.criar = true;
    st.alchemy.subirNivel = true;
    st.alchemy.raridadeAlvo = 2;

    st.transmog.ligado = true;

    st.goldReserve = 0;
    st.roleta.ligada = true;

    cfg.running = true;
    salvarCfg();
    q("footStatus").textContent = "Build high ligada — sem reserva, sem chance mínima";
  }

  function pararAuto() {
    cfg.settings.auto = false;
    cfg.settings.forge.auto = false;
    cfg.running = false;
    salvarCfg();
    q("footStatus").textContent = "Modo automático desligado";
  }

  q("autoTudo").addEventListener("click", aplicarAuto);
  q("autoParar").addEventListener("click", pararAuto);

  // Entrar no jogo sozinho. O switch salva a preferência (o service worker lê
  // daqui); o botão força uma tentativa agora, sem esperar o alarme.
  q("swPlay").addEventListener("click", () => {
    cfg.settings.autoPlay = cfg.settings.autoPlay || { classe: "auto", autoLive: true, raid: false };
    cfg.settings.autoPlay.ligado = !(cfg.settings.autoPlay.ligado !== false);
    salvarCfg();
  });
  q("playEntrar").addEventListener("click", async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: "RSAF_PLAY_NOW" });
      if (res?.play) play = { ...play, ...res.play };
      if (!res?.playResult?.sent) {
        const motivo = res?.playResult?.reason || res?.error || "sem resposta";
        status.lastAction = motivo === "em jogo"
          ? `Jogo: herói já está em ${play.canal || "canal"}`
          : `Jogo: ${motivo}`;
      }
    } catch {
      status.lastAction = "Jogo: serviço da extensão indisponível";
    }
    desenhar();
  });
  // Chat anti-AFK. O switch desliga só o ping (o "entrar no jogo" continua);
  // o botão pede um envio imediato e mostra o motivo quando não sai.
  q("swChat").addEventListener("click", () => {
    cfg.settings.chatKeep = cfg.settings.chatKeep || { minutos: 0, texto: "$jump" };
    cfg.settings.chatKeep.ligado = !(cfg.settings.chatKeep.ligado !== false);
    salvarCfg();
  });
  q("chatEnviar").addEventListener("click", async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: "RSAF_CHAT_NOW" });
      if (res?.chat) chat = { ...chat, ...res.chat };
      if (res?.chatClock) clock = { ...clock, ...res.chatClock };
      if (!res?.chatResult?.sent) {
        status.lastAction = `Chat: ${res?.chatResult?.reason || res?.error || "sem resposta"}`;
      } else {
        status.lastAction = `Chat: "${res.chatResult.texto}" enviado`;
      }
    } catch {
      status.lastAction = "Chat: serviço da extensão indisponível";
    }
    desenhar();
  });
  q("swForge").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.forge.ligado = !cfg.settings.forge.ligado;
  }));
  q("swForgeScroll").addEventListener("click", () => {
    cfg.settings.forge.useScroll = !cfg.settings.forge.useScroll;
    salvarCfg();
  });
  q("swArcano").addEventListener("click", () => {
    cfg.settings.forge.arcano = !(cfg.settings.forge.arcano !== false);
    salvarCfg();
  });
  q("forgeChance").addEventListener("input", () => {
    const v = parseInt(q("forgeChance").value.replace(/\D/g, ""), 10);
    cfg.settings.forge.chanceMinima = Number.isNaN(v) ? 25 : Math.max(0, Math.min(100, v));
    salvarCfg();
  });
  q("swEquip").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.equip = !cfg.settings.equip;
  }));
  q("swEnhance").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.enhance.ligado = !cfg.settings.enhance.ligado;
  }));
  q("swUp").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.stats.ligado = !cfg.settings.stats.ligado;
  }));
  q("swGems").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.gems.ligado = !cfg.settings.gems.ligado;
  }));
  q("swSocket").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.socket.ligado = !cfg.settings.socket.ligado;
  }));
  q("swSell").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.sell.ligado = !cfg.settings.sell.ligado;
  }));
  q("swLote").addEventListener("click", () => mexerModulo(() => {
    // O autosell do site não enxerga a reserva da forja. Ligar na mão sai do
    // modo automático para a escolha ficar explícita.
    if (!cfg.settings.lote.ligado && cfg.settings.auto) sairDoAuto();
    cfg.settings.lote.ligado = !cfg.settings.lote.ligado;
  }));
  q("swOrganize").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.organize = !cfg.settings.organize;
  }));

  q("swAlchemy").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.alchemy.ligado = !cfg.settings.alchemy.ligado;
  }));
  q("swAlchemyReciclar").addEventListener("click", () => {
    cfg.settings.alchemy.reciclar = !cfg.settings.alchemy.reciclar;
    salvarCfg();
  });
  q("swAlchemyCriar").addEventListener("click", () => {
    cfg.settings.alchemy.criar = !cfg.settings.alchemy.criar;
    salvarCfg();
  });
  q("swAlchemySubir").addEventListener("click", () => {
    cfg.settings.alchemy.subirNivel = !cfg.settings.alchemy.subirNivel;
    salvarCfg();
  });
  raiz.querySelectorAll("#segAlchemySlot button").forEach((b) => {
    b.addEventListener("click", () => {
      cfg.settings.alchemy.slotAlvo = b.dataset.slot;
      salvarCfg();
    });
  });
  raiz.querySelectorAll("#segAlchemyRaridade button").forEach((b) => {
    b.addEventListener("click", () => {
      cfg.settings.alchemy.raridadeAlvo = Number(b.dataset.raridade);
      salvarCfg();
    });
  });

  q("swTransmog").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.transmog.ligado = !cfg.settings.transmog.ligado;
  }));
  raiz.querySelectorAll("#segTransmogAlvo button").forEach((b) => {
    b.addEventListener("click", () => {
      cfg.settings.transmog.alvoSlot = b.dataset.slot;
      cfg.settings.transmog.fonteSlot = b.dataset.slot;
      salvarCfg();
    });
  });
  q("swRoleta").addEventListener("click", () => {
    cfg.settings.roleta.ligada = !cfg.settings.roleta.ligada;
    salvarCfg();
  });

  raiz.querySelectorAll("#segModo button").forEach((b) => b.addEventListener("click", () => {
    cfg.settings.stats.modo = b.dataset.modo;
    salvarCfg();
  }));

  raiz.querySelectorAll("#chipsFoco button").forEach((b) => b.addEventListener("click", () => {
    cfg.settings.stats.foco = b.dataset.foco;
    salvarCfg();
  }));

  // Ajustar na mão é uma escolha do jogador: sai do modo automático para o
  // valor digitado valer de verdade (o automático recalcula reserva e faixa).
  function sairDoAuto() {
    cfg.settings.auto = false;
    cfg.settings.forge.auto = false;
  }

  q("reserve").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.goldReserve = Number.isNaN(v) ? 0 : v;
    sairDoAuto();
    salvarCfg();
  });
  q("forgeMin").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.forge.minLevel = Number.isNaN(v) ? 0 : v;
    sairDoAuto();
    salvarCfg();
  });
  q("forgeMax").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.forge.maxLevel = Number.isNaN(v) ? 9999 : v;
    sairDoAuto();
    salvarCfg();
  });
  q("sellLevel").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.sell.level = Number.isNaN(v) ? 9999 : v;
    salvarCfg();
  });
  q("sellRarity").addEventListener("change", (e) => {
    cfg.settings.sell.rarity = Number(e.target.value);
    salvarCfg();
  });
  q("loteLevel").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.lote.level = Number.isNaN(v) ? 0 : v;
    salvarCfg();
  });
  q("loteRarity").addEventListener("change", (e) => {
    cfg.settings.lote.rarity = Number(e.target.value);
    salvarCfg();
  });
  q("fontRange").addEventListener("input", (e) => {
    cfg.settings.font = Number(e.target.value);
    salvarCfg();
  });

  q("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    ui.aba = b.dataset.tab;
    salvarUI();
    desenhar();
  });

  q("runNow").addEventListener("click", async () => {
    if (!cfg.running) {
      cfg.running = true;
      salvarCfg();
    }
    q("runNow").disabled = true;
    q("footStatus").textContent = "Enviando rodada...";
    try {
      const res = await chrome.runtime.sendMessage({ type: "RSAF_MAINTENANCE" });
      q("footStatus").textContent = res?.dispatched
        ? "Rodada enviada para o jogo"
        : "Abra riftstream.com.br em outra aba";
    } catch {
      // Sem background (harness): chama a rodada local se existir.
      q("footStatus").textContent = window.__forjaTeste?.rodar
        ? "Rodando na própria página..."
        : "Não consegui falar com a extensão";
      window.__forjaTeste?.rodar?.();
    } finally {
      setTimeout(() => { q("runNow").disabled = false; }, 1800);
    }
  });

  q("min").addEventListener("click", () => {
    ui.minimizado = !ui.minimizado;
    salvarUI();
    desenhar();
  });
  q("close").addEventListener("click", () => {
    ui.aberto = false;
    salvarUI();
    desenhar();
  });
  q("bubble").addEventListener("click", () => {
    ui.aberto = true;
    ui.minimizado = false;
    salvarUI();
    desenhar();
  });
  q("resetPos").addEventListener("click", () => {
    ui.x = null;
    ui.y = null;
    salvarUI();
    posicionar();
  });

  // Digitar no painel não pode acionar atalhos do jogo.
  ["keydown", "keyup", "keypress"].forEach((t) => raiz.addEventListener(t, (e) => e.stopPropagation()));

  /* ------------------------------- drag/drop ------------------------------ */

  q("head").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".icon")) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const mover = (ev) => {
      ui.x = ev.clientX - dx;
      ui.y = ev.clientY - dy;
      posicionar();
    };
    const soltar = () => {
      removeEventListener("pointermove", mover);
      removeEventListener("pointerup", soltar);
      salvarUI();
    };
    addEventListener("pointermove", mover);
    addEventListener("pointerup", soltar);
  });

  function posicionar() {
    // Aba em segundo plano pode informar tamanho zero e o painel iria para fora da tela.
    if (ui.x === null || !innerWidth || !innerHeight) {
      host.style.left = "auto";
      host.style.top = "auto";
      host.style.right = "16px";
      host.style.bottom = "16px";
      return;
    }
    const r = host.getBoundingClientRect();
    const x = Math.max(0, Math.min(ui.x, innerWidth - Math.max(r.width, 60)));
    const y = Math.max(0, Math.min(ui.y, innerHeight - 40));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }

  /* -------------------------------- escrita ------------------------------- */

  let timerCfg = null;
  function salvarCfg() {
    desenhar();
    clearTimeout(timerCfg);
    timerCfg = setTimeout(() => {
      store.set({ [KEY]: { running: cfg.running, settings: cfg.settings } }).catch(() => {});
    }, 180);
  }

  function salvarUI() {
    store.set({ [UI_KEY]: ui }).catch(() => {});
  }

  /* -------------------------------- desenho ------------------------------- */

  const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

  const MODULOS = [
    ["equip", "Equipar o mais forte", (x) => !!x.equip, "equip"],
    ["forja", "Forja", (x) => x.forge.ligado, "forja"],
    ["atributos", "Atributos", (x) => x.stats.ligado, "up"],
    ["gemas", "Gemas", (x) => x.gems.ligado, "gem"],
    ["socket", "Engaste", (x) => x.socket.ligado, "socket"],
    ["enhance", "Aprimoramento", (x) => x.enhance.ligado, "enhance"],
    ["venda", "Venda", (x) => x.sell.ligado, "sell"],
    ["alchemy", "Alquimia", (x) => x.alchemy.ligado, "alchemy"],
    ["transmog", "Transmog", (x) => x.transmog.ligado, "transmog"]
  ];

  function textoModulo(chave) {
    switch (chave) {
      case "equip": return status.equip || "Compara com o item equipado";
      case "forja": return status.forja || "Desligada";
      case "up": return status.up || "Desligado";
      case "gem": return status.gem || "Desligado";
      case "socket": return status.socket || "Desligado";
      case "enhance": return status.enhance || "Desligado";
      case "sell": return status.sell || "Desligada";
      case "alchemy": return status.alchemy || "Desligada";
      case "transmog": return status.transmog || "Desligado";
      default: return "";
    }
  }

  function idadeRodada(desde) {
    const quando = desde || status.roundAt;
    if (!quando) return "—";
    const s = Math.max(0, Math.round((Date.now() - quando) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h`;
  }

  // Quando o motor começou a rodar (para avisar "sem rodada" mesmo se nenhuma
  // rodada chegou a terminar).
  let rodandoDesde = 0;

  // Ranking de jogadores é por FC, não por zona. Busca o #1 direto na API
  // pública e mostra o gap contra o personagem atual. Cache de 60 s.
  let rankCache = { at: 0, topo: null };
  async function atualizarRank() {
    const agora = Date.now();
    if (agora - rankCache.at < 60000 && rankCache.topo !== null) {
      pintarRank(rankCache.topo);
      return;
    }
    rankCache.at = agora;
    try {
      const res = await fetch(
        "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com/api/ranking/characters?page=1&size=1&sort=power",
        { cache: "no-store" }
      );
      const data = await res.json();
      rankCache.topo = data?.items?.[0] || null;
      pintarRank(rankCache.topo);
    } catch {
      q("rankTxt").textContent = "Ranking indisponível agora";
    }
  }

  function pintarRank(topo) {
    if (!topo) { q("rankTxt").textContent = "Ranking vazio"; return; }
    const meu = Number(status.character?.power || 0);
    q("rankTxt").textContent = `#1 ${topo.name || topo.login} · ${fmt(topo.power)} FC · nv ${topo.level}`;
    q("rankSub").textContent = meu
      ? `Você: ${fmt(meu)} FC · faltam ${fmt(Math.max(0, Number(topo.power) - meu))} para o top 1`
      : "Entre no jogo para comparar seu FC com o líder";
  }

  function desenhar() {
    const st = cfg.settings;
    atualizarRank();

    aplicarTema();
    app.dataset.aberto = ui.aberto ? "1" : "0";
    app.dataset.min = ui.minimizado ? "1" : "0";
    app.style.setProperty("--fs", `${Math.min(18, Math.max(10, Number(st.font) || 12))}px`);

    raiz.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.aba));
    raiz.querySelectorAll(".panel").forEach((p) => p.classList.toggle("on", p.dataset.panel === ui.aba));

    const algum = algumModulo(st);
    const dot = q("dot");
    dot.className = "dot";
    if (cfg.running && algum) dot.classList.add("on");
    if (cfg.running && algum && !/Desligad|Nenhum|Aguardando|Juntando|Metas concluídas/i.test(textoModulo(ui.aba === "atributos" ? "up" : ui.aba))) {
      dot.classList.add("work");
    }

    q("swFarm").classList.toggle("on", !!cfg.running);
    q("masterHint").textContent = cfg.running
      ? (algum ? "Processo ativo — build high em execução" : "Ligado, mas nenhum módulo marcado")
      : "Processo inativo — nada é enviado ao jogo";

    const ativoBadge = !!(cfg.running && algum);
    q("badgeHeadText").textContent = ativoBadge ? "processo ativo" : "em espera";
    q("badgeText").textContent = ativoBadge ? "processo ativo" : "processo inativo";
    q("headBadge").classList.toggle("work", dot.classList.contains("work"));
    q("heroBadge").classList.toggle("work", dot.classList.contains("work"));

    // Base
    const ch = status.character;
    q("charName").textContent = ch?.name || "Sem personagem";
    q("charCls").textContent = ch?.cls || "";
    q("charLevel").textContent = ch?.level ? fmt(ch.level) : "—";
    q("charGold").textContent = ch ? fmt(ch.gold) : "—";
    q("charPower").textContent = ch ? fmt(ch.power) : "—";
    q("diagForja").textContent = st.forge.ligado ? fmt(status.counts?.forja ?? 0) : "off";
    q("diagVenda").textContent = st.sell.ligado ? fmt(status.counts?.venda ?? 0) : "off";

    const lista = q("statusList");
    lista.textContent = "";
    for (const [id, nome, ligado, chave] of MODULOS) {
      const on = ligado(st);
      const item = document.createElement("div");
      item.className = "item";
      const s = document.createElement("span");
      s.className = `s${on ? " on" : ""}`;
      const t = document.createElement("div");
      t.className = "t";
      const b = document.createElement("b");
      b.textContent = nome;
      const small = document.createElement("small");
      small.textContent = textoModulo(chave);
      t.append(b, small);
      item.append(s, t);
      lista.append(item);
    }

    const cont = q("counters");
    cont.textContent = "";
    const ct = [
      ["Forjados", stats.forjaTotal],
      ["Perdidos", stats.forjaPerdidos],
      ["Equipados", stats.equipTotal],
      ["Vendidos", stats.vendidos],
      ["Aprimorados", stats.aprimorados],
      ["Gemas", (stats.gemTotais?.juntadas || 0) + (stats.gemTotais?.supremas || 0)]
    ];
    for (const [nome, valor] of ct) {
      const d = document.createElement("div");
      d.innerHTML = `<b>${fmt(valor)}</b><span>${nome}</span>`;
      cont.append(d);
    }

    // Auto
    // Heartbeat do motor: se faz tempo que não acontece uma rodada, o painel
    // avisa em vez de fingir que está trabalhando.
    if (cfg.running && !rodandoDesde) rodandoDesde = Date.now();
    if (!cfg.running) rodandoDesde = 0;
    const marcaRodada = status.roundAt || rodandoDesde;
    const parado = !!cfg.running && !!marcaRodada && (Date.now() - marcaRodada) > 120000;

    const autoAtivo = !!cfg.running && !!st.auto;
    q("autoTudo").classList.toggle("on", autoAtivo);
    q("autoParar").hidden = !autoAtivo;
    q("autoSub").textContent = autoAtivo
      ? (parado
        ? `Sem rodada há ${idadeRodada(marcaRodada)} — toque em ▶ no rodapé`
        : (Number(status.quietSince) > 0 && Date.now() - Number(status.quietSince) > 60000
          ? "Nada a fazer agora — monitorando o inventário"
          : (status.lastAction ? `Fazendo agora: ${status.lastAction}` : "Trabalhando no inventário...")))
      : "Liga todos os módulos e começa a cuidar do inventário";
    q("stAuto").textContent = autoAtivo
      ? "Farmando"
      : (st.auto ? "Automático pausado (motor desligado)" : "Pronto para começar");
    const modulosLigados = MODULOS.filter(([, , ligado]) => ligado(st));
    const pc = status.character;
    const mochila = pc ? `mochila ${fmt(pc.items)}/${fmt(pc.capacity)}` : "";
    const cheia = pc && Number(pc.capacity) > 0 &&
      Number(pc.items) >= Math.ceil(Number(pc.capacity) * 0.85);
    q("ctAuto").textContent = `${modulosLigados.length} módulo(s) ativo(s) · ` +
      `${st.auto ? "reserva zero (build high)" : `reserva ${fmt(st.goldReserve)}g`} · ` +
      (mochila ? `${mochila} · ` : "") +
      `forjados ${fmt(stats.forjaTotal)} · vendidos ${fmt(stats.vendidos)}` +
      (Number(status.counts?.forja) > 0 ? ` · ${status.counts.forja} forja(s) pronta(s)` : "") +
      (cheia ? " · soltando sobras para a alquimia" : "");

    // Entrar no jogo sozinho — quem manda no chat é o service worker; aqui só
    // mostramos o que ele registrou e oferecemos o gatilho manual.
    const playOn = st.autoPlay?.ligado !== false;
    q("swPlay").classList.toggle("on", playOn);
    const p = play || {};
    const entrando = Number(p.verifyAt) > Date.now();
    q("playSub").textContent = !playOn
      ? "Desligado — só o keepalive do chat continua"
      : entrando
        ? `Entrando em ${p.sentChannel || "..."} — confirmo em até 75 s`
        : (p.jogando && p.canal)
          ? `No jogo: ${p.canal}`
          : (p.lastError
            ? `Fora do jogo — ${p.lastError}`
            : "Fora do jogo — entro sozinho no próximo tick");
    const entrar = q("playEntrar");
    entrar.textContent = entrando ? "Confirmando entrada…" : "Entrar agora";
    entrar.disabled = entrando;

    // Chat anti-AFK — a mesma leitura de `/api/me` que o service worker usa.
    // Mostrar o relógio do servidor aqui evita a dúvida "está pingando mesmo?".
    const chatOn = st.chatKeep?.ligado !== false;
    q("swChat").classList.toggle("on", chatOn);
    const agoraMs = Date.now();
    const ultimoPing = Number(chat.lastAt) || 0;
    const confirmando = (Number(chat.verifyAt) || 0) > agoraMs;
    const esperaMs = (Number(chat.retryAt) || 0) - agoraMs;
    const janela = Math.max(5, Math.round(Number(clock.janela) || 30));
    const restante = clock.restanteMin === null || clock.restanteMin === undefined
      ? null
      : Math.max(0, Math.round(Number(clock.restanteMin)) || 0);
    const haMin = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : "menos de 1 min");
    q("chatSub").textContent = !chatOn
      ? "Desligado — o herói cai no AFK do servidor"
      : !clock.ok
        ? (clock.reason ? `Sem leitura do servidor (${clock.reason})` : "Sem leitura do servidor ainda")
        : clock.afk
          ? "AFK agora — mando o comando no próximo tick"
          : confirmando
            ? `Confirmando “${chat.sentText || "$jump"}” no servidor…`
            : esperaMs > 0
              ? `${chat.lastError ? `Chat: ${chat.lastError}` : "Sem efeito"} — tento de novo em ${haMin(esperaMs)}`
              : restante !== null
                ? `${restante} min para o AFK (janela ${janela} min)` +
                  (ultimoPing ? ` · último ping há ${haMin(agoraMs - ultimoPing)}` : "")
                : `Janela de ${janela} min — ainda sem leitura`;
    const enviar = q("chatEnviar");
    enviar.disabled = !chatOn || confirmando;
    enviar.textContent = confirmando ? "Confirmando…" : "Enviar agora";
    const listaAuto = q("autoList");
    listaAuto.textContent = "";
    if (!modulosLigados.length) {
      const vazio = document.createElement("div");
      vazio.className = "item";
      vazio.innerHTML = '<span class="s"></span><div class="t"><b>Nada ligado</b><small>Toque em “Farmar sozinho”</small></div>';
      listaAuto.append(vazio);
    } else {
      for (const [, nome, , chave] of modulosLigados) {
        const item = document.createElement("div");
        item.className = "item";
        const marca = document.createElement("span");
        marca.className = "s on";
        const texto = document.createElement("div");
        texto.className = "t";
        const titulo = document.createElement("b");
        titulo.textContent = nome;
        const sub = document.createElement("small");
        sub.textContent = cfg.running ? textoModulo(chave) : "Ligado — motor desligado";
        texto.append(titulo, sub);
        item.append(marca, texto);
        listaAuto.append(item);
      }
    }

    // Forja
    q("swEquip").classList.toggle("on", !!st.equip);
    q("swEnhance").classList.toggle("on", !!st.enhance.ligado);
    q("enhanceRisk").hidden = !st.enhance.ligado;
    q("swForge").classList.toggle("on", !!st.forge.ligado);
    q("swForgeScroll").classList.toggle("on", !!st.forge.useScroll);
    q("swArcano").classList.toggle("on", st.forge.arcano !== false);
    chipsRarity.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.raridades[id]));
    chipsType.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.tipos[id]));
    chipsEstrategia.forEach(([id, b]) => b.classList.toggle("on", id === (st.forge.estrategia || "agressivo")));
    if (!ativo(q("forgeChance"))) q("forgeChance").value = st.forge.chanceMinima ?? 25;
    q("forgeRisk").hidden = st.forge.arcano === false &&
      !["epico", "lendario", "imortal"].some((id) => st.forge.raridades[id]);
    const arco = status.counts?.arcano;
    if (arco) {
      const nomes = { weapon: "arma", helmet: "elmo", armor: "armadura", ring: "anel" };
      q("stArcano").textContent = `Set arcano ${arco.prontos}/${arco.total}` +
        (arco.tentativas ? ` · ${arco.tentativas} tentativa(s) pronta(s)` : "");
      q("ctArcano").textContent = Object.entries(arco.slots)
        .map(([slot, x]) => `${x.arcano ? "✓" : x.tentativas ? `${x.imortais}/4` : "—"} ${nomes[slot]}`)
        .join(" · ");
    } else {
      q("stArcano").textContent = "Set arcano —";
      q("ctArcano").textContent = st.forge.arcano === false
        ? "Desligado: nunca tenta Arcano"
        : "Ligado: forja 4 Imortais quando o grupo fecha";
    }
    if (!ativo(q("forgeMin"))) q("forgeMin").value = st.forge.minLevel ?? 0;
    if (!ativo(q("forgeMax"))) q("forgeMax").value = st.forge.maxLevel ?? 9999;
    q("stForja").textContent = st.forge.ligado ? (status.forja || "Procurando itens...") : "Desligada";
    q("ctForja").textContent = `${st.forge.auto ? "faixa automática · " : ""}` +
      `${fmt(status.counts?.forja ?? 0)} grupo(s) pronto(s) · ` +
      `${fmt(status.counts?.reservados ?? 0)} reservado(s) para a forja · ` +
      `Forjados: ${fmt(stats.forjaTotal)} · Perdidos: ${fmt(stats.forjaPerdidos)}`;

    // Atributos
    q("swUp").classList.toggle("on", !!st.stats.ligado);
    raiz.querySelectorAll("#segModo button").forEach((b) => b.classList.toggle("on", b.dataset.modo === st.stats.modo));
    q("boxIgual").hidden = st.stats.modo !== "igual";
    q("boxNivel").hidden = st.stats.modo !== "nivel";
    q("boxOtimo").hidden = st.stats.modo !== "otimo";
    raiz.querySelectorAll("#chipsFoco button").forEach((b) => b.classList.toggle("on", b.dataset.foco === (st.stats.foco || "equilibrado")));
    chipsAttr.forEach(([id, b]) => b.classList.toggle("on", !!st.stats.sel[id]));
    linhasMeta.forEach(({ id, input, nv }) => {
      const nivel = stats.upNiveis?.[id];
      nv.textContent = nivel ? `nv ${nivel}` : "";
      if (!ativo(input)) input.value = st.stats.metas[id] ?? "";
    });
    if (!ativo(q("reserve"))) q("reserve").value = st.goldReserve ?? 0;
    q("stUp").textContent = st.stats.ligado ? (status.up || "Começando...") : "Desligado";

    // Gemas
    q("swGems").classList.toggle("on", !!st.gems.ligado);
    q("swSocket").classList.toggle("on", !!st.socket.ligado);
    chipsGem.forEach(([id, b]) => b.classList.toggle("on", !!st.gems[id]));
    q("gemRisk").hidden = !st.gems.suprema;
    q("stGem").textContent = st.gems.ligado ? (status.gem || "Procurando gemas...") : "Desligado";
    const gt = stats.gemTotais || {};
    q("ctGem").textContent = `Juntadas: ${fmt(gt.juntadas)} · Supremas: ${fmt(gt.supremas)} · Perdidas: ${fmt(gt.perdidas)}`;

    // Venda
    q("swSell").classList.toggle("on", !!st.sell.ligado);
    q("swLote").classList.toggle("on", !!st.lote.ligado);
    q("swOrganize").classList.toggle("on", !!st.organize);
    q("sellRarity").value = String(Math.max(0, Number(st.sell.rarity ?? 2)));
    q("loteRarity").value = String(st.lote.rarity ?? 2);
    if (!ativo(q("sellLevel"))) q("sellLevel").value = st.sell.level ?? 9999;
    if (!ativo(q("loteLevel"))) q("loteLevel").value = st.lote.level ?? 40;
    q("stSell").textContent = st.sell.ligado ? (status.sell || "Procurando itens...") : "Desligada";
    q("ctSell").textContent = `${fmt(status.counts?.venda ?? 0)} vendável(is) agora · ` +
      `Vendidos: ${fmt(stats.vendidos)} · Sem VIP`;

    // Alquimia
    q("swAlchemy").classList.toggle("on", !!st.alchemy.ligado);
    q("swAlchemyReciclar").classList.toggle("on", !!st.alchemy.reciclar);
    q("swAlchemyCriar").classList.toggle("on", !!st.alchemy.criar);
    q("swAlchemySubir").classList.toggle("on", !!st.alchemy.subirNivel);
    raiz.querySelectorAll("#segAlchemySlot button").forEach((b) => {
      b.classList.toggle("on", b.dataset.slot === st.alchemy.slotAlvo);
    });
    raiz.querySelectorAll("#segAlchemyRaridade button").forEach((b) => {
      b.classList.toggle("on", Number(b.dataset.raridade) === st.alchemy.raridadeAlvo);
    });
    q("stAlchemy").textContent = st.alchemy.ligado ? (status.alchemy || "Procurando fragmentos...") : "Desligada";
    q("ctAlchemy").textContent = `Criados: ${fmt(stats.alchemyCriados)} · Reciclados: ${fmt(stats.alchemyReciclados)} · Upados: ${fmt(stats.alchemyUpados)}`;

    // Transmog
    q("swTransmog").classList.toggle("on", !!st.transmog.ligado);
    raiz.querySelectorAll("#segTransmogAlvo button").forEach((b) => {
      b.classList.toggle("on", b.dataset.slot === st.transmog.alvoSlot);
    });
    q("stTransmog").textContent = st.transmog.ligado ? (status.transmog || "Procurando itens...") : "Desligado";
    q("ctTransmog").textContent = `Transmogs: ${fmt(stats.transmogFeitos)}`;

    // Ajustes
    if (!ativo(q("fontRange"))) q("fontRange").value = st.font ?? 12;
    q("fontVal").textContent = `${st.font ?? 12}px`;
    q("swRoleta").classList.toggle("on", !!st.roleta.ligada);
    chipsVel.forEach(([v, b]) => b.classList.toggle("on", Number(st.roleta.vel) === v));

    // Indicadores do trilho
    q("vivoAuto").classList.toggle("vivo", autoAtivo);
    q("vivoInicio").classList.toggle("vivo", !!cfg.running && algum);
    q("vivoForja").classList.toggle("vivo", !!st.forge.ligado);
    q("vivoAtributos").classList.toggle("vivo", !!st.stats.ligado);
    q("vivoGemas").classList.toggle("vivo", !!st.gems.ligado || !!st.socket.ligado);
    q("vivoVenda").classList.toggle("vivo", !!st.sell.ligado || !!st.lote.ligado);
    q("vivoAlchemy").classList.toggle("vivo", !!st.alchemy.ligado);
    q("vivoTransmog").classList.toggle("vivo", !!st.transmog.ligado);
    q("vivoAjustes").classList.toggle("vivo", false);

    // Se o motor ficou parado, o rodapé aponta o caminho em vez de mentir.
    q("footStatus").textContent = parado
      ? `Sem rodada há ${idadeRodada(marcaRodada)} — toque em ▶`
      : (status.lastAction
        ? status.lastAction
        : (cfg.running ? (algum ? "Trabalhando..." : "Nenhum módulo ligado") : "Farm desligado"));
    q("roundAge").textContent = status.roundAt ? `rodada há ${idadeRodada()}` : "aguardando";

    posicionar();
  }

  /* ------------------------------- sincronia ------------------------------ */

  async function lerTudo() {
    const r = await store.get([KEY, STATS_KEY, STATUS_KEY, UI_KEY, PLAY_KEY, CHAT_KEY, CHAT_CLOCK_KEY]);
    if (r[KEY]) {
      cfg.running = r[KEY].running === true;
      cfg.settings = merge(defaults().settings, r[KEY].settings);
      ajustarConflitosAuto();
    }
    if (r[STATS_KEY]) {
      stats = {
        forjaTotal: 0, forjaPerdidos: 0, equipTotal: 0, vendidos: 0, aprimorados: 0,
        ...r[STATS_KEY],
        gemTotais: { juntadas: 0, supremas: 0, perdidas: 0, ...(r[STATS_KEY].gemTotais || {}) },
        upNiveis: r[STATS_KEY].upNiveis || {},
        upGasto: r[STATS_KEY].upGasto || {}
      };
    }
    if (r[STATUS_KEY]) status = { ...status, ...r[STATUS_KEY] };
    if (r[PLAY_KEY]) play = { ...play, ...r[PLAY_KEY] };
    if (r[CHAT_KEY]) chat = { ...chat, ...r[CHAT_KEY] };
    if (r[CHAT_CLOCK_KEY]) clock = { ...clock, ...r[CHAT_CLOCK_KEY] };
    if (r[UI_KEY]) ui = { ...ui, ...r[UI_KEY] };
    desenhar();
  }

  chrome.storage.onChanged.addListener((m) => {
    if (m[KEY]?.newValue) {
      cfg.running = m[KEY].newValue.running === true;
      cfg.settings = merge(cfg.settings, m[KEY].newValue.settings);
      ajustarConflitosAuto();
      desenhar();
    }
    if (m[STATS_KEY]?.newValue) {
      stats = { ...stats, ...m[STATS_KEY].newValue };
      desenhar();
    }
    if (m[STATUS_KEY]?.newValue) {
      status = { ...status, ...m[STATUS_KEY].newValue };
      desenhar();
    }
    if (m[PLAY_KEY]?.newValue) {
      play = { ...play, ...m[PLAY_KEY].newValue };
      desenhar();
    }
    if (m[CHAT_KEY]?.newValue) {
      chat = { ...chat, ...m[CHAT_KEY].newValue };
      desenhar();
    }
    if (m[CHAT_CLOCK_KEY]?.newValue) {
      clock = { ...clock, ...m[CHAT_CLOCK_KEY].newValue };
      desenhar();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg?.abrirPainel) return;
    ui.aberto = true;
    ui.minimizado = false;
    salvarUI();
    desenhar();
  });

  // Ao voltar para a aba, confere se o painel continua aberto e dentro da tela.
  async function aoVoltar() {
    if (document.visibilityState !== "visible") return;
    const r = await store.get(UI_KEY);
    if (r[UI_KEY]) ui = { ...ui, ...r[UI_KEY] };
    desenhar();
  }
  document.addEventListener("visibilitychange", aoVoltar);
  addEventListener("focus", aoVoltar);
  addEventListener("resize", posicionar);

  lerTudo().catch(() => desenhar());
  setInterval(async () => {
    const r = await store.get([STATS_KEY, STATUS_KEY, PLAY_KEY, CHAT_KEY, CHAT_CLOCK_KEY]);
    if (r[STATS_KEY]) stats = { ...stats, ...r[STATS_KEY] };
    if (r[STATUS_KEY]) status = { ...status, ...r[STATUS_KEY] };
    if (r[PLAY_KEY]) play = { ...play, ...r[PLAY_KEY] };
    if (r[CHAT_KEY]) chat = { ...chat, ...r[CHAT_KEY] };
    if (r[CHAT_CLOCK_KEY]) clock = { ...clock, ...r[CHAT_CLOCK_KEY] };
    desenhar();
  }, 2500);
  setInterval(() => {
    q("roundAge").textContent = status.roundAt ? `rodada há ${idadeRodada()}` : "aguardando";
  }, 1000);
})();
