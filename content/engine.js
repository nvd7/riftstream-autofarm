"use strict";

/*
 * RiftStream AutoFarm — engine (roda dentro da página do jogo)
 * =========================================================================
 * Base: extensão "Rift Auto" (painel flutuante + API descoberta na página).
 * Fundida com o AutoFarm: venda individual sem VIP, engaste de gemas,
 * aprimoramento, organização de baús, filtro de nível da forja, foco de
 * atributos e reserva de ouro.
 *
 * Por que aqui e não no service worker?
 *  - o token fica em localStorage["og.token"] (mesma sessão do site);
 *  - o endereço da API é lido do próprio código do jogo;
 *  - navigator.locks garante que só uma aba trabalha por vez.
 *
 * O painel (content/panel.js) e o popup falam com esta engine apenas por
 * chrome.storage.local. Nada aqui envia mensagem no chat do jogo.
 * ========================================================================= */

(() => {
  if (window.__rsafEngine) return;
  window.__rsafEngine = true;

  const SIMULAR = window.__FORJA_SIMULAR === true;
  const KEY = "rsaf";
  const STATS_KEY = "rsafStats";
  const STATUS_KEY = "rsafStatus";

  const INTERVALO = 2000;
  const ESPERA_FALHA = 30000;
  const ESPERA_PROTEGIDO = 10000;
  const MAX_VENDAS = 20;     // por rodada
  const MAX_RECICLAR = 40;   // itens por ação de alquimia
  const INTERVALO_ORGANIZAR = 6 * 60 * 60000;
  const MAX_TRANSMOG_ALVOS = 80; // alvos já transmogados lembrados entre recargas

  // Rede de segurança: nenhuma resposta e nenhuma rodada podem travar o motor
  // para sempre. Era isso que fazia o modo automático "parar de fazer as coisas".
  const TEMPO_MAX_PEDIDO = 25000;      // prazo de cada chamada à API
  const TEMPO_MAX_RODADA = 4 * 60000;  // prazo de uma rodada inteira
  const TEMPO_TRAVA = 8000;            // espera máxima pela trava entre abas
  const TEMPO_ESGOTADO = "tempo";

  const RARIDADES = ["comum", "incomum", "raro", "epico", "lendario", "evento", "imortal", "arcano"];
  const TIPOS = { weapon: "arma", helmet: "elmo", armor: "armadura", ring: "anel" };
  const ATRIBUTOS = { forca: "str", vitalidade: "vit", defesa: "def", agilidade: "agi", sorte: "luk" };
  const NOMES = { forca: "Força", vitalidade: "Vitalidade", defesa: "Defesa", agilidade: "Agilidade", sorte: "Sorte" };
  const RARIDADE_NOME = ["Comum", "Incomum", "Raro", "Épico", "Lendário", "Evento", "Imortal", "Arcano"];
  const FORGE_COST_FACTOR = [1, 1.35, 1.8, 2.5, 4, 3, 7, 11];
  // Alvo Lendário+ passa pela roleta; abaixo disso a forja é garantida.
  const ROLETA_MIN = 4;
  // Piso do nível do resultado (bundle, função `cH`): a fusão que gera Imortal
  // recebe piso 100 e a que gera Arcano recebe piso 130. Na prática, quatro
  // Lendários de nível baixo já devolvem um Imortal Nv. 100+, e quatro
  // Imortais Nv. 100 devolvem um Arcano Nv. 130+. É o atalho para o set.
  const PISO_RESULTADO = { 6: 100, 7: 130 };
  // Bundle: cada falha seguida na mesma raridade/tipo soma um passo de chance,
  // no máximo cinco vezes (gelo nível 5 = +10% com o passo padrão de 2%).
  const GELO_MAX = 5;
  // Valores de partida, substituídos pela wiki e, depois, pelo `chance` que o
  // próprio servidor devolve em cada fusão.
  const CHANCE_PADRAO = { 4: 0.6, 5: 0.6, 6: 0.35, 7: 0.25 };
  const ESTRATEGIAS = ["conservador", "agressivo", "bruto"];
  const GEM_TYPES = ["ruby", "sapphire", "topaz", "emerald", "amethyst"];
  const GEM_PRIO = {
    warrior: ["ruby", "topaz", "amethyst", "sapphire", "emerald"],
    cleric: ["emerald", "sapphire", "amethyst", "ruby", "topaz"],
    archer: ["topaz", "ruby", "sapphire", "amethyst", "emerald"]
  };

  // Modelo de combate do próprio jogo (bundle): usado só quando /api/me/character
  // não trouxer os valores finais. Base e crescimento por classe.
  const CLASSE_BASE = {
    warrior: { hp: 120, atk: 9, def: 4, aspd: 1.0, hpN: 19, atkN: 1.6, defN: 1.1 },
    cleric: { hp: 85, atk: 6, def: 2, aspd: 0.8, hpN: 9, atkN: 1.1, defN: 0.5 },
    archer: { hp: 70, atk: 11, def: 1.5, aspd: 1.1, hpN: 8, atkN: 1.9, defN: 0.4 }
  };
  // Pesos do modo ótimo: [dano, sobrevivência]. O equilíbrio usa média
  // geométrica — 1% de dano vale o mesmo que 1% de vida efetiva.
  const FOCO_PESOS = {
    equilibrado: [0.5, 0.5],
    dano: [0.72, 0.28],
    tanque: [0.28, 0.72]
  };
  // O bundle converte velocidade acima de 4,6 ataques/s em dano extra: metade
  // do valor por ataque, para não superestimar Agilidade no late game.
  const ASPD_UTIL = 4.6;
  // Dano sofrido = bruto * 100 / (100 + 4 * defesa).
  const DEF_K = 4;
  const CRIT_BASE_MULT = 1.75;

  const DEFAULT_SETTINGS = {
    // Modo automático: um botão só. Quando ligado, a engine se configura sozinha
    // (faixa de nível da forja e reserva de ouro saem do próprio inventário).
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
      // "bruto" forja tudo que fecha grupo — o gelo da roleta e o pergaminho
      // ainda são aplicados pelo servidor; o cliente só não segura a mão.
      estrategia: "bruto",
      chanceMinima: 0,
      // Caçar o set arcano: libera a fusão de Imortal (4 → Arcano) e mantém o
      // melhor item de cada tipo protegido, em vez de virar material.
      arcano: true
    },
    stats: {
      ligado: true,
      modo: "otimo",
      foco: "dano",
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
    goldReserve: 50000,
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
    }
  };

  const store = globalThis.chrome?.storage?.local;
  let cfg = { running: false, settings: structuredCloneSafe(DEFAULT_SETTINGS) };
  let stats = {
    forjaTotal: 0, forjaPerdidos: 0, equipTotal: 0, vendidos: 0, aprimorados: 0,
    gemTotais: { juntadas: 0, supremas: 0, perdidas: 0 }, upNiveis: {}, upGasto: {},
    chances: {},
    alchemyCriados: 0, alchemyReciclados: 0, alchemyUpados: 0, transmogFeitos: 0, transmogAlvos: {}
  };
  let status = {
    forja: "", up: "", gem: "", equip: "", sell: "", enhance: "", organize: "",
    alchemy: "", transmog: "",
    character: null, lastAction: "", updatedAt: 0,
    counts: { forja: 0, venda: 0, alchemy: 0, transmog: 0 }, roundAt: 0
  };

  /* ------------------------------ utilidades ------------------------------ */

  function structuredCloneSafe(v) {
    return JSON.parse(JSON.stringify(v));
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

  // Tema único.Qualquer id antigo é normalizado pelo themes.js; sem ele, cai
  // direto no Rift Violet.
  function normalizarTema(id) {
    if (typeof window.RSAF_resolverTema === "function") return window.RSAF_resolverTema(id);
    return "riftviolet";
  }

  function normalizedSettings(raw) {
    const out = structuredCloneSafe(DEFAULT_SETTINGS);
    merge(out, raw || {});
    out.goldReserve = Math.max(0, Number(out.goldReserve) || 0);
    out.forge.minLevel = Math.max(0, Number(out.forge.minLevel) || 0);
    out.forge.maxLevel = Math.max(out.forge.minLevel, Number(out.forge.maxLevel) || 9999);
    out.theme = normalizarTema(out.theme);
    out.font = Math.min(20, Math.max(10, Number(out.font) || 12));
    out.sell.rarity = Math.max(-1, Math.min(3, Math.round(num(out.sell.rarity, 2))));
    out.sell.level = Math.max(0, Math.min(9999, Math.round(num(out.sell.level, 9999))));
    out.lote.rarity = Math.max(-1, Math.min(3, Math.round(num(out.lote.rarity, 2))));
    out.lote.level = Math.max(0, Math.min(9999, Math.round(num(out.lote.level, 40))));
    out.alchemy.slotAlvo = ["arma","elmo","armadura","anel"].includes(out.alchemy.slotAlvo) ? out.alchemy.slotAlvo : "arma";
    // O servidor limita a raridade em /api/me/alchemy; aqui só impede valores
    // impossíveis e deixa o modo automático criar o melhor que a conta permite.
    out.alchemy.raridadeAlvo = Math.max(0, Math.min(4, Math.round(num(out.alchemy.raridadeAlvo, 2))));
    if (!["igual", "nivel", "otimo"].includes(out.stats.modo)) out.stats.modo = "otimo";
    if (!["equilibrado", "dano", "tanque"].includes(out.stats.foco)) out.stats.foco = "dano";
    if (!ESTRATEGIAS.includes(out.forge.estrategia)) out.forge.estrategia = "bruto";
    out.forge.chanceMinima = Math.max(0, Math.min(100, Math.round(num(out.forge.chanceMinima, 0))));
    // Sem a chave (config antiga) o padrão é caçar arcano: é o que o modo
    // automático espera e o que dá o maior salto de força.
    out.forge.arcano = out.forge.arcano !== false;
    out.transmog.alvoSlot = ["arma","elmo","armadura","anel"].includes(out.transmog.alvoSlot) ? out.transmog.alvoSlot : "arma";
    out.transmog.fonteSlot = ["arma","elmo","armadura","anel"].includes(out.transmog.fonteSlot) ? out.transmog.fonteSlot : "arma";
    // O autosell do site roda fora da extensão e não conhece a reserva da
    // forja: no modo automático ele venderia o material antes de virar item.
    if (out.auto) out.lote.ligado = false;
    return out;
  }

  /* -------------------- importação das versões antigas -------------------- */

  // v1.3 guardava tudo em "rsaf_state_v1" com nomes autoXxx.
  function migrarV1(velho) {
    const out = structuredCloneSafe(DEFAULT_SETTINGS);
    const mapa = { str: "forca", vit: "vitalidade", def: "defesa", agi: "agilidade", luk: "sorte" };
    out.equip = velho.autoEquip !== false;
    out.forge.ligado = false; // destrutiva: sempre volta desligada
    out.forge.minLevel = num(velho.forgeMinLevel, 0);
    out.forge.maxLevel = num(velho.forgeMaxLevel, 9999);
    out.stats.ligado = velho.autoStats !== false;
    if (Array.isArray(velho.statFocus) && velho.statFocus.length) {
      for (const k of Object.keys(out.stats.sel)) out.stats.sel[k] = false;
      for (const k of velho.statFocus) if (mapa[k]) out.stats.sel[mapa[k]] = true;
    }
    out.gems.ligado = velho.autoGems !== false;
    out.socket.ligado = velho.autoSocket === true;
    out.sell.ligado = velho.autoSellItem === true;
    out.sell.rarity = num(velho.sellItemRarity, 2);
    out.sell.level = num(velho.sellItemLevel, 40);
    out.lote.ligado = velho.autoSell === true;
    out.lote.rarity = num(velho.sellItemRarity, 2);
    out.lote.level = num(velho.sellItemLevel, 40);
    out.organize = velho.autoOrganize !== false;
    out.goldReserve = num(velho.goldReserve, 50000);
    out.theme = normalizarTema(velho.theme);
    out.font = num(velho.font, 12);
    if (["zone", "players", "balanced"].includes(velho.strategy)) out.strategy = velho.strategy;
    out.minPlayers = num(velho.minPlayers, 3);
    out.chatOnly = velho.chatOnly !== false;
    out.muteTab = velho.muteTab !== false;
    return out;
  }

  // Extensão "Rift Auto" (a base): chaves separadas forjaAuto/upAuto/gemasAuto.
  function migrarRiftAuto(r) {
    const out = structuredCloneSafe(DEFAULT_SETTINGS);
    const f = r.forjaAuto || {};
    const u = r.upAuto || {};
    const g = r.gemasAuto || {};
    const e = r.equiparAuto || {};
    const ro = r.roletaRapida || {};
    out.equip = e.ligado === true;
    out.forge.ligado = f.ligado === true;
    Object.assign(out.forge.raridades, f.forjas || {});
    Object.assign(out.forge.tipos, f.tipos || {});
    out.stats.ligado = u.ligado === true;
    out.stats.modo = u.modo === "nivel" ? "nivel" : "igual";
    let marcado = false;
    for (const k of Object.keys(out.stats.sel)) {
      if (u.sel && u.sel[k]) { out.stats.sel[k] = true; marcado = true; }
      else out.stats.sel[k] = false;
    }
    if (!marcado) for (const k of Object.keys(out.stats.sel)) out.stats.sel[k] = true;
    out.stats.metas = u.metas || {};
    out.gems.ligado = g.ligado === true;
    out.gems.juntar = g.juntar !== false;
    out.gems.suprema = g.suprema === true;
    out.roleta.ligada = ro.ligada === true;
    out.roleta.vel = num(ro.vel, 4);
    out.goldReserve = num(u.guardar, 50000);
    return out;
  }

  async function importarLegado() {
    if (!store) return null;
    let r;
    try {
      r = await store.get([
        KEY, "rsaf_state_v1", "forjaAuto", "upAuto", "gemasAuto", "equiparAuto",
        "roletaRapida", "forjaTotal", "forjaPerdidos", "equipTotal", "gemTotais",
        "upGasto", "upNiveis"
      ]);
    } catch {
      return null;
    }
    // Já está no formato novo: não mexe.
    if (r[KEY]?.settings?.forge) return null;

    let settings = null;
    if (r["rsaf_state_v1"]?.settings?.autoForge !== undefined) {
      settings = migrarV1(r["rsaf_state_v1"].settings);
    } else if (r.forjaAuto || r.upAuto || r.gemasAuto || r.equiparAuto || r.roletaRapida) {
      settings = migrarRiftAuto(r);
    }
    if (!settings) return null;

    const cfgNovo = { running: false, settings };
    const statsNovo = {
      forjaTotal: num(r.forjaTotal, 0),
      forjaPerdidos: num(r.forjaPerdidos, 0),
      equipTotal: num(r.equipTotal, 0),
      gemTotais: { juntadas: 0, supremas: 0, perdidas: 0, ...(r.gemTotais || {}) },
      upGasto: r.upGasto || {},
      upNiveis: r.upNiveis || {}
    };
    try {
      await store.set({ [KEY]: cfgNovo, [STATS_KEY]: statsNovo });
    } catch { /* ignore */ }
    return { cfg: cfgNovo, stats: statsNovo };
  }

  const s = () => cfg.settings;
  const moduloLigado = () => {
    const x = s();
    return x.equip || x.forge.ligado || x.stats.ligado || x.gems.ligado ||
      x.socket.ligado || x.enhance.ligado || x.sell.ligado || x.lote.ligado ||
      x.alchemy?.ligado || x.transmog?.ligado || x.organize;
  };

  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

  // Reserva de ouro. Build high: o ouro é ferramenta de progressão, não
  // patrimônio parado. No automático a reserva é zero — a forja e os atributos
  // já param sozinhos quando o custo passa do saldo disponível.
  function reserva(ch) {
    if (s().auto) return 0;
    return Math.max(0, num(s().goldReserve, 0));
  }
  const nivelRaridade = (item) => (item.rarity === 5 ? 3 : num(item.rarity, 0));
  const destinoDe = (r) => (r === 4 ? 6 : r + 1);
  const precisaDe = (destino) => (destino >= 3 ? 4 : 3);
  const pausado = (chave) => (pausados.get(chave) || 0) > Date.now();

  /* ------------------------------- storage -------------------------------- */

  let statusTimer = null;
  function agendarStatus() {
    if (!store || statusTimer) return;
    statusTimer = setTimeout(() => {
      statusTimer = null;
      status.updatedAt = Date.now();
      store.set({ [STATUS_KEY]: status }).catch(() => {});
    }, 700);
  }

  function setStatus(campo, texto) {
    if (status[campo] === texto) return;
    status[campo] = texto;
    agendarStatus();
  }

  function salvarStats(parcial) {
    Object.assign(stats, parcial);
    if (store) store.set({ [STATS_KEY]: stats }).catch(() => {});
  }

  function resumoPersonagem(ch) {
    return ch ? {
      name: ch.name || ch.displayName || "",
      cls: ch.cls || "",
      level: num(ch.level, 0),
      power: num(ch.power, 0),
      gold: num(ch.gold, 0),
      items: Array.isArray(ch.items) ? ch.items.length : 0,
      capacity: num(ch.capacity, 50),
      gems: Array.isArray(ch.gems) ? ch.gems.reduce((a, g) => a + num(g.count, 0), 0) : 0,
      statLevels: ch.statLevels || null,
      at: Date.now()
    } : null;
  }

  /* --------------------------------- API ---------------------------------- */

  // O jogo troca o endereço do servidor de vez em quando: ele é lido do próprio código do jogo.
  let API = "https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com";
  let ultimaBusca = 0;

  async function descobrirApi() {
    if (Date.now() - ultimaBusca < 60000) return;
    ultimaBusca = Date.now();
    try {
      const src = [...document.scripts].map((x) => x.src).find((x) => x && x.startsWith(location.origin));
      if (!src) return;
      const codigo = await (await fetch(src)).text();
      const achado = codigo.match(/"(https:\/\/[^"]+)"\.replace\(\/\\\/\$\//)?.[1]
        || codigo.match(/https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com/)?.[0];
      if (achado) API = achado.replace(/\/$/, "");
    } catch (e) {
      console.warn("[Rift Auto] endereço do servidor", e);
    }
  }

  // corpo omitido = GET; null = POST sem corpo; objeto = POST com JSON.
  async function api(caminho, corpo, metodoForcado) {
    try {
      const dados = await apiInterno(caminho, corpo, metodoForcado);
      falhasSeguidas = 0;
      esperaAte = 0;
      return dados;
    } catch (e) {
      contarFalha(e);
      throw e;
    }
  }

  // Servidor fora do ar, 429 ou prazo estourado: espera um pouco mais a cada
  // falha, em vez de continuar martelando a API a cada 3 segundos.
  let esperaAte = 0;
  let falhasSeguidas = 0;
  function contarFalha(e) {
    const codigo = e && e.codigo;
    if (codigo && typeof codigo === "number" && codigo >= 400 && codigo < 500 && codigo !== 429) return;
    falhasSeguidas = Math.min(7, falhasSeguidas + 1);
    esperaAte = Date.now() + Math.min(120000, 3000 * 2 ** falhasSeguidas);
    if (falhasSeguidas >= 2) {
      setStatus("lastAction", `Servidor sem responder; tento de novo em ${Math.round((esperaAte - Date.now()) / 1000)}s`);
    }
  }

  async function apiInterno(caminho, corpo, metodoForcado) {
    const token = localStorage.getItem("og.token");
    if (!token) throw new Error("sem sessão");
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (corpo) headers["Content-Type"] = "application/json";
    const metodo = metodoForcado || (corpo === undefined ? "GET" : "POST");
    // Prazo em cada pedido: uma resposta que nunca chega não pode congelar a
    // rodada (e, com ela, o motor inteiro).
    const pedir = async () => {
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const alarme = ctl ? setTimeout(() => ctl.abort(), TEMPO_MAX_PEDIDO) : null;
      try {
        return await fetch(API + caminho, {
          method: metodo,
          headers,
          body: corpo ? JSON.stringify(corpo) : undefined,
          signal: ctl ? ctl.signal : undefined
        });
      } finally {
        if (alarme) clearTimeout(alarme);
      }
    };
    let r;
    try {
      r = await pedir();
    } catch (e) {
      // Servidor fora do ar ou endereço trocado: procura o novo e tenta mais uma vez.
      const antigo = API;
      ultimaBusca = 0;
      await descobrirApi();
      if (API === antigo) throw e;
      r = await pedir();
    }
    if (r.status === 401) {
      const antigo = API;
      ultimaBusca = 0;
      await descobrirApi();
      if (API !== antigo) r = await pedir();
    }
    if (!r.ok) {
      const erro = new Error(`api ${r.status}`);
      erro.codigo = r.status;
      throw erro;
    }
    return r.status === 204 ? {} : r.json();
  }

  const pausados = new Map();
  const comparacoes = new Map();
  const ganhos = new Map();
  let ultimosEquipados = "";
  let vendasNaRodada = 0;
  let niveisSalvos = "";
  let avisoForja = "";
  let avisoForjaAte = 0;

  function bloquear(chave, texto, espera, campo) {
    pausados.set(chave, Date.now() + espera);
    if (campo === "forja") {
      // O aviso da forja precisa sobreviver até o fim da rodada; sem isso ele
      // seria sobrescrito por "Aguardando itens suficientes".
      avisoForja = texto;
      avisoForjaAte = Date.now() + espera;
    }
    if (texto) setStatus(campo || chave, texto);
  }

  // Quando o equipamento muda, todas as comparações antigas deixam de valer.
  function verEquipados(ch) {
    const equipados = (ch.items || []).filter((i) => i.equipped).map((i) => i.id).sort().join();
    if (equipados === ultimosEquipados) return;
    comparacoes.clear();
    ganhos.clear();
    ultimosEquipados = equipados;
  }

  /* -------------------------------- equipar ------------------------------- */

  // Compara cada item com o equipado do mesmo tipo (Força de Combate real) e
  // equipa o que mais aumenta a força. Mesma conta da tela de detalhes do jogo.
  async function equiparUm(ch) {
    verEquipados(ch);
    const candidatos = (ch.items || []).filter((i) =>
      !i.equipped && TIPOS[i.slot] && (!i.classReq || i.classReq === ch.cls)
    );
    let melhor = null;
    for (const item of candidatos) {
      if (!ganhos.has(item.id)) {
        try {
          const c = await api(`/api/me/items/${item.id}/compare`);
          ganhos.set(item.id, num(c.newPower) - num(c.power));
        } catch (e) {
          if (e.codigo >= 400 && e.codigo < 500) ganhos.set(item.id, -Infinity);
          else throw e;
        }
      }
      const ganho = ganhos.get(item.id);
      if (ganho > 0 && (!melhor || ganho > melhor.ganho)) melhor = { item, ganho };
    }
    if (!melhor) {
      setStatus("equip", "Nenhum item melhor que o equipado");
      return false;
    }
    const { item, ganho } = melhor;
    const texto = `${item.name} (nv ${item.level ?? item.itemLevel}, +${Math.round(ganho).toLocaleString("pt-BR")} FC)`;
    if (SIMULAR) {
      window.__plano?.push(`equipar ${texto}`);
      ganhos.set(item.id, -Infinity);
      return true;
    }
    try {
      await api(`/api/me/items/${item.id}/equip`, null);
      salvarStats({ equipTotal: num(stats.equipTotal) + 1 });
      setStatus("equip", `Equipou ${texto}`);
      status.lastAction = `Equipou ${item.name}`;
      return true;
    } catch (e) {
      console.warn("[Equipar]", e);
      ganhos.set(item.id, -Infinity);
      setStatus("equip", `O jogo não deixou equipar ${item.name}`);
      return false;
    }
  }

  /* --------------------------------- forja -------------------------------- */

  // Regra do jogo: equipamento de qualquer raridade abaixo de Arcano pode ser
  // forjado. Equipados, favoritos e com gemas ficam de fora. Lendário vira
  // Imortal (4 itens) e Imortal vira Arcano (4 itens), ambos com roleta.
  const podeForjar = (i) => !i.equipped && !i.favorite && TIPOS[i.slot] &&
    !i.gems?.length && nivelRaridade(i) <= 6;

  // Usa a mesma comparação da tela de detalhes do jogo (Força de Combate com o item equipado).
  async function ehMelhor(item, cls) {
    if (item.classReq && item.classReq !== cls) return false;
    if (!comparacoes.has(item.id)) {
      try {
        const c = await api(`/api/me/items/${item.id}/compare?simGems=true`);
        comparacoes.set(item.id, num(c.newPower) > num(c.power));
      } catch (e) {
        // Item que o servidor não reconhece mais não pode ser forjado.
        if (e.codigo >= 400 && e.codigo < 500) comparacoes.set(item.id, false);
        else throw e;
      }
    }
    return comparacoes.get(item.id);
  }

  // Faixa de nível do resultado, igual ao bundle (`cH`): média ×1,15 até
  // média ×1,3, com piso de 100/130 quando o destino é Imortal/Arcano.
  function resultadoFaixa(itens, destino) {
    const nivel = itens.map((i) => num(i.itemLevel, 0));
    const media = nivel.reduce((a, b) => a + b, 0) / Math.max(1, nivel.length);
    let lo = Math.floor(media * 1.15);
    let hi = Math.floor(media * 1.3);
    const piso = num(PISO_RESULTADO[destino], 0);
    if (piso > 0) {
      lo = Math.max(lo, piso);
      hi = Math.max(hi, piso);
    }
    lo = Math.max(1, lo);
    return [lo, Math.max(lo, hi)];
  }

  // Custo exato do bundle (`iH`): nível do meio da faixa, fator da raridade de
  // destino e ×2. A versão antiga somava 15% de folga e pausava forjas que o
  // ouro cobria.
  function estimarCusto(itens, destino) {
    const [lo, hi] = resultadoFaixa(itens, destino);
    const meio = Math.floor((lo + hi) / 2);
    return Math.round((5 + meio * 2) * (FORGE_COST_FACTOR[destino] ?? 1) * 2);
  }

  const pct = (v) => `${Math.round(num(v, 0) * 100)}%`;

  // Item que a forja pode usar de verdade: além de ser forjável, precisa da
  // raridade e do tipo marcados no painel. A checagem vem antes da faixa de
  // nível para uma raridade desligada (Imortal, por exemplo) não "puxar" a
  // janela automática e esconder os grupos que o jogador quer forjar.
  function forjavelNasConfig(i) {
    if (!podeForjar(i) || recemCriadosAlq.has(i.id)) return false;
    const f = s().forge;
    const r = nivelRaridade(i);
    // `arcano` libera Imortal mesmo com o chip desligado: sem essa fusão o set
    // arcano é inalcançável (Arcano não pode ser forjado de novo).
    const permitida = f.raridades[RARIDADES[r]] || (f.arcano && r === 6);
    return !!(permitida && f.tipos[TIPOS[i.slot]]);
  }

  function agruparPorRaridadeSlot(itens) {
    const grupos = new Map();
    for (const i of itens) {
      const chave = `${nivelRaridade(i)}|${i.slot}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(i);
    }
    return grupos;
  }

  // A forja do site não separa por nível: o grupo é raridade + tipo, e o
  // resultado sai com o nível médio dos itens usados (bundle: chave
  // `${raridade}|${slot}`, precisa de 3 ou 4). Agrupar por faixa de 40 níveis,
  // como era até a 3.1.0, escondia grupos que o próprio jogo mostra como
  // prontos ("Forja 2") — a mochila enchia e nada era forjado.
  function gruposForja(ch) {
    const grupos = [];
    for (const [chave, itens] of agruparPorRaridadeSlot(itensForjaveis(ch))) {
      const r = nivelRaridade(itens[0]);
      const precisa = precisaDe(destinoDe(r));
      if (itens.length < precisa) continue;
      // Do mais alto para o mais baixo: o nível do resultado acompanha a média.
      const ordenados = [...itens].sort((a, b) => num(b.itemLevel, 0) - num(a.itemLevel, 0));
      // O jogo mostra no badge da aba Forja o número de fusões possíveis, não o
      // número de raridade/tipo: 8 raros viram 2 grupos de 4. Repetir aqui é o
      // que faz o painel dizer "2 forja(s)" igual ao site.
      for (let k = 0; k + precisa <= ordenados.length; k += precisa) {
        grupos.push({ chave, r, slot: itens[0].slot, itens: ordenados.slice(k, k + precisa), precisa });
      }
    }
    return grupos.sort((a, b) => {
      // O gelo da roleta é por raridade+slot no servidor. Concentrar as
      // tentativas de Lendário+/Imortal no mesmo slot acumula o bônus de
      // falha até +10% muito mais rápido do que espalhar entre quatro slots.
      if (a.r >= 4 && b.r >= 4 && a.slot !== b.slot) {
        return String(a.slot).localeCompare(String(b.slot));
      }
      return a.r - b.r || num(a.itens[0].itemLevel, 0) - num(b.itens[0].itemLevel, 0);
    });
  }

  // Mochila perto do limite: libera as sobras (grupos incompletos) para a
  // alquimia e a venda. Sem isso, um item de cada raridade/tipo fica eternamente
  // reservado esperando um grupo que pode nunca fechar, e a mochila enche.
  const MOCHILA_LIMITE = 0.85;
  function capacidadeMochila(ch) {
    return Math.max(1, num(ch?.capacity, 50));
  }
  function mochilaEmPressao(ch) {
    const total = (ch?.items || []).length;
    return total >= Math.ceil(capacidadeMochila(ch) * MOCHILA_LIMITE);
  }

  // Reserva o que a forja usa agora: os grupos completos da vez. Com a mochila
  // folgada, os grupos incompletos também ficam presos para não perder o
  // progresso entre drops; com a mochila cheia, só os completos ficam, e as
  // sobras viram fragmento.
  function idsDaForja(ch) {
    const ids = new Set();
    if (!s().forge.ligado) return ids;
    const pressao = mochilaEmPressao(ch);
    for (const itens of agruparPorRaridadeSlot(itensForjaveis(ch)).values()) {
      const precisa = precisaDe(destinoDe(nivelRaridade(itens[0])));
      const ordenados = [...itens].sort((a, b) => num(b.itemLevel, 0) - num(a.itemLevel, 0));
      if (itens.length < precisa) {
        if (pressao) continue;
        for (const i of ordenados.slice(0, precisa)) ids.add(i.id);
        continue;
      }
      const fatias = Math.floor(ordenados.length / precisa);
      for (const i of ordenados.slice(0, fatias * precisa)) ids.add(i.id);
    }
    return ids;
  }

  // Itens que a forja aceita agora. No manual, vale a faixa de nível digitada;
  // no automático, todo item forjável entra (regra do site).
  function itensForjaveis(ch) {
    const f = s().forge;
    const minLv = num(f.minLevel, 0);
    const maxLv = num(f.maxLevel, 9999);
    const itens = [];
    for (const i of ch.items || []) {
      if (!forjavelNasConfig(i)) continue;
      if (!f.auto) {
        const lv = num(i.itemLevel, 0);
        if (lv < minLv || lv > maxLv) continue;
      }
      itens.push(i);
    }
    return itens;
  }

  function contarGruposForja(ch) {
    if (!s().forge.ligado) return 0;
    return gruposForja(ch).length;
  }

  /* ------------------------------- roleta --------------------------------- */

  // Chances reais: `/api/wiki` publica `fuseEpicChance` (alvo Lendário),
  // `fuseImmortalChance` e `fuseArcaneChance` (padrão 0,25 no bundle). O
  // servidor também devolve `chance` em cada fusão — o valor aprendido fica no
  // storage e vale quando a wiki não responde.
  const ROLETA_TTL = 10 * 60 * 1000;
  const roleta = {
    at: 0,
    chances: {},
    step: 0.02,
    bonusPergaminho: 0.1,
    gelo: new Map()
  };

  function chanceBase(destino) {
    const wiki = num(roleta.chances[destino], NaN);
    if (Number.isFinite(wiki) && wiki >= 0) return Math.min(1, wiki);
    const aprendida = num(stats.chances?.[destino], NaN);
    if (Number.isFinite(aprendida) && aprendida >= 0) return Math.min(1, aprendida);
    return num(CHANCE_PADRAO[destino], 0.25);
  }

  function geloDe(destino, slot) {
    return num(roleta.gelo.get(`${destino}|${slot}`), 0);
  }

  // Chance da tentativa = base + passo por falha seguida (até 5) + pergaminho.
  function chanceDeForja(destino, slot, bonus = 0) {
    if (destino < ROLETA_MIN) return 1;
    const gelo = Math.min(GELO_MAX, geloDe(destino, slot)) * num(roleta.step, 0.02);
    return Math.min(1, chanceBase(destino) + gelo + Math.max(0, num(bonus, 0)));
  }

  async function carregarRoleta(force = false) {
    const agora = Date.now();
    if (!force && agora - num(roleta.at, 0) < ROLETA_TTL) return roleta;

    try {
      const w = await api("/api/wiki");
      const pares = {
        4: w?.fuseEpicChance,
        6: w?.fuseImmortalChance,
        7: w?.fuseArcaneChance
      };
      for (const [destino, valor] of Object.entries(pares)) {
        const n = num(valor, NaN);
        if (Number.isFinite(n)) roleta.chances[destino] = Math.max(0, Math.min(1, n));
      }
      const bonus = num(w?.luckScrollBonus, NaN);
      if (Number.isFinite(bonus) && bonus > 0) roleta.bonusPergaminho = bonus;
    } catch { /* sem wiki: vale a chance aprendida */ }

    try {
      const s = await api("/api/me/items/fuse-streaks");
      const passo = num(s?.step, NaN);
      if (Number.isFinite(passo) && passo > 0) roleta.step = passo;
      roleta.gelo.clear();
      for (const it of s?.items || []) {
        roleta.gelo.set(`${num(it.target)}|${it.slot}`, num(it.fails, 0));
      }
    } catch { /* sem gelo: chance base */ }

    // Só marca o cache como válido depois que as leituras terminam. Marcar
    // antes (como era) envenenava o cache por 10 min quando a wiki falhava.
    roleta.at = agora;
    return roleta;
  }

  /* ---------------------------- pergaminhos ------------------------------- */

  // O jogo tem três pergaminhos e cada um serve numa faixa: o geral
  // (`luckscroll`), o Grande (`bigscroll`, Imortal+) e o Supremo
  // (`arcanescroll`, só Arcano). Escolher o maior bônus disponível é o caminho
  // mais barato para a roleta passar.
  const SCROLL_KINDS = {
    luckscroll: { destinos: [4, 5, 6, 7], bonus: 0.1 },
    bigscroll: { destinos: [6, 7], bonus: 0.25 },
    arcanescroll: { destinos: [7], bonus: 0.5 }
  };

  function estoqueDe(i) {
    return num(i?.count ?? i?.quantity ?? i?.amount, 1);
  }

  function pergaminhoCompativel(i, destino) {
    if (!i || i.slot !== "consumable" || i.equipped || i.favorite) return false;
    if (estoqueDe(i) <= 0) return false;
    const kind = String(i.kind || "").toLowerCase();
    const regra = SCROLL_KINDS[kind];
    if (regra) return regra.destinos.includes(destino);
    const nome = String(i.name || "").toLowerCase();
    if (!nome.includes("pergaminho") && !nome.includes("scroll")) return false;
    // Item antigo sem `kind`: só dá para arriscar nas roletas baixas.
    return destino <= 5;
  }

  function bonusDoPergaminho(i) {
    const doItem = num(i?.bonus, NaN);
    if (Number.isFinite(doItem) && doItem > 0) return doItem;
    const regra = SCROLL_KINDS[String(i?.kind || "").toLowerCase()];
    if (regra) return regra.bonus;
    return num(roleta.bonusPergaminho, 0.1);
  }

  function melhorPergaminho(ch, destino, usados) {
    let melhor = null;
    for (const i of ch.items || []) {
      if (usados?.has(i.id)) continue;
      if (!pergaminhoCompativel(i, destino)) continue;
      const bonus = bonusDoPergaminho(i);
      if (!melhor || bonus > melhor.bonus) melhor = { item: i, bonus };
    }
    return melhor;
  }

  /* ----------------------------- meta arcano ------------------------------ */

  const SLOTS_EQUIP = ["weapon", "helmet", "armor", "ring"];

  // Progresso do set arcano: por tipo, o que está equipado, quantos Imortais
  // forjáveis existem e quantas tentativas de Arcano isso rende.
  function metaArcano(ch) {
    const itens = ch?.items || [];
    const slots = {};
    let prontos = 0;
    let tentativas = 0;
    for (const slot of SLOTS_EQUIP) {
      const doSlot = itens.filter((i) => i.slot === slot);
      const equipado = doSlot.find((i) => i.equipped);
      const equipadoR = equipado ? nivelRaridade(equipado) : -1;
      const arcano = equipadoR === 7;
      if (arcano) prontos += 1;
      const imortais = doSlot.filter((i) => nivelRaridade(i) === 6 && podeForjar(i)).length;
      const grupos = Math.floor(imortais / precisaDe(7));
      tentativas += grupos;
      slots[slot] = { equipado: equipadoR, arcano, imortais, tentativas: grupos };
    }
    return { slots, prontos, total: SLOTS_EQUIP.length, tentativas };
  }

  // Até 3 grupos por rodada: a forja não fica esperando o próximo ciclo para
  // cada item, mas também não dispara o inventário inteiro de uma vez.
  const MAX_FORJAS = 3;

  // A forja de Lendário+ é decidida por roleta no servidor. O painel escuta este
  // evento para mostrar a animação (a tela do jogo não é atualizada quando a
  // extensão chama a API direto).
  function avisarForja(detalhe) {
    try {
      document.dispatchEvent(new CustomEvent("rsaf:forja", { detail: detalhe }));
    } catch { /* painel fechado ou evento indisponível */ }
  }

  async function forjarUm(ch) {
    verEquipados(ch);
    const grupos = gruposForja(ch).filter((g) => !pausado(g.chave));
    if (!grupos.length) {
      setStatus("forja", Date.now() < avisoForjaAte ? avisoForja : "Aguardando itens suficientes");
      return false;
    }

    const f = s().forge;
    const estrategia = ESTRATEGIAS.includes(f.estrategia) ? f.estrategia : "bruto";
    const chanceMinima = Math.max(0, Math.min(100, num(f.chanceMinima, 0))) / 100;
    // Um pergaminho consumido numa fusão não pode ser reusado nas próximas
    // fusões da mesma passada: o snapshot `ch` ainda o mostra no inventário.
    const scrollsUsados = new Set();
    // Wiki e gelo só são lidos quando existe roleta para rodar.
    if (grupos.some((g) => destinoDe(g.r) >= ROLETA_MIN)) await carregarRoleta();

    let forjou = 0;
    let livre = num(ch.gold) - reserva(ch);
    for (const g of grupos) {
      if (forjou >= MAX_FORJAS) break;
      const destino = destinoDe(g.r);
      const precisa = precisaDe(destino);

      let liberados = [];
      try {
        for (const item of g.itens) {
          if (!(await ehMelhor(item, ch.cls))) liberados.push(item);
        }
      } catch (e) {
        console.warn("[Forja]", e);
        bloquear(g.chave, "Não consegui comparar com o equipado: grupo não forjado", ESPERA_PROTEGIDO, "forja");
        continue;
      }
      if (liberados.length < precisa) {
        bloquear(g.chave, "Itens melhores que o equipado protegidos", ESPERA_PROTEGIDO, "forja");
        continue;
      }

      // Os mais fortes do grupo: o nível do resultado acompanha a média. Os
      // grupos vêm do mais fraco para o mais forte, então as primeiras roletas
      // (mais baratas de perder) gastam o material pior e o melhor fica para
      // quando o gelo já subiu a chance.
      const usa = liberados.sort((a, b) => num(b.itemLevel) - num(a.itemLevel)).slice(0, precisa);
      const [lo, hi] = resultadoFaixa(usa, destino);
      const custo = estimarCusto(usa, destino);
      const rotulo = `${RARIDADES[g.r]} ${TIPOS[g.slot]} nv ${usa.map((i) => i.itemLevel).join("/")}`;

      // Pergaminho certo para o destino. Se a chance já está em 100% sem ele,
      // guarda o pergaminho para a próxima tentativa.
      let pergaminho = null;
      let chance = chanceDeForja(destino, g.slot, 0);
      if (f.useScroll && destino >= ROLETA_MIN && chance < 1) {
        const achado = melhorPergaminho(ch, destino, scrollsUsados);
        if (achado) {
          pergaminho = achado;
          chance = chanceDeForja(destino, g.slot, achado.bonus);
        }
      }

      if (destino >= ROLETA_MIN && estrategia !== "bruto" && chance < chanceMinima) {
        const gelo = Math.min(GELO_MAX, geloDe(destino, g.slot));
        const teto = chanceBase(destino) + GELO_MAX * num(roleta.step, 0.02) +
          (pergaminho ? pergaminho.bonus : 0);
        const aviso = teto >= chanceMinima
          ? `Roleta ${pct(chance)}: espero o gelo subir (nível ${gelo}/5) até ${pct(chanceMinima)}`
          : `Roleta ${pct(chance)}: no máximo chega a ${pct(Math.min(1, teto))} — baixe o mínimo ou use um pergaminho`;
        bloquear(g.chave, aviso, 60000, "forja");
        continue;
      }
      if (estrategia === "conservador" && destino >= ROLETA_MIN && !pergaminho) {
        bloquear(g.chave, `Roleta ${pct(chance)} sem pergaminho: não arrisco (conservador)`, 60000, "forja");
        continue;
      }

      if (custo > livre) {
        setStatus("forja", `Forja pausada: ~${custo.toLocaleString("pt-BR")}g por forja, ${Math.max(0, livre).toLocaleString("pt-BR")}g livre`);
        break;
      }

      const temRoleta = destino >= ROLETA_MIN;
      setStatus("forja", temRoleta
        ? `Roleta ${pct(chance)}${pergaminho ? ` + ${pergaminho.item.name}` : ""} — ${rotulo} ➜ nv ${lo}-${hi}`
        : `Forjando ${rotulo}...`);

      if (SIMULAR) {
        window.__plano?.push(`forja ${rotulo} ➜ nv ${lo}-${hi}${pergaminho ? " + pergaminho" : ""} (chance ${pct(chance)})`);
        pausados.set(g.chave, Infinity);
        return true;
      }

      if (temRoleta) {
        avisarForja({ tipo: "start", rotulo, destino, raridade: RARIDADES[destino], chance });
      }
      try {
        const res = await api("/api/me/items/fuse", {
          itemIds: usa.map((i) => i.id),
          scrollItemId: pergaminho ? pergaminho.item.id : null
        });
        // A chance devolvida pelo servidor é a verdade daquela tentativa.
        const devolvida = num(res?.chance, NaN);
        if (Number.isFinite(devolvida) && devolvida >= 0 && devolvida <= 1) {
          salvarStats({ chances: { ...(stats.chances || {}), [destino]: devolvida } });
        }
        const sucesso = res.success !== false;
        const itemNome = res.result?.name || "";
        if (temRoleta) {
          avisarForja({
            tipo: "fim", rotulo, destino, raridade: RARIDADES[destino],
            sucesso, item: itemNome,
            chance: Number.isFinite(devolvida) ? devolvida : chance
          });
        }
        if (!sucesso) {
          salvarStats({ forjaPerdidos: num(stats.forjaPerdidos) + 1 });
          setStatus("forja", `Roleta falhou (${pct(chance)}): ${rotulo} — ${precisa} itens perdidos`);
        } else {
          salvarStats({ forjaTotal: num(stats.forjaTotal) + 1 });
          setStatus("forja", `Forjado: ${itemNome || rotulo} (nv ${num(res.result?.itemLevel, lo)}-${hi})`);
          status.lastAction = `Forjou ${itemNome || rotulo}`;
        }
        if (pergaminho) scrollsUsados.add(pergaminho.item.id);
        livre -= custo;
        forjou += 1;
        // Gelo/fogo mudou: a próxima rodada precisa reler as sequências.
        roleta.at = 0;
        // Atualiza o gelo localmente para as próximas fusões desta mesma
        // passada: uma falha acrescenta um passo no slot, um sucesso zera.
        const chaveGelo = `${destino}|${g.slot}`;
        roleta.gelo.set(chaveGelo, sucesso ? 0 : Math.min(GELO_MAX, geloDe(destino, g.slot) + 1));
      } catch (e) {
        console.warn("[Forja]", e);
        if (temRoleta) {
          avisarForja({ tipo: "fim", rotulo, destino, raridade: RARIDADES[destino], sucesso: false, erro: e?.message || "falha na API" });
        }
        bloquear(g.chave, `Não forjou ${rotulo} (sem ouro ou recusado pelo jogo)`, ESPERA_FALHA, "forja");
        // Sem ouro ou pedido inválido: não adianta tentar os outros agora.
        if (e.codigo === 400 || e.codigo === 402 || e.codigo === 403) break;
      }
    }

    if (forjou > 0) return true;
    if (!(Date.now() < avisoForjaAte)) setStatus("forja", "Aguardando itens suficientes");
    return false;
  }

  /* ------------------------------- atributos ------------------------------ */

  function atributosDe(ch) {
    return Object.entries(ATRIBUTOS).map(([id, stat]) => ({
      id, stat, nome: NOMES[id],
      nivel: ch.statLevels?.[stat],
      custo: ch.statCosts?.[stat]
    })).filter((a) => Number.isFinite(num(a.nivel, NaN)) && Number.isFinite(num(a.custo, NaN)));
  }

  // ---------------------------- modo ótimo --------------------------------
  //
  // O jogo descreve cada ponto assim (texto do próprio bundle):
  //   Força  +1,5 de ataque e +1,5% do ataque total
  //   Vital. +10 de vida e +1,5% da vida total
  //   Defesa +0,8 de defesa e +1,5% da defesa total
  //   Agi.   +2% de velocidade de ataque
  //   Sorte  +0,4% de crítico (até o teto); acima de 60% vira dano crítico
  //
  // Como os bônus percentuais incidem sobre o total (itens inclusos), o valor de
  // cada ponto muda a cada compra. Em vez de dividir o ouro no chute, o modo
  // ótimo mede a variação de dano e de vida efetiva de cada atributo e compra o
  // que entrega mais por ouro.
  function combateDe(ch) {
    const st = ch?.stats || {};
    const cls = String(ch?.class || ch?.cls || "warrior").toLowerCase();
    const base = CLASSE_BASE[cls] || CLASSE_BASE.warrior;
    const nivel = Math.max(1, num(ch?.level, 1));
    const r = nivel - 1;
    const nv = ch?.statLevels || {};
    const forca = num(nv.str, 0);
    const vit = num(nv.vit, 0);
    const def = num(nv.def, 0);
    const agi = num(nv.agi, 0);
    const luk = num(nv.luk, 0);
    const aspdBase = base.aspd;
    return {
      atk: num(st.atk, base.atk + base.atkN * r + forca * 1.5),
      maxHp: num(st.maxHp, base.hp + base.hpN * r + vit * 10),
      def: num(st.def, base.def + base.defN * r + def * 0.8),
      aspd: num(st.aspd, aspdBase * (1 + agi * 0.02)),
      // A ficha do jogo mostra crítico em %. O dano crítico vem em fração
      // (0,03 = +3%), do mesmo jeito que o bundle soma em 1,75.
      crit: num(st.crit, Math.min(60, 5 + luk * 0.4)),
      critDmg: num(st.critDmg, 0)
    };
  }

  function utilidade(c, foco) {
    const pesos = FOCO_PESOS[foco] || FOCO_PESOS.equilibrado;
    const aspd = c.aspd <= ASPD_UTIL ? c.aspd : ASPD_UTIL + (c.aspd - ASPD_UTIL) * 0.5;
    const crit = Math.min(60, Math.max(0, c.crit)) / 100;
    const critMult = 1 + crit * (CRIT_BASE_MULT - 1 + Math.max(0, c.critDmg));
    const dps = Math.max(1e-6, c.atk * aspd * critMult);
    const ehp = Math.max(1e-6, c.maxHp * (100 + DEF_K * Math.max(0, c.def)) / 100);
    return Math.pow(dps, pesos[0]) * Math.pow(ehp, pesos[1]);
  }

  function comUmPonto(c, id) {
    const n = { ...c };
    if (id === "forca") n.atk = c.atk + 1.5 + 0.015 * c.atk;
    else if (id === "vitalidade") n.maxHp = c.maxHp + 10 + 0.015 * c.maxHp;
    else if (id === "defesa") n.def = c.def + 0.8 + 0.015 * c.def;
    else if (id === "agilidade") n.aspd = c.aspd * 1.02;
    else if (id === "sorte") {
      if (c.crit < 60) n.crit = Math.min(60, c.crit + 0.4);
      else n.critDmg = c.critDmg + 0.03;
    }
    return n;
  }

  // Devolve o atributo com maior ganho por ouro. `null` quando nada vale a pena.
  function melhorAtributo(ch, foco) {
    const combate = combateDe(ch);
    const base = utilidade(combate, foco);
    const luk = num(ch?.statLevels?.luk, 0);
    const lukCap = num(ch?.lukCap, 100);
    let melhor = null;
    for (const a of atributosDe(ch)) {
      if (pausado(a.id)) continue;
      if (a.id === "sorte" && luk >= lukCap) continue;
      const ganho = utilidade(comUmPonto(combate, a.id), foco) - base;
      if (!(ganho > 0) || !(a.custo > 0)) continue;
      const porOuro = ganho / a.custo;
      if (!melhor || porOuro > melhor.porOuro) melhor = { ...a, ganho, porOuro };
    }
    return melhor ? { ...melhor, combate } : null;
  }

  // Mantém os níveis reais no storage para o painel mostrar "nv X" mesmo antes
  // de qualquer compra (e corrige o valor otimista depois de upar).
  function salvarNiveis(ch) {
    const niveis = {};
    for (const a of atributosDe(ch)) niveis[a.id] = a.nivel;
    const texto = JSON.stringify(niveis);
    if (texto === niveisSalvos) return;
    niveisSalvos = texto;
    salvarStats({ upNiveis: niveis });
  }

  async function comprar(a, quantidade) {
    if (SIMULAR) {
      window.__plano?.push(`upar ${a.nome} +${quantidade} (nv ${a.nivel}, custa ${a.custo})`);
      pausados.set(a.id, Infinity);
      return true;
    }
    try {
      await api(`/api/me/character/stats/${a.stat}`, { amount: quantidade });
      return true;
    } catch (e) {
      console.warn("[Upar]", e);
      pausados.set(a.id, Date.now() + ESPERA_FALHA);
      setStatus("up", `${a.nome} não subiu: tento de novo em 1 minuto`);
      return false;
    }
  }

  async function uparUm(ch) {
    const u = s().stats;
    const livre = num(ch.gold) - reserva(ch);
    const atributos = atributosDe(ch).filter((a) => !pausado(a.id));

    if (u.modo === "otimo") {
      const alvo = melhorAtributo(ch, u.foco);
      if (!alvo) {
        setStatus("up", "Ótimo: nenhum ponto rende ganho agora");
        return false;
      }
      if (livre < alvo.custo) {
        setStatus("up", `Juntando ouro para ${alvo.nome} (${alvo.custo.toLocaleString("pt-BR")})`);
        return false;
      }
      if (SIMULAR) {
        window.__plano?.push(
          `ótimo: ${alvo.nome} +1 (nv ${alvo.nivel}, custa ${alvo.custo}, ` +
          `dano ${Math.round(num(alvo.combate.atk) * 10) / 10}, vida ${Math.round(num(alvo.combate.maxHp))})`
        );
      }
      if (!(await comprar(alvo, 1))) return false;
      stats.upGasto[alvo.id] = (stats.upGasto[alvo.id] || 0) + alvo.custo;
      stats.upNiveis[alvo.id] = alvo.nivel + 1;
      salvarStats({ upGasto: { ...stats.upGasto }, upNiveis: { ...stats.upNiveis } });
      setStatus("up", `Ótimo: ${alvo.nome} para o nível ${alvo.nivel + 1}`);
      status.lastAction = `${alvo.nome} nv ${alvo.nivel + 1} (ótimo)`;
      return true;
    }

    if (u.modo === "igual") {
      const opcoes = atributos.filter((a) => u.sel[a.id]);
      if (!opcoes.length) {
        setStatus("up", "Marque ao menos um atributo");
        return false;
      }
      // Vai sempre no que recebeu menos ouro até agora; se empatar, no mais barato.
      opcoes.sort((a, b) => (stats.upGasto[a.id] || 0) - (stats.upGasto[b.id] || 0) || a.custo - b.custo);
      const a = opcoes[0];
      if (livre < a.custo) {
        setStatus("up", `Juntando ouro para ${a.nome} (${a.custo.toLocaleString("pt-BR")})`);
        return false;
      }
      if (!(await comprar(a, 1))) return false;
      stats.upGasto[a.id] = (stats.upGasto[a.id] || 0) + a.custo;
      stats.upNiveis[a.id] = a.nivel + 1;
      salvarStats({ upGasto: { ...stats.upGasto }, upNiveis: { ...stats.upNiveis } });
      setStatus("up", `${a.nome} subiu para o nível ${a.nivel + 1}`);
      status.lastAction = `${a.nome} nv ${a.nivel + 1}`;
      return true;
    }

    // "Até o nível": respeita as metas por atributo.
    const pendentes = atributos
      .filter((a) => num(u.metas[a.id], 0) > a.nivel)
      .sort((a, b) => a.custo - b.custo);
    if (!pendentes.length) {
      setStatus("up", "Metas concluídas");
      return false;
    }
    const a = pendentes[0];
    const meta = num(u.metas[a.id], 0);
    if (livre < a.custo) {
      setStatus("up", `Juntando ouro para ${a.nome} (${a.custo.toLocaleString("pt-BR")})`);
      return false;
    }
    const quantidade = reserva(ch) === 0 && meta - a.nivel >= 10 ? 10 : 1;
    if (!(await comprar(a, quantidade))) return false;
    setStatus("up", `${a.nome}: nível ${a.nivel + quantidade} de ${meta}`);
    stats.upNiveis[a.id] = a.nivel + quantidade;
    salvarStats({ upNiveis: { ...stats.upNiveis } });
    return true;
  }

  /* --------------------------------- gemas -------------------------------- */

  function somarGemas(chave, n) {
    stats.gemTotais = stats.gemTotais || { juntadas: 0, supremas: 0, perdidas: 0 };
    stats.gemTotais[chave] = (stats.gemTotais[chave] || 0) + n;
    salvarStats({ gemTotais: stats.gemTotais });
  }

  // Juntar 3 em 3 usa o "Upar todas as gemas" do próprio jogo; a Suprema junta
  // 4 Perfeitas numa roleta.
  async function gemasUm(ch) {
    const g = s().gems;
    const lista = ch.gems || [];

    if (g.juntar && !pausado("gemas-juntar") && lista.some((x) => num(x.tier, 1) < 4 && num(x.count) >= 3)) {
      const previa = await api("/api/me/gems/combine-all");
      if (num(previa.merges) > 0 && previa.canAfford) {
        if (SIMULAR) {
          window.__plano?.push(`juntar gemas: ${previa.merges} grupos por ${previa.cost}`);
          pausados.set("gemas-juntar", Infinity);
          return true;
        }
        try {
          await api("/api/me/gems/combine-all", null);
          somarGemas("juntadas", num(previa.merges));
          setStatus("gem", `Juntou ${plural(num(previa.merges), "grupo", "grupos")} de gemas`);
          return true;
        } catch (e) {
          console.warn("[Gemas]", e);
          pausados.set("gemas-juntar", Date.now() + ESPERA_FALHA);
          setStatus("gem", "O jogo recusou juntar as gemas: tento de novo em 1 minuto");
          return false;
        }
      }
      if (num(previa.merges) > 0) {
        setStatus("gem", `Juntando ouro para as gemas (${num(previa.cost).toLocaleString("pt-BR")})`);
        return false;
      }
    }

    if (g.suprema) {
      const livre = num(ch.gold) - reserva(ch);
      const alvo = lista.find((x) =>
        num(x.tier, 1) === 4 && num(x.count) >= 4 &&
        !pausado(`suprema-${x.type}`) && livre >= num(x.combineCost, 0)
      );
      if (alvo) {
        if (SIMULAR) {
          window.__plano?.push(`suprema ${alvo.name} (custa ${alvo.combineCost})`);
          pausados.set(`suprema-${alvo.type}`, Infinity);
          return true;
        }
        try {
          const res = await api("/api/me/gems/supreme", { type: alvo.type, scrollItemId: null });
          if (res.success === false) {
            somarGemas("perdidas", 1);
            setStatus("gem", `Suprema falhou: ${alvo.name}`);
          } else {
            somarGemas("supremas", 1);
            setStatus("gem", `Suprema feita: ${alvo.name}`);
          }
          return true;
        } catch (e) {
          console.warn("[Gemas]", e);
          pausados.set(`suprema-${alvo.type}`, Date.now() + ESPERA_FALHA);
          setStatus("gem", `Não fez a Suprema de ${alvo.name}: tento de novo em 1 minuto`);
          return false;
        }
      }
    }

    setStatus("gem", "Aguardando gemas suficientes");
    return false;
  }

  /* -------------------------------- engaste ------------------------------- */

  function escolherGema(lista, cls) {
    const prio = GEM_PRIO[cls] || GEM_TYPES;
    const disponiveis = (lista || [])
      .filter((g) => g && GEM_TYPES.includes(g.type) && num(g.count) > 0 && num(g.tier, 1) >= 1)
      .slice();
    disponiveis.sort((a, b) => {
      const dt = num(b.tier, 1) - num(a.tier, 1);
      if (dt) return dt;
      return prio.indexOf(a.type) - prio.indexOf(b.type);
    });
    return disponiveis[0] || null;
  }

  async function engastarUm(ch) {
    if (num(ch.gold) <= reserva(ch)) {
      setStatus("socket", "Juntando ouro para engastar");
      return false;
    }
    const gemas = (ch.gems || []).map((g) => ({ ...g }));
    if (!gemas.length) {
      setStatus("socket", "Sem gemas para engastar");
      return false;
    }
    const equipados = (ch.items || []).filter((it) =>
      it.equipped && TIPOS[it.slot] &&
      num(it.sockets) > (it.gems?.length || 0)
    );
    let fez = false;
    let total = 0;
    for (const item of equipados) {
      let livre = num(item.sockets) - (item.gems?.length || 0);
      while (livre > 0 && total < 4) {
        const gema = escolherGema(gemas, ch.cls);
        if (!gema) break;
        if (SIMULAR) {
          window.__plano?.push(`engastar ${gema.type} T${gema.tier} em ${item.name}`);
          return true;
        }
        try {
          const res = await api(`/api/me/items/${item.id}/socket`, { type: gema.type, tier: num(gema.tier, 1) });
          gema.count = Math.max(0, num(gema.count) - 1);
          livre -= 1;
          total += 1;
          fez = true;
          setStatus("socket", `Engastou ${gema.type} T${gema.tier} em ${item.name}${res?.cost ? ` (${res.cost}g)` : ""}`);
        } catch (e) {
          console.warn("[Engaste]", e);
          setStatus("socket", `Engaste falhou em ${item.name}`);
          break;
        }
      }
      if (total >= 4) break;
    }
    if (!fez) setStatus("socket", "Nenhum encaixe livre");
    return fez;
  }

  /* ----------------------------- aprimoramento ---------------------------- */

  function planoAprimorar(ch) {
    // Nunca usa como alvo nem como doador o que a forja reservou: o
    // aprimoramento roda antes da venda e comia os grupos incompletos.
    const reservados = idsDaForja(ch);
    const porSlot = new Map();
    for (const it of ch.items || []) {
      if (!it || !TIPOS[it.slot]) continue;
      if (!porSlot.has(it.slot)) porSlot.set(it.slot, []);
      porSlot.get(it.slot).push(it);
    }
    const plano = [];
    for (const slot of Object.keys(TIPOS)) {
      const lista = porSlot.get(slot) || [];
      if (!lista.length) continue;
      const livres = lista.filter((i) => !reservados.has(i.id));
      const equipado = livres.find((i) => i.equipped);
      const alvo = equipado || livres.slice().sort((a, b) => num(b.itemLevel) - num(a.itemLevel))[0];
      if (!alvo) continue;
      const doadores = livres
        .filter((i) => i.id !== alvo.id && !i.equipped && !i.favorite && !(i.gems?.length))
        .filter((i) => !recemCriadosAlq.has(i.id))
        // Nunca destrói algo melhor que o alvo.
        .filter((i) => num(i.itemLevel) < num(alvo.itemLevel) && num(i.rarity) <= num(alvo.rarity))
        .sort((a, b) => num(a.itemLevel) - num(b.itemLevel))
        .slice(0, 10);
      if (!doadores.length) continue;
      plano.push({ alvo, doadores, label: alvo.name || alvo.id });
    }
    return plano;
  }

  async function aprimorarUm(ch) {
    const plano = planoAprimorar(ch).filter((p) => !pausado(`aprimorar-${p.alvo.id}`));
    if (!plano.length) {
      setStatus("enhance", "Nenhum alvo com doadores mais fracos");
      return false;
    }
    let livre = num(ch.gold) - reserva(ch);
    for (const p of plano) {
      const corpo = { targetId: p.alvo.id, donorIds: p.doadores.map((d) => d.id) };
      let custo;
      try {
        const previa = await api("/api/me/items/enhance/preview", corpo);
        custo = num(previa?.gold);
      } catch (e) {
        if (e.codigo >= 400 && e.codigo < 500) {
          pausados.set(`aprimorar-${p.alvo.id}`, Date.now() + ESPERA_PROTEGIDO);
          continue;
        }
        throw e;
      }
      if (custo > livre) {
        setStatus("enhance", `Juntando ouro para aprimorar ${p.label} (${custo.toLocaleString("pt-BR")}g)`);
        continue;
      }
      if (SIMULAR) {
        window.__plano?.push(`aprimorar ${p.label} (${p.doadores.length} doadores, ${custo}g)`);
        return true;
      }
      try {
        await api("/api/me/items/enhance", corpo);
        livre -= custo;
        salvarStats({ aprimorados: num(stats.aprimorados) + 1 });
        setStatus("enhance", `Aprimorou ${p.label} (+${plural(p.doadores.length, "item", "itens")})`);
        status.lastAction = `Aprimorou ${p.label}`;
        return true;
      } catch (e) {
        console.warn("[Aprimorar]", e);
        pausados.set(`aprimorar-${p.alvo.id}`, Date.now() + ESPERA_FALHA);
        setStatus("enhance", `Aprimorar ${p.label} falhou: tento de novo em 1 minuto`);
        return false;
      }
    }
    return false;
  }

  /* --------------------------------- venda -------------------------------- */

  // Item que a alquimia vai reciclar não deve ser vendido: o fragmento vale mais
  // que o ouro, e vender primeiro deixaria a alquimia sem material.
  function vaiParaAlquimia(it) {
    const a = s().alchemy;
    return !!(a && a.ligado && a.reciclar) && podeReciclar(it);
  }

  // Itens que a venda individual (sem VIP) pode pegar. A raridade -1 desliga a
  // venda de propósito; nível 9999 significa "sem limite de nível".
  function elegivelVenda(it) {
    const c = s().sell;
    if (!it || it.equipped || it.favorite) return false;
    if (recemCriadosAlq.has(it.id)) return false;
    if (it.slot === "cosmetic" || it.slot === "consumable") return false;
    if (it.gems?.length) return false;
    if (vaiParaAlquimia(it)) return false;
    const maxR = num(c.rarity, 2);
    if (maxR < 0) return false;
    if (num(it.rarity, 0) > maxR) return false;
    if (num(it.itemLevel, 0) > num(c.level, 9999)) return false;
    return true;
  }

  function contarVendaveis(ch) {
    if (!s().sell.ligado) return 0;
    const protegidos = idsDaForja(ch);
    return (ch.items || []).filter((it) => elegivelVenda(it) && !protegidos.has(it.id)).length;
  }

  async function venderItens(ch) {
    const c = s().sell;
    if (!c.ligado) return false;
    if (num(c.rarity, 2) < 0) {
      setStatus("sell", "Escolha a raridade máxima para vender");
      return false;
    }
    if (vendasNaRodada >= MAX_VENDAS) return false;
    const protegidos = idsDaForja(ch);
    const restantes = MAX_VENDAS - vendasNaRodada;
    const elegiveis = (ch.items || []).filter((it) => elegivelVenda(it));
    const alvos = elegiveis.filter((it) => !protegidos.has(it.id)).slice(0, restantes);

    if (!alvos.length) {
      // Já vendeu nesta rodada: a segunda onda não pode apagar o "N vendidos"
      // com um "0 vendáveis", senão o painel parece que não vendeu nada.
      if (vendasNaRodada > 0) return false;
      const reservados = elegiveis.filter((it) => protegidos.has(it.id)).length;
      const paraAlq = (ch.items || []).filter(
        (it) => vaiParaAlquimia(it) && !it.equipped && !it.favorite && !protegidos.has(it.id) && !recemCriadosAlq.has(it.id)
      ).length;
      const extraAlq = paraAlq > 0 ? ` · ${plural(paraAlq, "item vai", "itens vão")} para a alquimia` : "";
      if (reservados > 0) {
        setStatus("sell", `${plural(reservados, "item reservado", "itens reservados")} para a forja${extraAlq}`);
      } else if (paraAlq > 0 && elegiveis.length === 0) {
        setStatus("sell", `Nada para vender: ${plural(paraAlq, "item vai", "itens vão")} para a alquimia`);
      } else if (elegiveis.length > 0) {
        setStatus("sell", `${plural(elegiveis.length, "item elegível", "itens elegíveis")} — a forja vai usar${extraAlq}`);
      } else {
        setStatus("sell", "Nenhum item para vender");
      }
      return false;
    }
    let vendidos = 0;
    let ultimoErro = null;
    for (const it of alvos) {
      if (SIMULAR) {
        window.__plano?.push(`vender ${it.name} (nv ${it.itemLevel})`);
        return true;
      }
      try {
        // Endpoint individual do próprio jogo: POST /api/me/items/{id}/sell (sem corpo).
        await api(`/api/me/items/${encodeURIComponent(it.id)}/sell`, null);
        vendidos += 1;
      } catch (e) {
        console.warn("[Venda]", it.name, e && e.codigo ? e.codigo : e);
        ultimoErro = e;
        if (e.codigo && e.codigo >= 400 && e.codigo < 500) continue;
        break;
      }
    }
    if (vendidos > 0) {
      vendasNaRodada += vendidos;
      salvarStats({ vendidos: num(stats.vendidos) + vendidos });
      setStatus("sell", `${plural(vendidos, "item vendido", "itens vendidos")} (sem VIP)`);
      status.lastAction = `${plural(vendidos, "item vendido", "itens vendidos")}`;
      return true;
    }
    // Antes o erro 4xx era engolido e a tela continuava dizendo "identificou".
    if (ultimoErro) {
      const codigo = ultimoErro.codigo ? ` (${ultimoErro.codigo})` : "";
      setStatus("sell", `A venda falhou${codigo}: ${ultimoErro.message || "erro na API"}`);
    }
    return false;
  }

  /* --------------------------------- alquimia ------------------------------- */

  // Itens que a própria alquimia acabou de criar: não podem ser reciclados logo
  // na rodada seguinte como se fossem lixo.
  const recemCriadosAlq = new Set();

  // Item que pode ser destruído para virar fragmento: não equipado, não favorito,
  // sem gemas engastadas e de um slot que a alquimia aceita.
  function podeReciclar(i) {
    if (!i || i.equipped || i.favorite) return false;
    if (i.slot === "cosmetic" || i.slot === "consumable") return false;
    if (i.gems?.length) return false;
    return ["weapon", "helmet", "armor", "ring"].includes(i.slot);
  }

  function chaveSlot(slot) {
    return { weapon: "arma", helmet: "elmo", armor: "armadura", ring: "anel" }[slot] || slot;
  }

  // O painel guarda o slot em português; a API usa o nome em inglês.
  const SLOT_API = { arma: "weapon", elmo: "helmet", armadura: "armor", anel: "ring" };
  function slotApi(v) {
    return SLOT_API[v] || v;
  }

  // Uma rodada de alquimia: recicla itens soltos para gerar fragmentos, cria itens
  // quando tem 5 fragmentos iguais e sobe de nível quando dá.
  async function alquimiaUm(ch) {
    const a = s().alchemy;
    if (!a.ligado) return false;

    const slotAlvo = slotApi(a.slotAlvo);
    try {
      // Formato real de GET /api/me/alchemy (conferido no bundle do jogo):
      // { enabled, level, maxLevel, maxRarity, fragNeed, xp, xpNeed, xpReady,
      //   levelCost, ilvlLo, ilvlHi, crafts, fragments: [{ slot, rarity, count }] }
      const estado = await api("/api/me/alchemy");
      if (!estado || estado.enabled === false) {
        setStatus("alchemy", "Alquimia desligada no servidor");
        return false;
      }
      const fragmentos = estado.fragments || [];
      const nivel = num(estado.level, 1);
      const maxNivel = Math.max(nivel, num(estado.maxLevel, nivel));
      const maxRaridade = num(estado.maxRarity, 1);
      const fragNeed = Math.max(2, num(estado.fragNeed, 5));
      const exp = num(estado.xp, 0);
      const expNeed = Math.max(1, num(estado.xpNeed, 0));
      const custoSubir = num(estado.levelCost, 0);
      const pronto = !!estado.xpReady;
      const ouro = num(ch.gold, 0);

      // 1) Subir de nível da alquimia: a barra precisa estar cheia (xpReady)
      //    e o ouro precisa cobrir o custo do próximo nível.
      if (a.subirNivel && pronto && nivel < maxNivel) {
        if (ouro < custoSubir) {
          setStatus("alchemy", `Barra cheia! Faltam ${(custoSubir - ouro).toLocaleString("pt-BR")}g para subir`);
        } else {
          if (SIMULAR) {
            window.__plano?.push("alchemy subir nível");
          } else {
            await api("/api/me/alchemy/upgrade");
          }
          salvarStats({ alchemyUpados: num(stats.alchemyUpados) + 1 });
          setStatus("alchemy", `Subiu para o nível ${nivel + 1}`);
          status.lastAction = "Alquimia subiu de nível";
          return true;
        }
      }

      // 2) Criar item quando tem fragmentos suficientes do slot/raridade escolhidos.
      if (a.criar) {
        const raridadeAlvo = Math.min(num(a.raridadeAlvo, 0), maxRaridade);
        const alvo = fragmentos.find(
          (f) =>
            f.slot === slotAlvo &&
            num(f.rarity, 0) === raridadeAlvo &&
            num(f.count, 0) >= fragNeed
        );
        if (alvo) {
          if (SIMULAR) {
            window.__plano?.push(`alchemy craft ${slotAlvo} ${raridadeAlvo}`);
          } else {
            // Resposta real: { state, character, message, crafted, xpGained }.
            const res = await api("/api/me/alchemy/craft", { slot: slotAlvo, rarity: raridadeAlvo });
            if (res && res.crafted && res.crafted.id) recemCriadosAlq.add(res.crafted.id);
          }
          salvarStats({ alchemyCriados: num(stats.alchemyCriados) + 1 });
          setStatus("alchemy", `Criou ${chaveSlot(slotAlvo)} (${RARIDADE_NOME[raridadeAlvo] || raridadeAlvo})`);
          status.lastAction = `Alquimia criou ${chaveSlot(slotAlvo)}`;
          return true;
        }
      }

      // 3) Reciclar itens que não servem para gerar fragmentos.
      if (a.reciclar) {
        const reciclaveis = (ch.items || []).filter(podeReciclar);
        if (reciclaveis.length) {
          // Não recicla itens que a forja está juntando (protegidos).
          const protegidos = idsDaForja(ch);
          // E não recicla peça melhor que a equipada no mesmo slot.
          const equipados = {};
          for (const i of ch.items || []) if (i.equipped) equipados[i.slot] = i;
          const candidatos = [];
          for (const i of reciclaveis) {
            if (protegidos.has(i.id)) continue;
            if (recemCriadosAlq.has(i.id)) continue;
            if (candidatos.length >= MAX_RECICLAR) break;
            const eq = equipados[i.slot];
            if (eq && num(i.itemLevel, 0) >= num(eq.itemLevel, 0)) continue;
            if (!SIMULAR && (await ehMelhor(i, ch.cls))) continue;
            candidatos.push(i);
          }
          if (candidatos.length) {
            const ids = candidatos.map((i) => i.id);
            if (SIMULAR) {
              window.__plano?.push(`alchemy reciclar ${ids.length} item(ns)`);
            } else {
              await api("/api/me/alchemy/destroy", { itemIds: ids });
            }
            salvarStats({ alchemyReciclados: num(stats.alchemyReciclados) + candidatos.length });
            setStatus("alchemy", `Reciclou ${candidatos.length} item(ns)`);
            status.lastAction = `Alquimia reciclou ${candidatos.length}`;
            return true;
          }
        }
      }

      // Nada para fazer nesta rodada.
      if (pronto && nivel < maxNivel) {
        if (!a.subirNivel) {
          setStatus("alchemy", "Barra cheia (subir de nível desligado)");
        } else if (ouro < custoSubir) {
          setStatus("alchemy", `Barra cheia! Faltam ${(custoSubir - ouro).toLocaleString("pt-BR")}g para subir`);
        } else {
          setStatus("alchemy", "Barra cheia, subindo de nível");
        }
      } else if (nivel >= maxNivel) {
        setStatus("alchemy", "Nível máximo de alquimia");
      } else {
        const faltam = Math.max(0, expNeed - exp);
        setStatus("alchemy", `EXP ${exp}/${expNeed} (faltam ${faltam})`);
      }
    } catch (e) {
      console.warn("[Alquimia]", e);
      if (e.codigo && e.codigo >= 400 && e.codigo < 500) {
        setStatus("alchemy", "Alquimia não disponível nesta conta");
      }
    }
    return false;
  }

  /* --------------------------------- transmog ------------------------------- */

  // Troca a aparência de um item (target) usando outro item (source) como molde.
  // Regras do jogo: mesmo slot, classes compatíveis, fonte não equipada nem
  // favorita, aparência diferente e custo de 50% do sellValue do alvo.
  function assinaturaVisual(i) {
    return `${i.vKind ?? i.kind}|${i.vLook ?? i.look ?? 0}|${i.vTier ?? i.tier ?? 0}`;
  }

  function classeCompativel(a, b, cls) {
    if (a.classReq && b.classReq) return a.classReq === b.classReq;
    if (a.classReq) return a.classReq === cls;
    if (b.classReq) return b.classReq === cls;
    return true;
  }

  function transmogJaAplicado(id) {
    return !!stats.transmogAlvos?.[id];
  }

  function marcarTransmogFeito(id) {
    const alvos = { ...(stats.transmogAlvos || {}), [id]: Date.now() };
    const recentes = Object.entries(alvos)
      .sort((a, b) => num(b[1], 0) - num(a[1], 0))
      .slice(0, MAX_TRANSMOG_ALVOS);
    salvarStats({ transmogAlvos: Object.fromEntries(recentes) });
  }

  async function transmogUm(ch) {
    const t = s().transmog;
    if (!t.ligado) return false;

    const slot = slotApi(t.alvoSlot);
    const itens = ch.items || [];
    const doSlot = itens.filter((i) => i.slot === slot);

    // O alvo é sempre o item equipado: transmog em item que pode virar
    // material de forja era justamente o conflito antigo.
    const alvo = doSlot.find((i) => i.equipped);
    if (!alvo) {
      setStatus("transmog", `Nenhum ${chaveSlot(slot)} equipado para receber a aparência`);
      return false;
    }

    // Se o servidor já devolve o visual aplicado (vLook/vKind/vTier), não gasta
    // outro item repetindo o mesmo slot a cada rodada. Alguns itens não vêm com
    // esses campos: a memória local/storage evita consumir um molde por rodada.
    const jaTemVisual = (i) => i.vKind != null || i.vLook != null || i.vTier != null;
    if (jaTemVisual(alvo) || transmogJaAplicado(alvo.id)) {
      setStatus("transmog", `${chaveSlot(slot)} já tem aparência aplicada`);
      return false;
    }

    // Fonte: mesmo slot, não equipada/favorita, sem visual próprio, compatível,
    // com aparência diferente e que a forja não reservou. Nunca usa um item
    // mais forte que o alvo só para pegar a aparência.
    const reservados = idsDaForja(ch);
    const fontes = doSlot
      .filter(
        (i) =>
          i.id !== alvo.id &&
          !i.equipped &&
          !i.favorite &&
          !jaTemVisual(i) &&
          !recemCriadosAlq.has(i.id) &&
          !reservados.has(i.id) &&
          num(i.itemLevel, 0) <= num(alvo.itemLevel, 0) &&
          num(i.rarity, 0) <= num(alvo.rarity, 0) &&
          classeCompativel(alvo, i, ch.cls) &&
          assinaturaVisual(i) !== assinaturaVisual(alvo)
      )
      // Melhor aparência primeiro (tier/look); empate fica o item mais fraco.
      .sort(
        (a, b) =>
          num(b.vTier ?? b.tier, 0) - num(a.vTier ?? a.tier, 0) ||
          num(b.vLook ?? b.look, 0) - num(a.vLook ?? a.look, 0) ||
          num(a.itemLevel, 0) - num(b.itemLevel, 0)
      );

    if (!fontes.length) {
      setStatus("transmog", `Sem ${chaveSlot(slot)} sobrando para usar como molde`);
      return false;
    }

    const source = fontes[0];
    const custo = Math.max(0, Math.round(num(alvo.sellValue, 0) * 0.5));
    if (custo > 0 && num(ch.gold, 0) < custo) {
      setStatus("transmog", `Faltam ${(custo - num(ch.gold, 0)).toLocaleString("pt-BR")}g para o transmog`);
      return false;
    }

    try {
      if (SIMULAR) {
        window.__plano?.push(`transmog ${alvo.name} <- ${source.name}`);
      } else {
        await api("/api/me/items/transmog", { targetId: alvo.id, sourceId: source.id });
      }
      marcarTransmogFeito(alvo.id);
      salvarStats({ transmogFeitos: num(stats.transmogFeitos) + 1 });
      setStatus("transmog", `Transmog ${chaveSlot(slot)} (${source.name})`);
      status.lastAction = `Transmog ${chaveSlot(slot)}`;
      return true;
    } catch (e) {
      console.warn("[Transmog]", e);
      if (e.codigo && e.codigo >= 400 && e.codigo < 500) {
        setStatus("transmog", "Transmog não disponível");
      }
      return false;
    }
  }

  // Venda automática do site (essa sim é VIP). Só configura quando muda.
  let loteCfg = "";
  async function configurarVendaLote() {
    const c = s().lote;
    if (!c.ligado) {
      // Ao abrir a aba, a engine não sabe o que ficou configurado no site na
      // sessão anterior. No modo automático desliga sempre: o autosell do site
      // roda fora da extensão e venderia o material da forja pelas costas dela.
      // Fora do automático, desliga só o que a própria extensão configurou,
      // para não mexer numa escolha manual do jogador no site.
      if (loteCfg === "off") return;
      if (!s().auto && !loteCfg) return;
      try {
        await api("/api/shop/autosell", { rarity: -1, level: 0 }, "PUT");
        loteCfg = "off";
        setStatus("lote", "Venda automática do site desligada");
      } catch (e) {
        if (e.codigo && e.codigo >= 400 && e.codigo < 500) loteCfg = "off";
      }
      return;
    }
    const cfgAtual = `${num(c.rarity, 2)}:${num(c.level, 40)}`;
    if (loteCfg === cfgAtual) return;
    try {
      await api("/api/shop/autosell", { rarity: num(c.rarity, 2), level: num(c.level, 40) }, "PUT");
      loteCfg = cfgAtual;
      setStatus("lote", `Venda automática do site (VIP) configurada`);
    } catch (e) {
      if (e.codigo && e.codigo >= 400 && e.codigo < 500) {
        loteCfg = "off";
        setStatus("lote", "Venda automática do site: exclusiva de VIP");
      }
    }
  }

  /* ------------------------------- organizar ------------------------------ */

  async function organizarBaus() {
    if (!s().organize) return;
    if (Date.now() - num(stats.lastOrganize, 0) < INTERVALO_ORGANIZAR) return;
    try {
      await api("/api/me/items/organize", { by: "level" });
      salvarStats({ lastOrganize: Date.now() });
      setStatus("organize", "Baús organizados por nível");
    } catch (e) {
      console.warn("[Organizar]", e);
      salvarStats({ lastOrganize: Date.now() - INTERVALO_ORGANIZAR + 10 * 60000 });
    }
  }

  /* --------------------------------- rodada ------------------------------- */

  async function rodada() {
    vendasNaRodada = 0;
    await configurarVendaLote();

    let ch = await api("/api/me/character");
    salvarNiveis(ch);

    let agiu = false;
    const modulos = [
      { id: "equip", ligado: () => s().equip, acao: equiparUm },
      // Forja primeiro: é o módulo que mais depende de itens que os outros
      // consumiriam (venda, aprimoramento, alquimia e transmog).
      { id: "forja", ligado: () => s().forge.ligado, acao: forjarUm },
      { id: "gem", ligado: () => s().gems.ligado, acao: gemasUm },
      { id: "socket", ligado: () => s().socket.ligado, acao: engastarUm },
      { id: "enhance", ligado: () => s().enhance.ligado, acao: aprimorarUm },
      { id: "sell", ligado: () => s().sell.ligado, acao: venderItens },
      { id: "up", ligado: () => s().stats.ligado, acao: uparUm },
      { id: "alchemy", ligado: () => s().alchemy.ligado, acao: alquimiaUm },
      { id: "transmog", ligado: () => s().transmog.ligado, acao: transmogUm }
    ];

    // Três passadas por rodada: forja primeiro, depois o resto. Cada módulo
    // ligado tenta uma ação por passada e a rodada só para quando não há mais
    // trabalho. Ciclo de 2 s => até 9 fusões e 60 vendas por minuto.
    for (let onda = 0; onda < 3; onda += 1) {
      let fezNaOnda = false;
      for (const m of modulos) {
        if (!m.ligado()) continue;
        if (m.id === "sell" && vendasNaRodada >= MAX_VENDAS) continue;
        try {
          const fez = await m.acao(ch);
          if (!fez) continue;
          fezNaOnda = true;
          agiu = true;
          // Rebusca só depois de uma ação de verdade: o inventário mudou.
          ch = await api("/api/me/character");
          salvarNiveis(ch);
        } catch (e) {
          // Um módulo com problema não pode derrubar os outros.
          console.warn(`[${m.id}]`, e);
          setStatus(m.id, "Falhou nesta rodada");
        }
      }
      if (!fezNaOnda) break;
    }

    if (ch) {
      status.counts = {
        forja: contarGruposForja(ch),
        venda: contarVendaveis(ch),
        alchemy: s().alchemy.ligado ? 1 : 0,
        transmog: s().transmog.ligado ? 1 : 0,
        reservados: idsDaForja(ch).size,
        arcano: metaArcano(ch)
      };
      const resumo = resumoPersonagem(ch);
      const comparavel = { ...resumo, at: 0 };
      const anterior = status.character ? { ...status.character, at: 0 } : null;
      if (JSON.stringify(comparavel) !== JSON.stringify(anterior)) {
        status.character = resumo;
      }
    }
    status.roundAt = Date.now();
    // Início do período sem nenhuma ação: o painel usa isso para não fingir
    // que está trabalhando quando a rodada só olhou e não mudou nada.
    if (agiu) status.quietSince = 0;
    else if (!status.quietSince) status.quietSince = status.roundAt;
    agendarStatus();

    await organizarBaus();
    if (agiu) setStatus("lastAction", status.lastAction);

    // Com a aba à vista, faz o jogo atualizar a mochila e o ouro na tela.
    if (agiu && !SIMULAR && document.visibilityState === "visible") {
      document.dispatchEvent(new Event("visibilitychange"));
    }
  }

  let ocupado = false;
  let ocupadoDesde = 0;

  // Espera a trava entre abas, mas não depende dela: se a API de trava não
  // responder, a rodada acontece mesmo assim (melhor agir do que ficar parado).
  async function comTrava(tarefa) {
    const locks = typeof navigator !== "undefined" ? navigator.locks : null;
    if (!locks || typeof locks.request !== "function") return tarefa();
    let rodou = false;
    const umaVez = () => {
      if (rodou) return null;
      rodou = true;
      return tarefa();
    };
    let liberar;
    const prazo = new Promise((ok) => { liberar = setTimeout(() => ok(TEMPO_ESGOTADO), TEMPO_TRAVA); });
    const pedido = Promise.resolve()
      .then(() => locks.request("rift-auto", { ifAvailable: true }, (trava) => (trava ? umaVez() : null)))
      .catch(() => umaVez());
    const res = await Promise.race([pedido, prazo]);
    clearTimeout(liberar);
    if (res === TEMPO_ESGOTADO) {
      console.warn("[Rift Auto] trava entre abas não respondeu; seguindo sem ela");
      return umaVez();
    }
    return res;
  }

  async function ciclo() {
    if (!cfg.running || !moduloLigado()) return;
    if (ocupado) {
      // Se uma rodada ficou presa (resposta que nunca chega), libera o motor.
      if (Date.now() - ocupadoDesde < TEMPO_MAX_RODADA) return;
      console.warn("[Rift Auto] rodada travada; liberando o motor");
      setStatus("lastAction", "Rodada travou; recomeçando");
      ocupado = false;
    }
    if (Date.now() < esperaAte) return;
    ocupado = true;
    ocupadoDesde = Date.now();
    try {
      await comTrava(rodada);
    } catch (e) {
      console.warn("[Rift Auto]", e);
      const texto = e.codigo === 401 || e.message === "sem sessão"
        ? "Entre na sua conta do jogo"
        : "Sem resposta do jogo, tentando de novo...";
      const mapa = {
        equip: s().equip, forja: s().forge.ligado, up: s().stats.ligado,
        gem: s().gems.ligado, sell: s().sell.ligado,
        enhance: s().enhance.ligado, socket: s().socket.ligado,
        alchemy: s().alchemy.ligado, transmog: s().transmog.ligado
      };
      for (const [campo, ligado] of Object.entries(mapa)) {
        if (ligado) setStatus(campo, texto);
      }
    } finally {
      ocupado = false;
    }
  }

  /* ------------------------------ ciclo de vida --------------------------- */

  async function aplicarConfig(salvo) {
    if (!salvo) return;
    const antes = cfg.running;
    cfg.running = salvo.running === true;
    cfg.settings = normalizedSettings(salvo.settings);
    if (cfg.running && !antes) pausados.clear();
    aplicarRoleta();
  }

  function aplicarRoleta() {
    const r = s().roleta;
    // content/roleta.js (mundo MAIN) lê este valor para acelerar só a animação.
    document.documentElement.dataset.riftRoleta = r.ligada ? String(num(r.vel, 4)) : "1";
  }

  async function iniciar() {
    if (!store) {
      // Modo de teste fora da extensão.
      window.__forjaTeste = {
        cfg, stats, status,
        rodar: rodada,
        definirSettings: (parcial) => { cfg.settings = normalizedSettings(parcial); },
        normalizar: normalizedSettings,
        gruposForja,
        idsDaForja,
        mochilaEmPressao,
        capacidadeMochila,
        resultadoFaixa,
        estimarCusto,
        chanceDeForja,
        chanceBase,
        metaArcano,
        roleta,
        elegivelVenda,
        vaiParaAlquimia,
        planoAprimorar,
        podeReciclar,
        venderItens,
        transmogUm,
        configurarVendaLote,
        plano: () => window.__plano || []
      };
      setInterval(ciclo, INTERVALO);
      return;
    }
    await descobrirApi();
    const legado = await importarLegado();
    const r = await store.get([KEY, STATS_KEY, STATUS_KEY]);
    await aplicarConfig(r[KEY] || legado?.cfg);
    if (r[STATS_KEY]) {
      stats = { ...stats, ...r[STATS_KEY] };
      stats.gemTotais = { juntadas: 0, supremas: 0, perdidas: 0, ...(r[STATS_KEY].gemTotais || {}) };
      stats.upGasto = r[STATS_KEY].upGasto || {};
      stats.upNiveis = r[STATS_KEY].upNiveis || {};
    } else if (legado?.stats) {
      stats = { ...stats, ...legado.stats };
    }
    if (r[STATUS_KEY]) {
      status = { ...status, ...r[STATUS_KEY] };
      status.character = r[STATUS_KEY].character || null;
    }
    const char = status.character;
    if (char?.gold != null) { /* nada: mantém o painel com o último estado */ }

    setInterval(ciclo, INTERVALO);
    ciclo();

    // Diagnóstico (fica só no mundo isolado da extensão): ajuda a saber por que
    // o motor parou sem precisar abrir o console da página.
    window.__rsafDepurar = {
      get cfg() { return cfg; },
      get status() { return status; },
      get stats() { return stats; },
      get ocupado() { return ocupado; },
      get moduloLigado() { return moduloLigado(); },
      ciclo,
      rodar: () => rodada().catch((e) => console.warn("[Rift Auto] rodada manual", e))
    };

    chrome.storage.onChanged.addListener((m) => {
      if (m[KEY]) aplicarConfig(m[KEY].newValue);
      if (m[STATS_KEY]) stats = { ...stats, ...m[STATS_KEY].newValue };
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg?.rodada) return;
      // "Rodar agora" no popup força uma rodada mesmo com o farm desligado.
      if (msg.forcar) {
        // Trazer o motor de volta mesmo se ele estiver preso numa rodada antiga.
        ocupado = false;
        ocupadoDesde = 0;
        rodada().catch((e) => console.warn("[Rift Auto] rodada manual", e));
      } else ciclo();
    });
  }

  iniciar().catch((e) => console.warn("[Rift Auto] início", e));
})();
