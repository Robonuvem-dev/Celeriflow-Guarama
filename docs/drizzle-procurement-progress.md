# Compras — migração Drizzle

## Reserva e contratos

- Frente exclusiva transferida de Financeiro: `src/lib/compras/**`, páginas/actions/APIs de Compras, integrações `procurement*`, schemas `procurement*`/`planning-catalog.ts`, repositories `procurement/**` e testes/scripts exclusivos.
- Lidos AGENTS, plano integral, CONTRATOS/STATUS, progresso Financeiro e guia Next instalado de mutações.
- Leituras recebem `DatabaseExecutor`; comandos que abrem transação recebem `DatabaseConnection`; writers intermodulares recebem a mesma `DatabaseTransaction`.
- Não executar build/tsc/suítes pesadas/instalação/DDL Neon/Git nesta frente. Validação integral é centralizada pelo parent.
- Mapeamento `PlanningCatalogEntry.versionId` corrigido para `onUpdate: no action`, conforme catálogo físico confirmado pelo parent; nenhuma DDL.

## Handoffs nominais em preparação

- **Patrimônio / parent:** funções `createMaterialRequest`, `approveMaterialRequest`, `issueMaterialRequestItem`, `issueMaterialRequestInFull` em `compras/procurement-lifecycle.ts` passarão a receber `DatabaseConnection`. Adaptar os quatro chamadores em `patrimonio/requisicoes/actions.ts` e fixtures/scripts exclusivos de Patrimônio; não passar `context.prisma`.
- **Financeiro / parent:** bridge de Compras consumirá `createBudgetReservationInTransaction`, `createCommitmentInTransaction`, `createSettlementInTransaction`, `cancelCommitmentInTransaction`, `cancelSettlementInTransaction` com a mesma `DatabaseTransaction`; `createExpenseRequest` recebe `DatabaseConnection`.

## Estado

Runtime de Compras convertido; aceite integral ainda depende da validação centralizada, da fixture financeira e do ensaio intermodular. Resultados de verificações pontuais estão registrados abaixo e não equivalem à aprovação integral.

### Unidades convertidas

- `procurement-lifecycle.ts`: criação/aprovação de requisição, aprovação de solicitação, agrupamento serializável de solicitações, recebimento parcial com locks ordenados e replay, entrega parcial/integral, origem financeira e custódia. Todos abrem `withDatabaseTransaction(connection, ...)`; estoque/custódia recebem o próprio `tx`.
- `price-research.ts`: pesquisa, prazo, convite, rascunho, apresentação, referência e portal/relatório. Leitores recebem `DatabaseExecutor`, comandos recebem `DatabaseConnection`. Apresentação serializa o recálculo da referência pelo registro da pesquisa. Assinatura HMAC e identidade pelo e-mail PF/PJ mantidas.
- Solicitações e processos: actions e quatro páginas de cada fluxo migradas. Preservados ActionResult, autorização, vínculo de material, rateio Decimal e isolamento serializável. Páginas somente com imports/carregamento alterados.
- Planejamento de compras: política decimal independente, action atômica e quatro páginas migradas; datas SQL DATE e numerics preservados.
- Pesquisa de preços: cinco páginas e actions sem chamadas Prisma. Teste `tests/price-research.test.ts` substitui doubles Prisma por PGlite real com `createLocalDrizzleDatabase` (pool5/maxConnections10).

### Verificações

- ESLint dirigido inicial passou sem erros, com seis avisos de variáveis não usadas posteriormente corrigidos. Novas alterações ainda precisam de nova conferência.
- Teste PGlite preparado, não executado nesta frente. Sem build/tsc/DDL Neon/Git.

### Handoffs disponíveis agora

- **Patrimônio / parent:** os quatro comandos de material acima **já recebem `DatabaseConnection`**. Os consumidores exclusivos de Patrimônio encontrados por grep incluem `patrimonio/requisicoes/actions.ts`, `tests/{warehouse-request-workflow,stock-valuation}.test.ts`, `src/lib/patrimonio/__tests__/material-request-fulfillment.test.ts` e `scripts/seed-patrimony-workflows-review.ts`. Precisam ser ligados à conexão real; fixtures ORM simuladas não atendem ao contrato.
- **Financeiro / parent:** `tests/planning-execution.test.ts` chama os bridges de Compras; não será editado nesta frente por compartilhar Planejamento. Precisa passar a conexão Drizzle quando o bridge estiver entregue.
- **Financeiro / parent — bridge entregue:** `src/lib/compras/procurement-finance-bridge.ts` não tem Prisma. Os comandos externos de AE/AF/empenho/liquidação/anulação recebem `DatabaseConnection`; registro/anulação de AL recebe executor da própria transação. Consumidores financeiros em `empenhos/actions.ts` e `liquidacoes/actions.ts` precisam passar `databaseConnection`. Export adicional necessário: **`createExpenseRequestInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input)`**, além dos cinco writers InTransaction já combinados. AE e seu evento agora são atômicos na mesma transação; nenhum cast/bridge ORM é utilizado.

### Continuação — leitores e execução de instrumentos

- Todas as páginas/actions em `src/app/app-domain/compras/**` estão sem referências Prisma (grep). Licitações inclui detalhe, novo/editar e ambos os portais de fornecedor; autorização por identidade ativa e fornecedor ativo, ordenações e limites originais preservados. DTO explícito `BiddingDetail` no repository `procurement/bidding.ts`.
- Contratos/convênios: cabeçalhos, aditivos, responsáveis, grupos, partes PF/PJ/servidor/fornecedor, medições/itens, parcelas, relatórios e seletores convertidos. `procurement/instruments.ts` recompõe relacionamentos com consultas em lote, incluindo representantes legais, movimentos de empenho e pagamentos reais.
- Execução de instrumentos bloqueia o cabeçalho com `FOR UPDATE` antes de replay/validação, preserva comparação de versão, agrega numeric por texto/Decimal e mantém bloqueios financeiros de cancelamento. Medição e registro/anulação de AL agora compartilham **a mesma transação**.
- Recebimento disponibiliza `approvePurchaseReceiptInTransaction(tx, actor, input)`; action de recebimentos chama esse writer e AL na mesma transação. O wrapper existente continua recebendo `DatabaseConnection`, com retorno e validação pré-transação preservados.
- `seed-compras.ts` e os dois `prepare-aurora-procurement-{actors,drafts}.ts` convertidos sem execução. Preparação mantém hashes, modo de leitura, replay e configuração autorizada; transações reais Drizzle.
- Fixture independente `tests/helpers/procurement-workflow-fixture.ts` usa `createLocalDrizzleDatabase`, DDL local explícita e FKs reais; testes de escopo UG/ente, C5 e catálogo compartilhado foram desvinculados da fixture DMMF/ORM de Planejamento. Teste de unicidade de licitação usa driver real e PostgreSQL `23505`; `Supplier.updatedAt` foi adicionado à fixture de pesquisa de preços.
- ESLint dirigido passou após leitores/actions/schemas de instrumentos e licitações; scripts e últimos testes ainda aguardam nova rodada. Nenhum build/tsc/PGlite/Git/DDL Neon executado.

### Contratos compartilhados ainda pendentes

- **Financeiro / parent:** `tests/procurement-financial-atomicity.test.ts` ainda depende de `createPlanningExecutionFixture`, que instancia DMMF e adapter ORM. É necessária fixture financeira real reutilizável (`DatabaseConnection` + PostgreSQL local com regras contábeis/orçamentárias), sem editar a fixture compartilhada nesta frente. Teste exclusivo será adaptado ao contrato disponível.
- **Parent / Financeiro / Tributação / Patrimônio:** `scripts/verify-aurora-procurement-journey.ts` usa hoje proxy de `$transaction` para ensaio com rollback global. Não é possível passar conexão de pool a comandos que abrem outra transação e preservar rollback. É necessário contrato **InTransaction** real para os writers de cada domínio usados no ensaio; não será substituído por adapter/proxy de transação. Compras já disponibiliza o writer de recebimento acima e pode expor os demais writers próprios quando forem definidos os compartilhados.

## Continuação de 28/10 — DTOs e integridade transacional

- Todos os exports dos 12 repositories de Compras agora têm retornos explícitos, incluindo solicitações/processos, planejamento, recebimentos, pesquisa, dispensa e origens financeiras. Consumidores localizados antes de anotar os contratos; relações opcionais, contagens e campos financeiros mantidos.
- `direct-contracting.ts` passa a reconstruir também `person.fullName`, com PF/PJ e `company: null`/`person: null` reais. A interface atual de Dispensas só exibe a empresa; eventual apresentação do nome PF é handoff visual, sem adulterar o objeto `company` para disfarçar PF como PJ.
- O bridge adota a ordem compartilhada **instrumento de Planejamento → dotação → Expense/Commitment → cabeçalho contratual/convênio → recebimento/medição** antes dos comandos financeiros. O mesmo cabeçalho bloqueado pelas actions de execução protege a validação financeira de AL contra cancelamento concorrente. O replay de AE também verifica as UGs atuais antes de reutilizar Expense/evento.
- Registro/anulação de AL e os helpers de escrita de evidência exigem `DatabaseTransaction`, após conferir todos os consumidores. As actions aguardadas continuam com seus mesmos objetos de sucesso/erro; comandos externos que abrem transação continuam com `DatabaseConnection`.
- O ateste compara soma de itens e valor do cabeçalho com Decimal, preservando a tolerância de um centavo; foi eliminada a passagem intermediária por `Number` nesse cálculo. Os consumidores da política foram conferidos e o caso acima de 2^53 centavos foi acrescentado ao teste leve.
- `tests/helpers/procurement-drizzle-fixture.ts` também foi ligado a `createLocalDrizzleDatabase`, preservando `pg`, `connection`, `runs`, `audits` e `close` dos testes exclusivos de exportação/notificação. As duas fixtures exclusivas usam o transporte real Neon/Drizzle, sem adapter de ORM.

### Verificação executada nesta continuação

- ESLint final dirigido passou, exit 0, com heap de 768 MiB: `src/lib/compras`, `src/app/app-domain/compras`, os 12 repositories, schemas `procurement*`/`planning-catalog.ts`, integrações `procurement*`, os quatro scripts convertidos, testes exclusivos de compras/licitações/contratos/pesquisa e ambas as fixtures próprias.
- `node --conditions=react-server --import tsx --test tests/contract-lifecycle.test.ts tests/procurement-finance-bridge.test.ts`: **13 passaram, 0 falharam**. Inclui o novo limite de centavos do ateste. A execução anterior com `bidding-workflow`, `contract-lifecycle` e `procurement-finance-bridge` tinha 17 aprovados; as contagens se sobrepõem e não devem ser somadas.
- ESLint dirigido repetido após o handoff de escalares e últimos testes: aprovado. Nenhum teste PGlite, tsc, build, Git, instalação, execução de seed/ensaio ou escrita em Neon nesta frente.

### Testes reais preparados para o parent

- `procurement-bidding-readers.test.ts`: titularidade ativa PF/PJ, fornecedor ativo, ausência real dos joins, última habilitação, privacidade dos lances, Decimal acima do inteiro seguro e datas aninhadas UTC/nullable.
- `procurement-direct-contracting-readers.test.ts`: identidade PF/PJ e fornecedor legado sem ambas, relação ausente e Float original do processo.
- `procurement-authorization-atomicity.test.ts`: falha injetada precisamente no evento AL desfaz recebimento/estoque/evidência; replay conserva IDs e quantidade; AL de medição participa do rollback do chamador; replay de AE nega UG vazia/divergente mesmo com a Expense existente.
- `procurement-temporal-readers.test.ts`: timestamps de contrato e planejamento, SQL DATE à meia-noite UTC, nulos relacionais e numeric exato, com literais fixos para executar nos fusos centralizados pelo parent.
- Também preparados, sem execução nesta frente: `price-research`, `c5-procurement-policy`, `procurement-budget-scope`, `shared-procurement-catalog`, `bidding-number-integrity`, `procurement-exports` e `procurement-invitation-notifications`. Instâncias de fixture no mesmo processo precisam fechar antes de abrir a próxima. Executar os arquivos pesados sequencialmente no gate centralizado.

## Handoff de escalares Neon — revisão individual concluída

Lidos `src/db/temporal.ts` e a seção **Escalares de SQL sem mapeamento de coluna** de CONTRATOS. O genérico de `execute<T>` não é decoder; `databaseTimestamp` é o contrato a usar para futuros retornos temporais brutos, campo a campo e com null explícito.

| Unidade revisada | Projeções brutas consumidas / tratamento |
| --- | --- |
| `repositories/procurement/lifecycle.ts` | As duas consultas `execute` retornam somente IDs e booleanos de escopo/origem. `valid` está tipado `boolean \| null`, pois o centro de custo vem de LEFT JOIN; o consumidor já rejeita null. Requests, itens, alocações e origens são seleções de colunas tipadas. |
| `repositories/procurement/{purchase-requests,purchase-processes,price-research,bidding,instruments}.ts` | SQL embutido retorna apenas `count(*)::integer` e EXISTS/filtros. Dates e numerics são colunas Drizzle tipadas, inclusive filhos recompostos em lote; não há JSON agregado de DTO com Date/Decimal. |
| `repositories/procurement/{direct-contracting,finance-bridge,purchase-planning,receipts,exports,invitations}.ts` | Datas, campos temporais nullable e Decimals vêm de seleções tipadas. `PurchasePlanning` conserva `date(..., { mode: 'date' })`; valores financeiros conservam `exactNumeric`. |
| `lib/compras/{procurement-lifecycle,procurement-finance-bridge,price-research,shared-catalog}.ts` | `execute` somente para locks, IDs e booleanos; timestamps de replay/ateste e valores vêm de seleções/returning tipados. Nenhum cast `Date` sobre string ou `new Date(rawTimestamp)` para DTO. |
| Actions de contratos/instrumentos/convênios/licitações | Agregados monetários usam `sum(...)::text`, recebidos como string e comparados com Decimal/centavos exatos; EXISTS e contagens são boolean/integer. Datas de negócio vêm de colunas tipadas; parsing de entrada de formulário é separado do retorno SQL. |
| Integrações `procurement*` e download | `execute` somente para advisory lock ou ID de run. Snapshots JSON são construídos explicitamente de colunas tipadas, com `.toISOString()`/null e strings de Decimal; campos de payload são JSON serializado, não DTOs Date disfarçados. Hashes e replay continuam sobre a mesma memória serializada. |
| `prepare-aurora-procurement-{actors,drafts}`, `seed-compras`, `sync-procurement-catalog` | Leituras de datas são tipadas. SQL bruto faz locks, INSERT sem retorno, UPDATE RETURNING id ou IDs de catálogo; não projeta timestamp/date/numeric para DTO. |

**Resultado:** nenhum DTO temporal bruto de Compras demandou decoder adicional. Os locais com dados temporais já usam os mappers de colunas tipadas; não foi criado import sem uso nem conversão global por nome de chave. Os testes reais preparados acima verificam timestamps nested/nullable e DATE com literais fixos; execução em múltiplos fusos permanece centralizada.

## Residual e handoffs atuais (substituem pendências históricas acima)

1. **Financeiro / parent — writers recebidos:** os seis exports `createExpenseRequestInTransaction`, `createBudgetReservationInTransaction`, `createCommitmentInTransaction`, `cancelCommitmentInTransaction`, `createSettlementInTransaction` e `cancelSettlementInTransaction` agora declaram `DatabaseTransaction` no arquivo compartilhado. O bloqueio anterior de assinatura foi removido pelo owner; é necessário integrar seus consumidores e executar o gate centralizado.
2. **Financeiro / parent — consumidores:** `financeiro/empenhos/actions.ts` e `financeiro/liquidacoes/actions.ts` ainda passam `context.prisma` aos bridges de Compras nesta conferência. `tests/planning-execution.test.ts` também precisa acompanhar a conexão real e a fixture compartilhada. Não foram editados nesta reserva.
3. **Financeiro / parent — fixture:** `tests/procurement-financial-atomicity.test.ts` ainda importa `createPlanningExecutionFixture`, que depende de DMMF/adapter ORM. A fixture financeira reutilizável de execução real continua necessária; a fixture de reporting não cobre gravação orçamentária/contábil/retenções/estornos. Não declarar esse teste migrado/aprovado.
4. **Patrimônio / parent:** actions de requisições, teste `src/lib/patrimonio/__tests__/material-request-fulfillment.test.ts` e script `seed-patrimony-workflows-review.ts` já foram ligados à conexão pelo owner. Os testes compartilhados `warehouse-request-workflow`/`stock-valuation` ainda mostram chamadores `f.db` da fixture legada e permanecem sob seu responsável.
5. **Parent / Financeiro / Tributação / Patrimônio — ensaio operacional:** `scripts/verify-aurora-procurement-journey.ts` é o único script exclusivo de Compras ainda com Prisma/proxy de `$transaction`. Continua dependendo de contratos InTransaction reais dos demais comandos financeiros, tributários e patrimoniais usados no rollback global. Nenhuma execução ou migração parcial desse ensaio foi feita.
6. **Inventário textual:** zero referências ativas a Prisma em `src/lib/compras/**`, `src/app/app-domain/compras/**`, `src/db/repositories/procurement/**`, schemas `procurement*`/`planning-catalog.ts` e integrações `procurement*.ts`. `bidding-number-integrity.test.ts` conserva somente caminhos da migração e do schema históricos como referências físicas de unicidade. A dependência indireta do teste financeiro e o ensaio acima são os dois resíduos exclusivos conhecidos.
7. **Parent — validação pendente:** typecheck dos contratos/DTOs e suíte real acima, incluindo rollback, retornos temporais e relações nulas. Build e aceite integral seguem centralizados; os resultados leves e lint desta frente não substituem esses gates.

## Fixes centrais — pesquisa de preços e catálogo compartilhado (28/10/2026)

**Responsável:** GPT-6.1 Sol — sessão `ses_e7d4ec64bffebKecNlUTI0H1Ie`, reserva exclusiva transferida pelo parent para os dois testes e `tests/helpers/procurement-workflow-fixture.ts`, com correção pontual do reader de contatos autorizada quando comprovado bug de produção.

### Falha PJ: causa de produção e correção

- O catálogo físico confirma `Company.emailPrimary` como coluna correta; `corporateName` é obrigatório e `tradeName` é nullable. O seed PJ mantém `personId = NULL`, `tradeName = NULL` e `emailPrimary = 'pj@example.test'`.
- Em `src/db/repositories/procurement/price-research.ts`, a projeção `supplierIdentity.company` começava por `tradeName`. O `mapResultRow` do Drizzle instalado usa o primeiro campo projetado do objeto para decidir se o LEFT JOIN existe: esse null tornava **todo `company` nulo**, perdendo também o e-mail PJ válido. Não era ausência de e-mail no cadastro nem erro no guard da linha 279 de `price-research.ts`.
- Correção restrita ao reader: começar a projeção por `corporateName`, obrigatório. As assinaturas, campos do DTO, `company: null` quando o join realmente falta, e validações de e-mail/titularidade permanecem preservados.
- Todos os consumidores foram localizados e lidos antes da alteração: `loadPriceResearchSupplier`, `listPriceResearchSuppliers`, `loadPriceInvitation` e `loadPriceResearchDetail` são usados pelo serviço, action de link e página de detalhe. O serviço de produção não precisou de alteração.
- Reprodução leve com o **mapper real instalado**, sem banco: a projeção anterior produziu `company: null`; a projeção corrigida preservou `{ corporateName, tradeName: null, emailPrimary }`; join ausente continuou nulo. Três asserções aprovadas. Isso comprova o defeito do mapper/projeção, mas não substitui o reteste SQL.
- `tests/price-research.test.ts` verifica os quatro leitores, convite e autenticação PJ com o e-mail da empresa, negação cruzada PF/PJ e negação para empresa realmente sem e-mail. Não foi adicionado e-mail PF ao fornecedor PJ.

### Fixture histórica para os dois testes

- Os sete consumidores originais do helper foram revisados individualmente: `c5-procurement-policy`, `procurement-budget-scope`, `procurement-authorization-atomicity`, `procurement-bidding-readers`, `procurement-direct-contracting-readers`, `procurement-temporal-readers` e `shared-procurement-catalog`.
- Vários desses testes criam suas próprias tabelas (`Company`, `Person`, `Expense`, `InstrumentMeasurement`, licitações e planejamento). Por isso o helper agora expõe **`createHistoricalProcurementWorkflowFixture(jurisdiction = 'EXECUTIVE')`** no mesmo arquivo, preservando a assinatura e contrato da entrada anterior para os consumidores fora da reserva.
- `price-research.test.ts` e `shared-procurement-catalog.test.ts` usam essa nova entrada com **replay integral, ordenado, dos 156 históricos SQL** e o transporte real Neon/WebSocket–Drizzle/PGlite. A pesquisa deixou de declarar seu próprio schema parcial.
- `Asset`, `EquipmentCustody`, sequências, FKs, obrigatoriedade, defaults e triggers vêm do histórico real. A falha `SELECT code FROM "Asset"` em `nextEquipmentCode` não é contornada por tabela de uma coluna ou remoção do leitor.
- O seed histórico próprio tem 16 inserts; o complemento da pesquisa tem sete. Conferência offline dos **23 inserts** contra o catálogo físico: zero colunas desconhecidas ou colunas obrigatórias sem default omitidas. Os inserts usam colunas explícitas e preenchem `updatedAt`, identidade PJ/CNPJ, perfil/usuários, secretaria/setor/servidores, UG/ente/exercício, natureza/fonte/dotação, documento e almoxarifado com referências reais.
- Conferidos os dados de referência históricos e os identificadores do seed: não há inserção adicional de `REF`, categoria/material/catálogo ou sequência que altere os goldens iniciais `MAT000001`, `EQP000001` e `SRV000001`. Não foi usada supressão de conflito para esconder duplicidade.
- Expectativas anteriores de parcialidade, replay, códigos, concorrência e rollback foram preservadas. A falha de rollback da pesquisa agora exige PostgreSQL `23503` na FK real `ProcurementLifecycleEvent_actorUsuarioId_fkey` e verifica também referência nula/evento não duplicado. O catálogo exige atingir a falha injetada `receipt event failure`, evitando falso positivo por erro anterior de schema.

### Evidência e handoff

- ESLint com `--max-warnings=0`: aprovado nos quatro TypeScript alterados.
- Parse dos quatro arquivos e conferência offline dos 23 inserts: aprovados.
- Reprodução do mapper real: três asserções aprovadas, sem SQL.
- Resultado central **anterior** informado pelo parent: 37 PASS / 3 FAIL em 191,51 s. Esta reserva trata as duas falhas nominais acima; esse resultado não é aprovação dos fixes.
- Nenhum PGlite/SQL integrado, tsc ou build foi executado nesta correção; reteste e strict continuam centralizados. O baseline Neon informado pelo parent — 156 receipts, data hash igual e dois no-ops — não foi alterado por execução desta frente.

Reteste dirigido solicitado ao parent, sequencial por causa da configuração Neon global:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/price-research.test.ts tests/shared-procurement-catalog.test.ts
```
