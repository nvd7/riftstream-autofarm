"use strict";

/*
 * RiftStream AutoFarm — painel flutuante (dentro do site do jogo)
 * =========================================================================
 * É a UI principal da extensão. Vive num Shadow DOM para não brigar com o
 * CSS do RiftStream. Fala com a engine apenas por chrome.storage.local.
 *
 * Abas: Início · Forja · Atributos · Gemas · Venda · Ajustes
 * Recursos: arrastar, minimizar, tema claro/escuro, tamanho da fonte.
 * ========================================================================= */

(() => {
  if (document.getElementById("rsaf-panel")) return;

  const KEY = "rsaf";
  const STATS_KEY = "rsafStats";
  const STATUS_KEY = "rsafStatus";
  const UI_KEY = "rsafPanel";

  const VERSION = "2.0.0";
  const RARIDADES = [
    ["comum", "Comum", "#5fd08c"],
    ["incomum", "Incomum", "#6aa8ff"],
    ["raro", "Raro", "#c684f5"],
    ["epico", "Épico ⚠", "#ffa94d"],
    ["lendario", "Lendário ⚠", "#ff6b6b"]
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
        sell: { ligado: false, rarity: 2, level: 40 },
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
  let status = { forja: "", up: "", gem: "", equip: "", sell: "", enhance: "", character: null, lastAction: "" };
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
      --bg:#0b0916; --bg2:#120f22; --panel:#171331; --panel2:#1e1940;
      --line:#2e2755; --line2:#3d3470; --text:#efeaff; --muted:#a49cc9;
      --gold:#ffcf4a; --gold-dim:#ffcf4a22; --green:#46d483; --red:#ff6b6b;
      --blue:#6aa8ff; --purple:#b98cff; --shadow:0 18px 48px #000000b0;
      font: var(--fs)/1.4 ui-sans-serif,system-ui,"Segoe UI",Roboto,sans-serif;
      color: var(--text);
    }
    .app[data-theme="light"]{
      --bg:#f6f4fc; --bg2:#fff; --panel:#ffffff; --panel2:#f0edfa;
      --line:#ddd6f0; --line2:#c9bfe6; --text:#211d35; --muted:#6f6890;
      --gold:#a67800; --gold-dim:#a6780018; --green:#1f9d57; --red:#d64545;
      --blue:#2563eb; --purple:#7c3aed; --shadow:0 18px 44px #2b205040;
    }
    .bubble{
      display:none; width:46px; height:46px; border-radius:50%; border:1px solid var(--line2);
      background:linear-gradient(160deg,#2a2350,#171331); color:var(--gold); font-size:20px;
      cursor:pointer; box-shadow:var(--shadow); align-items:center; justify-content:center;
    }
    .app[data-theme="light"] .bubble{ background:linear-gradient(160deg,#fff,#eee9ff); }
    .bubble:hover{ transform:translateY(-2px); }
    .shell{
      display:none; width:318px; max-height:calc(100vh - 32px); overflow:hidden;
      border-radius:16px; border:1px solid var(--line2);
      background:linear-gradient(180deg,var(--panel),var(--bg2));
      box-shadow:var(--shadow), inset 0 1px 0 #ffffff12;
      display:none; flex-direction:column;
    }
    .head{
      display:flex; align-items:center; gap:10px; padding:10px 10px 10px 13px; cursor:grab;
      background:linear-gradient(180deg,#ffffff0d,transparent); border-bottom:1px solid var(--line);
      user-select:none; flex:none;
    }
    .head:active{ cursor:grabbing; }
    .brand{ display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
    .logo{
      width:26px; height:26px; border-radius:8px; display:grid; place-items:center;
      background:linear-gradient(160deg,#ffcf4a,#d99a12); color:#241a02;
      font-size:14px; font-weight:800; box-shadow:0 4px 12px #ffcf4a33;
    }
    .brand b{ display:block; font-size:11px; letter-spacing:1.4px; }
    .brand small{ display:block; font-size:9px; letter-spacing:2.4px; color:var(--gold); }
    .head-actions{ display:flex; align-items:center; gap:6px; }
    .icon{
      width:24px; height:24px; border-radius:7px; border:1px solid var(--line2);
      background:var(--panel2); color:var(--muted); cursor:pointer; font-size:12px; line-height:1;
      display:grid; place-items:center; transition:.15s;
    }
    .icon:hover{ color:var(--text); border-color:var(--gold); }
    .dot{ width:8px; height:8px; border-radius:50%; background:#51496f; flex:none; }
    .dot.on{ background:var(--green); box-shadow:0 0 8px var(--green); }
    .dot.work{ background:var(--gold); box-shadow:0 0 8px var(--gold); animation:pulse 1.1s infinite; }
    @keyframes pulse{ 50%{ opacity:.35 } }

    .master{
      display:flex; align-items:center; gap:10px; padding:11px 13px;
      background:linear-gradient(90deg,var(--gold-dim),transparent); border-bottom:1px solid var(--line);
      flex:none;
    }
    .master-txt{ flex:1; min-width:0; }
    .master-txt b{ font-size:12.5px; display:block; }
    .master-txt small{ color:var(--muted); font-size:10.5px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    .tabs{ display:grid; grid-template-columns:repeat(3,1fr); gap:5px; padding:9px 11px 0; flex:none; }
    .tab{
      position:relative; padding:6px 4px; border:1px solid var(--line); border-radius:9px;
      background:transparent; color:var(--muted); font:600 10.5px inherit; font-family:inherit;
      cursor:pointer; transition:.15s;
    }
    .tab:hover{ color:var(--text); border-color:var(--line2); }
    .tab.on{ background:var(--gold); border-color:var(--gold); color:#241a02; }
    .tab i{ position:absolute; top:4px; right:5px; width:6px; height:6px; border-radius:50%; background:#51496f; }
    .tab i.vivo{ background:var(--green); box-shadow:0 0 6px var(--green); }

    .body{ padding:11px 13px 13px; overflow-y:auto; min-height:0; }
    .body::-webkit-scrollbar{ width:7px; }
    .body::-webkit-scrollbar-thumb{ background:var(--line2); border-radius:8px; }
    .panel{ display:none; animation:in .16s ease-out; }
    .panel.on{ display:block; }
    @keyframes in{ from{ opacity:0; transform:translateY(4px) } }

    h3{ margin:13px 0 6px; font-size:10px; letter-spacing:.8px; text-transform:uppercase; color:var(--muted); }
    h3:first-child{ margin-top:0; }
    .row{
      display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px;
      background:var(--panel2); border:1px solid var(--line); font-weight:600; font-size:11.5px;
    }
    .row + .row{ margin-top:6px; }
    .row .grow{ flex:1; min-width:0; }
    .row small{ display:block; color:var(--muted); font-weight:500; font-size:10px; }
    .chip-note{ font-style:normal; color:var(--muted); font-weight:500; font-size:10px; }

    .sw{
      position:relative; width:38px; height:21px; flex:none; border:0; border-radius:12px;
      background:#4a4368; cursor:pointer; transition:background .18s;
    }
    .sw::after{
      content:""; position:absolute; top:2px; left:2px; width:17px; height:17px; border-radius:50%;
      background:#fff; transition:left .18s; box-shadow:0 1px 3px #0006;
    }
    .sw.on{ background:var(--green); }
    .sw.on::after{ left:19px; }

    .chips{ display:flex; flex-wrap:wrap; gap:5px; }
    .chip{
      padding:5px 9px; border:1px solid var(--line2); border-radius:20px; background:transparent;
      color:var(--muted); font:600 10.5px inherit; font-family:inherit; cursor:pointer; transition:.15s;
    }
    .chip:hover{ color:var(--text); }
    .chip.on{ background:#ffffff14; color:var(--c,#fff); border-color:var(--c,var(--text)); }
    .app[data-theme="light"] .chip.on{ background:#00000008; }

    .seg{ display:grid; grid-template-columns:1fr 1fr; margin:8px 0; border:1px solid var(--line2); border-radius:9px; overflow:hidden; }
    .seg button{ padding:7px 4px; border:0; background:transparent; color:var(--muted); font:600 10.5px inherit; font-family:inherit; cursor:pointer; }
    .seg button.on{ background:var(--line2); color:var(--text); }

    .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-top:7px; }
    .field{ display:flex; flex-direction:column; gap:4px; color:var(--muted); font-size:10px; }
    .field input, .field select{
      width:100%; padding:6px 8px; border:1px solid var(--line2); border-radius:8px;
      background:var(--bg); color:var(--text); font:11.5px inherit; font-family:inherit;
    }
    .field input:focus, .field select:focus{ outline:0; border-color:var(--gold); box-shadow:0 0 0 2px var(--gold-dim); }
    .field input:disabled{ opacity:.45; }
    input[type=range]{ accent-color:var(--gold); width:100%; }

    .meta{ display:grid; grid-template-columns:1fr 52px 72px; align-items:center; gap:7px; padding:3px 0; font-size:11px; }
    .meta span{ color:var(--muted); }
    .meta .nv{ text-align:right; color:var(--muted); font-size:10px; }
    .meta input{
      width:100%; padding:4px 6px; border:1px solid var(--line2); border-radius:6px;
      background:var(--bg); color:var(--text); font:11px inherit; font-family:inherit; text-align:right;
    }
    .meta input:focus{ outline:0; border-color:var(--gold); }

    .statusbox{
      margin-top:11px; padding:9px 10px; border-radius:10px; border:1px solid var(--line);
      background:#ffffff06; font-size:11px; color:var(--text); word-break:break-word;
    }
    .app[data-theme="light"] .statusbox{ background:#00000004; }
    .statusbox small{ display:block; margin-top:3px; color:var(--muted); font-size:10px; }

    .risk{ margin:8px 0 0; padding:6px 8px; border-radius:8px; background:#ff6b6b1f; color:#ff9d94; font-size:10.5px; }
    .app[data-theme="light"] .risk{ color:#a12a2a; }
    .hint{ margin:6px 0 0; color:var(--muted); font-size:10.5px; line-height:1.45; }

    .hero{
      padding:11px; border-radius:12px; border:1px solid var(--line2);
      background:linear-gradient(140deg,#ffffff10,transparent);
    }
    .hero-top{ display:flex; align-items:baseline; gap:7px; }
    .hero-top b{ font-size:13px; }
    .hero-top span{ color:var(--gold); font-size:10px; text-transform:capitalize; }
    .hero-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:9px; }
    .hero-grid div{ background:#00000026; border-radius:8px; padding:6px 8px; }
    .app[data-theme="light"] .hero-grid div{ background:#00000008; }
    .hero-grid span{ display:block; color:var(--muted); font-size:9px; letter-spacing:.4px; text-transform:uppercase; }
    .hero-grid b{ display:block; font-size:12.5px; margin-top:1px; }

    .list{ display:flex; flex-direction:column; gap:5px; margin-top:10px; }
    .item{
      display:flex; align-items:center; gap:8px; padding:6px 9px; border-radius:8px;
      background:var(--panel2); font-size:10.5px;
    }
    .item .t{ flex:1; min-width:0; }
    .item .t small{ display:block; color:var(--muted); font-size:9.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .item .s{ width:7px; height:7px; border-radius:50%; background:#51496f; flex:none; }
    .item .s.on{ background:var(--green); }

    .counters{ display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:10px; }
    .counters div{ padding:7px; border-radius:8px; background:var(--panel2); text-align:center; }
    .counters b{ display:block; font-size:13px; color:var(--gold); }
    .counters span{ display:block; color:var(--muted); font-size:9px; }

    .warn{ margin:11px 0 0; color:var(--muted); font-size:9.5px; line-height:1.4; border-left:2px solid var(--gold); padding-left:8px; }

    .foot{
      display:flex; align-items:center; gap:8px; padding:7px 12px; border-top:1px solid var(--line);
      color:var(--muted); font-size:9.5px; background:#0000001a; flex:none;
    }
    .foot .txt{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .foot .v{ color:var(--line2); }

    .app[data-min="1"] .tabs, .app[data-min="1"] .body, .app[data-min="1"] .foot{ display:none; }
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
          <span class="logo">◆</span>
          <div><b>RIFT AUTO</b><small>AUTOFARM</small></div>
        </div>
        <div class="head-actions">
          <span class="dot" id="dot"></span>
          <button class="icon" id="min" title="Minimizar">–</button>
          <button class="icon" id="close" title="Fechar">✕</button>
        </div>
      </header>

      <div class="master">
        <div class="master-txt">
          <b>Farm automático</b>
          <small id="masterHint">Desligado — nada é enviado ao jogo</small>
        </div>
        <button class="sw" id="swFarm" title="Ligar/desligar tudo"></button>
      </div>

      <nav class="tabs" id="tabs">
        <button class="tab" data-tab="inicio">Início<i id="vivoInicio"></i></button>
        <button class="tab" data-tab="forja">Forja<i id="vivoForja"></i></button>
        <button class="tab" data-tab="atributos">Atributos<i id="vivoAtributos"></i></button>
        <button class="tab" data-tab="gemas">Gemas<i id="vivoGemas"></i></button>
        <button class="tab" data-tab="venda">Venda<i id="vivoVenda"></i></button>
        <button class="tab" data-tab="ajustes">Ajustes<i id="vivoAjustes"></i></button>
      </nav>

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
          <div class="list" id="statusList"></div>
          <div class="counters" id="counters"></div>
          <p class="warn">
            Esta extensão não envia mensagens no chat. Automatizar o inventário
            viola os Termos do RiftStream — use por sua conta e risco.
          </p>
        </section>

        <section class="panel" data-panel="forja">
          <div class="row">
            <span class="grow">Forjar sozinho<small>Junta 3–4 itens iguais (slot + raridade)</small></span>
            <button class="sw" id="swForge"></button>
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
                <option value="-1">Desligado</option>
                <option value="0">Comum</option>
                <option value="1">Incomum</option>
                <option value="2">Raro</option>
                <option value="3">Épico</option>
              </select>
            </label>
            <label class="field">Nível até<input id="sellLevel" type="number" min="0" max="9999" step="5" inputmode="numeric" /></label>
          </div>
          <p class="hint">Nunca vende itens equipados, favoritos ou com gemas.</p>

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
            <b id="fontVal" style="width:34px;text-align:right">12px</b>
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
            <span>RiftStream AutoFarm</span><small>Versão ${VERSION} · engine na própria página</small>
          </div>
        </section>
      </div>

      <footer class="foot">
        <span class="txt" id="footStatus">Pronto.</span>
        <span class="v">v${VERSION}</span>
      </footer>
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
    ["juntar", "Juntar 3 em 3", "#46d483"],
    ["suprema", "Suprema ⚠", "#ff6b6b"]
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
    b.style.setProperty("--c", "#ffcf4a");
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

  q("swFarm").addEventListener("click", () => {
    cfg.running = !cfg.running;
    salvarCfg();
  });
  q("swForge").addEventListener("click", () => {
    cfg.settings.forge.ligado = !cfg.settings.forge.ligado;
    salvarCfg();
  });
  q("swUp").addEventListener("click", () => {
    cfg.settings.stats.ligado = !cfg.settings.stats.ligado;
    salvarCfg();
  });
  q("swGems").addEventListener("click", () => {
    cfg.settings.gems.ligado = !cfg.settings.gems.ligado;
    salvarCfg();
  });
  q("swSocket").addEventListener("click", () => {
    cfg.settings.socket.ligado = !cfg.settings.socket.ligado;
    salvarCfg();
  });
  q("swSell").addEventListener("click", () => {
    cfg.settings.sell.ligado = !cfg.settings.sell.ligado;
    salvarCfg();
  });
  q("swLote").addEventListener("click", () => {
    cfg.settings.lote.ligado = !cfg.settings.lote.ligado;
    salvarCfg();
  });
  q("swOrganize").addEventListener("click", () => {
    cfg.settings.organize = !cfg.settings.organize;
    salvarCfg();
  });
  q("swRoleta").addEventListener("click", () => {
    cfg.settings.roleta.ligada = !cfg.settings.roleta.ligada;
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
    cfg.settings.sell.level = Number.isNaN(v) ? 0 : v;
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

  function desenhar() {
    const st = cfg.settings;

    app.dataset.theme = st.theme === "light" ? "light" : "dark";
    app.dataset.aberto = ui.aberto ? "1" : "0";
    app.dataset.min = ui.minimizado ? "1" : "0";
    app.style.setProperty("--fs", `${Math.min(18, Math.max(10, Number(st.font) || 12))}px`);

    raiz.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.aba));
    raiz.querySelectorAll(".panel").forEach((p) => p.classList.toggle("on", p.dataset.panel === ui.aba));

    const algumModulo = st.equip || st.forge.ligado || st.stats.ligado || st.gems.ligado ||
      st.socket.ligado || st.enhance.ligado || st.sell.ligado || st.lote.ligado;
    const dot = q("dot");
    dot.className = "dot";
    if (cfg.running && algumModulo) dot.classList.add("on");
    if (cfg.running && algumModulo && !/Desligad|Nenhum|Aguardando|Juntando|Metas concluídas/i.test(textoModulo(ui.aba === "atributos" ? "up" : ui.aba))) {
      dot.classList.add("work");
    }

    q("swFarm").classList.toggle("on", !!cfg.running);
    q("masterHint").textContent = cfg.running
      ? (algumModulo ? "Ligado — manutenção a cada ~30 s" : "Ligado, mas nenhum módulo marcado")
      : "Desligado — nada é enviado ao jogo";

    // Início
    const ch = status.character;
    q("charName").textContent = ch?.name || "Sem personagem";
    q("charCls").textContent = ch?.cls || "";
    q("charLevel").textContent = ch?.level ? fmt(ch.level) : "—";
    q("charGold").textContent = ch ? fmt(ch.gold) : "—";
    q("charPower").textContent = ch ? fmt(ch.power) : "—";

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
    q("swForge").classList.toggle("on", !!st.forge.ligado);
    chipsRarity.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.raridades[id]));
    chipsType.forEach(([id, b]) => b.classList.toggle("on", !!st.forge.tipos[id]));
    q("forgeRisk").hidden = !["epico", "lendario"].some((id) => st.forge.raridades[id]);
    if (!ativo(q("forgeMin"))) q("forgeMin").value = st.forge.minLevel ?? 0;
    if (!ativo(q("forgeMax"))) q("forgeMax").value = st.forge.maxLevel ?? 9999;
    q("stForja").textContent = st.forge.ligado ? (status.forja || "Procurando itens...") : "Desligada";
    q("ctForja").textContent = `Forjados: ${fmt(stats.forjaTotal)} · Perdidos: ${fmt(stats.forjaPerdidos)}`;

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
    q("sellRarity").value = String(st.sell.rarity ?? 2);
    q("loteRarity").value = String(st.lote.rarity ?? 2);
    if (!ativo(q("sellLevel"))) q("sellLevel").value = st.sell.level ?? 40;
    if (!ativo(q("loteLevel"))) q("loteLevel").value = st.lote.level ?? 40;
    q("stSell").textContent = st.sell.ligado ? (status.sell || "Procurando itens...") : "Desligada";
    q("ctSell").textContent = `Vendidos: ${fmt(stats.vendidos)} · Venda do site: ${st.lote.ligado ? "ligada" : "desligada"}`;

    // Ajustes
    raiz.querySelectorAll("#segTema button").forEach((b) => b.classList.toggle("on", b.dataset.tema === (st.theme === "light" ? "light" : "dark")));
    if (!ativo(q("fontRange"))) q("fontRange").value = st.font ?? 12;
    q("fontVal").textContent = `${st.font ?? 12}px`;
    q("swRoleta").classList.toggle("on", !!st.roleta.ligada);
    chipsVel.forEach(([v, b]) => b.classList.toggle("on", Number(st.roleta.vel) === v));

    // Indicadores das abas
    q("vivoInicio").classList.toggle("vivo", !!cfg.running && algumModulo);
    q("vivoForja").classList.toggle("vivo", !!st.forge.ligado);
    q("vivoAtributos").classList.toggle("vivo", !!st.stats.ligado);
    q("vivoGemas").classList.toggle("vivo", !!st.gems.ligado || !!st.socket.ligado);
    q("vivoVenda").classList.toggle("vivo", !!st.sell.ligado || !!st.lote.ligado);
    q("vivoAjustes").classList.toggle("vivo", false);

    q("footStatus").textContent = status.lastAction
      ? status.lastAction
      : (cfg.running ? (algumModulo ? "Trabalhando..." : "Nenhum módulo ligado") : "Farm desligado");

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
})();
