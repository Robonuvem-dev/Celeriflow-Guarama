# Drizzle — auxiliares tributários finais e wrappers da autoridade SQL

## Reserva e estado (2026-10-28)

Reserva exclusiva recebida do owner Tax: `src/lib/tributacao/{certificate-subjects,simples-option-files,tax-worker-actor}.ts`, `scripts/seed-municipal-tax-cases.ts`, `scripts/deploy-hr-migrations.ts` e `scripts/deploy-cemetery-migrations.ts`. Infra nova restrita a `src/db/repositories/tax-final-helpers/**`, `src/db/schema/tax-final-helpers.ts`, `src/lib/contracts/tax-final-helpers.ts`, `tests/drizzle-tax-final-helpers.test.ts` e este documento.

**Os seis arquivos foram migrados e o scan nominal passou 6/6 sem Prisma/chamadas legadas diretas ou escrita no ledger legado.** Os três helpers preservam nomes públicos, posição dos argumentos, DTOs, regras e mensagens de domínio. Seed mantém os writers públicos nativos de lançamento/guia e sua tx original; os contratos desses writers no core Tax ainda precisam ser migrados pelo owner, conforme handoff abaixo. Aprovação real/de tipos pendente da central.

Durante esta reserva houve a correção prioritária de três falhas Diagnostics no escopo retido. Evidência e causas estão em `docs/drizzle-health-diagnostics-progress.md`. A central confirmou Frotas/TFD integralmente PASS no conjunto de 73 testes e, depois, **36/36 PASS / zero FAIL / zero SKIP** no conjunto Diagnostics + Recruitment + Construction (**120,55 s**), com Laboratory/SISAB/Specialized completos; RAAS já havia passado. Não houve repetição local das suítes pesadas.

## Contratos e consumidores conferidos

Grep de **imports e chamadas**, inclusive actions/APIs/tests, realizado antes das mudanças de tipos. Nenhum consumer externo foi editado nesta reserva.

| Export mantido | Contrato Drizzle | Consumidores nominais / handoff |
| --- | --- | --- |
| `readCertificateSubjects(db, actor, taxpayerId)` | `DatabaseExecutor`; retorno original de sujeitos, sem conexão própria | `evaluateCertificateInTransaction` no próprio módulo |
| `readEconomicRegistrationSubjects(db, actor, registrationId)` | `DatabaseExecutor`; restringe os sócios à inscrição solicitada | `src/lib/tributacao/license-policy.ts`, já usa tx Drizzle |
| `evaluateCertificateInTransaction(tx, actor, taxpayerId)` | **`DatabaseTransaction` original**, avaliação e auditoria na mesma tx; retorna a linha completa | `src/app/app-domain/tributacao/certidoes/actions.ts` já injeta tx Drizzle; `src/lib/tributacao/index.ts::evaluateTaxCertificateSituation` ainda precisa receber a conexão e usar tx Drizzle |
| `simplesOptionLayoutSchema` | schema Zod inalterado | actions/client/page Simples e `src/app/api/tributacao/simples/termos/[id]/route.ts`; nenhum índice de `Parameters<>` alterado |
| `publishSimplesOptionLayout(connection, actor, raw)` | `DatabaseConnection`, tx única **serializable** | `src/app/app-domain/tributacao/simples-nacional/arquivos/actions.ts` já usa `connection` |
| `importSimplesOptionFile(connection, actor, raw)` | `DatabaseConnection`, tx única **serializable**, timeout original de **120 s** | mesma action; `tests/simples-option-files.test.ts` ainda usa fixture Prisma antiga e deve receber conexão/fixture Drizzle pelo owner dos testes legados |
| `decideSimplesOptionCompany(connection, actor, raw)` | `DatabaseConnection`, tx única **serializable**, linha/versionamento originais | mesmas actions/testes acima; retornos UI `{ error }` / `{ id }` continuam responsabilidade das actions existentes |
| `resolveTaxWorkerActor(db, id)` | `DatabaseExecutor`, incluindo a tx recebida; retorno `{ usuarioId, employeeId, allowedBudgetUnitIds }` | `src/lib/tributacao/itbi-online.ts` (duas chamadas em tx); APIs `tributacao/itbi/expiracao` e `tributacao/economico/expiracao`, já usam `databaseConnection.db` |

Contrato independente `TaxFinalHelpersActor` contém somente identidade/escopo e é estruturalmente igual ao `TaxActor`/`FinanceActor` anterior: `usuarioId`, `employeeId`, `budgetUnitId?`, `allowedBudgetUnitIds?`. Nenhum executor/conexão é fingido por cast; nenhuma fachada ORM ou persistência inferida por contexto foi criada.

### Dependências concretas do core Tax para a central

No checkout conferido, `src/lib/tributacao/index.ts` ainda importa Prisma e oferece `createTaxAssessmentInTransaction` / `generateTaxGuideInTransaction` com `Prisma.TransactionClient`; seu `evaluateTaxCertificateSituation` também abre `$transaction` legada. Esse arquivo pertence ao owner Tax e não foi editado.

- O seed agora chama **os mesmos dois exports**, com os mesmos argumentos/dados, passando a **mesma `DatabaseTransaction` Drizzle** adquirida por `withDatabaseTransaction`. Importação do core ocorre na entrada da operação, depois da configuração CLI. Não há implementação paralela dos writers, cast para satisfazer a assinatura antiga, conexão secundária ou supressão de erro de tipos.
- O owner deve disponibilizar os writers com `DatabaseTransaction` e migrar o owner de avaliação para `DatabaseConnection`/`withDatabaseTransaction`. Isso é necessário para o tipo/runtime integrado do seed e do consumer do avaliador; não é certificado pelo parser/lint desta frente.
- `taxAssessmentCompensatedValue` em `scope.ts` já possui overload para `DatabaseExecutor`; o helper Simples utiliza esse caminho com sua tx original. O restante da migração do core/scope continua com seu owner.

## Fidelidade de comportamento e persistência

### Certidões e titulares

- Inscrições econômicas continuam sendo lidas pelo contribuinte; a avaliação de uma inscrição não amplia o escopo para inscrições distintas.
- Mantidos perfil econômico mais recente, UG autorizada, catálogo fiscal mais recente por entidade, `TIPO_SOCIO`, ente, papel e precedência da política atual `validatePartnerDebt` sobre o indicador histórico do sócio. Catálogo desativado, papel não conciliado ou perfil malformado continuam bloqueando.
- Avaliação mantém o titular, sócios configurados, pagamentos **Confirmado**, compensações **EFETIVADO/COMPENSAR**, estados excluídos originais e dívidas ativas. Valor `finalValueDecimal` ou recebimento sem Decimal gera a pendência original `VALORES_NAO_CONCILIADOS`, sem fallback Float.
- Saldos exatos usam o mapper `Decimal` independente desde a string numeric do driver. A avaliação continua interna, com `AVALIACAO_INTERNA_SEM_EMISSAO_DE_CERTIDAO`; emissão/validade/hash de certidão não foram reinventados.
- Avaliação e `TaxAuditLog` são gravados na tx fornecida; uma falha de auditoria reverte a avaliação.

### Arquivos Simples, lotes e processamento

- Schema, base64 canônico, limite de 2 MB, `utf-8`/`windows-1252`, delimitado com aspas/escape, largura fixa, BOM, linhas de cabeçalho/rodapé e limite de 10.000 empresas foram preservados.
- Hash é SHA-256 dos **bytes originais**; dedupe mantém `UG:checksum:layoutId`. Layout/bytes/linhas analisadas/origem e termos ficam congelados na entrada; publicação posterior não reescreve os lotes anteriores.
- Autorização verifica UG e vínculo `PlanningEntityUnit`. Perfil e dívida mantêm os checks originais de ente/UG, origens ausentes/inconsistentes, situação cadastral, créditos suspensos, dívida sem Decimal, compensações/pagamentos e **não duplicação** de dívida já incluída no lançamento.
- Exportação conserva delimitador, cabeçalho, somente linhas com pendência, saldos com duas casas, separador **CRLF** e hash dos bytes exportados. Decisões mantêm empresa pertencente ao arquivo, versão esperada, texto/razão/termos congelados, `previousId` e auditoria antes/depois.
- Locks `hashtextextended(...,0)` mantêm exatamente as chaves `SIMPLES_OPTION_LAYOUT:<UG>`, `SIMPLES_OPTION_FILE:<key>` e `SIMPLES_OPTION_DECISION:<arquivo>:<CNPJ>`. Gravações e auditoria compartilham a mesma tx serializable, sem writes externos intermediários.
- `taxFinalJson` omite somente membros de objeto `undefined`, preserva null explícito e strings que parecem JSON. `insertTaxFinalRegistryEntry` e `auditTaxFinal` convertem **null JSON na raiz** para `JsonNull`; payload omitido permanece SQL NULL. Não há `as Prisma.InputJson*` nem double encoding.

### Ator de worker

Mantidos trim/ausência de ID, usuário/perfil/módulo ativos, Firebase obrigatório, grants por módulo, perfil granular/legado e exigência simultânea de visualização, operação **update** e UGs explícitas. Reads são joins/selects tipados no executor fornecido, inclusive dados ainda não commitados na tx do caller. O helper não abre transações nem adquire conexões. As funções compartilhadas de permissão continuam sendo as mesmas; a plataforma externa ainda pode ter dependências legadas transitivas sob seu owner.

### Seed municipal

- Export adicional testável `seedMunicipalTaxCases(connection, apply = false)`; CLI mantém `--apply` e preview transacional revertido. Conexão CLI usa `createDatabaseConnection` e encerra o pool em `finally`.
- Mantidos **20 casos**, `systemDataset`/`key`, ano **2026**, `tax_iptu`, titular/imóvel por índice, bases **80.000 + i × 3.500**, taxa **0.5**, competência **2026-10-01T12:00:00Z**, vencimento **2026-11-20T12:00:00Z**, payloads de auditoria e resumo textual original.
- Lock original **`pg_advisory_xact_lock(hashtext('AURORA_SYSTEM_TAX_CASES_V1'))`**, timeout **240 s**, preview/replay e atualização estritamente restrita ao vínculo de imóvel foram preservados. JSON completo antes/depois continua impedindo mudanças monetárias/snapshots fora desse vínculo; origem modificada pelo operador bloqueia substituição automática.
- Escritores públicos de lançamento/guia, vínculo eventual e auditorias usam a mesma tx. Dados/UF/cadastros do dataset importado não são alterados nesta reserva. Nenhuma carga local pesada ou seed remoto foi executado.

## Schema físico

`src/db/schema/tax-final-helpers.ts` mapeia a tabela instalada **`TaxCertificateEvaluation`** completa: **8 colunas, 2 FKs nomeadas, 2 índices secundários, 3 defaults SQL**. Nulabilidade, tipos, defaults, nomes de índices e ações FK conferidos contra o catálogo independente `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json` e SQL original.

Tabelas compartilhadas existentes são importadas para joins/leitura/escrita na tx, sem reescrever seus mapeamentos. Float legado continua Float; monetary numeric usa o mapper Decimal exato. Datas usam colunas tipadas `timestamp(3)` / UTC; SQL raw de aplicação limita-se aos locks, sem DTO raw temporal/monetário declarado artificialmente como `Date`/Decimal. Esse schema é runtime: nenhum SQL histórico, DDL, índice físico ou migration é gerado por ele.

## DDL — wrappers HR/Cemitério e tipos para o parent

### Autoridade e fluxo

Os dois scripts deixaram de carregar/executar uma migration isolada e deixaram de inserir em `_prisma_migrations`. São **wrappers de inspeção da autoridade SQL única**, não migradores de escopo.

- Reutilizam `loadMigrationSet`, `openMigrationConnection` e `runDatabaseMigrations`. **Preview chama `plan` READ ONLY**, com transação/lock/rollback do core. A conexão é fechada em `finally`; erro de cleanup não substitui o diagnóstico transacional.
- `--apply` exige autoridade gerenciada verificada e **`plan.pending.length === 0`**. Só nessa condição chama `deploy`, para confirmar **noop**. Se há qualquer SQL futuro pendente, bloqueia e orienta **`npm run db:migrate:deploy` explicitamente**; não aplica silenciosamente SQL de RH, Cemitério ou outro escopo.
- Além do gate do plano, a conexão encaminhada ao core admite somente SELECTs e os comandos transacionais/lock exatos usados pelo runner. Uma regressão de receipts entre plan/deploy não permite aplicar SQL nem inserir receipts: o wrapper bloqueia e o próprio core reverte. Não há lock próprio, emulação do runner ou nova autoridade.
- Checks de checksum, variantes LF/CRLF/mixed endings, diferenças históricas aprovadas, docs/CI/hash/reviewData e ledger legado congelado pertencem **exclusivamente à provenance validada pelo core**. Os wrappers não recalculam/comparam checksum bruto do antigo checkout Windows. SQL futuro continua sujeito a bytes exatos, sem normalização relaxada.
- CLI agora segue a autoridade: **`DATABASE_MIGRATION_URL` explícita**, `DATABASE_MIGRATION_DRIVER`, timeouts `DATABASE_MIGRATION_*`. Não carrega `.env` automaticamente nem faz fallback silencioso para `DATABASE_URL`. Restrição Vercel de estágio de produção é preservada para `--apply`.

### Flags, metadados e tipos

- RH mantém seletor padrão `20261011030000_hr_workforce_foundation`, `--temporal` e `--consignments`, rejeitando seleção simultânea. Mantidos os oito runtime tables base, `HrEmploymentRevision` temporal, tabelas de consignação, campos `PayrollItem.valueDecimal` / `Payroll.totalValueDecimal` e `HrEmploymentRevision.effectiveFrom` na consignação. Preview retorna `missingRuntimeDependencies`; `--apply` com dependência ausente bloqueia antes do noop.
- Cemitérios mantém os dois nomes selecionados (`cemetery_integrity` / `cemetery_automatic_fees`). Ambos mantêm os campos originais de preview: `mode`, `migration`/`migrations`, `state`; RH mantém `missingRuntimeDependencies`. Estado sincronizado permanece `APPLIED_CHECKSUM_VERIFIED`; `execution` informa `READ_ONLY_INSPECTION` ou `SQL_AUTHORITY_NOOP`, além do relatório completo `authority`/`deploy`.
- `src/db/repositories/tax-final-helpers/migration-inspection.ts` exporta **`MigrationInspectionConnection = Awaited<ReturnType<typeof openMigrationConnection>>`**, **`MigrationInspectionSet = ReturnType<typeof loadMigrationSet>`** e **`MigrationInspectionTimeouts`**. São os contratos da autoridade `.mjs`; não são `DatabaseExecutor`/`DatabaseConnection` promovidos, ORM adapters ou `any`/`unknown` casts de persistência.
- Exports testáveis: `inspectTaxFinalMigrationAuthority(connection, set, names, apply?, timeouts?)`, `withTaxFinalMigrationInspection(apply, callback, environment?)`, `hrMigrationSelection(args)`, `inspectHrMigrations(connection, set, args?, timeouts?)`, `inspectCemeteryMigrations(connection, set, apply?, timeouts?)`. CLI é protegida por identificação do arquivo executado, permitindo import sem conexão automática.
- Handoff de tipos: o parent deve incluir os dois scripts e o novo repository em sua checagem strict; as chamadas ao runner preservam os tipos inferidos de seus módulos `.mjs`. Nenhuma declaração global, configuração TS, runner, policy ou arquivo de baseline foi alterado para contornar inferência.

### Evidência offline e pendência real

Executado a **128 MB**, sem conexão: `node scripts/database-migrate.mjs verify-files` → **`FILES_INTACT_BASELINE_AUTHORIZED`**, **156 históricos / 2 futuros**, `databaseAuthority: NOT_CHECKED`. Os dois SQLs futuros no checkout eram `20261028193000_construction_document_rejection` e `20261028193100_notification_recipient_dedupe`; não foram criados/editados por esta reserva. Seu estado instalado não foi presumido.

A evidência anterior de baseline initialized PASS / 156 receipts / 1006 tabelas / 154398 linhas / hashes iguais / dois deploy-noop pertence à central e não foi repetida aqui. Os wrappers têm suítes locais reais preparadas, **ainda não executadas**. Nenhuma inspeção/conexão/escrita remota foi feita para esta entrega.

## Suíte independente preparada

`tests/drizzle-tax-final-helpers.test.ts` contém um teste puro e uma fixture própria via **replay real da autoridade com todos os 156 SQLs históricos + SQLs futuros atuais**, transportados pelo **Neon/Drizzle reais sobre PGlite loopback**, servidor máximo **10 conexões** e pool máximo **5**. Não deriva DDL de metadata ORM nem importa fixture do owner Tax.

Cenários reais preparados:

1. Titular/inscrição/sócios, política atual, catálogo desativado e escopo UG.
2. Certidão interna, saldos Decimal grandes/exatos, pagamentos não confirmados ignorados, falta de Decimal confirmada explícita, compensação, dívida ativa de sócio e rollback avaliação/auditoria.
3. Simples: bytes/layout/hash/export congelados, decisões versionadas, permissões, publicação posterior, inválidos/duplicados e rollback arquivo/export/auditoria.
4. Saldo exato, suspensão, dívida ativa sem duplicação, origem de outro ente, valor não conciliado, fixed-width e Windows-1252.
5. JSON null versus SQL NULL, strings preservadas, Float e timestamp UTC.
6. Worker: usuário/perfil/módulo/Firebase/permissões/UGs, perfil granular sem update e leitura de mudança não commitada na tx original.
7. Wrappers HR/Cemitério: preview/noop, três seletores HR, dependência ausente, receipts imutáveis, variantes LF **somente históricas**, alteração indevida de receipt, lock central ocupado e bloqueio de SQL futuro sem criar tabela/receipt/ledger legado.
8. Seed: preview integral revertido, falha de auditoria reverte writers nativos, vinte valores/titulares/imóveis/UTC/origens, replay, vínculo histórico estreito e proteção contra alteração pelo operador. **Este cenário depende dos writers core Tax migrados.**

Matchers de rollback exigem SQLSTATE **P0001 + mensagem exata no mesmo erro da cadeia de cause**, rejeitando `Failed query` genérico.

## Verificações realmente executadas e reteste central

- **PASS a 128 MB:** ESLint dos **11 arquivos TS** deste recorte; parser TypeScript dos mesmos 11 arquivos (não typecheck); scan nominal 6/6 sem legado direto/escrita de ledger legado.
- **PASS a 128 MB:** assertions puras extraídas do callback real da suíte, executadas sem carregar PGlite/serviços: mapping físico de 8 colunas / 2 FKs / 2 índices / 3 defaults; fronteira JSON; seis casos de seletor; matcher PostgreSQL estrito.
- **PASS a 128 MB:** verificador offline da autoridade, resultado acima. Não certifica estado do banco.
- **PENDENTE CENTRAL:** typecheck strict incluindo wrappers e callers core, suíte real Tax final helpers completa e build global. Diagnostics pós-fix já foi aprovado pela central. Nenhuma suíte PGlite, tsc/build pesado ou smoke de imports completos foi executado nesta reserva.

Comando para a central, sequencial:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-final-helpers.test.ts
```

Nenhuma alteração nos 156 históricos, core runner/policy/manifest/baseline/config, package/lockfiles/CI, docs globais ou writers compartilhados. Nenhum commit/push ou DDL/DML remoto realizado. As leituras/DDL/DML de fixture descritas acima são apenas código preparado para a execução local autorizada pela central.

## Residual exclusivo — `tests/material-subcategory-costs.test.ts`

Recebido após a entrega dos seis arquivos: migração apenas desse teste e append neste documento. Lidos o arquivo atual, os contratos financeiros, os schemas de Financeiro/Assets/Planejamento e a fixture atual antes da edição. Nenhum helper de fixture, schema ou código de produção foi alterado.

- Removidos o import Prisma, os casts JSON e todos os delegates `f.db.*`. Setup, consultas e atualização de subclasse usam os schemas Drizzle existentes pelo **mesmo `db = connection.db`**.
- Mantida a ponte autorizada **`connectFinanceDrizzleFixture(f.pg)`**, que aponta para o mesmo banco/schema isolado da fixture Planning. Não presume `f.db` legado nem aplica cast ao seu futuro tipo Drizzle. `f.reserve(...)` continua sendo contrato da fixture sob o owner Planning.
- Conferidos por grep/leitura `createCommitment` e `createSettlement`: ambos recebem **`DatabaseConnection` no primeiro argumento**. O teste agora fornece `connection`; `applyStockMovement` continua recebendo a **tx original** de `withDatabaseTransaction(connection, ...)`.
- Preservados os valores/data/atores/UG/entidade e a preparação nominal **DROP da coluna/tabela de fixture + aplicação de `20261014130000_material_subcategories/migration.sql`**, incluindo seus guards de integridade. Não foi substituída por schema gerado nem por constraints enfraquecidas.
- Todas as asserções originais permanecem: custo exato **4.00**, **1 movimento** da fonte, ID de subclasse canônica, nome original no snapshot, congelamento após renomear/inativar e rejeição de subclasse/classe incompatível ou inativa. Adicionada rejeição explícita **`/Produto/`** para produto de classe incompatível, sem criar regra adicional válida ou alterar a seleção do consumo.
- Snapshot é validado por narrowing real de `JsonValue`, sem casts. Fonte e snapshot congelado ausentes falham por `assert.ok`; a contagem de movimentos é consultada por `sourceId`, preservando a relação original.
- **PASS a 128 MB:** ESLint do arquivo; parser TypeScript; scan sem Prisma/delegates/casts de persistência ou JSON; conferência AST dos argumentos Connection/tx e presença das assertions/migration nominal. Isso não é typecheck/runtime.
- **PENDENTE CENTRAL:** executar após a fixture Planning Drizzle estar pronta. Nenhum PGlite, tsc ou build executado nesta correção; nenhuma alteração em src/shared writers/package/Git.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/material-subcategory-costs.test.ts
```
