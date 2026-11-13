# Arquitetura

O RiftStream AutoFarm é uma extensão Manifest V3 sem build. A partir da
**v2.0.0** a automação do inventário roda **dentro da página do jogo**, e o
service worker atua apenas como coordenador.

```text
┌──────────────────────────── página riftstream.com.br ───────────────────────────┐
│                                                                                 │
│  content/riftstream.js      token (localStorage["og.token"]) → extensão          │
│  content/engine.js          automação: equipar, forja, atributos, gemas,        │
│                             engaste, aprimorar, venda, organizar                │
│  content/panel.js           painel ◆ (Shadow DOM, 6 abas)                       │
│  content/roleta.js          mundo MAIN: acelera só a animação da roleta         │
│                                                                                 │
└───────────────┬───────────────────────────────┬─────────────────────────────────┘
                │ chrome.storage.local (rsaf)   │ API oficial
                ▼                               ▼
┌──────────────────────────┐        ┌─────────────────────────────────────┐
│ background.js            │        │ z6ywq6r3ub.execute-api...amazonaws  │
│  alarme 30 s             │        │ /api/me/character, /items, /gems…   │
│  ranking público         │        └─────────────────────────────────────┘
│  abrir chat / badge      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ popup (action)           │
│  liga/desliga, lives,    │
│  personagem, status, log │
└──────────────────────────┘
```

## Por que a engine mudou para a página

| Problema no service worker | Solução na página |
|---|---|
| Token precisava ser copiado do `localStorage` para o worker | A engine lê `localStorage["og.token"]` diretamente |
| Endereço da API fixo no código | Descoberto no bundle do jogo, com nova busca em 401/erro de rede |
| Várias abas podiam rodar a manutenção juntas | `navigator.locks` com `ifAvailable` |
| Timers do worker podem ser suspensos | `setInterval` da página + alarme que envia `{ rodada: true }` |
| Sem feedback visual no jogo | Painel flutuante com status ao vivo |

## Componentes

### `background.js` (coordenador)

- Mantém o badge (`ON`/vazio) e o alarme `rsaf_tick` (0,5 min).
- A cada alarme, consulta as abas de `riftstream.com.br`, impede o descarte e
  envia `{ rodada: true }` para cada uma. O engine decide se roda.
- Busca lives em `/api/ranking/runs` e `/api/ranking/crowds`, confirma em
  `/api/ranking/channel/{login}` e grava a lista em `rsafLives`.
- Abre/reutiliza a aba da Twitch, silencia e foca o chat. **Nunca envia
  mensagem.**
- Responde ao popup (`RSAF_GET_STATE`, `RSAF_SCAN`, `RSAF_SET_RUNNING`,
  `RSAF_OPEN_PANEL`, `RSAF_MAINTENANCE`…).

### `content/engine.js`

Roda em todas as páginas do RiftStream. Uma rodada é:

1. `configurarVendaLote()` — aplica o `autosell` VIP somente quando muda.
2. Para até 12 ações:
   - `GET /api/me/character` (atualiza o resumo do painel);
   - tenta, nesta ordem: **equipar → gemas → engastar → aprimorar → forjar →
     vender → atributos**;
   - para na primeira ação que não fez nada.
3. Organiza baús se passaram 6 h.
4. Se algo mudou e a aba está visível, dispara `visibilitychange` para o jogo
   atualizar mochila/ouro.

Regras importantes:

- **Equipar** usa `/compare`; só equipa se `newPower > power`. O cache de
  comparações é limpo quando o conjunto equipado muda.
- **Forja** agrupa por `slot + raridade`, respeita `forge.minLevel/maxLevel`,
  estima o custo com reserva de ouro e usa `/compare?simGems=true` para não
  destruir item melhor que o equipado.
- **Atributos** têm dois modos: `igual` (dividir ouro, escolhendo quem recebeu
  menos) e `nivel` (metas por atributo). `stats.sel` funciona como foco; a
  reserva (`goldReserve`) nunca é gasta.
- **Gemas** combina 3 em 3 pelo endpoint do site e, se marcado, faz Suprema.
- **Engaste** escolhe a melhor gema por classe e tier.
- **Aprimorar** pede a prévia de custo e só usa doadores mais fracos.
- **Venda individual** vende até 10 por rodada, sem VIP.
- **Pausas** (`pausados`) impedem repetir um grupo que acabou de falhar por
  30–60 s.

### `content/panel.js`

- Host `#rsaf-panel` fixo, `attachShadow({ mode: "open" })`.
- Estado em `rsafPanel` (aba ativa, posição, aberto/minimizado) e leitura de
  `rsaf`, `rsafStats`, `rsafStatus`.
- Escreve `rsaf` com debounce de 180 ms.
- Aplica tema/fonte via `data-theme` e a variável `--fs`.
- `content/roleta.js` lê `document.documentElement.dataset.riftRoleta`, definido
  pelo painel.

### `content/roleta.js`

No mundo MAIN, substitui `performance.now`, `requestAnimationFrame` e
`setTimeout` por um relógio multiplicado **apenas** quando existe
`.roulette, .modal-back` e a opção está ligada. O resultado da roleta vem do
servidor; a probabilidade não é alterada.

### `popup/`

Painel rápido: liga/desliga (`RSAF_SET_RUNNING`), personagem, busca de lives,
status dos módulos, preferências rápidas e log. Lê o mesmo `rsaf` do painel.

## Armazenamento

| Chave | Conteúdo |
|---|---|
| `rsaf` | `{ running, settings }` — configuração única |
| `rsafStats` | Contadores e níveis/gastos de atributos |
| `rsafStatus` | Último status por módulo + resumo do personagem |
| `rsafLives` | Candidatos, `scanAt`, `scanError`, `current` |
| `rsafPanel` | UI do painel (aba, posição, aberto) |
| `rsafLog` | Eventos do coordenador (máx. 60) |
| `rsafToken` | Cópia do token só para o popup saber que há login |

## Falhas e limites

- **API fora do ar:** leituras do ranking são repetidas; a engine pausa o grupo
  afetado e tenta de novo depois.
- **401:** a engine tenta redescobrir a API e, se persistir, mostra “Entre na sua
  conta do jogo”.
- **503 na forja:** a escrita não é repetida às cegas; o grupo é pausado e o
  inventário é relido na rodada seguinte.
- **Sem aba do jogo:** o background apenas registra que não há para onde enviar a
  rodada.
- **Sem VIP:** a venda em lote é desativada com aviso; as demais funções seguem.

## Privacidade

Nenhuma telemetria. As únicas requisições externas são para o ranking/API do
RiftStream e para abrir a Twitch. O token nunca sai do navegador.
