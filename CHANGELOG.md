# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto usa versionamento semântico.

## [3.2.2] - 2026-11-20

### Corrigido

- **O chat escrevia `$jump` e não enviava.** O editor do chat da Twitch hoje é
  um Slate (`div[contenteditable]`): o texto entrava no DOM pelo caminho antigo
  (`textContent` + `input`), mas o **estado interno** do editor continuava
  vazio. Resultado: o campo mostrava o comando, o botão de enviar ficava
  desabilitado e o Enter não fazia nada. Agora a inserção usa, nesta ordem,
  **paste** (`ClipboardEvent` com `DataTransfer`), **beforeinput** + `input`,
  **execCommand** e só então o DOM puro — e considera sucesso quando o texto
  aparece no campo.
- **Envio com botão + Enter + reserva.** O botão
  `button[data-a-target="chat-send-button"]` é procurado esperando ficar
  habilitado (até 2,5 s), clicado com a sequência de ponteiro/mouse completa;
  se o campo não esvaziar, dispara Enter (`keydown`/`keypress`/`keyup` com
  `code`, `keyCode` e `composed`); se ainda não sair, clica no botão de novo.
  Só conta como enviado quando o campo **esvazia** — o mesmo sinal que a tela dá.
- **O campo é limpo quando o envio falha**, em vez de deixar o comando preso e
  travar todo envio seguinte como "você está digitando".
- **Diagnóstico no painel:** o motivo da falha agora diz o que aconteceu
  (`texto ficou no campo, envio não saiu (paste)`, `sem campo de chat`,
  `conta deslogada`) em vez do genérico `not_sent`.

### Testes

- Validador ganhou quatro checagens estáticas do `chatkeeper.js` (paste,
  beforeinput, botão de envio e conferência do texto).

## [3.2.1] - 2026-11-20

### Corrigido

- **A mochila enchia de sobras.** Cada raridade/tipo guardava até `precisa`
  itens mesmo com o grupo incompleto (um Épico sozinho ficava reservado para
  sempre). Agora, com a mochila em 85% ou mais, só os grupos **completos**
  ficam presos: as sobras voltam para a alquimia e a venda, e o espaço respira.
- **A contagem de forjas agora é a do jogo.** A engine devolvia um grupo por
  raridade/tipo, mas o badge da aba **Forja** conta fusões: 8 raros são 2
  grupos de 4. O painel mostra o mesmo número do site e forja os dois, um por
  rodada.
- **Contadores do painel mais confiáveis.** `forjados`/`vendidos` entram no
  poll de 2,5 s, então não ficam presos no valor do momento em que o painel
  abriu.
- **Resumo da aba Auto mostra a mochila** (`mochila 31/50`) e avisa quando está
  soltando sobras para a alquimia.

### Testes

- Três testes novos em `tools/test-auto.mjs`: dois grupos do mesmo tipo,
  mochila em pressão soltando os incompletos e mochila folgada guardando o
  grupo incompleto.

## [3.2.0] - 2026-11-20

### Corrigido

- **A forja não forjava os grupos que o próprio jogo mostrava como prontos.**
  A engine agrupava por raridade, tipo **e** uma faixa de 40 níveis. O site
  agrupa só por `${raridade}|${slot}` (3 itens, ou 4 a partir de Épico) e
  aceita qualquer nível. O resultado era o pior possível: o painel do jogo
  dizia “Forja 2”, a extensão dizia “Aguardando itens suficientes” e a mochila
  enchia. Agora a regra é a mesma do jogo.
- **A mochila não entope mais de sobras.** A reserva da forja ficou restrita
  ao grupo da vez (os 3 ou 4 itens mais fortes de cada raridade/tipo); o resto
  volta a ser vendável, reciclável e aprimorável.
- **A forja usa os itens mais fortes do grupo.** O nível do resultado acompanha
  a média dos itens usados, então forjar os mais altos rende mais.
- **O painel mostra quantas forjas estão prontas** no resumo da aba Auto
  (`3 forja(s) pronta(s)`), com o mesmo número do jogo.

### Testes

- Dois testes novos em `tools/test-auto.mjs` (grupo por raridade/tipo com
  níveis distantes e reserva de exatamente `precisa` itens).

## [3.1.0] - 2026-11-20

### Adicionado

- **O painel ◆ mostra o relógio do AFK, não só o do inventário.** Na aba
  **Auto**, abaixo do “Entrar no jogo sozinho”, a linha **Chat anti-AFK** diz
  quantos minutos faltam para o servidor considerar o herói AFK
  (`12 min para o AFK (janela 30 min) · último ping há 9 min`), quando a
  mensagem está em confirmação e quando o comando não teve efeito.
- **Switch e “Enviar agora” do chat no painel.** Desligar o switch para só o
  ping (o “entrar no jogo” continua); o botão força um envio imediato e mostra
  o motivo quando não sai.

## [3.0.1] - 2026-11-20

### Corrigido

- **O botão grande do painel “JOGAR SOZINHO” era o farm, não a entrada no
  jogo.** O nome colidia com o recurso novo e dava a impressão de que clicar ali
  entrava no jogo. Agora ele se chama **FARMAR SOZINHO** e o status diz
  **Farmando**; “Parar de jogar sozinho” virou **Parar o farm**.
- **Entrar no jogo agora tem lugar no painel.** A aba **Auto** mostra o estado
  real (`No jogo: canal`, `Entrando em …`, `Fora do jogo`) e um botão **Entrar
  agora** que força a tentativa sem esperar o tick. O switch liga/desliga a
  entrada automática.
- **“Trabalhando no inventário…” não mente mais.** Quando a rodada passa sem
  nenhuma ação por mais de um minuto, o painel mostra “Nada a fazer agora —
  monitorando o inventário” em vez de simular atividade.
- **“Entrar agora” não acusa erro quando o herói já está em jogo.** No popup,
  `em jogo` e `aguardando confirmação` deixaram de aparecer como falha.

## [3.0.0] - 2026-11-20

### Adicionado

- **Jogar sozinho (entrar no jogo automaticamente).** O herói só conta como
  ativo dentro de um canal, e o servidor perde o vínculo quando o navegador
  fica fechado a noite inteira ou a aba é descartada. Agora, quando
  `/api/me` não tem `currentChannel`, o service worker escolhe a live, abre o
  popout silenciado em segundo plano e manda `$jogar` sozinho. Sem live
  escolhida, usa a melhor do ranking (a mesma estratégia de zona/onda do
  resto do app).
- **Confirmação de entrada em 75 s:** o `$jogar` só é dado como certo quando
  `currentChannel` aparece em `/api/me`. Se o comando não pegar, a extensão
  espera 5 min (20 min depois de três falhas) em vez de repetir no chat.
- **Classe automática ou fixa:** `$jogar` sem argumento (a classe menos cheia)
  ou guerreiro/clérigo/arqueiro escolhido no popup.
- **Raid autônoma (opt-in):** com a opção ligada, o script do chat observa
  apenas mensagens que contenham "raid" e um código numérico e manda
  `$raid CÓDIGO` uma vez por código. Desligada por padrão; não lê nem guarda
  o restante do chat.

### Mudado

- **Upar sozinho ganhou o modo Ótimo.** Em vez de dividir o ouro no chute, a
  engine mede o ganho real de cada ponto com os números da sua ficha — ataque,
  vida efetiva (`vida × (100 + 4×defesa) / 100`), crítico e velocidade — e
  compra o atributo que rende mais por ouro. Força, Vitalidade e Defesa têm
  bônus percentual sobre o total, então o valor muda a cada compra; a escolha
  é refeita a cada ponto. Há três focos: equilibrado, dano e tanque. O botão
  **Automático** do painel agora usa esse modo.
- **Card "Jogar sozinho" no popup:** liga/desliga a entrada automática, define
  a classe, permite escolher a melhor live quando não houver nenhuma e mostra
  `no jogo: canal` / `fora do jogo` com a última falha.

## [2.9.0] - 2026-11-20

### Corrigido

- **Intervalo manual passou a valer de verdade.** Antes o valor escolhido no
  popup (10 a 55 min) era só reserva: com `/api/me` respondendo, a cadência
  continuava sendo o último terço da janela do servidor. Agora qualquer valor
  a partir de 10 min manda na cadência e ignora o relógio — o que o rótulo
  promete.
- **A janela do servidor sobrevive à queda do relógio.** Quando `/api/me`
  falha (token vencido, timeout, rede caída), o modo automático caía num
  intervalo fixo de 20 min. Num VIP de 120 min isso virava um `$jump` a cada
  20 min — seis vezes mais que o necessário. Agora a janela da última leitura
  boa continua valendo e a contagem segue andando pelo carimbo `readAt`.
- **Falha de leitura não é mais retentada a cada minuto.** `401` (token
  vencido) espera 15 min antes da próxima tentativa; os outros erros, 5 min.
  A verificação de efeito continua forçando leitura nova depois de 60 s.
- **O comando não vai mais para o canal errado.** Com o canal atual conhecido,
  `ensureChatTab` só usa aba daquela live — antes caía na primeira aba da
  Twitch, o que não renova o `lastActiveAt` do jogo e ainda aparecia no chat
  de outra live. Sem aba da live certa, abre o popout dela.
- **Bloqueio de comando é por canal.** O comando marcado como inócuo (não
  renovou `lastActiveAt`) ficava bloqueado globalmente: trocar de live herdava
  o bloqueio. Agora cada canal tem a própria lista, que zera no primeiro envio
  confirmado por lá.
- **A contagem do popup desconta o tempo desde a leitura.** Uma leitura velha
  mostrava "AFK em 40 min" congelado.
- **Fila de comandos esgotada não vira loop de 60 s.** Se nenhum dos comandos
  conhecidos renovar `lastActiveAt` naquele canal, a extensão para por 30 min
  em vez de repetir o ping a cada minuto; depois do cooldown, tenta o comando
  configurado de novo e se recupera sozinha se ele voltar a funcionar.

### Adicionado

- **Janela e último erro no card do popup:** `janela 30 min` ou
  `janela 120 min` ao lado da contagem, e o motivo do último envio que não
  saiu (`logged_out`, `not_sent`, `sem efeito: $jump`).

## [2.8.0] - 2026-11-20

### Adicionado

- **Keepalive do chat (anti-AFK).** O servidor só renova `lastActiveAt` quando
  um comando é enviado no chat da live; sem isso, o herói é marcado como AFK
  em `afkMinutes` (30 por padrão, 120 para VIP) e sai do jogo mesmo com a aba
  do site aberta. Agora o service worker envia um comando curto (`$me`) no
  último terço da janela.
  - **Modo automático:** lê `lastActiveAt` e `afkMinutes` em `GET /api/me` e
    só envia quando falta pouco. Sem aba da Twitch, abre o popout do chat em
    segundo plano, silenciado e não descartável.
  - **`$jump` como padrão:** o comando extra do jogo ("o herói dá um pulinho")
    é cosmético, não muda nada na partida e não gera resposta do bot — o ping
    mais discreto possível. Se o bot ignorar, a fila cai para `$pular` e
    depois `$me`.
  - **Verificação de efeito:** 60 s depois do envio a extensão relê
    `lastActiveAt`. Se o relógio não avançou, o comando é marcado como inócuo,
    trocado pelo próximo da fila e reenviado na hora — em vez de repetir um
    ping morto a noite inteira.
  - **Intervalo manual:** de 10 a 55 min, para quem prefere cadência fixa.
  - **Nunca atropela o usuário:** o envio é abortado se houver texto digitado
    na caixa do chat, e o relógio humano zera a contagem.
  - **Verificação de envio:** confere se a caixa esvaziou; se não, tenta
    Enter, limpa o rascunho e registra o motivo (`logged_out`, `no_input`,
    `not_sent`, `user_typing`) no log e no popup.
- **Reinjeção de content script.** `acordarAbas` agora reinjeta a engine
  quando o `sendMessage` falha (extensão atualizada, renderer reiniciado, aba
  congelada) e só recarrega a aba na segunda falha seguida.
- **Reanimação no `onInstalled`:** instalar ou atualizar a extensão reinjeta a
  engine e o keepalive nas abas já abertas, sem precisar de F5.
- **Detecção de retomada:** se o alarme atrasar mais de 3 min (notebook
  suspenso, monitor desligado), a próxima rodada é imediata e registrada.
- **Card "Keepalive do chat" no popup,** com intervalo, comando, último envio
  e a contagem regressiva de AFK lida do servidor.

### Alterado

- Alarme de 30 s para 1 min: a engine já tem ciclo próprio de 3 s; o alarme é
  para acordar o worker e vigiar abas, e 1 min gasta menos bateria.

## [2.7.2] - 2026-11-17

### Corrigido

- **O modo automático não forja mais em conflito com venda, aprimoramento,
  alquimia e transmog.** Antes só o grupo completo era protegido: a venda e a
  reciclagem levavam os grupos incompletos (2/3 ou 3/4), o aprimoramento usava
  esses itens como doadores e o transmog consumia o molde. Agora a forja tem
  prioridade:
  - todo item que pode entrar em um grupo fica reservado, inclusive os quase
    completos;
  - dos itens soltos, o mais alto de cada raridade/slot fica guardado para o
    próximo grupo começar a se formar mesmo quando os drops chegam um de cada
    vez;
  - venda, aprimoramento, alquimia e transmog só usam o que sobra;
  - a forja roda antes dos outros módulos na rodada.
- **Faixa automática por grupo:** a janela de 40 níveis agora é calculada
  separadamente para cada raridade/slot. Uma raridade desligada (Imortal, por
  exemplo) não "puxa" mais a janela e esconde os grupos de nível baixo.
- **Transmog:** só usa o item equipado como alvo, não consome molde reservado
  pela forja nem item mais forte que o alvo, e lembra o que já transmogou para
  não gastar um molde por rodada quando o servidor não devolve o visual.
- **Venda automática do site (VIP):** o modo automático a desliga para o
  autosell do site não vender o material da forja. No modo automático, ao abrir
  o jogo, a extensão também desliga o autosell que tenha ficado configurado
  numa sessão antiga.
- **Status da forja:** mostra quantos itens estão reservados para a forja.

### Adicionado

- **Testes de regressão do modo automático** em `tools/test-auto.mjs`, rodados
  junto com o `tools/validate.mjs`. Cobrem grupos incompletos, venda,
  aprimoramento, transmog, faixa de nível e a rodada completa.

## [2.7.1] - 2026-11-17

### Corrigido

- **O motor podia parar de fazer as coisas e não voltava sozinho.** Uma resposta
  da API que nunca chegava (ou a espera pela trava entre abas) deixava a rodada
  presa para sempre: o painel continuava dizendo "Trabalhando...", mas nada
  acontecia. Agora:
  - cada chamada à API tem prazo de 25 s (é abortada e tentada de novo);
  - a espera pela trava entre abas tem prazo de 8 s — se ela não responder, a
    rodada acontece mesmo assim;
  - uma rodada presa por mais de 4 minutos é liberada automaticamente;
  - o botão **Rodar agora** ▶ destrava o motor mesmo se ele estiver preso numa
    rodada antiga.
- **Aviso honesto no rodapé:** se ficou mais de 2 minutos sem rodada, o painel
  mostra “Sem rodada há Xmin — toque em ▶” em vez de "Trabalhando...".
- **Recuo automático (backoff):** quando o servidor não responde, dá 429 ou fica
  fora do ar, a extensão espera cada vez mais antes de tentar de novo (até 2
  min), em vez de martelar a API a cada 3 s. Isso evita o bloqueio por excesso
  de pedidos, que também deixava o modo automático sem fazer nada.

## [2.7.0] - 2026-11-16

### Adicionado

- **Aba Auto (um botão só):** o botão **Jogar sozinho** liga equipar, forja,
  atributos, gemas, engaste, aprimoramento, venda, alquimia, transmog e baús com
  os ajustes recomendados. Sem configurar nada.
- **Reserva automática:** no modo automático a reserva de ouro passa a ser 10%
  do saldo atual (mínimo 5.000g), recalculada a cada rodada — a conta nunca fica
  zerada.
- **Faixa de forja automática:** a engine escolhe a janela de nível (40 níveis
  abaixo dos melhores grupos forjáveis), em vez de misturar Nv. 5 com Nv. 200.
  Um item alto e sozinho não trava mais a forja dos grupos que existem.
- O botão **Parar de jogar sozinho** desliga o motor e sai do modo automático.
- A aba Auto mostra, ao vivo, o que está sendo feito e o status de cada módulo.

### Corrigido

- Ligar só Alquimia ou Transmog não fazia o motor rodar: essas abas não estavam
  na checagem de "algum módulo ligado" (engine e painel).
- Digitar uma faixa de nível ou uma reserva na mão sai do modo automático, para
  o valor escolhido valer de verdade.

## [2.6.0] - 2026-11-16

### Adicionado

- **Tema do nvd:** paleta vermelho e preto com identidade própria. O painel
  ganha **dois chifres no topo**, brilho de brasa pulsando na borda, faixa
  varrendo o cabeçalho, logo em brasa, abas com glow vermelho e uma entrada de
  aba mais suave — tudo desligado automaticamente com `prefers-reduced-motion`.
- O popup acompanha o tema, com brilho no logo e chifres pequenos.
- O tema aparece no seletor logo depois do Tema da Liah e também no botão ◐.

## [2.5.0] - 2026-11-16

### Adicionado

- **Forja até o Arcano:** Lendário agora vira **Imortal** e Imortal vira
  **Arcano**, sempre em grupos de **4 itens**. As raridades novas aparecem nos
  filtros da aba Forja; Imortal vem desligado por ser destrutivo.
- **Roleta no painel:** como a extensão chama a API direto, a tela do jogo não
  anima. A forja de Lendário+ dispara `rsaf:forja` e o painel mostra o giro, o
  item resultante e a chance informada pelo servidor.
- **Venda que vira alquimia:** com a reciclagem da alquimia ligada, os itens que
  ela reciclaria deixam de ser vendidos. O painel informa quantos itens foram
  para a alquimia em vez da venda.

### Corrigido

- **Resultado da roleta não aparecia:** o giro em andamento saía da fila antes
  da resposta, então o `fim` nunca encontrava o trabalho atual. O painel agora
  acompanha o giro ativo e mostra o resultado.
- Forja de raridades altas não era reconhecida pela engine nem pelo painel.

## [2.4.1] - 2026-11-15

### Corrigido

- **Painel não quebra ao atualizar de versões antigas:** os padrões do painel
  agora incluem `alchemy` e `transmog`, então uma configuração salva antes da
  2.4.0 é mesclada sem erro.
- Contadores e status de alquimia/transmog também entram nos valores padrão do
  painel, evitando `undefined` no primeiro desenho.

## [2.4.0] - 2026-11-15

### Adicionado

- **Alquimia automática:** nova aba ⚗ Alquimia no painel. Recicla itens soltos
  para virar fragmentos, cria peças garantidas quando há fragmentos suficientes
  e sobe o nível de alquimia pagando o ouro quando a barra enche. A reciclagem
  nunca toca em itens equipados, favoritos, com gemas, peças melhores que a
  equipada, no que a forja está juntando ou no que a própria alquimia acabou de
  criar.
- **Transmog automático:** nova aba 🪞 Transmog. Usa o item equipado do slot
  escolhido como alvo e consome o melhor molde disponível do mesmo tipo, sem
  repetir o slot quando o visual já foi aplicado e respeitando o custo em ouro.
- Contadores novos no painel: criados, reciclados, níveis de alquimia e transmogs.
- Endpoints novos validados contra o jogo: `GET /api/me/alchemy`,
  `POST /api/me/alchemy/{destroy,craft,upgrade}` e `POST /api/me/items/transmog`.

### Corrigido

- Formato real da resposta de alquimia (`level`, `xpNeed`, `fragments[].count`,
  `fragNeed` etc.) e conversão do slot do painel para o nome usado pela API.

## [2.3.2] - 2026-11-14

### Alterado

- **Tema da Liah em primeiro** no seletor de temas do painel e do popup.

## [2.3.1] - 2026-11-14

### Alterado

- **Tema da Liah mais exclusivo:** o botão do tema ganhou uma borda neon rosa
  girando em volta, e o painel inteiro recebe um brilho rosa pulsante enquanto o
  tema está ativo. O popup também pulsa o logo em rosa. As animações respeitam
  `prefers-reduced-motion`.

## [2.3.0] - 2026-11-14

### Adicionado

- **Tema da Liah:** novo tema rosa (escuro, com destaques rosa e lilás),
  disponível no seletor de Ajustes e no popup.

## [2.2.1] - 2026-11-14

### Adicionado

- Crédito **made by nvd7** na aba Ajustes do painel, no rodapé do popup, no
  `manifest.json` e no README.

## [2.2.0] - 2026-11-14

### Adicionado

- **12 temas de cor (estilo OpenCode):** Farmline, OpenCode, Meia-noite, Tóquio,
  Drácula, Nórdico, Gruvbox, Rosa, Solarizado, Amanhecer, Papel e Menta clara.
  Cada tema define fundo, superfícies, texto, dois destaques e o modo claro/escuro.
- **Seletor visual de temas** na aba Ajustes, com amostra das cores e o mesmo
  tema aplicado ao painel e ao popup.
- **Botão ◐ do cabeçalho** agora percorre os temas em vez de só alternar claro/escuro.
- Configurações antigas (`theme: "dark"` / `"light"`) são migradas automaticamente
  para `farmline` / `mint`.

## [2.1.4] - 2026-11-13

### Corrigido

- **Venda sem VIP não vendia:** a engine chamava `POST /api/me/items/sell` com
  `{ itemId }`, caminho que não existe na API do jogo. O erro 404 era ignorado,
  então o painel "identificava" os itens mas nunca vendia. Agora usa o endpoint
  individual real, `POST /api/me/items/{id}/sell`.
- **Status da venda enganoso:** na segunda onda da mesma rodada, a mensagem
  "N itens vendidos" era sobrescrita por "0 vendáveis · N protegidos". Agora o
  resultado da venda é preservado quando itens já foram vendidos na rodada.

## [2.1.3] - 2026-11-13

### Corrigido

- **Pergaminho na forja:** o estoque é controlado dentro da rodada. Como o
  pergaminho é gasto na tentativa (dando certo ou não) e a forja faz até 3
  grupos por rodada, a extensão deixava de usá-lo quando acabava, em vez de
  tentar usar um pergaminho que já não existia.

## [2.1.2] - 2026-11-13

### Adicionado

- **Usar pergaminho na forja:** nova opção na aba Forja. Quando ligada, a extensão
  gasta um Pergaminho de Sorte do inventário a cada forja, aumentando a chance de
  sucesso. Se não houver pergaminho, forja sem ele e avisa no status.

## [2.1.1] - 2026-11-13

### Corrigido

- **Diagnóstico honesto da venda:** agora diz exatamente quantos itens estão
  **protegidos pela forja** (e por isso não são vendidos), em vez de mostrar um
  número de "vendáveis" que incluía itens que a forja está juntando.

## [2.1.0] - 2026-11-13

### Corrigido

- **Forja e venda finalmente rodam na mesma rodada.** A rodada antiga usava uma
  ordem fixa com curto-circuito: equipar e aprimorar consumiam todas as ações e
  a forja e a venda nunca eram chamadas. Agora cada módulo ligado tenta **uma
  ação por onda**, com uma segunda onda, e nenhum módulo “mata” o outro.
- **Venda individual sem VIP** com padrão **sem limite de nível** (`9999`) e sem
  a opção “Desligado” no seletor de raridade, que era a causa mais comum de a
  venda parecer parada. A venda também **não vende o que a forja está juntando**.
- **Forja mais rápida:** forja **até 3 grupos por rodada** e mostra quantos
  grupos estão prontos, em vez de esperar um ciclo por item.
- **Comparação de itens:** item que o servidor não reconhece mais (4xx) deixa de
  travar a forja e é apenas ignorado.

### Alterado

- **Interface totalmente refeita.** O painel agora é um **dock vertical**: um
  trilho de módulos à esquerda e a área de conteúdo à direita, com identidade
  própria (paleta verde-menta/ciano, números em fonte monoespaçada, ticker de
  rodada). Não é mais o visual da extensão original com abas douradas.
- Novo indicador **“rodada há Ns”** e botão **rodar** no rodapé para forçar uma
  rodada na hora.
- Diagnóstico na aba Base: **grupos de forja prontos** e **itens vendáveis**.
- Ligar um módulo com o motor desligado **liga o motor junto**, evitando o
  cenário “marquei tudo e não acontece nada”.

## [2.0.2] - 2026-11-13

### Adicionado

- **Importação automática das versões anteriores:** ao abrir o jogo pela
  primeira vez, a extensão lê as configurações da v1.3 (`rsaf_state_v1`) e da
  extensão “Rift Auto” (`forjaAuto`, `upAuto`, `gemasAuto`, `equiparAuto`,
  `roletaRapida`) e as converte para o formato novo.
- **Contadores preservados:** forjados, perdidos, equipados, gemas, gasto e
  níveis de atributos também são importados.
- A importação roda uma única vez e nunca sobrescreve uma configuração já
  existente.

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
