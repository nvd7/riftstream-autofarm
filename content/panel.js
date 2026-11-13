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

  const VERSION = "2.1.0";
  const RARIDADES = [
    ["comum", "Comum", "#4de3b0"],
    ["incomum", "Incomum", "#5cc8ff"],
    ["raro", "Raro", "#9d8bff"],
    ["epico", "Épico ⚠", "#ffb454"],
    ["lendario", "Lendário ⚠", "#ff7a7a"]
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
        equip: true,
        forge: {
          ligado: false,
          raridades: { comum: true, incomum: true, raro: false, epico: false, lendario: false },
          tipos: { arma: true, elmo: true, armadura: true, anel: true },
          minLevel: 0,
          maxLevel: 9999
        },
        stats: {
          ligado: true, modo: "igual",
          sel: { forca: true, vitalidade: true, defesa: true, agilidade: true, sorte: true },
          metas: {}
        },
        gems: { ligado: true, juntar: true, suprema: false },
        socket: { ligado: false },
        enhance: { ligado: false },
        sell: { ligado: false, rarity: 2, level: 9999 },
        lote: { ligado: false, rarity: 2, level: 40 },
        organize: true,
        roleta: { ligada: false, vel: 4 },
        goldReserve: 50000,
        theme: "dark",
        font: 12
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

  const store = chrome.storage.local;
  let cfg = defaults();
  let stats = { forjaTotal: 0, forjaPerdidos: 0, equipTotal: 0, vendidos: 0, aprimorados: 0, gemTotais: {}, upNiveis: {}, upGasto: {} };
  let status = {
    forja: "", up: "", gem: "", equip: "", sell: "", enhance: "", socket: "", organize: "",
    character: null, lastAction: "", updatedAt: 0, counts: { forja: 0, venda: 0 }, roundAt: 0
  };
  let ui = { aberto: true, aba: "inicio", x: null, y: null, minimizado: false };

  const host = document.createElement("div");
  host.id = "rsaf-panel";
  host.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;display:block";
  const raiz = host.attachShadow({ mode: "open" });

  raiz.innerHTML = `
  <style>
    :host, * { box-sizing: border-box; }
    .app{
      --fs:12px;
      --bg:#07110e; --bg2:#0a1a15; --surface:#0f2620; --surface2:#143029;
      --line:#1d443a; --line2:#2a5c4d; --text:#e4fff6; --muted:#7fa89c;
      --mint:#4de3b0; --mint-dim:#4de3b01c; --cyan:#5cc8ff; --red:#ff7a7a;
      --mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
      --shadow:0 24px 64px #000000c9, 0 0 0 1px #0a1a1555;
      font:var(--fs)/1.45 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;
      color:var(--text);
    }
    .app[data-theme="light"]{
      --bg:#edfaf4; --bg2:#f7fffb; --surface:#ffffff; --surface2:#e6f5ee;
      --line:#c6e6d9; --line2:#a7d5c5; --text:#0b2b22; --muted:#4f776b;
      --mint:#0a9d74; --mint-dim:#0a9d7414; --cyan:#0b78a8; --red:#c93a3a;
      --shadow:0 22px 55px #12352a2e, 0 0 0 1px #c6e6d9;
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

    .head{
      display:flex; align-items:center; gap:10px; padding:9px 10px 9px 12px; cursor:grab;
      background:linear-gradient(90deg,var(--surface),var(--bg2));
      border-bottom:1px solid var(--line); user-select:none; flex:none;
    }
    .head:active{ cursor:grabbing; }
    .brand{ display:flex; align-items:center; gap:9px; flex:1; min-width:0; }
    .logo{
      width:28px; height:28px; border-radius:7px; display:grid; place-items:center;
      background:linear-gradient(150deg,var(--mint),#18a982); color:#04231b;
      font:800 15px/1 var(--mono); box-shadow:0 0 18px #4de3b045;
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
    .dot{ width:7px; height:7px; border-radius:50%; background:#3d5a51; flex:none; }
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
      color:var(--text); background:var(--surface2);
      border-left-color:var(--mint); box-shadow:inset 0 0 0 1px var(--line);
    }
    .tab.on .ico{ color:var(--mint); }
    .tab i{ position:absolute; top:7px; right:9px; width:5px; height:5px; border-radius:50%; background:#3d5a51; }
    .tab i.vivo{ background:var(--mint); box-shadow:0 0 6px var(--mint); }
    .rail .spacer{ flex:1; }
    .rail .ver{ font:600 8px/1 var(--mono); color:#4e6c63; text-align:center; padding-bottom:2px; }

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

    .risk{ margin:8px 0 0; padding:6px 8px; border-radius:5px; background:#ff7a7a1c; color:#ff9d94; font-size:10.5px; }
    .app[data-theme="light"] .risk{ color:#a12a2a; }
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
    .hero-grid div{ background:#0000001f; border:1px solid var(--line); border-radius:6px; padding:6px 8px; }
    .app[data-theme="light"] .hero-grid div{ background:#0a9d7408; }
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
    @media (prefers-reduced-motion: reduce){ .panel, .dot.work{ animation:none } }
  </style>

  <div class="app" id="app" data-aberto="1" data-theme="dark" data-min="0">
    <button class="bubble" id="bubble" title="Abrir RiftStream AutoFarm">◆</button>
    <div class="shell">
      <header class="head" id="head">
        <div class="brand">
          <span class="logo">F</span>
          <div><b>FARMLINE</b><small>RIFTSTREAM ENGINE</small></div>
        </div>
        <div class="head-actions">
          <span class="dot" id="dot"></span>
          <button class="icon" id="themeQuick" title="Alternar tema">◐</button>
          <button class="icon" id="min" title="Minimizar">–</button>
          <button class="icon" id="close" title="Fechar">✕</button>
        </div>
      </header>

      <div class="work">
        <nav class="rail" id="tabs">
          <button class="tab" data-tab="inicio"><span class="ico">◈</span><span>Base</span><i id="vivoInicio"></i></button>
          <button class="tab" data-tab="forja"><span class="ico">⚒</span><span>Forja</span><i id="vivoForja"></i></button>
          <button class="tab" data-tab="atributos"><span class="ico">↗</span><span>Upar</span><i id="vivoAtributos"></i></button>
          <button class="tab" data-tab="gemas"><span class="ico">◉</span><span>Gemas</span><i id="vivoGemas"></i></button>
          <button class="tab" data-tab="venda"><span class="ico">⌫</span><span>Venda</span><i id="vivoVenda"></i></button>
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
            <section class="panel" data-panel="inicio">
              <div class="hero">
                <div class="hero-top"><b id="charName">Sem personagem</b><span id="charCls"></span></div>
                <div class="hero-grid">
                  <div><span>Nível</span><b id="charLevel">—</b></div>
                  <div><span>Ouro</span><b id="charGold">—</b></div>
                  <div><span>Combate</span><b id="charPower">—</b></div>
                </div>
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
              <h3>Forjar para</h3>
              <div class="chips" id="chipsRarity"></div>
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
                <button data-modo="igual">Dividir ouro</button>
                <button data-modo="nivel">Até o nível</button>
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
                forja está juntando. Nível 9999 = sem limite.
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

              <div class="row" style="margin-top:12px">
                <span class="grow">Organizar baús<small>A cada 6 horas, por nível</small></span>
                <button class="sw" id="swOrganize"></button>
              </div>
              <div class="statusbox"><span id="stSell">Desligada</span><small id="ctSell"></small></div>
            </section>

            <section class="panel" data-panel="ajustes">
              <h3>Tema</h3>
              <div class="seg" id="segTema">
                <button data-tema="dark">Escuro</button>
                <button data-tema="light">Claro</button>
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
                <span>FARMLINE · RiftStream AutoFarm</span><small>Versão ${VERSION} · engine na própria página</small>
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
  </div>`;

  document.documentElement.appendChild(host);

  const q = (id) => raiz.getElementById(id);
  const app = q("app");

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

  const chipsType = TIPOS.map(([id, nome]) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = nome;
    b.addEventListener("click", () => {
      cfg.settings.forge.tipos[id] = !cfg.settings.forge.tipos[id];
      salvarCfg();
    });
    q("chipsType").append(b);
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
      s.socket.ligado || s.enhance.ligado || s.sell.ligado || s.lote.ligado || s.organize);
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
  q("swForge").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.forge.ligado = !cfg.settings.forge.ligado;
  }));
  q("swForgeScroll").addEventListener("click", () => {
    cfg.settings.forge.useScroll = !cfg.settings.forge.useScroll;
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
    cfg.settings.lote.ligado = !cfg.settings.lote.ligado;
  }));
  q("swOrganize").addEventListener("click", () => mexerModulo(() => {
    cfg.settings.organize = !cfg.settings.organize;
  }));
  q("swRoleta").addEventListener("click", () => {
    cfg.settings.roleta.ligada = !cfg.settings.roleta.ligada;
    salvarCfg();
  });

  q("themeQuick").addEventListener("click", () => {
    cfg.settings.theme = cfg.settings.theme === "light" ? "dark" : "light";
    salvarCfg();
  });

  raiz.querySelectorAll("#segModo button").forEach((b) => b.addEventListener("click", () => {
    cfg.settings.stats.modo = b.dataset.modo;
    salvarCfg();
  }));
  raiz.querySelectorAll("#segTema button").forEach((b) => b.addEventListener("click", () => {
    cfg.settings.theme = b.dataset.tema;
    salvarCfg();
  }));

  q("reserve").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.goldReserve = Number.isNaN(v) ? 0 : v;
    salvarCfg();
  });
  q("forgeMin").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.forge.minLevel = Number.isNaN(v) ? 0 : v;
    salvarCfg();
  });
  q("forgeMax").addEventListener("input", (e) => {
    const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
    cfg.settings.forge.maxLevel = Number.isNaN(v) ? 9999 : v;
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
    ["venda", "Venda", (x) => x.sell.ligado, "sell"]
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
      default: return "";
    }
  }

  function idadeRodada() {
    if (!status.roundAt) return "—";
    const s = Math.max(0, Math.round((Date.now() - status.roundAt) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h`;
  }

  function desenhar() {
    const st = cfg.settings;

    app.dataset.theme = st.theme === "light" ? "light" : "dark";
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
      ? (algum ? "Ligado — manutenção a cada ~30 s" : "Ligado, mas nenhum módulo marcado")
      : "Desligado — nada é enviado ao jogo";

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

    // Forja
    q("swEquip").classList.toggle("on", !!st.equip);
    q("swEnhance").classList.toggle("on", !!st.enhance.ligado);
    q("enhanceRisk").hidden = !st.enhance.ligado;
    q("swForge").classList.toggle("on", !!st.forge.ligado);
    q("swForgeScroll").classList.toggle("on", !!st.forge.useScroll);
    chipsRarity.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.raridades[id]));
    chipsType.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.tipos[id]));
    q("forgeRisk").hidden = !["epico", "lendario"].some((id) => st.forge.raridades[id]);
    if (!ativo(q("forgeMin"))) q("forgeMin").value = st.forge.minLevel ?? 0;
    if (!ativo(q("forgeMax"))) q("forgeMax").value = st.forge.maxLevel ?? 9999;
    q("stForja").textContent = st.forge.ligado ? (status.forja || "Procurando itens...") : "Desligada";
    q("ctForja").textContent = `${fmt(status.counts?.forja ?? 0)} grupo(s) pronto(s) · ` +
      `Forjados: ${fmt(stats.forjaTotal)} · Perdidos: ${fmt(stats.forjaPerdidos)}`;

    // Atributos
    q("swUp").classList.toggle("on", !!st.stats.ligado);
    raiz.querySelectorAll("#segModo button").forEach((b) => b.classList.toggle("on", b.dataset.modo === st.stats.modo));
    q("boxIgual").hidden = st.stats.modo !== "igual";
    q("boxNivel").hidden = st.stats.modo !== "nivel";
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

    // Ajustes
    raiz.querySelectorAll("#segTema button").forEach((b) => b.classList.toggle("on", b.dataset.tema === (st.theme === "light" ? "light" : "dark")));
    if (!ativo(q("fontRange"))) q("fontRange").value = st.font ?? 12;
    q("fontVal").textContent = `${st.font ?? 12}px`;
    q("swRoleta").classList.toggle("on", !!st.roleta.ligada);
    chipsVel.forEach(([v, b]) => b.classList.toggle("on", Number(st.roleta.vel) === v));

    // Indicadores do trilho
    q("vivoInicio").classList.toggle("vivo", !!cfg.running && algum);
    q("vivoForja").classList.toggle("vivo", !!st.forge.ligado);
    q("vivoAtributos").classList.toggle("vivo", !!st.stats.ligado);
    q("vivoGemas").classList.toggle("vivo", !!st.gems.ligado || !!st.socket.ligado);
    q("vivoVenda").classList.toggle("vivo", !!st.sell.ligado || !!st.lote.ligado);
    q("vivoAjustes").classList.toggle("vivo", false);

    q("footStatus").textContent = status.lastAction
      ? status.lastAction
      : (cfg.running ? (algum ? "Trabalhando..." : "Nenhum módulo ligado") : "Farm desligado");
    q("roundAge").textContent = status.roundAt ? `rodada há ${idadeRodada()}` : "aguardando";

    posicionar();
  }

  /* ------------------------------- sincronia ------------------------------ */

  async function lerTudo() {
    const r = await store.get([KEY, STATS_KEY, STATUS_KEY, UI_KEY]);
    if (r[KEY]) {
      cfg.running = r[KEY].running === true;
      cfg.settings = merge(defaults().settings, r[KEY].settings);
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
    if (r[UI_KEY]) ui = { ...ui, ...r[UI_KEY] };
    desenhar();
  }

  chrome.storage.onChanged.addListener((m) => {
    if (m[KEY]?.newValue) {
      cfg.running = m[KEY].newValue.running === true;
      cfg.settings = merge(cfg.settings, m[KEY].newValue.settings);
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
    const r = await store.get(STATUS_KEY);
    if (r[STATUS_KEY]) { status = { ...status, ...r[STATUS_KEY] }; desenhar(); }
  }, 2500);
  setInterval(() => {
    q("roundAge").textContent = status.roundAt ? `rodada há ${idadeRodada()}` : "aguardando";
  }, 1000);
})();
