# Lote compartilhados — Planejamento / Câmara / estrutura dos Cemitérios

Data: 29/10/2026. Referências lidas: `AGENTS.md`, contrato de execução, padrão v1.1, plano e inventário de tabelas. Guias Next instalados: `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/02-guides/forms.md` e `01-app/03-api-reference/03-file-conventions/layout.md`.

## Resultado e limite da evidência

- **20/20 renderizadores inventariados convertidos**: 18 de Planejamento e dois de `cemeteries/StructurePages.tsx`. Os componentes reutilizados em várias rotas são contados uma vez.
- Paginação operacional compartilhada de 20, limites por coluna e detalhes condicionais da base comum. Busca/filtros permanecem antes do recorte do servidor. Críticas, já recebidas integralmente, passam a ter recorte cliente de 20; diferenças e snapshot imutável mantêm seu recorte cliente, agora com a constante comum.
- **Implementação não equivale a homologação visual**. Nenhuma rota foi marcada como visualmente validada. Build, execução de banco, commit e push não foram executados neste lote.
- **Duas grades ativas adicionais do baseline convertidas**, em `PlanningForm.tsx`: itens orçamentários e mapeamento de compatibilização. Também convertidos de-para de catálogo, prévia da importação, seleção múltipla/lookup compacto, sepulturas do lote e consulta de anexos GED.
- Relações normativas agora percorrem **todo o histórico autorizado** com `count`, `limit(20)`, `offset` e ordenação estável Drizzle no componente consumidor. O contrato exportado de `pageReferences` não foi modificado.
- APIs comuns e bypasses dos layouts legislativo/Cemitérios estão disponíveis na árvore atual. Pendências de homologação e reconciliação do auditor são descritas abaixo.

## Composição contextual e contratos preservados

`PlanningList.tsx` é um adaptador de domínio para `OperationalListFrame`, `OperationalLinkPagination` e `OperationalTable`; não implementa outro motor de tabela. `PlanningLocalList.tsx` usa os mesmos componentes e `OperationalPagination` para dados já carregados integralmente.

`PlanningWorkspace.tsx` organiza seções explicitamente marcadas com `data-table-area`. `ContextualTables.tsx` disponibiliza o seletor de área no header operacional. Só uma tabela ocupa o corpo flexível por vez. Navegação, indicadores, informações da ficha e formulários continuam acessíveis em **Contexto e operações**. Essa área mantém o comportamento de leitura/rolagem de um formulário extenso; não está sendo declarada uma listagem sem rolagem.

`PlanningOperation` abre decisões de demanda, disponibilização de catálogo, emenda, cota ou crédito como uma área contextual da página, sem expandir a linha e sem colocar um formulário longo no diálogo de detalhes. As áreas e os formulários visitados ficam montados ao alternar a área; voltar à consulta não os submete nem os reinicializa. O foco vai à área e retorna ao acionador ao voltar. A navegação efetiva de rota conserva o ciclo de vida preexistente dos formulários, sem prometer persistência de rascunhos entre rotas.

Na ficha estrutural dos Cemitérios a área inicial é a ficha/formulário; histórico e sepulturas do lote possuem áreas próprias. Contribuintes, campos adicionais, permissões, retorno à lista e edição continuam no contexto. A página `ocupacao/[id]` agora fornece os anexos pelo slot opcional `contextContent`, dentro da ficha; upload e vínculo GED permanecem montados ao consultar histórico/sepulturas. Criar um registro (`id=novo`) mantém a ficha sem inventar histórico.

Todos os valores de células são strings integrais. Atributos independentes antes empilhados foram separados em colunas. Listas de rateios, itens de emenda, itens/reservas de crédito e códigos de compatibilização mantêm seus componentes integrais no valor textual da célula; quando excedem a célula, a base oferece leitura paginada e cópia integral. Não houve truncamento manual dos DTOs.

Retornos exportados preexistentes preservados. Após rastrear consumidores, foram acrescentados somente parâmetros opcionais: `contextContent` à ficha, opções de apresentação/disabled ao lookup e `relationshipPage` aos filtros de catálogo. Foram lidos os entrypoints dos dois recortes de Planejamento e os quatro de estrutura/ocupação dos Cemitérios; o consumidor de anexos em `processos/[id]` também foi verificado. Leituras continuam Drizzle, incluindo a mesma condição de escopo de entidades nas relações. Histórico e sepulturas ajustam pedidos excedentes à última página válida sem modificar os contratos dos repositórios.

`PlanningForm`/`PlanningLookupField` foram adaptados para painéis e controles compactos. Chamadas aguardadas continuam tratando `result.error`; não se converteu retorno em exceção. Form actions não receberam retornos novos. Revisões esperadas, idempotência, decisões parciais, permissões, eventos de origem e escopo integral de relatórios/exportações conservam os contratos anteriores. Upload GED, `StructureForm`, `PlanningReportForm` e actions mantêm sua lógica de negócio.

### Grades editáveis: estado, payload e validação fora da página

`PlanningDraftTable` utiliza `OperationalTablePanel` + `OperationalListFrame` + `OperationalTable` + `OperationalPagination`; apenas a projeção visual é recortada. `PlanningItemsField` mantém todas as linhas e identificadores estáveis no pai; `PlanningMappingField` mantém todas as seleções e novos códigos; `PlanningCatalogMappingField` mantém destino, predecessora e fonte de débito. Fechar o painel ou trocar a página pode desmontar controles, mas não o estado completo nem os hidden inputs do formulário.

O submit e a prévia executam o registro de validação de todas as grades antes da validação nativa dos demais campos. Um erro no item 21, por exemplo, impede a action, abre o painel na página 2, informa linha/campo e foca o controle. São conferidos código distinto, direção, valor positivo dentro do formato aceito pelo serviço e código novo obrigatório de até 60 caracteres quando não há destino existente. O payload serializa **todas** as linhas, não `rows.slice(...)`. A limpeza de campos ocorre somente no sucesso, pelo reset preexistente do formulário.

Lookups múltiplos agora têm painel operacional de 20; seleções completas e inputs hidden continuam no componente pai do painel. O modo compacto preserva a pesquisa remota autorizada, opção de limpar quando opcional, retorno de `{error}`, cancelamento de respostas antigas e controles de carregamento/erro/retry. Menus nativos de seleção simples continuam sendo campos de formulário.

Mínimos das novas configurações: itens **530**, compatibilização **600**, de-para de catálogo **740**, prévia **700**, lookup **320**, sepulturas **650**, anexos **520** px. Nenhum supera os **1.224 px úteis** de desktop solicitados.

## Cobertura das 20 estruturas

Convenções de rota: **B** representa tanto `/planejamento` quanto `/camara/planejamento`; **K** é cada um de `ppa`, `ldo`, `loa`; **I** é `[id]`. `gestao/S` significa `B/K/I/gestao/S`. Todos os arquivos de Planejamento abaixo ficam em `src/components/app-ui/planejamento/`.

As larguras mínimas abaixo são **somas derivadas da configuração em código**, em px CSS com fonte raiz padrão; não são medidas de navegador. As colunas de dados são redimensionáveis, sem ordenação local sobre só uma página; as utilitárias de ação têm mínimo fixo e não redimensionam. A ordenação estável dos repositórios foi preservada.

| # | Estrutura / arquivo | Rotas / área | Colunas preservadas ou desmembradas | Origem / paginação | Mínimo | Situação |
|---|---|---|---|---|---:|---|
| 01 | Catálogo — `PlanningCatalogPage.tsx` | `B/cadastros/{source,revenue,expense}` | Código, descrição; fonte: TCE, grupo/especificação/detalhe STN; receita: grau, reduzido, rateio por fonte | `pageCanonicalCatalog`, servidor 20, `q` preservado | Fonte 582; receita 488; despesa 220 | implementada |
| 02 | Solicitações — `PlanningHearingsPage.tsx` | `B/audiencias` | Solicitante, e-mail, telefone, bairro, demanda, órgão, audiência, situação, parecer, ação | `pageHearings`, servidor 20, `hearingId` | 930 | implementada; largura estreita pendente |
| 03 | Prévia de importação — `PlanningImportsPage.tsx` | `B/importacoes` | Código, descrição, exercício, UG, fonte, valor original | `pageImports`, servidor 20, `sourceId` | 596 | implementada |
| 04 | Documentos — `PlanningManagementPage.tsx` | `gestao/documentos` | Documento, finalidade, audiência, baixar versão final | `pageDocuments`, servidor 20 | 595 | implementada |
| 05 | Versões — mesmo arquivo | `gestao/versoes` | Versão, vigência, ato, motivo, consultar versão | `pageVersions`, servidor 20 | 580 | implementada |
| 06 | Críticas — mesmo arquivo | `gestao/consistencias` | Nível, referência, correção orientada; quantidade de previsões na legenda | `planningConsistency`, resultado completo; cliente 20 | 460 | implementada |
| 07 | Diferenças — mesmo arquivo | `gestao/compatibilizacao` | Códigos de origem, códigos de destino, diferença | `planningCompatibility`, cliente 20; `targetId`/`year`; página inválida ajustada | 490 | implementada |
| 08 | Emendas — mesmo arquivo | `gestao/emendas` | Número, autor, objetivo, itens/valor/sanção, situação, decisão | `pageAmendmentList`, servidor 20; preserva `linePage` | 670 | implementada |
| 09 | Cotas — mesmo arquivo | `gestao/programacao` | Previsão, fonte, mês, aberto/fechado, cota, realizado, desembolso previsto, pago, contingenciado, ação | `pageQuotaList`, servidor 20; `quotaPage`, `linePage`, `lineId` | 935 | implementada; largura estreita pendente |
| 10 | Créditos — mesmo arquivo | `gestao/creditos` | Número, modalidade, origem, evidência, itens/valor/reserva, situação, tramitação/minuta | `pageCredits`, servidor 20; demais filtros preservados | 840 | implementada; largura estreita pendente |
| 11 | Previsões auxiliares — mesmo arquivo | `gestao/{consistencias,emendas,programacao,creditos}` | Código, descrição, ano, UG, fonte, elegibilidade para emendas | `pageManagementLines`, servidor 20; `linePage` separado e demais filtros conservados | 600 | implementada; área alternável |
| 12 | Histórico legal — `PlanningMovementHistory.tsx` | `B/K/I`, área Alterações legais | Vigência, código da previsão, descrição, ato, alteração, fundamento, texto jurídico, registro em, responsável | `getPlanningMovementHistory`, servidor 20; `movementPage` separado, preserva `asOf` e página das previsões | 935 | implementada; largura estreita pendente |
| 13 | Instrumentos — `PlanningPages.tsx` | `B/K` | Código, instrumento, entidade, vigência, situação, abrir | `listPlanningInstruments`, servidor 20; `q` e entidade; filtros excedentes em sobreposição | 650 | implementada |
| 14 | Previsões correntes — mesmo arquivo | `B/K/I`, área Previsões e metas | Código, descrição, tipo, ano, UG, fonte, meta física, unidade do produto, original, vigente no corte | `getPlanningInstrument`, servidor 20; preserva data e página do histórico | 925 | implementada; largura estreita pendente |
| 15 | Edições normativas — `PlanningReferencePage.tsx` | `B/cadastros/versions` | Exercício, edição, referência, hash SHA-256, situação, árvore/disponibilizar | `pageReferences`, servidor 20; `q`, `versionId` | 745 | implementada; largura estreita pendente |
| 16 | Árvore normativa — mesmo arquivo | mesma rota, `versionId` e área Árvore | Tipo, ID da origem, código, descrição, vínculo canônico, grau | `pageReferences`, servidor 20; página solicitada ajustada ao total de entradas | 610 | implementada; área alternável |
| 17 | Relações normativas — mesmo arquivo | mesma rota, área Relações documentadas | Relacionamento, ID, edição, vigência inicial, vigência final | Drizzle no consumidor: total integral, offset/limit 20, mesmo escopo e ordenação; `relationshipPage` independente | 600 | implementada; bloqueio anterior resolvido |
| 18 | Snapshot imutável — `PlanningVersionPage.tsx` | `B/K/I?version=N` | Código, previsão, exercício, UG, fonte, original, atualizado no corte | `readPlanningVersion`, cliente 20 sobre snapshot completo, `version` e `asOf` | 706 | implementada |
| 19 | Lista estrutural — `src/components/cemeteries/StructurePages.tsx` | `/cemiterios/{estrutura,ocupacao}` | Identificação, situação, ativação, abrir; lote: cadastradas/limite/ocupadas/vagas; sepultura: ocupantes/capacidade/tipo | `listStructure`, servidor 20; busca, `tipo`, cemitério, ativo, status | Base 410; lote 780; sepultura 690 | implementada |
| 20 | Histórico por campo — mesmo arquivo | `/cemiterios/{estrutura,ocupacao}/[id]` | Data/hora, campo, antes, depois, operador | `readStructureHistory`, servidor 20; `historyPage` preserva filtros e `lotPage` | 630 | implementada; ficha e histórico em áreas separadas |

## Manifesto, navegação e consumidores

`src/components/app-ui/operational/modules/compartilhados.ts` exporta `operationalModules: OperationalModuleConfig[]` com três configurações. São **70 padrões concretos/template**: 33 para cada jurisdição de Planejamento e quatro para Cemitérios. A expansão por PPA/LDO/LOA evita que `[kind]` capture dashboards ou formulários de outras áreas. Não contar essas 70 entradas como 70 tabelas.

- Para cada B: três listagens K, três detalhes K/I, 21 seções de gestão realmente convertidas (sete por K), quatro catálogos, audiências e importações.
- Quatro rotas estruturais de Cemitérios, incluindo `novo` resolvido pelo template `[id]`.
- Não registrados: dashboards B, entidades/unidades e gestão de manutenção, workflow, relatórios e publicações. Esses fluxos mantêm sua composição de formulário/documento. Os links para eles permanecem nos menus e na navegação contextual da peça.
- `planningNavigation` reutilizada, com `exact` do dashboard. Planejamento legislativo mantém também todos os destinos do menu da Câmara (painel, legislaturas, vereadores, comissões, sessões, proposições, leis, audiências e portal).
- Navegação de Cemitérios mantém os dez tipos, os predicados `query` por `tipo`, atendimento, taxas, consulta e relatório. A propagação dinâmica do cemitério precisa da integração descrita abaixo.

Consumidores inspecionados antes das adições opcionais de props/filtros:

- Para **cada B**: `page.tsx`, `entidades/page.tsx`, `[kind]/page.tsx`, `[kind]/[id]/page.tsx`, `[kind]/[id]/gestao/[section]/page.tsx`, `cadastros/[catalog]/page.tsx`, `audiencias/page.tsx`, `importacoes/page.tsx`.
- Para Cemitérios: `estrutura/page.tsx`, `estrutura/[id]/page.tsx`, `ocupacao/page.tsx`, `ocupacao/[id]/page.tsx`.
- Consumidores internos: `PlanningPages` → histórico/versão/gestão; catálogo → referências; gestão → manutenção, relatório e upload; formulários → lookup/itens/mapeamentos. Os entrypoints continuam aguardando `params`/`searchParams` conforme os guias instalados.

## Conflitos verdadeiros e integração necessária

1. **Resolvidos na árvore atual:** APIs comuns; `CamaraPlanningLayoutShell` com bypass opcional; bypass no layout dos Cemitérios; propagação dinâmica de `cemeteryId` em `ClientLayout`. Esses arquivos foram apenas lidos nesta continuação. Não há alteração do lote na base, `ClientLayout` ou `ModuleShell`.
2. **Resolvidos neste lote:** anexos agora são filhos do contexto da ficha de ocupação, sem irmão `div.p-4`; relações normativas têm total/offset; duas grades ativas do baseline convertidas. A página de ocupação foi a única página adicional editada.
3. **Header sem duplicação de áreas ocultas:** cada área recebe um `OperationalContext` derivado do pai, com `actionsHost=null` quando inativa. Isso preserva os formulários montados e impede botões de restauração/ações das tabelas ocultas de se acumularem no header. O seletor contextual é único.
4. **Geometria:** listas/grades não receberam `overflow-y-auto`. A rolagem local de `ContextualTables` fica nas áreas de formulário/contexto/operação. A base comum reserva corpo de **504 px** para cabeçalho + 20 linhas e autoriza scroll somente em tablet/celular. As configurações deste lote passam na verificação estática de soma de mínimos <=1.224 px; tablet retrato pode usar a rolagem autorizada. Isso não substitui medição de viewport/zoom nem autoriza scroll em notebook/desktop.
5. **Reconciliação do auditor precisa registrar os novos destinos.** O mapa `editedGridTargets` do auditor atualmente só conhece substituições de Compras. As duas grades de Planejamento não têm mais `remaining` no AST, mas ficam `unresolved` até o principal mapear `PlanningItemsField → planning:budget-items-edit` e `PlanningMappingField → planning:compatibility-mapping-edit`, via `PlanningDraftTable`. A tabela adicional de sepulturas faz `StructureDetailPage` ter dois destinos: o ID antigo do histórico deve apontar explicitamente para `cemeteries:structure-history`; `cemeteries:lot-graves` é uma vista nova, não outro ID antigo. Não foi editado o scanner para aprovar artificialmente o lote. Detalhes em `cobertura.md`.

## Checks executados

- ESLint direto nos **13 arquivos TSX** do lote (oito renderizadores de Planejamento, quatro adaptadores/composição e `StructurePages.tsx`): **aprovado**, saída vazia, código 0, após a primeira rodada de migração.
- Revisão estática por arquivo de campos, permissões, links e parâmetros; rastreamento de consumidores e inspeção de consultas/DTOs, sem execução de banco.
- Verificação final de ESLint nos **14 arquivos TS/TSX**, incluindo o manifesto: **aprovada**, saída vazia, código 0. `git diff --check -- src/components/app-ui/planejamento src/components/cemeteries`: **aprovado**, saída vazia, código 0.
- Busca final de `<Table`/`<table` na pasta de Planejamento: **nenhuma tabela antiga restante**. Os rodapés ERP encontrados pertencem à manutenção/publicações/reconciliação em contexto de formulário, fora das 18 estruturas migradas.
- Continuação: **5 testes aprovados** (`planning-drafts.test.ts` + `operational-columns.test.ts`), sem banco. Cobrem payload de 41 registros, edição/remoção fora da primeira página, validação no item 21, novo código versus destino existente, todos os mínimos configurados e orçamento comum de 504 px. São checks de estado/contrato/configuração, não homologação de DOM.
- ESLint da pasta inteira de Planejamento encontrou somente um warning preexistente em `PlanningReportSubmission.tsx:18` (`window.location.assign`, regra nova do Next 16.4). Esse arquivo de emissão não foi alterado. O lint dos arquivos efetivamente alterados é executado separadamente.
- Fechamento da continuação: **ESLint dos 22 arquivos TS/TSX efetivamente alterados aprovado, sem erros ou warnings**; `git diff --check` do código e dos dois relatórios aprovado; os cinco testes foram repetidos após as últimas alterações e passaram.
- `verify-operational-coverage --check-reconciliation` retornou `passed=false`: além de Materiais fora deste lote, há ambiguidade histórica/sepulturas e duas grades sem mapeamento no auditor. `brokenRendererChains=[]`, `reviewErrors=[]`, nenhum gap de provider na leitura. Não se declara gate global aprovado.
- Não executados neste lote: build completo, mutações/leituras de banco em execução, navegador autenticado, matriz de viewport, zoom, toque e medição geométrica. Logo, não se afirma encaixe visual, fluxo end-to-end ou conformidade integral R01–R12.

Para integração, priorizar 21 resultados (20 + 1), alternância lista/histórico/cotas sem descarte de formulário, filtros entre rodapés independentes, decisão parcial de emenda, eventos de origem de cotas, importação com seleção fora da página, árvore/de-para normativo e ficha de ocupação com anexos. Reutilizar o scanner global e a matriz visual do padrão na sessão principal.
