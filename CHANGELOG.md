# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto usa versionamento semântico.

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
