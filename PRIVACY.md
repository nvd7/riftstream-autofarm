# Política de privacidade

O **RiftStream AutoFarm** é uma extensão local. Esta política descreve o que ela
acessa, onde guarda e para onde envia dados.

## Resumo

- **Não há telemetria, analytics ou anúncios.**
- **Nenhum dado é enviado para servidores do projeto.**
- O token de login e as configurações ficam apenas no seu navegador.
- As únicas conexões de rede são com o RiftStream, a API oficial do site e a
  Twitch.

## Dados acessados

| Dado | Finalidade | Onde fica |
|---|---|---|
| Token `og.token` | Autenticar nas APIs do RiftStream | `chrome.storage.local` |
| Personagem, itens, gemas, ouro, canal | Decidir entrada e manutenção | Memória/estado local |
| Configurações do painel | Controlar o comportamento do farm | `chrome.storage.local` |
| Log de ações | Diagnóstico e transparência | `chrome.storage.local` |
| Mensagens enviadas no chat | `$jogar` e `$me` | Enviadas à Twitch |

O token é lido do `localStorage` de `riftstream.com.br`, no seu próprio
navegador, e usado no cabeçalho `Authorization: Bearer` das chamadas à API
oficial. Ele **não** é enviado ao popup, a páginas de terceiros ou a qualquer
servidor do projeto.

## Rede

A extensão só se comunica com:

- `https://riftstream.com.br` — leitura do token;
- `https://z6ywq6r3ub.execute-api.us-east-1.amazonaws.com` — API oficial usada
  pelo próprio site do RiftStream;
- `https://www.twitch.tv` — carregamento do chat e envio das mensagens.

Não há endpoint próprio, coleta de métricas, crash reporting ou atualização
remota de código.

## Armazenamento e retenção

- Os dados ficam em `chrome.storage.local`, no perfil do navegador.
- O log é limitado às **80 entradas mais recentes** e pode ser limpo no painel.
- Desinstalar a extensão remove token, configurações, timers e log.
- Fazer logout no site e reiniciar o AutoFarm também limpa o token local.

## Permissões

| Permissão | Uso |
|---|---|
| `storage` | Guardar token, configurações e log |
| `alarms` | Manter o ciclo de 1 minuto |
| `tabs` | Abrir/reutilizar a aba da Twitch e impedir seu descarte |
| `scripting` | Ler o token no site se o content script não estiver pronto |
| Hosts do RiftStream/API | Autenticação e chamadas à API oficial |
| Host da Twitch | Digitar e enviar mensagens no chat |

## Compartilhamento

O projeto não vende, aluga nem compartilha dados. As interações com o RiftStream
e a Twitch são regidas pelas políticas dessas plataformas. Se você optar por
usar webhooks ou outras ferramentas junto com a extensão, isso é
responsabilidade sua.

## Segurança

Para reportar uma falha de segurança, siga [SECURITY.md](SECURITY.md). Nunca
publique o token (`og.token`) em issues, prints ou logs.

## Alterações

Mudanças nesta política serão registradas no [CHANGELOG.md](CHANGELOG.md). A
versão publicada no repositório é a fonte de verdade.

## Contato

Dúvidas sobre privacidade podem ser abertas em
<https://github.com/nvd7/riftstream-autofarm/issues> — **sem dados sensíveis**.
