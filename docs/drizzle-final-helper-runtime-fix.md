# Correção do bloqueio na suíte tax final helpers

## Causa e reprodução

O teste `tests/drizzle-tax-final-helpers.test.ts` abria uma transação em
`connection.pool.connect()`, adquiria o advisory lock da autoridade SQL e aguardava
uma inspeção por outra conexão antes de executar o rollback do primeiro cliente.

Os sockets da fixture compartilham uma única sessão PGlite. O
`QueryQueueManager` de `@electric-sql/pglite-socket` só processa mensagens do dono
enquanto essa sessão está em transação. O `BEGIN` da inspeção fica na fila,
impedindo que ela alcance o `pg_try_advisory_xact_lock` do core. O rollback do dono
depende da inspeção terminar: espera circular no transporte da fixture. Os
timeouts SQL configurados pelo core não resolvem uma mensagem que ainda não
alcançou o PostgreSQL.

Reprodução isolada antes da correção: processo encerrado por timeout externo de
60 segundos; seis subtestes até `worker` passaram, sem resultado do subteste de
wrappers. A implementação da fila instalada confirma o mecanismo da espera.

## Correção e cobertura

- A suíte PGlite mantém os asserts de preview, noop sincronizado, recibos,
  proveniência, dependências ausentes, bloqueio de SQL futuro e seed.
- A contenção foi movida para `tests/drizzle-tax-migration-lock.test.ts`, usando
  `createPlanningPostgresBackend` e duas conexões PostgreSQL reais em
  `127.0.0.1/planning_s2`.
- O teste exige PIDs de backend distintos e o advisory lock exportado pelo core.
  Verifica `MigrationBlockedError` com código `MIGRATION_LOCK_BUSY` na inspeção
  direta e nos wrappers HR/Cemetery, tanto preview quanto apply.
- Verifica que a inspeção não cria relações da autoridade e que o rollback do
  dono permite adquirir o mesmo lock na outra sessão. Cada transação e backend
  têm limpeza em `finally`.
- Ausência da URL do launcher causa falha explícita com instrução de execução;
  não há skip nem fallback para PGlite. O teste tem timeout de 15 segundos e
  limites SQL explícitos de 2 segundos para statement / 1 segundo para lock.

Nenhuma assinatura exportada foi alterada. Core, wrappers e helpers existentes
foram apenas lidos.

## Verificação e handoff

Executado após a correção, com timeout externo de 85 segundos:

```powershell
node --conditions=react-server --import tsx --test --test-reporter=spec tests/drizzle-tax-final-helpers.test.ts
```

Resultado: **10 testes passaram, 0 falhas, 0 cancelados, 0 skips**, duração total
63.347 ms. O subteste HR/Cemetery terminou em 6.016 ms e o seed em 26.414 ms.

A rodada central deve executar o novo teste no launcher real; essa validação
não foi executada pelo agente responsável por esta correção:

```powershell
$env:CELERIFLOW_EMBEDDED_POSTGRES_MODULE = 'C:/Users/trici/AppData/Local/Temp/opencode/drizzle-postgres-final/node_modules/embedded-postgres/dist/index.js'
$env:CELERIFLOW_POSTGRES_TEST_TEMP = 'C:/Users/trici/AppData/Local/Temp/opencode/drizzle-postgres-final'
node scripts/verify-planning-postgres.mjs tests/drizzle-tax-migration-lock.test.ts
```

O launcher fornece `CELERIFLOW_PLANNING_TEST_POSTGRES_URL`. O teste dedicado de
lock pode integrar a lista de testes da rodada central. Não foram executados
build, tsc, npm, commit ou push nesta investigação.
