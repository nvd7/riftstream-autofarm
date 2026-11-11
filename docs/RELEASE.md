# Checklist de release

O projeto usa [versionamento semântico](https://semver.org/lang/pt-BR/):
`MAJOR` para mudanças incompatíveis de configuração/fluxo, `MINOR` para recursos
novos e `PATCH` para correções.

## 1. Preparar a versão

- [ ] A árvore de trabalho está limpa (`git status`).
- [ ] `version` em `manifest.json` foi atualizado.
- [ ] O badge de versão em `README.md` foi atualizado.
- [ ] O `CHANGELOG.md` tem uma seção `[x.y.z] - AAAA-MM-DD` com as mudanças.
- [ ] Nenhum token, log, print ou dado pessoal entrou no commit.
- [ ] As permissões do `manifest.json` continuam mínimas e justificadas no README.
- [ ] `PRIVACY.md` reflete o que a versão realmente armazena e transmite.

## 2. Validar localmente

```powershell
node tools/validate.mjs
```

- [ ] O validador terminou com **“Tudo certo”**.
- [ ] O workflow **validar** passou no commit.
- [ ] A extensão carrega em `chrome://extensions` sem erros.
- [ ] O painel abre e mostra o estado correto.
- [ ] **Testar chat** envia `$me` em uma live de teste.
- [ ] Um ciclo completo de farm foi observado (entrada + heartbeat).
- [ ] Se a mudança tocar em inventário, siga a seção 6 de
  [VALIDACAO.md](VALIDACAO.md).
- [ ] Testou em Chrome e, se possível, Edge.
- [ ] Testou com o modo econômico ligado **e** desligado.

## 3. Publicar

```powershell
git add -A
git commit -m "chore: prepara a versao x.y.z"
git push origin main
git tag -a vx.y.z -m "RiftStream AutoFarm vx.y.z"
git push origin vx.y.z
```

- [ ] O workflow **validar** passou no commit da tag.
- [ ] A tag `vx.y.z` aponta para o commit validado.
- [ ] A release foi criada com as notas da versão e o zip anexado.
- [ ] O zip contém `manifest.json` na raiz da pasta `riftstream-autofarm/`.
- [ ] O **social preview** do repositório foi atualizado com
      `docs/social_preview.png` (Settings → General → Social preview).

### Conteúdo do zip

O pacote de release deve incluir apenas o necessário para carregar a extensão,
mais a documentação:

```text
riftstream-autofarm/
  manifest.json
  background.js
  content/
  popup/
  icons/
  README.md
  LICENSE
  CHANGELOG.md
  PRIVACY.md
```

`docs/`, `.github/` e `tools/` podem ficar de fora do zip; eles são úteis no
repositório, não na instalação.

## 4. Depois da release

- [ ] Baixe o zip da release e carregue em uma pasta limpa.
- [ ] Confirme que a versão aparece em `chrome://extensions`.
- [ ] Rode um ciclo curto de farm e um **Testar chat**.
- [ ] Confira o README e o CHANGELOG renderizados no GitHub.
- [ ] Verifique se banner, screenshot e links abrem.
- [ ] Abra issues para limitações conhecidas que ficaram fora da versão.

## Notas da release

Use o `CHANGELOG.md` como base. Uma nota curta responde:

1. O que mudou para quem usa a extensão?
2. Precisa reconfigurar algo ou refazer login?
3. Quais fluxos ainda exigem validação manual?

Evite prometer detecção perfeita: a API e o chat da Twitch são externos e podem
mudar sem aviso.

## Se algo falhar

- Cancele a release antes de divulgá-la se o workflow falhar.
- Corrija em um commit novo; não reescreva uma tag já distribuída.
- Mova a tag somente enquanto ela não tiver sido divulgada:

```powershell
git tag -f vx.y.z
git push --force origin vx.y.z
```

- Registre a causa e a correção no `CHANGELOG.md`.

## Sobre a Chrome Web Store

A publicação na Chrome Web Store **não** faz parte do fluxo atual. Se um dia for
feita, revise:

- a justificativa de cada permissão (`tabs`, `scripting`, hosts);
- a política de dados (o token é dado de autenticação de terceiros);
- a política de conteúdo da loja para automação de jogos/chat;
- o texto de privacidade e a remoção de qualquer menção a “bypass”.
