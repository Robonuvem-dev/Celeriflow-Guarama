# Contabilidade tributária — migração Drizzle

## Ownership e estado

Escopo exclusivo transferido em 28/10/2026: sete motores `accounting-movements`, `accounting-profile`, `accrual-accounting`, `credit-finance`, `credit-reversal`, `payment-reversal`, `conditional-discounts` e três scripts `adopt-aurora-tax-{accounting,accrual-accounts,accrual-profiles}`. **Implementação dos dez arquivos concluída; integração de tipos/runtime pendente dos handoffs externos e da execução central.** Varredura do recorte: zero imports/acessos Prisma, `$transaction`, `$queryRaw`, `$executeRaw` e casts de compatibilidade `as unknown as`. Frotas entregue permanece preservado.

## Contratos para integração pelos owners

- Funções públicas conservam nomes, ordem dos argumentos, regras e retornos. O argumento que abria `$transaction` passa a `DatabaseConnection`: `readTaxAccountingMovements`, `configureTaxAccountingProfile`, `configureTaxDebtAccountingProfile`, `executeTaxRefund`, `reverseTaxCreditMovement`, `reverseTaxPayment`. Chamadores devem fornecer `databaseConnection` (ou conexão local injetada), não `context.database`/`db` isolado.
- Helpers que postam eventos recebem a **mesma `DatabaseTransaction` de origem**, inclusive `taxCollectionReceivableAccount`. Helpers exclusivamente de leitura como `assertTaxCreditScope` aceitam `DatabaseExecutor`. Nenhum helper abre conexão/transação secundária.
- Owner Tax: migrar `scope.ts` (`resolveTaxAssessmentScope`, `resolveTaxFinancialYear`, `synchronizeAssessmentDebt`), `itbi-ownership.ts` (`reversePaidItbiInTransaction`) e transações dos consumidores `index`, `s2/s3/s4/s8/s9-service`, `scheduled-guides` integralmente. Não passar executor legado a helpers migrados.
- Owner Tax/páginas: `operacoes/actions.ts`, `guias/actions.ts` e `movimentacoes-contabeis/page.tsx` devem fornecer `DatabaseConnection` às seis funções acima. Actions mantêm o tratamento de erro da UI.
- Owner Finance: `index.ts` chama `taxCollectionReceivableAccount(tx, actor, input)` com a transação financeira original; os posters, período, saldo bancário e saldo por fonte já têm contratos Drizzle. Não alterar estas bibliotecas neste escopo.
- Testes consumidores localizados: `tax-accrual-accounting`, `tax-accounting-movements`, `tax-document-integration`, `tax-financial-chain`, `active-debt-collection-chain`, `tax-cadastral-migration-chain`, `tax-channel-financial-integrity`, `tax-property-cadastral-completion`; helper `tests/helpers/tax-document-fixture.ts`. Migração destes consumidores pertence ao owner Tax. Teste próprio preparado: `tests/drizzle-tax-accounting.test.ts`, com helper próprio `tests/helpers/drizzle-tax-accounting-fixture.ts`.

### Assinaturas finais

Todos os argumentos posteriores ao primeiro e todos os retornos de domínio foram conservados. `Decimal` abaixo é o construtor independente de `@/db/decimal`; JSON é `JsonValue`/`JsonObject` de `@/db/json`.

| Executor | Funções |
|---|---|
| `DatabaseConnection` | `readTaxAccountingMovements`, `configureTaxAccountingProfile`, `configureTaxDebtAccountingProfile`, `executeTaxRefund`, `reverseTaxCreditMovement`, `reverseTaxPayment` |
| `DatabaseExecutor` | `assertTaxCreditScope(db, actor, data: JsonValue)` |
| `DatabaseTransaction` | `recognizeTaxAssessmentInTransaction`, `recognizedTaxProfile`, `reclassifyActiveDebtInTransaction`, `returnActiveDebtReceivableInTransaction`, `postTaxAssessmentAdjustment`, `reclassifyRestoredTaxReceivable`, `taxCollectionReceivableAccount`, `recordTaxExcessInTransaction`, `resolveCreditDestinationScope`, `assertPaymentOptionDebtEligibility`, `applyConditionalGuideDiscount`, `reverseConditionalPaymentDiscount` |

`postTaxAssessmentAdjustment.input.delta`, `reclassifyRestoredTaxReceivable.input.amount`, `recordTaxExcessInTransaction.input.amount` e `applyConditionalGuideDiscount.input.amountPaid` recebem `Decimal` independente. Nenhum helper aceita transação legada/cliente misto; não existe fallback por conexão global.

### Chamadores nominais

- `index.ts`: reconhecimento e concessão do desconto dentro da transação do lançamento/pagamento.
- `s2-service.ts`: reconhecimento/revisão/extinção, posição congelada, escopo de crédito/destino e ingresso do excedente.
- `s3-service.ts`: reconhecimento do lançamento; `s4-service.ts` e `s8-service.ts`: ajuste patrimonial; `s9-service.ts`: ajuste, inscrição e devolução de direito DA.
- `scheduled-guides.ts`: elegibilidade das opções de desconto.
- `financeiro/index.ts`: baixa pela conta do direito reconhecido, via `taxCollectionReceivableAccount` na transação financeira.
- `operacoes/actions.ts`: restituição, reversão de crédito e perfis; `guias/actions.ts`: estorno de pagamento; `movimentacoes-contabeis/page.tsx`: consulta. Estes chamadores estão fora do ownership dos dez arquivos.

## Persistência

Mappings próprios em `src/db/schema/tax-accounting.ts`; consultas e locks em `src/db/repositories/tax-accounting/**`. Catálogo físico independente: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`, confrontado com SQL histórico. Precisão monetária `numeric(18,2)` mapeada por Decimal independente. Datas de selects tipados usam os mappers Drizzle; SQL bruto de locks não é DTO temporal.

- Cinco mappings: `TaxPayment`, `TaxIntegrationEvent`, `ActiveDebt`, `DebtInstallment`, `TaxFinancialMapping`. Mantêm todas as 71 colunas instaladas; 13 FKs têm nomes físicos explícitos e ações correspondentes. Não há FK presumida em `TaxIntegrationEvent`.
- Mappings compartilhados existentes são reutilizados para lançamentos/guias/registro/auditoria fiscal, contabilidade, tesouraria, receita, classificações, identidade e exercício.
- Valores monetários persistidos são `Decimal` → string do mapper → `numeric(18,2)`. Os únicos `Number(value)` dos motores conservam **a escrita paralela já existente em campos físicos `double precision`** de `ActiveDebt.updatedValue`; não alimentam o cálculo nem o campo Decimal.
- `taxAccountingObject` apenas verifica objeto JSON; nenhuma propriedade é interpretada como data/Decimal pelo nome. Igualdade de IDs em JSON usa `->` e JSON string tipada, evitando equiparar JSON number e string. `supersedesEntryId`, IDs de reversão ausentes e demais nulos aninhados continuam JSON null. Nenhum writer introduz conversão de JSON null para SQL NULL.
- Consulta contábil preserva origens por IDs canônicos, cadeia de crédito de até 32 níveis, inclusão de estornos pela origem, filtros das linhas e da transação, UGs autorizadas antes da paginação, referência bancária/valor/competência conciliados, exercício canônico da receita e exclusão de referência já postada sem estorno. DTO mantém datas ISO, valores fixos em duas casas, autoria, UG, código congelado e JSON intacto.

## Transações e locks

| Fluxo | Transação/ordem preservada |
|---|---|
| Perfis | Uma `withDatabaseTransaction`; advisory `TAX_PROFILE:taxId:UG` / `TAX_DEBT_PROFILE:taxId:UG`, validação da classificação nas duas extremidades da vigência, edição aditiva e auditoria na mesma tx |
| Reconhecimento | Tx recebida; `TaxAssessment FOR UPDATE`, reconhecimento original/replay conciliado, catálogo congelado, postagem e posição na mesma tx |
| DA | Tx recebida; `TaxAssessment` → `ActiveDebt FOR UPDATE`; saldo com pagamentos confirmados + compensações; edição da posição, duas linhas conciliadas, valor da dívida e auditoria na mesma tx |
| Excedente | Tx recebida; banco `FOR UPDATE`; origem de pagamento/fonte, evento contábil, ingresso de tesouraria e metadados do crédito na mesma tx |
| Restituição | Uma tx; período → crédito → pedido → banco; rechecagem após lock, replay comparando conteúdo, comprovante GED, saldo banco/fonte, contabilidade, saída, status, evento e auditoria atômicos |
| Reversão de crédito | Uma tx; advisory da chave → período → crédito → movimento → banco/lançamento/destino conforme operação; restauração/estorno aditivo e auditoria na mesma tx |
| Estorno de pagamento | Uma tx; advisory da chave → lançamento → guia → créditos ordenados por ID → banco; `reverseRevenueInTransaction`, excedente, desconto, ITBI e dívida usam a tx original |
| Desconto | Tx e locks do lançamento/guia fornecidos pelo chamador; restrições de débito/parcelamento, ajuste, memória congelada e auditoria; reversão aditiva sem criar caixa |
| Consulta | Uma `withDatabaseTransaction`, isolamento `repeatable read`, timeout 60s; todas as leituras usam o snapshot recebido |
| Três scripts | Uma conexão Neon/pool e uma `withDatabaseTransaction` por execução, timeout 60s; advisory original (inclusive `hashtext` no script de contas), publicação de edição/contas/eventos/auditoria na mesma tx; encerramento do pool no `finally` |

As chaves de origem/idempotência, regras de conferência do replay, hashes/decisões/IDs dos scripts e relatórios de dry-run foram preservados. Helpers financeiros e tributários externos são chamados diretamente com a tx recebida. Nenhuma atualização substitui o evento original de reversão/replay.

## Validação

- **PASS:** ESLint dos dez arquivos, schema/repositórios e teste/helper próprios, zero erros/avisos (processo limitado a 256 MB).
- **PASS:** parsing TypeScript leve de 16 arquivos, zero diagnósticos sintáticos (128 MB). Isto não é type-check.
- **PASS:** verificação pura do schema pelo catálogo independente (128 MB): 5 tabelas, 71 colunas, 5 `numeric(18,2)`, 14 timestamps, 13 FKs — cobertura, tipos, nulabilidade, nomes, ações e tabelas/colunas de destino. Nenhuma conexão/DDL remoto.
- **PASS:** varredura nominal dos sete motores/três scripts/repositórios: zero acessos/imports legados e zero casts `as unknown as`.
- **Preparada, não executada:** suíte `tests/drizzle-tax-accounting.test.ts`, com replay do SQL histórico original e driver Neon/Drizzle real contra fixture local (pool 5, servidor máximo 10 conexões), sem fixtures Tax legadas. Cobre Executivo/Legislativo, perfis/edições/replay/UG, reconhecimento e ajuste centesimal acima de `Number.MAX_SAFE_INTEGER`, rollback pós-postagem, reclassificação/devolução DA, desconto/reversão sem caixa, JSON null distinto de SQL NULL, origem de excedente/fonte, restituição paga/estorno, replay concorrente, falha de auditoria revertendo finanças/estado/eventos, estorno de pagamento e DTO/filtros/origem/referências do relatório. JSON aninhado com nomes `amount`/`date` é verificado intacto.

### Handoffs ainda bloqueadores na última conferência

`src/lib/tributacao/scope.ts` ainda expõe `resolveTaxAssessmentScope`, `resolveTaxFinancialYear` e `synchronizeAssessmentDebt` em contratos legados; `src/lib/tributacao/itbi-ownership.ts` ainda expõe `reversePaidItbiInTransaction` legado. Owner Tax deve concluir suas migrações e as dos consumidores acima. Os dez arquivos deste escopo não abrem conexão secundária para contornar esses pontos.

Após os handoffs, execução **sequencial central**, quando liberada a memória:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-accounting.test.ts
```

Tsc completo, build, execução da fixture e dry-run dos scripts permanecem reservados à integração central; não há aprovação de tipos/runtime por este agente. Nenhum DDL remoto/carga, configuração global, Git, commit ou push realizado.
