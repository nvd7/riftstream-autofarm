<p align="center">
  <img src="docs/banner.png" alt="RiftStream AutoFarm — painel no jogo, lives na Twitch" width="100%">
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
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/vers%C3%A3o-2.0.0-f5c451" alt="Versão 2.0.0"></a>
  <img src="https://img.shields.io/badge/idioma-PT--BR-0b1220" alt="Português do Brasil">
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
  <img src="docs/screenshot.png" alt="Painel do RiftStream AutoFarm" width="380">
</p>

> [!IMPORTANT]
> **A extensão não envia mensagens no chat.** Ela só busca as lives e abre o
> chat da Twitch. Os comandos (`$jogar`, `$me`…) são digitados **por você**.
> O trabalho automático é a **manutenção do inventário**, que usa a API oficial
> do site e **não passa pelo chat**.

> [!WARNING]
> **Automatizar o inventário viola os Termos do RiftStream.** A seção 5 proíbe
> bots, scripts ou programas que automatizem o jogo. **Sua conta pode ser
> suspensa ou banida.** O projeto é fornecido como está, sem garantia e sem
> vínculo com o RiftStream, a Twitch ou a Amazon. Use preferencialmente uma
> conta alternativa e por sua conta e risco.

> [!NOTE]
> **Status: v2.0.0.** Esta versão funde o AutoFarm com a engine do
> “Rift Auto”: a automação roda **dentro da página do jogo**, descobre sozinha o
> endereço da API, usa o token da própria sessão e garante que **só uma aba**
> trabalhe por vez. O painel ◆ tem seis abas, tema claro/escuro, tamanho de
> fonte e roleta acelerada. **Forja, aprimoramento, engaste e venda individual
> não precisam de VIP**; só a venda automática em lote é exclusiva de VIP.

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
- **Seis abas:** Início, Forja, Atributos, Gemas, Venda e Ajustes.
- **Início:** personagem (nome, classe, nível, ouro e Força de Combate), status
  ao vivo de cada módulo e contadores (forjados, perdidos, equipados, vendidos,
  aprimorados, gemas).
- **Tema claro/escuro** e **tamanho da fonte** aplicados na hora e salvos.
- **Roleta rápida** (2×, 4×, 8×): acelera **só a animação** quando você gira na
  mão. O resultado vem do servidor — a chance não muda.
- **Uma aba por vez:** `navigator.locks` garante que só uma aba do jogo rode a
  manutenção, evitando ações duplicadas.
- **API descoberta na página:** o endereço do servidor é lido do código do jogo;
  se mudar, a engine procura de novo sozinha.

### Lives (popup)

- **Procurar lives (manual):** nada é escolhido sozinho.
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
  ficam de fora.
- **Filtro de nível da forja (importante):** mínimo e máximo por item. Evita
  juntar um Nv. 80 com um Nv. 140 e gerar um resultado pior.
- **Atributos do jeito que você quiser:**
  - **Dividir ouro:** o mesmo tanto para cada atributo marcado;
  - **Até o nível:** metas por atributo;
  - **Foco:** marque só Força, Vitalidade, Defesa, Agilidade ou Sorte.
  - A **reserva de ouro** nunca é gasta.
- **Gemas:** combina 3 em 3 pelo mesmo endpoint do site e, opcionalmente, faz a
  **Suprema** (aviso de risco na tela).
- **Engastar:** usa as melhores gemas do inventário nos itens equipados.
- **Aprimorar:** pede a prévia de custo antes de aplicar e só destrói itens mais
  fracos do mesmo slot — nunca equipados, favoritos ou com gemas.
- **Venda individual sem VIP:** vende um item por vez pelos endpoints normais,
  com filtros de raridade e nível. Nunca vende equipados, favoritos ou com gemas.
- **Venda automática em lote (VIP):** configura o `autosell` do site; se a conta
  não tiver VIP, a opção é desativada com aviso.
- **Organizar baús:** por nível, a cada 6 horas.

### Segurança e tolerância a falhas

- **Só uma aba trabalha**, mesmo com o jogo aberto em várias.
- **Backoff e pausas por grupo:** falhas de API pausam o item por 30–60 s em vez
  de insistir em loop.
- **Forja nunca destrói o que seria equipado.**
- **Nenhuma mensagem no chat.**
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
| **Início** | Personagem, status ao vivo dos módulos e contadores |
| **Forja** | Ligar a forja, raridades, tipos, faixa de nível e status |
| **Atributos** | Dividir ouro ou metas por nível, foco de atributos e reserva |
| **Gemas** | Combinar 3 em 3, Suprema e engaste nos equipados |
| **Venda** | Venda individual sem VIP, lote VIP e organizar baús |
| **Ajustes** | Tema, fonte, roleta rápida e posição do painel |

### Comandos (no chat da Twitch, digitados por você)

| Comando | Para que serve |
|---|---|
| `$jogar guerreiro` | Entra no canal com a classe escolhida |
| `$jogar clerigo` | Idem, clérigo |
| `$jogar arqueiro` | Idem, arqueiro |
| `$me` | Mantém o personagem ativo antes do AFK |

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
| Geral | `goldReserve` | `50000` | Ouro que nunca é gasto |
| Geral | `theme` | `dark` | `dark` ou `light` |
| Geral | `font` | `12` | Tamanho da fonte do painel/popup (10–18 px) |
| Equipar | `equip` | `true` | Equipa o item com maior FC |
| Forja | `forge.ligado` | `false` | Liga a forja (destrutiva) |
| Forja | `forge.raridades` | Comum/Incomum | Quais raridades forjar |
| Forja | `forge.tipos` | Todos | Arma, elmo, armadura e anel |
| Forja | `forge.minLevel` | `0` | Nível mínimo dos itens forjados |
| Forja | `forge.maxLevel` | `9999` | Nível máximo dos itens forjados |
| Atributos | `stats.ligado` | `true` | Gasta ouro em atributos |
| Atributos | `stats.modo` | `igual` | `igual` (dividir) ou `nivel` (metas) |
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
| `background.js` | Acorda as abas do jogo a cada ~30 s, busca lives, abre o chat e mantém o badge |
| `content/engine.js` | Toda a automação, rodando na página com o token e a API do jogo |
| `content/panel.js` | Painel flutuante (Shadow DOM, 6 abas, tema e fonte) |
| `content/roleta.js` | Acelera só a animação da roleta (mundo MAIN da página) |
| `content/riftstream.js` | Ponte do token para o popup saber se há login |
| `content/twitch.js` | Foca o campo do chat; não envia nada |
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
| Forjar | `POST /api/me/items/fuse` | 3–4 itens do mesmo slot/raridade, na faixa de nível, protegidos por `compare` |
| Atributos | `POST /api/me/character/stats/{atributo}` | `{ amount }`; foco, metas e reserva |
| Combinar gemas | `POST /api/me/gems/combine-all` | Respeita `merges`, `cost` e `canAfford` |
| Suprema | `POST /api/me/gems/supreme` | 4 Perfeitas; roleta |
| Engastar | `POST /api/me/items/{id}/socket` | Melhor gema por classe/tier |
| Aprimorar | `POST /api/me/items/enhance` | Prévia em `/enhance/preview`; doadores mais fracos |
| Vender item | `POST /api/me/items/sell` | Individual, sem VIP |
| Venda em lote | `PUT /api/shop/autosell` | VIP |
| Organizar | `POST /api/me/items/organize` | A cada 6 horas |

A engine roda uma rodada a cada poucos segundos enquanto o farm está ligado e
para quando não há mais nada a fazer. O background envia um “acorde” a cada
~30 s para a aba escondida não ser descartada. Cada ação respeita a reserva de
ouro e faz *backoff* em falhas.

### Permissões

| Permissão | Por quê |
|---|---|
| `storage` | Configurações, token, estatísticas e log locais |
| `alarms` | Acordar as abas do jogo a cada ~30 s |
| `tabs` | Abrir/reutilizar/silenciar a aba da Twitch e achar a aba do jogo |
| `scripting` | Reservado para injeção manual do content script em abas antigas |
| `riftstream.com.br` | Ler `localStorage["og.token"]` e chamar a API oficial |
| `twitch.tv` | Abrir a aba e focar o campo do chat (sem enviar mensagens) |

---

## Estrutura do projeto

```text
manifest.json           permissões, ícones e injeção dos scripts
background.js           service worker: abas, ranking e badge
content/engine.js       automação do inventário na página do jogo
content/panel.js        painel flutuante (UI principal)
content/roleta.js       aceleração só da animação da roleta
content/riftstream.js   ponte do token
content/twitch.js       foco do chat (não envia nada)
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
| Forja não roda | Sem grupos de 3–4 itens ou fora da faixa de nível | Ajuste a faixa e confira itens iguais |
| Venda não roda | Nenhum item abaixo dos filtros | Aumente raridade/nível ou desligue a proteção de equipados |
| Roleta não acelera | Opção desligada ou nenhuma roleta na tela | Ligue em Ajustes; a animação só acelera durante a roleta |
| Aba da Twitch descartada | Economia de memória | Desative a economia para a aba |

> [!NOTE]
> Ao relatar um problema, copie o **log do popup** e informe navegador, versão e
> o canal usado. **Nunca publique o token** (`og.token`).

---

## Privacidade

- **Sem telemetria.** Nada é enviado para servidores do projeto.
- **Nenhuma mensagem no chat.**
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
