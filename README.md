<p align="center">
  <img src="docs/banner.png" alt="RiftStream AutoFarm — a melhor live, o melhor loot, no automático" width="100%">
</p>

<h1 align="center">RiftStream AutoFarm</h1>

<p align="center">
  Extensão <strong>Chrome/Edge (Manifest V3)</strong> que encontra a melhor live do
  RiftStream, mantém o personagem ativo no chat da Twitch e cuida de
  equipamentos, gemas e forja — tudo local, sem servidor intermediário.
</p>

<p align="center">
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate"><img src="https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-34d399" alt="Licença MIT"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/vers%C3%A3o-1.0.0-f5c451" alt="Versão 1.0.0"></a>
  <img src="https://img.shields.io/badge/idioma-PT--BR-0b1220" alt="Português do Brasil">
  <img src="https://img.shields.io/badge/telemetria-nenhuma-34d399" alt="Sem telemetria">
  <a href="https://github.com/nvd7/riftstream-autofarm/actions/workflows/validar.yml"><img src="https://github.com/nvd7/riftstream-autofarm/actions/workflows/validar.yml/badge.svg" alt="Validação"></a>
</p>

<p align="center">
  <a href="#sobre">Sobre</a> ·
  <a href="#recursos">Recursos</a> ·
  <a href="#requisitos">Requisitos</a> ·
  <a href="#instalação">Instalação</a> ·
  <a href="#como-usar">Como usar</a> ·
  <a href="#configuração">Configuração</a> ·
  <a href="#como-funciona">Como funciona</a> ·
  <a href="#solução-de-problemas">Solução de problemas</a>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="Painel do RiftStream AutoFarm" width="380">
</p>

> [!WARNING]
> **Automação viola os Termos do RiftStream.** A seção 5 proíbe o uso de bots,
> scripts ou programas que automatizem o jogo, e a Twitch também restringe
> mensagens automatizadas. **Sua conta pode ser suspensa ou banida.** Este
> projeto é fornecido como está, sem garantia e sem vínculo com o RiftStream,
> a Twitch ou a Amazon. Use preferencialmente uma conta alternativa e por sua
> conta e risco.

> [!IMPORTANT]
> **Status: v1.0.0.** O ciclo de ranking, entrada (`$jogar`), heartbeat (`$me`),
> equipar, gemas, forja, engaste, organização e venda automática está
> implementado. Os endpoints autenticados seguem a API observada no próprio
> front-end do site; mudanças no RiftStream podem exigir ajustes. O primeiro
> uso deve ser supervisionado.

---

## Sobre

O **RiftStream** é um RPG que roda no chat da Twitch: a live precisa estar no ar,
com o bot presente no chat, e o personagem progride enquanto você está em um
canal. O **AutoFarm** automatiza esse ciclo no seu navegador:

1. Consulta o ranking público e escolhe a live online com a melhor
   **zona/onda** (ou mais jogadores, conforme a estratégia).
2. Abre o **chat** da live (modo econômico) ou a live completa.
3. Entra no canal com `$jogar <classe>` sem trocar a classe do personagem.
4. Mantém o personagem ativo com `$me` e detecta AFK pelo próprio personagem.
5. Compara os itens do inventário com os equipados e equipa só o que aumenta a
   **Força de Combate (FC)**.
6. Sobe gemas, forja itens, engasta gemas e organiza os baús conforme as opções.
7. Troca de live quando a atual cai ou quando aparece uma zona melhor.

Tudo acontece na sua máquina. O token de login fica no
`chrome.storage.local` e é usado apenas para chamar a API oficial do RiftStream.

---

## Recursos

- **Ranking automático de lives:** combina `/api/ranking/runs` e
  `/api/ranking/crowds`, confirma `live`/`online` e o `twitchLogin` de cada
  canal, e ignora canais exclusivos da Kick.
- **Estratégias de escolha:** maior zona, mais jogadores ou equilíbrio entre os
  dois, com histerese para evitar trocas desnecessárias.
- **Modo econômico (padrão):** abre apenas o popout de chat
  (`twitch.tv/popout/{canal}/chat`), sem carregar vídeo — menos banda, CPU e
  distração. O botão **Abrir live** abre o stream completo quando você quiser.
- **Entrada inteligente:** envia `$jogar guerreiro|clerigo|arqueiro` com a
  classe atual, em vez de `$jogar` sem argumento (que escolheria a classe menos
  populosa e poderia trocar a sua).
- **Heartbeat e AFK:** `$me` a cada 10 minutos (configurável) e envio imediato
  quando o campo `lastActiveAt` do personagem indica inatividade.
- **Equipamento por FC:** usa `GET /api/me/items/{id}/compare` e só equipa
  quando `newPower > power`, testando os melhores candidatos de cada slot.
- **Gemas:** executa o mesmo “combinar todas” do site e respeita o ouro
  disponível.
- **Forja:** “fundir tudo” automático (recurso VIP), com intervalo e reserva de
  ouro configuráveis.
- **Extras opcionais:** engastar gemas nos itens equipados, organizar baús por
  nível e configurar a venda automática (VIP).
- **Recuperação de aba:** recria a aba da Twitch se ela for fechada ou navegar
  para outro site; impede o descarte automático da aba pelo navegador.
- **Tolerância a falhas:** erros transitórios de ranking (HTTP 503) não fazem o
  farm trocar de canal sem necessidade; a sessão expirada é detectada e o token
  é limpo.
- **Painel em PT-BR:** personagem, canal atual, candidatos, configurações e log
  com timestamp. Tudo local, sem telemetria.

---

## Requisitos

| Item | Recomendado |
|---|---|
| Navegador | Chrome, Edge, Brave ou outro Chromium recente (Manifest V3) |
| Conta Twitch | Logada **no navegador normal**, com o chat funcionando |
| Conta RiftStream | Login feito com a Twitch em `riftstream.com.br` |
| Aba da Twitch | Pode ficar em segundo plano; o navegador deve continuar aberto |
| Sistema | Windows, macOS ou Linux (a extensão é multiplataforma) |
| Rede | Acesso a `riftstream.com.br`, à API do site e à Twitch |

> [!NOTE]
> Navegadores embutidos (Electron, painéis de aplicativos e modos de visualização
> internos) **não servem** para o chat da Twitch: a Twitch bloqueia o login com
> “Não há suporte para seu navegador no momento”. Instale a extensão no seu
> Chrome/Edge/Brave normal, onde você já usa a Twitch.

---

## Instalação

A extensão não está publicada na Chrome Web Store. A instalação é feita em modo
de desenvolvedor, direto da pasta do projeto.

1. Baixe este repositório (**Code → Download ZIP**) e extraia em uma pasta fixa,
   por exemplo `C:\RiftStreamAutoFarm`.
2. Abra `chrome://extensions` (ou `edge://extensions`).
3. Ative o **Modo do desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** / **Load unpacked**.
5. Selecione a pasta que contém o `manifest.json` (a raiz do projeto).
6. Fixe o ícone **RiftStream AutoFarm** na barra de extensões.

> [!TIP]
> Se o navegador avisar que a extensão pode ler dados do site, isso é esperado:
> ela precisa acessar a API do RiftStream e o chat da Twitch para funcionar.
> Nenhum dado é enviado para servidores do projeto.

### Atualizar

1. Substitua os arquivos da pasta pelos da versão nova.
2. Abra `chrome://extensions` e clique no ícone de **recarregar** no cartão da
   extensão.
3. Recarregue também a aba da Twitch aberta pelo farm (o content script é
   reinjetado) e reabra o painel.

As configurações e o token continuam salvos entre atualizações.

---

## Como usar

### Primeiro uso

1. Abra <https://riftstream.com.br/character> e entre com a Twitch.
2. Confirme que você consegue enviar uma mensagem no chat de uma live da Twitch
   nesse mesmo navegador.
3. Clique no ícone da extensão e depois em **INICIAR AUTOFARM**.
4. A extensão abre uma aba da Twitch (só o chat, por padrão) e envia o `$jogar`.
5. Se a Twitch pedir login nessa aba, entre e clique em **Testar chat** dentro de
   **Configurações**.
6. Deixe o navegador aberto. O painel mostra o status, o personagem e o log.

Na primeira execução, o personagem pode levar alguns segundos para aparecer no
canal. Se o bot não responder, confira se a live está no ar e se o bot do
RiftStream está presente no chat.

### O que o painel mostra

| Área | Conteúdo |
|---|---|
| **Personagem** | Nome, classe, nível, FC, ouro e canal atual (zona/onda) |
| **Melhor live** | Ranking das lives online; clique em uma para trocar na hora |
| **Estratégia** | Maior zona, mais jogadores ou equilibrado |
| **Configurações** | Heartbeat, manutenção, limites, automações e teste de chat |
| **Log** | Últimas ações, avisos e erros com horário |

### Estratégias

- **Maior zona** — prioriza a zona atual mais alta, onde o loot costuma ser
  melhor.
- **Mais jogadores** — prioriza público; chefes e eventos caem mais rápido.
- **Equilibrado** — mistura zona, onda e público.

A troca automática só acontece se a nova live estiver pelo menos
`Trocar se zona +` zonas à frente (padrão: 2) ou se o canal atual cair. Uma
escolha manual no painel vale por **30 minutos**, a menos que a live saia do ar.

### Parar

Clique em **PARAR AUTOFARM** no painel. A aba da Twitch permanece aberta; você
pode fechá-la manualmente. O estado e o log ficam salvos.

---

## Configuração

As opções ficam no painel e são salvas automaticamente em
`chrome.storage.local`.

| Opção | Padrão | Descrição |
|---|---:|---|
| `strategy` | `zone` | `zone` (maior zona), `players` (mais público) ou `balanced` |
| `heartbeatMin` | `10` | Intervalo do `$me`, em minutos (5–25) |
| `maintenanceMin` | `5` | Intervalo de equipar/gemas/forjar, em minutos (2–60) |
| `minPlayers` | `3` | Ignora lives com menos jogadores que isso |
| `goldReserve` | `50000` | Não forja nem engasta abaixo desse ouro |
| `switchHysteresis` | `2` | Zonas de vantagem necessárias para trocar de live |
| `fallbackClass` | `archer` | Classe usada se o personagem ainda não existir |
| `autoEquip` | `true` | Equipa automaticamente o melhor item por slot |
| `autoGems` | `true` | Combina gemas de 3 em 3 |
| `autoForge` | `true` | Funde itens automaticamente (**VIP**) |
| `autoSocket` | `false` | Engasta gemas nos itens equipados |
| `autoOrganize` | `false` | Organiza os baús por nível |
| `autoSell` | `false` | Configura a venda automática (**VIP**) |
| `sellRarity` | `2` | Vende até esta raridade (`-1` desliga, `3` = épico) |
| `sellLevel` | `40` | Vende itens até este nível |
| `autoSwitch` | `true` | Troca de live quando vale a pena |
| `chatOnly` | `true` | Abre só o chat (menos banda) em vez da live completa |
| `muteTab` | `true` | Silencia a aba da Twitch |

> [!TIP]
> O AFK normal do RiftStream é de **30 minutos** (2 horas para VIP). O padrão de
> 10 minutos do `$me` dá margem para falhas de rede e mantém o personagem ativo
> sem gerar mensagens demais no chat.

---

## Como funciona

```text
ranking público ──► melhor live ──► popup do chat (Twitch)
                                         │
                                         ├── $jogar <classe>   (entrada)
                                         └── $me               (heartbeat)

API do RiftStream ──► personagem ──► equipar / gemas / forja / engaste
```

### Ranking de lives

1. `GET /api/ranking/runs?online=true` e `GET /api/ranking/crowds?online=true`
   listam as lives em destaque.
2. Para cada candidato, `GET /api/ranking/channel/{login}` confirma `live`,
   `online`, `zone`, `wave`, `playersNow` e o `twitchLogin`.
3. Canais que só existem na Kick são descartados.
4. A pontuação depende da estratégia:
   - `zone`: `zona × 1000 + onda × 10 + log(público) × 50`
   - `players`: `público × 1000 + zona × 100 + onda`
   - `balanced`: `(zona × 100 + onda) × 10 + público limitado a 250 + log`
5. A lista é refeita a cada 10 minutos; a aba atual é mantida se ainda estiver
   online e não houver vantagem suficiente para trocar.

### Entrada e heartbeat

- `$jogar` sem classe faz o jogo escolher a classe menos populosa e pode trocar
  a sua. Por isso a extensão envia sempre a classe atual do personagem.
- O `$me` é enviado a cada `heartbeatMin` e imediatamente se o personagem estiver
  AFK (`lastActiveAt` + `afkMinutes`).
- Se o personagem estiver em outro canal, a extensão reenvia o `$jogar` assim que
  o cooldown permite.

### Manutenção do inventário

| Ação | Endpoint | Regra |
|---|---|---|
| Equipar | `POST /api/me/items/{id}/equip` | Só se `newPower > power` no `compare` |
| Combinar gemas | `POST /api/me/gems/combine-all` | Respeita `merges`, `cost` e `canAfford` |
| Forjar | `POST /api/me/items/fuse-all` | VIP; respeita a reserva de ouro |
| Engastar | `POST /api/me/items/{id}/socket` | Gema de maior tier disponível |
| Organizar | `POST /api/me/items/organize` | A cada 6 horas, se ativado |
| Venda automática | `PUT /api/shop/autosell` | VIP; aplica raridade e nível |

Se a API recusar um recurso VIP, a opção é desativada e o motivo aparece no log.

### Chat da Twitch

O content script procura `[data-a-target="chat-input"]`, escreve com
`document.execCommand("insertText")` (funciona com o editor Slate da Twitch e em
aba de fundo), clica em `button[data-a-target="chat-send-button"]` e confirma o
envio verificando se o campo foi limpo. Se o campo não limpar, ele procura a
mensagem nas linhas do chat antes de considerar falha.

### Permissões

| Permissão | Por quê |
|---|---|
| `storage` | Salvar token, configurações, timers e log localmente |
| `alarms` | Executar o ciclo a cada minuto mesmo com o service worker dormindo |
| `tabs` | Abrir, reutilizar, silenciar e impedir o descarte da aba da Twitch |
| `scripting` | Ler o token do site caso o content script ainda não tenha carregado |
| `riftstream.com.br` | Ler `localStorage["og.token"]` e chamar a API oficial |
| `twitch.tv` | Digitar e enviar as mensagens no chat |

---

## Estrutura do projeto

```text
manifest.json           permissões, ícones e injeção dos scripts
background.js           service worker: ranking, ciclo, API, abas, manutenção
content/riftstream.js   ponte do token (localStorage → extensão)
content/twitch.js       digitação e envio no chat da Twitch
popup/                  painel de controle (HTML/CSS/JS)
icons/                  ícones 16, 48 e 128 px
docs/                   banner, screenshot e documentação técnica
tools/validate.mjs      validação usada localmente e no GitHub Actions
.github/                workflow, templates de issue e pull request
```

Documentação adicional:

- [Arquitetura](docs/ARQUITETURA.md) — componentes, estado, ciclo e tratamento
  de falhas.
- [Validação supervisionada](docs/VALIDACAO.md) — roteiro de teste completo.
- [Checklist de release](docs/RELEASE.md) — como publicar uma versão.
- [Privacidade](PRIVACY.md) — o que é armazenado e transmitido.
- [Segurança](SECURITY.md) — como reportar vulnerabilidades.

---

## Limitações

- **Forja e venda automática são VIP.** Sem VIP, a API recusa e a extensão
  desativa a opção.
- **Canais exclusivos da Kick são ignorados.** A automação é focada no chat da
  Twitch.
- **O canal precisa permitir mensagens.** Slow mode, modo seguidores e sub-only
  podem bloquear o `$jogar`/`$me`; troque de live no painel.
- **A live precisa ter o bot do RiftStream.** O ranking online normalmente
  indica isso, mas confira o chat se o personagem não aparecer.
- **O navegador precisa ficar aberto.** Fechar o navegador interrompe o farm; o
  service worker sozinho não mantém o chat.
- **Mudanças no site podem quebrar a extensão.** A API e os seletores do chat
  foram observados no front-end atual; atualize o projeto se algo mudar.
- **Não há garantia de detecção perfeita.** O projeto automatiza a interface
  como um usuário; não injeta código no jogo nem burla verificações da Twitch.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| “Não há suporte para seu navegador no momento” | Twitch bloqueia o navegador embutido/Electron | Use o Chrome/Edge/Brave normal, com a Twitch logada |
| “Sem login detectado” | Token ausente ou sessão expirada | Abra `riftstream.com.br/character`, entre de novo e reinicie |
| “Não consegui falar com a extensão” | Service worker reiniciou ou a extensão foi recarregada | Feche e abra o painel; se persistir, recarregue a extensão |
| “A Twitch não aceitou a mensagem” | Slow mode, followers-only, sub-only ou login | Entre na Twitch, teste em outra live ou aguarde o slow mode |
| “Não achei o campo do chat” | Chat ainda carregando ou live fora do ar | Confirme a live, recarregue a aba e tente de novo |
| Personagem não aparece | Bot ausente ou `$jogar` ainda processando | Verifique o chat; aguarde um ciclo ou troque de live |
| Farm não troca de live | Histerese ou escolha manual recente | Ajuste “Trocar se zona +” ou aguarde 30 minutos |
| Forja/venda desativada | Conta sem VIP ou API recusou | Reative depois de virar VIP; veja o log |
| Aba da Twitch descartada | Economia de memória do navegador | Desative a economia para a aba ou mantenha o navegador ativo |
| Erro 401/403 no log | Token expirado ou permissão insuficiente | Faça login de novo no site e reinicie o AutoFarm |

> [!NOTE]
> Ao relatar um problema, copie o **log do painel** e informe navegador, versão
> da extensão e o canal usado. **Nunca publique o token** (`og.token`) nem o
> conteúdo de `chrome.storage.local`.

---

## Privacidade

- **Sem telemetria.** O projeto não coleta estatísticas, não usa analytics e não
  envia dados para servidores próprios.
- **Token local.** O token do RiftStream é lido do site e guardado em
  `chrome.storage.local`; ele é enviado apenas para a API oficial do RiftStream.
- **Rede.** As únicas conexões são com `riftstream.com.br`, com a API do site e
  com `twitch.tv` (chat).
- **Logs.** Ficam no armazenamento da extensão e podem ser limpos no painel.
- **Remoção.** Desinstalar a extensão apaga token, configurações, timers e log.

Detalhes em [PRIVACY.md](PRIVACY.md).

---

## Desenvolvimento

Não há etapa de build: o navegador carrega os arquivos diretamente.

```powershell
# Validação local (manifest, arquivos, sintaxe e links da documentação)
node tools/validate.mjs
```

Para testar uma alteração:

1. Edite os arquivos.
2. Em `chrome://extensions`, clique em **recarregar** no cartão da extensão.
3. Recarregue a aba da Twitch e reabra o painel.
4. Acompanhe o log no painel e o console do service worker
   (**Inspecionar views → service worker**).

O workflow [`.github/workflows/validar.yml`](.github/workflows/validar.yml)
executa a mesma validação em cada push e pull request. Leia
[CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir uma issue ou PR.

---

## Aviso legal

Este projeto é independente e **não é afiliado, associado ou endossado** pelo
RiftStream, pela Twitch ou pela Amazon. “RiftStream” e “Twitch” pertencem aos
seus respectivos titulares.

O software é distribuído sob a licença MIT, **sem garantia de qualquer tipo**.
A automação pode violar os Termos de Serviço das plataformas envolvidas e
resultar em suspensão ou banimento da conta. Você é o único responsável pelo uso.

## Licença

[MIT](LICENSE) © 2026 nvd7
