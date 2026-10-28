# Tributação S2/S3 — motores fiscais, ITBI e DTE em Drizzle

## Entrega de 28/10/2026

**Os dois motores reservados estão migrados até zero referências diretas a Prisma/delegates/transações legadas.** Foram preservados **43 exports**, na ordem original: 20 em `s2-service.ts` e 23 em `s3-service.ts`. Consumidores foram localizados por import e por chamada antes da alteração das assinaturas. A integração transitiva continua dependente dos helpers de coreTax ainda sob migração do ownerTax.

Arquivos desta reserva:

- `src/lib/tributacao/s2-service.ts`
- `src/lib/tributacao/s3-service.ts`
- `src/db/repositories/tax-catalog-rules/{records,itbi,dte}.ts`
- `src/db/schema/tax-catalog-rules.ts`
- `src/lib/contracts/tax-catalog-rules.ts`
- `tests/drizzle-tax-catalog-rules.test.ts`
- Este handoff.

Schemas/repositórios existentes são consumidos por suas tabelas reais, sem editá-los. As escritas tipadas ficam nos novos repositórios exclusivos. Os sete mapeamentos adicionais são objetos **já instalados** (`TaxParameter`, `TaxIntegrationEvent`, `TaxDocumentSequence`, `TaxServiceRequest`, `DteAccessGrant`, `DtePowerOfAttorney`, `DtePowerOfAttorneyEvent`); não representam migrations novas. Conferência de nomes/tipos/nulabilidade pelo catálogo original e SQL histórico, incluindo baseline e triggers `20261015230000_itbi_field_history`.

## Contrato de persistência

- **Leitor:** `DatabaseExecutor`, sempre o executor recebido; nenhuma aquisição de conexão.
- **Dono da operação/transação:** `DatabaseConnection` + `withDatabaseTransaction`.
- **Writer/lock/núcleo intermodular:** `DatabaseTransaction` da origem, sem abrir outra conexão/transação.
- IDs via o gerador central dos schemas; sequência por `INSERT ... ON CONFLICT ... currentValue+1 RETURNING`, com chave física `(year, documentType)`, mesma transação do documento.
- Campos numeric são `Decimal` de `@/db/decimal`, com codificação string pelo column mapper; `Number()` continua apenas nos Float paralelos legados de lançamento e guia. Taxas/frações/participações mantêm seis casas, valores duas casas, arredondamento e memória legal originais.
- Os selects/`returning()` são tipados e devolvem `Date` pelo mapper. SQL cru somente para locks/configuração histórica, sem DTO temporal cru. O teste compara o texto físico por `databaseTimestamp`; não há cast de string para Date nem conversão por fuso local.
- JSON continua com nulls explícitos dentro das memórias e SQL NULL nos campos opcionais omitidos. Os eventos ITBI sem payload continuam SQL NULL; nenhum JsonNull é convertido em objeto vazio ao persistir.
- Retornos não foram envelopados em outro shape: registros completos, `{ group, guides, total: Decimal }`, `{ assessment, events, position }`, listas DTE, tokens/códigos somente nos pontos originais e `{ declarationId, guideId, documentId }` permanecem.

### Atomicidade/locks preservados

S2 conserva origem `ASSESSMENT:<originKey>`, memória congelada/rule recheck sob `FOR SHARE`, validação de contribuinte/imóvel/cadastro econômico/PGV, origem municipal do parâmetro, exercício/UG/ente e reconhecimento patrimonial na transação recebida. Annual pode continuar gravando progresso na mesma transação do lançamento, evento de integração e auditoria.

Revisão/extinção mantêm request congelado/idempotência, saldo Decimal conciliado, documentos GED válidos, proibição com guias abertas, decisões e versões aditivas, restrição abaixo do já pago/compensado, eventos e sincronização da dívida no mesmo commit. `getAssessmentAccount` conserva pagamentos confirmados inclusive em guias documentalmente canceladas, compensações separadas e efeitos não financeiros sem dupla redução de crédito.

DAM parcial/agrupado conserva alvos distintos ordenados, mesmo contribuinte/UG, saldo livre, ausência de baixa e retorno Decimal. Retorno bancário conserva lock da chave antes de existir evento, ordem lançamento → guia, rechecagem de replay/ator/conta/data/status, rejeição sem baixa, pagamento canônico, ingresso de excedente como passivo e evento final atômicos. Transferência/compensação/restituição conservam ingresso obrigatório, autorização GED entre contribuintes, reserva/restauração de disponível e contabilização canônica. A referência contábil continua referindo uma partida real ou permanecendo `PENDENTE`, sem criar arrecadação fictícia.

ITBI conserva modalidade ativa e única origem tributária, bloqueios/avisos da política, perfil imobiliário e modalidade no mesmo ente/UG, todos os débitos confirmados/compensados, fração e compradores/vendedores, até 50 formulários, regra de avaliação corrente e memória legal. Declaração + partes + eventos + avisos + formulários têm a transação da origem. Transmissão grava serviço e evento; análise constitui crédito/contabilidade; confirmação com DAM e GED é atômica. `AUTO_ON_APPROVAL` continua normalizado para `AUTO_ON_PAYMENT`, sem transferir propriedade pela aprovação. `attributeItbiHistory` continua aplicado aos writes e os triggers físicos permanecem ativos.

DTE conserva hashes SHA-256/tokens/códigos, validade, escopo por usuário/contribuinte/estabelecimento, defaults sem sobrescrever configurações existentes, avisos externos sem leitura/ciência, prazo UTC configurado, ciência expressa/tácita, exclusão lógica/retention/assinatura, procuração sem substabelecimento e todas as transições/eventos.

**Extensões de fronteira transacional a integrar nominalmente:** operações S2 antes multipasso fora de transação (`createPixCharge`, `configureCollectionAgreement`, `createReconciliation`) agora possuem uma transação inteira para operação + auditoria. Defaults e as mutações simples de mailbox/grant DTE também recebem conexão para seus writers tipados. Acrescentados locks por chave/linha para esses fluxos e transições DTE, preservando o resultado e tornando atômicos replays concorrentes. No lote DTE, locks são adquiridos por chave ordenada sem mudar a ordem do array de resultados.

## Assinaturas públicas — handoff de TODOS os exports

O primeiro argumento muda conforme a coluna abaixo; os demais argumentos, sua ordem e o retorno conservam os contratos anteriores. `actor` continua `TaxActor`. Os tipos de conexão/execução vêm de `@/db/connection` e `@/db/transaction`. Não usar cast de executor para conexão nem proxy de delegates.

### S2 — 20 exports

| Export | Primeiro argumento | Argumentos seguintes / retorno |
|---|---|---|
| `resolveFiscalRule` | `DatabaseExecutor` | `input` → `{ parameter: registro completo com tax, configuration }` |
| `simulateParametrizedAssessment` | `DatabaseExecutor` | `input` → `{ parameter, calculation, effect: "SIMULACAO_SEM_EFEITO" }` |
| `createParametrizedAssessment` | `DatabaseConnection` | `actor, input` → lançamento |
| `createParametrizedAssessmentInTransaction` | `DatabaseTransaction` | `actor, input` → lançamento |
| `reviseTaxAssessment` | `DatabaseConnection` | `actor, input` → registro da revisão |
| `reviseTaxAssessmentInTransaction` | `DatabaseTransaction` | `actor, input` → registro da revisão |
| `registerCreditEvent` | `DatabaseConnection` | `actor, input` → registro do evento |
| `registerCreditEventInTransaction` | `DatabaseTransaction` | `actor, input` → registro do evento |
| `generatePartialTaxGuide` | `DatabaseConnection` | `actor, input` → guia |
| `generateGroupedTaxGuides` | `DatabaseConnection` | `actor, input` → `{ group, guides, total }` |
| `createPixCharge` | **`DatabaseConnection`** | `actor, input` → integração |
| `processCollectionReturn` | `DatabaseConnection` | `actor, input` → integração |
| `applyTaxCredit` | `DatabaseConnection` | `actor, input` → integração |
| `createReconciliation` | **`DatabaseConnection`** | `actor, input` → registro |
| `configureCollectionAgreement` | **`DatabaseConnection`** | `actor, input` → registro |
| `resolveReconciliation` | `DatabaseConnection` | `actor, input` → registro |
| `approveRefundRequest` | `DatabaseConnection` | `actor, input` → registro |
| `closeReconciliation` | `DatabaseConnection` | `actor, id` → registro |
| `sendAccountingReference` | `DatabaseConnection` | `actor, input` → integração |
| `getAssessmentAccount` | `DatabaseExecutor` | `assessmentId` → `{ assessment, events, position }` |

### S3 — 23 exports

| Export | Primeiro argumento | Argumentos seguintes / retorno |
|---|---|---|
| `ensureTributarioS3Defaults` | **`DatabaseConnection`** | nenhum → `void` |
| `createItbiDeclaration` | `DatabaseConnection` | `actor, input: ItbiDeclarationInput` → declaração com partes |
| `createItbiDeclarationInTransaction` | `DatabaseTransaction` | `actor, input: ItbiDeclarationInput` → declaração com partes |
| `transmitItbiDeclaration` | `DatabaseConnection` | `actor, declarationId` → declaração |
| `analyzeItbiDeclaration` | `DatabaseConnection` | `actor, input` → declaração |
| `analyzeItbiInTransaction` | `DatabaseTransaction` | `actor, input` → declaração |
| `issueItbiDam` | `DatabaseConnection` | `actor, declarationId` → guia |
| `issueItbiDamInTransaction` | `DatabaseTransaction` | `actor, declarationId` → guia |
| `generateItbiDocument` | `DatabaseConnection` | `actor, declarationId` → documento |
| `generateItbiDocumentInTransaction` | `DatabaseTransaction` | `actor, declarationId` → documento |
| `confirmItbiWithDocuments` | `DatabaseConnection` | `actor, input` → `{ declarationId, guideId, documentId }` |
| `createDteMailbox` | **`DatabaseConnection`** | `input` → `{ mailbox, confirmationToken }` |
| `confirmDteMailbox` | **`DatabaseConnection`** | `token` → mailbox |
| `createDteAccessGrant` | **`DatabaseConnection`** | `actor, input` → `{ grant, accessCode }` |
| `validateDteAccessGrant` | `DatabaseExecutor` | `input` → mailbox |
| `revokeDteAccessGrant` | **`DatabaseConnection`** | `id` → grant |
| `sendDteMessages` | `DatabaseConnection` | `actor, input` → array de mensagens |
| `registerDteReading` | `DatabaseConnection` | `actor, messageId` → mensagem |
| `acknowledgeDteMessage` | `DatabaseConnection` | `actor, messageId` → mensagem |
| `applyDteTacitAcknowledgement` | `DatabaseConnection` | `actor, messageId, now = new Date()` → mensagem |
| `deleteDteMessage` | `DatabaseConnection` | `actor, messageId` → mensagem |
| `createDtePowerOfAttorney` | `DatabaseConnection` | `actor, input` → procuração |
| `transitionDtePowerOfAttorney` | `DatabaseConnection` | `actor, id, action` → procuração |

Criação de ITBI preserva `Serializable`/60 s. Emissão de DAM e confirmação coordenada preservam 60 s. Demais donos usam a transação padrão do helper central; nenhum núcleo `InTransaction` reconfigura/encerra a transação recebida.

## Dependências nominais e consumidores

### OwnerTax — integração dos helpers

Na última inspeção, ainda exigiam tipos/delegates Prisma; devem migrar recebendo a origem real, mantendo entrada/retorno/regra:

1. `scope.ts`: `resolveTaxAssessmentScope(db: DatabaseExecutor, actor, taxId, snapshot?: JsonValue|null)`; `resolveTaxFinancialYear(db: DatabaseExecutor, year, scope, requireOpen = true)`; `synchronizeAssessmentDebt(tx: DatabaseTransaction, actor, assessmentId)`. `taxAssessmentCompensatedValue` já aceita executor Drizzle.
2. `index.ts`: `confirmTaxPaymentInTransaction(tx: DatabaseTransaction, actor, input)` e `generateTaxGuideInTransaction(tx: DatabaseTransaction, actor, input)`. Eles não podem abrir outra conexão: retorno bancário e confirmação ITBI dependem do rollback conjunto.
3. `configurable-cadastres.ts`: `saveConfiguredFiscalRecordInTransaction(tx: DatabaseTransaction, actor, raw)` — mesmos values/documentIds/processId/frontage e eventos/versão.

Já estavam usando o executor transacional Drizzle no ponto consumido: `assertPropertyOutsideAssessedSimulation`, `attributeItbiHistory`, `evaluateConfiguredPropertyValuation`, `evaluateItbiEntryPolicy`, `assertNoPendingItbiAdjustments`, helpers de crédito/contabilidade patrimonial e Financeiro. Não se introduziu ponte Prisma para mascarar a pendência dos três grupos acima.

Consumidores transacionais de S2/S3 sob ownerTax/ITBI/portal: `itbi-rectification.ts`, `itbi-contestation.ts`, `itbi-expiry.ts`, `itbi-property-collection.ts`, `itbi-online.ts`, `src/lib/portal-cidadao/tax-executors.ts`. Continuam passando o **mesmo `tx`** aos núcleos; nenhuma alteração no shape pedido.

### Annual — contrato agora entregue

`annual-batches.ts` usa `resolveFiscalRule(tx, ...)`, `simulateParametrizedAssessment(tx, ...)`, `createParametrizedAssessmentInTransaction(tx, actor, ...)`. `annual-rollover.ts` usa `resolveFiscalRule(tx, ...)`. Essas quatro chamadas passam a ter o contrato Drizzle solicitado, inclusive parâmetro completo/tax/configuração, Decimal e Dates. O progresso do item deve continuar fora do núcleo S2 e dentro da mesma transação do caller. Os seis arquivos Annual permanecem reservados para bugs centrais.

### OwnerActions/API/páginas — correções de argumento específicas

- `src/app/app-domain/tributacao/operacoes/actions.ts`: **`createPixCharge`, `configureCollectionAgreement` e `createReconciliation` precisam de `taxActionConnection(context)` sem `.db`**. As outras mutações já passavam conexão na última leitura. `simulateParametrizedAssessment` continua com `.db`.
- `src/app/app-domain/tributacao/domicilio-tributario/actions.ts`: **`createDteMailbox`, `confirmDteMailbox`, `createDteAccessGrant` e `revokeDteAccessGrant` precisam de `ctx.connection`**. `validateDteAccessGrant` conserva `ctx.database`. As demais mutações já passavam conexão.
- `src/app/app-domain/tributacao/domicilio-tributario/page.tsx`: **`ensureTributarioS3Defaults` precisa da conexão correspondente ao contexto**, enquanto as consultas de página conservam executor.
- `src/app/app-domain/tributacao/itbi/actions.ts`: seis mutações e confirmação já passam `context.connection`; conservar os objetos UI `{ error }` existentes.
- `src/app/app-domain/tributacao/motor-fiscal/[id]/page.tsx`: `getAssessmentAccount(database, id)` continua correto, recebe executor e mantém o retorno consumido pela UI.

Nenhuma action/API/página foi editada nesta reserva. Documentos globais, outros coreTax, S9/debt e helpers/writers compartilhados permanecem sob os owners designados.

Testes existentes localizados, preservados para o ownerTax: `tax-financial-chain`, `tax-channel-financial-integrity`, `tax-accrual-accounting`, `planning-execution`, `tax-property-cadastral-completion`, `tax-cadastral-migration-chain`, `itbi-process-completion`. Os testes que ainda passam uma fixture Prisma precisam da conexão/executor da fixture histórica correspondente. Não enfraquecer suas expectativas.

## Verificação realizada e fila do parent

**Executado somente leve/offline:**

- Teste puro `pure catalog rules`: **PASS**, 1/1, callback ~116 ms, processo ~1,11 s, heap 256 MiB. Confere a totalidade das colunas dos sete novos mapeamentos e dos mapeamentos ITBI/DTE existentes com o catálogo físico independente (nomes, tipos e nulabilidade).
- Parsing/transpile de oito arquivos exclusivos: **zero diagnósticos sintáticos**; inventário AST confirmou 20 + 23 exports na ordem original. Não foi typecheck.
- Busca direta de imports/tipos/delegates Prisma, `$transaction` e `$queryRaw`: zero nos dois serviços/repositórios novos.
- ESLint final dos dois motores, três repositórios, schema, contrato e teste: **exit 0, zero erros e zero warnings**.

**Preparado para a fila central, não executado nesta frente:** `tests/drizzle-tax-catalog-rules.test.ts`, uma jornada física com seis subtestes sobre **todos os 156 SQLs históricos**, Neon → socket local → PGlite e queries SQL independentes como oráculo. Reutiliza `tests/helpers/drizzle-tax-accounting-fixture.ts` sem modificá-lo; não usa DMMF ou schema gerado. Pool limitado a um backend: as chamadas em paralelo provam fila/replay/atomicidade, não contenção multissessão real.

Cobertura preparada: regra vigente/overlap; simulação sem efeitos; memória legal congelada/Decimal/UTC; rollback pelo caller após criar lançamento+evento+contabilidade; replay e autorização; revisão/extinção/audit rollback; guias parcial/agrupada sem baixa; PIX; retorno bancário/excedente/referência canônica e rollback de pagamento/caixa; transferência/reserva de restituição/rejeição/restauração; compensação e reversão; convênio aditivo e rollback de vigência; conciliação centesimal; ITBI devedor/partes/fração/regra legal e SQL oracle do imposto; indeferimento; confirmação + contabilidade + guia + GED + histórico no mesmo rollback/replay; DTE hashes/confirmação/delegação/revogação, erro de evento sem mensagem persistida, avisos sem leitura, prazo UTC/ciência/preservação/exclusão lógica, procuração e eventos.

Após integrar os helpers ownerTax e os argumentos de Actions/página acima, executar **centralmente**:

```powershell
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-name-pattern="pure catalog rules" tests/drizzle-tax-catalog-rules.test.ts
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-catalog-rules.test.ts
```

Build/typecheck e suítes físicas pesadas pertencem à fila do parent. DDL/baseline e Annual seguem retidos para bugs centrais; o PASS da baseline Neon relatado pelo parent não foi reexecutado. Nenhum Git, commit/push, mudança em package/lock/CI/config ou DDL/DML remoto nesta missão.
