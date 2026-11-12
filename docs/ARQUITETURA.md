# Arquitetura

Este documento descreve como a extensão está organizada, quais decisões foram
tomadas e onde mexer quando o RiftStream ou a Twitch mudarem.

## Princípio

A extensão **não fala no chat**. Ela faz duas coisas, e só isso:

1. **Procura lives** no ranking público quando o usuário pede e abre o chat da
   live escolhida.
2. **Mantém o inventário** do personagem pela API do site (atributos, equipar,
   gemas, forjar, aprimorar, engastar, organizar, venda automática).

Os comandos do jogo (`$jogar`, `$me`) são digitados pelo usuário. Isso elimina
qualquer risco de a extensão mandar mensagem sem querer e deixa o usuário no
controle.

## Componentes

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| Service worker | `background.js` | Ranking, abertura de aba e manutenção pela API |
| Content script (site) | `content/riftstream.js` | Lê `localStorage["og.token"]` e envia ao worker |
| Content script (Twitch) | `content/twitch.js` | Foca o campo do chat; **não envia nada** |
| Painel | `popup/` | Estado, lives, configurações, ações e log |

O worker é a única parte que fala com a API do RiftStream. O popup conversa com
o worker por `chrome.runtime.sendMessage`; nenhum script de página recebe o
token, exceto o content script do próprio domínio do RiftStream.

## Modelo de estado

Todo o estado fica em `chrome.storage.local` na chave `rsaf_state_v1`:

```js
{
  running: false,                 // manutenção automática ligada/desligada
  token: null,                    // JWT do RiftStream
  settings: { ... },              // opções do painel
  meta: {                         // migrações internas
    settingsVersion: 2
  },
  current: {                      // última live aberta pela extensão
    login: "lumen",
    tabId: 123,
    openedAt: 0
  },
  timers: {
    lastMaintenance, lastStats, lastForge, lastEnhance, lastGems,
    lastOrganize, lastEquipSig, autosellCfg
  },
  runtime: {
    status, lastError, lastAction, character, candidates,
    scanAt, scanError, awaitingCharacter, lastTransient,
    forgeNoteAt, enhanceNoteAt, autosellDisabled
  },
  log: [ { t, msg, level } ]      // até 80 entradas
}
```

O estado em memória é carregado uma vez por vida do service worker e salvo após
cada ciclo. Se o Chrome encerrar o worker, a próxima chamada relê o storage.

`normalizeState()` descarta campos antigos (por exemplo, `manualUntil`,
`channelMisses` e os timers de chat da v1.0) e mantém apenas o que a v1.2 usa.
Na primeira carga da v1.2, `meta.settingsVersion` ausente dispara a migração que
desliga `autoForge` e `autoEnhance`, mesmo que a configuração anterior tivesse a
forja ligada.

## Ciclo da manutenção

O alarme `rsaf_tick` roda a cada 30 s (o Chrome arredonda para o mínimo
suportado; em versões antigas, 1 min), mas **só faz trabalho se
`running === true`**. Cada execução é serializada por `tickBusy`.

```text
tick()
 ├─ carrega o estado; se não estiver ligado, sai
 ├─ garante o token (lê do site se necessário)
 ├─ lê o personagem (/api/me/character)
 │   └─ 404 ............... status "aguardando"; loga uma vez
 ├─ equipar (só se o inventário mudou; compara tudo em paralelo)
 ├─ salva o estado (o painel mostra a forja em até 2 s)
 ├─ forja e aprimoramento (sem VIP) em todo tick, em lotes paralelos
 │   ├─ orçamento reservado antes de disparar o lote
 │   └─ 503/rede ....... repete rápido e confirma no inventário
 ├─ manutenção a cada N minutos
 │   ├─ gastar ouro em atributos (rodadas de até 5 em paralelo)
 │   ├─ gemas
 │   ├─ engastar
 │   └─ organizar + venda automática em segundo plano
 ├─ mantém a aba aberta (recria/recarega se preciso)
 └─ salva o estado e atualiza o badge
```

Não existe busca de canal nem envio de mensagem dentro do `tick`.

## Busca de lives (manual)

`scanChannels(state, { force })` só é chamado pela mensagem `RSAF_SCAN`
(botão **Procurar lives**) ou por uma releitura recente em cache (60 s).

```text
scanChannels()
 ├─ GET /api/ranking/runs?online=true  ┐ em paralelo
 ├─ GET /api/ranking/crowds?online=true┘
 ├─ filtra por x.online e minPlayers (com fallback se ninguém atingir)
 ├─ confirma cada candidato em /api/ranking/channel/{login}
 │   ├─ descarta canais só da Kick
 │   └─ guarda zone, wave, playersNow (maior entre ranking e detalhe), live, online
 ├─ adiciona as lives já abertas na Twitch (marcadas como "aberta")
 ├─ ordena pela estratégia e coloca as abertas no topo
 └─ grava candidates, scanAt e scanError
```

| Estratégia | Fórmula |
|---|---|
| `zone` | `zona × 1000 + onda × 10 + log1p(público) × 50` |
| `players` | `público × 1000 + zona × 100 + onda` |
| `balanced` | `(zona × 100 + onda) × 10 + min(público, 250) × 3 + log1p(público) × 40` |

Falhas de rede/HTTP são acumuladas em `runtime.scanError`, que o painel exibe
quando a lista fica vazia. As lives abertas entram na lista mesmo com o ranking
fora do ar — por isso “eu já estou em uma live” sempre tem uma opção.

## Abrir a live

`openChannel(state, login, { active })`:

1. Monta a URL: popout de chat (`settings.chatOnly`) ou live completa.
2. Reaproveita a aba atual do farm se ela ainda existir; senão cria uma nova.
3. Marca `autoDiscardable: false` e silencia a aba (se `muteTab`).
4. Grava `state.current = { login, tabId, openedAt }`.
5. **Não envia nada.** O `content/twitch.js` foca o campo do chat sozinho.

`twitchLoginFromUrl()` extrai o canal de `twitch.tv/{canal}` e de
`twitch.tv/popout/{canal}/chat`, ignorando páginas reservadas (`/directory`,
`/settings`, …).

## Manutenção do inventário

- **Gastar ouro:** `POST /api/me/character/stats/{str|vit|def|agi|luk}` com
  `{ amount: 1 }`. Cada chamada compra até 40 níveis em rodadas de até 5
  requisições paralelas, lê o personagem uma vez por rodada e para quando o
  custo passa de `goldReserve`. Prioridade `balanced` escolhe sempre o atributo
  mais barato; `luk` para no cap informado pelo servidor. Roda no máximo a cada
  5 minutos.
- **Equipar:** roda em todo tick. Agrupa os itens não equipados por slot, ordena
  por `itemLevel + raridade × 8` e compara os até 5 melhores de cada slot **de
  uma vez** (`mapLimit` 6), equipando os vencedores em paralelo. Só equipa
  quando o `compare` confirma ganho de FC. A assinatura do inventário evita
  repetir a varredura quando nada mudou; se houve falha transitória, a próxima
  execução tenta de novo. Vem antes da forja para não destruir um item que seria
  equipado.
- **Forja (sem VIP):** roda a cada ~30 s, agrupa itens elegíveis por slot e
  raridade (Evento conta como Épico), pega os 3–4 de maior nível e calcula o
  custo com a mesma fórmula do site. O orçamento acima de `goldReserve` é
  reservado **antes** de disparar; depois os grupos são enviados em lotes
  paralelos de até 3. Cada chamada usa `{ itemIds, scrollItemId: null }` em
  `/api/me/items/fuse`. Em 503/rede, repete até 4× com espera curta e confere o
  inventário para não forjar duas vezes. A forja pode falhar e perder os itens.
- **Aprimoramento (sem VIP):** roda a cada ~30 s. Escolhe o item equipado (ou o
  de maior nível) de cada slot, pede todas as prévias em paralelo (até 5) e só
  então reserva o orçamento e aplica em lotes de até 2. Só destrói itens do
  mesmo slot, mais fracos, sem gemas, não equipados e não favoritos. Também
  repete em 503/rede e confirma pelos doadores que sumiram.
- **Engaste:** escolhe a gema de maior tier disponível, com prioridade por
  classe, e só usa itens equipados com espaço livre e nível ≥ 20.
- **Organização e venda automática:** não bloqueiam o ciclo. Organizar os baús
  (a cada 6 horas) e aplicar a configuração de venda rodam em segundo plano
  (`Promise.allSettled`). Ao desligar a venda, a extensão restaura `rarity: -1`
  no servidor para não deixar a venda antiga ativa.
- **Uma leitura por lote:** equipar, forja e aprimoramento releem o personagem
  uma única vez ao terminar o lote, em vez de uma vez por ação. O `tick` salva o
  estado logo depois da fase rápida, então o painel reflete o resultado em até
  2 s.

## API do RiftStream

Base: `https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com` (`API_BASE` em
`background.js`).

| Método | Caminho | Uso |
|---|---|---|
| `POST` | `/api/me/character/stats/{atributo}` | Gastar ouro em atributos |
| `GET` | `/api/me/character` | Personagem, itens, gemas, ouro e canal |
| `GET` | `/api/me/items/{id}/compare` | `{ power, newPower }` antes de equipar |
| `POST` | `/api/me/items/{id}/equip` | Equipar item |
| `POST` | `/api/me/gems/combine-all` | Prévia (`GET`) e execução (`POST`) |
| `POST` | `/api/me/items/fuse` | Forja normal, sem VIP |
| `POST` | `/api/me/items/enhance/preview` | Prévia de custo do aprimoramento |
| `POST` | `/api/me/items/enhance` | Aprimoramento, sem VIP |
| `POST` | `/api/me/items/{id}/socket` | Engastar gema |
| `POST` | `/api/me/items/organize` | Organizar baús |
| `PUT` | `/api/shop/autosell` | Venda automática (VIP) |
| `GET` | `/api/ranking/runs` | Lives em destaque (público) |
| `GET` | `/api/ranking/crowds` | Lives com público (público) |
| `GET` | `/api/ranking/channel/{login}` | Detalhe do canal (público) |

Autenticação: `Authorization: Bearer <og.token>`. Um `401` limpa o token e pede
novo login; `404` em `/api/me/character` significa “personagem ainda não criado”.

## Mensagens do painel

| Mensagem | Efeito |
|---|---|
| `RSAF_GET_STATE` | Retorna o estado público (sem token) |
| `RSAF_START` / `RSAF_STOP` | Liga/desliga a manutenção automática |
| `RSAF_SAVE_SETTINGS` | Normaliza e salva as configurações |
| `RSAF_SCAN` | Roda `scanChannels` com `force` e devolve a lista |
| `RSAF_OPEN_CHANNEL` | Abre o chat/live do canal escolhido |
| `RSAF_MAINTENANCE` | Roda a manutenção uma vez |
| `RSAF_OPEN_SITE` / `RSAF_OPEN_LIVE` | Abre o site ou a live completa |
| `RSAF_RESET_LOG` | Limpa o log |

O content script do site ainda envia `RSAF_TOKEN`; o da Twitch envia
`RSAF_TWITCH_READY` e responde a `RSAF_PING`/`RSAF_FOCUS_CHAT`.

## Tratamento de falhas

| Situação | Comportamento |
|---|---|
| Token expirado (`401`) | Token é apagado; o log pede novo login |
| Personagem inexistente (`404`) | Status “aguardando”; loga uma vez sem repetir |
| API instável (`503`/rede) | GET repete até 3× com espera crescente e `Retry-After`; status “instável”, sem erro permanente |
| Escrita com `503` | Não é repetida por padrão; forja e aprimoramento repetem até 4× e confirmam no inventário antes de repetir |
| Ranking vazio | `scanError` explica o motivo no painel |
| Aba fechada | `state.current` é limpo; nada é recriado sozinho |
| Aba descartada | Recarregada no próximo tick |
| Serviço dormindo | Alarme de ~30 s acorda o worker; estado vem do storage |
| Popup fechado | O worker continua; o popup relê o estado ao abrir |

## Segurança e privacidade

- O token nunca vai para o popup nem para páginas de terceiros.
- O content script do site só responde a mensagens da extensão e só no domínio
  `riftstream.com.br`.
- O content script da Twitch não digita nem lê o chat; apenas foca o campo.
- Não há `externally_connectable`, `web_accessible_resources` nem eval.
- Não há telemetria, analytics ou servidor próprio.

## Onde mexer

| Mudança | Arquivo |
|---|---|
| URL da API | `API_BASE` em `background.js` |
| Fórmula do ranking | `scoreChannel()` em `background.js` |
| Detecção de canal na URL | `twitchLoginFromUrl()` em `background.js` |
| Foco do chat | `content/twitch.js` |
| Nova automação de inventário | `maintain()`/`maintainFast()` + endpoint em `background.js` |
| Nova opção | `DEFAULT_SETTINGS`, `normalizeSettings()`, popup e README |
| Intervalos | `DEFAULT_SETTINGS` (`maintenanceMin`) |
| Ícones/banner | `icons/`, `docs/banner.png`, `docs/screenshot.png` |

## Limitações de design

- O service worker MV3 pode dormir a qualquer momento; nada crítico depende de
  memória volátil.
- O Chrome impõe um mínimo para alarmes (30 s nas versões recentes, 1 min nas
  antigas); a manutenção é controlada por timestamps, não pelo alarme.
- A extensão não interage com o chat: se o usuário não mandar `$jogar`, o
  personagem simplesmente não entra na live.
