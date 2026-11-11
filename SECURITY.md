# Segurança

## Versões suportadas

| Versão | Suporte |
|---|---|
| 1.x | Sim |
| < 1.0 | Não |

## Como reportar

Não abra uma issue pública para falhas de segurança. Use o recurso **Report a
vulnerability** do GitHub (Security Advisories) em:

<https://github.com/nvd7/riftstream-autofarm/security/advisories/new>

Se o recurso não estiver disponível, abra uma issue **sem detalhes sensíveis** e
peça um canal privado.

Inclua, quando possível:

- versão da extensão (`chrome://extensions`);
- navegador e versão;
- passos para reproduzir;
- impacto observado (ex.: vazamento de token, acesso indevido, injeção);
- trechos de log **com o token removido**.

Nunca envie `og.token`, cookies da Twitch, prints da conta ou o conteúdo de
`chrome.storage.local`.

## Escopo

Falhas no código da extensão, por exemplo:

- exposição do token a páginas ou extensões de terceiros;
- injeção de HTML/JS no painel;
- permissões além do necessário;
- execução de código remoto;
- bypass de validações de origem das mensagens.

Fora do escopo:

- banimentos, suspensões ou restrições de conta por automação;
- mudanças na API do RiftStream ou no chat da Twitch;
- limitações de slow mode, followers-only, VIP ou 2FA;
- problemas causados por outras extensões ou pelo navegador.

## Boas práticas para usuários

- Instale apenas a partir deste repositório.
- Revise o código antes de carregar uma versão modificada.
- Não compartilhe a pasta do perfil do navegador nem o `chrome.storage.local`.
- Remova a extensão se a conta for comprometida e troque a senha da Twitch.

## Resposta

O projeto é mantido por uma pessoa, sem SLA. Relatos são analisados assim que
possível; correções relevantes são publicadas como patch e registradas no
[CHANGELOG.md](CHANGELOG.md).
