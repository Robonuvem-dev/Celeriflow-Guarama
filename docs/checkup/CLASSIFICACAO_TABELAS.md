# Classificação dos 36 pontos nativos — 06/11/2026

Inspeção individual dos **23 arquivos** citados pelo scanner, abrangendo os 36 pontos. Esta classificação é de código; não constitui aprovação visual nem altera o resultado estrito de cobertura.

As ocorrências abaixo não são todas listagens principais. Algumas são documentos de impressão/exportação, outras são grades contextuais em formulários, e algumas misturam consulta e emissão. O simples fato de existir um botão de impressão não isenta uma listagem operacional do padrão.

Os caminhos da tabela são relativos a `src/app/app-domain/`, exceto a última linha.

| Arquivo | Pontos | Natureza constatada | Adequação necessária |
| --- | ---: | --- | --- |
| `cemiterios/complementos/page.tsx` | 6 | Mista: consultas de falecidos/jazigos/transferências/sepultamentos e histórico de proprietários com ação de cancelamento | Separar as consultas paginadas da emissão integral; preservar filtros, transferência/cancelamento e o mapa SVG próprio. Não enquadrar o mapa como tabela. |
| `compras/cadastros/AuxiliaryCatalogClient.tsx` | 1 | Listagem de catálogo com busca, cadastro e edição | Migrar para tabela/paginação compartilhadas; preservar campos variáveis, seleções múltiplas, somente leitura e atos imutáveis. |
| `compras/cadastros/crc/relatorio/page.tsx` | 1 | Relatório de totalização por período, com impressão | Preservar saída integral; conferir identidade e separar a consulta operacional caso seja paginada. |
| `compras/licitacoes/registro-precos-externo/ExternalPriceRegistrationClient.tsx` | 2 | Tabelas contextuais de SD e ACS dentro do detalhe selecionado | Usar painéis e paginação contextual; preservar cancelamento de SD e formulários/composição do processo. |
| `compras/pesquisas-precos/[id]/relatorio/page.tsx` | 3 | Documento de impressão com itens, cotações unitárias e propostas globais | Preservar os três conjuntos integrais e a semântica de documento. |
| `configuracoes/conta/page.tsx` | 1 | Histórico contextual de alterações da própria conta, limitado a 30 eventos | Paginar com componente compartilhado; preservar os formulários independentes de senha/e-mail. |
| `educacao/disciplinas/page.tsx` | 1 | Cadastro/listagem com edição por parâmetro | Migrar listagem e paginação sem desmontar o rascunho do formulário. |
| `educacao/licencas/page.tsx` | 1 | Cadastro/listagem com edição e exclusão | Preservar todos os campos, contratos das actions e formulários independentes; não aninhar formulários. |
| `financeiro/cheques/page.tsx` | 1 | Listagem operacional já paginada em SQL de 20 em 20, com ações contextuais | Substituir apenas composição/paginação visual; manter filtros, escopo de contas, comprovante, compensação/cancelamento e talões. |
| `financeiro/relatorios/ensino-decendial/page.tsx` | 1 | Demonstrativo fiscal acumulado com memória/hash e exportação CSV | Preservar período, valores, avisos de composição e saída integral; não recortar o documento em 20 componentes. |
| `financeiro/relatorios/fontes/page.tsx` | 1 | Mista: consulta pesquisável e emissão CSV integral | Separar paginação da consulta e exportação completa; preservar ordenação e texto integral. |
| `meio-ambiente/residuos/estoque/StockView.tsx` | 1 | Saldo contextual por depósito, paginação própria e formulário de saída por posição | Reutilizar painel/tabela/paginação; preservar chave idempotente e rascunhos de movimentação. O histórico em cartões também precisa de revisão operacional. |
| `tributacao/agrupamentos/page.tsx` | 1 | Histórico contextual dos últimos 100 agrupamentos, junto ao formulário | Paginar sem alterar o agrupamento ou perder confirmação/justificativa do formulário. |
| `tributacao/declaracao-cartoes/DeclaracaoCartoesClient.tsx` | 1 | Consulta operacional com variantes sintética/analítica e totalizadores | Usar configuração compartilhada mantendo colunas condicionais, filtros e totalizadores da população filtrada. |
| `tributacao/declaracoes-complementares/page.tsx` | 1 | Consulta/cadastro versionado com edição | Migrar tabela/paginação e preservar versões, seleção e payload do formulário. |
| `tributacao/fiscalizacao/gestao/page.tsx` | 1 | Consulta de ordens, seleção de detalhe e gestão | Migrar listagem sem tratar a tela inteira como documento de impressão; preservar auditor responsável, filtros e operações do detalhe. |
| `tributacao/iss-bancario/gestao/anexos/[id]/page.tsx` | 3 | Documento de demonstrativos I–VI, com totais mensais/anuais e impressão | Manter documento integral e conferir apresentação; não converter automaticamente em listagens independentes. |
| `tributacao/iss-bancario/gestao/declaracoes/[id]/page.tsx` | 2 | Grades contextuais de apuração e balancete de uma declaração, também imprimíveis | Separar navegação contextual e impressão integral; preservar guias/reimpressão e dados originais do lote. |
| `tributacao/iss-bancario/gestao/page.tsx` | 2 | Listagens operacionais de declarações e autos, hoje limitadas a 500 | Migrar ambas com paginação real; manter todos os filtros e exportações integrais. |
| `tributacao/referencias/TaxReferenceClient.tsx` | 1 | Catálogos fiscais com filtros, edição e exclusão versionada | Migrar listagem; preservar detalhes variáveis, catálogo selecionado, rascunhos e payload integral. |
| `tributacao/relatorios-cadastrais/page.tsx` | 1 | Relatório cadastral parametrizado com impressão | Preservar população e variantes do documento; não classificar automaticamente como listagem principal. |
| `tributacao/simples-nacional/consulta/page.tsx` | 2 | Grades contextuais de períodos e declarações de um dossiê, com exportações | Paginar a consulta sem reduzir a população exportada nem o conteúdo original dos registros. |
| `src/app/portal/tributario/declaracoes/page.tsx` | 1 | Consulta operacional do contribuinte, SQL/paginação de 20 e vínculos fiscais | Integrar componentes compartilhados preservando a identidade pública do portal e as permissões de titularidade. |

## Grades de edição adicionais

- `src/components/signatures/ged/GedAdministration.tsx:42`: campos de indexação; estado controlado em `fields`, payload integral enviado em `save-type`.
- `src/components/signatures/ged/GedAdministration.tsx:59`: permissões por objeto; estado controlado em `entries`, payload integral enviado em `save-acl`.
- `src/components/signatures/ged/GedRuleEditor.tsx:11`: ações de automação; estado controlado em `actions`, payload integral enviado em `save-rule`.

São grades de edição, não relatórios. A integração precisa manter o estado completo ao paginar/fechar painéis e a validação dos campos fora da parte visível. A inspeção não comprova essa integração nem a preservação ao alternar as abas do editor.

## Renderizadores órfãos

A busca por referências em `src` encontrou as definições, mas não consumidores dos três arquivos exatos apontados pelo scanner:

- `src/app/app-domain/documentos/assinaturas/AssinaturasClient.tsx`;
- `src/app/app-domain/documentos/ged/GEDClient.tsx`;
- `src/app/app-domain/social/modelos/SocialModelsClient.tsx`.

Existe outro `AssinaturasClient` ativo em `protocolos/assinaturas`, que é um arquivo diferente. Não há justificativa para apagar os arquivos órfãos sem investigar o histórico e a reconciliação. O scanner estrito continua reprovado; nenhum ponto foi removido ou liberado por esta classificação.

## Evidência visual pontual posterior

Os cinco catálogos de `tributacao/referencias/TaxReferenceClient.tsx` foram abertos autenticados no quinto bundle após receberem dados. Código, origem, texto e busca passaram, mas a captura confirma o desvio visual já classificado: tabela nativa com código quebrado e células em várias linhas, sem a paginação operacional compartilhada. A organização da página em partes pelo shell não corrige esse contrato de tabela. Evidência: `tax-reference-samples-fifth-build-retest/3.png`. A revisão de dados não foi contada como adequação visual desse ponto.
