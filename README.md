<p align="center">
  <img src="docs/banner.png?v=273" alt="RiftStream AutoFarm - painel no jogo, 14 temas e lives na Twitch" width="100%">
</p>

<h1 align="center">RiftStream AutoFarm</h1>

<p align="center">
  Extensão <strong>Chrome/Edge (Manifest V3)</strong> para o RPG de chat do
  RiftStream: um <strong>painel flutuante dentro do jogo</strong> cuida do
  inventário, e o popup encontra as melhores lives da Twitch.
  <strong>Você</strong> digita os comandos.
</p>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate"><img src="https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-34d399" alt="Licença MIT"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/vers%C3%A3o-3.2.1-f5c451" alt="Versão 3.2.1"></a>
  <img src="https://img.shields.io/badge/idioma-PT--BR-0b1220" alt="Português do Brasil">
  <a href="https://github.com/nvd7"><img src="https://img.shields.io/badge/made%20by-nvd7-f5c451" alt="made by nvd7"></a>
  <img src="https://img.shields.io/badge/telemetria-nenhuma-34d399" alt="Sem telemetria">
  <a href="https://github.com/nvd7/riftstream-autofarm/actions/workflows/validar.yml"><img src="https://github.com/nvd7/riftstream-autofarm/actions/workflows/validar.yml/badge.svg" alt="Validação"></a>
</p>

<p align="center">
  <a href="#sobre">Sobre</a> ·
  <a href="#recursos">Recursos</a> ·
  <a href="#instalação">Instalação</a> ·
  <a href="#como-usar">Como usar</a> ·
  <a href="#configuração">Configuração</a> ·
  <a href="#como-funciona">Como funciona</a> ·
  <a href="#solução-de-problemas">Solução de problemas</a>
</p>

<p align="center">
  <img src="docs/screenshot.png?v=273" alt="Painel do RiftStream AutoFarm com o Tema da Liah" width="310">
  &nbsp;&nbsp;
  <img src="docs/temas.png?v=273" alt="Seletor de temas do painel" width="310">
</p>

<p align="center">
  <sub><b>Painel dentro do jogo</b> · <b>14 temas com o Tema da Liah e o Tema do nvd em destaque</b></sub>
</p>

> [!IMPORTANT]
> **A extensão fala no chat por você.** Ela manda o keepalive anti-AFK
> (`$jump`), o `$jogar` quando o herói está fora de jogo e, se você ligar,
> o `$raid CÓDIGO` anunciado na live. O resto (`$jogar <classe>` manual,
> `$up`, progressão) continua sendo digitado **por você**.

> [!WARNING]
> **Automatizar o inventário viola os Termos do RiftStream.** A seção 5 proíbe
> bots, scripts ou programas que automatizem o jogo. **Sua conta pode ser
> suspensa ou banida.** O projeto é fornecido como está, sem garantia e sem
> vínculo com o RiftStream, a Twitch ou a Amazon. Use preferencialmente uma
> conta alternativa e por sua conta e risco.

> [!NOTE]
> **Status: v2.7.2.** Esta versão funde o AutoFarm com a engine do
> “Rift Auto”: a automação roda **dentro da página do jogo**, descobre sozinha o
> endereço da API, usa o token da própria sessão e garante que **só uma aba**
> trabalhe por vez. A interface foi **totalmente refeita** como um dock vertical
> com identidade própria. A rodada agora é **justa**: forja e venda rodam na
> mesma passada dos outros módulos, e a forja faz **até 3 grupos por rodada**.
> Esta versão também automatiza as abas **Alquimia** e **Transmog** do jogo.
> A forja agora chega ao **Imortal** e ao **Arcano** (grupos de 4 itens, com
> roleta no próprio painel) e o que a alquimia reciclaria **não é mais vendido**.
> No modo automático, a **forja tem prioridade**: ela reserva os grupos
> completos e os quase completos, e venda, aprimoramento, alquimia e transmog só
> usam o que sobra. O novo **Tema do nvd** é vermelho e preto, com dois chifres
> no topo do painel e animações exclusivas. E a aba **Auto** faz tudo com um
> toque: sem configurar nada, ela liga os módulos, calcula a reserva de ouro e
> escolhe a faixa da forja pelo próprio inventário.
> **Forja, aprimoramento, engaste, alquimia, transmog e venda individual não
> precisam de VIP**; só a venda automática em lote é exclusiva de VIP.

---

## Sobre

O **RiftStream** é um RPG que roda no chat da Twitch: a live precisa estar no
ar, com o bot presente no chat, e o personagem progride enquanto você está em
um canal. O **AutoFarm** ajuda nesse ciclo, sem falar por você:

1. Você clica em **Procurar lives** no popup.
2. A extensão consulta o ranking público e mostra as lives online, com zona,
   onda e público real.
3. Você escolhe uma live e a extensão **abre o chat** dela na Twitch.
4. **Você** manda o comando no chat (`$jogar arqueiro`, por exemplo).
5. O painel ◆ no canto da página do jogo cuida do inventário: equipa o melhor
   item, forja na faixa de nível escolhida, sobe atributos, junta e engasta
   gemas, aprimora e vende o que não presta.

Tudo acontece na sua máquina. Nenhum dado vai para servidores do projeto.

---

## Recursos

### Painel dentro do jogo (novo)

- **Painel flutuante ◆** injetado em `riftstream.com.br`, num Shadow DOM (não
  briga com o CSS do site). Arraste pelo cabeçalho, minimize ou feche; ao fechar
  ele vira uma bolinha no canto para reabrir.
- **Nove abas:** Auto, Início, Forja, Atributos, Gemas, Venda, Alquimia, Transmog
  e Ajustes.
- **Auto (um botão só):** toque em **Farmar sozinho** e pronto. A extensão liga
  todos os módulos com os ajustes recomendados, calcula a reserva de ouro a
  partir do seu saldo e deixa a forja agrupar pelo próprio inventário. Nada de configurar. A **forja tem prioridade**: ela reserva os
  grupos (inclusive os quase completos) e os outros módulos só usam o que sobra.
- **Início:** personagem (nome, classe, nível, ouro e Força de Combate), status
  ao vivo de cada módulo e contadores (forjados, perdidos, equipados, vendidos,
  aprimorados, gemas).
- **14 temas de cor** (estilo OpenCode) e **tamanho da fonte** aplicados na hora e
  salvos — incluindo o **Tema da Liah** (rosa, com borda neon girando no botão e
  brilho pulsante no painel) e o **Tema do nvd** (vermelho e preto, com dois
  chifres no topo do painel, brilho de brasa e animações próprias). O mesmo tema
  vale para o painel e para o popup; o botão ◐ do cabeçalho percorre a lista.
- **Roleta rápida** (2×, 4×, 8×): acelera **só a animação** quando você gira na
  mão. O resultado vem do servidor — a chance não muda.
- **Uma aba por vez:** `navigator.locks` garante que só uma aba do jogo rode a
  manutenção, evitando ações duplicadas.
- **API descoberta na página:** o endereço do servidor é lido do código do jogo;
  se mudar, a engine procura de novo sozinha.

### Jogar sozinho

- **Entra no jogo por você:** sem canal ativo em `/api/me`, manda `$jogar` no
  chat da live e confirma em 75 s que o herói apareceu em `currentChannel`.
  Se o comando não pegar, espera 5 min (20 min após três falhas) em vez de
  repetir.
- **No painel ◆ (aba Auto):** o estado real do herói (`No jogo: canal`,
  `Entrando em …`, `Fora do jogo`), um switch para ligar/desligar e o botão
  **Entrar agora**. O botão grande da mesma aba é **Farmar sozinho** — inventário.
- **Chat anti-AFK medido pelo servidor:** a linha **Chat anti-AFK** mostra
  quantos minutos faltam para o AFK (`12 min para o AFK (janela 30 min)`), o
  último ping e se o comando está em confirmação. Switch para desligar só o
  ping e **Enviar agora** para forçar um envio na hora.
- **Classe fixa ou automática:** `$jogar` sem argumento escolhe a classe menos
  cheia da live; dá para fixar guerreiro, clérigo ou arqueiro.
- **Live quando não há nenhuma:** opcionalmente escolhe a melhor do ranking
  pela mesma estratégia de zona/onda e abre o popout silenciado, sem roubar o
  foco.
- **Raid (opt-in):** lê só mensagens com "raid" + código numérico e manda
  `$raid CÓDIGO` uma vez por código.

### Lives (popup)

- **Procurar lives (manual):** o botão **Procurar lives** é sempre seu; com
  "jogar sozinho" ligado, a escolha automática só acontece quando não existe
  nenhuma live selecionada.
- **Ordenação configurável:** maior zona, mais jogadores ou equilibrado.
- **Suas abas contam:** lives já abertas na Twitch aparecem no topo, marcadas
  como **aberta**, mesmo se o ranking falhar.
- **Público real:** o detalhe do canal limita o público a 60; o painel usa o
  maior valor entre o ranking e o detalhe, então uma live cheia não aparece
  mais como 60.
- **Abre o chat pronto para digitar:** popout de chat, silenciado e sem descarte
  automático; o campo já vem focado.

### Inventário (sem VIP, exceto onde indicado)

- **Equipar por Força de Combate:** usa `compare` e só equipa quando
  `newPower > power`. A engine guarda as comparações e as invalida quando o
  equipamento muda.
- **Forja protegida:** monta grupos de 3–4 itens do mesmo slot e raridade e,
  antes de forjar, compara cada candidato com o item equipado — itens melhores
  ficam de fora. Lendário vira **Imortal** e Imortal vira **Arcano**: a partir de
  Lendário o resultado passa pela **roleta**, com a animação e a chance na tela.
  Enquanto a forja está ligada, os grupos completos da vez ficam **reservados**
  para ela; o resto volta a ser vendável. Com a mochila em 85% ou mais, só os
  grupos completos ficam presos — as sobras vão para a alquimia e a venda, então
  o inventário não entope.
- **Grupo igual ao do jogo:** a forja junta por **raridade + tipo**, sem faixa
  de nível — exatamente a regra do site (3 itens; 4 quando o resultado é Épico
  ou melhor). O nível do resultado acompanha a média dos itens usados, por isso
  a extensão escolhe os mais fortes disponíveis. O filtro mínimo/máximo de nível
  continua valendo no modo manual.
- **Pergaminho na forja (opcional):** gasta um Pergaminho de Sorte por tentativa
  para aumentar a chance de sucesso. Se o estoque acabar, a forja segue sem ele.
- **Atributos do jeito que você quiser:**
  - **Ótimo:** compra o atributo com maior ganho real por ouro, medindo dano
    (`atq × vel × crítico`) e vida efetiva (`vida × (100 + 4×defesa) / 100`)
    com os seus itens. O valor de cada ponto muda a cada compra, então a
    escolha é refeita ponto a ponto. Focos: equilibrado, dano e tanque;
  - **Dividir ouro:** o mesmo tanto para cada atributo marcado;
  - **Até o nível:** metas por atributo;
  - A **reserva de ouro** nunca é gasta.
- **Gemas:** combina 3 em 3 pelo mesmo endpoint do site e, opcionalmente, faz a
  **Suprema** (aviso de risco na tela).
- **Engastar:** usa as melhores gemas do inventário nos itens equipados.
- **Aprimorar:** pede a prévia de custo antes de aplicar e só destrói itens mais
  fracos do mesmo slot — nunca equipados, favoritos ou com gemas.
- **Venda individual sem VIP:** vende um item por vez pelos endpoints normais,
  com filtros de raridade e nível. Nunca vende equipados, favoritos, com gemas
  nem itens reservados para a forja (inclusive grupos incompletos). Com a
  reciclagem da alquimia ligada, o que ela reciclaria **vai para a alquimia** em
  vez de virar ouro. No modo automático a venda automática do site fica
  **desligada**: ela roda fora da extensão e venderia o material da forja.
- **Alquimia:** recicla itens soltos em fragmentos, cria peças garantidas com
  fragmentos suficientes e sobe o nível pagando o ouro quando a barra enche.
  Nunca recicla equipados, favoritos, com gemas, peças melhores que a equipada,
  itens reservados para a forja ou o que a alquimia acabou de criar.
- **Transmog:** aplica no item equipado do slot escolhido a aparência do melhor
  molde disponível do mesmo tipo, consumindo o molde e respeitando o custo em
  ouro. Não usa molde reservado para a forja, não repete o alvo e nunca gasta um
  item mais forte que o equipado só pela aparência.
- **Venda automática em lote (VIP):** configura o `autosell` do site; se a conta
  não tiver VIP, a opção é desativada com aviso.
- **Organizar baús:** por nível, a cada 6 horas.

### Segurança e tolerância a falhas

- **Só uma aba trabalha**, mesmo com o jogo aberto em várias.
- **Backoff e pausas por grupo:** falhas de API pausam o item por 30–60 s em vez
  de insistir em loop.
- **Forja nunca destrói o que seria equipado.**
- **Nenhuma mensagem além do keepalive.** O único envio automático é o
  comando curto anti-AFK, e ele é abortado se você estiver digitando.
- **Sem telemetria.**

---

## Requisitos

| Item | Recomendado |
|---|---|
| Navegador | Chrome, Edge, Brave ou outro Chromium recente (Manifest V3) |
| Conta Twitch | Logada no navegador normal, com o chat funcionando |
| Conta RiftStream | Login feito com a Twitch em `riftstream.com.br` |
| Aba do jogo | Uma aba de `riftstream.com.br` aberta e logada |
| Aba da Twitch | Pode ficar em segundo plano; o navegador deve continuar aberto |
| Sistema | Windows, macOS ou Linux |

> [!NOTE]
> Navegadores embutidos (Electron, painéis de aplicativos e modos de visualização
> internos) **não servem** para o chat da Twitch. Instale no Chrome/Edge/Brave
> normal, onde você já usa a Twitch.

---

## Instalação

1. Baixe a **última release**
   (<https://github.com/nvd7/riftstream-autofarm/releases>) e extraia em uma
   pasta fixa, por exemplo `C:\RiftStreamAutoFarm`.
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** / **Load unpacked**.
5. Selecione a pasta que contém o `manifest.json`.
6. Fixe o ícone **RiftStream AutoFarm** na barra de extensões.

### Atualizar

1. Substitua os arquivos da pasta pelos da versão nova.
2. Em `chrome://extensions`, clique em **recarregar** no cartão da extensão.
3. Recarregue a aba do jogo e da Twitch aberta pela extensão.

Configurações e login continuam salvos entre atualizações.

> [!TIP]
> Ao atualizar da **v1.3** ou da extensão **Rift Auto**, o painel importa
> automaticamente as configurações e os contadores antigos na primeira vez que
> a página do jogo abrir.

---

## Como usar

### Primeiro uso

1. Abra <https://riftstream.com.br/character> e entre com a Twitch.
2. Clique no ícone da extensão e em **PROCURAR LIVES**.
3. Escolha uma live: o **chat** dela abre na Twitch com o campo pronto.
4. Mande você mesmo `$jogar arqueiro` (ou a sua classe).
5. Volte à aba do jogo: o painel **◆** aparece no canto inferior direito.
6. Ligue o **Farm automático** e escolha os módulos nas abas.

Se o painel estiver fechado, clique na bolinha ◆ ou use **Abrir painel ◆** no
popup.

### As abas do painel

| Aba | O que controla |
|---|---|
| **Auto** | Um botão: liga tudo com os ajustes recomendados, sem configurar nada |
| **Início** | Personagem, status ao vivo dos módulos e contadores |
| **Forja** | Equipar o mais forte, ligar a forja, raridades, tipos, faixa de nível e aprimoramento |
| **Atributos** | Dividir ouro ou metas por nível, foco de atributos e reserva |
| **Gemas** | Combinar 3 em 3, Suprema e engaste nos equipados |
| **Venda** | Venda individual sem VIP, lote VIP e organizar baús |
| **Alquimia** | Reciclar, criar peças e subir de nível |
| **Transmog** | Trocar a aparência do item equipado |
| **Ajustes** | Tema, fonte, roleta rápida e posição do painel |

### Comandos (no chat da Twitch)

| Comando | Para que serve |
|---|---|
| `$jogar guerreiro` | Entra no canal com a classe escolhida |
| `$jogar clerigo` | Idem, clérigo |
| `$jogar arqueiro` | Idem, arqueiro |
| `$me` | Mostra o personagem; também renova o relógio de atividade |
| `$jump` | O herói pula — cosmético, sem resposta do bot |
| `$raid CÓDIGO` | Entra na raid do Covil de Vexxaris (opt-in) |

> O que a extensão manda sozinha: `$jogar` quando não há canal ativo,
> `$jump` (keepalive) perto do AFK e, se você ligar, `$raid CÓDIGO`. O resto é
> seu.

> [!TIP]
> Sem argumento, `$jogar` deixa o jogo escolher a classe **menos populosa**, o
> que pode trocar a sua. Mande a classe junto.

### Parar

Desligue o **Farm automático** no painel ou no popup. Fechar a aba do jogo
também interrompe a manutenção — o service worker só acorda abas existentes.

---

## Configuração

Tudo fica em `chrome.storage.local`, na chave `rsaf`. O painel e o popup editam
o mesmo objeto; não há dois lugares com valores diferentes.

| Grupo | Campo | Padrão | Descrição |
|---|---|---:|---|
| Lives | `strategy` | `zone` | `zone`, `players` ou `balanced` |
| Lives | `minPlayers` | `3` | Esconde lives com menos jogadores |
| Lives | `chatOnly` | `true` | Abre só o chat em vez da live completa |
| Lives | `muteTab` | `true` | Silencia a aba da Twitch |
| Geral | `auto` | `false` | Modo automático: reserva e faixa da forja saem do inventário |
| Geral | `goldReserve` | `50000` | Ouro que nunca é gasto |
| Geral | `theme` | `farmline` | `farmline`, `opencode`, `midnight`, `tokyo`, `dracula`, `nord`, `gruvbox`, `rosepine`, `liah`, `nvd`, `solarized`, `daybreak`, `paper` ou `mint` |
| Geral | `font` | `12` | Tamanho da fonte do painel/popup (10–18 px) |
| Equipar | `equip` | `true` | Equipa o item com maior FC |
| Forja | `forge.ligado` | `false` | Liga a forja (destrutiva) |
| Forja | `forge.raridades` | Comum/Incomum | Quais raridades forjar (Imortal desligado) |
| Forja | `forge.tipos` | Todos | Arma, elmo, armadura e anel |
| Forja | `forge.minLevel` | `0` | Nível mínimo dos itens forjados |
| Forja | `forge.maxLevel` | `9999` | Nível máximo dos itens forjados |
| Forja | `forge.auto` | `false` | Agrupa por raridade/tipo como o site, sem faixa de nível (modo automático) |
| Forja | `forge.useScroll` | `false` | Usa Pergaminho de Sorte em cada forja |
| Atributos | `stats.ligado` | `true` | Gasta ouro em atributos |
| Atributos | `stats.modo` | `igual` | `otimo` (ganho por ouro), `igual` (dividir) ou `nivel` (metas) |
| Atributos | `stats.foco` | `equilibrado` | No modo `otimo`: `equilibrado`, `dano` ou `tanque` |
| Atributos | `stats.sel` | Todos | Atributos marcados (foco) |
| Atributos | `stats.metas` | — | Nível-alvo por atributo no modo `nivel` |
| Gemas | `gems.ligado` | `true` | Combina gemas |
| Gemas | `gems.juntar` | `true` | Junta 3 em 3 |
| Gemas | `gems.suprema` | `false` | Faz Suprema (roleta; pode perder) |
| Gemas | `socket.ligado` | `false` | Engasta gemas nos equipados |
| Aprimorar | `enhance.ligado` | `false` | Aprimora itens (destrutivo) |
| Venda | `sell.ligado` | `false` | Venda individual sem VIP |
| Venda | `sell.rarity` | `2` | Vende até esta raridade |
| Venda | `sell.level` | `40` | Vende até este nível |
| Venda | `lote.ligado` | `false` | Venda automática do site (VIP) |
| Venda | `lote.rarity` / `lote.level` | `2` / `40` | Filtros do lote VIP |
| Baús | `organize` | `true` | Organiza por nível a cada 6 h |
| Roleta | `roleta.ligada` | `false` | Acelera a animação |
| Roleta | `roleta.vel` | `4` | 2×, 4× ou 8× |

---

## Como funciona

```text
ranking público ──► popup (lives) ──► você escolhe ──► chat da Twitch
                                                          │
                                                          └─ você digita $jogar/$me

página do jogo (engine) ──► API oficial ──► inventário
        ▲                        │
        └── painel ◆ ◄───────────┘  status ao vivo
```

### Componentes

| Arquivo | Papel |
|---|---|
| `background.js` | Acorda as abas do jogo a cada 1 min, busca lives, mantém o keepalive do chat e o badge |
| `content/engine.js` | Toda a automação, rodando na página com o token e a API do jogo |
| `content/themes.js` | Catálogo das 14 paletas de tema, compartilhado entre painel e popup |
| `content/panel.js` | Painel flutuante (Shadow DOM, 9 abas, tema e fonte) |
| `content/roleta.js` | Acelera só a animação da roleta (mundo MAIN da página) |
| `content/riftstream.js` | Ponte do token para o popup saber se há login |
| `content/twitch.js` | Foca o campo do chat ao abrir a live; não envia nada |
| `content/chatkeeper.js` | Envia o keepalive no chat e confirma que a caixa esvaziou |
| `popup/` | Liga/desliga, personagem, lives, status e log |

### Busca de lives

1. `GET /api/ranking/runs?online=true` e `GET /api/ranking/crowds?online=true`
   listam as lives em destaque.
2. Para cada candidato, `GET /api/ranking/channel/{login}` confirma `live`,
   `online`, `zone`, `wave`, `playersNow` e o `twitchLogin`.
3. Canais só da Kick são descartados.
4. Lives já abertas na Twitch entram na lista como **aberta**, mesmo se o
   ranking falhar.

### Manutenção do inventário

| Ação | Endpoint | Regra |
|---|---|---|
| Equipar | `POST /api/me/items/{id}/equip` | Só se `newPower > power` no `compare` |
| Forjar | `POST /api/me/items/fuse` | 3-4 itens do mesmo slot/raridade (`${raridade}|${slot}`, sem faixa de nível), protegidos por `compare`; a partir de Lendário o resultado vem da roleta |
| Atributos | `POST /api/me/character/stats/{atributo}` | `{ amount }`; foco, metas e reserva |
| Combinar gemas | `POST /api/me/gems/combine-all` | Respeita `merges`, `cost` e `canAfford` |
| Suprema | `POST /api/me/gems/supreme` | 4 Perfeitas; roleta |
| Engastar | `POST /api/me/items/{id}/socket` | Melhor gema por classe/tier |
| Aprimorar | `POST /api/me/items/enhance` | Prévia em `/enhance/preview`; doadores mais fracos |
| Vender item | `POST /api/me/items/{id}/sell` | Individual, sem VIP |
| Venda em lote | `PUT /api/shop/autosell` | VIP |
| Organizar | `POST /api/me/items/organize` | A cada 6 horas |

A engine roda uma rodada a cada poucos segundos enquanto o farm está ligado e
para quando não há mais nada a fazer. O background envia um “acorde” a cada
1 min para a aba escondida não ser descartada. Cada ação respeita a reserva de
ouro e faz *backoff* em falhas.

### Permissões

| Permissão | Por quê |
|---|---|
| `storage` | Configurações, token, estatísticas e log locais |
| `alarms` | Acordar as abas do jogo a cada 1 min e vigiar o relógio de AFK |
| `tabs` | Abrir/reutilizar/silenciar a aba da Twitch e achar a aba do jogo |
| `scripting` | Reinjetar o content script em abas antigas e no keepalive |
| `riftstream.com.br` | Ler `localStorage["og.token"]` e chamar a API oficial |
| `twitch.tv` | Abrir a aba, focar o campo do chat e enviar o keepalive |

---

## Estrutura do projeto

```text
manifest.json           permissões, ícones e injeção dos scripts
background.js           service worker: abas, ranking, keepalive e badge
content/engine.js       automação do inventário na página do jogo
content/panel.js        painel flutuante (UI principal)
content/roleta.js       aceleração só da animação da roleta
content/riftstream.js   ponte do token
content/twitch.js       foco do chat ao abrir a live
content/chatkeeper.js   envio e confirmação do keepalive no chat
popup/                  painel rápido (HTML/CSS/JS)
icons/                  ícones 16, 48 e 128 px
docs/                   banner, screenshot e documentação técnica
tools/validate.mjs      validação local e do GitHub Actions
.github/                workflow, templates de issue e pull request
```

Documentação adicional:

- [Arquitetura](docs/ARQUITETURA.md) — componentes, estado, ciclo e falhas.
- [Validação supervisionada](docs/VALIDACAO.md) — roteiro de teste completo.
- [Checklist de release](docs/RELEASE.md) — como publicar uma versão.
- [Privacidade](PRIVACY.md) — o que é armazenado e transmitido.
- [Segurança](SECURITY.md) — como reportar vulnerabilidades.

---

## Limitações

- **A extensão não entra na live por você.** Ela abre o chat; o `$jogar` é seu.
- **Não há troca automática de live.**
- **Precisa de uma aba do jogo aberta e logada** para a manutenção rodar.
- **Forja e aprimoramento são destrutivos.** A forja pode falhar e perder os
  itens; o aprimoramento destrói os doadores. Ambos vêm desligados.
- **A venda automática em lote é VIP.** A venda individual não é.
- **Canais exclusivos da Kick são ignorados.**
- **Mudanças no site podem quebrar a extensão.** A API e os seletores foram
  observados no front-end atual.
- **A roleta rápida não muda a chance.** Ela só encurta a animação.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O painel ◆ não aparece | Aba aberta antes de instalar/atualizar | Recarregue a aba do jogo (F5) |
| “Entre na sua conta do jogo” | Token ausente ou sessão expirada | Abra `riftstream.com.br/character`, entre de novo e recarregue |
| Farm ligado mas nada acontece | Nenhum módulo marcado | Ligue equipar/forja/atributos na aba correspondente |
| “Nenhuma live online agora” | Nenhuma live com bot no ar | Tente em alguns minutos; sua live atual aparece como **aberta** |
| “Não consegui consultar o ranking” | API fora do ar ou bloqueio | Verifique a internet/bloqueador e tente de novo |
| Personagem não aparece | Bot ausente ou `$jogar` processando | Confirme o comando no chat e aguarde |
| Forja não roda | Sem grupos de 3-4 itens do mesmo tipo e raridade | Confira se a raridade e o tipo estão ligados na aba Forja |
| Venda não roda | Nenhum item abaixo dos filtros | Aumente raridade/nível ou desligue a proteção de equipados |
| Roleta não acelera | Opção desligada ou nenhuma roleta na tela | Ligue em Ajustes; a animação só acelera durante a roleta |
| Aba da Twitch descartada | Economia de memória | Desative a economia para a aba |

> [!NOTE]
> Ao relatar um problema, copie o **log do popup** e informe navegador, versão e
> o canal usado. **Nunca publique o token** (`og.token`).

---

## Privacidade

- **Sem telemetria.** Nada é enviado para servidores do projeto.
- **Um comando no chat.** Só o keepalive anti-AFK, no canal da live atual.
- **Token local.** Lido do site e usado apenas na API oficial do RiftStream.
- **Rede.** Só `riftstream.com.br`, a API do site e `twitch.tv`.
- **Logs e estatísticas** ficam no armazenamento da extensão e podem ser limpos.

Detalhes em [PRIVACY.md](PRIVACY.md).

---

## Desenvolvimento

Não há build: o navegador carrega os arquivos diretamente.

```powershell
node tools/validate.mjs
```

Para testar:

1. Edite os arquivos.
2. Em `chrome://extensions`, clique em **recarregar**.
3. Recarregue a aba do jogo e reabra o painel ◆.
4. Acompanhe o console da página e o log do popup.

O workflow [`.github/workflows/validar.yml`](.github/workflows/validar.yml)
executa a mesma validação em cada push e pull request. Leia
[CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir uma issue ou PR.

---

## Aviso legal

Este projeto é independente e **não é afiliado, associado ou endossado** pelo
RiftStream, pela Twitch ou pela Amazon. “RiftStream” e “Twitch” pertencem aos
seus respectivos titulares.

O software é distribuído sob a licença MIT, **sem garantia de qualquer tipo**.
A automação do inventário pode violar os Termos de Serviço das plataformas
envolvidas e resultar em suspensão ou banimento da conta. Você é o único
responsável pelo uso.

## Licença

[MIT](LICENSE) © 2026 nvd7
