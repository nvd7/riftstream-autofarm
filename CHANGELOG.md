# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto usa versionamento semântico.

## [2.0.1] - 2026-11-13

### Corrigido

- **Painel:** botões para ligar **Equipar o mais forte** e **Aprimorar itens**
  (os módulos existiam na engine, mas não tinham controle na interface).
- **Níveis dos atributos:** o painel agora mostra o nível real de cada atributo
  desde a primeira rodada, e não só depois de uma compra.
- **Aviso da forja:** “Itens melhores que o equipado protegidos” deixa de ser
  sobrescrito por “Aguardando itens suficientes” na mesma rodada.

## [2.0.0] - 2026-11-13

A maior atualização do projeto: o AutoFarm foi fundido com a engine do
“Rift Auto”. A automação saiu do service worker e passou a rodar **dentro da
página do jogo**, com painel flutuante, API descoberta na própria página e uma
única aba trabalhando por vez.

### Adicionado

- **Painel flutuante ◆ no jogo**, em Shadow DOM, com seis abas (Início, Forja,
  Atributos, Gemas, Venda e Ajustes), arrastar, minimizar, fechar e reabrir pela
  bolinha.
- **Tema claro/escuro** e **tamanho da fonte** aplicados na hora, no painel e no
  popup.
- **Roleta rápida (2×/4×/8×):** acelera somente a animação da roleta; o
  resultado continua vindo do servidor.
- **Engine na página:** token lido de `localStorage["og.token"]`, endereço da
  API descoberto no código do jogo, nova descoberta automática em falha/401.
- **Uma aba por vez** com `navigator.locks`, evitando ações duplicadas.
- **Forja protegida por `compare`:** antes de forjar, cada candidato é comparado
  com o item equipado; o que é melhor fica de fora.
- **Venda individual sem VIP** com filtros de raridade e nível (já existia na
  1.3.0 e agora vive na engine da página).
- **Status ao vivo por módulo** e contadores de forjados, perdidos, equipados,
  vendidos, aprimorados e gemas.
- **Popup redesenhado:** liga/desliga, personagem, busca de lives, status dos
  módulos, preferências rápidas e log.

### Alterado

- **Arquitetura:** `background.js` virou coordenador (acorda abas, busca lives,
  abre o chat e mantém o badge). Toda a automação está em `content/engine.js`.
- **Configuração única** em `chrome.storage.local` (`rsaf`), compartilhada entre
  painel e popup.
- **Atributos com dois modos:** dividir ouro igualmente ou upar até metas por
  atributo, com foco e reserva de ouro.
- **Forja em lotes** com estimativa de custo antes de disparar.
- **Venda individual limitada por rodada** para não inundar a API.
- Manifest cobre `www.riftstream.com.br` e declara `minimum_chrome_version`.

### Corrigido

- **Contagem de pessoas por live:** usa o maior valor entre o ranking público e
  o detalhe do canal.
- **Comparações de equipamento obsoletas** são descartadas quando o equipamento
  muda.
- **Rodadas concorrentes** em várias abas do jogo.

## [1.3.0] - 2026-11-12

Melhorias de velocidade, correção da contagem de pessoas, foco de atributos,
venda individual sem VIP, filtro de nível na forja e uma nova aba de aparência
(tema e fonte).

### Adicionado

- **Focar atributos ao gastar ouro:** nova opção `statFocus` com caixas para
  Força, Vitalidade, Defesa, Agilidade e Sorte. Enquanto houver atributos
  marcados, o ouro em atributos só é gasto neles (a prioridade é ignorada). Sem
  marcação, vale a prioridade normal.
- **Venda individual sem VIP:** opção `autoSellItem` que vende um item por vez
  usando os endpoints normais do jogo (não precisa de VIP), com filtro de
  raridade (`sellItemRarity`) e de nível (`sellItemLevel`). Nunca vende itens
  equipados, favoritos ou com gemas.
- **Filtro de nível da forja:** `forgeMinLevel` e `forgeMaxLevel` limitam quais
  itens podem ser forjados. Evita juntar itens de níveis muito diferentes (ex.:
  Nv. 80 com Nv. 140), que gerariam um resultado pior.
- **Aba de aparência:** novo painel para escolher o **tema** (escuro/claro) e o
  **tamanho da fonte**. As mudanças são aplicadas na hora e salvas automaticamente.
- Migração de configurações de v1.2 para v1.3 (`settingsVersion` 3), preenchendo
  os novos campos com padrões seguros.

### Corrigido

- **Contagem de pessoas por live:** o detalhe do canal limita `playersNow` a 60;
  o painel usa o maior valor entre o ranking público e o detalhe, então lives
  cheias não aparecem mais com 60 pessoas.

### Alterado

- **Velocidade:** equipar, forjar e aprimorar rodam em paralelo a cada ~30 s,
  sem uma etapa esperar a outra (reforço do que veio na 1.2.2).

## [1.2.2] - 2026-11-12

A manutenção ficou quase instantânea: equipar, forjar e aprimorar rodam em
paralelo a cada ~30 s, sem uma etapa esperar a outra.

### Alterado

- **Ciclo de ~30 s:** o alarme `rsaf_tick` passou de 1 min para 0,5 min (o
  Chrome arredonda para o mínimo suportado) e o estado é salvo logo depois da
  fase rápida, então o painel mostra o resultado em até 2 s.
- **Equipar em todo ciclo, antes da forja:** compara todos os candidatos de
  todos os slots de uma vez (até 6 em paralelo) e equipa os vencedores em
  paralelo. Só marca o inventário como pronto se não houve falha transitória.
- **Atributos em rodadas paralelas:** compra até 40 níveis por chamada, em
  rodadas de até 5 requisições. No modo de prioridade única, compra até 5 níveis
  do mesmo atributo por rodada.
- **Forja em lotes paralelos:** reserva o orçamento acima de `goldReserve` antes
  de disparar e processa até 3 grupos ao mesmo tempo, em vez de um por vez.
- **Aprimoramento em paralelo:** pede todas as prévias juntas (até 5), reserva o
  orçamento e aplica em lotes de 2. O intervalo caiu para 30 s.
- **Organizar baús e venda automática em segundo plano:** não bloqueiam mais
  equipar, forjar ou aprimorar.
- **Uma leitura por lote:** forja e aprimoramento releem o personagem uma única
  vez ao terminar o lote, em vez de uma vez por ação.
- **Público real na lista de lives:** o detalhe do canal limita `playersNow` a
  60; o painel agora usa o maior valor entre o ranking público e o detalhe, então
  lives com 200+ pessoas não aparecem mais como 60.

## [1.2.1] - 2026-11-12

A forja deixou de esperar 30 minutos: agora roda a cada ciclo (1 min), processa
todos os grupos e insiste rápido quando o servidor responde 503.

### Alterado

- **Forja a cada minuto**, processando todos os grupos elegíveis em vez de no
  máximo 6 a cada 30 minutos.
- **Aprimoramento a cada minuto**, processando todos os planos de slot em vez de
  apenas o primeiro.
- **Retentativas rápidas em 503/rede** para forja e aprimoramento: até 4
  tentativas com espera curta e confirmação no inventário antes de repetir, para
  não aplicar duas vezes.
- **Leituras (GET) repetem até 4×** com espera menor (máximo de 1,2 s).
- **Ao ligar forja ou aprimoramento** no painel, a extensão executa na hora, sem
  esperar o próximo ciclo.
- **A busca manual de lives insiste até 4×** em 503 e o status “instável” volta
  para “ativo” assim que uma busca funciona.
- A forja avisa no log quando não há grupos de 3–4 itens iguais disponíveis.

### Corrigido

- O ciclo da manutenção não conseguia atualizar o personagem depois da forja
  (variável `const` reatribuída).

## [1.2.0] - 2026-11-12

Cada automação ganha um interruptor no painel, forja e aprimoramento passam a
usar os endpoints normais (sem VIP) e a extensão fica mais resistente às quedas
intermitentes do RiftStream.

### Adicionado

- **Menu “Funções”** com um interruptor para cada automação: gastar ouro em
  atributos, equipar, combinar gemas, engastar, organizar baús, forjar,
  aprimorar e vender.
- **Gastar ouro em atributos** (`POST /api/me/character/stats/{atributo}`), com
  prioridade configurável (equilibrado ou um atributo específico) e respeito ao
  ouro reservado.
- **Forja sem VIP** (`POST /api/me/items/fuse`): monta os grupos de 3–4 itens do
  mesmo slot e raridade, calcula o custo antes e para se o ouro reservado for
  comprometido.
- **Aprimoramento sem VIP** (`POST /api/me/items/enhance`): usa a prévia oficial
  de custo e destrói apenas itens mais fracos do mesmo slot, sem gemas,
  equipados ou favoritos.
- **Status “instável”** no painel e no selo da extensão quando o servidor
  responde 503/erro de rede, sem transformar o soluço em erro permanente.

### Alterado

- **Forja e aprimoramento vêm desligados por padrão**, por serem destrutivos; a
  forja pode falhar e perder os itens. Na atualização, os dois começam
  desligados mesmo que a configuração antiga tivesse a forja ligada.
- **Leituras da API (GET) são repetidas** até 3 vezes com espera crescente e
  respeito ao `Retry-After`. Escritas (POST/PUT) não são repetidas, para não
  duplicar efeitos.
- A busca manual de lives insiste uma vez quando o ranking responde 503 e mostra
  uma mensagem amigável se o serviço continuar indisponível.
- **“Fundir tudo” (VIP) foi removido** da automação; a forja agora usa o caminho
  normal do jogo.

## [1.1.0] - 2026-11-11

A extensão deixa de falar no chat e de escolher as lives sozinha. Agora ela
**procura** as lives quando você pede e abre o chat para **você** mandar o
comando.

### Alterado

- **“Procurar lives” virou uma ação manual.** A lista de lives só é montada
  quando você clica no botão. Atualizar o painel não dispara buscas.
- **A extensão não envia mais mensagens no chat.** Os comandos `$jogar` e `$me`
  saíram da extensão; quem digita é você.
- **Fim da troca automática de live.** A extensão não escolhe nem troca de canal
  por conta própria.
- **A manutenção do inventário continua automática** e passa a ser ligada por um
  interruptor próprio, sem depender de uma live selecionada.
- O status do painel agora distingue `parado`, `ativo`, `aguardando` (sem
  personagem) e `erro`.

### Adicionado

- **Aba reconhecida:** lives que você já tem abertas na Twitch aparecem na lista
  marcadas como **aberta**, mesmo se o ranking falhar.
- **Mensagens de erro do ranking** no painel, explicando quando a API falhou ou
  quando não há live online.
- **Foco automático no campo do chat** ao abrir a live, para digitar o comando
  direto.
- Botão **Manutenção agora** para rodar equipar/gemas/forja uma vez.

### Removido

- Envio automático de `$jogar` e `$me`, heartbeat, detecção de AFK no chat e o
  botão **Testar chat**.
- Opções `heartbeatMin`, `autoSwitch`, `switchHysteresis` e `fallbackClass`.

## [1.0.0] - 2026-11-11

Primeira versão pública.

### Adicionado

- Extensão **Manifest V3** para Chrome/Edge/Brave, sem build e sem dependências
  de runtime.
- **Ranking de lives** por zona, público ou modo equilibrado, combinando
  `/api/ranking/runs` e `/api/ranking/crowds` e confirmando cada canal em
  `/api/ranking/channel/{login}`.
- **Modo econômico** com o popout de chat da Twitch, aba silenciada e proteção
  contra descarte automático.
- **Entrada automática** com `$jogar <classe atual>`, sem trocar a classe do
  personagem.
- **Heartbeat** `$me` configurável (5–25 min) e envio imediato ao detectar AFK
  pelo `lastActiveAt`/`afkMinutes` do personagem.
- **Troca automática de live** com histerese, escolha manual válida por 30
  minutos e tolerância a erros transitórios de ranking (HTTP 503).
- **Equipamento automático** por comparação oficial de FC
  (`/api/me/items/{id}/compare`), testando os melhores candidatos por slot.
- **Gemas:** combinar todas com prévia de custo e respeito ao ouro disponível.
- **Forja:** fundir tudo (VIP) com reserva de ouro e intervalo de 30 minutos.
- **Extras opcionais:** engastar gemas, organizar baús e venda automática (VIP).
- **Recuperação de aba:** recria a aba fechada, recarrega a descartada e volta ao
  canal se a aba navegar para outro site.
- **Painel em PT-BR** com personagem, canal, candidatos, configurações, teste de
  chat e log com timestamp.
- **Documentação:** README, arquitetura, roteiro de validação, checklist de
  release, política de privacidade e segurança.
- **Validação automatizada:** `tools/validate.mjs` e workflow do GitHub Actions.

### Segurança

- Token lido apenas de `localStorage["og.token"]` no domínio do RiftStream e
  guardado em `chrome.storage.local`.
- Sem telemetria, analytics, código remoto ou servidor próprio.
- Permissões mínimas e justificadas no README.
- Aviso explícito sobre a seção 5 dos Termos do RiftStream e o risco de ban.

### Limitações conhecidas

- Forja e venda automática exigem VIP.
- Canais exclusivos da Kick são ignorados.
- Slow mode, followers-only e sub-only podem bloquear o chat.
- A API e os seletores da Twitch são externos e podem mudar sem aviso.
- O navegador precisa permanecer aberto durante o farm.
