# Auditoria final — correlação de subconsultas nas projeções Drizzle

Data: 29/10/2026. Escopo: toda a árvore `src`, com correções pontuais somente onde o SQL compilado e o catálogo físico demonstraram captura indevida de coluna. Sem conexão com banco, build, tsc, npm, comandos Git ou suíte de testes.

## Resultado

**15 expressões SQL corrigidas em 11 arquivos; 19 referências externas passaram de `"id"` para o nome físico qualificado.** A seleção de manutenção patrimonial é reutilizada em duas consultas e foi corrigida na definição compartilhada.

O bug muda o significado de guards de publicação/homologação de licitação, exclusão de almoxarifado/centro de custo, duplicidade de material, bloqueio de aviso público de origem ouvidoria, contagens GED/convênios/MSC, vínculo de manutenção e leitura de estorno de devoluções na apuração de custos da saúde. Isso não significa que esses fluxos tenham sido executados nesta revisão: a comprovação realizada é do SQL produzido e da resolução nominal das colunas.

### Causa confirmada no pacote instalado

`node_modules/drizzle-orm/pg-core/dialect.js:142–163`, `buildSelection`, recebe `isSingleTable`. Em projeções sem JOIN, transforma **chunks diretos `PgColumn`** de uma expressão `SQL` em identificadores sem tabela (`:153–156`). A condição vem de `!joins || joins.length === 0` (`:267`).

Assim, no código fonte, `sql\`... WHERE i."parentId"=${outer.id}\`` parece correlacionado; no SQL compilado, pode virar `i."parentId"="id"`. Se a tabela interna também tem `id`, PostgreSQL resolve esse último identificador no escopo interno. Não se trata de parâmetro nem de falha de dados.

As alterações usam nomes físicos literais já adotados pelos SQLs do projeto e pelo reparo central de RH. Todos os `from(...)` corrigidos usam tabelas sem alias externo. Os aliases internos (`i`, `r`, `p`, `m`, `o`, `d`, `f`, `e`) foram preservados. Permissões, `where`, transações, mensagens, retornos e assinaturas exportadas foram mantidos.

## Método e cobertura

1. Busca textual e AST em **3.175 arquivos fonte de `src`**, incluindo componentes, rotas, bibliotecas e repositórios. O inventário encontrou **6.443 chamadas** `select`/`selectDistinct`/`selectDistinctOn`. A árvore recebe trabalho concorrente; os números descrevem o instante da busca.
2. Varredura ampla de templates com `SELECT` e interpolações de propriedades: 732 candidatos brutos; refinamento para propriedades importadas dos schemas: 213 templates, incluindo predicados `where`, SQL executado diretamente e projeções. Esses números são de candidatos, não de bugs.
3. Separação AST das expressões realmente contidas no argumento de seleção: inicialmente **62 templates interpolados em 41 seleções**. A cadeia de chamadas foi seguida até `from`/JOIN; SQL textual dentro de uma subconsulta não foi confundido com JOIN da consulta externa.
4. Inspeção de seleções indiretas/constantes e chamadas auxiliares: encontrou `maintenanceSelection` em `patrimonio/bens/[id]/page.tsx:28`, reutilizada nas linhas 30 e 33; verificou também constantes de Educação/Cultura, projeções importadas e subconsulta tipada de acompanhamento de saúde.
5. Reprodução por **`drizzle.mock()` + `.toSQL()`**, usando as tabelas reais importadas dos schemas e os templates extraídos por AST dos arquivos. Não foi importado `src/db/client`, não foi criado pool e nenhuma query foi executada. Para cada correção, compilou-se `mock.select({ probe: expressãoReal }).from(tabelaReal)` antes/depois: é o mesmo renderer da projeção original single-table. O nome de campo `probe` não introduz alias SQL.
6. Após as correções, os **48 templates diretos interpolados restantes foram compilados** com seus `from` e JOINs reais: **48 compilados, zero não resolvidos**. Destes, 44 mantêm as referências externas qualificadas por terem JOIN; quatro perdem a qualificação, mas não têm colisão com a tabela interna no catálogo atual, conforme detalhado abaixo.
7. Conferência das colunas internas em `tests/fixtures/installed-physical-catalog.json`: todas as tabelas internas dos casos corrigidos possuem `id`. O risco de captura não foi inferido apenas pelo formato do código.

Não foi alterado `src/lib/rh/functional-occurrences.ts`, cuja correção é da central. Não foram alterados testes financeiros, fixtures ITBI/RH, contexto de portal ou arquivos entregues por outros agentes para esses escopos. As actions/pages de compras e patrimônio abaixo foram alteradas apenas em seus SQLs comprovados.

## Casos confirmados e corrigidos

Todas as compilações isoladas abaixo retornaram `params: []` antes e depois; as interpolações removidas eram objetos `Column`, não valores de usuário. SQL com espaçamento normalizado, preservando identificadores e operadores.

| Arquivo e linha | Expressões | Efeito corrigido |
| --- | ---: | --- |
| `src/app/app-domain/compras/licitacoes/actions.ts:226,243` | 2 | Itens/resultados por lote usados nos guards de publicação/homologação |
| `src/app/app-domain/patrimonio/almoxarifados/actions.ts:137–143` | 1, com 5 referências | Registros vinculados ao almoxarifado antes da exclusão |
| `src/app/app-domain/patrimonio/centros-custo/actions.ts:69` | 1 | Vínculos antes de excluir centro de custo |
| `src/app/app-domain/patrimonio/centros-custo/page.tsx:31` | 1 | Contagem de almoxarifados por centro |
| `src/app/app-domain/patrimonio/materiais/novo/page.tsx:67` | 1 | Item de catálogo já vinculado a material |
| `src/app/app-domain/patrimonio/bens/[id]/page.tsx:28` | 1 | OS de frota da manutenção; seleção usada em histórico e manutenções abertas |
| `src/db/repositories/documents/queries.ts:30` | 2 | Documentos e subpastas de cada pasta |
| `src/db/repositories/finance/msc-configuration.ts:35` | 1 | Entradas da versão de catálogo MSC |
| `src/db/repositories/procurement/instruments.ts:67–69` | 3 | Partes, medições e parcelas por convênio |
| `src/lib/saude/billing-report-service.ts:98` | 1 | Devolução estornada na apuração de custo; consulta de movimento com JOIN na linha 97 já era correta |
| `src/lib/transparencia/public-notices.ts:16` | 1 | Origem ouvidoria verificada antes de permitir publicação |

### 1. Licitações — duas projeções

Antes:
```sql
select (SELECT count(*)::integer FROM "BiddingLotItem" i WHERE i."biddingLotId" = "id") from "BiddingLot"
select EXISTS (SELECT 1 FROM "BiddingResult" r WHERE r."biddingLotId" = "id" AND r."isCurrent" = true) from "BiddingLot"
```
Depois:
```sql
select (SELECT count(*)::integer FROM "BiddingLotItem" i WHERE i."biddingLotId" = "BiddingLot"."id") from "BiddingLot"
select EXISTS (SELECT 1 FROM "BiddingResult" r WHERE r."biddingLotId" = "BiddingLot"."id" AND r."isCurrent" = true) from "BiddingLot"
```

### 2. Almoxarifados — cinco correlações na mesma projeção

Antes:
```sql
select ((SELECT count(*) FROM "MaterialStock" WHERE "warehouseId"="id") + (SELECT count(*) FROM "MaterialMovement" WHERE "warehouseId"="id") + (SELECT count(*) FROM "PurchaseReceiptItem" WHERE "warehouseId"="id") + (SELECT count(*) FROM "InventorySession" WHERE "warehouseId"="id") + (SELECT count(*) FROM "SchoolMeal" WHERE "warehouseId"="id"))::int from "Warehouse"
```
Depois:
```sql
select ((SELECT count(*) FROM "MaterialStock" WHERE "warehouseId"="Warehouse"."id") + (SELECT count(*) FROM "MaterialMovement" WHERE "warehouseId"="Warehouse"."id") + (SELECT count(*) FROM "PurchaseReceiptItem" WHERE "warehouseId"="Warehouse"."id") + (SELECT count(*) FROM "InventorySession" WHERE "warehouseId"="Warehouse"."id") + (SELECT count(*) FROM "SchoolMeal" WHERE "warehouseId"="Warehouse"."id"))::int from "Warehouse"
```

### 3. Centros de custo — action e página

As duas expressões compilavam o mesmo SQL incorreto:
```sql
select (SELECT count(*)::int FROM "Warehouse" WHERE "costCenterId"="id") from "CostCenter"
```
As duas passaram a compilar:
```sql
select (SELECT count(*)::int FROM "Warehouse" WHERE "costCenterId"="CostCenter"."id") from "CostCenter"
```

### 4. Cadastro de material — item já vinculado

Antes/depois:
```sql
select EXISTS (SELECT 1 FROM "Material" m WHERE m."catalogItemId"="id") from "CatalogItem"
select EXISTS (SELECT 1 FROM "Material" m WHERE m."catalogItemId"="CatalogItem"."id") from "CatalogItem"
```

### 5. Bem patrimonial — OS da manutenção

Antes/depois:
```sql
select (SELECT o.id FROM "FleetWorkOrder" o WHERE o."assetMaintenanceId"="id") from "AssetMaintenance"
select (SELECT o.id FROM "FleetWorkOrder" o WHERE o."assetMaintenanceId"="AssetMaintenance"."id") from "AssetMaintenance"
```

### 6. GED — documentos e subpastas

Antes:
```sql
select (SELECT count(*)::int FROM "Document" d WHERE d."folderId"="id") from "Folder"
select (SELECT count(*)::int FROM "Folder" f WHERE f."parentId"="id") from "Folder"
```
Depois:
```sql
select (SELECT count(*)::int FROM "Document" d WHERE d."folderId"="Folder"."id") from "Folder"
select (SELECT count(*)::int FROM "Folder" f WHERE f."parentId"="Folder"."id") from "Folder"
```
Na segunda subconsulta, `f` é o alias interno; `"Folder"` continua sendo a tabela externa. Não foi removido ou renomeado alias.

### 7. MSC — entradas da versão

Antes/depois:
```sql
select (SELECT count(*)::int FROM "PlanningCatalogEntry" e WHERE e."versionId"="id") from "PlanningCatalogVersion"
select (SELECT count(*)::int FROM "PlanningCatalogEntry" e WHERE e."versionId"="PlanningCatalogVersion"."id") from "PlanningCatalogVersion"
```

### 8. Convênios — três projeções

Antes:
```sql
select (SELECT count(*)::integer FROM "InstrumentParty" p WHERE p."covenantId" = "id") from "Covenant"
select (SELECT count(*)::integer FROM "InstrumentMeasurement" m WHERE m."covenantId" = "id") from "Covenant"
select (SELECT count(*)::integer FROM "InstrumentInstallment" i WHERE i."covenantId" = "id") from "Covenant"
```
Depois:
```sql
select (SELECT count(*)::integer FROM "InstrumentParty" p WHERE p."covenantId" = "Covenant"."id") from "Covenant"
select (SELECT count(*)::integer FROM "InstrumentMeasurement" m WHERE m."covenantId" = "Covenant"."id") from "Covenant"
select (SELECT count(*)::integer FROM "InstrumentInstallment" i WHERE i."covenantId" = "Covenant"."id") from "Covenant"
```

### 9. Saúde — estorno de devolução

Antes/depois:
```sql
select EXISTS (SELECT 1 FROM "MaterialMovement" r WHERE r."reversedMovementId"="id") from "MaterialMovement"
select EXISTS (SELECT 1 FROM "MaterialMovement" r WHERE r."reversedMovementId"="MaterialMovement"."id") from "MaterialMovement"
```
`r` oculta o nome físico no escopo interno, mantendo `"MaterialMovement"."id"` como referência externa. O `filter(item => !item.reversed)` da linha 104 passa a receber a existência correlacionada ao movimento de devolução correto.

### 10. Avisos públicos — origem ouvidoria

Antes/depois:
```sql
select EXISTS(SELECT 1 FROM "Ombudsman" o WHERE o."processId"="id") from "Process"
select EXISTS(SELECT 1 FROM "Ombudsman" o WHERE o."processId"="Process"."id") from "Process"
```
Permanece a chamada de `assertProcessNoticeCanBePublished` com o mesmo contrato; somente a projeção booleana foi corrigida.

## Candidatos examinados sem correção

### JOIN da consulta externa preserva a qualificação

As **44 expressões diretas** desse grupo foram compiladas com tabelas/JOINs extraídos de suas próprias cadeias AST. Distribuição completa:

| Arquivo relativo a `src/` | Linhas / expressões |
| --- | --- |
| `app/app-domain/patrimonio/bens/[id]/page.tsx` | 22: vínculo `FleetUnit` |
| `app/app-domain/patrimonio/ciclo-vida/page.tsx` | 102: estorno de ajuste |
| `app/app-domain/patrimonio/inventarios/page.tsx` | 41: itens do inventário |
| `app/app-domain/patrimonio/materiais/movimentos/[id]/page.tsx` | 14: consumo da frota |
| `app/app-domain/patrimonio/materiais/subclasses/page.tsx` | 18: materiais da subclasse |
| `app/app-domain/saude/acompanhamento/page.tsx` | 25: itens da remessa |
| `app/app-domain/saude/administracao/unificacoes/page.tsx` | 41: duas; 46: três |
| `db/repositories/administration/bi.ts` | 13–15: três |
| `db/repositories/administration/queries.ts` | 13: uma |
| `db/repositories/education/admissions.ts` | 26: uma |
| `db/repositories/education/core.ts` | 47,73,74: três diretas |
| `db/repositories/education/teaching.ts` | 35: uma |
| `db/repositories/health-management-operations/report-administration.ts` | 42: três |
| `db/repositories/health-management-operations/report-pharmacy.ts` | 24: uma; alias `management_receiver` preservado |
| `db/repositories/infrastructure/services.ts` | 15–16: duas |
| `db/repositories/procurement/bidding.ts` | 120: uma |
| `db/repositories/procurement/instruments.ts` | 59: uma |
| `db/repositories/procurement/price-research.ts` | 66: uma |
| `db/repositories/procurement/purchase-processes.ts` | 42–45: quatro |
| `db/repositories/procurement/purchase-requests.ts` | 76: uma |
| `db/repositories/tax-actions/reports.ts` | 8: duas |
| `db/repositories/taxation-pages/cadastral-details.ts` | 43: três |
| `db/repositories/taxation-pages/economic-processes.ts` | 12: três |
| `db/repositories/works-pages/enforcement.ts` | 51: uma; alias externo `relatedAct` preservado |
| `lib/saude/billing-report-service.ts` | 97: uma |

Exemplo exato compilado sem correção:
```sql
select EXISTS (SELECT 1 FROM "MaterialMovement" r WHERE r."reversedMovementId"="MaterialMovement"."id") from "MaterialMovement" inner join "Material" on "Material"."id" = "MaterialMovement"."materialId" inner join "Warehouse" on "Warehouse"."id" = "MaterialMovement"."warehouseId"
```

Além das diretas, `education/core.ts:23–26` define três contagens em constantes e as usa numa seleção com JOIN de escola/período/matriz; não é um single-table problemático. As seleções de Cultura usam referências externas já qualificadas nos SQLs literais (`culture/queries.ts:9–14` etc.).

### Quatro projeções single-table sem colisão no catálogo atual

SQL efetivamente compilado:
```sql
-- src/db/repositories/processes/details.ts:40 — duas expressões
select (SELECT p.cpf FROM "Person" p WHERE p.id="personId") from "Process"
select (SELECT c.cnpj FROM "Company" c WHERE c.id="companyId") from "Process"

-- src/app/app-domain/patrimonio/ciclo-vida/page.tsx:92
select (SELECT r.id FROM "AccountingTransaction" r WHERE r."reversalOfId"="accountingTransactionId") from "AssetValueHistory"

-- src/lib/patrimonio/asset-lifecycle.ts:137
select EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"="accountingTransactionId") from "AssetValueHistory"
```

O fixture comprova: `Person` **não** tem `personId`; `Company` **não** tem `companyId`; `AccountingTransaction` **não** tem `accountingTransactionId`. Os identificadores sem qualificação resolvem no escopo externo, mantendo o significado pretendido. Nenhum desses casos foi alterado por risco hipotético de uma futura coluna. Se essas tabelas internas ganharem esses nomes, revisar a correlação nessa migração.

### Predicados, SQL executado e subconsultas tipadas

As interpolações em `.where(...)` não passam por `buildSelection`; um exemplo é o guard de versões documentais em `db/repositories/finance-pages/operations.ts:28–31`. `db.execute(sql)` também não passa pelo renderer de seleção single-table. Esses candidatos não foram transformados em bugs apenas porque contêm `SELECT`/`${column}`.

`db/repositories/health-followup/exchange.ts:33–38` já usa uma subconsulta Drizzle tipada (`itemCount` com `where(eq(..., healthFollowupBatches.id))`) interpolada como query completa. Os `Column` da correlação ficam dentro da query construída, fora dos chunks diretos reescritos por `buildSelection`; a seleção foi preservada.

## Verificações realizadas

- Reprodução inicial: **18 compilações isoladas**, abrangendo as 15 expressões posteriormente corrigidas e três expressões sem colisão; a quarta expressão sem colisão foi incluída na varredura completa final.
- Pós-correção: **15 projeções compiladas; PASS**; nenhuma correlação corrigida permaneceu `= "id"`; `params: []`; 19 referências externas qualificadas.
- Candidatos diretos restantes: **48 compilações; zero não resolvidos**. SQLs com JOIN mantêm correlação; os quatro single-table restantes foram reconciliados com colunas físicas.
- **Lint restrito aos 11 arquivos alterados: PASS, exit code 0, nenhuma mensagem.** Executado diretamente por `node node_modules/eslint/bin/eslint.js` com a lista explícita de arquivos da tabela de correções. Não foi usado npm.

Nenhuma assinatura exportada foi alterada, portanto não houve migração de consumidores ou contratos de retorno. A revisão não executou os fluxos em banco; a compilação central e a homologação funcional continuam sendo evidências distintas desta correção do SQL.
