# Dívida ativa / S9 — migração Drizzle

## Estado em 28/10/2026

Implementação entregue nos quatro arquivos reservados:

- `src/lib/tributacao/s9-service.ts`;
- `src/lib/tributacao/debt-notices.ts`;
- `src/lib/tributacao/debt-notice-output.ts`;
- `scripts/adopt-aurora-active-debt-accounts.ts`.

As buscas nesses quatro arquivos e em `src/db/repositories/tax-active-debt/**` não encontram imports/tipos Prisma, delegates, `$transaction`, `$queryRaw`, `$executeRaw`, DMMF ou casts de compatibilidade. Persistência por Drizzle/SQL parametrizado, Decimal independente e contratos próprios. **Isso não representa zero legado transitivo:** os helpers de `scope.ts` e `index.ts` abaixo ainda exigem a migração pelo owner Tax.

Validação local desta frente: ESLint, parse TypeScript/TSX, catálogo físico e comparação estática de JSX. **As três filas de integração novas, typecheck e build ainda não foram executados por esta frente; pertencem à fila central do parent.** Os testes preparados não devem ser apresentados como testes aprovados.

## Arquivos auxiliares exclusivos

| Caminho | Responsabilidade |
| --- | --- |
| `src/db/repositories/tax-active-debt/records.ts` | Leituras de dívida/contribuinte/pagamentos/vínculo municipal, escopo SQL, locks e sequência atômica |
| `src/db/repositories/tax-active-debt/notices.ts` | Seleção das notificações, origem e guia pagável; writers de registro/auditoria com JSON null explícito |
| `src/db/repositories/tax-active-debt/snapshot.ts` | Normalização independente de snapshots |
| `src/db/repositories/tax-active-debt/account-adoption.ts` | Corpo transacional da adoção contábil, compartilhado pelo CLI e fixture local |
| `src/db/repositories/tax-active-debt/test-fixture.ts` | Fixture autônoma com transporte real Neon/WebSocket/Drizzle sobre PGlite |
| `src/db/schema/tax-active-debt.ts` | Doze projeções exclusivas, 95 colunas; inclui projeções somente leitura de acordos e declarações para BI |
| `src/lib/contracts/tax-active-debt.ts` | `ActiveDebtActor`, `ActiveDebtRecord`, `ActiveDebtEventRecord`, `DebtNoticeDebt`, `DebtNoticeTarget`, `DeclarantDebtPosition` |
| `tests/drizzle-tax-active-debt.test.ts` | Treze subtestes de caminhos próprios e duas filas de integração com o núcleo Tax |

Os schemas são mapeamentos de tabelas existentes, sem geração de DDL. Confronto somente leitura com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **12 tabelas / 95 colunas / zero divergências** de nome físico, tipo SQL normalizado e nullability. `timestamp without time zone` foi normalizado para comparação. Não houve edição do SQL histórico, dos schemas compartilhados nem da baseline aprovada.

## Contratos de persistência e atomicidade

- Leitores independentes recebem `DatabaseExecutor`; serviços proprietários da transação recebem `DatabaseConnection`; participantes recebem **o mesmo `DatabaseTransaction`**. Não há delegates emulados, objeto com `$transaction` simulado, cast para cliente antigo, segunda conexão dentro do callback ou transação substituta.
- `enrollOriginAssessment` é helper **local** de S9: lock de `TaxAssessment`, origem ente/UG, pagamentos confirmados Decimal, compensações, dívida, atualização do lançamento e auditoria `CREATE/ActiveDebt` participam da mesma transação que o evento S9 `INSCRICAO`.
- Revisão de paridade com `index.ts:enrollAssessmentInActiveDebt`: preservados rejeição de `Pago/Cancelado/Suspenso`, retorno da dívida já existente após autorização da origem, saldo `finalValueDecimal ?? originalValueDecimal` menos arrecadação/compensação, exercício/contribuinte/tributo/UG/ente, estado `PENDENTE_DE_VALIDACAO`, lançamento `Dívida Ativa` e payload `{ assessmentId, value: saldo.toFixed(2), status }`. A fila nova verifica auditoria única e rollback no evento posterior. O wrapper antigo do núcleo não é invocado, pois abriria outra transação.
- Locks das operações de dívida: **lançamento → dívida**; lotes deduplicam e ordenam IDs de lançamentos e dívidas. Pagamento: lançamento → guia → dívida. Sequências de CDA/execução usam upsert atômico na tabela física de sequências. Os locks dos workflows funerários e advisory locks de replay permanecem nos pontos correspondentes.
- CDA: número por exercício, primeira versão, novas versões, anotações e assinatura interna mantidos. `contentSnapshot` e `caseSnapshot` são preservados; assinatura interna não vira certificação ICP-Brasil. Protocolo e MNI permanecem registros internos.
- Reconhecimento/reclassificação/extinção/devolução recebem o `tx` originador. CDA reclassifica somente direito já reconhecido, pelo saldo residual; legado não recebe reconhecimento retroativo nem segunda VPA. Período contábil fechado, exercício de operação e contas congeladas continuam validados pelos helpers contábeis existentes.
- Protesto: seleção, lote, retorno parcial/total, desistência/cancelamento, anuência e baixa por pagamento integral mantidos; baixa por pagamento exige pagamentos/compensações nativos conciliados. Execução conserva anexos, etapas, agenda e eventos.
- Carteiras mantêm saldos Decimal e remoção de dívidas pagas/canceladas/baixadas/devolvidas. Filtro de UGs `[]` continua seleção vazia; ausência do filtro mantém a semântica administrativa existente.
- `issueCemeteryFee` chama diretamente `createTaxAssessmentInTransaction(tx, ...)` e `generateTaxGuideInTransaction(tx, ...)`; origem, lançamento, guia e vínculo com movimento/concessão usam uma transação de 60 s. `enrollCemeteryFeeInDebt` usa o helper local, com auditoria e evento atômicos e sem evento duplicado no replay.
- Workflow funerário: registro, localização, ocupação, histórico, atualização do Cadastro Único, fato gerador e chave de replay permanecem na transação original. O processamento automático posterior do fato gerador continua pelo serviço cemiterial existente, depois do commit do workflow, como no fluxo anterior. Não se confunde rollback do fato gerador com rollback de uma cobrança posterior.
- JSON: Date → ISO, Decimal → texto, `undefined` em objeto omitido / em array convertido em null, número não finito → null. Writers que recebem null explícito usam `JsonNull`, preservando **JSON null distinto de SQL NULL**. Campo ausente permanece omitido/default.
- Timestamps de DTOs produtivos são lidos por colunas Drizzle tipadas. SQL bruto próprio é de lock/configuração ou escalar, sem DTO temporal anotado ficticiamente como Date. Uma futura leitura raw de timestamp deve usar wire DTO e `databaseTimestamp`.

### Isolamentos e timeouts

- Operações S9 curtas: 5000 ms; CDA, DAM, pagamento, extinção/prescrição e taxa funerária: 60000 ms.
- Emissão de notificações: serializable / 120000 ms; cancelamento: serializable / 5000 ms.
- Adoção de contas: 60000 ms; helper recebe transação e não cria conexão.
- Operações CRUD simples mantêm a escrita pelo executor da conexão fornecida. `ensureS9Defaults` mantém o contrato de executor, usado pela página e pelos serviços.

## Notificações e script de adoção

`selectDebtNoticeTargets` conserva origem JSON exata, seleção imobiliária/econômica, titular/inscrição, endereço do perfil econômico, pagamentos, compensações, mínimo e vencidos. Cota condicional vencida usa memória bruta conciliada. `issueDebtNoticeBatch` refaz a prévia dentro da transação e valida o fingerprint após locks ordenados. Emissão, referências cadastrais, lote e auditoria são atômicos; cancelamento é adicional e auditado.

PDF/TXT/XML usam o destinatário/saldo congelados na emissão. A impressão de boleto ainda consulta a situação atual da guia, registro bancário e pagamentos; guia paga/cancelada/vencida não volta a ser boleto pagável. Validação bancária usa **Decimal para centavos do código de 44 dígitos**, mantendo verificação de DV e regras de código bancário.

O CLI de adoção resolve uma conexão explícita e fecha o pool em `finally`. O corpo foi extraído sem importar dotenv no teste. Conserva advisory lock, hash e ano da fonte, seis contas, atributos oficiais, matriz por tributo/UG, catálogo imutável publicado, dry-run de leitura, aplicação aditiva, replay e auditoria única. Adoção não faz escrituração nem reconhecimento patrimonial de legado. **O CLI não foi executado**, nem em dry-run remoto; a cobertura preparada chama o helper exclusivamente na fixture local.

## Exports e consumidores conferidos

Inventário por busca e AST de imports/reexports em `src/**`, `tests/**` e `scripts/**`. Argumentos de negócio e retornos permanecem os existentes; o primeiro argumento expressa o contrato Drizzle. S9 conserva 52 funções exportadas, mais o alias de leitura solicitado.

### Contratos públicos

| Primeiro argumento | Exports |
| --- | --- |
| `DatabaseExecutor` | `ensureS9Defaults`, `listEnrollmentCandidates`, `daBook`, `selectProtestCandidates`, `tributarioBi`, `declarantDebtSnapshot` e alias `declarantDebtSnapshotExecutor` |
| `DatabaseConnection` — dívida | `enrollAssessmentDebt`, `enrollManualDebt`, `validateDebt`, `issueCda`, `annotateCda`, `createCdaVersion`, `signCdaInternal`, `createDaPortfolio`, `refreshDaPortfolio`, `issueDaGuide`, `suspendDebt`, `resumeDebt`, `returnDebtToOrigin`, `settleDebtByGuide`, `writeOffDebt`, `runPrescription` |
| `DatabaseConnection` — protesto/execução | `createProtestBatch`, `registerProtestReturn`, `resolveProtestItem`, `createExecutionBatch`, `openExecutionCase`, `advanceExecutionCase`, `registerMni`, `scheduleHearing` |
| `DatabaseConnection` — cemitério | `createCemetery`, `createSector`, `createGrave`, `registerEmployee`, `registerFuneralHome`, `createDeathCause`, `createCemeteryChapel`, `createCemeteryOssuary`, `createCemeteryIdentificationField`, `createCemeteryLot`, `setCemeteryEntityActive`, `registerDeceased`, `registerMovement`, `createCemeteryProcess`, `advanceCemeteryProcess`, `attachCemeteryDocument`, `createCemeteryFeeRule`, `grantConcession`, `issueCemeteryFee`, `enrollCemeteryFeeInDebt` |
| Funções puras | `cemeteryOccupancy`, `concessionCurrentSituation`; sem consumidor estático externo encontrado, preservadas |
| Notificações | `selectDebtNoticeTargets(DatabaseExecutor, ...)`, `issueDebtNoticeBatch(DatabaseConnection, ...)`, `cancelDebtNotice(DatabaseConnection, ...)`, `renderDebtNoticeOutput(DatabaseExecutor, ...)` |
| Adoção | `adoptAuroraActiveDebtAccountsInTransaction(DatabaseTransaction, apply)`; consumidores: CLI reservado e teste novo |

Contrato solicitado para TaxActions:

```ts
declarantDebtSnapshotExecutor(
  executor: DatabaseExecutor,
  taxpayerId: string,
): Promise<DeclarantDebtPosition>
```

É alias da mesma implementação de `declarantDebtSnapshot`; aceita tanto `connection.db` quanto o `tx` já recebido. O DTO em `src/lib/contracts/tax-active-debt.ts` contém `checkedAt`, `hasDebt`, `total` textual com duas casas, contagens, lançamentos e dívidas. Não existe corte de 120 nem duplicação dos lançamentos já inscritos. O nome antigo também é um leitor Drizzle, sem emulação de cliente legado.

### Chamadores produtivos e encaminhamento ao owner TaxActions

Prefixo **A**: `src/app/app-domain/tributacao/`; **C**: `src/app/app-domain/cemiterios/`.

| Chamador | Contrato observado / encaminhamento |
| --- | --- |
| A `divida-ativa/actions.ts` | 24 mutações de dívida/protesto/execução já recebem `c.connection`; manter o tratamento de erros dos clients |
| A `divida-ativa/page.tsx` | `ensureS9Defaults`, candidatos, protesto e livro recebem executor |
| A `bi-tributario/actions.ts`, `bi-tributario/page.tsx` | `tributarioBi` recebe executor |
| A `cemiterios/actions.ts` | Dez mutações já recebem `c.connection` |
| C `actions.ts` | Vinte operações S9 já recebem `databaseConnection` |
| C `processos/workflow-actions.ts` | Mutações recebem conexão; `checkWorkflowDebt` chama o nome antigo com `context.database ?? db`. Alias `declarantDebtSnapshotExecutor` disponível para a adaptação nominal pelo owner; chamada atual já satisfaz o contrato de executor |
| A `notificacoes/actions.ts` | Prévia com `database`; emissão/cancelamento com `connection`; contrato `{ error }` já preservado pelo owner |
| `src/app/api/tributacao/notificacoes/route.ts` | Output com `taxActionConnection(context).db`, preservando headers e tratamento HTTP existentes |

Nenhuma action/API foi editada nesta reserva. A adaptação nominal opcional do consumidor cemiterial e qualquer ajuste adicional do contexto de tenant devem ser feitos pelo respectivo owner. Não substituir resultado `{ error }` por throw em actions aguardadas por clients; preservar o contrato real do consumidor.

### Testes externos reservados

- `tests/active-debt-collection-chain.test.ts`: ainda usa `createPlanningExecutionFixture`/delegates; leitores S9 devem receber executor e mutações conexão após migração autônoma da fixture pelo owner.
- `tests/tax-accrual-accounting.test.ts`: mesma pendência de fixture/consumidores; chamadas S9 `issueCda`, `returnDebtToOrigin`, `writeOffDebt` exigem conexão.
- `tests/tax-channel-financial-integrity.test.ts`: prévia de notificações exige executor; emissão exige conexão; fixture ainda legada.
- `tests/cemetery-workflow-service.test.ts`, `tests/cemetery-query-attachments.test.ts`: já usam transporte Drizzle e conexão para mutações / executor para a posição do declarante. Permanecem para regressão central, incluindo cobrança automática dependente do núcleo Tax.

Esses arquivos não foram alterados por esta frente.

## Dependências do owner Tax e validação transversal

| Helper externo ainda legado na versão conferida | Contrato necessário |
| --- | --- |
| `scope.ts:resolveTaxAssessmentScope` | `(executor: DatabaseExecutor, actor, taxId, snapshot?: JsonValue \| null)`; retorna `{ budgetUnitId: string \| null, governmentEntityId: string \| null }` |
| `scope.ts:resolveTaxFinancialYear` | `(executor: DatabaseExecutor, year, scope, requireOpen?)`; retorno independente com `id`, `year`, `status`, datas e ente |
| `index.ts:createTaxAssessmentInTransaction` | `(tx: DatabaseTransaction, actor, input existente com Decimal independente, options?: { legacyDebtOriginId: string })`; retorna lançamento completo, sem abrir transação |
| `index.ts:generateTaxGuideInTransaction` | `(tx: DatabaseTransaction, actor, { assessmentId, dueDate, documentId? })`; retorna guia completa |
| `index.ts:confirmTaxPaymentInTransaction` | `(tx: DatabaseTransaction, actor, input existente)`; mantém financeiro/tesouraria, integração, auditoria e baixa da origem no mesmo `tx` |

`taxAssessmentCompensatedValue` já possui overload Drizzle e usa o executor fornecido; a reserva usa esse contrato. `reclassifyActiveDebtInTransaction`, `returnActiveDebtReceivableInTransaction`, `postTaxAssessmentAdjustment` e os serviços cemiteriais já são Drizzle, mas sua execução integrada ainda depende dos helpers legados acima. Não resolver essa pendência com casts, facade Prisma, conexão global ou transação nova.

Integração transversal de responsabilidade do núcleo/parent:

- S8: parcelamento/reparcelamento, revisões, pagamentos e estados de acordo devem conservar seus vínculos, rateios e saldos. S9 apenas lê os totais de acordos para BI; o serviço S8 continua fora desta reserva.
- S10: apuração/competência, notificações de correção, leitura, divergências e estimativas continuam no serviço proprietário; não declarar sua migração a partir da conclusão de S9.
- Reenvio/recebimento/edital de notificações, credenciais fiscais, fóruns, integração financeira e estornos presentes em outros serviços exigem regressão nos respectivos owners. A suíte nova cobre emissão/cancelamento/saída das notificações dos dois arquivos reservados, não comprova os workflows externos.
- Reexecutar as filas anteriores imobiliária/PGV, econômica/A1 e páginas conforme os handoffs `drizzle-tax-property-progress.md`, `drizzle-tax-economic-progress.md` e `drizzle-taxation-pages-progress.md`. O reteste central das correlações SQLSTATE `42702` de `listPageValuationTaxes` continua pendente de retorno nesta frente.

## Renomeação dos oito componentes TSX

Prop e variáveis locais `prisma` → `database`, por arquivo analisado individualmente:

| Componente relativo a A | Tipo da prop |
| --- | --- |
| `cadastros-fiscais/ConfiguredFiscalDetails.tsx` | `DatabaseExecutor` |
| `economico/[id]/EconomicHistory.tsx` | `DatabaseExecutor` |
| `economico/[id]/EconomicProcesses.tsx` | `DatabaseExecutor` |
| `economico/[id]/EconomicProfilePosition.tsx` | `DatabaseExecutor` |
| `imoveis/[id]/PropertyHistory.tsx` | `DatabaseExecutor` |
| `imoveis/[id]/PropertyProfilePosition.tsx` | `DatabaseExecutor` |
| `imoveis/[id]/PropertyStructure.tsx` | `DatabaseConnection` |
| `itbi/comunicacao/ItbiFieldHistory.tsx` | `DatabaseExecutor` |

Chamadores TSX próprios também adaptados: `imoveis/[id]/page.tsx`, `economico/[id]/page.tsx`, `itbi/comunicacao/page.tsx`. As duas composições internas de histórico passam `database` aos filhos. `PropertyStructure` continua recebendo a conexão para seu snapshot repeatable-read; não é convertido em leitor sem transação.

Comparação somente leitura contra `C:/Users/trici/AppData/Local/Temp/opencode/active-debt-before/tributacao/`:

- **11 arquivos / 14 raízes JSX**;
- **8 raízes literalmente idênticas**;
- seis raízes diferem somente pelas **nove bindings de infraestrutura** em custom components;
- após normalizar exclusivamente o nome da prop, seu identificador equivalente e finais de linha, **14 raízes equivalentes**;
- nenhuma outra diferença de marcação, classes ou texto foi encontrada por essa comparação estática. Isso é evidência de AST, não execução de renderização/browser nem alegação de igualdade byte a byte de todos os TSX. Em particular, **não se declara `59/59` byte equality**.

As diferenças não visuais são em `EconomicHistory.tsx`, `PropertyHistory.tsx` e nas três páginas chamadoras acima. Guia local Next.js de Server/Client Components consultado; os objetos de persistência permanecem em componentes server-only.

## Filas novas preparadas para o parent

`createActiveDebtDrizzleFixture` aplica em ordem as **156 migrações históricas completas** de `prisma/migrations-ibema/**/migration.sql`, via helper de transporte local já existente. Não usa DMMF, metadados gerados, fixture Prisma ou banco municipal. Os seeds de escopo, contribuintes, origem e contas são locais. Triggers de falha dos testes são temporários e instalados somente nessa base isolada.

PGlite possui um backend: `pool.options.max = 1` serializa chamadas concorrentes pelo pool Neon real. `Promise.all` exercita replay/idempotência de entradas concorrentes, **não demonstra contenção entre sessões PostgreSQL independentes**. Para contenção real, o parent precisa de uma fixture PostgreSQL dedicada no gate correspondente.

### Fila 1 — caminhos próprios

Nome: `Dívida ativa: núcleo S9 e notificações sobre todo o SQL histórico`.

Treze subtestes preparados: origem manual/escopo/futuros/rollback; CDA/versões/assinatura; carteira/suspensão; protesto/retorno/baixa; execução/MNI/agenda/anexos; posição do declarante com 123 lançamentos; notificação/histórico/cancelamento/rollback; seleção econômica; compensação e cota condicional; boleto válido/valor/DV/guia paga; JSON null e BI com imóvel cujas classificações são null; workflow funerário; dry-run/aplicação/replay/imutabilidade/rollback da adoção contábil.

### Fila 2 — núcleo tributário e financeiro

Nome: `Dívida ativa integração: inscrição, CDA legada, extinção e pagamento na tx de origem`.

Preparada para verificar inscrição concorrente e auditoria única; rollback final da inscrição/extinção/pagamento; CDA legada sem reconhecimento retroativo; replay de guia; baixa justificada e rejeição de repetição divergente; pagamentos `0.01 + 100.02`, replay e saldo de tesouraria; regularização de origem histórica sem segunda constituição; taxa funerária com rollback da auditoria da guia; inscrição de taxa sem evento duplicado.

### Fila 3 — integração patrimonial

Nome: `Dívida ativa integração patrimonial: saldo residual, competência, devolução e extinção sem segunda VPA`.

Preparada com catálogo e perfis municipais publicados para verificar reconhecimento, rollback de CDA após escrituração, reclassificação/replay, recebimento sem segunda VPA, devolução pelo residual, período fechado, prescrição/extinção, e reclassificação de saldo após pagamentos/compensações prévios. Os seeds de pagamento/compensação desse último cenário isolam o cálculo residual; o cenário anterior exercita a arrecadação completa pelo helper financeiro.

### Comandos centrais (não executados nesta frente)

Fila própria isolada:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="^Dívida ativa: núcleo" tests/drizzle-tax-active-debt.test.ts
```

Depois da adaptação de `scope/index`, filas completas, sequenciais, seguidas do gate central:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-active-debt.test.ts
npm run typecheck
npm run build
```

O parent também deve rodar os testes externos reservados após a adaptação das suas fixtures. Falhas de runtime/TypeScript que pertençam aos arquivos desta reserva devem retornar para correção; lint/catalog/parse não substituem esses gates.

## Evidência leve e encerramento da reserva

- ESLint direcionado aos quatro arquivos, auxiliares, teste novo, oito componentes e três páginas: zero erros/avisos.
- Parse sintático de 23 arquivos TS/TSX: zero diagnósticos; contagem física de 156 migrações confirmada.
- Schema exclusivo confrontado com catálogo: 12 tabelas / 95 colunas / zero divergências.
- JSX: 8/14 raízes literais e 14/14 após normalização restrita às nove bindings não visuais.
- Consumidores de exports conferidos por busca e AST; dependências/adaptações externas registradas acima.
- Testes pesados/PGlite, typecheck, build, execução do CLI, Git e mutações remotas não foram realizados por esta frente. As alterações estão sem commit.
