# Validação supervisionada

Este roteiro cobre o que o `tools/validate.mjs` **não** consegue testar: login
real, abertura de chat e endpoints autenticados do RiftStream. Rode em uma conta
alternativa, com o navegador visível e o log do painel aberto.

> [!WARNING]
> Não publique prints com o token, o nome da sua conta ou dados de outros
> jogadores. O token fica em `localStorage["og.token"]` e em
> `chrome.storage.local`; nunca o cole em issues.

## 1. Instalação e carregamento

- [ ] `node tools/validate.mjs` termina com **“Tudo certo”**.
- [ ] `chrome://extensions` mostra a extensão sem erros.
- [ ] O ícone aparece na barra e o painel abre em 400 px.
- [ ] O painel mostra **PARADO** e “nunca buscou” antes de qualquer ação.
- [ ] Recarregar a extensão não apaga as configurações salvas.

## 2. Login e token

- [ ] `riftstream.com.br/character` está logado com a Twitch.
- [ ] Ao abrir o painel, o personagem aparece (ou “sem personagem carregado”).
- [ ] `hasToken` fica verdadeiro depois de visitar o site.
- [ ] Fazer logout no site e reabrir o painel mostra “sem login detectado”.
- [ ] Fazer login de novo e clicar em **Manutenção agora** volta a funcionar.

## 3. Procurar lives (manual)

- [ ] Nada acontece sozinho: abrir o painel não dispara busca.
- [ ] **PROCURAR LIVES** mostra pelo menos uma live online.
- [ ] Lives offline não aparecem.
- [ ] Canais só da Kick não aparecem.
- [ ] Mudar a ordenação (zona/público/equilibrado) reordena a lista.
- [ ] Com uma live aberta numa aba, ela aparece no topo marcada como
      **aberta**.
- [ ] O texto “busca às HH:MM” aparece depois da busca.
- [ ] Com o ranking indisponível, o painel mostra o motivo em vez de uma lista
      vazia silenciosa.

## 4. Abrir a live (sem enviar nada)

- [ ] Clicar numa live abre uma aba no chat (modo econômico) ou na live
      completa.
- [ ] A aba abre ativa e o campo do chat já está focado.
- [ ] A aba fica silenciada quando **Silenciar aba da live** está marcado.
- [ ] **Nenhuma mensagem aparece no chat** depois de abrir a live.
- [ ] O log mostra “Abrindo chat de … Envie o comando no chat.”
- [ ] **Abrir live atual** abre a live completa do canal escolhido.
- [ ] Você consegue digitar `$jogar <classe>` e enviar pelo seu teclado.

## 5. Personagem

- [ ] Depois do `$jogar`, o personagem aparece no painel com nome, classe,
      nível, FC, ouro e canal.
- [ ] Ficar muito tempo sem comandos marca **AFK** no cartão do personagem.
- [ ] Sem personagem, o status mostra **aguardando** (não “erro”).

## 6. Manutenção automática

Ligue **Manutenção automática do inventário**.

- [ ] O status do painel passa para **ativo** e o badge mostra `ON`.
- [ ] **Manutenção agora** roda uma vez e informa o que fez no log.
- [ ] Itens melhores são equipados e o log mostra o ganho de FC.
- [ ] Itens piores **não** são equipados (compare `power` × `newPower`).
- [ ] Com 3 gemas iguais, o “combinar todas” executa e o custo aparece no log.
- [ ] Sem ouro suficiente, o log informa o custo e não combina.
- [ ] **Gastar ouro em atributos** sobe vários níveis rapidamente (rodadas de até
      5) e respeita o ouro reservado.
- [ ] **Forjar** (ligado no menu) roda em todo ciclo de ~30 s, monta grupos de
      3–4 itens iguais, processa até 3 grupos em paralelo, informa o resultado no
      log e não usa “fundir tudo”/VIP.
- [ ] **Aprimorar** (ligado no menu) mostra o custo na prévia e destrói apenas
      doadores mais fracos do mesmo slot, também a cada ~30 s, com prévias em
      paralelo.
- [ ] Equipar, forjar e aprimorar começam juntos e o log mostra as ações sem uma
      etapa esperar a outra terminar.
- [ ] Forja e aprimoramento vêm **desligados** por padrão.
- [ ] Ligar forja/aprimoramento dispara uma execução imediata, sem esperar a
      manutenção periódica.
- [ ] O público das lives usa o ranking quando ele é maior que 60 (ex.: uma live
      com 200+ pessoas não aparece como 60).
- [ ] Engaste só acontece com gema de tier ≥ 2 e espaço livre no item.
- [ ] Organizar baús roda no máximo a cada 6 horas.
- [ ] Venda automática aplica raridade/nível (VIP) e é restaurada ao desligar.

## 7. Resiliência

- [ ] Desmarcar a manutenção para o ciclo e o badge some.
- [ ] Fechar e reabrir o navegador mantém `running` e a manutenção volta.
- [ ] Deixar o service worker dormir (aguardar alguns minutos) não interrompe o
      ciclo; o alarme acorda o worker.
- [ ] Simular rede lenta/offline: o log registra o erro e a extensão se
      recupera.
- [ ] Em `503 Service Unavailable`, o status fica **instável** (âmbar), a busca
      manual insiste rápido e o painel não mostra erro fatal.
- [ ] Forja e aprimoramento repetem em 503 e confirmam no inventário antes de
      repetir, sem aplicar duas vezes.
- [ ] Fechar a aba da Twitch não recria a aba sozinho (só limpa o estado).
- [ ] Token expirado (`401`) limpa a sessão e pede login novamente.

## 8. Regressão antes de release

- [ ] `node tools/validate.mjs`.
- [ ] `node --check` em todos os arquivos JS (o validador já faz).
- [ ] Testar em Chrome **e** Edge, se possível.
- [ ] Testar com o painel aberto e fechado.
- [ ] Conferir o README renderizado (imagens, tabelas e links).
- [ ] Conferir se nenhum log, token, print ou dado pessoal entrou no commit.

## Como coletar evidências

1. Abra o painel e copie as últimas linhas do **Log**.
2. Em `chrome://extensions`, clique em **Inspecionar views → service worker** e
   copie apenas erros (sem o token).
3. Se o problema for visual, anexe um print do painel ou do chat, cobrindo
   nomes de usuário se necessário.
4. Informe navegador, versão, sistema, canal e horário aproximado.

## O que não é testável em CI

- Login real na Twitch (CAPTCHA, 2FA e cookies).
- Ranking público fora do ar ou com resposta inesperada.
- Endpoints autenticados do RiftStream e regras de VIP.
- Mudanças de layout/API do site.

Esses itens exigem validação manual e devem ser repetidos a cada release que
toque em ranking, abertura de aba ou manutenção.
