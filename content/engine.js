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

  const INTERVALO = 3000;
  const ESPERA_FALHA = 60000;
  const ESPERA_PROTEGIDO = 30000;
  const MAX_VENDAS = 10;     // por rodada
  const INTERVALO_ORGANIZAR = 6 * 60 * 60000;

  const RARIDADES = ["comum", "incomum", "raro", "epico", "lendario"];
  const TIPOS = { weapon: "arma", helmet: "elmo", armor: "armadura", ring: "anel" };
  const ATRIBUTOS = { forca: "str", vitalidade: "vit", defesa: "def", agilidade: "agi", sorte: "luk" };
  const NOMES = { forca: "Força", vitalidade: "Vitalidade", defesa: "Defesa", agilidade: "Agilidade", sorte: "Sorte" };
  const RARIDADE_NOME = ["Comum", "Incomum", "Raro", "Épico", "Lendário", "Evento", "Imortal", "Arcano"];
  const FORGE_COST_FACTOR = [1, 1.35, 1.8, 2.5, 4, 3, 7, 11];
  const GEM_TYPES = ["ruby", "sapphire", "topaz", "emerald", "amethyst"];
  const GEM_PRIO = {
    warrior: ["ruby", "topaz", "amethyst", "sapphire", "emerald"],
    cleric: ["emerald", "sapphire", "amethyst", "ruby", "topaz"],
    archer: ["topaz", "ruby", "sapphire", "amethyst", "emerald"]
  };

  const DEFAULT_SETTINGS = {
    equip: true,
    forge: {
      ligado: false,
      raridades: { comum: true, incomum: true, raro: false, epico: false, lendario: false },
      tipos: { arma: true, elmo: true, armadura: true, anel: true },
      minLevel: 0,
      maxLevel: 9999
    },
    stats: {
      ligado: true,
      modo: "igual",
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
  };

  const store = globalThis.chrome?.storage?.local;
  let cfg = { running: false, settings: structuredCloneSafe(DEFAULT_SETTINGS) };
  let stats = {
    forjaTotal: 0, forjaPerdidos: 0, equipTotal: 0, vendidos: 0, aprimorados: 0,
    gemTotais: { juntadas: 0, supremas: 0, perdidas: 0 }, upNiveis: {}, upGasto: {}
  };
  let status = {
    forja: "", up: "", gem: "", equip: "", sell: "", enhance: "", organize: "",
    character: null, lastAction: "", updatedAt: 0,
    counts: { forja: 0, venda: 0 }, roundAt: 0
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

  function normalizedSettings(raw) {
    const out = structuredCloneSafe(DEFAULT_SETTINGS);
    merge(out, raw || {});
    out.goldReserve = Math.max(0, Number(out.goldReserve) || 0);
    out.forge.minLevel = Math.max(0, Number(out.forge.minLevel) || 0);
    out.forge.maxLevel = Math.max(out.forge.minLevel, Number(out.forge.maxLevel) || 9999);
    out.theme = out.theme === "light" ? "light" : "dark";
    out.font = Math.min(20, Math.max(10, Number(out.font) || 12));
    out.sell.rarity = Math.max(-1, Math.min(3, Math.round(num(out.sell.rarity, 2))));
    out.sell.level = Math.max(0, Math.min(9999, Math.round(num(out.sell.level, 9999))));
    out.lote.rarity = Math.max(-1, Math.min(3, Math.round(num(out.lote.rarity, 2))));
    out.lote.level = Math.max(0, Math.min(9999, Math.round(num(out.lote.level, 40))));
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
    out.theme = velho.theme === "light" ? "light" : "dark";
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
      x.socket.ligado || x.enhance.ligado || x.sell.ligado || x.lote.ligado;
  };

  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
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
    const token = localStorage.getItem("og.token");
    if (!token) throw new Error("sem sessão");
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (corpo) headers["Content-Type"] = "application/json";
    const metodo = metodoForcado || (corpo === undefined ? "GET" : "POST");
    const pedir = () => fetch(API + caminho, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined
    });
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

  const podeForjar = (i) => !i.equipped && !i.favorite && TIPOS[i.slot] &&
    !i.gems?.length && nivelRaridade(i) <= 4;

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

  function estimarCusto(itens, destino) {
    const nivel = itens.map((i) => num(i.itemLevel, 0));
    const media = nivel.reduce((a, b) => a + b, 0) / Math.max(1, nivel.length);
    const meio = Math.floor((Math.floor(media * 1.15) + Math.floor(media * 1.3)) / 2);
    return Math.round((5 + meio * 2) * (FORGE_COST_FACTOR[destino] ?? 1) * 2 * 1.15);
  }

  // Agrupa o que pode ser forjado, já respeitando raridade, tipo e faixa de nível.
  function gruposForja(ch) {
    const f = s().forge;
    const minLv = num(f.minLevel, 0);
    const maxLv = num(f.maxLevel, 9999);
    const grupos = new Map();
    for (const i of ch.items || []) {
      if (!podeForjar(i)) continue;
      const lv = num(i.itemLevel, 0);
      if (lv < minLv || lv > maxLv) continue;
      const r = nivelRaridade(i);
      if (!f.raridades[RARIDADES[r]] || !f.tipos[TIPOS[i.slot]]) continue;
      const chave = `${r}|${i.slot}`;
      if (!grupos.has(chave)) grupos.set(chave, { chave, r, slot: i.slot, itens: [] });
      grupos.get(chave).itens.push(i);
    }
    return [...grupos.values()]
      .filter((g) => g.itens.length >= precisaDe(destinoDe(g.r)))
      .sort((a, b) => a.r - b.r);
  }

  function contarGruposForja(ch) {
    if (!s().forge.ligado) return 0;
    return gruposForja(ch).length;
  }

  // Até 3 grupos por rodada: a forja não fica esperando o próximo ciclo para
  // cada item, mas também não dispara o inventário inteiro de uma vez.
  const MAX_FORJAS = 3;

  async function forjarUm(ch) {
    verEquipados(ch);
    const grupos = gruposForja(ch).filter((g) => !pausado(g.chave));
    if (!grupos.length) {
      setStatus("forja", Date.now() < avisoForjaAte ? avisoForja : "Aguardando itens suficientes");
      return false;
    }

    let forjou = 0;
    let livre = num(ch.gold) - s().goldReserve;
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

      // Forja os mais fracos primeiro: se sobrar um item melhor, ele fica.
      liberados = liberados.sort((a, b) => num(a.itemLevel) - num(b.itemLevel)).slice(0, precisa);
      const custo = estimarCusto(liberados, destino);
      const rotulo = `${RARIDADES[g.r]} ${TIPOS[g.slot]} nv ${liberados.map((i) => i.itemLevel).join("/")}`;
      if (custo > livre) {
        setStatus("forja", `Forja pausada: ~${custo.toLocaleString("pt-BR")}g por forja, ${Math.max(0, livre).toLocaleString("pt-BR")}g livre`);
        break;
      }
      setStatus("forja", `Forjando ${rotulo}...`);
      if (SIMULAR) {
        window.__plano?.push(`forja ${rotulo}`);
        pausados.set(g.chave, Infinity);
        return true;
      }
      try {
        const res = await api("/api/me/items/fuse", { itemIds: liberados.map((i) => i.id), scrollItemId: null });
        if (res.success === false) {
          salvarStats({ forjaPerdidos: num(stats.forjaPerdidos) + 1 });
          setStatus("forja", `Roleta falhou: ${rotulo}`);
        } else {
          salvarStats({ forjaTotal: num(stats.forjaTotal) + 1 });
          setStatus("forja", `Forjado: ${res.result?.name || rotulo}`);
          status.lastAction = `Forjou ${res.result?.name || rotulo}`;
        }
        livre -= custo;
        forjou += 1;
      } catch (e) {
        console.warn("[Forja]", e);
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
    const livre = num(ch.gold) - s().goldReserve;
    const atributos = atributosDe(ch).filter((a) => !pausado(a.id));

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
    const quantidade = s().goldReserve === 0 && meta - a.nivel >= 10 ? 10 : 1;
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
      const livre = num(ch.gold) - s().goldReserve;
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
      .filter((g) => g && GEM_TYPES.includes(g.type) && num(g.count) > 0 && num(g.tier, 1) >= 2)
      .slice();
    disponiveis.sort((a, b) => {
      const dt = num(b.tier, 1) - num(a.tier, 1);
      if (dt) return dt;
      return prio.indexOf(a.type) - prio.indexOf(b.type);
    });
    return disponiveis[0] || null;
  }

  async function engastarUm(ch) {
    if (num(ch.gold) <= s().goldReserve) {
      setStatus("socket", "Juntando ouro para engastar");
      return false;
    }
    const gemas = (ch.gems || []).map((g) => ({ ...g }));
    if (!gemas.length) {
      setStatus("socket", "Sem gemas para engastar");
      return false;
    }
    const equipados = (ch.items || []).filter((it) =>
      it.equipped && TIPOS[it.slot] && num(it.itemLevel) >= 20 &&
      num(it.sockets) > (it.gems?.length || 0)
    );
    for (const item of equipados) {
      let livre = num(item.sockets) - (item.gems?.length || 0);
      while (livre > 0) {
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
          setStatus("socket", `Engastou ${gema.type} T${gema.tier} em ${item.name}${res?.cost ? ` (${res.cost}g)` : ""}`);
          return true;
        } catch (e) {
          console.warn("[Engaste]", e);
          setStatus("socket", `Engaste falhou em ${item.name}`);
          return false;
        }
      }
    }
    setStatus("socket", "Nenhum encaixe livre");
    return false;
  }

  /* ----------------------------- aprimoramento ---------------------------- */

  function planoAprimorar(ch) {
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
      const equipado = lista.find((i) => i.equipped);
      const alvo = equipado || lista.slice().sort((a, b) => num(b.itemLevel) - num(a.itemLevel))[0];
      const doadores = lista
        .filter((i) => i.id !== alvo.id && !i.equipped && !i.favorite && !(i.gems?.length))
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
    let livre = num(ch.gold) - s().goldReserve;
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

  // Itens que a venda individual (sem VIP) pode pegar. A raridade -1 desliga a
  // venda de propósito; nível 9999 significa "sem limite de nível".
  function elegivelVenda(it) {
    const c = s().sell;
    if (!it || it.equipped || it.favorite) return false;
    if (it.slot === "cosmetic" || it.slot === "consumable") return false;
    if (it.gems?.length) return false;
    const maxR = num(c.rarity, 2);
    if (maxR < 0) return false;
    if (num(it.rarity, 0) > maxR) return false;
    if (num(it.itemLevel, 0) > num(c.level, 9999)) return false;
    return true;
  }

  // Não vende o que a forja está juntando: seria trocar ouro por item de graça.
  function idsDaForja(ch) {
    if (!s().forge.ligado) return new Set();
    const ids = new Set();
    for (const g of gruposForja(ch)) {
      for (const i of g.itens) ids.add(i.id);
    }
    return ids;
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
    const alvos = (ch.items || [])
      .filter((it) => elegivelVenda(it) && !protegidos.has(it.id))
      .slice(0, restantes);

    if (!alvos.length) {
      const protegidos = idsDaForja(ch);
      const totalElegiveis = (ch.items || []).filter((it) => elegivelVenda(it)).length;
      const realmenteVendaveis = totalElegiveis - protegidos.size;
      if (protegidos.size > 0) {
        setStatus("sell", `${plural(realmenteVendaveis, "item vendável", "itens vendáveis")} · ${plural(protegidos.size, "item", "itens")} protegido(s) pela forja`);
      } else if (totalElegiveis > 0) {
        setStatus("sell", `${plural(totalElegiveis, "item elegível", "itens elegíveis")} — a forja vai usar`);
      } else {
        setStatus("sell", "Nenhum item para vender");
      }
      return false;
    }
    let vendidos = 0;
    for (const it of alvos) {
      if (SIMULAR) {
        window.__plano?.push(`vender ${it.name} (nv ${it.itemLevel})`);
        return true;
      }
      try {
        await api("/api/me/items/sell", { itemId: it.id });
        vendidos += 1;
      } catch (e) {
        console.warn("[Venda]", e);
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
    return false;
  }

  // Venda automática do site (essa sim é VIP). Só configura quando muda.
  let loteCfg = "";
  async function configurarVendaLote() {
    const c = s().lote;
    if (!c.ligado) {
      if (loteCfg && loteCfg !== "off") {
        try {
          await api("/api/shop/autosell", { rarity: -1, level: 0 }, "PUT");
          loteCfg = "off";
          setStatus("lote", "Venda automática do site desligada");
        } catch { /* ignore */ }
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
      { id: "gem", ligado: () => s().gems.ligado, acao: gemasUm },
      { id: "socket", ligado: () => s().socket.ligado, acao: engastarUm },
      { id: "enhance", ligado: () => s().enhance.ligado, acao: aprimorarUm },
      { id: "forja", ligado: () => s().forge.ligado, acao: forjarUm },
      { id: "sell", ligado: () => s().sell.ligado, acao: venderItens },
      { id: "up", ligado: () => s().stats.ligado, acao: uparUm }
    ];

    // Escalonamento justo: cada módulo ligado tenta UMA ação por onda. Antes a
    // ordem fixa fazia equipar/aprimorar consumirem a rodada inteira e a forja
    // e a venda nunca chegavam a rodar.
    for (let onda = 0; onda < 2; onda += 1) {
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
        venda: contarVendaveis(ch)
      };
      const resumo = resumoPersonagem(ch);
      const comparavel = { ...resumo, at: 0 };
      const anterior = status.character ? { ...status.character, at: 0 } : null;
      if (JSON.stringify(comparavel) !== JSON.stringify(anterior)) {
        status.character = resumo;
      }
    }
    status.roundAt = Date.now();
    agendarStatus();

    await organizarBaus();
    if (agiu) setStatus("lastAction", status.lastAction);

    // Com a aba à vista, faz o jogo atualizar a mochila e o ouro na tela.
    if (agiu && !SIMULAR && document.visibilityState === "visible") {
      document.dispatchEvent(new Event("visibilitychange"));
    }
  }

  let ocupado = false;
  async function ciclo() {
    if (!cfg.running || !moduloLigado() || ocupado) return;
    ocupado = true;
    try {
      // Só uma aba do jogo trabalha por vez.
      await navigator.locks.request("rift-auto", { ifAvailable: true }, (trava) => (trava ? rodada() : null));
    } catch (e) {
      console.warn("[Rift Auto]", e);
      const texto = e.codigo === 401 || e.message === "sem sessão"
        ? "Entre na sua conta do jogo"
        : "Sem resposta do jogo, tentando de novo...";
      const mapa = {
        equip: s().equip, forja: s().forge.ligado, up: s().stats.ligado,
        gem: s().gems.ligado, sell: s().sell.ligado,
        enhance: s().enhance.ligado, socket: s().socket.ligado
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
      window.__forjaTeste = { cfg, stats, status, rodar: rodada };
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

    chrome.storage.onChanged.addListener((m) => {
      if (m[KEY]) aplicarConfig(m[KEY].newValue);
      if (m[STATS_KEY]) stats = { ...stats, ...m[STATS_KEY].newValue };
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg?.rodada) return;
      // "Rodar agora" no popup força uma rodada mesmo com o farm desligado.
      if (msg.forcar) rodada().catch((e) => console.warn("[Rift Auto] rodada manual", e));
      else ciclo();
    });
  }

  iniciar().catch((e) => console.warn("[Rift Auto] início", e));
})();
