# Regularização do Preview com a main

## Diagnóstico

- Projeto Vercel: `celeriflow-dev/celeriflow-guarama`.
- Branch de produção configurada: `main`.
- Último preview com erro: `dpl_G2jty9x3gevpvUhQsrc64cGM1StE`, da branch `eduardo-07112026`, commit `29e7b1aa`.
- Causa confirmada nos logs: diretiva `"use client"` após um import em `Saude15Client.tsx`. A correção já estava integrada à `main` no commit `2744bee9`.
- A `main` também recebeu `2bebc2b7`, com evidências de publicação; o preview ainda apontava para o commit anterior à integração.
- Autenticação Firebase, identificação da instância, acesso Blob e configuração GED estavam restritos ao ambiente Production, embora o banco já estivesse configurado para Preview e Production.

## Ajustes de configuração aplicados

Os valores foram preservados na Vercel. Alterado apenas o escopo das configurações necessárias para incluir Preview:

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` e `FIREBASE_PRIVATE_KEY_ID`.
- As seis variáveis `NEXT_PUBLIC_FIREBASE_*` usadas pela aplicação.
- `CELERIFLOW_INSTANCE_ID`, `SYSTEM_ADMIN_NAME` e `SYSTEM_ADMIN_EMAIL`.
- `BLOB_READ_WRITE_TOKEN`, `GED_PROCESSING_RUNTIME`, `GED_SANDBOX_SNAPSHOT_ID` e `SIGNATURE_CENTRAL_PRIVATE_KEY_PEM`.

Criada uma origem pública específica para a branch de preview:

```text
CELERIFLOW_PUBLIC_BASE_URL=https://celeriflow-guarama-git-eduardo-07112026-celeriflow-dev.vercel.app
target=preview
gitBranch=eduardo-07112026
```

A origem pública de produção continua vinculada ao domínio `guarama.celeriflow.com.br`. Configurações de e-mail SES, cron e ator de processamento de RH mantêm seus escopos existentes.

## Alinhamento das branches

A branch `eduardo-07112026` recebe a versão validada da `main` por fast-forward, preservando todos os commits. O push pelo GitHub dispara um novo Preview com o mesmo conteúdo de aplicação da produção.

Para as próximas atualizações dessa branch:

1. Fazer `git fetch origin` e conferir os commits novos de ambas as branches.
2. Integrar a `main` na branch de preview; se houver trabalho exclusivo, resolver o merge e validar os consumidores afetados.
3. Rodar `npm run build` antes de commit/push.
4. Publicar com a identidade GitHub `Robonuvem-dev`.
5. Confirmar o SHA, o ambiente Preview e o estado Ready na Vercel; validar saúde, login e uma rota autenticada pela URL da branch.

O build continua usando `npm run build` nos dois ambientes. A aplicação de migrações permanece no estágio de produção previsto em `scripts/build.mjs`; a atualização de preview não altera o schema.

## Verificação da publicação

`npm run build` concluído com sucesso antes da publicação, incluindo as 17 partições de TypeScript e o build otimizado Next.js.

O status Vercel do commit publicado no GitHub identifica o deployment correspondente. O aceite exige o novo preview `Ready`, associado ao SHA atualizado, e verificações de saúde do banco, login, sessão Firebase e rotas autenticadas de Pastas inteligentes e Modelos. A verificação de referência desses cinco pontos passou na produção em `2026-11-08T17:54:25Z`, com as duas tabelas exibindo 20 registros e sem overflow na janela de 1366 × 768.

Um deployment anterior com erro permanece no histórico. O Preview mantém a proteção de acesso da Vercel já configurada no projeto.
