# Lote `patrimonio-obras` — implementação completa do escopo delegado

Atualizado em 29/10/2026 após resolver os seis bloqueios iniciais e retomar as grades adicionais apontadas por `docs/tabelas-lotes/cobertura.md` e `verify-operational-coverage.mjs --json`. Referências lidas: `AGENTS.md`, padrão, plano, inventário, contrato de execução e documentação instalada do Next sobre Server/Client Components, composição por `children` e layouts/páginas.

## Cobertura

| Origem | Implementadas pelo lote | Reservadas ao principal | Bloqueadas |
|---|---:|---:|---:|
| Patrimônio | 13 | 1 (Materiais) | 0 |
| Obras | 14 | 0 | 0 |
| Frotas | 1 | 0 | 0 |
| **Total do inventário** | **28** | **1** | **0** |

Todas as **28 estruturas delegadas** têm implementação operacional. A amostra de Materiais continua com o principal e não é declarada entregue por este lote. `materiais/MaterialCatalogTable.tsx`, `_components/MaterialStockList.tsx` e `materiais/page.tsx` não foram editados. `/patrimonio/bens/estoque` reutiliza a amostra e não é outra estrutura.

Também estão implementadas as **3/3 grades adicionais do baseline deste lote** (2 Obras + 1 Patrimônio; Frotas não tem grade nessa reserva). A lista editável de documentos da etapa foi convertida adicionalmente, por ter a mesma organização repetitiva de registros/campos. Essas quatro vistas não são somadas às 28 tabelas do inventário.

“Implementada” distingue código migrado de homologação visual: ESLint e testes de estado não comprovam geometria nem integração da base. A integração, o build e o navegador continuam com o executor principal.

## Composição e manifesto

- As consultas independentes usam `OperationalListFrame`, `OperationalTable` e paginação central. Campos antes ocultos por breakpoint são declarados na grade; atributos independentes antes empilhados foram separados. `values` contém o texto integral, `cells` preserva links/edição e `actions` preserva controles e permissões.
- `_components/operational-columns.ts` é somente configuração tipada. Não implementa geometria, fonte, persistência ou renderização paralelas.
- Os seis casos antes bloqueados usam `OperationalTablePanel` de `@/components/app-ui/operational/OperationalTablePanel`, conforme a nova API garantida pelo principal: `{ title, triggerLabel?, description?, children }`. Cada vista explícita full-screen contém sua tabela/rodapé e recebe contexto/header próprios da base. Os formulários permanecem no pai.
- `_components/RecordHistoryPanel.tsx` compõe as primitives para históricos **já carregados integralmente**, com busca antes do recorte e paginação de 20. Históricos paginados no servidor compõem diretamente o painel e `OperationalLinkPagination`.
- Manifesto: `src/components/app-ui/operational/modules/patrimonio-obras.ts`. `operationalModules` registra **21 URLs** (8 Patrimônio, incluindo as duas URLs da amostra; 12 Obras; 1 Frotas). Preserva identidade, destinos, `exact` e filtros `area` de Frotas.
- O export de inventário `operationalTablePanels` registra os **12 painéis/variantes e seus hosts**, títulos e `preferenceId`, incluindo as quatro vistas de edição e as duas variantes do seletor compartilhado de referências. Esses hosts de ficha/formulário **não** são instalados como listagem de rota inteira: o painel fornece seu próprio workspace, preservando o formulário externo e seu estado.
- Os três layouts de módulo usam `useOptionalOperationalWorkspace` para evitar shell duplicado nas listagens registradas.

### Variantes de formulário excluídas da composição de listagem

| URL | Consulta operacional | Variante preservada fora do workspace da rota |
|---|---|---|
| `/patrimonio/materiais`, `/patrimonio/bens/estoque` | Catálogo da amostra principal | `view=movimentar` |
| `/patrimonio/ciclo-vida` | Posição, baixas e ajustes | `view=operacoes`, com `sourceView`/página preservando os fatos disponíveis para estorno |
| `/obras/construcao-civil/configuracoes` | Classificações | `view=parametros` |
| `/obras/construcao-civil/fiscalizacao` | Processos fiscais | `view=abrir`, com a busca de imóveis |
| `/obras/construcao-civil/participacao` | Participações | `view=gerenciar`, com identidade, participação e termo |
| `/obras/construcao-civil/regras` | Histórico publicado | `view=editar`, com campos, critérios, documentos, zoneamento e distribuição |

## Evidência por estrutura

Prefixos: `P = src/app/app-domain/patrimonio/`, `O = src/app/app-domain/obras/`, `F = src/app/app-domain/frotas/`. Todos os itens abaixo são **implementados**, exceto P10/principal. “Servidor 20” e “cliente 20” identificam a origem do recorte; os mínimos são somas configuradas em pixels CSS a 100%, não medições de viewport.

| ID | Arquivo / estrutura e rota | Colunas | Origem/paginação; mínimo | Adequação e preservação |
|---|---|---|---|---|
| P01 | `almoxarifados/WarehouseTable.tsx` + página; `/patrimonio/almoxarifados` | Nome, tipo, endereço composto, responsável, centro de custo, situação, ações | Servidor 20; 670 px | Endereço estruturado explícito; editar/ativar/excluir e confirmações mantidos |
| P02 | `bens/[id]/page.tsx`; `/patrimonio/bens/[id]` | Início, conclusão, serviços, situação, custo, OS | Servidor 20; 580 px | **B01 resolvido:** painel de manutenções, total real e clamp; ficha, operações e transferências preservadas |
| P03 | `bens/page.tsx`; `/patrimonio/bens` e abas | Código, tombamento, descrição, categoria, localização, responsável, situação, valor, ações; tombamento acrescenta data, marca/modelo separados | Servidor 20; 795 / 750 px | Visões e ações no header; filtros em sobreposição; mínimos revisados para preview/detalhes |
| P04 | `centros-custo/CostCenterTable.tsx` + página; `/patrimonio/centros-custo` | Código, nome, descrição, vínculos, situação, ações | Servidor 20; 640 px | Permissões e confirmações mantidas |
| P05 | `ciclo-vida/page.tsx`, posição; `?view=posicao` | Código, tombamento, descrição, categoria, situação, vida útil, valor líquido | Servidor 20; 740 px | Link do bem e total contábil mantidos |
| P06 | Mesmo arquivo, baixas; `?view=baixas` | Data, código, tombamento, descrição, tipo, contábil, recebido, resultado | Servidor 20; 860 px | Tombamento antes restrito a title virou coluna |
| P07 | Mesmo arquivo, ajustes; `?view=ajustes` | Data, código, tombamento, descrição, tipo, valor, novo valor contábil | Servidor 20; 790 px | Decimais e seleção de fatos para estorno mantidos |
| P08 | `inventarios/InventoryCountClient.tsx`; `/patrimonio/inventarios/[id]` | Código, material, unidade, lote, esperado, contado, divergência, evidência, justificativa, ação | Cliente 20; 765 px | **B02 resolvido:** painel; rascunhos controlados por ID no pai, editor de item, aprovação e encerramento preservados |
| P09 | `inventarios/page.tsx`; `/patrimonio/inventarios` | Início, almoxarifado, responsável, itens, situação, bloqueio, ação | Servidor 20; 655 px | Iniciar inventário no header e campos antes ocultos visíveis |
| P10 | `materiais/MaterialCatalogTable.tsx`; `/patrimonio/materiais` e `/patrimonio/bens/estoque` | Configuração da amostra técnica | Servidor 20 | **Principal**; rotas de catálogo no manifesto com `excludeQuery view=movimentar` |
| P11 | `requisicoes/[id]/MaterialRequestWorkflowClient.tsx`; `/patrimonio/requisicoes/[id]` | Código, material, unidade, solicitado, aprovado, entregue, pendente, origem/lote selecionados, atendimento | Cliente 20; 755 px | **B03 resolvido:** painel e editor; aprovação e entrega integral continuam sobre todos os itens |
| P12 | `requisicoes/[id]/page.tsx`; mesma rota, entregas | Data, código, material, origem, lote, destino, recebedor, quantidade, unidade | Histórico integral já carregado; cliente 20; 700 px | **B04 resolvido:** `RecordHistoryPanel`; workflow permanece montado no pai |
| P13 | `requisicoes/page.tsx`; `/patrimonio/requisicoes` | Número, data, origem, destino, solicitante, itens, situação, ação | Servidor 20; 810 px | Destino/solicitante separados; Analisar/Atender/Consultar preservados |
| P14 | `valorizacao/page.tsx`; `/patrimonio/valorizacao` | Data, movimento, código, material, almoxarifado, lote, quantidade, valor, saldo | Servidor 20; 695 px | **B05 resolvido:** painel único com filtro de posição; histórico completo em vez dos últimos 10; conciliações e GED preservados |
| O01 | `components/MedicoesClient.tsx` + página; `/obras/fiscalizacao-medicoes` | Medição, código da obra, obra, período, valor, situação, ações | Cliente 20; 735 px | Valor antes oculto visível; filtros, edição/inativação e sheet mantidos |
| O02 | `components/ObrasProjetosClient.tsx` + página; `/obras/obras-projetos` | Código, obra/projeto, local, tipo, situação, ações | Cliente 20; 680 px | Filtros antes do recorte; ajuste de página e sheets mantidos |
| O03 | `components/ServicosUrbanosClient.tsx` + página; `/obras/servicos-urbanos` | Protocolo, serviço, local, tipo, situação, ações | Cliente 20; 680 px | Edição/inativação e filtros mantidos |
| O04 | `construcao-civil/[id]/page.tsx`; `/obras/construcao-civil/[id]` | Data, anterior, substituto, motivo | Servidor 20; 460 px | **B06 resolvido:** painel de substituições; mantém `page`, `reviewPage`, `messagePage` e formulário de designação/análise |
| O05 | `construcao-civil/configuracoes/ConstructionSettingsClient.tsx` + página | Nome, descrição, situação, ação | Servidor 20; 490 px | Catálogo e editor compacto; parâmetros em variante própria |
| O06 | `construcao-civil/construtoras/page.tsx` | Empresa, início, validade, situação | Servidor 20; 480 px | Habilitação em sobreposição; permissões e perfis mantidos |
| O07 | `construcao-civil/equipe/ConstructionStaffClient.tsx` + página | Servidor, setor, papel, início, fim, situação, ação | Servidor 20; 700 px | Vigência separada, setor antes oculto visível e editor com estado no pai |
| O08 | `construcao-civil/fiscalizacao/page.tsx` | Processo, inscrição, endereço, setor, alvará, localização, situação fiscal/protocolo separadas, ação | Servidor 20; 755 px | Campos independentes e mínimos revisados; abertura em variante própria |
| O09 | `construcao-civil/page.tsx` | Protocolo, requerente, setor, categoria, localização, regularização, área, situação, ação | Servidor 20; 725 px | Sem ocultação ou empilhamento; mínimos revisados |
| O10 | `construcao-civil/participacao/page.tsx` | Protocolo, profissional, papel, situação | Servidor 20; 480 px | Identidade/participação/termo preservados na variante de gestão |
| O11 | `construcao-civil/profissionais/ConstructionProfessionalsClient.tsx` + página e aba empresas | Profissional, profissão, conselho, registro, início, fim, situação, ação; empresa/responsável na outra aba | Servidor 20; 750 / 640 px | Cadastro/validade e campos independentes mantidos |
| O12 | `construcao-civil/regras/ConstructionRulesClient.tsx` → página | Registro, versão, resumo, publicação | Servidor 20; 490 px | Histórico separado do editor de campos/critérios; payloads mantidos |
| O13 | `relatorios/page.tsx` → `WorksReportsClient.tsx`, obras | Situação, quantidade | Agregados carregados; cliente 20; 310 px | Uma visão ativa por vez e resumo integral contextual |
| O14 | Mesmo componente, serviços | Situação, tipo, quantidade | Agregados carregados; cliente 20; 450 px | Todos os indicadores/totais mantidos |
| F01 | `FrotasClient.tsx` + página; `/frotas?area=...` | Todas as colunas de `FleetList.columns` e ação | Servidor 20; 80 px/texto, 95 px/número, 65 px/ação; até 575 px nas variantes atuais | Ficha, operações, seleção e emissão integral mantidas; mínimos revisados |

As rotas O05–O12 seguem `/obras/` + o diretório do arquivo, sem alteração de destino. Componentes compartilhados não são contados de novo por variante de aba.

## Grades de edição adicionais — retomada da auditoria

| Baseline / fonte | Destino concreto | Colunas e mínimo configurado | Estado |
|---|---|---|---|
| `obras/construcao-civil/regras/ConstructionRulesClient.tsx:38:43`, `data.fields.map` | Mesmo componente, `OperationalTable` com `preferenceId="obras-regras-campos-edicao"`, em `OperationalTablePanel` | Chave, rótulo, tipo, opções, obrigatório, remover; **570 px** | **implementada**, cliente 20 |
| Mesmo arquivo `:40:112`, `data.checks.map` | `obras-regras-criterios-edicao` | Chave, descrição, obrigatório, remover; **370 px** | **implementada**, cliente 20 |
| `patrimonio/requisicoes/nova/MaterialRequestForm.tsx:62:163`, `items.map` | Mesmo componente, `patrimonio-requisicao-nova-itens-edicao`, em painel | Material, descrição, unidade, quantidade, saldo na origem, editar/remover; **590 px** | **implementada**, cliente 20 |
| Lista adicional `data.documents`, sem ID próprio na reserva de 32 | `obras-regras-documentos-edicao` | Documento, obrigatório, remover; **310 px** | **implementada**, cliente 20 |
| Seletor contextual de dados de `SearchReferenceField.tsx`, compartilhado pelas pesquisas de material/servidor | `patrimonio-requisicao-referencias-${kind}` | Referência, descrição, unidade, saldo, selecionar; **485 px** | **implementada**, servidor 20, contado uma vez |

- `data`, `items`, identidades estáveis, páginas e editor de opções/material vivem no componente pai. Fechar o painel desmonta somente a apresentação. IDs auxiliares de linha não entram no DTO de publicação.
- Campos de escolha mantêm **todas** as opções em `entry.options`; a edição multilinha abre diálogo, sem aumentar a altura da linha. Tipo, chave, rótulo e obrigatoriedade seguem controlados na tabela. Limites de 50 campos, 100 critérios e 50 documentos foram preservados.
- A publicação continua enviando `{ kind, definition: data }` completo. Validações de campos obrigatórios também percorrem os registros fora da página e apontam a página do primeiro inválido. As permissões são aplicadas diretamente aos controles no portal, pois o `fieldset disabled` do formulário externo não cobre DOM portaled.
- Na nova requisição, seleção de origem/destino/recebedor, justificativa e chave de idempotência permanecem no pai. O editor de material preserva categoria, tipo, saldo e pesquisa; a alteração da origem continua limpando a seleção de **todos** os itens. Envio usa o array completo, validando também quantidades fora da página (mínimo original `0.000001`). Adição navega para a última página e remoção mantém os demais rascunhos.
- O seletor de referências foi analisado como consulta de dados (referência, descrição e seleção, com total/API paginada), e não como cartão informativo. Sua área antiga `max-h-44 overflow-y-auto` foi substituída por painel/tabela/paginação, sem scroll desktop forçado. Endpoint, parâmetros, debounce, aborto de requisições antigas, retorno integral de `SearchReferenceRecord` e seleção no pai foram mantidos; erro agora também oferece retry. As pesquisas de materiais e servidores reutilizam a mesma implementação.
- Finalidades/categorias de zoneamento foram analisadas como escolhas de um campo multisseleção, sem atributos tabulares por registro; menus, opções nativas, cartões e gráficos não foram convertidos indiscriminadamente. O JSON atual retorna **zero grades CSS** para os três módulos do lote.

### Reconciliação do auditor a cargo do principal

O `--json` após as mudanças confirma `remaining: []` para as três grades, `newEditingGrids: []`, zero grades CSS nos três módulos e **cinco novos `OperationalTable` com `provided: true`** nas rotas corretas (quatro editores e um seletor compartilhado). Também retorna `routesMissingProvider: 0`. Entretanto os três IDs aparecem como **`unresolved`**, não como `replaced-review`: o trecho `editedGridTargets` do script só possui substituições de Compras e o seletor é condicionado a `grid.file.includes("/compras/")`.

O principal deve associar os três IDs acima aos respectivos `preferenceId` (campos → `obras-regras-campos-edicao`, critérios → `obras-regras-criterios-edicao`, itens → `patrimonio-requisicao-nova-itens-edicao`). O quarto painel de documentos é uma vista adicional. O script compartilhado e `cobertura.md` não foram editados por este lote; não se declara aprovação falsa do gate global nem se altera o baseline histórico para esconder a falta da associação.

## Integridade dos rascunhos e payloads

- Inventário: `drafts[item.id]` guarda quantidade **como string**, divergência, evidência e justificativa no `InventoryCountClient`, acima do painel, busca e recorte. Alterar página, material selecionado, fechar/reabrir consulta/editor não descarta entradas. Ao salvar, a mesma action recebe `{ sessionId, itemId, countedQuantity, divergenceType, countEvidence, adjustmentReason }`. Aprovação/encerramento e sua evidência continuam no pai.
- Requisição: os mapas globais de aprovação, lote, quantidade, liquidação e busca por item permanecem no pai. Aprovação usa `request.items`; entrega integral usa **todos** os `remainingItems`, não a página filtrada. Os mesmos comandos estão disponíveis no header do painel e na ficha.
- O workflow agora tem chave estável `request.id`, em vez de `updatedAt`: refresh de entrega parcial não remonta e apaga os rascunhos dos demais itens. Depois de sucesso parcial, a chave de idempotência daquele item é renovada para permitir outra entrega legítima; falhas preservam a chave para retry. A quantidade a entregar é limitada ao saldo atualizado do item/lote.
- Lotes continuam pesquisáveis com origem, lote, saldo e validade. O seletor nativo substitui a área de radios com scroll; a seleção é mantida mesmo se a busca deixar de incluir o lote escolhido. Vínculo financeiro, entrega parcial, permissões e confirmações permanecem.
- Manutenções: a mesma consulta/escopo passa de 10 para a constante central de 20, com contagem antes do clamp e ordenação preservada. Transferências e manutenções abertas usadas pelas operações não foram recortadas por essa paginação.
- Valorização: mantém os filtros de ente/UG e o recorte existente de até 250 posições. A consulta de eventos agora tem total e offset/limit 20 sobre as valorizações autorizadas dessas posições, opcionalmente uma posição selecionada; remove o cap de últimos 10. Ordena por sequência e desempata por ID. Os formulários de conciliação, suas versões GED, memória/hash e actions permanecem no pai.
- Substituições: preserva consulta/escopo/total de 20, adicionando painel com parâmetros das demais paginações. Designação, análise, pareceres, mensagens, avaliações e snapshots continuam no fluxo original.

## Largura e política de scroll

A revisão usa **notebook de 1.280 px / área útil de referência de 1.224 px**. Mínimos não exigem que um texto ou cabeçalho longo apareça integralmente: previews e detalhes condicionais da base preservam o acesso completo. Bens caiu de 955/895 para **795/750 px**; fiscalização de 965 para **755 px**; solicitações de 870 para **725 px**; Frotas usa mínimos por tipo de 80/95 px. Nenhuma coluna foi escondida, fundida ou descartada.

Todos os mínimos estáticos do lote ficam abaixo de 1.224 px; o maior permanece em 860 px (baixas). Os painéis contextuais e de edição variam de 310 a 765 px. Isso remove bloqueios artificiais por largura configurada, mas não é medição real de encaixe.

**Scroll autorizado somente para tablets/celulares; nunca notebook/desktop.** O lote não adiciona wrappers de scroll às tabelas/painéis. A base do principal determina a classe de dispositivo, detalhes de cabeçalho/célula, orçamento vertical e a aplicação dessa política. Rolagem de formulários/sheets antigos não é evidência de aprovação geométrica das consultas e deve ser conferida na integração; não se deve liberar scroll de tabela no desktop para contornar mínimos ou altura.

## Checks

- ESLint nos **5 arquivos de código/teste alterados desta retomada** (os dois editores, seletor de referências, teste e manifesto): **passou, zero erros e avisos**, após as alterações finais. Mantém-se o registro da verificação anterior dos 44 arquivos TS/TSX do lote.
- Verificação TypeScript sintática/semântica **restrita aos 3 componentes alterados**, com os tipos ambiente do Next e `noEmit`: **zero diagnósticos**. Não é typecheck/build global.
- `node --test src/app/app-domain/patrimonio/_components/operational-workflows.test.mjs`: **8 testes passaram**. Além dos quatro testes anteriores, verificam 21 campos/critérios/documentos e itens (20+1), edição na primeira/última página, payload integral com opções de escolha, validação de registro inválido fora da página, remoção preservando identidade/rascunhos e permissões de leitura dos controles portaled. Os testes anteriores cobrem contagem, aprovação/entrega integral e renovação de idempotência. O harness isola hooks/actions; não é teste de navegador ou do provider compartilhado.
- `git diff --check` restrito ao lote: **passou**, após as alterações.
- Busca final de tabelas nativas: **zero em Obras**; Patrimônio só mantém o catálogo de Materiais reservado ao principal e a primitive antiga `ResizableTable`, sem converter estes arquivos reservados. Não sobrou tabela HTML dos seis antigos bloqueios.
- Consumidores de `InventoryCountClient` e `MaterialRequestWorkflowClient` conferidos; assinaturas/actions públicas preservadas. O único consumidor do workflow mantém chave por requisição para proteger os rascunhos em refresh.
- Consumidores de `ConstructionRulesClient` e `MaterialRequestForm` conferidos; props e assinaturas preservados, assim como DTOs/actions. `--json` foi executado antes/depois, com os resultados de reconciliação explicitados acima.
- Integração depende das APIs compartilhadas acordadas (`OperationalListFrame`, `OperationalTablePanel`, `cells`, caption/mensagens e hook optional), implementadas pelo principal. Nenhuma base compartilhada, `ClientLayout`, `ModuleShell` ou repositório externo ao lote foi editado.
- Sem full build, execução de queries de verificação, seed, mutação de banco, commit ou push.

## Homologação visual a executar na integração

Validar notebook 1.280/1.224 útil, desktop, tablet/celular, zoom, registro 20, última coluna, rodapé, arraste/restauração, detalhes condicionais de cabeçalho/célula, estados vazio/erro e foco dos painéis/editores. Conferir fechar/reabrir painel com rascunho e, em histórico servidor, navegar sem desmontar o formulário do pai. Não há bloqueio de implementação remanescente no escopo delegado; **homologação visual ainda não declarada**.
