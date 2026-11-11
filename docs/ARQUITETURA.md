# Arquitetura

Este documento descreve como a extensão está organizada, quais decisões foram
tomadas e onde mexer quando o RiftStream ou a Twitch mudarem.

## Visão geral

A extensão é um **Manifest V3** sem build e sem dependências externas. Há três
pontos de execução:

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| Service worker | `background.js` | Ranking, ciclo de farm, API, abas, timers e log |
| Content script (site) | `content/riftstream.js` | Lê `localStorage["og.token"]` e envia ao worker |
| Content script (Twitch) | `content/twitch.js` | Digita e envia mensagens no chat |
| Painel | `popup/` | Estado, configurações, candidatos, ações e log |

O worker é a única parte que fala com a API do RiftStream. O popup conversa com
o worker por `chrome.runtime.sendMessage`; nenhum script de página recebe o
token, exceto o content script do próprio domínio do RiftStream.

## Modelo de estado

Todo o estado fica em `chrome.storage.local` na chave `rsaf_state_v1`:

```js
{
  running: false,
  token: null,                    // JWT do RiftStream
  settings: { ... },              // opções do painel
  current: {                      // canal atual
    login: "lumen",
    tabId: 123,
    joinedAt: 0,
    since: 0,
    manualUntil: 0                // escolha manual válida por 30 min
  },
  timers: {
    lastHeartbeat, lastAfkPoke, lastJoinSentAt, lastMaintenance,
    lastChannelCheck, lastForge, lastGems, lastOrganize, lastEquipSig,
    autosellCfg
  },
  runtime: {
    status, lastError, lastAction, character, candidates,
    scanAt, channelMisses, autosellDisabled
  },
  log: [ { t, msg, level } ]      // até 80 entradas
}
```

O estado em memória é carregado uma vez por vida do service worker e salvo após
cada ciclo. Se o Chrome encerrar o worker, a próxima chamada relê o storage.

## Ciclo do farm

O alarme `rsaf_tick` roda a cada minuto. Cada execução é serializada por
`tickBusy` para evitar dois ciclos simultâneos.

```text
tick()
 ├─ carrega o estado; se não estiver rodando, sai
 ├─ garante o token (lê do site se necessário)
 ├─ garante a aba da Twitch
 │   ├─ sem aba .................. escolhe e abre a melhor live
 │   ├─ aba descartada ........... recarrega
 │   └─ URL de outro canal ....... reabre o canal atual
 ├─ carrega o personagem (/api/me/character)
 │   └─ 404 ...................... envia $jogar com a classe inicial
 ├─ decide entrada/heartbeat
 │   ├─ fora do canal ............ $jogar <classe>
 │   ├─ AFK ...................... $me
 │   └─ heartbeat vencido ........ $me
 ├─ manutenção a cada N minutos
 │   ├─ equipar
 │   ├─ gemas
 │   ├─ engastar
 │   ├─ forjar
 │   ├─ organizar
 │   └─ venda automática
 ├─ reavalia o canal a cada 10 minutos
 └─ salva o estado e atualiza o badge
```

### Escolha de canal

`scanChannels()` consulta as duas listas públicas em paralelo, aplica o mínimo
de jogadores e confirma cada candidato em `/api/ranking/channel/{login}`. O
resultado é ordenado pela pontuação da estratégia:

| Estratégia | Fórmula |
|---|---|
| `zone` | `zona × 1000 + onda × 10 + log1p(público) × 50` |
| `players` | `público × 1000 + zona × 100 + onda` |
| `balanced` | `(zona × 100 + onda) × 10 + min(público, 250) × 3 + log1p(público) × 40` |

Regras de troca:

- A aba atual só é mantida se o canal confirmar `live` e `online`.
- Uma escolha manual no painel vale por 30 minutos.
- Com `autoSwitch` desligado, o canal só muda se cair.
- A troca automática exige `bestZone >= curZone + switchHysteresis`; se a zona
  atual for 0, qualquer zona positiva serve.
- Se o endpoint do canal falhar (503/rede), o canal atual é mantido por até dois
  ciclos (`runtime.channelMisses`); depois disso, a extensão tenta o melhor
  candidato.

O modo econômico usa `https://www.twitch.tv/popout/{login}/chat?popout=`. A URL
é codificada e comparada com `urlMatchesLogin()` para detectar navegação
inesperada.

## Chat da Twitch

O content script não usa a API interna da Twitch: ele simula digitação e clique.

| Item | Seletor/decisão |
|---|---|
| Campo | `[data-a-target="chat-input"]` |
| Enviar | `button[data-a-target="chat-send-button"]` |
| Fallback | `keydown/keypress/keyup` com `Enter` |
| Digitar | `document.execCommand("insertText")` após selecionar o conteúdo |
| Limpar | `execCommand("delete")` + fallback de `textContent` |
| Sucesso | Campo esvaziado em até 6 s |
| Verificação extra | Procura o texto nas linhas do chat por 2,5 s |
| Login | `[data-a-target="login-button"]` ou modal “Junte-se hoje” |

O campo da Twitch é um editor Slate com `contenteditable`. `insertText` funciona
mesmo com a aba em segundo plano; eventos `beforeinput`/`input` sintéticos não
são confiáveis e por isso não são usados como único método.

O worker tenta enviar até 4 vezes (com espera crescente) e considera falha
apenas quando o content script rejeita explicitamente. Mensagens de erro da
Twitch (slow mode, followers-only) são extraídas de `role="alert"` e do próprio
campo.

## API do RiftStream

Base: `https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com` (`API_BASE` em
`background.js`). O front-end do site usa a mesma base e o CORS é aberto.

| Método | Caminho | Uso |
|---|---|---|
| `GET` | `/api/me/character` | Personagem, itens, gemas, canal e AFK |
| `GET` | `/api/me/items/{id}/compare` | `{ power, newPower }` antes de equipar |
| `POST` | `/api/me/items/{id}/equip` | Equipar item |
| `POST` | `/api/me/gems/combine-all` | Prévia (`GET`) e execução (`POST`) |
| `POST` | `/api/me/items/fuse-all` | Fundir tudo (VIP) |
| `POST` | `/api/me/items/{id}/socket` | Engastar gema |
| `POST` | `/api/me/items/organize` | Organizar baús |
| `PUT` | `/api/shop/autosell` | Venda automática (VIP) |
| `GET` | `/api/ranking/runs` | Lives em destaque |
| `GET` | `/api/ranking/crowds` | Lives com público |
| `GET` | `/api/ranking/channel/{login}` | Detalhe do canal |

Autenticação: `Authorization: Bearer <og.token>`. Um `401` limpa o token e pede
novo login; `404` em `/api/me/character` significa “personagem ainda não criado”
e dispara o `$jogar`.

## Manutenção do inventário

- **Equipar:** agrupa os itens não equipados por slot, ordena por
  `itemLevel + raridade × 8`, testa no máximo 5 por slot e equipa somente quando
  o `compare` confirma ganho de FC. A assinatura do inventário evita repetir a
  varredura quando nada mudou.
- **Gemas:** executa a prévia; se `merges === 0`, não faz nada. Se
  `canAfford === false`, registra o custo e espera. Caso contrário, executa o
  `POST`.
- **Forja:** roda a cada 30 minutos, respeitando `goldReserve`. Erros com “VIP”
  desativam a opção.
- **Engaste:** escolhe a gema de maior tier disponível, com prioridade por
  classe, e só usa itens equipados com espaço livre e nível ≥ 20.
- **Organização:** a cada 6 horas, quando ativada.
- **Venda automática:** aplica a configuração quando ela muda; ao desligar,
  restaura `rarity: -1` no servidor para não deixar a venda antiga ativa.

## Tratamento de falhas

| Situação | Comportamento |
|---|---|
| Token expirado (`401`) | Token é apagado; o log pede novo login |
| Personagem inexistente (`404`) | `$jogar` com a classe inicial; aguarda 6 s |
| API instável (`503`) | Canal atual é mantido por até 2 ciclos |
| Aba fechada | Recriada no próximo tick |
| Aba descartada | Recarregada e `autoDiscardable: false` é reaplicado |
| Aba em outra URL | Reabre o canal atual |
| Chat recusou | Até 4 tentativas; erro detalhado no log |
| Serviço dormindo | Alarme de 1 min acorda o worker; estado vem do storage |
| Popup fechado | O worker continua; o popup relê o estado ao abrir |

## Segurança e privacidade

- O token nunca vai para o popup nem para páginas de terceiros.
- O content script do site só responde a mensagens da extensão e só no domínio
  `riftstream.com.br`.
- O content script da Twitch não lê credenciais; apenas usa o DOM do chat.
- Não há `externally_connectable`, `web_accessible_resources` nem eval.
- Não há telemetria, analytics ou servidor próprio.

## Onde mexer

| Mudança | Arquivo |
|---|---|
| URL da API | `API_BASE` em `background.js` |
| Seletores do chat | `content/twitch.js` (`findInput`, envio, login) |
| Fórmula do ranking | `scoreChannel()` em `background.js` |
| Nova automação | `maintain()` + endpoint em `background.js` |
| Nova opção | `DEFAULT_SETTINGS`, `normalizeSettings()`, popup e README |
| Intervalos | `DEFAULT_SETTINGS` (`heartbeatMin`, `maintenanceMin`) |
| Ícones/banner | `icons/`, `docs/banner.png`, `docs/screenshot.png` |

## Limitações de design

- O chat da Twitch é uma interface de terceiros: seletores podem mudar sem aviso.
- O service worker MV3 pode dormir a qualquer momento; nada crítico depende de
  memória volátil.
- O alarme mínimo do Chrome é 1 minuto; o heartbeat é controlado por timestamps,
  não pelo alarme.
- A extensão não tenta contornar slow mode, followers-only, CAPTCHA ou
  verificações da Twitch. Se o chat recusar, o log informa e o usuário decide.
