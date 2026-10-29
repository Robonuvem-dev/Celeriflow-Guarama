# Lote de tabelas — Compras e Contratos

Data: 29/10/2026. Referências: `AGENTS.md`, contrato de execução, padrão, plano, inventário e guia Next `01-app/01-getting-started/05-server-and-client-components.md`.

## Resultado atualizado após a segunda instrução

- **15/15 estruturas operacionais inventariadas implementadas**: dez listagens de rota e cinco estruturas contextualizadas em painéis operacionais full-screen.
- **4/4 grades de edição/seleção implementadas**, com paginação de 20 e rascunho completo mantido no componente pai.
- **3/3 tabelas especiais preservadas** para impressão integral. Nenhum legado neste lote.
- Os bloqueios de implementação C01–C04/D04 da primeira rodada foram resolvidos com o `OperationalTablePanel` autorizado. Não restou tabela operacional antiga em composição pequena.
- Nova política autorizada: rolagem em **tablet e celular**, sem liberá-la em notebook/desktop. Classificação e geometria são responsabilidade da base compartilhada; o lote não implementa exceção por breakpoint genérico.
- **Implementação não é homologação visual.** A API central está sendo integrada pelo executor principal. Nenhuma declaração abaixo significa que a aplicação já passou por build ou medição de viewport.

## Arquitetura e preservação

- `_components/ComprasOperationalList.tsx`: `OperationalListFrame` + `OperationalFilters` + `OperationalTable` + `OperationalPagination`. Busca/filtros antes do recorte, página 1 ao aplicar consulta, clamp após redução do resultado, ações no header e uma faixa compacta. Leitura mantém busca instantânea; as quatro grades usam `editable`, com aplicação explícita e snapshot dos IDs encontrados.
- `_components/ComprasRouteFilters.tsx`: filtros GET de licitações/portal, com estado e campos hidden no formulário principal. Submit da sobreposição referencia esse mesmo formulário; preserva busca ainda não enviada, filtros e semântica de aplicação/limpeza, sem depender de inputs desmontados.
- `_components/ComprasPanelTable.tsx`: adaptação de domínio para `OperationalTablePanel`, com provider/header próprios fornecidos pela base. Lista paginada em tela cheia e acionador explícito com total. O estado de negócio não é movido para o painel, que pode desmontar ao fechar. Acionadores dentro de células têm altura de 24px. A propagação de eventos `submit` da lista é interrompida antes do formulário externo, inclusive em portais React; o salto de página não envia a compra/proposta.
- `_components/columns.ts`: configurações explícitas por coluna. Dados redimensionáveis, acesso integral em `values`, detalhes condicionais a overflow, alinhamento numérico e ordem de origem preservada (`sortable: false`). Ações com largura limitada para controles compactos.
- `_components/pagination.ts`: função real `comprasPage`, tamanho central de 20, clamp de páginas inválidas/vazias e origem imutável. Reutilizada por todas as listas client, inclusive as que anteriormente usavam oito.
- Os seis `*RowActions` mantêm handlers, confirmações, estados pendentes e permissões; apenas controles/tokens e nomes acessíveis foram compactados.
- `compras/layout.tsx`: usa o hook opcional quando exportado e devolve `children` se estiver no workspace operacional. Há fallback enquanto a API central não exporta o hook, sem alterar os fluxos de formulário/documento.
- Manifesto `src/components/app-ui/operational/modules/compras.ts`: dez rotas de listagem em `operationalModules`; exportação adicional `operationalPanelRoutes` documenta as dez rotas-template com tabelas contextuais. Essas fichas/formulários não são promovidas a workspace de listagem de página inteira. Menus/destinos originais preservados; `/compras` continua exato.
- Nenhuma assinatura pública anterior, action, query/repositório Drizzle, schema, download ou cálculo financeiro foi alterado. Payloads continuam percorrendo arrays/mapas completos, não as linhas visíveis.

## Cobertura individual — 15 operacionais

Caminhos relativos a `src/app/app-domain/compras/`. Mínimos são somas das configurações em pixels CSS, a 100%, não medições de navegador. O corpo nominal da base ocupa 21 × 24 = 504px; frame e header são adicionais.

| # | Estrutura e rota | Campos e comportamento preservados | Paginação / situação |
|---|---|---|---|
| 1 | `catalogo/CatalogoClient.tsx` — `/compras/catalogo` | Código, nome, tipo separado, descrição antes oculta, categoria, unidade, estimativa, status, ações. Busca/tipo/status; `kind`/`new=1` continuam inicializando o formulário. Editar, salvar, ativar/inativar mantidos. Mínimo **919px**. | Cliente 20, depois dos filtros. **Implementada**, ESLint aprovado. |
| 2 | `contratos/ContratosListClient.tsx` — `/compras/contratos` | Contrato, fornecedor, objeto, início/fim/dias, secretaria, UG, valor atual, aditivos, situação, ações. Vigência/unidade desdobradas sem perder tooltip. Fonte `listProcurementContracts`/DTO original. Mínimo **1208px**. | Cliente 20; busca/situação, links e ações mantidos. **Implementada**, ESLint aprovado. |
| 3 | `convenios/ConveniosListClient.tsx` — `/compras/convenios` | Convênio, concedente, objeto, início/fim/dias, total, partes/medições/parcelas separados, situação, ações. Fonte original. Mínimo **1129px**. | Cliente 20, busca/situação. **Implementada**, ESLint aprovado. |
| 4 | `exportacoes/ProcurementExportsClient.tsx` — `/compras/exportacoes` | Pacote, requisitos, origem, referência da origem, destino, situação, data da evidência, referência externa, mensagem, impedimentos completos, ações. Preparar/configurar/baixar/retorno/lembretes preservados; retorno em diálogo. Mínimo revisto **1346 → 1026px**, com prévia e detalhe integral em todas as colunas. | Cliente 20 depois de busca/destino/situação. Downloads continuam pelo `runId`, sem restringir o pacote à página. **Implementada**, ESLint aprovado. |
| 5 | `licitacoes/page.tsx` — `/compras/licitacoes` | Certame, processo, modalidade, objeto, sessão/prazo, situação, ações; nenhuma coluna escondida. Mesma consulta, ordenação por data descendente com desempate tipo+ID. Mínimo **840px**. | Servidor 20 após mescla/filtros; paginação mantém `q/type/status`. **Implementada**, ESLint aprovado. |
| 6 | `licitacoes/portal/page.tsx` — `/compras/licitacoes/portal` | Licitação, processo, fornecedor, credenciamento, objeto, lotes, prazo, situação, acesso. Consulta por `context.user.id`, fallback de acesso e troca de conta mantidos. Mínimo **987px**. | Servidor 20 após filtro, conserva `q/status`. **Implementada**, ESLint aprovado. |
| 7 | `pesquisas-precos/PriceResearchListClient.tsx` — `/compras/pesquisas-precos` | Processo, solicitação, objeto, encerramento, cotações, referência, situação, abrir. Mantém aberto/encerrado e “Sem proposta”. Mínimo **849px**. | Cliente 20 após busca/situação. **Implementada**, ESLint aprovado. |
| 8 | `planejamento/PlanningListClient.tsx` — `/compras/planejamento` | Item/serviço, especificação, quantidade/unidade separados, início/fim esperados, estimativa, origem/objeto de origem separados, situação, ações. `canCreate`/`canUpdate` e links de origem mantidos. Mínimo **1137px**. | Cliente 20 após busca/situação. **Implementada**, ESLint aprovado. |
| 9 | `processos/ProcessosListClient.tsx` — `/compras/processos` | Número, objeto, tipo, modalidade, secretaria, itens, origens, estimativa, situação, ações. DTO e contadores ETP/TR preservados. Mínimo **974px**. | Cliente 20 após busca/situação/tipo. **Implementada**, ESLint aprovado. |
| 10 | `solicitacoes/SolicitacoesListClient.tsx` — `/compras/solicitacoes` | Número, objeto, itens, secretaria, departamento, solicitante, estimativa, situação, prioridade, ações. `canManagePurchaseRequest` ainda controla editar/excluir. Mínimo **984px**. | Cliente 20 após busca/situação/prioridade. **Implementada**, ESLint aprovado. |
| 11 | `pesquisas-precos/CompactItemsTable.tsx` — pesquisa `[id]`, portal `[key]`, relatório do portal `[key]/relatorio` | Substitui a tabela antiga por acionador explícito de painel full-screen. Item, unidade, quantidade. O componente mantém sua assinatura; `className` de altura antiga não limita mais a consulta. `printAll` continua iterando `items` completos. Mínimo **320px**. | **8 → 20**, busca/rodapé/clamp comuns. **Implementada**, ESLint aprovado. Os três consumidores foram lidos. |
| 12 | `pesquisas-precos/[id]/PriceResearchDetailClient.tsx` — `/compras/pesquisas-precos/[id]` | Quadro de convites em full-screen: fornecedor, data do convite, situação, valor global, apresentação, comparativo, gerar acesso. Todos os empatados continuam destacados usando `research.comparison.quoteIdsAtMinimum`, nunca mínimo só da página. Prazo, convite, encerrar e excluir sem histórico preservados. Recuperação de acesso apresenta feedback/link/chave em diálogo acessível acima da tabela. Mínimo **768px**. | **8 → 20**, busca/situação antes do recorte. **Implementada**, ESLint aprovado. |
| 13 | `solicitacoes/[id]/page.tsx` — `/compras/solicitacoes/[id]` | Itens full-screen: item/serviço, quantidade, unitário, subtotal, alocações, processos. Campos compostos abrem outros painéis de 20: dotação/natureza/fonte/UG/exercício/quantidade/valor; processo/quantidade/situação/link. Nenhum link de origem foi convertido apenas em texto. Total completo, aprovação e permissões mantidos na ficha. Mínimo principal **690px**. | Cliente 20 em cada consulta; query `loadPurchaseRequestDetail` mantida. **Implementada**, ESLint aprovado. |
| 14 | `processos/[id]/page.tsx` — `/compras/processos/[id]` | Itens full-screen: nome, quantidade, unitário, subtotal, origem/alocação composta. Painel de origem contém solicitação, quantidade de origem, dotação, natureza, fonte, UG, exercício, quantidade alocada, valor e link. Ausências de alocação continuam explícitas. Total e informações da ficha preservados. Mínimo principal **600px**; origem/alocações **885px**. | Cliente 20 por consulta; query `loadPurchaseProcessDetail` mantida. **Implementada**, ESLint aprovado. |
| 15 | `contratos/[id]/page.tsx` — `/compras/contratos/[id]` | Grade inventariada substituída por resumo financeiro em tabela full-screen, com os sete indicadores e cálculos integrais: contratado, empenhado, liquidado, pago, dois saldos, recebido/atestado. Empenhos em painel próprio (número/data/situação/valor). Itens contratados também em tabela própria (item/quantidade/unidade/valor). Painéis transacionais da ficha preservados. | Cliente 20 em cada consulta; cálculos completos antes de passar às tabelas. **Implementada**, ESLint aprovado. |

## Quatro grades de edição/seleção

| Grade / arquivos | Campos disponíveis na tabela full-screen | Integridade e situação |
|---|---|---|
| Membros — `licitacoes/BiddingWorkflowPanel.tsx` + `BiddingDraftTables.tsx` | Servidor, função, remover; adicionar membro no header. | `members` completo no pai, controles por índice absoluto, não por posição da página. Mudança de página/busca/fechamento não descarta rascunho. Submit valida todos os servidores/funções e envia o array inteiro. `canUpdate` e pendência mantidos. **Implementada**. |
| Itens do lote — mesmos arquivos | Seleção, item, quantidade disponível, unidade, valor unitário, quantidade no lote. | Mapa completo `selectedLotItems` por ID no pai. Busca/paginação não desmarcam outros itens. Submit percorre o mapa inteiro e valida quantidade finita, positiva, dentro da disponível, inclusive fora da página. Regras de fase/permissão mantidas. **Implementada**. |
| Recebimento — `recebimentos/ReceiptForm.tsx` | Código, material/equipamento, unidade, saldo a receber, almoxarifado, quantidade, custo, lote, validade, marca, modelo, série. | `items` e `processItems` completos no pai. Mapeamento antes do recorte preserva índice absoluto e ID. Validação de todas as páginas para quantidades, custos, almoxarifados e equipamentos/série. Payload continua contendo todos os itens positivos e a mesma chave de idempotência. **Implementada**. |
| Alocações — `solicitacoes/SolicitacaoForm.tsx` + `AllocationDraftTable.tsx` | Dotação editável, UG, código/nome da natureza, código/nome da fonte, exercício, quantidade, valor, remover. | `items[].allocations` completo no pai. Adicionar/remover, somas de quantidade/valor e origem travada mantidos. Submit valida dotações e valores de todas as páginas. Não altera a estrutura do payload. **Implementada**. |

Mínimos das grades: membros **348px**, itens do lote **605px**, recebimento **1020px**, alocações **913px**. São prévias operáveis com valores integrais para a base, não fonte reduzida para encaixar. Os rascunhos não pertencem ao ciclo de montagem/desmontagem do diálogo.

## Três especiais e impressão

`contratos/InstrumentLifecycleReport.tsx` foi lido e não foi alterado:

| Estrutura especial | Rotas | Campos e preservação |
|---|---|---|
| Responsabilidades e partes | `/compras/contratos/[id]/relatorio`, `/compras/convenios/[id]/relatorio` | Papel, parte/tipo, grupo, vigência, situação; documento integral. |
| Parcelas programadas | Mesmas rotas | Parcela, vencimento, valor, situação, pagamento real; documento integral. |
| Execução financeira existente | Mesmas rotas | Registro, data, situação, valor e resumo; documento integral. |

Não se impõe limite de viewport/20 ao documento impresso. A cópia exclusiva de impressão de `CompactItemsTable`, já excluída da contagem do inventário, também continua integral, sem depender de busca/página corrente.

## Resolução dos casos da primeira rodada

- **C01, dois quadros e formulários:** itens e convites abrem superfícies full-screen independentes. Não há mais corpo de 20 registros confinado aos antigos painéis de 19/24rem.
- **C02, consulta dentro de proposta:** o portal mantém o valor global e os callbacks no pai. O painel usa portal próprio, sem formularização HTML aninhada; o wrapper interrompe a propagação de submit da paginação. O relatório imprime a coleção completa fora do painel.
- **C03, detalhes com relações compostas:** itens e relações têm vistas próprias; a associação entre solicitações/processos/dotações e as quantidades/valores é preservada, assim como os links. Os dados são achatados apenas para leitura, sem alteração das relações ou consultas.
- **C04, indicadores do contrato:** indicadores viram registros identificados de um resumo financeiro; empenhos continuam atos separados. Nenhum indicador é omitido ou calculado a partir do recorte.
- **D04, grades com rascunho:** estado/payload completos no pai, células controladas, índices absolutos e validação integral de páginas não visíveis. A tabela só recorta a projeção de leitura/edição.
- **D05, mínimos:** todas as configurações deste lote têm soma de mínimos ≤ **1224px**. Exportações foi revisada para 1026px, conservando as onze colunas. Textos e cabeçalhos longos devem usar o detalhe condicional da base. Nenhuma coluna foi escondida, nenhuma fonte foi reduzida. Tablets/celulares seguem a exceção de rolagem autorizada; notebook/desktop não recebem exceção local.

## Verificações executadas

1. **ESLint dos 33 arquivos TS/TSX próprios: passou, sem diagnóstico ESLint.** Seleção limitada a paths modificados/novos em Compras e ao manifesto. Avisos do Git sobre LF/CRLF não são falhas de lint.
2. **Paginação real, sem banco:** `node --import tsx -e`, `node:assert/strict` e importação de `comprasPage`. Verificados 20/1, 20/20/1, IDs de todas as páginas, filtros antes do recorte, redução 21→20, vazio, NaN, página negativa e origem integral de 41 registros. **Passou**.
3. **`git diff --check` restrito ao lote: passou**.
4. **Revisão estrutural:** busca no escopo por `<table`/`<ErpTable`/`pageSize = 8` encontrou apenas as três tabelas especiais do relatório e a cópia de impressão integral. As quatro antigas grades não renderizam mais suas repetições de edição; agora alimentam `rows`/`cells` operacionais.
5. Revisados consumidores de `CompactItemsTable`, DTOs das dez listas, queries, actions e payloads. Assinaturas anteriores preservadas. Helpers/painéis novos não substituem o ORM nem executam mutações.

Não foram executados DB, build completo, commit ou push. A base compartilhada continua sob responsabilidade do principal: `OperationalListFrame`, extensão `cells`/caption/mensagens, `OperationalSurface`, detalhes condicionais de cabeçalho e política de device. `OperationalTablePanel` já foi inspecionado; seu contrato admite desmontagem ao fechar e fornece superfície própria, como considerado pelo lote.

## Integração e homologação visual

O lote não tem caso estrutural deixado bloqueado. A integração central e a homologação no navegador continuam sendo verificações distintas: testar as dez listagens, as dez rotas-template com painéis e variantes de edição; abrir/fechar e alternar páginas com 21+ rascunhos; confirmar seleção e payload integrais; testar foco/teclado em painéis e painéis relacionados; verificar mínimos e a linha 20 em notebook 1280 útil 1224, demais dimensões/zoom, tablet e celular; conferir erros/permissões, downloads e impressão integral. ESLint e aritmética de mínimos não provam geometria nem preservação interativa no navegador.

## Correção da regressão P2 — busca durante edição

A auditoria reproduziu: buscar “Membro” e alterar a função para “Presidente” conservava o rascunho no pai, mas recalculava a busca a cada caractere, removendo a linha (1→0) e desmontando o input focado.

- `ComprasPanelTable` e `ComprasOperationalList` recebem a opção **aditiva** `editable?: boolean`, padrão `false`. Todos os consumidores foram localizados e lidos antes da alteração das assinaturas. Consultas de leitura conservam o comportamento anterior.
- Membros da designação, seleção/quantidade do lote, recebimentos e alocações habilitam `editable`. A faixa compacta oferece **Aplicar busca**, por botão ou Enter. Digitar a consulta ainda não modifica os resultados nem impede navegar no resultado já aplicado.
- O submit normaliza a consulta e filtra **toda a coleção atual**, antes de recortar em 20, armazenando somente os **IDs** encontrados. Edições posteriores não recalculam essa associação. Os objetos de linha, valores e handlers continuam vindo do rascunho atual; não são congelados, para evitar valores/closures obsoletos.
- Reaplicar recalcula os IDs usando os valores atuais e volta à página 1; pode excluir a linha editada. **Limpar** remove o snapshot e volta ao conjunto completo. Nenhum payload, action ou seleção completa foi alterado.
- O formulário de busca intercepta `submit`, sem enviar o formulário de negócio que contém o painel.

### Verificação específica executada

Teste reproduzível: `node --test src/app/app-domain/compras/_tests/editable-search.browser.test.mjs`.

**Aprovado em Chromium headless, viewport 1280×720**, usando `BiddingMembersTable` → `ComprasPanelTable` → `ComprasOperationalList` e a base real, sem iniciar Next, importar actions/autenticação/DB ou gravar no banco. O fixture apenas controla o rascunho e captura o payload que seria enviado:

1. Uma linha, busca “Membro” aplicada: apagar a função e digitar “Presidente”, caractere por caractere, mantém **1→1**, o **mesmo nó DOM** e o foco no input.
2. Reaplicar “Membro” produz **1→0**; limpar recupera “Presidente”; o payload capturado é `{ members: [{ employeeId: "0", role: "Presidente" }] }`.
3. Com 21 membros, o resultado é 20/1; editar o membro 21, voltar e avançar preserva “Presidente”. Reaplicar encontra os outros 20 antes de recortar e retorna à página 1. O payload permanece com **21 membros**, incluindo o último como “Presidente”.
4. Digitar uma consulta sem aplicar não filtra a grade; aplicar não envia o formulário externo; nenhum erro de runtime foi observado.

ESLint dos cinco arquivos de implementação alterados e do novo teste aprovado; `git diff --check` restrito à correção aprovado. Esse teste homologa a regressão de edição/busca com dados controlados, não a geometria de todas as rotas/dispositivos.
