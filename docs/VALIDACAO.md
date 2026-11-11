# Validação supervisionada

Este roteiro cobre o que o `tools/validate.mjs` **não** consegue testar: login
real, chat da Twitch e endpoints autenticados do RiftStream. Rode em uma conta
alternativa, com o navegador visível e o log do painel aberto.

> [!WARNING]
> Não publique prints com o token, o nome da sua conta ou dados de outros
> jogadores. O token fica em `localStorage["og.token"]` e em
> `chrome.storage.local`; nunca o cole em issues.

## 1. Instalação e carregamento

- [ ] `node tools/validate.mjs` termina com **“Tudo certo”**.
- [ ] `chrome://extensions` mostra a extensão sem erros.
- [ ] O ícone aparece na barra e o painel abre em 400 px.
- [ ] O painel mostra **PARADO** antes de iniciar.
- [ ] Recarregar a extensão não apaga as configurações salvas.

## 2. Login e token

- [ ] `riftstream.com.br/character` está logado com a Twitch.
- [ ] Ao abrir o painel, `hasToken` fica verdadeiro (personagem ou “sem
  personagem” em vez de “sem login”).
- [ ] Fazer logout no site e reabrir o painel mostra “sem login detectado”.
- [ ] Fazer login de novo e reiniciar o AutoFarm volta a funcionar.

## 3. Ranking (não precisa de personagem)

- [ ] **Atualizar** lista pelo menos uma live online.
- [ ] Lives offline não aparecem.
- [ ] Canais só da Kick não aparecem.
- [ ] Mudar a estratégia reordena a lista de forma coerente.
- [ ] Clicar em um candidato abre o chat daquele canal e o destaca em verde.
- [ ] A escolha manual permanece por 30 minutos (a menos que a live caia).

## 4. Chat da Twitch

- [ ] A aba abre em `twitch.tv/popout/{canal}/chat?popout=` no modo econômico.
- [ ] A aba fica silenciada quando **Silenciar aba** está marcado.
- [ ] **Testar chat** (em Configurações) envia `$me` e o campo é limpo.
- [ ] O log registra **“Teste de chat enviado ($me)”**.
- [ ] Sem login na Twitch, o log explica que é preciso entrar.
- [ ] Em um canal com slow mode/followers-only, o log mostra o motivo da recusa.

## 5. Entrada e heartbeat

- [ ] **INICIAR AUTOFARM** envia `$jogar <classe atual>`.
- [ ] O personagem aparece em `currentChannel` com o login do canal.
- [ ] O log mostra **“Entrou em … com $jogar …”**.
- [ ] Com `heartbeatMin = 5`, o `$me` é enviado no intervalo (acompanhe o log).
- [ ] Forçar AFK (ficar sem comandos além do limite) dispara `$me` antes do
  próximo heartbeat.
- [ ] Fechar a aba da Twitch faz a extensão recriá-la no ciclo seguinte.
- [ ] Navegar a aba para outro site faz a extensão voltar ao canal atual.

## 6. Manutenção autenticada

Execute **Manutenção** uma vez com o personagem carregado.

- [ ] Itens melhores são equipados e o log mostra o ganho de FC.
- [ ] Itens piores **não** são equipados (compare `power` × `newPower`).
- [ ] Com 3 gemas iguais, o “combinar todas” executa e o custo aparece no log.
- [ ] Sem ouro suficiente, o log informa o custo e não combina.
- [ ] Com VIP, “fundir tudo” executa e informa `fusions`/`cost`.
- [ ] Sem VIP, a forja é desativada com aviso claro.
- [ ] Engaste só acontece com gema de tier ≥ 2 e espaço livre no item.
- [ ] Organizar baús roda no máximo a cada 6 horas.
- [ ] Venda automática aplica raridade/nível (VIP) e é restaurada ao desligar.

## 7. Resiliência

- [ ] Fechar e reabrir o navegador mantém `running = true` e o farm volta.
- [ ] Deixar o service worker dormir (aguardar alguns minutos) não interrompe o
  ciclo; o alarme acorda o worker.
- [ ] Simular rede lenta/offline: o log registra o erro e o farm se recupera.
- [ ] Um `503` isolado no ranking **não** troca de canal.
- [ ] A live atual cair faz a extensão escolher outra no próximo ciclo.
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
- Envio de mensagens no chat (slow mode, followers-only, sub-only).
- Endpoints autenticados do RiftStream e regras de VIP.
- Mudanças de layout/API do site.

Esses itens exigem validação manual e devem ser repetidos a cada release que
toque em chat, ranking ou manutenção.
