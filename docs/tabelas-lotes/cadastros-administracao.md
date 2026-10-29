# Lote `cadastros-administracao`

Data: 29/10/2026. Referências: `TABELAS_CONTRATO_EXECUCAO.md`, `Padrão de Tabelas.md`, inventário (seções Administração/Cadastros) e plano (D01–D06 e amostra Pessoas Físicas).

## Resultado e limite da entrega

- **15 das 15 estruturas com rota implementadas em código**, abrangendo **24 caminhos concretos** no manifesto de workspace e **dois aliases de BI com painel operacional próprio** (`/administracao` e `/administracao/indicadores`). As 14 variantes dos catálogos contam como uma única estrutura compartilhada.
- **D03 resolvido em código:** o comparativo completo do BI usa `OperationalTablePanel` full-screen, preservando gráficos, indicadores, seleção e exportações. Não há mais recorte de linhas em função da altura.
- **Demandas legado também migrado em código**, além das 15 estruturas com rota, sem excluir o componente ou ativar uma rota fictícia.
- Revisão autorizada pelo usuário: **rolagem permitida em tablets e celulares; proibida em notebook/desktop**. A classificação e os estilos de dispositivo são os da base comum, sem exceção local por breakpoint.
- Situação das migrações: **implementada, aguardando integração da API comum e homologação visual**. Nenhuma foi marcada como validada visualmente.
- Base, `ClientLayout`, `ModuleShell`, DTOs, Server Actions e repositórios de banco permanecem sob responsabilidade de seus executores. As ações existentes continuam sendo chamadas, com tratamento tanto de `{ error }` como de exceções, sem mudar suas assinaturas.

## Implementação

`src/app/app-domain/cadastros/operational-registry.tsx` é um adaptador de domínio para configuração das listagens deste lote. Usa exclusivamente `OperationalTable`, `OperationalListFrame`, `OperationalPagination` e os tokens comuns para geometria, paginação e células. Não implementa algoritmo próprio de encaixe ou detalhes. A busca é aplicada antes do recorte de 20; troca de busca retorna à primeira página; a página corrente é limitada ao total atual. Não gera linhas fictícias. Os dados já carregados mantêm a ordem recebida dos repositórios. Não adiciona ordenação local apenas sobre os 20 registros.

Colunas declaram chave, título, tipo, largura inicial, mínimo e máximo. Dados são redimensionáveis; ações ficam limitadas a 40 px (uma), 64 px (duas) ou 96 px (três), incluindo preenchimento. A fonte e linha vêm da base: `.8125rem` e `1.5rem` (13/24 px com raiz 16 px); não há redução automática de fonte nem campos escondidos por breakpoint. Em tablets/celulares, rolagem e tokens de toque seguem a política compartilhada autorizada; em notebook/desktop o encaixe continua obrigatório.

Edições saem do corpo das tabelas para `Dialog` da aplicação. Preservam valores, confirmações, validações de domínio e erros. O adaptador conserva o rascunho ao mudar de bloco de campos, impede envio concorrente e informa o elemento para retorno do foco. Os catálogos usam rascunho controlado, inclusive arrays de seleção, entre etapas de três campos. O formulário de fornecedor conserva todos os sete campos entre duas etapas.

### Amostra técnica: Pessoas Físicas

- Removidas as regras `hidden` de E-mail e Contribuinte.
- Separadas Contribuinte (Sim/Não) e Inscrição municipal; oito colunas reais, incluindo ações.
- CPF mantém máscara; nome, telefone e e-mail mantêm texto integral em `values`.
- Nome, CPF, e-mail, telefone, condição de contribuinte e inscrição continuam editáveis, agora em diálogo. A inscrição aparece no formulário quando Contribuinte está marcado; desmarcar preserva a mesma semântica da action existente.
- Ativação/inativação e confirmação de salvamento preservadas. Paginação e estado vazio usam a base, inclusive sem qualquer pessoa cadastrada.
- A soma dos mínimos foi revisada de 797 para **674 px**, sem remover colunas ou reduzir a fonte. Mínimos representam uma prévia útil, não a largura do título completo: células e cabeçalhos excedentes usam os detalhes condicionais da base. O ensaio do algoritmo comum comprovou distribuição das oito colunas em **1224 px**, sem substituir homologação de navegador.

## Cobertura por estrutura

Caminhos abaixo são relativos a `src/app/app-domain/`. Todas as linhas implementadas passaram por ESLint dos arquivos alterados e inspeção de dados/ações/colunas. Os cinco conjuntos revistos também passaram pelo ensaio de larguras, e o BI pelo ensaio de paginação descrito ao final; isso não prova geometria no navegador.

| Estrutura/arquivos | Rotas | Colunas | Origem/paginação | Alterações e situação |
| --- | --- | --- | --- | --- |
| `administracao/secretarias/SecretariasClient.tsx` | `/administracao/secretarias` | Nome, sigla, responsável, cargo do responsável, vínculo do responsável, departamentos, status, ações | `listSecretariatDetails`/`listManagerOptions`; busca e página cliente, 20 | **Implementada**. Remove sigla/responsável ocultos, empilhamento e linhas vazias. Preserva seleção de gestores elegíveis (mesma secretaria ou sem secretaria), cargo/matrícula nas opções, sinalização de gestor inativo/nome sem vínculo, contagem, edição e status. |
| `administracao/departamentos/DepartamentosClient.tsx` | `/administracao/departamentos` | Nome, secretaria vinculada, status, ações | `listDepartmentDetails`/opções de secretarias; cliente, 20 | **Implementada**. Preserva busca por nome/descrição/secretaria e vínculo; descrição carregada é reenviada sem descarte. Edição em diálogo e confirmações de status. |
| `administracao/unidades/UnidadesClient.tsx` | `/administracao/unidades` | Nome, tipo, endereço, secretaria vinculada, responsável, status, ações | `listUnitDetails`/opções de secretarias; cliente, 20 | **Implementada**. Retira `min-w-[1000px]`; endereço íntegro, todos os cinco campos editáveis em diálogo, ativação/inativação. |
| `administracao/cargos/CargosClient.tsx` | `/administracao/cargos` | Nome, atribuições, nível, previsão de assinatura, servidores vinculados, status, ações | `listRoleDetails`; cliente, 20 | **Implementada**. Retira largura forçada; atribuições saem do textarea da linha para diálogo. Mantém aviso de assinatura informativa, contagem e tratamento de erros. |
| `administracao/servidores/ServidoresClient.tsx` | `/administracao/servidores` | Nome, CPF, e-mail, cargo, secretaria, departamento, status, ações | `listEmployeeDetails` e opções ativas; cliente, 20 | **Implementada**. Separa identidade e lotação; preserva edição, seleção de cargo, departamento condicionado à secretaria e limpeza ao trocar secretaria. Mantém mapeamento de IDs por nome já usado pelo consumidor. |
| `administracao/calendario/CalendarioClient.tsx` | `/administracao/calendario` | Data, evento, descrição, tipo, feriado, ações | `listCalendarEvents`; cliente, 20 | **Implementada**. Descrição e feriado explícitos; preserva tipos, data formatada em português e salvamento da data às 12h UTC, edição e confirmação de exclusão permanente. |
| `administracao/indicadores/AdministrationDashboard.tsx`, `indicadores/page.tsx` | `/administracao`, `/administracao/indicadores` | Código, secretaria, sigla, status, responsável, cargo do responsável, vínculo válido, servidores ativos/inativos, departamentos, unidades, demandas, abertas, encerradas/canceladas, vencidas, ações — 16 colunas | `getAdministrationBi`; cliente, 20, busca antes do recorte | **Implementada**. `OperationalTablePanel` com provider/header próprios e `OperationalListFrame`. Removidos `pageSize` variável, medição de linhas e tabela reduzida inline. Gráficos, filtro de secretaria, exportações Excel/CSV/Power BI e PDF preservados; seleção por registro permanece em ação explícita. Busca e página ficam no componente pai e persistem ao fechar/reabrir o painel. Removido o `key` que desmontava o BI ao trocar seleção. |
| `cadastros/pessoas-fisicas/PessoasFisicasClient.tsx` | `/cadastros/pessoas-fisicas` | Nome completo, CPF, telefone, e-mail, contribuinte, inscrição municipal, status, ações | `listPeople`; cliente, 20 | **Implementada**. Amostra detalhada acima. Busca sobre nome/CPF/e-mail/telefone antes da paginação. |
| `cadastros/pessoas-juridicas/PessoasJuridicasClient.tsx` | `/cadastros/pessoas-juridicas` | Razão social, CNPJ, telefone, e-mail, contribuinte, inscrição municipal, status, ações | `listCompanies`; cliente, 20 | **Implementada**. Remove campos ocultos e separa inscrição; máscara de CNPJ e edição de todos os campos preservadas. |
| `cadastros/documentos/DocumentosClient.tsx` | `/cadastros/documentos` | Título, tipo, vínculo, validade, ações | `listDocuments`; cliente, 20 | **Implementada**. Preserva prioridade pessoa/empresa no vínculo, data brasileira, edição, exclusão confirmada e download `/api/download?url=...` em nova aba. |
| `cadastros/imoveis/ImoveisClient.tsx` | `/cadastros/imoveis` | Inscrição imobiliária, logradouro, número, bairro, tipo, proprietário, status, ações | `listRealEstates`; cliente, 20 | **Implementada**. Separa endereço em atributos sem empilhar; preserva busca, proprietário PF/PJ, quatro campos editáveis e ações conforme status Regular. |
| `cadastros/fornecedores/FornecedoresClient.tsx`, `fornecedores/page.tsx` | `/cadastros/fornecedores` | Fornecedor, PF/PJ, CPF/CNPJ, categoria, ramo, ME/EPP, CNAE principal, CNAEs secundários, situação, certidões, evidências, ações | `getSupplierList`; servidor, 20, total filtrado | **Implementada**. Remove colunas ocultas e linhas de expansão. Filtros completos em sobreposição; busca compacta conserva filtros. Edição em diálogo, consultas externas em blocos; evidências completas com tipo/status/validade no leitor da base. Mantém `canCreate`, `canUpdate`, `canIssueReports`, data de referência e CSV do conjunto filtrado, sem limitar a exportação à página. Mínimos revisados de 1166 para 941 px, mantendo as 12 colunas e ações. |
| `cadastros/organograma/page.tsx`, `organograma/OrganogramaClient.tsx` | `/cadastros/organograma` | Secretaria, sigla, departamentos, unidades administrativas, status | `loadRegistryOrganogram`; dados já completos, agora cliente, 20 | **Implementada**. Separa sigla e nome; preserva listas integrais de departamentos e unidades com seus tipos, com detalhes da base ao exceder a célula. Acrescenta busca no conjunto e mantém links de administração. |
| `cadastros/qualidade/page.tsx`, `qualidade/QualityList.tsx` | `/cadastros/qualidade?run=...&page=...` | Gravidade, tipo, tipo de registro, registro, descrição, status, detectado | `loadConsistencyRuns`/`loadConsistencyIssues`; servidor, 20 | **Implementada**. Separa tipo e ID do registro. Seleção de execução em formulário compacto, com data, total e status preservados. Reconciliação em sobreposição com a permissão original; botão de verificação no header. Reconsulta página válida caso total invalide página solicitada. |
| `cadastros/MasterDataCatalogClient.tsx`, `master-data-page.tsx` | 11 caminhos e 14 variantes listados abaixo | Campos específicos de cada catálogo + status e ações | `loadMasterDataPage`; servidor, 20, `q`, `tab`, `page` | **Implementada**. Uma estrutura compartilhada. Preserva campos/opções/required/tipos, inclusão, edição, arrays de multisseleção, status e `router.refresh()`. Seletor de variante na toolbar; paginação conserva `q` e `tab`. Reconsulta página válida quando necessário. |
| `administracao/demandas/DemandasClient.tsx` | Sem consumidor de rota atual; `/administracao/demandas` continua redirecionando | Título, descrição, status, prioridade, responsável, criador, secretaria, departamento, ações — nove colunas | Props existentes; cliente, 20, busca e filtro de status antes do recorte | **Legado implementado**. Usa painel com provider próprio, frame/tabela/paginação comuns. Preserva seis campos editáveis, todas as opções de status/prioridade/responsável/lotação e confirmações de salvar, concluir e cancelar. Trata `{ error }` e exceções sem fechar edição em falha. Busca, filtro, página e rascunho ficam acima do conteúdo desmontável do painel. |

### Variantes da estrutura de catálogos (não contar novamente)

Todas acrescentam Status e Ações e usam preferências independentes por `catalog`.

| Rota / variante | Catálogo e colunas próprias | Soma dos mínimos (px) |
| --- | --- | ---: |
| `/cadastros/familias` | `families`: código, responsável, membros, endereço | 494 |
| `/cadastros/entidades` | `entities`: código, entidade, tipo, entidade pai | 444 |
| `/cadastros/centros-custo` | `costCenters`: código, centro, entidade, secretaria, pai | 554 |
| `/cadastros/localidades?tab=cidades` | `cities`: IBGE, cidade, estado | 379 |
| `/cadastros/localidades?tab=bairros` | `neighborhoods`: bairro/localidade, tipo, cidade, região | 449 |
| `/cadastros/localidades?tab=logradouros` | `streets`: logradouro, tipo, cidade, bairro, CEP | 524 |
| `/cadastros/bancos-agencias?tab=bancos` | `banks`: COMPE, ISPB, banco, nome curto | 509 |
| `/cadastros/bancos-agencias?tab=agencias` | `branches`: banco, agência, nome, cidade | 459 |
| `/cadastros/tributos` | `taxes`: código, tributo, tipo, esfera, vigência | 529 |
| `/cadastros/moedas` | `currencies`: ISO, moeda, símbolo, decimais, padrão | 524 |
| `/cadastros/produtos` | `products`: código, produto, natureza, categoria, unidade | 564 |
| `/cadastros/cbo` | `cbos`: código CBO, ocupação | 309 |
| `/cadastros/assinantes-legais` | `signers`: signatário, função, relatórios, entidade, vigência | 664 |
| `/cadastros/textos-juridicos` | `legalTexts`: tipo, número, ementa, órgão, versão | 499 |

## Manifesto, composição e arquivos de apoio

- `src/components/app-ui/operational/modules/cadastros-administracao.ts`: exporta `operationalModules: OperationalModuleConfig[]` com dois módulos, mesmos grupos/destinos/ícones e `exact` dos menus existentes, seis rotas de Administração e 18 de Cadastros. Os comentários de integração identificam os dois aliases do BI e o cliente legado migrados em `OperationalTablePanel`. Essas telas não são registradas como workspace de rota: o painel já fornece provider e header, e o BI conserva sua composição analítica. Não inclui `/novo`, relatório ou redirecionamento como listagem fictícia. Integração do manifesto no shell pertence ao principal.
- `administracao/layout.tsx`: cliente com `useOptionalOperationalWorkspace`; no workspace retorna apenas `children`, evitando que o wrapper BI e seu `overflow-y-auto` envolvam a lista operacional. Fora dele conserva o shell BI atual.
- O layout de Cadastros contém somente `Suspense`/`ModuleShell`; depende do reconhecimento do workspace por `ModuleShell`, conforme contrato, sem wrapper próprio adicional.
- Os PageHeaders de rotas existentes conservam inclusão/importação/exportação e destinos originais; sua composição no workspace depende da integração compartilhada.
- Arquivos próprios de código: **24** (20 modificados + três novos adaptadores/clientes locais + manifesto). Este relatório é o 25º arquivo da entrega. A retomada acrescentou as mudanças em `AdministrationDashboard.tsx`, `indicadores/page.tsx` e `DemandasClient.tsx` e revisou individualmente os três clientes de Pessoas/Fornecedores.

## Adaptações resolvidas e dependências de integração

### D03 — comparativo analítico resolvido com painel

O comparativo anteriormente media a área restante entre gráficos e indicadores e usava entre uma e oito linhas. Agora seu acionador abre `OperationalTablePanel` full-screen; o corpo de **504 px** (21 × 24) não concorre com os gráficos. Todos os 15 atributos de `AdministrationBiRow`, incluindo código, estados e contagens anteriormente ausentes, têm coluna própria, mais a ação de seleção. As oito contagens são alinhadas à direita. Exportações mantêm o conjunto da seleção do servidor, sem recorte por página ou busca local. Ambos os aliases conservam a composição do BI e acessam o mesmo painel. Não há pendência estrutural de implementação D03; homologação visual continua distinta.

### D05 — mínimos horizontais explícitos

Somas derivadas da configuração, não medidas no navegador: Secretarias **824**, Departamentos **419**, Unidades **669**, Cargos **724**, Servidores **729**, Calendário **514**, Pessoas Físicas **674**, Pessoas Jurídicas **694**, Documentos **506**, Imóveis **644**, Organograma **550**, Qualidade **620**, Fornecedores **941**, BI **995** e Demandas legado **806 px**.

Notebook de 1280 px com barra de ícones de 56 px deixa **1224 px** para a tabela antes de outros descontos. Os cinco conjuntos revistos foram extraídos do código por AST e processados pela função real `fitOperationalWidths`: PF (8), PJ (8), Fornecedores (12), BI (16) e Demandas (9) mantiveram todas as colunas, cada largura acima do mínimo e soma final exatamente 1224 px. Fornecedores tem **283 px** de margem sobre o mínimo, contra 58 px na revisão anterior. As larguras iniciais são distribuídas/reduzidas pelo algoritmo comum; títulos não obrigam mínimos iguais ao texto integral porque terão detalhe condicional de cabeçalho.

Não foi ocultado campo, reduzida fonte nem movido atributo independente para outra visão. Prévia truncada tem acesso ao valor integral pela base; título recebe detalhe somente quando excede sua largura real. O teste de distribuição não prova a geometria do navegador nem substitui medições com zoom. Em tablets/celulares o usuário autorizou rolagem; não se pede mais decisão de exceção para esses dispositivos. Notebook/desktop continuam sem rolagem e precisam da medição efetiva após integração.

### D01/D06 — altura e diálogos

O corpo precisa de pelo menos 504 px na raiz padrão, além da toolbar, rodapé e header. Fonte/linhas não são reduzidas. Os editores distribuem campos entre blocos e as consultas externas entre páginas. Conteúdo textual longo de células, inclusive evidências de fornecedores, usa o leitor paginado/cópia integral da base. BI e legado usam o painel full-screen para obter orçamento próprio. Ainda é necessário medir a matriz de viewports, zoom 125%/200%, toque, foco e diálogos; não foi produzida evidência de navegador. A nova autorização de rolagem abrange tablets/celulares, nunca notebook/desktop; sua aplicação por dispositivo pertence à base compartilhada.

### API comum ainda em integração no momento dos checks

A checagem semântica direcionada desta retomada encontrou **14 diagnósticos dependentes da base contratada**:

- sete imports do arquivo ainda ausente `OperationalListFrame.tsx` (incluindo exports de paginação e filtros);
- seis usos dos props contratados `caption`/`emptyMessage` ainda ausentes da assinatura local do piloto `OperationalTable`;
- um import de `useOptionalOperationalWorkspace`, ainda não exportado no checkout observado.

O novo `OperationalTablePanel` já apareceu no checkout durante a execução e foi conferido: fornece `OperationalSurface`/header próprios e pode desmontar os filhos ao fechar; por isso busca/página do comparativo e rascunho do legado estão no pai. Não houve outro erro local na checagem direcionada; nenhum stub, type cast de supressão ou alteração da base foi introduzido. O principal deve concluir a API garantida, detalhes condicionais de cabeçalho e política de scroll para tablets/celulares e repetir a integração/typecheck. O lote não está declarado compilado/integrado enquanto isso.

## Legado e formatos fora do manifesto

- `administracao/demandas/DemandasClient.tsx`: **legado migrado**, descrito na matriz. Busca por consumidores em `src/**/*.tsx` encontrou somente sua declaração; `demandas/page.tsx` continua redirecionando para `/administracao`. O componente foi convertido integralmente para painel/base, sem apagar código funcional ou contabilizar o redirect como rota operacional.
- `cadastros/fornecedores/relatorio/route.ts`: **especial**, CSV integral filtrado; destino mantido sem impor limite de 20 à exportação.
- `/novo`, instituição e formulários/detalhes, inclusive atualizações de construção: não acrescentados ao manifesto operacional. Não continham outro ponto tabular operacional do inventário deste lote.

## Checks executados e continuidade

1. Leitura de AGENTS, contrato, padrão, seções do inventário/plano e guias Next instalados de Server/Client Components e Layouts/Pages.
2. Inspeção individual de cada arquivo alterado, páginas consumidoras, repositórios de leitura e contratos de ações relevantes. Consumidores do helper de catálogos verificados antes de acrescentar a prop opcional de variantes; assinaturas das actions preservadas.
3. **ESLint dos 24 arquivos próprios de código: aprovado, sem erros ou avisos.** Comando: `eslint` sobre os caminhos alterados de Administração/Cadastros e os quatro arquivos novos de código do lote.
4. **`git diff --check` do escopo: aprovado.**
5. **TypeScript direcionado, sem emissão/incremental e sem build:** 14 diagnósticos de integração descritos acima; não aprovado como integração completa. O programa verifica diagnósticos apenas dos arquivos próprios, incluindo `next-env.d.ts` para os tipos de CSS.
6. **Ensaio de larguras com o algoritmo comum: aprovado** para os cinco conjuntos listados em D05, em área útil de 1224 px. Usa configurações reais extraídas por AST e a implementação real de `registryColumns`/`fitOperationalWidths`, sem importar ou executar banco/actions.
7. **Ensaio do componente real de comparativo: aprovado.** A função `AdministrationComparison` foi extraída/transpilada e executada com elementos React reais e dependências visuais substituídas por marcadores: 21 registros produzem 20/1; os 15 atributos e o nome extenso permanecem integrais; busca pelo último registro é aplicada antes do recorte, ajusta página inválida para 1 e mantém total filtrado; ação seleciona o ID correto; vazio produz zero linhas/total. Não monta navegador, provider ou actions.
8. Busca residual: **nenhum** `<table>`, `ErpListFrame`, `ErpCompactListFrame` ou paginação por altura em Administração/Cadastros, incluindo BI e Demandas legado.
9. Sem execução de banco, seed, build completo, commit ou push. Homologação visual e interações reais com as actions não executadas neste lote. ESLint/TypeScript e os ensaios isolados não comprovam geometria nem persistência no banco.

Após integrar a base: importar o manifesto no agregador, repetir checagem semântica e verificar no navegador 0/1/20/21 registros, filtros e páginas inválidas, edição multietapa/seleção, permissões de fornecedor, exportação integral, retorno de foco e leitura longa; então medir a matriz do padrão, incluindo tablets/celulares com scroll e notebook/desktop sem scroll. Para novas telas, configurar colunas e ações sobre a mesma base; não recriar tabela ou densidade local.
