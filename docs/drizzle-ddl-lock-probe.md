# Ensaio read-only do lock do executor SQL

Implementação: `scripts/database-migrate-verify-locks.mjs`. API de ensaio: `verifyMigrationLocks(connectionString, options?)`.

Este ensaio usa **duas chamadas reais de `openMigrationConnection(..., "neon")`**, pelo driver WebSocket ESM já existente, e executa **`runDatabaseMigrations(..., { command: "plan" })`**. A chave é importada diretamente de `migrationLock`: `[1866280812, 1936813409]`. É um contrato diferente de `withDatabaseTransaction`; o executor SQL usa **READ COMMITTED**.

## Execução

```powershell
node --max-old-space-size=128 --check scripts/database-migrate-verify-locks.mjs
node --max-old-space-size=128 --test --test-concurrency=1 tests/database-migrate-verify-locks.test.mjs
node --max-old-space-size=256 node_modules/eslint/bin/eslint.js scripts/database-migrate-verify-locks.mjs tests/database-migrate-verify-locks.test.mjs
node --max-old-space-size=256 scripts/database-migrate-verify-locks.mjs --output=.agent/database-migrate-locks.json
```

O padrão exige `DATABASE_MIGRATION_URL`. Para selecionar explicitamente a URL já usada pelo ensaio read-only da plataforma:

```powershell
node --max-old-space-size=256 scripts/database-migrate-verify-locks.mjs --url-env=DATABASE_URL --output=.agent/database-migrate-locks.json
```

Somente este CLI de diagnóstico carrega `.env.local`/`.env`, com `quiet: true`. A seleção explícita de `DATABASE_URL` não altera o contrato de ambiente do CLI de migração de produção. URL, tokens, nomes de banco, conteúdo de recibos e logs do ledger não são impressos. O arquivo de saída é restrito a JSON sob `.agent/`.

## Checks e fluxo

1. Validar os arquivos/provas locais por `loadMigrationSet`, sem executar SQL histórico.
2. Abrir dois transports Neon. Capturar somente PID/settings do backend e metadados de migração.
3. Na conexão owner, iniciar `BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY` e adquirir `pg_try_advisory_xact_lock` com a chave exata do executor.
4. Executar o **plan real** na segunda conexão enquanto a owner mantém o lock. Exigir `MigrationBlockedError` com `MIGRATION_LOCK_BUSY`, dois PIDs concorrentes distintos e `ROLLBACK` confirmado pelo caminho de erro do executor.
5. Encerrar a owner por `ROLLBACK`. Reexecutar o plan real na segunda conexão; exigir aquisição do lock e seu `ROLLBACK` normal. Um resultado semântico `ADOPTION_BLOCKED` é registrado separadamente e não reprova a prova de lock.
6. Com a segunda conexão ainda aberta, iniciar outra transação read-only na owner e readquirir a mesma chave. Isso comprova a liberação pelo rollback do executor, antes do fechamento do transporte.
7. Conferir amostras de PID/read-only/isolation nos limites de BEGIN, bounds, configuração do executor, aquisição do lock e leitura de ledger. Exigir restauração dos settings locais após cada rollback.
8. Fechar ambos os transports, registrando rollback/close e falhas de cleanup.

Os únicos dados lidos pelo plan são os metadados de `_prisma_migrations` e, caso existam, das tabelas de autoridade do próprio executor. Os dados de domínio não são consultados. O relatório guarda apenas contagens/códigos do resultado do plan, além de PIDs e settings. Não fornece catálogo revisado, não altera a decisão de adoção e não avalia o conteúdo do catálogo de domínio.

O wrapper rejeita comandos de execução diferentes de BEGIN read-only/ROLLBACK e rejeita queries que não sejam um único SELECT, incluindo strings com DDL/DML ou SELECT INTO. As opções não aceitam SQL arbitrário. Nenhum comando `adopt`, `replay` ou `deploy` é chamado.

## Limites e encerramento

- Requer **PostgreSQL 17+**, para `transaction_timeout`; o Neon do ensaio da plataforma já confirmou esse parâmetro.
- Prazo total do CLI: **30 segundos**, com watchdog de processo. O trabalho tem até 28 s e o cleanup reserva até 2 s.
- Cada BEGIN recebe limites **locais à transação**, antes de prosseguir: statement/transaction/idle de **15 s**, lock timeout **250 ms**. Isso também funciona com URLs de pool, sem depender de estado SESSION entre transações.
- O plan recebe os próprios parâmetros `statementTimeoutMs: 15000` e `lockTimeoutMs: 250`; são conferidos seus settings originais de timezone/search_path/strings e idle timeout de **60 s**. O `transaction_timeout` local de 15 s continua limitando a duração do ensaio.
- Em falha, rollback é tentado com tempo reservado; mesmo sem ack, o close do transport é tentado. Rollback/close não confirmados resultam em **FAIL**. O CLI encerra o processo nesses casos, fechando seus sockets; não promete confirmar remotamente um rollback sem ack.
- Não há retry ou reconexão automática. Se outro processo já mantiver a chave, o ensaio falha com `MIGRATION_LOCK_ALREADY_BUSY`.

PASS certifica apenas os checks observados neste ensaio: contenção/liberação da chave real, transações read-only do plan, PIDs estáveis nos checkpoints, restauração de settings e fechamento confirmado. Não certifica aplicação de DDL, concorrência de receipts, transporte de COMMIT, recuperação de `OUTCOME_UNKNOWN`, catálogo aprovado nem proveniência histórica.

## Resultados executados — 28/10/2026

Os testes puros usam o executor `plan` real com transports em memória. Cobrem sucesso/privacidade de logs, troca de PID, falha em uma das aberturas, query sem resposta e rollback sem ack que ainda deve fechar o transporte. Não importam PGlite, Drizzle ou o helper de bootstrap.

- Análise sintática Node: **exit 0**.
- `tests/database-migrate-verify-locks.test.mjs`: **cinco aprovados, zero falhas**, heap de 128 MiB, sem PGlite; última execução em aproximadamente **0,99 s**.
- ESLint dos dois arquivos novos: **exit 0**, heap de 256 MiB.
- **Um ensaio Neon real executado**, pelo comando com `--url-env=DATABASE_URL` acima, em **2026-10-28T17:12:33.172Z**: **PASS**, exit Node **0**, **2.802 ms**, cleanup confirmado das duas conexões.
- Evidência completa: **`.agent/database-migrate-locks.json`**. Os onze checks do relatório são verdadeiros.

Durante a contenção, a owner manteve o backend **719** e o plan concorrente usou **913**; o erro real foi `MIGRATION_LOCK_BUSY` e o executor confirmou seu rollback. Após o rollback da owner, o segundo plan adquiriu a chave, leu os **156 registros do ledger**, e terminou com outro rollback. A owner readquiriu a chave enquanto o segundo transporte continuava aberto. Cada conexão registrou dois rollbacks bem-sucedidos; ambas fecharam com `cleanupComplete: true`.

O resultado semântico do segundo plan foi **`ADOPTION_BLOCKED`**, com `UNRESOLVED_HISTORICAL_DIFFERENCE` e `REVIEWED_BASELINE_CATALOG_REQUIRED`. O ensaio certifica seu contrato read-only/lock, não a adoção.

O pool reutilizou o backend **719** para o segundo plan depois de encerradas as primeiras transações. O PID permaneceu estável **dentro de cada transação**; o ensaio não exige nem certifica afinidade do PID entre transações. Settings originais (`GMT`, timeouts de statement/lock/transaction `0` e idle `5min`) foram restaurados após os rollbacks. Na leitura do ledger, o executor usou o fuso original `GMT`, conforme seu contrato de representação temporal, mantendo `READ ONLY` e o mesmo PID.
