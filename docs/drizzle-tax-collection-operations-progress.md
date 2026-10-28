# Tax Collection Operations — S5, S6, S8 e S10

## Entrega em 28/10/2026

**Os quatro motores estão integralmente reescritos em Drizzle, com zero Prisma direto no recorte. Integração ainda bloqueada pelos contratos compartilhados de Scope e pelos consumidores nominais abaixo.** Lint, parser e comparativo offline de colunas passaram; execução da suíte própria, validação de tipos e build ficam com o parent. As evidências leves não certificam execução integrada nem zero legado transitivo.

Ownership desta entrega: somente `src/lib/tributacao/{s5-service,s6-service,s8-service,s10-service}.ts`, `src/db/schema/tax-collection-operations.ts`, `src/db/repositories/tax-collection-operations/shared.ts`, `src/lib/contracts/tax-collection-operations.ts`, `tests/drizzle-tax-collection-operations.test.ts`, `tests/helpers/drizzle-tax-collection-operations-fixture.ts` e este documento. Assets/SQL rejection já entregues continuam sob revisão central. Nenhum arquivo de Actions/API, core Tax, Scope, S4, demais schemas/repositórios/testes existentes ou configuração foi editado nesta missão.

## Contratos finais

Preservados **49 exports**: 41 writers, três leitores, duas funções puras e três tipos. Nomes, ordem e significado dos argumentos funcionais e formatos dos retornos foram mantidos; apenas o argumento de persistência muda de ORM para os contratos abaixo.

- **Todos os writers públicos recebem `DatabaseConnection`** e abrem uma única `withDatabaseTransaction`. Leituras, gravações, vínculos GED/processo, eventos, auditoria, histórico econômico e ajuste contábil participantes usam a mesma `DatabaseTransaction` recebida do callback.
- Leitores recebem `DatabaseExecutor`; não abrem outra conexão/transação. Helpers internos de escrita recebem exclusivamente `DatabaseTransaction`.
- `Decimal` independente de `@/db/decimal`; `JsonValue` de `@/db/json`. Sem cliente Prisma emulado, cast de transação, supressão TypeScript, conexão global ou auditoria global dentro das transações.
- Actions continuam com seus próprios contratos `{ error }`/resumos e revalidações, sob o owner TaxActions. Esta entrega não altera seus formatos.

| Motor | Exports e modo de persistência |
|---|---|
| S5 | C: `importSimplesBatch`, `processSimplesDivergences`, `communicateSimplesDivergence`, `rectifySimplesDivergence`, `prepareSimplesExclusion`, `communicateSimplesExclusion`; tipo `SimplesImportRow` |
| S6 | C: `createDesifInstitution`, `createDesifAgency`, `createDesifCatalog`, `receiveDesifImport`, `validateDesifImport`, `processDesifImport`, `issueDesifGuide`, `openDesifFiscalCase`, `communicateDesifFiscalCase`; pura `assertDesifReceipt`; tipo `DesifPayload` |
| S8 | C: `createCollectionPortfolio`, `scheduleCollectionAction`, `completeCollectionAction`, `createInstallmentAgreement`, `applyInstallmentPayment`, `reviseInstallmentOrigin`, `reparcelInstallment`, `changeInstallmentStatus`, `grantPortalAccess`, `createBenefitRule`, `grantBenefit`, `createPrizeDraw`, `issuePrizeCoupon`, `executePrizeDraw`; E: `collectionDashboard`; pura `simulateInstallment` |
| S10 | C: `upsertAccountant`, `upsertCompany`, `linkCompanyAccountant`, `upsertRule`, `importMovements`, `importRepasse`, `importIndices`, `processCompetency`, `notifyCorrection`, `markNotificationRead`, `resolveCrossCheck`, `createEstimate`; E: `vafReports`, `listVafOverview`; tipo `Movement` |

**C** = `DatabaseConnection`; **E** = `DatabaseExecutor`. Os exports sem consumidor estático continuam disponíveis. Os 46 exports de função são importados pela suíte própria preparada.

### Particularidades dos retornos preservadas

- S5: importação/retificação devolvem lote; processamento devolve `{ processed, taxpayers }`; comunicação de divergência devolve a mensagem DTE; preparação/comunicação de exclusão devolvem o caso.
- S6: catálogo devolve `{ plan, pgcc, cosif, subtitle, tariff, package }`; processamento devolve lote com recibo apenas após sucesso. `issueDesifGuide` conserva a guia retornada antes do vínculo GED na primeira emissão; replay lê a guia persistida com o vínculo, podendo retornar null se o vínculo referenciar guia ausente, como o contrato anterior. Caso fiscal/comunicação devolvem somente os campos do caso, sem anexar relações/eventos ao DTO.
- S8: criação de acordo devolve `quotas` ascendentes, `debts` e `events`; replay de pagamento devolve acordo com cotas e alocações da chave consultada, enquanto pagamento novo inclui todas as alocações/eventos. Revisão devolve cotas ascendentes e origens. Reparcelamento mantém o retorno do filho capturado na criação, embora os vínculos parent/tipo e eventos adicionais sejam persistidos na mesma transação.
- Sorteio devolve execução com ganhadores e cupons; replay preserva os hashes/execução originais. Dashboard mantém `collectionRanking` e seus tipos numéricos. S10 mantém todas as chaves do overview/relatórios, paginações, ordenações e formatos monetários do relatório; exercício vazio conserva o formato histórico.

## Persistência e escalares

Mappings próprios: **57 tabelas / 680 colunas completas**, confrontados offline com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`, usando o SQL histórico como segunda fonte. Os dois catálogos de cobrança não consumidos pelos motores (`TaxCollectionProfile`, `TaxCollectionRule`) não precisam de mappings próprios. Os mappings locais não são registro global de relações nem origem de geração de DDL; constraints/índices/FKs físicos continuam governados pelo histórico instalado.

- `Simples*`: sete tabelas; `Desif*`: dezesseis; cobrança/parcelamento/portal/benefícios/prêmios: dezessete; `Vaf*`: dezessete.
- Reutilizados, sem edição, os mappings existentes de contribuintes PF/PJ, documentos, pessoas, inscrições econômicas, NFS-e, tributos/lançamentos/guias/autos, dívida ativa, pagamentos, registro/auditoria, integração, DTE e processos.
- `exactNumeric` decodifica numeric textual para Decimal; escrita persiste Decimal via string. `Number()` permanece apenas nos pontos de Float/DTO/cálculo numérico já existentes. Fallbacks Float quando Decimal é null, escala monetária e alíquotas `numeric(9,6)` foram conservados.
- Todos os DTOs temporais vêm de selects/returning tipados, com decoder Drizzle; não há DTO de data retornado por SQL bruto. Os SQL brutos locais são locks, incremento parametrizado e agregação: `sum(...)::text` é explicitamente convertido para Decimal; `count(*)::int` conserva número. Assim, nenhum `execute<T>` presume conversão temporal pelo tipo TypeScript.
- Listas SQL usam `inArray` tipado, sem interpolar arrays em template SQL bruto. Nenhum array é serializado como lista de argumentos SQL. Datas civis/competências e cotas conservam meio-dia UTC; vencimentos continuam limitados ao último dia do mês.
- JSON é serializado sem interpretar propriedades pelo nome: strings como `amount: "001.00"`, `date: "not-a-date"`, arrays e null aninhado permanecem dados. Campos opcionais ausentes continuam omitidos/default/SQL NULL; snapshots e memórias não são reconstruídos por casts de persistência.

## Regras e transações por motor

### S5 — Simples Nacional

- Mantidas as oito origens reconhecidas, normalização e checksum SHA-256 do lote, rejeição de contribuinte ausente/inativo, contadores, resumo de erros e payload original. Replay é protegido por advisory de checksum e devolve o lote persistido sem substituir evidência. Importação conserva timeout explícito de 20s.
- `PERIODOS_OPCAO` mantém chave contribuinte/regime/início, fim nullable, reativação e atualização de **todas** as inscrições em ordem de ID pelo writer econômico `updateEconomicRegistrationWithHistoryInTransaction(tx, ...)`.
- DAF607 mantém componente municipal separado do DAS nacional e memória de diferenças. Malha mantém precedência PGDAS_RETIFICACAO → PGDAS → DASN_DEFIS, seleção mais recente por tipo, população de notas/opções/cadastros, estados, reabertura/resolução e eventos próprios.
- A malha é serializada por competência. Retificação adquire esse advisory antes do lock do pedido e participa da mesma transação de importação/evento/reprocessamento, evitando inversão de locks com processamento concorrente.
- Comunicação usa caixa DTE ativa e categoria existente/gerada, mensagens e disponibilidade imutáveis por idempotência. Preparação de exclusão continua documento municipal interno, não confirmação de exclusão na RFB; mantém CPF/CNPJ, sanitização do arquivo, vínculos e avisos do domínio.

### S6 — DES-IF / ISS bancário

- Mantidos CNPJ base/completo, vínculo instituição/agência, vigências e updates parciais de catálogo; upserts usam as chaves físicas originais de PGCC, COSIF, subtítulos, tarifas e pacotes.
- Recepção conserva fórmula do checksum e conteúdo original; replay não redefine status/assinatura. Validação conserva inconsistências, assinaturas internas/não verificadas e contagens; arquivo validado é rechecado sob lock antes de processar.
- Processamento de apuração, balancete, pacote, recibo e status é atômico. Potencial de pacote continua confronto independente, sem somar imposto novamente ao COSIF.
- Apuração bloqueada antes de gerar DAM; tributo, lançamento com campos Decimal/Float, guia, GED e vínculos participam da mesma transação. Abertura de fiscalização inclui a emissão automática de guia, TIAF, mapa, processo, auto e eventos na transação de origem; falha posterior não deixa guia/auto/documento órfão.
- DTE mantém a distinção disponibilização/aviso/ciência; recibo exige processamento concluído e número persistido.

### S8 — Cobrança, parcelamento, benefícios e prêmios

- Carteira preserva filtros/statuses originais, limites de 200 por fonte e exclusão de lançamento já representado em dívida ativa. A fonte de dívida é somente leitura; seleção congelada, itens e eventos são atômicos.
- Parcelamento conserva limites da regra ativa, distribuição centesimal na última cota, ordem da alocação, pagamento por chave, revisão na última cota aberta, estados/datas e trilha. Lock do acordo antecede leitura do saldo/alocações; reparcelamento cria filho e altera pai na mesma transação.
- Portal conserva os quinze scopes, concessão/revogação nullable e chave usuário/contribuinte. Não é criada autorização implícita para UG fora do contrato do motor.
- Benefício conserva autorização UG/ente antes do replay, chave/conteúdo imutável, exercício aberto/período, lock do lançamento, impedimentos de status/guias abertas, confirmação de pagamentos/compensações, valor Decimal conciliado, regra/vigência/GED e cálculo. `postTaxAssessmentAdjustment`, registro, atualização do lançamento, `synchronizeAssessmentDebt`, integração e auditoria recebem a **mesma tx**; concessão não gera caixa.
- Cupons mantêm regra de titularidade DAM, confirmação de pagamento quando exigida e documento de origem. Numeração é serializada pelo lock do sorteio. Execução usa a população completa ELEGIVEL, com todos os campos na mesma ordem do DTO histórico de `TaxPrizeCoupon`, mantendo algoritmo SHA-256/LEXICOGRAPHIC/V1, hashes, semente, ordem e distinção demonstração técnica/ato cadastrado. Replay lê a execução original; não recalcula a memória.
- Integrações downstream de calendário, CND, CDA/execução, programa fiscal e contabilidade continuam lendo as origens/statuses canônicos. Seu reteste integrado pertence ao parent e aos owners respectivos; não há certificação transitiva por esta entrega local.

### S10 — VAF

- Mantidos cadastros/contadores, updates opcionais, empresas ativas, regras/fórmulas restritas, versões/substituições e vigências. Importações preservam JSON original, hash de movimentos, pai, competência e protocolo; importação/substituição/protocolo agora compartilham tx, com advisory da numeração.
- Processamento por competência inteiro na tx: fontes não substituídas mais recentes, merge EFD/GIA sem duplicação, fórmula por CFOP, contrapartida/genérico/divergência, resumos, lançamentos, resultado, participação, ranking, omissos, notificações e atividade. São mantidas as políticas de cálculo originais, inclusive precedência MERGED e total do VAF calculado por elegibilidade.
- Repasses/correções, índices provisório/definitivo e totais, estimativa, notificações e resolução conservam seus contratos. Undefined não apaga índice anterior; agregado null não vira zero indevido. Relatórios mantêm filtros, limites e consolidações históricas.

## Handoffs nominais pendentes

### Owner Index/Scope — bloqueador do S8/contabilidade

Na última leitura, `src/lib/tributacao/scope.ts` ainda implementa em Prisma:

1. `resolveTaxAssessmentScope(db, actor, taxId, snapshot?)` → leitor por `DatabaseExecutor`, JSON independente, preservando UG/ente e autorização.
2. `resolveTaxFinancialYear(db, year, scope, requireOpen?)` → leitor por `DatabaseExecutor`, mantendo exercício por ente e abertura.
3. `synchronizeAssessmentDebt(tx, actor, assessmentId)` → writer por **`DatabaseTransaction` recebida**, preservando pagamentos/compensações/statuses e retornos; não abrir conexão secundária.

`taxAssessmentCompensatedValue` já tem branch Drizzle para o executor fornecido; o caller S8 não usa seu branch legado. `postTaxAssessmentAdjustment` já recebe tx Drizzle do owner Accounting. O caller S8 foi entregue diretamente contra o contrato futuro dos três helpers; não há adaptador/cast que esconda a incompatibilidade atual.

### Owner TaxActions — encaminhar conexão aos writers

Reinspeção nominal dos consumidores antes da alteração e após a implementação. Os pontos abaixo ainda passam `database`/`db` e precisam passar a conexão da **mesma origem** (`context.connection`, `c.connection` ou `databaseConnection` na API), preservando retorno de ActionResult e guardas existentes:

| Arquivo | Chamadas que exigem C |
|---|---|
| `src/app/app-domain/tributacao/simples-nacional/actions.ts` | `processSimplesAction` → `processSimplesDivergences`; `communicateDivergenceAction` → `communicateSimplesDivergence`; `communicateExclusionAction` → `communicateSimplesExclusion` |
| `src/app/app-domain/tributacao/iss-bancario/actions.ts` | `createInstitutionAction`, `createAgencyAction`, `validateImportAction`, `receiveImportAction`, `communicateFiscalCaseAction` → respectivos writers S6 |
| `src/app/api/tributacao/desif/importacoes/route.ts` | `POST` → `receiveDesifImport`; conservar Bearer, configuração, assinatura e status HTTP |
| `src/app/app-domain/tributacao/cobranca/actions.ts` | `createPortfolioAction`, `scheduleCollectionActionAction`, `completeCollectionActionAction`, `grantPortalAccessAction`, `createBenefitRuleAction`, `createPrizeDrawAction`, `issuePrizeCouponAction` → respectivos writers S8 |
| `src/app/app-domain/tributacao/vaf/actions.ts` | `upsertAccountantAction`, `upsertCompanyAction`, `linkAccountantAction`, `upsertRuleAction`, `importMovementsAction`, `processCompetencyAction`, `importRepasseAction`, `importIndicesAction`, `notifyCorrectionAction`, `markNotificationReadAction`, `resolveCrossCheckAction`, `createEstimateAction` → respectivos writers S10 |

Já compatíveis: S5 importação/retificação/preparação; S6 processamento/emissão/abertura fiscal; S8 execução de sorteio; `operacoes/actions.ts:grantAssessmentBenefitAction` passa `taxActionConnection(context)`. As páginas Cobrança/VAF passam executor aos leitores e a rota de recibo chama somente o guard puro; esses três contratos continuam compatíveis.

### Parent / owner dos testes existentes

- `tests/tax-accrual-accounting.test.ts` e `tests/tax-financial-chain.test.ts` importam `createBenefitRule`/`grantBenefit` e ainda passam `f.db` legado; precisam da conexão real após a migração das fixtures/chamadores dessas suítes. Não foram editados aqui.
- `tests/tax-property-cadastral-completion.test.ts` importa `importSimplesBatch` e já passa `f.connection`; preservar esse contrato.
- Não há outros importadores diretos encontrados nos scans `.ts/.tsx`, além da suíte própria nova. Exports de catálogo DESIF e parcelamento sem consumidores estáticos permanecem preservados e cobertos no teste próprio preparado.

## Verificações realizadas e gate central

**PASS leve:**

- ESLint dos nove arquivos TypeScript desta entrega, processo limitado a 256 MB, zero erros/avisos.
- Parser TypeScript de nove arquivos, processo limitado a 128 MB, zero diagnósticos sintáticos; inventário de 49 exports nos quatro motores.
- Comparativo offline de 57 tabelas / 680 colunas: zero divergência de nome/tipo/nullability; 156 diretórios SQL históricos presentes. Este comparativo não é execução de migrations nem teste de FKs/defaults em banco.
- Scan dos motores: zero imports/tipos Prisma, delegates, `$transaction`, `$queryRaw`, `$executeRaw`, casts de compatibilidade, supressões TypeScript ou acesso à conexão global. Dependências indiretas pendentes estão explicitadas acima.

**Preparada, ainda não executada:** `tests/drizzle-tax-collection-operations.test.ts`, com fixture própria que reproduz os **156 SQL históricos originais** sobre PostgreSQL local usando driver Neon/Drizzle real. Cleanup restaura transporte e ambiente; cenários incluem concorrência/replay, rejeições, Decimal/Float/null/datas UTC/JSON, história econômica, DTE e GED, rollback tardio das cadeias S5/S6/parcelamento/VAF/benefício, população e hashes do sorteio, contabilidade e concessão em Executivo/Legislativo. Não usa delegates, mocks de ORM ou schema gerado.

Após os handoffs e liberação central de memória:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-collection-operations.test.ts
```

Executar isoladamente e sequencialmente por causa do transporte Neon global da fixture. Depois, o parent deve validar os consumidores existentes e integrações de Scope/Accounting/CND/calendário/dívida/programa fiscal, tipos e build. Não houve execução PGlite, tsc/build pesado, instalação, modificação de package/lock/configuração, Git, commit/push, aplicação SQL ou escrita remota nesta missão.
