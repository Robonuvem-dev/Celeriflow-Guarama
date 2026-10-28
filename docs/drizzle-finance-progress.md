# Financeiro e Contabilidade — migração Drizzle

## Responsabilidade e base

- Escopo atual exclusivo: todos os `.ts` financeiros (actions, APIs, `src/lib/financeiro/**`, inclusive `financeiro/planejamento.ts`), testes/scripts financeiros e schemas/repositories financeiros existentes. A meta continua zerar Prisma nas 74 libs e nos 94 scripts atribuídos.
- Planejamento e Compras foram transferidos a seus owners; os arquivos desses domínios não são editados nesta frente.
- **Transferência exclusiva mais recente:** todos os `.tsx` em `src/app/app-domain/financeiro/**` (páginas, layouts e componentes) pertencem agora à frente Processos. Também são exclusivos desse owner `src/db/repositories/finance-pages/**`, `src/lib/contracts/finance-pages.ts` e eventual `src/db/schema/finance-pages.ts`. Esta frente não cria queries de páginas.
- Branch inicial: `feat/migracao-integral-drizzle`; árvore inicialmente limpa nesta sessão. Não executar build/tsc global/instalação/DDL/cargas/commit/push neste agente.
- Lidos `AGENTS.md`, plano integral, contratos globais e guias Next instalados `route.md` e `07-mutating-data.md`.
- Estado: **em andamento; não é migração integral concluída**.
- O total inicial de 74 libs/94 scripts é a base histórica, anterior às transferências. A contagem atual deve distinguir runtime, testes e arquivos transferidos; o total inicial não é usado como prova de conclusão.

### Transferências de scripts

- Exclusivos de RHPages: `prepare-aurora-{accounting-actor,bank-resource-sources,budget-posting-matrix,finance-control,payment-posting-matrix,rap-posting-matrix,rap-registration-matrix}.ts`, `inspect-aurora-{annual-reference,rap-reference}.ts`, `verify-aurora-{annual-readiness,resource-availability}.ts` e `repair-financial-year-8081.ts`. Seus helpers/tests exclusivos também ficam com esse owner.
- `seed-municipal-planning.ts` e `verify-planning-readiness.ts`: transferência ao owner Planning ainda aguardando confirmação; nenhuma alteração nesta continuação.
- Scripts de Compras, Planejamento e demais domínios permanecem com seus owners. `prepare-poc-p0-current.ts`, por exemplo, já está Drizzle pela frente de ferramentas transversais; os nomes do ledger e SQL históricos não representam runtime Prisma.
- Inventário nominal desta entrega: **oito scripts próprios** sem Prisma — os sete bancários/reconciliação listados na trilha 11 e `configure-poc-p1-tax-matrix.ts`. Os 12 transferidos a RHPages e os dois aguardando confirmação de Planning não são contados como entrega desta frente.
- A fonte global histórica `docs/drizzle-inventory/sources.json` contém 120 caminhos de scripts (106 `.ts` e 14 `.mjs`); ela não identifica nominalmente o subconjunto de 94 da atribuição inicial. Portanto, não é correto declarar `94/94` a partir dessa fonte ou da ausência de marcadores no recorte próprio. A reconciliação final desse denominador depende do manifesto de ownership do parent.

## Handoff para o owner dos TSX financeiros

- `getBankAccountBalances(db: DatabaseExecutor, ids)` e `getBudgetAvailability(db: DatabaseExecutor, appropriationId)` exigem Drizzle. A ligação e validação dos TSX financeiros ficam com Processos; os achados antigos de linhas não representam o estado atual desses arquivos concorrentes.
- `accountingTrialBalance` usa `DatabaseExecutor`; `readAccountingMonthlySources` usa `DatabaseConnection` com repeatable read. Consultar as assinaturas atuais dos serviços antes de ligar os novos leitores.
- `resolveFinancialReportScope`, `readMunicipalFiscalIndex` e `assertCostScope` recebem `DatabaseExecutor` primeiro e aceitam a transação do chamador. Os serviços de custos que iniciam transação recebem `DatabaseConnection`.
- As actions de pagamentos, empenhos, liquidações e orçamento já foram ligadas à execução Drizzle nesta continuação, preservando `{ error?: string }` para seus clients. As actions de estimativos e preparação/transporte/desmovimentação de programações anuais também passam `databaseConnection`.
- RREO canônico e reconciliação devem usar handoff de serviço/DTO entre as frentes; a nova camada de páginas não deve substituir o motor nem abrir transação paralela à origem financeira.
- `generateRGF`, `generatePCA` e `generateInternalReportDataset` recebem `DatabaseConnection` e abrem repeatable read/60s. As variantes `*InTransaction` recebem a transação já iniciada para composição. Demais leitores de relatórios e comparativo orçamentário recebem `DatabaseExecutor`.
- **Reader pendente do owner Processos:** `dashboard-actions.ts` ainda consulta receitas/despesas via Prisma. Essa action financeira pertence a esta frente, mas a query de página deve vir de `finance-pages`; o diretório atual ainda não oferece reader de dashboard. Contrato existente: filtros de mês/ano, receitas `ARRECADADA`, redutoras com sinal negativo e DTO `{ totalReceita, totalDespesa, resultadoOperacional }`.
- SQL bruto Neon retorna strings para temporais e numerics; o genérico não converte. Os repositories financeiros com temporais brutos usam agora `databaseTimestamp` campo a campo; seleções tipadas mantêm os mappers Drizzle. JSON das projeções brutas existentes foi revisado: seus objetos agregados contêm IDs/textos; snapshots JSON continuam JSON, sem reinterpretação genérica de chaves.

## Integração transacional necessária aos demais agentes

### Atualização após diagnóstico integrado (índice e restituições)

- Analisado `.agent/drizzle-integration-build-errors.json`: o recorte `src/lib/financeiro/**` continha 72 diagnósticos em `index.ts` e 22 em `allowance-expense-refunds.ts`. Não foi iniciado outro typecheck/build nesta frente.
- **`index.ts` está sem referências Prisma**, inclusive tipos, metadados, transações e queries. Bancos/abertura, transferência, lançamento/arrecadação/estorno/redistribuição de receita, boletim/fluxo, fechamento diário e extratos usam repositories Drizzle. Os três comandos RAP residuais (acompanhamento, cancelamento e reinscrição) também usam a transação Drizzle.
- **`allowance-expense-refunds.ts` está sem referências Prisma.** Recebimento e reversão de restituição corrente preservam os três lançamentos contábeis, movimentos de empenho, espelho, liquidação/pagamento corretivos, documentos, caixa e integração RH em uma única transação com timeout de 60s.
- **Handoff RH obrigatório:** `receiveCurrentYearAdvanceRefund`, `receiveCurrentYearTravelRefund`, `reverseCurrentYearAdvanceRefund` e `reverseCurrentYearTravelRefund` agora recebem `(connection: DatabaseConnection, context: AppContext, raw: unknown)`. Consumidor de produção externo: `src/app/app-domain/rh/operacoes/actions.ts`; deve passar `databaseConnection` também ao `reverseRevenue`. Essa action pertence ao owner RH.
- **Handoff Tributação:** `recordConfirmedRevenue` e `reverseRevenueInTransaction` recebem `DatabaseTransaction`. A assinatura de `taxCollectionReceivableAccount` foi reconferida nesta continuação e já usa `DatabaseTransaction`. A validação integrada de toda a cadeia e dos seus consumidores permanece com Tributação/parent.
- Actions financeiras de `receitas` e `contas-bancarias` foram ligadas a `databaseConnection`, com guardas Drizzle e contratos de retorno existentes preservados. Repositories novos: `finance/{revenues,treasury-operations}.ts`; schema de projeção física `finance-revenues.ts`, sem DDL executado.
- O `grep` sem Prisma nos dois arquivos é evidência de inventário, não de equivalência ou aprovação do próximo build. Testes anuais/de execução ainda têm consumidores Prisma/fixtures pendentes de adaptação; o owner de Planejamento mantém a fixture compartilhada.

Os produtores de RH, Tributação, Patrimônio/Almoxarifado e Obras devem enviar **a mesma** `DatabaseTransaction` aos comandos financeiros `*InTransaction`, `postAccountingTransaction`, `recordConfirmedRevenue`, pontes de provisões/custos e pontes orçamentárias. Comandos que abrem uma transação devem receber `DatabaseConnection` explicitamente. Não converter uma transação Prisma em Drizzle abrindo outra conexão, nem usar Proxy que simule `$transaction`.

Ordem existente obrigatória: instrumento de Planejamento → dotação → origem financeira; arrecadação: instrumento → receita/conta. Preservar advisory locks de competência/ano, limites Decimal e replay com conteúdo conferido.

Consumidores externos localizados inicialmente:

- `src/lib/rh/{provision-accounting,municipal-advances}` e `src/lib/tributacao/accrual-accounting` participam do núcleo `financeiro/index.ts`.
- `src/lib/patrimonio/*` chama `compras/shared-catalog.ts` e pontes de custo/recebimento.
- Rotas fora da reserva: `src/app/api/download/route.ts`, `src/app/api/transparencia/relatorios/route.ts`, `src/app/api/transparencia/planejamento/{route.ts,[publicKey]/route.ts}`. Integração dos handlers compartilhados permanece com seus responsáveis.

## Contratos compartilhados disponíveis

### C7 / RH / Patrimônio

- `resolveFinancialReportScope(db: DatabaseExecutor, financialYearId, scope?)`, em `src/lib/financeiro/report-scope.ts`: consulta o exercício e intersecta ente, UG solicitada e UGs autorizadas. Lista vazia continua negando o escopo; exercício legado não representa um ente conciliado.
- `readMunicipalFiscalIndex(tx: DatabaseExecutor, actor, { financialYearId, code, through })`, em `src/lib/financeiro/fiscal-indices.ts`: mantém o DTO, strings monetárias, Decimal, revisão vigente, fechamentos, função da dotação e origem dos estornos. Não abre transação ou conexão; C7 controla seu repeatable read.
- `assertCostScope(tx: DatabaseExecutor, actor, financialYearId, budgetUnitId?, completeEntity?)`, em `src/lib/financeiro/cost-ledger.ts`: retorna `FinancialYearRecord`, com datas, status e entidade preservados. Não abre transação/conexão. `MunicipalCostError` mantém identidade por reexport de `cost-errors.ts`.
- Repositórios novos dessas leituras: `src/db/repositories/finance/{report-scopes,fiscal-indices,cost-overview}.ts`. Contratos explícitos: `src/lib/contracts/finance-{scope,fiscal-indices,costs}.ts`.
- `defineMunicipalFiscalIndex` recebe `DatabaseConnection`, preservando lock de exercício/código, revisão e auditoria na mesma transação.
- `readMunicipalCosts` e `buildMunicipalCostReport` recebem `DatabaseConnection`; a leitura de custos usa repeatable read. Saldo atual permanece separado do apropriado no período e das correções de origens anteriores.
- `generateMunicipalMscArchive(db: DatabaseConnection, actor, input)` usa o mesmo `tx` Drizzle em repeatable read para perímetro, versões oficiais, fechamentos, partidas paginadas e auditoria. Mantém o limite transacional de 60s, memória congelada, formato CSV/ZIP e hashes. O endpoint `src/app/api/financeiro/msc/route.ts` passa `databaseConnection`.

### Social

`createLegacyExpenseInTransaction(tx: DatabaseTransaction, input: LegacyExpenseInput): Promise<string>` está em `src/lib/financeiro/legacy-expense.ts`.

Entrada: `description`, `value: number`, `appropriationId`, `secretariatId`, `socialBenefitId?`, `socialProgramId?`. Retorna o ID da Expense. Mantém Float sem arredondar, `valueDecimal` ausente/null, status `Empenhada` e os defaults legados de origem. Não solicita/aprova despesa, não cria reserva/empenho nem inicia outra conexão/transação. O produtor Social cria o benefício/programa e passa seu ID dentro da mesma transação. Os consumidores de `social/actions.ts` foram ligados pela frente Social.

### Sequências e integrações

- Contrato recebido do parent: `nextYearlyCodeDrizzle({ db: tx, key, prefix, existingCodes, padding? })`, de `@/db/repositories/platform/sequences`. A adoção no residual `procurement-lifecycle`, solicitações, processos e licitações ainda está pendente. `sequence.ts` legado não foi alterado nesta frente.
- Exports de Compras: `queueProcurementExport` e `recordProcurementExportOutcome` recebem `DatabaseConnection`; board/download recebem `DatabaseExecutor`. Fila usa advisory lock do pacote; outcome lê o run sob `FOR UPDATE`; mudanças e auditoria compartilham a transação.
- `notifyPendingPriceResearchInvitations` recebe `DatabaseTransaction` e usa `insertInternalNotifications(tx, ...)`; dedupe e auditoria permanecem no produtor.
- O consumidor financeiro de `executeConfiguredStatementDownload` passa `db`, conforme contrato do runtime de integrações do parent.

## Trilhas implementadas

1. **Extratos e conciliação:** parsers OFX/OFC com Decimal independente; importação OFX/OFC/CSV com conta bloqueada, checksum/FITID, original, lote, itens e auditoria; vínculo direto 1:1; sessões e alocações N:N/parciais, replay, reversão, confirmação, reabertura e sugestões. Consumidores de `conciliacao-bancaria` e handlers de extratos adaptados, além dos DTOs de impressão/download.
2. **MSC / catálogo de referência:** captura, publicação de de-para, perímetro, composição das dimensões e exportação migrados. Preservados locks, sucessão, auditoria, memória congelada, paginação por ID (1000 por página), CSV/ZIP e hashes; conexão/transação explícitas.
3. **Download automático / GED financeiro:** `ged.ts` usa Drizzle para pasta e documentos e passa `DatabaseConnection` ao ingresso GED do owner; `download-extratos/extratos-actions.ts` usa Drizzle para conta, histórico, download, itens, regras constitucionais, exceções e auditoria.
4. **Pontes e custos:** catálogo, apropriações, payroll/settlement/stock/accounting bridges e leitura/relatório de custos usam Drizzle. `MunicipalCostError` mantém identidade por extração/reexportação. Compras e Planejamento independentes foram transferidos e não têm estado atual certificado por esta frente.
5. **Núcleo contábil e execução:** despesas, reservas, empenhos/movimentos, liquidações/cancelamentos, pagamentos/estornos, retenções, receita/estorno/redistribuição, transferências, bancos, caixa, saldos/fontes, períodos, pendências, fechamento mensal e anual migrados. `reversePaymentInTransaction` conserva composição na transação original.
6. **Etapas anuais / RAP:** inscrição, estimativos, partidas, consistência, abertura/resultado/orçamento, transporte/desmovimentação de RAP, programações e notas extra migrados. `transportCarryForwardInTransaction` substitui o Proxy transacional; etapas conservam 120s e snapshots documentais.
7. **Disponibilidade / investimentos:** disponibilidade de recursos, classificação de movimentos e rendimentos usam Drizzle, preservando limites transacionais e Decimal.
8. **Pessoal fiscal / relatórios:** revisão, janela de 12 competências, memória, hashes e auditoria migrados em `personnel-fiscal.ts`; Diário, Razão, Balancete, RREO, RGF, balanços, DVP, DFC e PCA migrados em `relatorios-legais.ts`. Readers tipados em `finance/legal-reports.ts` preservam leis `PUBLISHED`, relevância temporal e status dos movimentos. `report-delivery.ts` e `report-definition.ts` usam leitores de escopo, planejamento, tesouraria, instituição/template e publicação GED com lock/versionamento.
9. **Planejamento legado financeiro:** `financeiro/planejamento.ts` usa Drizzle em PPA/LDO/LOA, emendas/snapshots, objetivos/indicadores/metas, workflow legal, dotações, CMD/MBA, créditos e comparativos. Schemas do owner Planning são reutilizados sem edição; projeções financeiras novas em `finance-legacy-budget.ts`. Guardas `PlanningInstrument`/`PlanningCreditBatch` preservam a adoção ao domínio novo. A action `orcamento/planejamento-actions.ts` passa `databaseConnection`, mantém `{ error, data }` e valida snapshot JSON sem tipos Prisma.
10. **Actions/APIs bancárias e impressão:** regras constitucionais e webhook usam `finance/bank-automation.ts`; impressão usa `finance/report-print.ts`. Leituras, autorização, replay, Decimal e auditoria foram ligados a Drizzle. Nenhum TSX ou repository `finance-pages` foi alterado nesta continuação.
11. **Scripts bancários e reconciliação:** migrados individualmente `finance-{decimal-reconcile,creditor-backfill,treasury-opening-backfill}.mjs`, `backfill-poc-bank-statement-accounts.ts`, `provision-bank-sandbox-poc.ts` e `sync-poc-{bank-payment-orders,virtual-bank}.ts`. Projeções brutas preservam datas UTC, numeric como string e `updatedAt`; criação de journals com partidas continua atômica. Não foram executados contra banco/sandbox.
12. **Matriz contábil tributária POC:** `configure-poc-p1-tax-matrix.ts` usa Drizzle, preservando os hashes/IDs, conflitos locais, auditoria, seleção do ator, dry-run, replay e publicação depois das entradas. Versão, contas, eventos/regras e auditoria ficam na mesma transação de 60s, com o mesmo advisory lock. Não foi executado, nem em dry-run.

## Verificações executadas

- `node --import tsx --test tests/purchase-request-budget.test.ts`: **2 testes passaram** (etapa anterior).
- `node --conditions=react-server --import tsx --test --test-name-pattern="rateio conserva centavos|peças exigem cadeia" tests/planning-domain.test.ts`: **2 testes passaram** (política pura).
- Smoke do transporte `connectFinanceDrizzleFixture`: `SELECT 1` via Neon/Drizzle → WebSocket → TCP → PGlite passou, com fechamento dos recursos.
- `node --conditions=react-server --import tsx --test tests/finance-shared-drizzle-contracts.test.ts`: **5 testes passaram** (um agrupador e quatro subtestes). Exercita UGs vazias/interseção/ente legado; visibilidade de alteração não commitada pelo mesmo executor; rollback; centavos acima do limite inteiro seguro do JS; função/origem de estornos fiscais; Câmara não avaliada; saldo atual versus apropriação por período; devolução de origem anterior; Float/status e rollback da Expense junto com o vínculo Social.
- `node --conditions=react-server --import tsx --test tests/msc-export-drizzle.test.ts`: **7 testes passaram** (um agrupador e seis subtestes). Fixture PGlite mínima: CSV esperado byte a byte e ZIP determinístico; hashes do arquivo/evidência persistidos; autorização completa e fechamentos; perímetro substituído; memória congelada ausente; desequilíbrio; FK de auditoria abortando emissão; função/subfunção FS na mesma versão oficial; 1.012 linhas sem perda/duplicação na paginação; centavos acima do inteiro seguro JS; MSC 13 com fechamentos anuais. Uma constraint da fixture verifica que a auditoria é escrita em repeatable read.
- ESLint dirigido aos serviços, schemas, repositories, contratos e testes novos/adaptados passou. O primeiro lint do componente de indicadores apontou JSX dentro do `try/catch` já existente; o carregamento foi ajustado e o lint desse componente passou na repetição.
- `git diff --check` dirigido às trilhas desta frente passou também nesta etapa. A tentativa com `core.autocrlf=false` interpretou CRLF existentes como whitespace; a repetição com a configuração normal do repositório passou, sem normalizar arquivos concorrentes.

### Preparados, ainda sem execução nesta frente

As adaptações abaixo incluem setup, comandos, asserções e cleanup financeiros com Drizzle. **Nenhuma dessas integrações foi executada nesta continuação.** O teste default do parent inclui todo `src/lib`; não há dispensa dos testes de domínio nessa pasta.

| Grupo | Arquivos adaptados |
| --- | --- |
| Sete testes de `src/lib/financeiro/__tests__` | `accounting-close-workflow`, `accounting-scope`, `commitment-protocol-gate`, `financial-documents`, `financeiro-lagoaseca`, `procurement-origin-policy`, `revenue-lifecycle` |
| Oito etapas anuais em `tests/` | `annual-{consistency,extra-note-transport,rap-postings,estimative-balances,payable-registration,balance-stages,budget-close,payment-program-transport}` |
| Cinco testes de RAP/posição | `native-carry-forward-payments`, `native-unprocessed-carry-forward`, `carry-forward-transport`, `treasury-statement-integrity`, `personnel-fiscal-position` |
| Quatorze consumidores restantes em `tests/` | `accounting-monthly-sources`, `accounting-period-concurrency`, `advance-prior-year-refund`, `bank-multiple-resource-sources`, `bank-reconciliation-allocations`, `composite-accounting-postings`, `financial-producers-p3-p4`, `public-finance`, `msc-accounting`, `municipal-account-adoption`, `municipal-cost-ledger`, `municipal-fiscal-indices`, `material-consumption-costs`, `ofx-statement-import` |

- Conservadas verificações de concorrência, rollback, autorização, replay, estornos, imutabilidade, classificações congeladas, saldos/centavos, origem encerrada e fronteiras temporais. Journals e partidas são inseridos na mesma transação.
- `procurement-origin-policy.test.ts` reutiliza os schemas de Compras sem alterá-los. A coluna financeira de política da natureza é escrita via SQL explícito com o enum físico `ProcurementOriginPolicy`.
- `public-finance.test.ts` substitui os três doubles ORM de relatórios pela fixture SQL própria `tests/helpers/finance-delivery-fixture.ts`. Os três testes de classificação em `municipal-account-adoption.test.ts` também usam tabelas SQL isoladas, com FK de `PlanningCatalogEntry(versionId)`, sem double de cliente.
- `tests/helpers/finance-database-error.ts` confere a mensagem no erro PostgreSQL com SQLSTATE, atravessando `cause`; o texto SQL/parâmetros do wrapper Drizzle não pode satisfazer as asserções de imutabilidade ou falha injetada.
- **Novo teste de driver preparado:** `tests/finance-raw-driver.test.ts` lê colunas PostgreSQL `timestamp(3)`/`numeric(18,2)` pelo transporte real Neon/Drizzle. Cobre sete leitores brutos, instante UTC fixo, parâmetros Date, sessão PostgreSQL em outro fuso, nulls, centavos acima do inteiro seguro JS, filtros de status/inscrição/fonte/data e limite inclusivo das origens. Não foi executado; os testes unitários de decodificação não o substituem.

Não foram executados build, tsc global, instalação, suíte pesada, DDL/carga Neon, commit ou push. A fixture local nova cria tabelas somente em PGlite isolada.

## Residual e limites ainda ativos

**A migração integral continua incompleta.** A ausência de Prisma nas libs de produção não comprova equivalência de SQL, contratos, autorização, precisão ou atomicidade.

### Inventário atual e trabalho de consumidores

- A varredura textual mais recente encontrou **zero referências Prisma em todos os 66 `.ts` de `src/lib/financeiro/**` (59 serviços/auxiliares e sete testes)**, nos 41 repositories `src/db/repositories/finance/**` e nos dez handlers `.ts` de `src/app/api/financeiro/**`. As implementações temporárias `legacy-report-scope.ts`/`legacy-cost-scope.ts` e o filtro `financialUnitFilter` foram removidos após migrar seus consumidores.
- Em actions financeiras `.ts`, resta `dashboard-actions.ts`, aguardando reader do owner Processos. Os 19 `.ts` dessa raiz foram inventariados separadamente dos TSX.
- Os sete testes da pasta financeira e os 27 testes existentes da raiz listados acima foram adaptados. As fixtures compartilhadas de Planejamento ainda têm clientes/metadata legados e produtores financeiros com assinatura antiga; remover o marcador direto de um teste não elimina essa dependência indireta.
- Consumidores financeiros externos ainda localizados por AST e entregues aos respectivos owners: `planning-{accounting,completion,execution,postgres,publication}` e `municipal-catalog-adoption-postgres` (Planning); `procurement-financial-atomicity` (Compras); `payroll-{financial-cycle,municipal-costs,provision-accounting}`, `municipal-travel-allowance` e `travel-refunds` (RH); `tax-{accrual-accounting,financial-chain}` (Tributação); `material-subcategory-costs` (Patrimônio). Precisam acompanhar as assinaturas atuais de conexão/executor/transação, inclusive sem marcador textual Prisma no arquivo.
- Consumidores de `financeiro/planejamento.ts` pertencentes ao owner Planning (`planning-publication.test.ts`, `planning-postgres.test.ts`) devem acompanhar as novas assinaturas. Não foram editados.
- Scripts residuais com toque contábil fora do recorte próprio: `adopt-aurora-active-debt-accounts.ts` (parametrização tributária), `adopt-aurora-asset-{depreciation-accounts,depreciation-profiles,impairment-profiles}.ts` (Patrimônio) e `verify-aurora-procurement-journey.ts` (Compras). Devem ser reconciliados com os owners; não são contabilizados como migrados aqui. Os marcadores dos scripts `drizzle-*-check`/`drizzle-inventory-*` também podem ser expressões do próprio inventário, sem cliente ativo; a classificação exige leitura individual.

### Bloqueios de integração

1. **RH:** reconferido `src/app/app-domain/rh/operacoes/actions.ts`; ainda usa o contrato antigo nas quatro restituições correntes e passa `context.prisma` a `reverseRevenue`. A adequação pertence ao owner RH.
2. **Fixture Planning:** `tests/helpers/planning-execution-fixture.ts` ainda importa Prisma/metadata e chama `createExpenseRequest`, `approveExpenseRequest` e `createBudgetReservation` com `f.db` legado. O helper e seus schemas permanecem com Planning; o transporte financeiro não simula esse cliente. `connectFinanceDrizzleFixture` agora também aceita o backend PostgreSQL loopback `planning_s2` já exposto pela fixture: reutiliza a URL e o `search_path` do schema descartável e confere `current_schema()` antes de retorná-lo. Os testes de concorrência foram ligados a essa conexão, preservando sessões distintas e asserções de espera por advisory lock. Essa extensão ainda aguarda execução central. Fechamento do transporte antes de `f.close()` é preservado; o ramo PGlite trata o frame `Terminate` por limites de mensagem para encerrar o pool sem confundir bytes de SQL/dados.
3. **Tipos/SQL integrados:** diagnóstico monolítico de 17:20:35Z é anterior às migrações finais de relatórios e planejamento. Não houve novo typecheck integrado posterior nesta frente; schemas financeiros novos aguardam auditoria física/global do parent, sem DDL executado.
4. **Fingerprint documental:** reconstrução de escalares/relações em `listExtraNoteWithholdings` visa preservar o hash persistido; equivalência com registros históricos ainda precisa de prova.
5. **Memória:** smoke anterior de importação do núcleo/restituições/transporte extra com heap 128 MiB atingiu OOM. Resultado inconclusivo; não foi repetido com heap maior.

### Evidência leve recente

- ESLint sem saída passou para todos os patches recentes de testes/helpers e para `configure-poc-p1-tax-matrix.ts`; os sete scripts bancários/reconciliação e o runtime já haviam passado no lote anterior.
- Parse sintático e checagem estática de exports/imports locais mais recente: **208 arquivos, zero problemas**, heap 128 MiB. Recorte explícito: runtime/actions/APIs/repositories/contratos/schemas financeiros, sete testes da lib, 31 testes financeiros da raiz, quatro helpers próprios e oito scripts próprios. A varredura anterior de 277 usava outro conjunto; as contagens não são comparáveis nem equivalem a typecheck semântico.
- Smoke puro do matcher `financeDatabaseError`: quatro asserções passaram com heap 128 MiB, sem banco. Confere erro PostgreSQL aninhado, padrão divergente, texto SQL que contém o padrão mas causa diferente e erro de domínio sem SQLSTATE.
- `tests/finance-raw-scalars.test.ts` usa `execute` simulado: é **teste unitário de decodificação**, não evidência de driver PostgreSQL, semântica SQL, locks ou atomicidade. Execução anterior junto de `drizzle-temporal.test.ts`: três testes passaram, heap 128 MiB. Uma validação real do driver exige fixture com colunas PostgreSQL.
- Nenhum build/typecheck pesado, PGlite/suíte pesada, instalação, seed/DDL/carga Neon, sandbox, commit ou push foi executado nesta continuação. A fila de integração permanece centralizada no parent.

Para reproduzir o inventário, procurar imports/runtime/tipos/metadata Prisma e chamadas legadas por AST nas raízes reservadas; analisar cada arquivo individualmente e descontar transferências explícitas. Contagens de texto são somente inventário, nunca prova de migração integral.

### Próxima janela central sugerida

Validar primeiro as fixtures financeiras independentes (sem depender do preparo Planning):

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/finance-raw-driver.test.ts tests/public-finance.test.ts tests/municipal-account-adoption.test.ts
```

Repetir o teste de driver em processos separados com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Pacific/Auckland`. Depois da adequação das fixtures pelo owner Planning, executar os demais testes listados; `accounting-period-concurrency.test.ts` exige a URL PostgreSQL local isolada já prevista pelo runner. A fila semântica deve incluir os patches recentes, o transporte externo e as novas projeções financeiras, além da equivalência histórica dos fingerprints documentais.
