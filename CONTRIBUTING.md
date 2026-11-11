# Contribuindo com o RiftStream AutoFarm

Obrigado pelo interesse! O projeto é uma extensão de navegador sem build, com
interface em português e foco em transparência, permissões mínimas e código
simples de auditar.

## Antes de abrir uma issue

1. Leia a seção **Solução de problemas** do [README](README.md).
2. Rode a validação e anexe o resultado:

   ```powershell
   node tools/validate.mjs
   ```

3. Copie as últimas linhas do **log do painel** e informe navegador, versão da
   extensão e canal usado.
4. **Remova o token e dados pessoais** de qualquer log, print ou gravação.

## Ambiente de desenvolvimento

Não há `npm install`, bundler ou etapa de build. Requisitos:

- Chrome, Edge ou Brave recente;
- Node.js 20+ (apenas para `tools/validate.mjs`).

```powershell
git clone https://github.com/nvd7/riftstream-autofarm.git
cd riftstream-autofarm
node tools/validate.mjs
```

Para carregar:

1. `chrome://extensions` → **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecione a pasta do projeto.
3. Após editar, clique em **recarregar** no cartão da extensão.
4. Recarregue a aba da Twitch para reinjetar o content script.

## Padrões do projeto

- Interface, log e documentação em **português do Brasil**.
- JavaScript puro, sem dependências de runtime e sem framework.
- Indentação de **2 espaços**, ponto e vírgula e aspas duplas (como no código).
- Não adicione código remoto, `eval`, telemetria ou analytics.
- Mantenha as permissões do `manifest.json` no mínimo necessário.
- **A extensão não pode enviar mensagens no chat.** Manter a busca de lives e a
  abertura de aba manuais; o `$jogar`/`$me` é sempre digitado pelo usuário.
- Preserve a lista de lives com as abas abertas no topo e o tratamento de VIP.
- O token nunca deve ir para o popup, para a página ou para logs.
- Mudanças de comportamento precisam atualizar README, CHANGELOG e, se
  aplicável, `docs/ARQUITETURA.md`.

## Testes antes do pull request

```powershell
node tools/validate.mjs
```

O validador confere:

- JSON e campos obrigatórios do `manifest.json`;
- existência dos arquivos referenciados (scripts, popup, ícones);
- sintaxe de todos os JS com `node --check`;
- links relativos da documentação;
- caracteres inválidos/encoding.

Testes manuais que dependem de conta e chat estão em
[docs/VALIDACAO.md](docs/VALIDACAO.md). Descreva no PR o que foi testado.

## Commits e pull requests

- Use mensagens curtas e descritivas, por exemplo:
  - `feat: adiciona reserva de ouro por raridade`
  - `fix: mantém o canal em erro 503 do ranking`
  - `docs: atualiza o roteiro de validação`
- Um PR deve explicar o problema, a solução e como validou.
- Mudanças no ranking/abertura de live devem incluir evidências (log ou print) sem dados
  pessoais.
- Não inclua arquivos gerados, zips, logs ou capturas locais no commit.

## Licença

Ao contribuir, você concorda que a contribuição será distribuída sob a licença
MIT deste repositório.
