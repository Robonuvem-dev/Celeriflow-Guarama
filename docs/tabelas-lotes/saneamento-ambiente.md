# Lote saneamento-ambiente

Data: 29/10/2026. Referências: `AGENTS.md`, `TABELAS_CONTRATO_EXECUCAO.md`, `Padrão de Tabelas.md` v1.1, plano e inventário de tabelas. Guias locais Next consultados: `01-app/01-getting-started/05-server-and-client-components.md` e `01-app/03-api-reference/03-file-conventions/layout.md`.

## Cobertura

**16 estruturas com rota: piloto de unidades preservado + seis novas migrações de Saneamento + nove de Meio Ambiente.** As 15 migrações estão implementadas em código e passaram pelo ESLint próprio. A integração da API comum e a homologação visual permanecem pendentes. A aprovação anterior do piloto não é uma homologação visual nova deste lote.

Na tabela abaixo, os arquivos de Saneamento são relativos a `src/app/app-domain/saneamento/`; os de Ambiente, a `src/app/app-domain/meio-ambiente/`. Mínimos são a soma declarada das colunas em pixels CSS na escala de referência, **não medições de navegador**. Cada configuração contém larguras iniciais, mínimos, máximos pertinentes, tipos, alinhamento e política de detalhes.

| Estrutura/arquivo | Rota | Colunas | Origem e recorte | Mínimo horizontal | Situação |
|---|---|---|---|---:|---|
| Saneamento `components/UnidadesClient.tsx`, `unidades/columns.ts` | `/saneamento/unidades` | Identificador, rua/número, bairro, CEP, titular, categoria, status, ações | Drizzle `listConsumerUnits`; filtros, total, ordem e paginação 20 no servidor | 702 | Piloto aprovado previamente, preservado sem alterações |
| Saneamento `components/FaturasClient.tsx` | `/saneamento/faturas` | Número, identificador, competência, valor, vencimento, status | Drizzle `listInvoices`; filtros/total/ordem antes de offset/limit 20 | 612 | Implementada |
| Saneamento `components/LeiturasClient.tsx` | `/saneamento/leituras` | Identificador, competência, anterior, atual, consumo, leiturista, status, ações | Drizzle `listMeterReadings`; período obrigatório e status/busca antes de offset/limit 20 | 804 | Implementada |
| Saneamento `components/ServicosClient.tsx` | `/saneamento/servicos` | Nº OS, tipo, identificador, técnico, prioridade, status, ações | Drizzle `listServiceOrders`; filtros/total/ordem antes de offset/limit 20 | 642 | Implementada |
| Saneamento `components/PortalClient.tsx` | `/saneamento/portal` | Solicitação, solicitante, data, origem, status, situação, ações | Drizzle `listPortalRequests`; busca/status/ativo no conjunto recebido, depois slice 20 | 641 | Implementada |
| Saneamento `components/QualityClient.tsx` | `/saneamento/qualidade` | Ponto, coleta, parâmetro, resultado, limite, conformidade, situação, ações | Drizzle `listWaterQualityAnalyses`; busca/conformidade/ativo antes do slice 20 | 738 | Implementada |
| Saneamento `components/ReportsClient.tsx` | `/saneamento/relatorios` | Relatório, tipo, período, formato, status, ações | Drizzle `listSavedReports`; busca/tipo/ativo antes do slice 20; entrada inicialmente em Ativos preservada | 542 | Implementada |
| Ambiente `areas-verdes/page.tsx` | `/meio-ambiente/areas-verdes` | Nome, tipo, tamanho, localização, conservação, ações | Drizzle `listGreenAreas`; status no repositório, busca integral e slice 20 no servidor da página | 614 | Implementada |
| Ambiente `denuncias/page.tsx` | `/meio-ambiente/denuncias` | Tipo, descrição integral, endereço, anônima, status, data, ações | Drizzle `listComplaints`; filtros no repositório, busca antes do slice 20 | 665 | Implementada |
| Ambiente `documentos/page.tsx` | `/meio-ambiente/documentos` | Título, tipo, empreendimento, cadastro, download, ações | Drizzle `listDocuments` e `listEnterpriseOptions`; filtros/busca antes do slice 20 | 674 | Implementada; download preservado via `cells` da API contratada |
| Ambiente `educacao/page.tsx` | `/meio-ambiente/educacao` | Título, público-alvo, início, fim, participantes, status, ações | Drizzle `listEducationPrograms`; filtros/busca antes do slice 20 | 710 | Implementada; início e fim separados |
| Ambiente `empreendimentos/page.tsx` | `/meio-ambiente/empreendimentos` | Nome/razão social, CNPJ/CPF, atividade, risco, status, ações | Drizzle `listEnterprises`; atividade/risco/status preservados, busca antes do slice 20 | 634 | Implementada |
| Ambiente `fiscalizacao/page.tsx` | `/meio-ambiente/fiscalizacao` | Data agendada, fiscal, empreendimento, status, observações integrais, ações | Drizzle `listInspections` e opções de empreendimentos; filtros/busca antes do slice 20 | 694 | Implementada |
| Ambiente `licenciamento/page.tsx` | `/meio-ambiente/licenciamento` | Nº licença, tipo, empreendimento, validade, status, ações | Drizzle `listLicenses` e opções de empreendimentos; filtros/busca antes do slice 20 | 634 | Implementada; motor em variante própria |
| Ambiente `residuos/page.tsx` | `/meio-ambiente/residuos` | Gerador, tipo, quantidade, destinação, data, ações | Drizzle `listWastes` e opções de empreendimentos; filtros/busca antes do slice 20 | 746 | Implementada |
| Ambiente `solicitacoes/page.tsx` | `/meio-ambiente/solicitacoes` | Tipo, solicitante, endereço, status, data, ações | Drizzle `listRequests`; filtros/busca antes do slice 20 | 646 | Listagem implementada; controles sem handlers já existiam na origem |

## Implementação e preservação

- As 15 migrações usam `OperationalTable` e `OperationalListFrame`, mensagens vazias específicas, valores integrais para detalhes e preferências independentes por tabela. Colunas de dados são redimensionáveis; ordenação de cabeçalho não foi inventada (`sortable: false`), mantendo a ordem das consultas atuais.
- `saneamento/components/list-columns.ts` concentra as seis novas configurações do módulo. As nove de Ambiente ficam junto às respectivas páginas. Nenhum campo foi ocultado para caber. Educação separa início/fim; zero em área/participantes é exibido como zero, distinguindo-o de ausência.
- Ações gerais foram para o header por `actions` do frame. Busca permanece na faixa compacta; filtros excedentes usam `OperationalFilters`. `SanitationFilters` mantém busca debounced e navegação pelo hook existente; limpar/aplicar preserva a busca e o período obrigatório. `LocalListToolbar` mantém filtragem imediata nas listas cliente.
- Os acionadores de `NewReadingSheet`, `NewServiceOrderSheet` e dos oito sheets ambientais (`NewGreenAreaSheet`, `NewComplaintSheet`, `NewDocumentSheet`, `NewEduProgramSheet`, `NewEnterpriseSheet`, `NewInspectionSheet`, `NewLicenseSheet`, `NewWasteSheet`) usam `newButton`/`newLabel`, ícone e nome acessível, mantendo formulários e callbacks. Isso permite recolher o texto no header estreito sem perder a ação.
- `EnvironmentListToolbar` usa formulários GET, preserva filtros e parâmetros adicionais, remove `page` ao buscar/aplicar/limpar e oferece limpeza explícita. `OperationalLinkPagination` recebe todos os parâmetros originais. `list-utils.ts` mantém busca integral, incluindo objetos relacionados/datas, e ajuste de página após redução do conjunto; usa a constante central de 20.
- Os seis `page.tsx` de Saneamento perderam somente a composição de título/wrappers redundantes e entregam diretamente seus clientes. Consultas, DTOs, serializações de datas e contexto `getTenantContextForModule` foram preservados.
- Leituras e serviços mantêm seus sheets de criação/edição; apenas os acionadores de edição usam o token compacto. Portal, qualidade e relatórios mantêm formulários, confirmações, estados de salvamento/inativação e contratos `{ error }`. Erros de relatórios aparecem em diálogo, sem criar outra faixa na grade.
- Ambiente mantém os oito componentes `*RowActions`, seus sheets, confirmações e Server Actions. `components/ActionButtons.tsx` só adapta a apresentação aos tokens e move erros para diálogo. Assinaturas exportadas e contratos de actions não mudaram. Os consumidores dos helpers/clientes foram rastreados antes das alterações.
- Download em Documentos preserva destino original, proxy `/api/download?url=...`, nova aba e `rel`. A célula específica tem nome acessível; `values.download` continua contendo o texto.
- `saneamento/layout.tsx` e `meio-ambiente/layout.tsx` consultam `useOptionalOperationalWorkspace`: sob workspace retornam apenas `children`; nas demais rotas preservam seu `ModuleShell`, navegação e identidade existentes.
- Manifesto: `src/components/app-ui/operational/modules/saneamento-ambiente.ts`, export `operationalModules: OperationalModuleConfig[]`, 7 + 9 caminhos concretos, menus/destinos e `exact` originais. O principal deve integrá-lo ao registro comum.

## Conflito de composição resolvido: motor de licenciamento

O `<details>` anterior acrescentava um formulário extenso e uma área de rolagem acima da tabela. A menor separação aplicada é `/meio-ambiente/licenciamento?view=motor`, com acesso no header e retorno à listagem preservando seus parâmetros. O componente `LicenciamentoInteractiveClient` e sua action não foram alterados. O manifesto exclui `view=motor` do workspace operacional, mantendo a composição normal do módulo para o formulário. Não há paginação de campos de formulário nem nova contagem tabular para essa variante.

## Verificações executadas

1. **ESLint próprio:** `npx eslint` com os 42 arquivos TS/TSX alterados/criados do lote, incluindo o manifesto: exit 0, sem erros ou avisos. A lista corresponde aos arquivos de código citados neste relatório: 20 em Saneamento, 21 em Meio Ambiente e o manifesto.
2. **Ensaio isolado sem banco**, com `node --import tsx` e assertions em arquivo temporário fora do repositório: 42 registros, busca produzindo exatamente 21 resultados, primeira página com 20 e segunda com 1 (último registro correto), busca em relação aninhada com acentos/maiúsculas, vazio, páginas negativa/inválida/excessiva e ajuste após redução do conjunto. Também conferidos parâmetros preservados, manifesto com 16 rotas únicas (7+9), exclusão `view=motor`, chaves e limites das seis configurações de Saneamento. Resultado: **OK**.
3. **`git diff --check` limitado ao lote:** sem problemas de whitespace.
4. **Inspeção de cobertura:** as nove páginas ambientais não possuem mais tabela HTML local, `ErpPagination`, `QuickFilters` ou wrapper de rolagem tabular. As seis novas listas de Saneamento não usam `SanitationTable`.

Estas verificações não provam geometria, hidratação, foco de diálogos ou funcionamento com perfis reais. Não houve full build, acesso ao banco, seed, commit ou push.

## Pendências reais e integração

| Item | Situação | Menor próximo passo |
|---|---|---|
| API comum ainda em evolução na base observada | Integração bloqueada enquanto faltar `OperationalListFrame.tsx`, seus exports (`OperationalFilters`, `OperationalLinkPagination`), `useOptionalOperationalWorkspace`, propriedades de mensagem/caption e `OperationalRow.cells` descritos no contrato | Principal concluir a API comum e importar este manifesto no registro do workspace. O lote já consome o contrato, sem recriar primitives locais |
| Homologação visual R02–R10/R12 | Pendente nas 15 novas migrações e na integração preservada do piloto | Medir matriz de viewports/zoom, linha 20, última coluna, rodapé, redimensionamento, foco, detalhes e celular. Usar diagnósticos da base, sem diminuir fonte nem esconder campos |
| Larguras mínimas | Leituras requer 804px só para a tabela; resíduos 746px; os demais mínimos constam na matriz acima. Esses valores podem exceder a área disponível após o menu em tablet/janela estreita | Medir área real; se insuficiente, registrar dimensão disponível e decisão de suporte/visão alternativa. Os mínimos não foram artificialmente reduzidos |
| `/meio-ambiente/solicitacoes`: criação/edição/autorização/negação | Funcionalidade preexistente bloqueada: botões na origem não tinham handler/action, e isso foi preservado. A migração da listagem foi concluída | Implementar contrato funcional de solicitações em tarefa de domínio; não atribuir permissões ou mutações fictícias na migração visual |
| Desempate de ordenação | Consultas e ordenação Drizzle atuais preservadas; algumas consultas de Ambiente e listas cliente de Saneamento não declaram desempate por ID no repositório | Principal avaliar desempate na camada de dados em sua frente apropriada, sem alterar ORM/DTO neste lote |
| Vocabulário legado dos filtros ambientais | Inconsistência estática anterior: opções de filtro como `Medio`, `Em Recuperacao`, `Concluido` e `Parecer Tecnico` diferem dos valores acentuados enviados pelos sheets (`Médio`, `Em Recuperação`, `Concluído`, `Parecer Técnico`). Há queries com igualdade exata; não houve consulta ao banco para determinar o vocabulário dos registros existentes | Harmonizar o contrato de domínio com compatibilidade para dados/URLs legados em tarefa própria. As opções e os parâmetros anteriores foram preservados neste lote |

Não há estrutura tabular abandonada neste lote: os bloqueios acima são de integração, homologação ou funcionalidades anteriores. A base `SanitationTable` e `QuickFilters` antigos foram mantidos sem exclusão automática e não contam como novas estruturas.
