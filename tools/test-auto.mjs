#!/usr/bin/env node
/**
 * Testes de regressão do modo automático.
 *
 * Carrega content/engine.js fora da extensão (modo de teste, sem chrome.storage)
 * e confere a arbitragem dos itens entre forja, venda, aprimoramento, alquimia
 * e transmog. Roda com Node.js 20+ e não precisa de dependências.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codigo = fs.readFileSync(path.join(root, "content", "engine.js"), "utf8");

function carregarEngine(opcoes = {}) {
  const fetchPadrao = async () => ({ ok: true, status: 204, json: async () => ({}) });
  const contexto = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    fetch: opcoes.fetch || fetchPadrao,
    document: {
      scripts: [],
      visibilityState: "hidden",
      dispatchEvent() {},
      documentElement: { dataset: {} }
    },
    navigator: {},
    localStorage: { getItem: () => "token" },
    location: { origin: "https://riftstream.com.br" },
    __FORJA_SIMULAR: true,
    __plano: []
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto, { filename: "content/engine.js" });
  const api = contexto.window.__forjaTeste;
  assert.ok(api, "engine deveria expor __forjaTeste fora da extensão");
  return api;
}

let seq = 0;
function item(extra = {}) {
  seq += 1;
  return {
    id: `item-${seq}`,
    name: `Item ${seq}`,
    slot: "weapon",
    rarity: 2,
    itemLevel: 100,
    equipped: false,
    favorite: false,
    gems: [],
    ...extra
  };
}

function configAuto(extra = {}) {
  return {
    auto: true,
    forge: {
      ligado: true,
      auto: true,
      raridades: {
        comum: true, incomum: true, raro: true, epico: true,
        lendario: true, imortal: false
      },
      tipos: { arma: true, elmo: true, armadura: true, anel: true }
    },
    sell: { ligado: true, rarity: 2, level: 9999 },
    enhance: { ligado: true },
    alchemy: { ligado: false, reciclar: false },
    transmog: { ligado: true, alvoSlot: "arma", fonteSlot: "arma" },
    lote: { ligado: false, rarity: 2, level: 40 },
    ...extra
  };
}

const testes = [];
function teste(nome, fn) {
  testes.push({ nome, fn });
}

teste("protege grupo incompleto e completa quando o 4º item chega", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  const itens = [
    item({ itemLevel: 100 }),
    item({ itemLevel: 101 }),
    item({ itemLevel: 102 })
  ];
  const ch = { items: itens, cls: "warrior" };

  assert.equal(api.gruposForja(ch).length, 0, "3 raros ainda não formam grupo de 4");
  assert.deepEqual([...api.idsDaForja(ch)].sort(), itens.map((i) => i.id).sort(),
    "os 3 raros precisam ficar reservados para a forja");

  const quarto = item({ itemLevel: 103 });
  const ch2 = { items: [...itens, quarto], cls: "warrior" };
  const grupos = api.gruposForja(ch2);
  assert.equal(grupos.length, 1, "com o 4º raro o grupo fica pronto");
  assert.equal(grupos[0].itens.length, 4);
  assert.equal(api.idsDaForja(ch2).size, 4);
});

teste("venda não leva itens reservados pela forja", async () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  // 3 raros próximos (grupo quase completo), 1 raro alto solto (semente) e
  // 1 raro baixo que pode ser vendido.
  const reservados = [
    item({ itemLevel: 100 }),
    item({ itemLevel: 101 }),
    item({ itemLevel: 102 }),
    item({ itemLevel: 300 })
  ];
  const descartavel = item({ itemLevel: 50, name: "Raro velho" });
  const ch = { items: [...reservados, descartavel], cls: "warrior", gold: 100000 };

  const protegidos = api.idsDaForja(ch);
  for (const i of reservados) assert.ok(protegidos.has(i.id), `${i.name} deveria estar reservado`);
  assert.ok(!protegidos.has(descartavel.id), "o raro baixo isolado pode ser vendido");
  assert.ok(api.elegivelVenda(descartavel), "o raro baixo é elegível para venda");

  const vendeu = await api.venderItens(ch);
  assert.equal(vendeu, true, "deveria vender o item não reservado");
  const plano = api.plano();
  assert.ok(plano.some((linha) => linha.includes("Raro velho")),
    "a venda precisa escolher o item que não está reservado");
  assert.ok(!plano.some((linha) => reservados.some((r) => linha.includes(r.name))),
    "a venda não pode levar material da forja");
});

teste("drops chegando um de cada vez continuam reservados até formar o grupo", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  const itens = [];
  for (let n = 0; n < 4; n += 1) {
    itens.push(item({ itemLevel: 100 + n, name: `Raro ${n + 1}` }));
    const ch = { items: itens, cls: "warrior" };
    const protegidos = api.idsDaForja(ch);
    assert.equal(protegidos.size, itens.length,
      `o drop ${n + 1} precisa ficar reservado para a forja`);
    assert.equal(api.gruposForja(ch).length, n === 3 ? 1 : 0,
      `grupos prontos no drop ${n + 1}`);
  }
});

teste("raridade desligada não esconde o grupo de nível baixo", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto({
    forge: {
      ligado: true,
      auto: true,
      raridades: {
        comum: true, incomum: true, raro: true, epico: true,
        lendario: true, imortal: true
      },
      tipos: { arma: true, elmo: true, armadura: true, anel: true }
    }
  }));
  const comuns = [
    item({ itemLevel: 10, rarity: 0 }),
    item({ itemLevel: 11, rarity: 0 }),
    item({ itemLevel: 12, rarity: 0 })
  ];
  const imortais = [
    item({ itemLevel: 300, rarity: 6 }),
    item({ itemLevel: 301, rarity: 6 }),
    item({ itemLevel: 302, rarity: 6 }),
    item({ itemLevel: 303, rarity: 6 })
  ];
  const grupos = api.gruposForja({ items: [...comuns, ...imortais], cls: "warrior" });
  assert.ok(grupos.some((g) => g.r === 0), "o grupo comum precisa continuar disponível");
  assert.ok(grupos.some((g) => g.r === 6), "o grupo imortal também é válido");
});

teste("agrupa por raridade e tipo, como a forja do jogo", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  const itens = [
    item({ itemLevel: 5 }),
    item({ itemLevel: 100 }),
    item({ itemLevel: 300 }),
    item({ itemLevel: 77 })
  ];
  // O site agrupa só por `${raridade}|${slot}`: níveis distantes formam grupo.
  assert.equal(api.gruposForja({ items: itens, cls: "warrior" }).length, 1,
    "5, 77, 100 e 300 são o mesmo grupo (raro/arma) e o jogo aceita forjar");
});

teste("raro precisa de 4 itens e forja os mais altos", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  const itens = [
    item({ itemLevel: 90 }),
    item({ itemLevel: 150 }),
    item({ itemLevel: 210 }),
    item({ itemLevel: 120 }),
    item({ itemLevel: 60 })
  ];
  const grupos = api.gruposForja({ items: itens, cls: "warrior" });
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].precisa, 4, "raro -> épico exige 4 itens, como zl(t) no jogo");
  assert.equal(
    grupos[0].itens.map((i) => i.itemLevel).join(","),
    "210,150,120,90,60",
    "os itens vêm do mais alto para o mais baixo"
  );
  // A reserva é o grupo da vez: 4 dos 5, nunca a mochila inteira.
  const reservados = api.idsDaForja({ items: itens, cls: "warrior" });
  assert.equal(reservados.size, 4, "só os 4 mais altos ficam presos na forja");
  assert.ok(!reservados.has(itens[4].id), "o item de nv 60 volta a ser vendável");
});

teste("aprimoramento não usa doador reservado pela forja", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto());
  const equipado = item({ itemLevel: 200, equipped: true, name: "Equipado" });
  const grupo = [
    item({ itemLevel: 100 }),
    item({ itemLevel: 101 }),
    item({ itemLevel: 102 })
  ];
  const sementeAlta = item({ itemLevel: 300 });
  const doadorLivre = item({ itemLevel: 50, name: "Doador livre" });
  const ch = { items: [equipado, ...grupo, sementeAlta, doadorLivre], cls: "warrior" };

  const protegidos = api.idsDaForja(ch);
  const plano = api.planoAprimorar(ch);
  assert.ok(plano.length > 0, "deveria existir um plano de aprimoramento");
  for (const p of plano) {
    assert.ok(!protegidos.has(p.alvo.id), "alvo não pode ser reservado");
    for (const d of p.doadores) {
      assert.ok(!protegidos.has(d.id), `${d.name} está reservado e não pode ser doador`);
    }
  }
  assert.ok(plano.some((p) => p.doadores.some((d) => d.id === doadorLivre.id)),
    "o doador livre deveria ser usado");
});

teste("transmog não consome molde reservado pela forja", async () => {
  const api = carregarEngine();
  api.definirSettings(configAuto({ alchemy: { ligado: false, reciclar: false } }));
  const alvo = item({ itemLevel: 200, equipped: true, name: "Arma equipada" });
  const grupo = [
    item({ itemLevel: 100, name: "Material 1" }),
    item({ itemLevel: 101, name: "Material 2" }),
    item({ itemLevel: 102, name: "Material 3" })
  ];
  const sementeAlta = item({ itemLevel: 300, name: "Semente alta" });
  const moldeLivre = item({ itemLevel: 50, name: "Molde livre", tier: 9, kind: 2, look: 4 });
  const ch = { items: [alvo, ...grupo, sementeAlta, moldeLivre], cls: "warrior", gold: 100000 };

  const fez = await api.transmogUm(ch);
  assert.equal(fez, true, "deveria aplicar o transmog com o molde livre");
  assert.ok(api.stats.transmogAlvos[alvo.id], "o alvo precisa ser lembrado");
  const fezDeNovo = await api.transmogUm(ch);
  assert.equal(fezDeNovo, false, "não pode repetir o mesmo alvo");
  assert.ok(!api.idsDaForja(ch).has(moldeLivre.id), "o molde usado não era reservado");
});

teste("modo automático desliga a venda automática do site", () => {
  const api = carregarEngine();
  api.definirSettings(configAuto({ lote: { ligado: true, rarity: 2, level: 40 } }));
  assert.equal(api.cfg.settings.lote.ligado, false,
    "o autosell do site não pode competir com a forja");

  api.definirSettings(configAuto({ auto: false, lote: { ligado: true, rarity: 2, level: 40 } }));
  assert.equal(api.cfg.settings.lote.ligado, true,
    "fora do modo automático o jogador ainda pode escolher o autosell");
});

teste("modo automático desliga o autosell do site ao abrir a aba", async () => {
  const chamadas = [];
  const fetch = async (url) => {
    chamadas.push(String(url));
    return { ok: true, status: 204, json: async () => ({}) };
  };

  const auto = carregarEngine({ fetch });
  auto.definirSettings(configAuto());
  assert.equal(auto.cfg.settings.lote.ligado, false);
  await auto.configurarVendaLote();
  await auto.configurarVendaLote();
  assert.equal(chamadas.filter((u) => u.includes("/api/shop/autosell")).length, 1,
    "no automático o autosell do site precisa ser desligado uma vez, sem repetir todo ciclo");

  chamadas.length = 0;
  const manual = carregarEngine({ fetch });
  // Fora do automático e sem nada configurado pela extensão nesta sessão, a
  // escolha manual feita no site não pode ser sobrescrita ao abrir a aba.
  manual.definirSettings(configAuto({ auto: false, lote: { ligado: false } }));
  await manual.configurarVendaLote();
  assert.equal(chamadas.length, 0, "o painel não deve desligar o autosell que o jogador ligou no site");
});

teste("rodada completa: forja acontece com venda, alquimia, aprimoramento e transmog ligados", async () => {
  const equipado = item({ itemLevel: 200, equipped: true, name: "Arma equipada" });
  const material = [
    item({ itemLevel: 100, name: "Raro A" }),
    item({ itemLevel: 101, name: "Raro B" }),
    item({ itemLevel: 102, name: "Raro C" }),
    item({ itemLevel: 103, name: "Raro D" })
  ];
  const personagem = {
    name: "Teste", cls: "warrior", level: 100, power: 1000, gold: 1000000,
    items: [equipado, ...material],
    gems: [],
    statLevels: {},
    statCosts: {}
  };
  const responder = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
  const api = carregarEngine({
    fetch: async (url) => {
      if (url.includes("/compare")) return responder({ power: 100, newPower: 90 });
      if (url.includes("/api/me/character")) return responder(personagem);
      if (url.includes("/api/me/alchemy")) {
        return responder({ enabled: true, level: 1, maxLevel: 10, fragments: [], xp: 0, xpNeed: 100, xpReady: false });
      }
      return responder({});
    }
  });
  api.definirSettings(configAuto({
    alchemy: { ligado: true, reciclar: true, criar: true, subirNivel: true, slotAlvo: "arma", raridadeAlvo: 0 }
  }));

  await api.rodar();

  const plano = api.plano();
  assert.ok(plano.some((linha) => linha.startsWith("forja ")),
    `a rodada deveria forjar; plano: ${plano.join(" | ")}`);
  assert.ok(plano.some((linha) => linha.startsWith("forja raro arma")),
    "a forja precisa usar os raros reservados");
  assert.ok(!plano.some((linha) => linha.startsWith("vender ")),
    "a venda não pode levar o grupo que a forja vai usar");
});

let falhas = 0;
for (const t of testes) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.nome}`);
  } catch (e) {
    falhas += 1;
    console.error(`  ✗ ${t.nome}`);
    console.error(`    ${e.message}`);
  }
}

if (falhas) {
  console.error(`\n${falhas} teste(s) falharam.\n`);
  process.exit(1);
}
console.log(`\n${testes.length} teste(s) do modo automático concluídos.\n`);
