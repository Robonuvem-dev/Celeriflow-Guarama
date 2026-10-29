# Lote financeiro-controle — implementação integral do inventário

Data: 29/10/2026. Referências: `AGENTS.md`, `Padrão de Tabelas.md`, `TABELAS_CONTRATO_EXECUCAO.md`, plano, inventário e guia instalado `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.

Esta revisão aplica a instrução posterior: resolver as composições complexas com `OperationalTablePanel`, preservar formulários/rascunhos, permitir rolagem da tabela somente em tablets/celulares pela política central e manter notebook/desktop sem rolagem. Não há liberação local por breakpoint.

## Cobertura

| Origem | Operacionais com rota | Implementadas | Bloqueadas por composição | Legados adaptados |
|---|---:|---:|---:|---:|
| Financeiro | 25 | 25 | 0 | 3 |
| Controle Interno | 5 | 5 | 0 | 0 |
| Indicadores | 1 | 1 | 0 | 0 |
| **Total** | **31** | **31** | **0** | **3** |

**34 estruturas tabulares do inventário adaptadas em código**, incluindo as três legadas, mais **11/11 grades de edição do baseline deste lote: nove ativas e duas legadas**. As 31 operacionais atendem 22 URLs; a grade fiscal de Pessoal acrescenta `/financeiro/relatorios/pessoal-fiscal` aos consumidores de painéis contextuais. A mesma definição não é recontada por edição, índice ou mês. Legados continuam sem rota consumidora e com os redirecionamentos existentes.

Situação de todas: **implementada**, não **validada visualmente**. ESLint, inspeção estática e somas dos mínimos não provam geometria, comportamento de teclado/foco nem encaixe real no navegador.

## Implementação

- `financeiro/FinanceOperationalList.tsx`: adapter dos resultados já carregados para `OperationalListFrame`, `OperationalTable` e `OperationalPagination`. Busca/filtros antes do recorte, tamanho central `OPERATIONAL_PAGE_SIZE`, retorno à página 1 ao mudar contexto e ajuste quando o total diminui. Não recebe páginas parciais de Judicial/Ouvidoria.
- `financeiro/FinanceTablePanel.tsx`: composição contextual com `OperationalTablePanel`; acionador explícito **Consultar …**, superfície/header/provider próprios da base e tabela/paginação de área inteira. O formulário proprietário permanece montado.
- `financeiro/FinanceAuxiliaryForm.tsx`: usa Dialog/Portal da UI com `keepMounted` para preservar os estados dos formulários filhos. Dialogs da mesma família permitem os painéis de consulta aninhados, sem o bloqueio de top-layer de um diálogo HTML nativo.
- `financeiro/operational-columns.ts`: configura mínimos, iniciais, máximos, alinhamento, tipo e detalhes condicionais. Ações têm limites fixos; dados podem ser redimensionados. A base controla fonte 13 px/linha 24 px e detalhes de cabeçalho/célula.
- `financeiro/layout.tsx`: `useOptionalOperationalWorkspace` evita shell duplicado nas rotas registradas.
- Manifesto `src/components/app-ui/operational/modules/financeiro-controle.ts`: `operationalModules` para as 14 URLs operacionais; `operationalPanelRoutes` documenta as oito rotas cujos formulários/analíticos mantêm a composição original e ganham superfície local; `operationalLegacyTables` registra os três templates legados adaptados. Não registrar os formulários/analíticos inteiros como uma listagem fixa.

## Financeiro — 25 estruturas

Caminhos relativos a `src/app/app-domain/financeiro/`. Todas as linhas estão **implementadas**. “Cliente 20” é paginação sobre o conjunto retornado legitimamente pela consulta existente; não amplia limites de repositórios nem altera as consultas de negócio.

| ID | Arquivo / estrutura | Rota | Colunas preservadas | Origem/paginação e implementação |
|---|---|---|---|---|
| F01 | `automacoes/page.tsx` | `/financeiro/automacoes` | Execução, banco, agência, conta, integridade SHA-256, status, abrir | `readFinancePageAutomations`; cliente 20. Resumos compactos; links dos originais preservados. Execuções não tabulares continuam acessíveis em sobreposição (`AutomationRuns.tsx`). |
| F02 | `conciliacao-bancaria/ConciliacaoBancariaClient.tsx` — correspondências | `/financeiro/conciliacao-bancaria` | Regra, confiança, descrição, valor banco, valor contábil, diferença | `matchResults`; Panel/cliente 20. Importação, abertura, saldos e editor N:N permanecem montados. `handleApplySuggestions` continua usando **todos** os matches elegíveis. |
| F03 | `contabilidade/ContabilidadeClient.tsx` — balancete | `/financeiro/contabilidade` | Conta, débitos, créditos, saldo | `trialBalance`; cliente 20. Visão de balancete e visão de trabalho compartilham estado de postagem/regra/competência/justificativa. |
| F04 | `contabilidade/disponibilidade/page.tsx` | `/financeiro/contabilidade/disponibilidade` | Fonte, saldo disponível, empenhos a pagar, RAP a pagar, extras a pagar, déficit/superávit | `readResourceAvailability`; cliente 20. Seleção múltipla GET, metadados, erro/retry e CSV integral preservados. |
| F05 | `contabilidade/etapas-anuais/AnnualStagesClient.tsx` — inconsistências | `/financeiro/contabilidade/etapas-anuais` | Nível, tipo da origem, identificador da origem, inconsistência | Emissão imutável de `captureAnnualConsistency`; Panel/cliente 20 por emissão, sem truncar CSV ou alterar `reportId`. |
| F06 | Mesmo arquivo — posição financeira | Mesma rota | UG, fonte, ativo financeiro, passivo financeiro, superávit/déficit | `editions[].financialPosition.rows`; Panel/cliente 20 por edição. Posição não documentada continua exibindo a pendência original. |
| F07 | `contabilidade/etapas-anuais/ExtraNoteTransportClient.tsx` | Mesma rota | Nota no destino, ID da nota, obrigação canônica, UG, fonte, valor transportado | `stages[].notes`; Panel/cliente 20 por etapa. Total, motivo, transporte e desmovimentação preservados. |
| F08 | `contabilidade/saldos-fontes/page.tsx` | `/financeiro/contabilidade/saldos-fontes` | Conta, descrição, UG, classificação da fonte, vínculo, linhas a conciliar, saldo acumulado, débitos, créditos | `readAccountingMonthlySources`; **12 blocos mensais explicitamente acessíveis**, cada um com Panel/cliente 20 sobre todas as combinações. Substitui recorte antigo de 50. Todos os meses e as 36 medidas continuam acessíveis; nenhum valor é somado/recalculado na UI. |
| F09 | `contas-bancarias/BankResourceSourcesClient.tsx` | `/financeiro/contas-bancarias` | Fonte, saldo | `account.balances`; Panel/cliente 20. `selected` e `accountId` continuam no pai; fontes permitidas e payload não são fatiados. |
| F10 | `contas-bancarias/ContasBancariasClient.tsx` | Mesma rota | Banco, agência, conta, tipo, finalidade, fonte, UG, saldo, status, ações | Consulta/saldos existentes; cliente 20. Busca original, edição, ativação/inativação e confirmação preservadas. Formulários auxiliares persistentes no header. |
| F11 | `contas-bancarias/TreasuryTransferSection.tsx` | Mesma rota | Data, origem, destino, histórico, valor | `transfers`; Panel/cliente 20. `formData` e compatibilidade de contas/fontes continuam integrais. |
| F12 | `custos/CostsClient.tsx` — totalizadores | `/financeiro/custos` | Tipo, despesa ativa, apropriado no período, saldo atual a apropriar | `data.byType`; Panel/cliente 20. Filtros independentes e PDF/CSV permanecem no formulário original. Rateios, correções, relações e gráficos não desmontam ao consultar. |
| F13 | `download-extratos/DownloadExtratosClient.tsx` | `/financeiro/download-extratos` | Data/hora, banco, conta, período, arquivo original, hash, destino, status | Histórico recebido + inclusões; cliente 20. Alternar entre histórico e automação mantém parâmetros, resultado e evidências no mesmo pai. |
| F14 | `empenhos/EmpenhosClient.tsx` | `/financeiro/empenhos` | Número, data, fornecedor/credor, unidade, valor, recebimento, documento interno, obra/OS, status, anular | Busca original antes do recorte; cliente 20 central. Reserva, origens, formulário e anulação preservados. |
| F15 | `liquidacoes/LiquidacoesClient.tsx` | `/financeiro/liquidacoes` | Data, empenho, recebimento, fornecedor, NF/recibo com série, emissão NF, GED, responsável, valor, pago, documento interno, status, cancelar | Filtros originais; cliente 20. `page.tsx` mantém consultas/DTOs; `SettlementCostsPanel` em formulário persistente. Mínimos revistos sem eliminar campos. |
| F16 | `orcamento/OrcamentoClient.tsx` — despesas | `/financeiro/orcamento` | Descrição, dotação, fornecedor, valor, status, aprovar | `expenses`; Panel/cliente 20. Permissão e estado da aprovação preservados; seletores usam array integral. |
| F17 | Mesmo arquivo — dotações | Mesma rota | Código, natureza, unidade, fonte, atualizado, reservado, empenhado, saldo | `appropriations`; Panel/cliente 20, sem recalcular disponibilidade na UI. |
| F18 | Mesmo arquivo — créditos | Mesma rota | Número, tipo, justificativa, total, status, ações | `creditRequests`; Panel/cliente 20. Submeter/aprovar/efetivar mantêm os gates originais de status/permissão. |
| F19 | Mesmo arquivo — reservas | Mesma rota | Número, dotação, valor, status, cancelar | `reservations`; Panel/cliente 20. Cancelar mantém a condição de reserva ativa e permissão. |
| F20 | `pagamentos/PagamentosClient.tsx` — ordens | `/financeiro/pagamentos` | Ordem, data, fornecedor, empenho, recebimento, conta, forma, bruto, líquido, retido, exceção justificada, documento interno, status, ações | Filtros originais; cliente 20 central. Conta/forma também retornam à página 1. Estorno/cancelamento preservados. |
| F21 | Mesmo arquivo — retenções | Mesma rota | Ordem, tipo, descrição, valor, recolher | `pendingWithholdings`; cliente 20. Visão operacional preserva conta/comprovante e rascunhos da ordem no mesmo pai. |
| F22 | `receitas-constitucionais/ReceitasConstitucionaisClient.tsx` | `/financeiro/receitas-constitucionais` | Prioridade, texto encontrado, banco/conta, tipo, natureza, fonte, evento, dedução, confirmação | `rules`; cliente 20. Ordem recebida e ordenação por prioridade após inclusão mantidas; nova regra/exceções/seed/feedback continuam acessíveis. |
| F23 | `receitas/ReceitasClient.tsx` | `/financeiro/receitas` | Data, natureza, fonte, valor, situação, classificação, ações | Busca original antes do recorte; cliente 20. Conta compatível, arrecadação, redistribuição e restrição de estorno preservadas. |
| F24 | `relatorios/indices-constitucionais/FiscalIndicesClient.tsx` | `/financeiro/relatorios/indices-constitucionais` | Seção, componente, valor BRL, linhas contábeis | `indices[].rows`; Panel/cliente 20 por Saúde/Educação. Totais, hashes, avisos e arrays de termos da revisão permanecem integrais. |
| F25 | `rendimentos/RendimentosClient.tsx` | `/financeiro/rendimentos` | Data, conta aplicação, tipo, bruto, tributos, líquido, saldo acumulado, recibo | Histórico recebido + transmissões; cliente 20. Seleção/apuração/transmissão mantidas no mesmo pai ao alternar visão. |

## Controle Interno e Indicadores — seis estruturas

Caminhos relativos a `src/app/app-domain/`. Todas **implementadas**.

| ID | Arquivo / rota | Colunas | Origem/paginação e preservação |
|---|---|---|---|
| C08 | `controle-interno/consultas/judicial/page.tsx` · `/controle-interno/consultas/judicial` | Número, tribunal, abertura, situação judicial, processo, situação do processo, última posição, versão, GED, hash, abrir | Drizzle/transação original; central 20 por `limit/offset`. Predicados, permissões conjuntas, agregações e isolamento preservados. Página fora do total redireciona à última válida mantendo filtros. |
| C09 | `controle-interno/consultas/ouvidoria/page.tsx` · `/controle-interno/consultas/ouvidoria` | Protocolo, tipo, situação, setor, inclusão, resposta, conclusão, processo, situação do processo, acesso, anônimo, abrir | Drizzle/ordenação `createdAt/id` original; central 20. Dados pessoais carregados não foram ampliados; totais por tipo/status continuam completos. |
| C10 | `controle-interno/consultas/rh/page.tsx` — cargos · `/controle-interno/consultas/rh` | Cargo, ID, situação atual, situação legal, denominação histórica, vigência, referência, evento legal, pessoas, vínculos | `readControlWorkforceStatistics`; cliente 20 via `WorkforceTables.tsx`. |
| C11 | Mesmo arquivo/rota — vínculos e revisões | Servidor, ID, matrícula, cargo, enquadramento, centro, localização, versão, revisão | Mesmo conjunto integral; cliente 20. Seletor alterna as grades. Totais/multivínculo/incompletude/metadados/exportações PDF/CSV/XLSX preservados. |
| C12 | `controle-interno/ControlDiagnosticsClient.tsx` · `/controle-interno` | Família, origem, resultado, memória resumida | `runs[].rows`; Panel/cliente 20 por execução. Plano/exercício/corte/chave e formulários irmãos ficam montados. |
| I01 | `indicadores/MunicipalCostIndicators.tsx` · `/indicadores` | Tipo, apropriado no período BRL, pendente atual BRL | `data.byType`; Panel/cliente 20. Ledger, permissões, período, gráficos, cards e link de detalhamento permanecem. |

## Três estruturas legadas adaptadas

Busca de consumidores em `src` encontrou somente as declarações. As páginas continuam redirecionando, sem ativar componentes legados nem duplicar rotas de Planejamento.

| ID | Arquivo | Colunas | Implementação |
|---|---|---|---|
| L01 | `financeiro/orcamento/cadastros/CadastrosClient.tsx` | Código, nome, secretaria quando aplicável, origem da contratação quando aplicável, editar/excluir | Panel/cliente 20 por tipo; formulário, confirmações e actions integrais. Rota legada redireciona para `/planejamento/cadastros/versions`. |
| L02 | `financeiro/orcamento/planejamento/PlanejamentoClient.tsx` — fixações/alocações | PPA, LOA, fixação, fixado, alocado, disponível | Panel/cliente 20. Seletores e formulário da dotação usam `fixations` integral. |
| L03 | Mesmo arquivo — CMD/MBA | LOA, CMD por unidade, MBA | Panel/cliente 20. Conteúdo composto de CMD em uma linha com texto integral/detalhes condicionais; não perde unidades, contagem de meses nem situação de completude. Rota redireciona para `/planejamento`. |

## Conflitos anteriores resolvidos em código

| Conflito anterior | Resolução aplicada |
|---|---|
| D03 analítico / gráficos + tabela | Custos, Indicadores e Índices usam Panel para a grade; gráficos/totais e revisão mantêm contexto. |
| D04 grades simultâneas | Orçamento, edições anuais, diagnósticos, fontes/transferências abrem a grade contextual individual. Nenhuma disputa por 504 px de corpo no formulário. |
| Conciliação / editor N:N | Panel somente para a apresentação de correspondências; array `matchResults` usado pela action não é recortado. Editor permanece montado. |
| Saldos 12 meses × três medidas | Doze acionadores mensais explícitos; mesmas combinações e medidas da consulta, com colunas independentes e paginação de 20 por bloco. |
| Formulários auxiliares / seleção não salva | Portal `keepMounted` para manter filhos, mais estados de domínio no pai. A paginação nunca modifica arrays do payload. |
| Legados sem consumidor | Implementações adaptadas para reuso, preservando histórico/redirects e sem excluir código. |

### Grades adicionais de edição — 11/11 implementadas

Todas usam `OperationalTablePanel → FinanceOperationalList → OperationalListFrame/OperationalTable/OperationalPagination`, com tamanho central 20 e controles em `OperationalRow.cells`. Só os controles da página são montados; **o array integral fica no pai**, com atualizações por índice global anteriores ao recorte. Fechar/trocar de página não apaga o estado. A busca foi desativada nas grades de edição para não remover a própria linha durante a digitação.

| Baseline / função dona | Destino da grade | Campos e payload preservados | Situação |
|---|---|---|---|
| `controle-interno/ChecklistGroupsEditor.tsx:8:1110` / `ChecklistGroupsEditor` | Mesmo arquivo, `FinanceTablePanel` por grupo | Número, pergunta (textarea de uma linha, preservando quebras existentes), diagnóstico e remover. Metadados/respostas do grupo continuam no formulário. `groups` fica em `ControlChecklistsClient`; validação de todos os itens antes da publicação. | implementada |
| `financeiro/conciliacao-bancaria/ReconciliationAllocationForm.tsx:36:33` / `ReconciliationAllocationForm` | Mesmo arquivo, `FinanceTablePanel` | Extrato/saldo, movimento/saldo, valor e remover. `rows`, chave e justificativa continuam no pai; `submitDraft` valida todas as alocações antes de enviar `allocations: rows`. | implementada |
| `financeiro/custos/CostsClient.tsx:21:63` / `DistributionEditor` | `CostDistributionDraft.tsx` | Objeto, item vinculado, valor/percentual, adicionar/remover. `shares`/`amounts` ficam em `CostsClient`; payload integral, valores decimais em string sem conversão. | implementada |
| `financeiro/custos/PayrollCostRulesClient.tsx:32:145` / `PayrollCostRulesClient` | `CostDistributionDraft.tsx` | Objeto ativo/UG, item vinculado ativo, percentual, adicionar/remover. Seletores individuais e todas as distribuições mantidos no pai. | implementada |
| `financeiro/custos/SettlementCostsPanel.tsx:17:343` / `SettlementCostsPanel` | `CostDistributionDraft.tsx` | Objeto/ano/UG, item/ano/vínculo, valor, adicionar. `rows` completos; edição limpa a chave como antes. Não acrescenta remoção onde não existia. | implementada |
| `financeiro/custos/StockCostRulesClient.tsx:25:126` / `StockCostRulesClient` | `CostDistributionDraft.tsx` | Objeto/UG, item ativo vinculado, percentual, adicionar/remover. Critérios de classe/produto/centro/destino e `shares` completos preservados. | implementada |
| `financeiro/orcamento/CreditRequestDialog.tsx:169:15` / `CreditRequestDialog` | Mesmo arquivo, `FinanceTablePanel` aninhado | Dotação, acréscimo/anulação, MoneyInput e remover; `items` completos permanecem no diálogo pai. Linhas inválidas de qualquer página bloqueiam o envio em vez de serem descartadas silenciosamente pelo filtro antigo. | implementada |
| `financeiro/relatorios/indices-constitucionais/FiscalIndicesClient.tsx:12:136` / `TermsEditor` | `FiscalTermsDraft.tsx` | Componente, incluir/deduzir, contas múltiplas, UGs múltiplas, sinal líquido, origens múltiplas, funções múltiplas, adicionar/remover. Numerador/denominador e propriedades opcionais conservados; validação antes da action. | implementada |
| `financeiro/relatorios/pessoal-fiscal/PersonnelFiscalClient.tsx:17:108` / `CompositionEditor` | `FiscalTermsDraft.tsx` | Mesmos campos fiscais aplicáveis, sem inventar função da dotação para Pessoal. `definition.personnel/adjustedRcl` permanecem integrais. | implementada |
| `financeiro/orcamento/planejamento/PlanejamentoClient.tsx:311:136` / `lawForm.revenueForecasts` | `AnnualBudgetDraft.tsx` | Código, nome, MoneyInput, remover e adicionar externo; `estimatedValue`, total previsto e payload LOA completos. | legado implementado |
| `financeiro/orcamento/planejamento/PlanejamentoClient.tsx:312:135` / `lawForm.expenseFixations` | `AnnualBudgetDraft.tsx` | Código, nome, MoneyInput, remover e adicionar externo; `fixedValue`, total fixado e comparação receita/despesa completos. | legado implementado |

Os seletores múltiplos fiscais usam `Select multiple` compacto e controlado, mantendo todas as opções e todas as seleções no pai. Os campos não visíveis não dependem da validação HTML do DOM: `draft-rows.ts` e `checklist-drafts.ts` validam a coleção integral antes da action. Contratos e schemas das actions/serviços não foram alterados.

`CostGraph` e os gráficos de Indicadores continuam gráficos: o JSX calcula largura da barra a partir de `Math.abs(Number(value)) / max`, sem linhas de inputs, seleção ou payload tabular. As 11 grades baseline acima foram convertidas; nenhuma delas foi reclassificada como gráfico/card para evitar migração.

**Reconciliação do auditor:** a nova execução `node scripts/verify-operational-coverage.mjs --json` apresenta `remaining: []` para cada uma das 11 grades, zero `newEditingGrids` e zero `brokenRendererChains`. O script ainda as classifica como `unresolved`, com `targets: []`, porque a tabela de destinos revisados do auditor ainda precisa associar estes novos callables. A evidência por baseline/destino também está em `operationalEditingGrades` no manifesto. O lote não altera o scanner nem declara o gate global aprovado; essa reconciliação pertence ao principal.

## Largura, altura e dispositivos

- Mínimos revistos individualmente, sem alterar fonte/linha: **Liquidações 1038 px**, **Pagamentos 1115 px**, ambos inferiores à referência de **1224 px úteis** em notebook 1280×720 na escala padrão.
- Demais configurações do lote também têm soma de mínimos abaixo de 1224 px. Headers/valores extensos usam previews e detalhes condicionais da base; o mínimo não precisa acomodar o valor integral.
- As 13 colunas de Liquidações e 14 de Pagamentos permanecem explícitas. Ações mantêm sua largura; não há ocultação responsiva ou redução automática de fonte.
- O Panel fornece área de tela inteira e header próprio. Altura e política de rolagem para **tablet/celular**, sem rolagem em **desktop/notebook**, são da base central. Nenhuma tabela deste lote adiciona `overflow-auto` como substituto do contrato.
- Medições de viewport/zoom continuam sendo homologação, não um bloqueio de composição nem motivo para reduzir a cobertura implementada.
- As novas grades editáveis têm mínimos entre 440 e 840 px, abaixo dos 1224 px úteis. Não introduzem scroll local da grade nem escondem colunas. Fonte/linha e política tablet/celular são as da base.

## Checks e integração

- ESLint direcionado aos **51 arquivos TS/TSX alterados/criados** do lote, incluindo grades, helpers, testes e manifesto: **aprovado com `--max-warnings 0`, zero erros e zero avisos**. Avisos preexistentes de variáveis omitidas em `TermsEditor` corrigidos preservando a remoção das propriedades opcionais.
- `git diff --check` direcionado às três pastas, manifesto e relatório: **aprovado**, somente avisos da política CRLF do repositório.
- Busca dos renderizadores antigos `<table>`, `<Table>` e `<ErpTableContainer>` nas três pastas: **zero ocorrências** após migração (verificação estática).
- Consultas, joins, predicados, DTOs e contratos de actions preservados. Única alteração de paginação de consulta: Judicial/Ouvidoria usam a constante 20 em `limit/offset`, mantendo agregações/ordenação/isolamento. Saldos já carregava a consulta integral; seu recorte local de 50 foi substituído pelas páginas de 20 da UI.
- Manifesto distingue rotas inteiras e painéis contextuais; o executor principal integra a API/base e o registro. Este lote não altera base, `ClientLayout` ou `ModuleShell`.
- Não executados por instrução: full build, banco, seeds/mutações, commit/push. Sem homologação visual; integração/typecheck/build ficam com o executor principal.

### Verificação de rascunhos/payloads

Comando: `node --import tsx --test src/app/app-domain/financeiro/draft-rows.test.ts` — **6 testes aprovados**:

1. 45 alocações: erro na linha 45 impede a chamada; após correção, envia todas as linhas, chave original e valor decimal extenso intacto.
2. 43 distribuições: edição na terceira página e remoção em outra página produzem 42 entradas completas, sem arredondar strings decimais.
3. Crédito/LOA: erro após a linha 20 é identificado; total e todos os itens permanecem completos.
4. Composição fiscal: validação da última página preserva multisseleções e ausência semântica das propriedades opcionais.
5. Checklist com 50 itens: erro no segundo grupo/linha 25 é detectado sem perder regras automáticas ou grupos.
6. Resposta de erro da action mantém sua identidade e o rascunho intacto.

Aceitação visual a executar na integração: 21 registros (20+1), vazio/erro/retry, última página após redução de total, filtros completos, exportações integrais, rascunhos após abrir/fechar Panel, teclado/foco, detalhes de headers/células, zoom e geometria 1280×720/1224 úteis, além dos demais viewports definidos pelo projeto.
