# Handoff — verificadores SQL e lista compacta

## Correções concluídas

- `scripts/sql-oracle.ts`: helper retornado `count` renomeado para `scalarCount`. Preservados SQL explícito, parâmetros, leitura somente, conversão por OID e validação de `count(*)::int AS count` numérico.
- Consumidores atualizados após busca global de imports/usos de `openReadOnlySqlOracle` e `SqlOracle`: `sql-oracle-master-data.ts` e `drizzle-verify-{audit,construction-links,environment,master-data,notifications,registry,sanitation,system-administration}.ts`.
- Os demais consumidores do oráculo não chamavam o helper `count`; nenhuma referência antiga de chamada `oracle.count(...)` ou `connection.count(...)` permanece nesses verificadores.
- `scripts/verify-compact-list.tsx`: contagem Playwright da segunda página expressa por `page.evaluate(() => document.querySelectorAll("tbody tr").length)`, mantendo exatamente a assertiva de 20 linhas e as esperas existentes. Consistente com as demais contagens DOM do mesmo script.
- Gate e testes do gate preservados, sem novas exceções.

## Checks leves executados

- ESLint direcionado aos 11 arquivos alterados: PASS, sem saída.
- Parse TypeScript/TSX dos 11 arquivos: PASS.
- `findLegacyDatabaseReferences` original aplicado diretamente aos ASTs dos mesmos 11 arquivos: PASS, zero ocorrências.
- Busca por chamadas antigas do helper nos verificadores: nenhuma.
- `git diff --check` direcionado: PASS (somente avisos de normalização LF/CRLF do Git).

## Integração final

Não executados runtime SQL, Playwright, suíte, typecheck global, build ou instalação de dependências. Suíte/build e gate global ficam para a rodada final da sessão principal, após integração dos outros agentes. Nenhum switch/reset/commit/push realizado.
