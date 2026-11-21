# Validação supervisionada

Este roteiro cobre o que o `tools/validate.mjs` **não** testa: login real,
abertura de chat e endpoints autenticados do RiftStream. Rode em uma conta
alternativa, com o navegador visível.

> [!WARNING]
> Não publique prints com o token, o nome da sua conta ou dados de outros
> jogadores. O token fica em `localStorage["og.token"]`; nunca o cole em issues.

## 1. Instalação e carregamento

- [ ] `node tools/validate.mjs` termina com **“Tudo certo”**.
- [ ] `chrome://extensions` mostra a extensão sem erros.
- [ ] O popup abre e mostra **parado**.
- [ ] Ao abrir `riftstream.com.br/character`, o painel **◆** aparece no canto.
- [ ] O painel pode ser arrastado, minimizado, fechado e reaberto pela bolinha.
- [ ] Recarregar a extensão não apaga as configurações.

## 2. Login e token

- [ ] O site está logado com a Twitch.
- [ ] O popup mostra o personagem após uma rodada (ou “sem personagem”).
- [ ] O painel mostra nome, classe, nível, ouro e FC.
- [ ] Fazer logout e recarregar mostra “Entre na sua conta do jogo”.
- [ ] Fazer login de novo e usar **Rodar agora** volta a funcionar.

## 3. Procurar lives (manual)

- [ ] Abrir o popup não dispara busca sozinho.
- [ ] **PROCURAR LIVES** lista pelo menos uma live online.
- [ ] Lives offline e canais só da Kick não aparecem.
- [ ] Mudar a ordenação reordena a lista.
- [ ] Uma live já aberta na Twitch aparece no topo como **aberta**.
- [ ] O público usa o maior valor entre ranking e detalhe (não fica preso em 60).

## 4. Abrir a live (sem enviar nada)

- [ ] Clicar numa live abre o popout de chat (ou a live completa).
- [ ] A aba abre ativa, silenciada (se marcado) e com o campo focado.
- [ ] **Nenhuma mensagem aparece no chat.**
- [ ] Você consegue digitar `$jogar <classe>` e enviar pelo seu teclado.

## 5. Painel do jogo

- [ ] Cada aba (Início, Forja, Atributos, Gemas, Venda, Ajustes) abre sem
      estourar a altura da tela.
- [ ] O tema **Claro/Escuro** muda na hora e continua após F5.
- [ ] O **tamanho da fonte** muda na hora e continua após F5.
- [ ] A **roleta rápida** (2×/4×/8×) acelera só a animação durante uma roleta.
- [ ] Fechar o painel e clicar na bolinha reabre na mesma aba.
- [ ] Digitar num campo do painel não aciona atalhos do jogo.

## 6. Manutenção automática

Ligue **Farm automático** e marque os módulos desejados.

- [ ] O badge mostra `ON` e o status `Ligado`.
- [ ] **Rodar agora** no popup força uma rodada mesmo com o farm desligado.
- [ ] Itens melhores são equipados; o log do módulo mostra o ganho de FC.
- [ ] Itens piores **não** são equipados.
- [ ] Com 3 gemas iguais, o “combinar todas” executa e o custo aparece.
- [ ] Sem ouro suficiente, a ação para e informa o custo.
- [ ] **Atributos (dividir ouro)** gasta no atributo marcado que recebeu menos.
- [ ] **Atributos (até o nível)** respeita as metas e para ao concluir.
- [ ] A **reserva de ouro** nunca é ultrapassada.
- [ ] **Forja** só usa itens dentro da faixa mín./máx. de nível.
- [ ] A forja **não** usa itens melhores que o equipado.
- [ ] Com a forja ligada, **venda, aprimoramento, alquimia e transmog** não
      consomem itens reservados para a forja (inclusive grupos incompletos).
- [ ] Deixar o modo automático ligado com poucos drops: a forja junta os grupos
      aos poucos em vez de a venda/alquimia levar os itens soltos.
- [ ] **Venda individual** vende só itens abaixo dos filtros, nunca equipados,
      favoritos, com gemas ou reservados para a forja.
- [ ] **Engaste** só acontece com gema tier ≥ 2 e encaixe livre.
- [ ] **Aprimorar** mostra o custo e usa só doadores mais fracos.
- [ ] **Organizar baús** roda no máximo a cada 6 horas.
- [ ] **Venda em lote (VIP)** configura raridade/nível; sem VIP, avisa e desliga.
- [ ] Com duas abas do jogo abertas, só uma executa a rodada (sem ações
      duplicadas).

## 7. Keepalive do chat (anti-AFK)

- [ ] O card mostra `AFK em N min` e a `janela` lida do servidor (30 ou 120).
- [ ] **Enviar agora** faz o `$jump` aparecer no chat e o herói pular no overlay.
- [ ] Um minuto depois, o log confirma o envio ou troca para `$pular`/`$me` com
      o aviso “não renovou o relógio do jogo”.
- [ ] Com todas as abas da Twitch fechadas, a extensão abre o popout sozinha,
      silenciada, sem roubar o foco.
- [ ] Digitar na caixa do chat quando o envio está vencido aborta com
      `user_typing` e zera a contagem.
- [ ] Intervalo manual em 10 min envia a cada 10 min, ignorando o relógio.
- [ ] Deslogar do site deixa `relógio: HTTP 401` no card e a cadência continua
      usando a janela da última leitura (sem tempestade de requisições).
- [ ] Trocar de live não herda o comando bloqueado na live anterior.

## 8. Jogar sozinho (entrada automática)

- [ ] Com o card ligado e o herói **fora de jogo**, a extensão manda `$jogar`
      na live selecionada e o log mostra “enviado; confiro o herói em 75 s”.
- [ ] No painel ◆, aba **Auto**, o switch "Entrar no jogo sozinho" reflete a
      configuração e o botão **Entrar agora** dispara na hora; o botão grande
      diz **FARMAR SOZINHO** e não entra no jogo.
- [ ] A linha **Chat anti-AFK** mostra os minutos restantes e o último ping;
      o switch desliga só o ping e **Enviar agora** manda na hora.
- [ ] O número de forjas prontas no painel é o **mesmo** que a aba **Forja**
      do jogo mostra; se o jogo diz 2, o painel diz 2 e a rodada forja.
- [ ] Em até 75 s, `/api/me` traz `currentChannel` e o card muda para
      `no jogo: canal`.
- [ ] Sem nenhuma live escolhida, a opção “escolher a melhor live” abre o
      popout silenciado e usa a primeira da estratégia configurada.
- [ ] Classe fixa: `$jogar arqueiro`, por exemplo; automática: `$jogar` puro.
- [ ] Quando o comando não pega, o log registra a falha e a próxima tentativa é
      em 5 min (20 min depois de três).
- [ ] A live que ignorou o comando fica de fora por 25 min no modo automático.
- [ ] Desligar o card não impede o farm; o keepalive do chat continua normal.
- [ ] Com “raid” ligada, uma mensagem com `raid` + código gera `$raid CÓDIGO`
      uma vez por código; com a opção desligada, nada é observado.

## 9. Resiliência

- [ ] Desligar o farm interrompe o ciclo e limpa o badge.
- [ ] Fechar e reabrir o navegador mantém a configuração.
- [ ] Deixar a aba em segundo plano não interrompe (o alarme envia a rodada).
- [ ] Simular offline: o status mostra o erro e a extensão se recupera.
- [ ] Em `401`, a engine tenta redescobrir a API e, se persistir, pede login.
- [ ] Em `503`, o grupo afetado é pausado e tentado de novo depois.
- [ ] Fechar a aba do jogo não recria a aba sozinho.

## 10. Regressão antes de release

- [ ] `node tools/validate.mjs`.
- [ ] `node --check` em todos os JS (o validador já faz).
- [ ] Testar em Chrome **e** Edge, se possível.
- [ ] Conferir o README renderizado (imagens, tabelas e links).
- [ ] Conferir que nenhum token, log, print ou dado pessoal entrou no commit.

## Como coletar evidências

1. Copie as últimas linhas do **Log** do popup.
2. No painel, anote o status do módulo que falhou.
3. Em `chrome://extensions`, abra **Inspecionar views → service worker** e copie
   apenas os erros (sem o token).
4. Informe navegador, versão, sistema, canal e horário aproximado.

## O que não é testável em CI

- Login real na Twitch (CAPTCHA, 2FA e cookies).
- Ranking público fora do ar ou com resposta inesperada.
- Endpoints autenticados do RiftStream e regras de VIP.
- Mudanças de layout/API do site.
