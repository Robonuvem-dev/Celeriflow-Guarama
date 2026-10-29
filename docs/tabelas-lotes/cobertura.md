# Auditoria independente de cobertura tabular

## Fechamento global — fonte e manifestos, 29/10/2026

**Resultado atual: reconciliação e strict passam, sem blockers. Os 343 IDs principais e as 32 grades adicionais têm destinos reais no AST.** Esta seção substitui as contagens e pendências das leituras históricas abaixo. O código de domínio/shared não foi alterado pela auditoria.

Leitura atual: **3.250 arquivos** de produção em `src`, baseline `0831a93`, HEAD de referência `b9fad7382ae8197e435a8f5060b7ccd35c2109e6`. Digest de caminhos/conteúdos: `cdc138817f4cb6f83e69702674005ea4055a91ed25054469047393614048a64c`. A árvore está recebendo alterações concorrentes; repetir o check se o digest mudar.

### Quantitativo atual

| Reserva | Total | Resultado conferido no AST |
|---|---:|---|
| Operacionais ativas do baseline | 330 | **330 mapeadas** até `OperationalTable` |
| Legados do baseline | 6 | **6 adaptados**, incluindo Atendimento e Cemitérios; sem promover consumidores inexistentes |
| Especiais do baseline | 7 | **7 preservadas**, com destino e consumidores |
| Grades adicionais do baseline | 32 | **32 convertidas**, incluindo as duas legadas; nenhum `remaining`/`unresolved` |

**Zero** IDs ausentes/duplicados, erros de associação, cadeias quebradas dos destinos principais/adicionais ou caminhos operacionais sem provider identificado. **Zero** novas grades de edição, roles tabulares adicionais ou renderizadores fora da varredura sem classificação. Não há novo gap de implementação identificado por este gate estático.

### Últimas três conversões — verificadas na fonte

Os três exports de associação novos foram interpretados como dados de AST e cruzados com os callsites, renderizadores e consumidores atuais. A grade antiga deixou de existir em cada proprietário.

| Destino atual | Preferência e controles | Consumidor |
|---|---|---|
| `src/app/app-domain/saude/atendimentos/[id]/complementos/AdministrationForm.tsx:75:9` | `saude-administracao-materiais`: material, estoque, lote, quantidade e remover; rascunho/payload completos no pai | `/saude/atendimentos/[id]/complementos`; chamada em `complementos/page.tsx:117` |
| `src/app/app-domain/social/requisicoes/BenefitRequestItemsEditor.tsx:35:7` | `social-beneficio-itens-edicao`: benefício, quantidade, valor e remover; chamada real de `BenefitWorkflowClient.tsx:99:455` | `/social/requisicoes`; host em `requisicoes/page.tsx:22` |
| `src/app/portal/tributario/itbi/novo/OnlineItbiPartyEditor.tsx:34:7` | `portal-itbi-partes-edicao`: documento, participação e remover; chamada de `partyEditor` em `OnlineItbiClient.tsx:27:118`, usada para transmitentes e adquirentes | `/portal/tributario/itbi/novo`; host em `novo/page.tsx:10` |

Os três IDs estão reconciliados como `replaced-review`, com `remaining: []`, `sourceConsumers` e cadeia final até `OperationalTable`. As tabelas reais abrem em `OperationalTablePanel`; não há destino construído apenas a partir do texto do manifesto.

### Associações explicitamente corrigidas

- **Materiais:** baseline `MaterialCatalogTable.tsx:110:7` → `MaterialCatalogTable.tsx:89:5`, preferência `patrimonio-material-catalog`. Ambos os hosts passam por `MaterialStockList`: `/patrimonio/materiais` e `/patrimonio/bens/estoque`. O catálogo foi conferido na variante de listagem; `view=movimentar` mantém sua composição própria e continua excluída do workspace de catálogo pelo manifesto.
- **SST — eventos das entregas:** baseline `sst/equipamentos/entregas/page.tsx:26:5` → `DeliveryEventEditor.tsx:37:5`, preferência **`sst-equipamentos-entregas`**, linhas de `deliveryRows(data.records)`/`data.rows`. A seleção é serializada como **`itemIds`** (`DeliveryEventEditor.tsx:34`) e lida por `saveEquipmentEvent` com `form.getAll("itemIds")` em `sst/equipamentos/actions.ts:21`.
- **SST — novo receptor:** `entregas/page.tsx:34:972` usa `SstSelectionField`, preferência **`sst-entrega-recebedores-edicao`**, campo **`employeeIds`**. A cadeia passa por `SstSelectionTable.tsx:16` → `SstTablePanel` → `OperationalTable`; a action `saveEquipmentDelivery` lê `form.getAll("employeeIds")` em `actions.ts:18`. `SstSelectionField` mantém seleção no pai e `SstSelectionTable.tsx:14` emite inputs ocultos por `selectionDraftEntries`. Esta seleção é **adição**, sem substituir o ID antigo dos eventos. O verificador registra e confere separadamente ambos os contratos de campo/action em `summary.payloadContracts`.
- **Cemitérios — histórico:** baseline `src/components/cemeteries/StructurePages.tsx:66:148` → **`cemeteries:structure-history`**, tabela em `StructurePages.tsx:77`, fonte `readStructureHistory`/`history`. Consumidores atuais: `/cemiterios/estrutura/[id]` e `/cemiterios/ocupacao/[id]`.
- **Cemitérios — sepulturas:** `cemeteries:lot-graves`, `StructurePages.tsx:80`, fonte `readLotGraves`/`graves`, é vista adicional condicionada ao lote. Não é o destino do ID histórico. Anexos em `CemeteryAttachments.tsx` também são adicionais.
- **Planejamento — duas grades:** os IDs antigos `PlanningForm.tsx:94:31` e `:110:31` apontam respectivamente às chamadas atuais `PlanningForm.tsx:126` (**`planning:budget-items-edit`**) e `:158` (**`planning:compatibility-mapping-edit`**). `PlanningDraftTable` é reconhecida como adapter primitive; suas invocações conservam identidades separadas e chegam a Panel/ListFrame/Table, sem contar seu corpo novamente. Catálogo de mapeamento e prévia de importação são outras duas invocações, não substituições fictícias dos dois IDs antigos.

### As 32 grades convertidas e os manifestos

O scanner percorre todos os manifestos e interpreta todo export **`operationalEditingGrades`** encontrado, em qualquer lote. Nesta leitura há **três exports com 14 entradas**: 11 em `modules/financeiro-controle.ts:78–90`, uma em `modules/saude-servidor.ts:62–71` e duas em `modules/social-educacao-publico.ts:91–94`. As declarações foram conferidas contra o ID/função do baseline, categoria legado/ativo, callable atual, renderizador declarado, preferência exata, cadeia final e consumidores. Não bastou existir uma string no manifesto.

Os demais destinos são associações explícitas revisadas com os relatórios **e verificadas no AST**. Ausência de export em outro lote não é convertida em cobertura automática.

| Grupo | IDs de grades convertidos | Destinos conferidos |
|---|---:|---|
| Compras | 4 | `BiddingDraftTables` (membros/lote), `ReceiptForm`, `AllocationDraftTable` |
| Financeiro/Controle | 11 | `ChecklistGroupsEditor`, `ReconciliationAllocationForm`, `CostDistributionDraft`, `CreditRequestDialog`, `FiscalTermsDraft`, `AnnualBudgetDraft` |
| Patrimônio/Obras | 3 | Campos/critérios de `ConstructionRulesClient`, itens de `MaterialRequestForm` |
| Tributação | 8 | `SimulationUnitsEditor`, `FiscalFieldsEditor` nos três proprietários, `ZoningActivitiesInput`, proprietários de `PropertyProfileClient`, alvos de `AnnualBatchesClient`, opções de `PaymentOptionsEditor` |
| Planejamento compartilhado | 2 | Itens orçamentários e compatibilização, em invocações distintas de `PlanningDraftTable` |
| Transparência compartilhada | 1 | `DiscoveryLinksTable.tsx:42`, preferência `transparencia.apresentacao.destinos` |
| Saúde | 1 | Materiais da administração, em `AdministrationForm.tsx:75` |
| Social/Portal público | 2 | `BenefitRequestItemsEditor.tsx:35` e `OnlineItbiPartyEditor.tsx:34` |
| **Total** | **32** | **25 definições de destino**, por haver templates compartilhados |

As duas grades legadas de receita/despesa de `PlanejamentoClient` chegam a `AnnualBudgetDraft.tsx:11`, com chamadas distintas e fontes `lawForm.revenueForecasts` e `lawForm.expenseFixations`. Continuam sem página consumidora porque o proprietário é legado. Esse vínculo explícito evita o falso alerta de novo renderer órfão; não instala uma rota fictícia.

O JSON contém cada um dos **32** IDs com `sourceConsumers`, `targets`, `witness`, `chain`, `evidence.sourceCallSites` e origem da declaração. As preferências literais dos destinos explícitos são comparadas exatamente. Propriedades passadas a helpers compartilhados, como os três IDs de `FiscalFieldsEditor`, são conferidas nos callsites dos respectivos proprietários. Elementos HTML locais não são apresentados como bindings de componentes/callsites fictícios.

### Total de pontos pós-baseline

A unidade desta contagem é a **definição JSX do renderizador ou invocação do adapter**, e não cada linha do banco ou cada uso declarado em um relatório.

| Medida atual | Quantidade |
|---|---:|
| Definições operacionais/consumidores de adapters, sem suas primitives | **395** |
| Destinos operacionais distintos dos 330 + 6 IDs antigos | **322** |
| Pontos fora desses destinos dos 343 IDs (`postBaselinePoints`) | **73** |
| Desses 73, destinos de grades da reserva adicional de 32 | **25** |
| Desses 73, outras vistas de domínio | **47** |
| Desses 73, estado loading/error já existente no HEAD | **1** |
| Adições além dos destinos dos 343 IDs **e** das grades convertidas | **48** |

Portanto: **322 + 73 = 395**, e **73 = 25 + 47 + 1**. Não somar 343 + 73 para obter renderizadores: vários IDs antigos passaram a usar a mesma definição por aba/modo. Da mesma forma, as 32 grades convertidas usam 25 definições, não 32 corpos de tabela distintos. O HEAD continua com 344 pontos reconhecidos; a adição em arquivo novo anterior aos lotes é `saneamento/unidades/UnitsListState.tsx:10`.

As adições incluem receptor SST, editores/seletores compartilhados RH/SST, campos/valores/partes fiscais, documentos da etapa de Obras, seletores da nova requisição, novas vistas de Saúde, mapeamento/prévia/lookup de Planejamento, sepulturas e anexos. Cada ponto adicional tem cadeia final e consumidores no JSON; nenhum desses usos foi multiplicado pela quantidade de nomes em `operationalEditingPanels`.

### Nativas e rotas

Há **zero nativas operacionais ativas ou legadas não adaptadas**. Os corpos residuais fora das primitives somam **35**: sete especiais, dez de impressão estática, dez dentro de composição condicional de impressão, três variantes `view=print` e **cinco corpos antigos ocultos por seletor CSS em Tributação**. Esses cinco continuam classificados como `retained-hidden`, e não foram renomeados para impressão: DTE, ITBI, duas definições do Motor Fiscal e Notificações. A presença/ausência de CSS compilado não foi homologada nesta leitura.

Continuam **321 registros** integrados em 12 manifestos, sem rota declarada inexistente, shadowing ou export de módulo desconectado. O grafo atual alcança **377 caminhos-template** com tabelas (371 operacionais e seis especiais), mais duas entradas loading/error; 272 caminhos operacionais têm registro de workspace e os demais têm superfície local identificada. São caminhos estáticos de componentes, potencialmente condicionados a tipo de campo/aba/query; a análise não afirma que todos os ramos renderizam em toda combinação de props ou parâmetros. As duas entradas de dashboard de Planejamento continuam excluídas do resultado por não chamarem função tabular.

### Evidência individual das 340 rotas históricas e dos painéis de domínio

O JSON agora contém `baselineRouteMappings` com **340 entradas**, cada uma com página de origem, pontos chamados no baseline, IDs de destino atuais e consumidores. Resultado:

| Situação da rota histórica | Quantidade | Evidência |
|---|---:|---|
| Mantém consumidor na mesma rota | **335** | Interseção entre destinos dos IDs antigos e os renderizadores realmente alcançados pela página atual |
| Tabela deslocada para outra rota | **1** | `/configuracoes/processos` → `/configuracoes/processos/etapas`, preservando a associação do ID antigo |
| Falso positivo histórico por importação de arquivo | **4** | Dashboard e entidades de Planejamento/Câmara não chamavam tabela do inventário de 343 no baseline; não classificados como migração desaparecida |
| Sem associação | **0** | Nenhum `unresolved` no mapa de rotas |

O mapa histórico não foi substituído pela contagem de 377 caminhos atuais. As rotas adicionadas são identificadas separadamente em `baselineCallableRouteChanges`.

Os exports `operationalPanelRoutes`, `operationalTablePanels` e `operationalEditingPanels` foram reinterpretados via AST em todos os módulos: **112 declarações, 112 com evidência e zero indefinidas**. O JSON traz `panelMappings`: página/arquivo proprietário, preferências extraídas de JSX, destinos reais e cadeias finais. Famílias dinâmicas, como `rh-referencias-selecao-<kind>-<name>` e `sst-prevencao-edicao-<field>`, são comparadas aos literais/templates/condicionais do AST; um identificador desconhecido sozinho não vira wildcard universal. Rótulos `tables`/`structures` do manifesto não são tratados como IDs ou renderizadores.

A varredura residual repetida em todo `src` encontrou **dez grades CSS repetidas**: seis cópias de dados em impressão/ocultas, dois cartões operacionais, um gráfico e um informativo. **Zero grades de edição CSS remanescentes ou novas**, zero roles suplementares e zero bindings de tabela omitidos pelo scanner. Os cartões/gráfico/informativo não foram somados como tabelas novas nem usados para esconder um dos 32 IDs de edição.

### Checks desta atualização

```powershell
node scripts/audit-table-pattern.mjs --verify-index
node scripts/verify-operational-coverage.mjs --self-test
node scripts/verify-operational-coverage.mjs --check-reconciliation
node scripts/verify-operational-coverage.mjs --strict
node scripts/verify-operational-coverage.mjs --json
npx eslint scripts/audit-table-pattern.mjs scripts/verify-operational-coverage.mjs
node --check scripts/audit-table-pattern.mjs
node --check scripts/verify-operational-coverage.mjs
git diff --check -- scripts/audit-table-pattern.mjs scripts/verify-operational-coverage.mjs docs/tabelas-lotes/cobertura.md
```

Resultado esperado e observado nesta leitura: índice **343/343**, self-test, reconciliação e **strict com saída 0**. `summary.strict` contém `passed: true` e `blockers: []`. O gate estrito considera todos os scopes, inclusive as grades legadas, as 340 rotas e os metadados dos painéis de domínio, sem exceção silenciosa para eles.

O self-test também confirma que duas invocações do adapter de rascunho conservam seus IDs separados, que seu corpo primitive não é contado novamente e que identificador desconhecido não fabrica evidência de painel dinâmico. A política autorizada de rolagem continua tablet/celular, nunca desktop. Typegen/typecheck/build e homologação de geometria são etapas do principal; não foram executados nesta auditoria. Alterações limitadas ao verificador e a este relatório nesta rodada, sem DB/commit.

---

## Histórico da primeira leitura e notas de continuação dos lotes

**Data:** 29/10/2026. **Resultado: cobertura estrutural ainda incompleta.**

Baseline imutável: `0831a93`, índice de 343 IDs e plano **330 + 6 + 7**, mais **32 grades de edição/seleção**. Árvore de trabalho auditada sobre `b9fad7382ae8197e435a8f5060b7ccd35c2109e6`, após a migração Drizzle, com **3.214 arquivos JS/TS/JSX/TSX** de produção em `src`.

Digest dos caminhos/conteúdos de `src` nesta leitura: `3832f387e4c9e070f892d4eb1074796a96b6f837d078d8b12cffdce58db7ca77`. Alterações simultâneas posteriores exigem repetir os comandos abaixo; linhas nesta página referem-se à leitura acima.

## Resultado reconciliado

| Reserva do baseline | Total | Destino confirmado no AST atual | Pendência |
|---|---:|---|---|
| Operacionais com rota | 330 | **329** chegam a `OperationalTable`, diretamente ou por adapter | **1**, Materiais |
| Legados sem rota | 6 | **4** adaptados, ainda sem consumidor de rota; **2** nativos classificados | Decisão sobre legados, sem exclusão implícita |
| Especiais | 7 | **7** preservados e com consumidores identificados | Homologação própria de documento/impressão |
| Grades de edição/seleção adicionais | 32 | **4** substituídas por painéis de Compras | **26 ativas + 2 legadas** mantêm a grade anterior |

**343/343 IDs reconciliados**, sem ID ausente/duplicado, sem destino indefinido e sem cadeia de adapter quebrada. Isso inclui os **20 pontos compartilhados**, contados uma única vez, e os módulos sem definição própria, alcançados pelos seus consumidores. O detalhamento por todos os 30 grupos de origem está em `summary.coverageByModule` do verificador.

Reconciliação não significa homologação funcional ou geométrica: não foram certificados paginação de cada query, payloads de rascunhos, mínimos de colunas, a linha 20, zoom, CSS compilado ou todos os perfis/estados no navegador.

### Como a evidência foi produzida

- Leitura do inventário e plano, dos objetos Git do baseline/HEAD e do AST de **todo `src`**, incluindo arquivos novos. Nenhum relatório de lote é usado como fonte de aprovação pelo verificador.
- O scanner mantém `--verify-index` sobre o snapshot histórico. O inventário atual é uma leitura separada; movimentação de linhas não invalida artificialmente o índice antigo.
- `verify-operational-coverage.mjs` resolve funções, exports, aliases, namespaces, reexports e chamadas JSX. Uma importação de arquivo não é considerada prova de renderização de todas as funções exportadas por ele.
- Cada ID antigo tem `baselineOwner`, categoria, destino atual, justificativa e cadeia até o renderizador final em `mappings`. Desmembramentos e fusões têm identidades estruturais revisadas no próprio script, incluindo abas/modos e fontes das linhas. A lista integral é emitida por `--json`.
- O AST dos manifestos é interpretado como dados, inclusive spreads, templates, funções locais, `map` e `flatMap`. Não se importa nem executa aplicação, ORM ou action. A agregação em `modules/index.ts` e seu uso efetivo por `ClientLayout` também são conferidos.
- O corpo dos adapters é primitive; a invocação consumidora continua identificada. Ações exportadas junto com uma tabela, como `TaxRowAction`, não viram tabelas fictícias.

## Gap ativo do baseline de 330

`src/app/app-domain/patrimonio/materiais/MaterialCatalogTable.tsx:110:7` continua com HTML nativo. Consumidores reais: **`/patrimonio/materiais` e `/patrimonio/bens/estoque`**. Responsabilidade de integração já reservada ao principal; não houve alteração neste lote.

Os dois legados ainda nativos são `src/app/app-domain/atendimento/AtendimentoClient.tsx:72:9` e `src/app/app-domain/cemiterios/CemiteriosClient.tsx:110:1914`, ambos sem consumidor de rota no grafo de chamadas.

Os quatro legados adaptados permanecem em `administracao/demandas/DemandasClient.tsx:69`, `financeiro/orcamento/cadastros/CadastrosClient.tsx:42` e `financeiro/orcamento/planejamento/PlanejamentoClient.tsx:331,342`, relativos a `src/app/app-domain/`. Não foram promovidos a ativos apenas por receberem `OperationalTable`.

## Grades remanescentes — 26 ativas, em 24 arquivos

Todas as linhas abaixo têm correspondência individual com o ID antigo, pela função dona e pela expressão de repetição. Preservar estado completo, seleção e payload ao tratar esses pontos; não paginar o array de negócio para simplesmente mudar a aparência.

Base dos caminhos, salvo indicação `src/`: **`src/app/app-domain/`**.

| Origem atual | Grades | Fonte |
|---|---:|---|
| `controle-interno/ChecklistGroupsEditor.tsx:8:1110` | 1 | `group.items.map` |
| `financeiro/conciliacao-bancaria/ReconciliationAllocationForm.tsx:36:33` | 1 | `rows.map` |
| `financeiro/custos/CostsClient.tsx:23:63` | 1 | `rows.map` |
| `financeiro/custos/PayrollCostRulesClient.tsx:32:145` | 1 | `shares.map` |
| `financeiro/custos/SettlementCostsPanel.tsx:17:343` | 1 | `rows.map` |
| `financeiro/custos/StockCostRulesClient.tsx:25:126` | 1 | `shares.map` |
| `financeiro/orcamento/CreditRequestDialog.tsx:169:15` | 1 | `items.map` |
| `financeiro/relatorios/indices-constitucionais/FiscalIndicesClient.tsx:14:136` | 1 | `terms.map` |
| `financeiro/relatorios/pessoal-fiscal/PersonnelFiscalClient.tsx:17:108` | 1 | `rows.map` |
| `obras/construcao-civil/regras/ConstructionRulesClient.tsx:36:43,38:112` | 2 | `data.fields.map`, `data.checks.map` |
| `patrimonio/requisicoes/nova/MaterialRequestForm.tsx:62:163` | 1 | `items.map` |
| `saude/atendimentos/[id]/complementos/AdministrationForm.tsx:9:1758` | 1 | `supplies.map` |
| `social/requisicoes/BenefitWorkflowClient.tsx:91:481` | 1 | `items.map` |
| `tributacao/avaliacoes/simulacao/page.tsx:31:261` | 1 | unidades de `latestProfiles.values()` filtradas |
| `tributacao/configuracoes-cadastrais/ConfigurableCadastresClient.tsx:50:108` | 1 | `fields.map` |
| `tributacao/configuracoes-cadastrais/ZoningActivitiesInput.tsx:8:32` | 1 | `rules.map` |
| `tributacao/configuracoes-cadastrais/pgv-lote/PgvBulkClient.tsx:37:415` | 1 | `fields.map` |
| `tributacao/economico/eventos-veiculos/EconomicEventsVehiclesClient.tsx:32:181` | 1 | `fields.map` |
| `tributacao/imoveis/[id]/perfil/PropertyProfileClient.tsx:33:161` | 1 | `owners.map` |
| `tributacao/lotes-anuais/AnnualBatchesClient.tsx:28:45` | 1 | `input.targets.map` |
| `tributacao/motor-fiscal/PaymentOptionsEditor.tsx:8:458` | 1 | `value.map` |
| `src/app/portal/tributario/itbi/novo/OnlineItbiClient.tsx:18:217` | 1 | `rows.map` |
| `src/components/app-ui/planejamento/PlanningForm.tsx:94:31,110:31` | 2 | `rows.map`, `definitions.map` |
| `src/components/transparencia/DiscoveryPresentationEditor.tsx:50:28` | 1 | `links.map` |

**Duas grades legadas adicionais:** `financeiro/orcamento/planejamento/PlanejamentoClient.tsx:312:136,313:135`, fontes `lawForm.revenueForecasts.map` e `lawForm.expenseFixations.map`, sem rota consumidora.

**Quatro substituições confirmadas:** membros e itens do lote → `compras/licitacoes/BiddingDraftTables.tsx:17,33`; recebimento → `compras/recebimentos/ReceiptForm.tsx:69`; rateios → `compras/solicitacoes/AllocationDraftTable.tsx:17`. Cada grade tem um destino específico e cadeia até `OperationalTable` em `editingMappings`.

## Busca de nativas, UI e grids em todo `src`

Foram classificadas **37 definições residuais fora das primitives**, incluindo cópias de saída. Não são 37 pendências de migração:

| Classificação revisada | Quantidade | Evidência |
|---|---:|---|
| Operacional ativa nativa | **1** | Materiais, acima |
| Legados nativos | **2** | Atendimento e Cemitérios, acima |
| Formatos especiais | **7** | `cemiterios/relatorio/page.tsx:20`; `cemiterios/taxas/guias/[id]/page.tsx:19`; `compras/contratos/InstrumentLifecycleReport.tsx:54,58,60`; `rh/operacoes/demonstrativos/[id]/page.tsx:23`; `src/app/portal/privacidade/page.tsx:57` |
| Impressão por classe estática | **9** | `compras/pesquisas-precos/CompactItemsTable.tsx:17`; Tributação: `cobranca/CobrancaClient.tsx:286,487`, `comparativo-anual/page.tsx:48,49`, `movimentacoes-contabeis/page.tsx:65`, `nfse/NfseClient.tsx:370`, `resumo-anual/AnnualSummaryClient.tsx:27`, `vaf/VafClient.tsx:231` |
| Impressão dentro de composição condicional | **10** | Tributação: `fiscalizacao/FiscalizacaoClient.tsx:424,738,845`; `iss-bancario/IssBancarioClient.tsx:227,451,730,760,793`; `simples-nacional/SimplesNacionalClient.tsx:175,376`. A guarda `listView` e as abas correspondentes precisam ser consideradas; o texto `<table>` isolado dá falso positivo. |
| Variante explícita de impressão por query | **3** | `sst/equipamentos/necessidades/page.tsx:43` e `sst/equipamentos/relatorios/page.tsx:34:14,34:714`, alcançadas por `view=print` |
| Implementação antiga retida e oculta por seletor CSS | **5** | Tributação: `domicilio-tributario/DteClient.tsx:39`, `itbi/ItbiClient.tsx:66`, `motor-fiscal/MotorFiscalClient.tsx:118,123`, `notificacoes/DebtNoticesClient.tsx:33`. Não classificadas como impressão nem como legados sem rota. |

Os cinco pontos ocultos dependem de seletores como `[&>section:has(table)]:hidden` e `[&>section>table]:hidden`. `ErpListFrame.tsx:14` de fato devolve `section`; a confirmação do CSS compilado/visibilidade permanece parte da homologação. Nenhum desses cinco foi apagado ou considerado convertido só por estar oculto: seu **destino operacional é rastreado separadamente**.

Não restou consumidor operacional de **`Table` da UI**. A sondagem independente de bindings JSX, incluindo aliases/namespaces/reexports, encontrou **zero renderizadores omitidos pelo scanner**, zero roles `table/grid/treegrid` adicionais e zero grids de repetição adicionais em `className` dinâmico.

As **39 grades CSS repetidas atuais** são: 28 de edição, seis de dados retidas em saída de impressão/oculta, dois cartões operacionais, dois gráficos e um informativo. Os **823 candidatos de repetição alternativa** e os fragmentos HTML em strings são evidência suplementar; incluem menus, cartões e campos, não outras 823 tabelas. Não somar esses universos às 343 definições.

## Manifestos, consumidores e provider

- **321 registros de rota**, em **12 manifestos**, expandidos a partir de AST e efetivamente agregados/consumidos por `ClientLayout.tsx:65,81–85`.
- **Zero** manifestos desconectados, registros sem página compatível ou registros encobertos por outro anterior. Templates concretos de Planejamento, como `/planejamento/ppa`, são associados às páginas `[kind]`; não são rotas inexistentes.
- **340 rotas-template realmente consumidoras de tabelas**, sendo **334 operacionais e seis de especiais**; **342 entradas** ao incluir `loading.tsx` e `error.tsx` de Unidades Consumidoras.
- Das 334 operacionais, **272** são cobertas pelo registro do workspace e **62** usam superfícies locais. **Zero rotas com tabela operacional exigindo provider sem um caminho de provider identificado**. Isso é uma verificação estática dos caminhos, não uma certificação de todas as combinações de query.
- As rotas de painel declaradas em `operationalPanelRoutes` são metadados; não são tratadas como registro efetivo. O verificador exige o caminho real até `OperationalTablePanel`/`OperationalSurface`, inclusive o caso de JSX atribuído à variável `list` em `educacao/EducationListClient.tsx:42–52` com guarda por pathname.
- Quatro falsos positivos do grafo por **arquivo importado** foram retirados do resultado independente: `/planejamento`, `/planejamento/entidades` e equivalentes sob `/camara`. `PlanningPages.tsx:32–52` exporta dashboard/entidades sem tabela; importar esse arquivo não renderiza automaticamente as funções tabulares das linhas 54 em diante. O índice histórico não foi reescrito.
- Em relação ao grafo callable do baseline: a tabela saiu de `/configuracoes/processos` para `/configuracoes/processos/etapas`; quatro rotas de formulários de Compras passaram a consumir os novos painéis de edição (`licitacoes/[id]`, `recebimentos`, `solicitacoes/novo`, `solicitacoes/[id]/editar`). Essas mudanças explicam o delta real de consumidores.

## Pontos posteriores ao baseline / base Drizzle

O HEAD anterior às alterações de lote possui **344 pontos tabulares reconhecidos**, incluindo **um ponto em arquivo novo em relação ao baseline**: `src/app/app-domain/saneamento/unidades/UnitsListState.tsx:10`. É o estado loading/error do piloto, com consumidores em `unidades/loading.tsx:4` e `unidades/error.tsx:8`; não é um legado órfão. Ambos foram incluídos na análise de provider. Os demais pontos do HEAD estão em arquivos já existentes no inventário.

Na árvore atual há **334 definições do renderizador operacional/consumidores de adapters**, além das nativas classificadas. A quantidade de renderizadores não substitui a quantidade de IDs de escopo: tabelas antigas foram fundidas por aba/modo e outras foram desmembradas em painéis relacionados.

Além dos destinos reconciliados dos 343 IDs, há **15 pontos**, todos explicitados em `newCandidates`:

- **4** substituem as grades de edição de Compras da reserva adicional de 32;
- **1** é o estado loading/error já existente no HEAD;
- **10** são vistas adicionais/desmembradas: itens e empenhos do contrato, origens do processo, alocações e origens da solicitação, entradas da parcela de consignação, períodos PPP, relatório funcional SST, catálogo de GHEs e responsabilidades da ordem de serviço.

O scanner não encontrou importação runtime de `@prisma/client`/`generated/prisma` no AST analisado. A auditoria não usa a hipótese de Prisma ativo para explicar ou bloquear nenhuma pendência.

## Rolagem e limite desta conclusão

A política atual autorizada é **tablet/celular podem rolar; desktop/notebook não**. `OperationalTable.tsx:160–164` condiciona `canScroll` a `phone`/`tablet`; `operational.module.css:138–158` contém as regras de dispositivo correspondentes. A autorização não elimina o tratamento das 26 grades ativas.

Há rolagem explícita em áreas contextuais de edição que ainda requer revisão: por exemplo, `src/components/app-ui/planejamento/ContextualTables.tsx:50–51` usa `overflow-y-auto` sem guarda de dispositivo; `PlanningForm.tsx:94,110` mantém duas grades nesse fluxo. Nas composições antigas retidas, `ErpListFrame.tsx:17` também declara `overflow-auto`. Não se declara conformidade desktop com base no uso de `OperationalTable` ou na ausência de uma barra visível no código-fonte. Base/API, Materiais e integração geométrica permanecem sob execução do principal.

## Checks executáveis

```powershell
# Índice histórico: esperado passed=true, 343 IDs, saída 0.
node scripts/audit-table-pattern.mjs --verify-index

# Testes do próprio auditor: import não usado, aliases/reexports/namespaces,
# provider em JSX armazenado em variável, guardas por rota, primitives,
# expansão de manifestos e semântica dos templates. Esperado saída 0.
node scripts/verify-operational-coverage.mjs --self-test

# Todos os IDs reconciliados, sem aprovar artificialmente gaps conhecidos.
# Esperado passed=true, saída 0.
node scripts/verify-operational-coverage.mjs --check-reconciliation

# Inventário completo por ID/destino, cadeia final, rota, grid e classificação.
node scripts/verify-operational-coverage.mjs --json

# Gate de completude. Nesta leitura DEVE retornar saída 1:
# uma estrutura ativa nativa + 26 grades ativas remanescentes.
node scripts/verify-operational-coverage.mjs --strict

npx eslint scripts/audit-table-pattern.mjs scripts/verify-operational-coverage.mjs
node --check scripts/audit-table-pattern.mjs
node --check scripts/verify-operational-coverage.mjs
git diff --check -- scripts/audit-table-pattern.mjs scripts/verify-operational-coverage.mjs docs/tabelas-lotes/cobertura.md
```

Histórico, self-test, reconciliação, ESLint, sintaxe e whitespace passaram; o gate estrito acusou as pendências esperadas. Foram alterados somente os dois scripts e este documento. Nenhuma conexão/mutação de banco ou operação de commit foi executada.

## Continuação do lote compartilhados — 29/10/2026

Esta seção atualiza **somente os destinos de Planejamento/Cemitérios** após o snapshot acima. As contagens globais anteriores são históricas: outros lotes estão sendo editados simultaneamente e não foram reclassificados por esta continuação.

| Gap / origem | Destino atual e contrato | Situação do código |
|---|---|---|
| `PlanningForm.tsx`, baseline 94:31, `PlanningItemsField`, `rows.map` | `PlanningDraftTable`, preferência `planning:budget-items-edit`; Panel + ListFrame + Table/Pagination de 20; dotação, direção, valor e remover | **Convertida**. Array completo e ids estáveis no pai; hidden input transmite todos os itens; validador identifica índice/campo fora da página e abre/foca a página correta. |
| `PlanningForm.tsx`, baseline 110:31, `PlanningMappingField`, `definitions.map` | `PlanningDraftTable`, preferência `planning:compatibility-mapping-edit`; origem, destino e código novo | **Convertida**. Seleções e códigos completos no pai; código novo obrigatório somente sem destino; validação de todas as linhas antes da action. |
| De-para de catálogo, não contado como novo ID do baseline | `planning:catalog-mapping-edit`; tipo, origem, destino canônico, edição predecessora, fonte do débito | **Convertida**. Todas as escolhas permanecem no pai ao paginar/fechar; payload integral dos destinos selecionados. |
| Prévia de importação | `planning:import-preview`; código, anos origem/destino, valor e pendência | **Convertida** em painel de 20 sobre o resultado completo, sem reduzir o escopo da operação. |
| Seletores múltiplos / lookup compacto de Planejamento | `PlanningLookupField` → `OperationalTablePanel` → Table/Pagination; `planning:lookup:${name}` | **Convertidos**. Seleção e inputs hidden completos no pai do painel; busca e total continuam na action Drizzle autorizada; paginação não limpa seleção. |
| Relações normativas limitadas às últimas 20 | `PlanningReferencePage` faz count e página Drizzle no consumidor, com o mesmo `planningEntityScope`, categoria, tipo e ordenação por data/id | **Limitação resolvida**. `relationshipPage` independente; `q`, versão e página das outras áreas preservados. Retorno/export de `pageReferences` não alterado. |
| Irmão `div.p-4` com anexos de `cemiterios/ocupacao/[id]/page.tsx` | Slot opcional `StructureDetailPage.contextContent`, dentro da área de contexto da ficha | **Resolvido**. Upload/vínculo GED continuam na mesma instância; não disputam altura quando o histórico está ativo. Esta foi a única página adicional editada. |
| Listas adicionais de sepulturas/anexos | `cemeteries:lot-graves` em área contextual; `cemeteries:attachments` em painel com paginação do endpoint existente | **Convertidas**. Código/tipo/ocupação/capacidade/status/ativação e título/data/autor/abrir preservados em colunas próprias. |
| Ações de tabelas ocultas no header | `ContextualTables` fornece `actionsHost=null` às áreas inativas, mantendo os demais dados do contexto | **Resolvido**. Só a área ativa publica ações/reset no header; seletor contextual único; formulários permanecem montados. |

### Checks desta continuação

- Cinco testes sem banco aprovados: payload de 41 itens com edição/remoção fora da primeira página; validação no item 21; payload de 41 mapeamentos; código novo versus destino existente; inspeção AST de todas as configurações de colunas do lote para soma de mínimos **<=1.224 px**, preservando os campos. Orçamento compartilhado confirmado por constantes: **21 × 24 = 504 px** para cabeçalho + 20 linhas.
- Listas/grades não receberam rolagem desktop. `overflow-y-auto` permanece somente nas áreas de formulário/contexto/operação. A política comum já autoriza rolagem de tablet/celular; não foi ampliada para notebook/desktop.
- APIs atuais, bypass legislativo e de Cemitérios e propagação de `cemeteryId` em `ClientLayout` foram apenas lidos. Base operacional, `ClientLayout`, `ModuleShell`, scripts, build e banco não foram alterados/executados nesta continuação.
- Fechamento: **ESLint aprovado nos 22 arquivos TS/TSX efetivamente alterados, sem erros ou warnings**; `git diff --check` aprovado no código e nos dois relatórios; os cinco testes passaram após as últimas alterações. Uma sondagem mais ampla da pasta encontrou um warning já existente em `PlanningReportSubmission.tsx:18` sobre `window.location.assign` (regra Next 16.4), sem alteração no fluxo de emissão/exportação.
- As duas grades legadas adicionais de `financeiro/orcamento/planejamento/PlanejamentoClient.tsx` ficam fora do escopo exclusivo de componentes compartilhados deste lote e não foram modificadas. Não são tratadas como convertidas por esta entrega.

### Pendência do mapa do auditor — não confundir com grade antiga preservada

Na execução de `node scripts/verify-operational-coverage.mjs --gaps` após estas conversões:

- As duas grades antigas de `PlanningForm` têm **`remaining: []`**, mas status **`unresolved`** porque o mapa `editedGridTargets` conhece somente os quatro destinos de Compras. Precisam de mapeamento explícito `PlanningItemsField → planning:budget-items-edit` e `PlanningMappingField → planning:compatibility-mapping-edit`, ambos através de `PlanningDraftTable → OperationalTable`.
- O baseline `src/components/cemeteries/StructurePages.tsx:66:148` passou a ter dois destinos candidatos: histórico e a nova vista de sepulturas. Seu destino correto é **`cemeteries:structure-history`**; **`cemeteries:lot-graves`** é adição, sem novo ID antigo a reconciliar.
- `--check-reconciliation` retornou **`passed:false`**, com 328 operacionais mapeados, uma nativa de Materiais fora do lote e uma ambiguidade de Cemitérios. `brokenRendererChains=[]`, `reviewErrors=[]` e nenhum gap de provider na leitura. Não se afirma gate global aprovado.

O responsável pelo auditor deve acrescentar essas associações por origem/expressão/preferência, preservando as identidades históricas. O lote não editou o script nem manteve grades fictícias para satisfazer o scanner. A documentação completa por estrutura/rota está em [compartilhados.md](compartilhados.md). Medição visual, zoom, foco real do painel e homologação autenticada continuam sem evidência de navegador nesta continuação.
