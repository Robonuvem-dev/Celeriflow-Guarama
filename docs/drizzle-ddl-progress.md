# DDL explícito — substituição do executor Prisma

## Estado em 28/10/2026

Implementação integrada pela sessão principal e **baseline explicitamente inicializada no Neon**, após ensaio e conferência integral. **`adopt` por proveniência exata continua bloqueado pela migração clínica.** A operação distinta `baseline` registra o estado atual auditado, sem alegar recuperar os bytes clínicos. A classificação clínica permanece `UNRESOLVED_HISTORICAL_DIFFERENCE`.

### Resultado central posterior

- 15 testes físicos do executor e 17 offline aprovados. O novo `verify-files` confirma arquivos e autorização offline sem afirmar inicialização/conexão ao banco.
- Em `2026-10-28T18:52:59.686Z`, plano real `READY_TO_BASELINE` com catálogo integral idêntico ao original revisado. Inicialização: 156 recibos com origem `baselined`, nenhum SQL histórico executado.
- 1.006 tabelas, 154.398 registros e uma sequência comparados antes/depois; SHA-256 agregado idêntico `6028a6dc3c327dba28f56b46035388b2b17635dcc2743c7b2591cba56a6936fa`. Ledger legado integral preservado. Catálogo sem diferenças e dois deploys seguintes sem SQL pendente.
- Evidência pública: `docs/drizzle-inventory/audited-baseline-initialization.json`; detalhes privados em `.agent/drizzle-audited-baseline-cutover.json`.
- Build/CI integrados pelo parent: verificação offline + gate AST; produção usa `deploy` e nunca inicializa autoridade automaticamente. `.gitattributes` fixa LF dos novos artefatos/SQLs e dos dois relatórios originais cujos bytes têm hashes vinculados ao manifesto. Nenhum histórico reescrito.

- Regras lidas: `AGENTS.md`, seção 8 do planejamento integral, contratos, situação, revisão de 28/10, configuração ativa, verificadores de histórico/recuperação e respectivas evidências.
- Autoridade proposta: `celeriflow-explicit-sql-v1`, configurada em `db/migration-authority.json`.
- Os **156 SQLs permanecem em `prisma/migrations-ibema`**, no conteúdo e caminho atuais. O nome da pasta passa a indicar a origem histórica; o executor novo não carrega `prisma.config.ts`, CLI, client gerado ou DMMF.
- SQL novo: `db/migrations/<AAAAMMDDhhmmss_nome>/migration.sql`. O nome completo deve ordenar depois do último histórico. Não há geração/push automático de esquema.
- Nenhum comando de alteração no Neon, instalação de dependências, build, commit, push ou deploy foi realizado por este executor.
- `package.json`, build, CI, configurações TypeScript, scripts compartilhados e documentos de coordenação permanecem sob integração da sessão principal.

## Decisão posterior: baseline auditada explícita (28/10)

O proprietário confirmou não possuir a cópia clínica original e escolheu **“Baseline auditada (Recommended)”**. A implementação usa o comando **`baseline`**, separado de `adopt`, `replay`, `deploy` e de qualquer build. A autorização não é prova retrospectiva dos bytes instalados e não abre um aceite genérico de divergências.

### Manifesto e vínculos imutáveis

- Manifesto versionado, sem dados de aplicação, URL ou credenciais: `db/audited-baseline-2026-10-28.json`.
- Digest semântico SHA-256, fixado em `db/migration-authority.json`: **`2b6df6002e92bf0725bae8f5574ea6d00c7d1e9d1b9214900881ddc96d201825`**. O digest usa JSON canônico (`stableJson`); finais de linha do JSON no checkout não alteram a autorização.
- Baseline dos 156 históricos: **`d3d9962b793d2f76082f1fd2e89ed3d171761b8de611f1cdec264a72d928ae8a`**; inventário e evidência de recuperação `PASS` também têm seus arquivos presos por SHA-256.
- Referência original obrigatória na inicialização: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`. SHA-256 exato do arquivo: **`bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d`**. Digest do catálogo normalizado: **`a84b2392d6dcb19e0c9fce24dc6b4bdf91a72fe19665c7865c4dfe3e2c0ac76c`**. Nenhuma recaptura foi feita para aprovar drift.
- Allowlist exata de **uma** tupla clínica: nome, caminho, classificação não comprovada, instalado `56942636553fc17917a3e70970ac21b9d9bad907c4289960170333f6fd3f5a80`, LF `e4590cc6c6426625afe58396ebfd7a5f07f75ed2dfdfb32eb319586a82c1ea2a`, local registrado `d8822bb147ec2e24a48ec2c74ed02d5808809d5d48dacde896850b8b5a5d6fbb` e as duas variantes locais LF/CRLF conhecidas. Outra tupla, outra divergência ou outra autorização é recusada.

### Contrato de inicialização e deploy

`runDatabaseMigrations(connection, set, options)` mantém os parâmetros existentes e acrescenta `command: "baseline"` e a opção **`baselineManifestDigest`**. `loadMigrationSet()` carrega e valida o manifesto versionado pela política; o core valida os vínculos com as fontes e a evidência de recuperação. Todos os consumidores existentes foram localizados antes da extensão; chamadas de `adopt`, `replay`, `plan` e `deploy` conservam seu contrato.

`baseline` exige, juntos, catálogo revisado, hash exato do arquivo e digest explícito do manifesto. Depois do advisory lock transacional na mesma conexão e do lock `SHARE` no ledger legado, valida todas as linhas instaladas e o catálogo completo. Nenhum checksum instalado alterado, nome desconhecido, duplicado, ausente, incompleto ou revertido é permitido. Apenas a divergência de bytes que corresponde integralmente ao manifesto é reconciliada.

O marker usa **`origin='baselined'`** e conserva manifesto completo/digest/fonte, vínculo do catálogo e digest das linhas legadas. Os **156 recibos** usam **`origin='baselined'`**, conservam o checksum local, `legacy_row` integral e `historical_provenance` com `byteProof` separado de `auditedBaseline`. A clínica contém a tupla explicitamente não comprovada, com `byteProof=null`. Nenhum histórico ou SQL futuro é executado durante essa inicialização. Os 156 arquivos e o ledger legado permanecem intactos.

`deploy` valida marker, manifesto versionado/digest, fontes/provas, ledger legado exato e prefixo/ordem/origem de todos os recibos. **Não precisa do catálogo privado `.agent` depois da inicialização**: seus vínculos já estão persistidos. Históricos continuam aceitando apenas as variantes LF/CRLF já conhecidas e com conteúdo normalizado preso ao inventário. **Todo SQL futuro exige checksum dos bytes exatos executados**, inclusive finais de linha, para qualquer origem da autoridade; não há waiver por checksum LF. Recibos futuros usam `origin='executed'`. Repetir deploy sem pendências não reaplica SQL. Rollback e `OUTCOME_UNKNOWN` seguem o mesmo protocolo do executor aprovado anteriormente.

### Comandos exatos para o parent revisar e executar

```powershell
# Planejamento read-only da baseline autorizada; nenhum recibo.
node scripts/database-migrate.mjs plan --catalog=.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json --catalog-sha256=bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d --baseline-manifest-digest=2b6df6002e92bf0725bae8f5574ea6d00c7d1e9d1b9214900881ddc96d201825

# Inicialização EXPLÍCITA após ensaio/revisão do parent. Não executada nesta frente.
node scripts/database-migrate.mjs baseline --catalog=.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json --catalog-sha256=bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d --baseline-manifest-digest=2b6df6002e92bf0725bae8f5574ea6d00c7d1e9d1b9214900881ddc96d201825

# Gate de produção após a autoridade existir; sem catálogo privado.
node scripts/database-migrate.mjs deploy
```

`plan` sem `--baseline-manifest-digest` continua planejando a adoção estrita, portanto retorna `ADOPTION_BLOCKED` para a clínica. Com digest explícito, retorna `READY_TO_BASELINE` ou `BASELINE_BLOCKED`. `verify-files` continua retornando exit 2 / `FILES_INTACT_ADOPTION_BLOCKED`, pois a proveniência clínica não foi recuperada. Isso não contradiz a autorização distinta da baseline.

### Verificação desta alteração

Executado somente offline/leve: **12 testes puros aprovados**, zero falhas, com heap de 128 MiB: quatro novos do manifesto/protocolo/CLI, três de proveniência exata e cinco do probe de locks. Primeira execução em aproximadamente **3,39 s**; reteste final após incluir manifesto/divergência também no relatório de deploy: **4,04 s**, novamente 12/12. ESLint final em todos os `scripts/database-migrate*.mjs`, novos testes de baseline e reserva annual: **exit 0**.

Preparado, **não executado nesta frente**, para a fila central do parent:

```powershell
node --max-old-space-size=128 --test --test-concurrency=1 tests/database-migrate-baseline-manifest.test.mjs tests/database-migrate-provenance.test.mjs tests/database-migrate-verify-locks.test.mjs
node --max-old-space-size=512 --test --test-concurrency=1 tests/database-migrate-baseline.test.mjs tests/database-migrate.test.mjs
node --max-old-space-size=512 --test --test-concurrency=1 tests/database-migrate-history.test.mjs
```

Os cinco novos testes físicos usam o inventário real de 156 históricos, catálogo descartável pequeno e autorização **TEST-ONLY** explicitamente vinculada a esse catálogo. Cobrem os 156 recibos sem executar SQL histórico, Decimal/timestamp de seis casas, trigger/dados/ledger íntegros, adoção estrita recusada, drift e tentativa de recaptura recusados, todas as anomalias do ledger, rollback sem autoridade, retry idempotente, perda de ACK de `COMMIT` na baseline e no futuro, validação pós-inicialização de manifesto/ledger/recibo e alteração somente de finais de linha de SQL futuro. Não constituem ensaio do catálogo completo restaurado nem prova de multissessão real. A baseline Neon não foi executada.

## Arquivos e contrato de execução

| Arquivo novo | Responsabilidade |
|---|---|
| `scripts/database-migrate.mjs` | CLI, validação de argumentos/ambiente e códigos de saída |
| `scripts/database-migrate-driver.mjs` | Conexão física única Neon WebSocket ou PostgreSQL TCP |
| `scripts/database-migrate-files.mjs` | Inventário fechado, checksums, proveniência, ordem e SQL novo |
| `scripts/database-migrate-sql.mjs` | Localização de comandos SQL de nível superior e envelopes históricos |
| `scripts/database-migrate-core.mjs` | Lock, adoção, recibos, replay, deploy e rollback |
| `scripts/database-migrate-catalog.mjs` | Comparação explícita do catálogo com captura revisada |
| `scripts/database-migrate-provenance.mjs` | Reconstrução/validação exata dos bytes históricos arquivados |
| `db/historical-provenance/*.json` | SQL normalizado em base64, terminador de cada linha e prova criptográfica |
| `db/migration-authority.json` | Caminhos e identidade da nova autoridade SQL |

### Comandos

```powershell
# Offline: não abre conexão nem carrega .env.
node scripts/database-migrate.mjs verify-files

# Leitura do destino explicitamente configurado; nenhum recibo é criado.
node scripts/database-migrate.mjs plan

# Quando houver um catálogo capturado e revisado:
node scripts/database-migrate.mjs plan --catalog=<catalog.json> --catalog-sha256=<SHA256_DO_ARQUIVO>

# Inicialização única de banco existente, somente com todas as verificações aprovadas.
node scripts/database-migrate.mjs adopt --catalog=<catalog.json> --catalog-sha256=<SHA256_DO_ARQUIVO>

# Inicialização distinta: exige banco verdadeiramente vazio.
node scripts/database-migrate.mjs replay

# Gate de deploy: exige autoridade já inicializada; nunca adota/reproduz implicitamente.
node scripts/database-migrate.mjs deploy
```

`<...>` indica argumento a preencher; os exemplos de conexão não são executados por este documento. O catálogo pode ser o `catalog.json` da captura consistente em `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/`. O arquivo não integra o Git por conter detalhes do banco. Conferir sua procedência e SHA-256 antes da adoção; não gerar uma nova captura de um banco já divergente para fazer a comparação passar. O parâmetro de hash valida os bytes do artefato fornecido; não substitui essa revisão de procedência.

### Ambiente

| Variável | Contrato |
|---|---|
| `DATABASE_MIGRATION_URL` | Obrigatória nos comandos conectados. Destino deliberado, preferencialmente URL unpooled. Não há fallback para `DATABASE_URL`, `DATABASE_URL_UNPOOLED` ou arquivo `.env`. |
| `DATABASE_MIGRATION_DRIVER` | `neon` por padrão, usando `@neondatabase/serverless` + `ws`, já dependências diretas. `pg` usa TCP e requer que a sessão principal adicione `pg` como dependência direta se escolher essa opção. |
| `DATABASE_MIGRATION_STATEMENT_TIMEOUT_MS` | Inteiro positivo; padrão `300000`. Por instrução, não por lote inteiro. |
| `DATABASE_MIGRATION_LOCK_TIMEOUT_MS` | Inteiro positivo; padrão `10000`, para locks PostgreSQL de tabelas/DDL. |
| `VERCEL_ENV` / `VERCEL` | Escritas em Vercel somente em `production`; `preview` é recusado. Builds Preview não devem receber a URL de migração de produção. |

Códigos de saída: `0` operação/verificação aprovada; `2` bloqueio conhecido de adoção/autoridade/lock/SQL; `1` erro de configuração, conexão ou desfecho de transação desconhecido. Falha SQL confirmadamente revertida retorna relatório `ROLLED_BACK`. Falha de confirmação de `COMMIT` ou de comunicação durante rollback retorna `OUTCOME_UNKNOWN`; conferir recibos em uma nova conexão antes de decidir repetir.

### Ligação que cabe à sessão principal

1. Registrar o comando `node scripts/database-migrate.mjs deploy` no gate de produção que substitui `prisma migrate deploy`. Em `scripts/build.mjs`, o mapa `commands` atual usa caminhos de scripts Node; pode receber `databaseMigrate: join(process.cwd(), "scripts", "database-migrate.mjs")` e o gate pode chamar `run("databaseMigrate", ["deploy"])`.
2. Manter o gate somente para `!typecheckOnly && VERCEL_ENV === "production"`, com erro propagado. Nenhum build deve executar `adopt` ou `replay` automaticamente.
3. Fornecer `DATABASE_MIGRATION_URL` explicitamente no ambiente desse estágio. O executor não importa o cliente de runtime da aplicação.
4. Desativar a execução concorrente da autoridade antiga ao realizar a troca. O advisory lock novo não é o lock privado do Prisma. O executor também trava o ledger instalado em modo `SHARE` durante adoção/deploy, impedindo alteração das entradas enquanto valida/aplica.
5. Resolver os bloqueios históricos, ensaiar a adoção e executá-la explicitamente antes do primeiro deploy com o gate novo. Se a autoridade não existir, `deploy` falha com `INITIALIZATION_REQUIRED`, sem tentar interpretar o banco como vazio.
6. Retirada de geração/CLI/dependências e adaptação dos demais consumidores históricos pertencem à integração geral. Os caminhos SQL foram mantidos justamente para não quebrar consumidores ainda não integrados.

## Garantias implementadas

### Arquivos, checksums e SQL

- O conjunto histórico deve coincidir integralmente com os 156 nomes do inventário. Ausência, acréscimo, alteração de conteúdo ou classificação incoerente é erro.
- São conferidos SHA-256 dos bytes originais, SHA-256 LF e variante CRLF. Variantes mistas só são reconhecidas quando um arquivo em `db/historical-provenance/<nome>.json` permite reconstruir **exatamente** o SHA-256 instalado, com conteúdo normalizado byte-a-byte idêntico. Uma declaração de aceite ou nome conhecido não substitui essa prova.
- `baseline_digest` prende nomes, hashes LF, hashes instalados, classificações efetivas e provas arquivadas. O recibo conserva o hash do SQL local e `historical_provenance` conserva hash instalado, hash normalizado, digest do artefato e terminador de cada linha; `legacy_row` continua sendo cópia exata da entrada instalada. A proveniência não depende dos finais de linha do checkout seguinte.
- Há **quatro** arquivos revisados com envelope de transação próprio: `20261009232100_database_guards`, `20261009232200_reference_data`, `20261010130000_add_master_data_foundation` e `20261027110000_sanitation_unit_identifier`.
- Somente os comandos de nível superior `BEGIN` e `COMMIT` desses quatro arquivos são omitidos do texto enviado ao servidor. Arquivo, comentários internos, corpo SQL e hash original não são reescritos. Remover/alterar o envelope esperado causa erro. Funções e blocos dollar-quoted não são divididos pelo `;` interno.
- SQL futuro não pode possuir controle transacional próprio nem instruções incompatíveis com o executor transacional, como `CREATE INDEX CONCURRENTLY`. Comandos de sessão que substituam configurações do executor também são recusados. A ferramenta não é um sandbox para SQL: os arquivos versionados continuam sujeitos a revisão de DDL.

### Adoção de banco existente

- Exige ledger instalado completo e conhecido: nomes **e hashes**, sem migrações desconhecidas, ausentes, duplicadas, incompletas ou revertidas. Não existe resolução por nome, `resolve --applied`, parâmetro genérico de aceite ou reparação do checksum instalado.
- Exige catálogo revisado completo. Compara tabelas, colunas, constraints, índices, funções com assinaturas/corpos, triggers e estados de habilitação, enums, views, definição de sequences, políticas e extensões, nos schemas capturados. Objetos extras também causam diferença.
- O ledger legado e as duas tabelas da autoridade são excluídos da comparação de objetos de aplicação. As entradas legadas são validadas separadamente e copiadas por JSON gerado no PostgreSQL, preservando todos os campos, incluindo precisão temporal além de milissegundos.
- Normalizações específicas: CRLF/LF em texto de catálogo; constraints `NOT NULL` nomeadas do PostgreSQL 18 verificadas pela nulabilidade das colunas; dono e `last_value` de sequence não são baseline estrutural. A adoção não atualiza dono, sequência ou seu estado corrente. O ensaio de recuperação existente continua responsável pela evidência de restauração de dados/estado.
- Depois das verificações, cria somente `public._celeriflow_sql_state` e `public._celeriflow_sql_migrations`, e os recibos `origin='adopted'`. **Nenhum dos 156 SQLs é executado.** O ledger instalado não recebe `INSERT`, `UPDATE`, `DELETE` ou DDL.
- O marker guarda hashes da proveniência, catálogo e digest de todas as linhas legadas. Cada deploy seguinte exige que o ledger original continue íntegro e idêntico. Adoção e aplicação de SQL futuro são comandos distintos.
- A cópia do ledger conserva também a representação temporal do fuso da sessão de adoção. O marker registra `legacyTimezone`; leituras posteriores do ledger usam esse fuso somente ao gerar o JSON e retomam UTC antes de executar migrações. Instantes e microssegundos não passam por `Date` nem são regravados no ledger.

### Replay vazio e deploy

- `replay` recusa relações, funções, tipos, schemas adicionais ou extensões de usuário preexistentes; não serve para base instalada/Neon com objetos provisionados.
- Executa os históricos atuais e SQL novo; registra `origin='executed'`. Não cria `_prisma_migrations`, não falsifica hashes instalados e distingue no relatório `historicalDifferences` pendentes de `provenHistoricalVariants` comprovadas independentemente do replay.
- `deploy` exige todos os históricos já registrados pela adoção ou replay. Os recibos devem formar um prefixo completo e conhecido, na ordem exata. Hash, origem, caminho e posição precisam coincidir; nomes conhecidos sozinhos não bastam.
- Arquivos novos são executados uma única vez. Repetir `deploy` sem pendências não executa SQL de aplicação.
- Uma conexão física, uma transação e um `pg_try_advisory_xact_lock` protegem validação, lote inteiro, DDL/DML e recibos. Contenção retorna `MIGRATION_LOCK_BUSY`; não existe retry automático de SQL parcialmente confirmado. O lock transacional termina com commit/rollback.
- Falhar no meio do lote reverte DDL, DML transacional e recibos do lote; no bootstrap reverte também as tabelas novas de autoridade. Não há migração `down` automática de alterações já commitadas. Estado de sequence consumido em objetos preexistentes segue a semântica não transacional do PostgreSQL; o executor não promete reverter consumo de `nextval` nem efeitos externos de funções. O histórico conferido cria a sequence `SERIAL` no próprio replay.

## Proveniência e bloqueios exatos

Ensaio adicional do integrador em `2026-10-28T16:27:44.700Z`: o driver Neon/Drizzle e `withDatabaseTransaction` passaram em duas sessões PostgreSQL reais concorrentes, com backend estável na origem, repeatable read/read-only, timeouts locais conferidos e contenção/liberação de advisory lock transacional. Evidência em `.agent/neon-transaction-boundaries.json`, script `drizzle-verify-transaction-boundaries.ts`. O ensaio usou somente SELECTs/locks e não fez DDL/DML, adoção ou deploy; a contenção do executor completo e os cenários de commit/recibos no destino continuam separados.

Fontes: `docs/drizzle-inventory/migration-history.json`, `docs/drizzle-inventory/recovery.json` e revisão de 28/10. A recuperação anterior passou com 156 SQLs, 163 funções, 255 triggers e catálogo público sem diferenças. A restauração anterior verificou 1.006 tabelas/154.016 registros e ledger original. Isso não prova identidade histórica dos SQLs abaixo.

| Migração | SHA-256 instalado | SHA-256 local registrado |
|---|---|---|
| `20261011010000_add_sst_clinical_services` | `56942636553fc17917a3e70970ac21b9d9bad907c4289960170333f6fd3f5a80` | `d8822bb147ec2e24a48ec2c74ed02d5808809d5d48dacde896850b8b5a5d6fbb` |
| `20261015220000_health_aih_apac_workflows` | `5fdfa81973db5e6bab704e102550a52eac2dbd9773151eae576923e509194cbd` | `29ed10d25d4e9adb9fde6ece5a9cfadf1c3b9f79ba70f002dcd02b55d60aea18` |

### Variante de Saúde comprovada por bytes exatos

`scripts/restore-hr-foundation-bytes.mjs` e o blob Git da migração de RH comprovaram o precedente de dois blocos LF separados em uma base CRLF. A migração de RH conserva LF nas linhas 67–74 e 80–87 e SHA-256 `b0da3ace2e59d743cd4584c983729dbc87d0b0ba26156e86b8f0226d99ffd1f2`.

Na migração **`20261015220000_health_aih_apac_workflows`**, a busca encontrou:

- LF **apenas** nas linhas **46 e 52–58**; CRLF nas demais 50 linhas; sem BOM; terminador final LF.
- 5.110 bytes reconstruídos; SHA-256 **`5fdfa81973db5e6bab704e102550a52eac2dbd9773151eae576923e509194cbd`**, igual ao ledger instalado.
- SQL normalizado idêntico ao atual; SHA-256 LF `d5d9b045afaff9d3c0b38eefb14a347d375b2742c9e131f8e61c9133472f2a55`.
- Artefato autossuficiente: `db/historical-provenance/20261015220000_health_aih_apac_workflows.json`, contendo os bytes LF em base64 e o terminador de **cada** uma das 58 linhas. JSON evita que filtros de checkout alterem a variante arquivada.
- O executor reconstrói e verifica tudo a cada carregamento. A classificação efetiva é `PROVEN_MIXED_LINE_ENDINGS`; o parent confirmou a atualização do verificador e do inventário globais para essa classificação, preservando os hashes originais e o digest efetivo da prova.
- Foram necessários 454.170 candidatos de dois blocos até a correspondência. Um único bloco, inclusive variações de BOM/terminação final (19.836 candidatos adicionais), não bastava. O blob inicial Git `5b2cb4d` está normalizado para LF e não conserva a variante mista.

### Proveniência clínica ainda pendente

Para **`20261011010000_add_sst_clinical_services`**, um bloco LF/CRLF em ambas as polaridades falhou (7.656 candidatos), assim como variantes de BOM/terminação final com um bloco (44.892 candidatos). Dois blocos com terminação final preservada também não encontraram o hash (4.663.780 candidatos). O único commit que toca o arquivo no histórico local alcançável é `37064a7`; o blob `e28fc12` é uniforme LF, hash `e4590cc6c6426625afe58396ebfd7a5f07f75ed2dfdfb32eb319586a82c1ea2a`.

Também foi concluída a busca estendida de dois blocos nas 86 posições internas, em ambas as polaridades, com/sem BOM e final independente ausente/LF/CRLF: **26.710.740 candidatos, nenhum hash igual ao instalado**. A execução usou um processo Node com heap de 128 MiB e durou aproximadamente 294 segundos. Isso delimita os modelos testados; não prova alteração de conteúdo SQL nem autoriza normalizações adicionais.

Sem bytes que reproduzam `569426...`, a classificação clínica permanece `UNRESOLVED_HISTORICAL_DIFFERENCE` e **a adoção é recusada mesmo com catálogo coincidente**. Não há exceção de aceite; mudar só a classificação do inventário, sem um artefato validado, continua sendo erro. Nenhum SQL histórico, inventário global ou ledger foi modificado por esta investigação.

#### Retomada clínica: origem anterior localizada e modelos restritos concluídos

Na retomada de 28/10, a enumeração anterior de um/dois blocos não foi reexecutada. As buscas novas terminaram integralmente dentro dos limites configurados, cada uma em **um processo Node com heap de 256 MiB**, sequencialmente em background. Todos os candidatos preservam os bytes das 87 linhas; variam apenas LF/CRLF e, como diagnóstico separado, a presença de BOM UTF-8. As famílias descartam padrões cobertos anteriormente quando reconhecidos; os números abaixo contam **avaliações SHA-256**, não alegam unicidade entre todas as famílias.

| Família concluída | Avaliações | Resultado |
|---|---:|---|
| Cada um dos 21 statements top-level inteiramente LF ou CRLF, com pelo menos três runs de cada terminador | 4.169.520 | Sem correspondência |
| Três/quatro regiões não adjacentes entre 66 trechos lógicos: tabelas, referências, payloads, corpos de funções e cauda | 1.552.752 | Sem correspondência |
| Três/quatro terminadores alternativos isolados, em ambas as polaridades; casos de até dois já cobertos anteriormente | 9.255.176 | Sem correspondência |
| Três blocos nas fronteiras dos statements e de `DECLARE/BEGIN/END/$$` | 3.374.776 | Sem correspondência |
| Três blocos nas bordas de cabeçalho/corpo/fecho das tabelas | 2.145.368 | Sem correspondência |
| Quatro blocos em 25 fronteiras de edição/função | 2.911.196 | Sem correspondência |
| Cinco blocos nas mesmas fronteiras restritas | 7.833.012 | Sem correspondência |
| 21 grupos semânticos de um possível gerador, compartilhando terminador entre campos/estruturas equivalentes de tabelas diferentes | 4.193.220 | Sem correspondência |
| **Total desta retomada** | **35.435.020** | **Nenhum SHA-256 igual ao instalado** |

As três execuções duraram aproximadamente **155,28 s + 308,15 s + 81,39 s = 544,82 s**. O maior RSS informado pelo Node foi **51.580 KiB (50,37 MiB)**. Os relatórios registram todas as fases como completas, com os conjuntos exatos de regiões/fronteiras/grupos e limites de 25 milhões/600 s nas duas primeiras execuções e 5 milhões/600 s na última. O SQL é inteiramente ASCII, sem BOM: **zero bytes não ASCII**, NFC e NFD idênticos ao original. Portanto, normalização Unicode canônica não produz outro conteúdo candidato. Os cenários de BOM são diagnósticos de hash; não concedem aprovação nem alteram o formato de proveniência vigente.

**Origem Git anterior recuperada por leitura autenticada como `Robonuvem-dev`:**

- As duas branches acessíveis de `Robonuvem-dev/Celeriflow-Guarama`, sem tags, conservam apenas `37064a7` no histórico desse caminho.
- O repositório anterior **`Celeriflow-Hub/Celeriflow-Ibema`** contém a criação do arquivo no commit **`7f28090a97f41f6e3cc931bcce7bc96fa7c6ac3d`**, mensagem **`sst4`**, de **11/10/2026 às 03:46:45 UTC**. O diff inicial adiciona exatamente 87 linhas; a árvore completa desse commit não contém outra cópia clínica ou arquivo de origem correspondente.
- Foram examinadas as **sete branches acessíveis** de Ibema, sem tags. A branch `Dudu` referencia **`da28ebb2f60db42204a637b9a30b0a4156dd584c`**; `Dudu-14-10`, `Vette` e `main` referenciam `7f28090a` no histórico clínico. As outras três branches não contêm esse caminho. Os dois históricos encontrados conservam o mesmo blob **`e28fc129ddba3fd8ae8c799a4e9f5dc3f6f1ee5a`**, 6.854 bytes, uniforme LF, conteúdo normalizado idêntico ao SQL atual; nenhum conserva o hash instalado.
- A leitura cronológica dos SQLs de 10–11/10 no commit inicial local encontrou o precedente misto de RH, com LF em 67–74/80–87; os demais vizinhos examinados são LF no Git. A origem Ibema também conserva exatamente essa variante de RH, enquanto Saúde está normalizada para LF. Isso sustenta investigar filtros de checkout/edições locais, mas não determina os terminadores clínicos originais.
- A auditoria de **todos os 6.081 objetos Git locais, incluindo 4.193 blobs e objetos inalcançáveis**, selecionou os 20 blobs de tamanho compatível com conteúdo idêntico e variações de terminador/BOM/final. Apenas `e28fc129...` tem o conteúdo clínico normalizado. Os dois commits inalcançáveis localizados também apontam para ele. Nenhum ref foi criado ou atualizado por essas consultas.

Evidência e scripts reproduzíveis desta retomada estão em **`.agent/clinical-provenance/`**, com índice em `README.md`: `search-report.json`, `boundary-report.json`, `generator-report.json`, `origin-report.json`, `upstream-report.json`, `upstream-refs-report.json` e `git-object-audit.json`. As consultas GitHub usam exclusivamente `GET`, verificam a identidade existente e não persistem credenciais. A origem Git acessível foi localizada e os modelos restritos acima foram esgotados; recuperar a variante exata ainda exige bytes de uma fonte que tenha conservado os terminadores anteriores à normalização Git, ou outra hipótese nova delimitada. Os resultados negativos não demonstram alteração do conteúdo SQL.

**Verificação de produto offline após as buscas:** `node --max-old-space-size=128 scripts/database-migrate.mjs verify-files` retornou **exit Node 2**, `FILES_INTACT_ADOPTION_BLOCKED`, com **156 históricos, uma clínica pendente e uma Saúde `PROVEN_MIXED_LINE_ENDINGS`**. Evidência em `.agent/clinical-provenance/verify-files.json`. O SHA-256 clínico local continua `d8822bb147ec2e24a48ec2c74ed02d5808809d5d48dacde896850b8b5a5d6fbb`; o baseline continua `d3d9962b793d2f76082f1fd2e89ed3d171761b8de611f1cdec264a72d928ae8a`. A aprovação integral dos 13 testes do executor, já registrada pelo parent, permanece a referência desta frente.

### Handoff do verificador/inventário global

API de integração: `validateHistoricalProvenance` de `scripts/database-migrate-provenance.mjs`, chamada com `(bytesAtuais, jsonArquivado, { name, source, installedChecksum, lfChecksum })`. O retorno só existe depois de validar identidade, bytes normalizados e SHA-256 reconstruído; `reconstructedBytes` contém o arquivo misto exato. `source` é o caminho relativo com `/`, conforme o artefato. O parent confirmou a atualização do verificador e do inventário globais: **uma clínica bloqueada e uma Saúde `PROVEN_MIXED_LINE_ENDINGS`**, preservando os hashes instalado/local/LF originais e a referência ao artefato. O executor aceita tanto o relatório antigo quanto a classificação nova **somente com a prova válida**.

## Verificação preparada e evidências obtidas

**Executado nesta frente:** leitura offline dos 156 arquivos, checksums/finais de linha e quatro envelopes; reconstrução exata de Saúde; sintaxe Node e CLI `--help`. **Três testes offline de proveniência aprovados, zero falhas**, com heap de 128 MiB, sem importar PGlite. A verificação offline após arquivar Saúde retorna `FILES_INTACT_ADOPTION_BLOCKED`, **exit Node 2**, com uma pendência clínica e uma variante comprovada. Digest do baseline: `d3d9962b793d2f76082f1fd2e89ed3d171761b8de611f1cdec264a72d928ae8a`; digest semântico do artefato: `ccf45728d5a235125b6fb685be419e6cced6cef450bd7a49c24e7b1a89ab87d4`. Sem PGlite, lint, build ou `tsc` pesado em paralelo com os agentes de domínio.

### Reteste direcionado após a execução do parent

- Resultado informado pelo parent: **13 testes completos, 11 aprovados e dois falhos**; replay real das 156 migrações aprovado em aproximadamente **73 segundos**, e os três testes de proveniência aprovados.
- Corrigido `database-migrate-sql.mjs`: o scanner agora distingue o início/fim dos tokens SQL da trivia que os antecede. A omissão dos controles `BEGIN/COMMIT` conserva o newline anterior ao `COMMIT`, comentários entre instruções, comentários entre controle e `;` e conteúdo posterior. O cabeçalho do envelope inicial segue o contrato do teste existente. Os SQLs históricos não são editados.
- A falha confirmada de adoção era a representação temporal: a sessão PGlite usava `-03:00`, mas o executor copiava o ledger após mudar o fuso para UTC. A representação JSON dos timestamps mudava, embora instante e seis casas de microssegundos fossem preservados. Corrigido com captura/persistência de `legacyTimezone` e leitura consistente do ledger nesse fuso, sem alterar os valores instalados.
- Comando autorizado executado em foreground, com heap de 512 MiB e testes existentes intactos:

  ```powershell
  node --max-old-space-size=512 --test --test-concurrency=1 --test-name-pattern="reviewed envelopes|adoption leaves" tests/database-migrate.test.mjs
  ```

- Resultado final local: **dois testes aprovados, zero falhas**, aproximadamente **8,16 segundos**. Cobriu adoção, dados/trigger/ledger exatos, primeira aplicação da coluna/linha futura, deploy repetido sem reaplicação e recusa do ledger alterado externamente.
- Lint executado: `node node_modules/eslint/bin/eslint.js "scripts/database-migrate*.mjs" "tests/database-migrate*.mjs"` — **exit 0**.
- Retificação confirmada pelo parent: o core DDL sempre foi executado na árvore principal. As duas falhas a resolver eram o scanner e a representação temporal do ledger, corrigidas e aprovadas no reteste filtrado acima. A reexecução integral pelo parent aprovou **13 testes, zero falhas**, sequencialmente com heap de **512 MiB**, em **175,52 segundos**. O replay dos 156 históricos passou em 93,07 segundos nessa execução.

**Preparado para a sessão principal rodar sequencialmente:**

```powershell
node --max-old-space-size=128 --test tests/database-migrate-provenance.test.mjs
node --max-old-space-size=512 --test --test-concurrency=1 tests/database-migrate.test.mjs
node --max-old-space-size=512 --test --test-concurrency=1 tests/database-migrate-history.test.mjs
npx eslint "scripts/database-migrate*.mjs" "tests/database-migrate*.mjs"
node scripts/database-migrate.mjs verify-files
```

O último comando deve retornar **exit 2**, `FILES_INTACT_ADOPTION_BLOCKED`, enquanto a proveniência atual estiver pendente. Isso é um bloqueio real, não um teste de replay reprovado nem aprovação do corte.

Cobertura preparada:

- Adoção de fixture PostgreSQL/PGlite existente: dado, trigger, IDs, logs e timestamps de seis casas preservados; nenhum SQL histórico reexecutado; deploy posterior e repetição idempotente.
- Recusa de hashes incorretos com nomes conhecidos, desconhecidos, duplicações, falhas e tentativas revertidas; ausência de marker/recibos após recusa.
- Catálogo igual não aprova proveniência divergente; desabilitar trigger ou alterar corpo de função bloqueia adoção.
- Prova offline: reproduz o hash instalado de Saúde, verifica cada byte de linha, rejeita alteração em SQL/terminadores/hash/BOM e exige o artefato verdadeiro. A classificação global pode ser atualizada pelo parent sem alterar o baseline efetivo, mas não pode aprovar a clínica sem prova.
- Falha na segunda migração pendente reverte a primeira, tabela criada, dados e recibos; correção ainda não aplicada pode ser repetida uma vez. SQL de migração já registrada alterado/removido é recusado.
- Falha de bootstrap reverte inclusive autoridade; replay recusa base não vazia e `deploy` não faz inicialização implícita.
- Confirmação de `COMMIT` perdida simulada após commit real no PGlite: desfecho desconhecido reportado, recibos preservados e deploy seguinte sem reaplicação. A simulação não substitui o ensaio de transporte Neon.
- Replay completo dos 156 SQLs pelo executor novo, checksums completos dos recibos, contagens de objetos comparadas à evidência de recuperação e deploy subsequente sem aplicação.
- No mesmo banco descartável, fixture das 156 entradas com os hashes instalados do inventário: catálogo coincidente, Saúde comprovada separadamente, pendência clínica recusada e ledger/catálogo intactos. Essa fixture não é declarada restauração do snapshot real.

### Contrato read-only do executor confirmado no Neon

`scripts/database-migrate-verify-locks.mjs` executou um ensaio real em **28/10/2026 às 17:12:33.172Z**, usando duas conexões `openMigrationConnection(..., "neon")` e o **`plan` real de `runDatabaseMigrations`**, com `migrationLock` importado do core. **PASS em 2.802 ms**, onze checks verdadeiros, dois rollbacks por conexão e ambos os transports fechados. Evidência: **`.agent/database-migrate-locks.json`**; contrato, comando, limites e resultados em **`docs/drizzle-ddl-lock-probe.md`**.

Foi observado `MIGRATION_LOCK_BUSY` entre backends concorrentes distintos (719/913), aquisição após rollback da owner e liberação pelo rollback do plan antes de fechar sua conexão. As amostras confirmaram **READ COMMITTED/READ ONLY**, settings locais, PID estável dentro das transações e restauração dos settings ao final. O pool reutilizou PID entre transações, sem quebrar o contrato transacional. O segundo plan leu 156 registros e retornou `ADOPTION_BLOCKED` pelas pendências de proveniência/catalogação; nenhum SQL histórico, DDL/DML ou recibo foi executado/escrito pelo ensaio.

Análise sintática e lint dos arquivos novos passaram; **cinco testes puros aprovados**, cobrindo também troca de PID, falha de abertura, query pendente e rollback sem ack com close obrigatório. O CLI possui prazo total de **30 s**, bounds locais statement/transaction/idle de **15 s** e lock timeout de **250 ms**. Esta prova é específica do executor SQL; o ensaio da plataforma com `withDatabaseTransaction` é uma evidência separada.

Validações pendentes, sem aprovação presumida: concorrência do caminho de escrita de DDL/receipts, queda de conexão/ack de commit e recuperação real de `OUTCOME_UNKNOWN`; ensaio da adoção no destino autorizado após resolução de proveniência; integração do gate pela sessão principal; build/deploy finais. O ensaio Neon acima é somente read-only e certifica os checks ali delimitados. As execuções PGlite completas e o reteste filtrado continuam registrados separadamente.
