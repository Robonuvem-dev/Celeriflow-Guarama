# Tributação anual — migração Drizzle

## Estado em 28/10/2026

Os **seis arquivos exclusivos** foram migrados: `annual-batches.ts`, `annual-batch-cron.ts`, `annual-rollover.ts`, `annual-comparison.ts`, `annual-tax-summary.ts` e `scheduled-guides.ts`. Não há referência direta ativa a Prisma, delegates, `$transaction` ou `$queryRaw` nesses arquivos nem em `src/db/repositories/tax-annual/**`. A certificação transitive depende da integração do coreTax abaixo. A reserva foi pausada para implementar a baseline DDL autorizada e retomada em seguida.

### Unidades entregues

| Unidade | Contrato preservado |
|---|---|
| Lotes | Validação dos até 5.000 alvos, ordenação/hash da solicitação, advisory lock de idempotência por ente, simulação sem lançamento/guia/contabilização, memória congelada de regra/alvo/contribuinte/avaliação, autorização do responsável e UG |
| Claim/execução/retomada | `FOR UPDATE` do lote como claim, item `PENDING` ordenado por ID, limite 1–100/padrão 25, uma transação por item, validações após locks `FOR SHARE`, origem anual durável, conciliação Decimal/UG/ente/exercício, progresso e auditoria na mesma transação da efetivação/contabilização; falha só é registrada em transação posterior ao rollback e ainda condicionada a `PENDING` |
| Agendamento/cancelamento | Reapresentação apenas de falhas, fundamento do replay igual ao registrado, vencimento futuro respeitado, estados finais protegidos, cancelamento aditivo sem apagar lançamentos individuais, triggers históricos intactos |
| Cron | Ator/perfil/módulo ativos, Firebase UID, permissão de visualizar/criar/alterar e UGs explícitas; até 10 lotes próprios com item pendente e data vencida, ordenados por data/ID, 25 itens por lote, resposta de falha por lote preservada |
| Virada anual | Locks por ente/tributo/novo exercício e chave de idempotência, regra anterior intocada, origem municipal/versão/calendário/opções congelados, correção explícita de 29/02, nenhum overlap ativo, evento `ANNUAL_RULE_COPIED`/registro de escopo/audit na mesma transação |
| Guias | `Serializable`, lock do lançamento, versão por `updatedAt`, restrições de estado/recebimento/compensação/dívidas, calendário/soma/centavos, cota única e desconto condicionado sem baixa, numeração atômica por exercício/tipo, guia + status + registro imutável + audit na mesma transação |
| Relatórios | `RepeatableRead`, mesmos filtros/escopos JSON tipados, pagamentos somente confirmados, guias canceladas fora da contagem ativa, compensações separadas de caixa, benefícios por classificação mais recente, contadores/métricas NET/VENAL/pendências Decimal, strings monetárias e snapshots/retornos preservados |
| Classificação de benefício | `Serializable`, autorização de UG, advisory lock da regra, versão otimista, evento aditivo com `previousId`, auditoria before/after com JSON null preservado |

## Arquivos exclusivos novos

- `src/db/schema/tax-annual.ts`: mapeamentos runtime completos de `TaxAnnualBatch`/`TaxAnnualBatchItem`, inclusive numeric(24,2), e projeção de leitura de `TaxBenefitGrant`. Conferidos contra o catálogo instalado e `20261014110000_tax_annual_batches`; não geram DDL.
- `src/db/repositories/tax-annual/records.ts`: leitores `DatabaseExecutor`, locks/escritas exclusivamente `DatabaseTransaction`, registros/parametrização/auditoria/eventos SQL físicos com parâmetros vinculados.
- `src/db/repositories/tax-annual/guides.ts`: leitores de emissão e writes/numeração atômica de guia na transação de origem.
- `src/db/repositories/tax-annual/reports.ts`: projeções tipadas, relações sem multiplicar lançamentos/pagamentos, recorte por ente/UG/exercício e benefícios.
- `src/db/repositories/tax-annual/cron.ts`: identidade/perfil/empregado/permissões/UGs/módulo do ator agendado.
- `src/lib/contracts/tax-annual.ts`: DTO independente do lote/posição/variação anual.
- `tests/drizzle-tax-annual.test.ts`: teste puro e duas jornadas físicas, Executivo e Legislativo, com seis subtestes cada.

Schemas existentes são importados **somente para leitura** nesta implementação. Os shared writers usam SQL físico explícito no repositório exclusivo, sem editar schemas/repositórios/lib actions de outros owners. A criação dos itens é dividida em grupos de 500 parâmetros vinculados **dentro da mesma transação**, conservando o máximo de 5.000 alvos sem exceder o limite de parâmetros PostgreSQL.

Todos os selects temporais de produção usam os mapeadores de coluna tipada. Os writes raw recebem ISO UTC explicitamente; não retornam strings temporais como se fossem `Date`. O único `RETURNING` raw da numeração devolve integer. Numeric é persistido por string Decimal exata; `Number()` aparece somente na coluna Float paralela da guia, como no contrato anterior. `JSON.stringify` preserva null dentro de snapshots, e JSON null/SQL NULL continuam distintos nas leituras. Não há adaptação por proxy, cast de executor, delegate simulado nem abertura de conexão de dentro de um writer transacional.

## Handoff exato — assinaturas públicas

Todos os primeiros argumentos que antes eram `PrismaClient` passam a **`DatabaseConnection`**, importado de `@/db/connection`. Parâmetros seguintes e objetos retornados conservam o contrato anterior:

```ts
simulateTaxAnnualPropertyBatch(connection, actor, raw)
simulateTaxAnnualBatch(connection, actor, raw: AnnualBatchInput)
queueTaxAnnualBatch(connection, actor, { batchId, scheduledAt: Date, reason })
processTaxAnnualBatch(connection, actor, batchId, limit = 25) // { processed, failures }
cancelTaxAnnualBatch(connection, actor, { batchId, reason })
processTaxAnnualCron(connection, actorId: string | undefined) // { actorId, results }
copyTaxAnnualRule(connection, actor, raw: AnnualRuleCopyInput)
issueScheduledAssessmentGuides(connection, actor, raw) // { guideIds }
readAnnualTaxComparison(connection, actor, filters)
readAnnualTaxSummary(connection, actor, raw)
classifyBenefitForAnnualReport(connection, actor, raw)
```

**Os dois relatórios também precisam de `DatabaseConnection`**, pois abrem a transação RepeatableRead; não basta passar `context.database ?? db`. As consultas ordinárias dos repositórios recebem `DatabaseExecutor`. `annualValueChange(first: Decimal, second: Decimal): AnnualValueChange` usa `@/db/decimal`; o retorno continua `{ difference: string, percentage: string | null }`. Schemas de entrada/Zod e tipos `AnnualBatchInput`/`AnnualRuleCopyInput` permanecem compatíveis.

### Dependências externas do ownerTax

Estas funções precisam aceitar o executor **real fornecido**, preservando seus retornos atuais e sem conexão adicional:

```ts
resolveTaxAssessmentScope(
  db: DatabaseExecutor, actor: TaxActor, taxId: string,
  snapshot?: JsonValue | null,
): Promise<{ budgetUnitId: string | null; governmentEntityId: string | null }>

resolveTaxFinancialYear(
  db: DatabaseExecutor, year: number,
  scope: { governmentEntityId: string | null }, requireOpen?: boolean,
) // registro completo, Dates tipadas

resolveFiscalRule(
  db: DatabaseExecutor,
  input: { taxId: string; parameterId?: string; effectiveAt: Date },
) // { parameter completo com Dates/JSON, configuration: FiscalRuleConfiguration }

simulateParametrizedAssessment(
  db: DatabaseExecutor,
  input: { taxId: string; parameterId?: string; taxableBase: string | number; effectiveAt: Date },
) // { parameter, calculation com Decimal, effect: "SIMULACAO_SEM_EFEITO" }

createParametrizedAssessmentInTransaction(
  tx: DatabaseTransaction, actor: TaxActor,
  input: {
    taxId: string; parameterId?: string; taxpayerId: string;
    taxableBase: string | number; competence: Date; realEstateId?: string;
    economicRegistrationId?: string; originKey: string;
  },
) // lançamento completo, originalValueDecimal: Decimal|null e calculationSnapshot: JsonValue|null
```

`taxAssessmentCompensatedValue(DatabaseExecutor, assessmentId): Promise<Decimal>` já possuía a implementação Drizzle por executor fornecido na última inspeção. `assertPaymentOptionDebtEligibility` já exige `DatabaseTransaction`. O núcleo S2, sua verificação de imóvel/PGV e o reconhecimento contábil devem continuar na **mesma transação recebida do lote**, nunca em um wrapper que abra outra. `scope.ts`/`s2-service.ts` ainda possuíam contratos Prisma na última leitura desta frente; nenhum cast foi usado para mascarar a integração pendente.

### Consumidores localizados antes de mudar assinaturas

- Owner TaxActions: `lotes-anuais/actions.ts`, `calendarios/actions.ts`, `resumo-anual/actions.ts`, `comparativo-anual/exportar/route.ts`, `src/app/api/tributacao/lotes-anuais/processamento/route.ts`. Na conferência final, esses consumidores já estavam recebendo `connection` via trabalho do ownerActions. Esta frente não os editou.
- Owner de páginas/parent: `comparativo-anual/page.tsx` e `resumo-anual/page.tsx` ainda chamavam os relatórios com o executor `database`; substituir **apenas o argumento de conexão**, preservando JSX/CSS/autorizações.
- Tipos UI: `lotes-anuais/AnnualBatchesClient.tsx`, `resumo-anual/AnnualSummaryClient.tsx` usam apenas os tipos/retornos compatíveis.
- Testes legados externos: `tests/tax-annual-batches.test.ts`, `tests/tax-annual-options-rollover.test.ts`, `tests/tax-property-cadastral-completion.test.ts`, `tests/tax-channel-financial-integrity.test.ts`. O parent deve migrar suas fixtures/argumentos Prisma para a conexão correspondente, sem enfraquecer expectativas. Não foram alterados nesta reserva.

## Validação e fila central

**Executado nesta frente:**

1. ESLint em todos os seis serviços, quatro repositórios novos, schema, contratos e teste: **exit 0**.
2. `node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-name-pattern="pure annual" tests/drizzle-tax-annual.test.ts`: **um teste aprovado**, zero falhas; 34 colunas completas dos dois lotes e cinco colunas projetadas de benefícios conferidas com o catálogo, numeric(24,2)/numeric(18,2), nulabilidade/Date e Decimal/validações. Duração total aproximada de **9,30 s**, callback puro **0,15 s**. Nenhuma fixture física foi criada por esse filtro.
3. Grep final: zero referências diretas Prisma/delegates/transações legadas nos seis arquivos e repositórios exclusivos.

**Preparado, não executado:** duas jornadas físicas reais via Neon → socket local → PGlite com SQL histórico original e todos os constraints/triggers, sem DMMF ou DDL fabricado para aliviar restrições. Reutiliza, sem modificar, `tests/helpers/drizzle-tax-accounting-fixture.ts`; limita seu pool a **uma** conexão antes das chamadas concorrentes porque PGlite possui um backend. Demonstra fila/idempotência/atomicidade, não contenção PostgreSQL multissessão real.

Cobertura física preparada: simulação sem efeitos; replay/targets reordenados; autorização; falha injetada no progresso revertendo lançamento/evento/contabilidade/itens juntos; retomada e origens anuais sem duplicação; avaliação canônica Decimal com seis casas, null e Date; cadastro econômico e agendamento futuro/cancelamento imutável; cópia anual aditiva, versão, overlap e 29/02; soma/centavos de parcelas; rollback da numeração/guias/audit/status; cota condicionada sem caixa/contabilidade; comparação NET/VENAL, benefícios e classificação aditiva, guias/lançamentos cancelados, pagamentos estornados, compensações e pendências Decimal; segregação de UG/ente; cron com permissões/contexto/UGs e retomada.

Após integrar scope/S2 e os dois consumidores de página, executar centralmente:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-annual.test.ts
```

Typecheck/build globais continuam com o parent. Não houve execução física pesada, seed, DDL/DML remoto, alteração de pacote/lock/config/CI, Git, commit ou push nesta frente. A reserva de Cemitérios segue disponível para correções de testes informadas pelo parent. O handoff DDL/baseline autorizado está em `docs/drizzle-ddl-progress.md`.
