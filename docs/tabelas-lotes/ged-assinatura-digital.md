# Tabelas — GED e Assinatura Digital

31/10/2026. Referências: `Padrão de Tabelas.md`, `TABELAS_CONTRATO_EXECUCAO.md` e `IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md`.

| Estrutura | Rotas | Colunas | Dados / paginação | Situação |
| --- | --- | --- | --- | --- |
| `GedWorkspace`, acervo/pesquisa | `/assinatura-digital/acervo`, `/assinatura-digital/pesquisa` | Seleção, documento, pasta, versão, situação, conteúdo, ações | Drizzle/SQL autorizado no servidor; count filtrado e páginas de 20; seleção por versão preservada entre páginas; ZIP revalida escopo/hash | Implementada; testes de dados aprovados |
| `GedWorkspace`, listagens de gestão | `/assinatura-digital/{pastas-inteligentes,importacoes,processamento,tarefas,fluxos,modelos,thesaurus,classes}` | Nome, tipo/fase, situação, detalhes, ações | Count filtrado e LIMIT/OFFSET no servidor; 20 por página; consultas e ações por capacidade/escopo | Implementadas |
| Histórico em `GedDocumentDetail` | `/assinatura-digital/acervo/[id]`, painel de versões | Versão, estado, SHA-256, criação, original/validação | `OperationalTablePanel` em tela cheia; count e paginação server-side de 20 | Implementado |
| Acervo anterior | `/assinatura-digital/acervo/integrados` | Estrutura anterior `GEDClient` | Compatibilidade com guarda `DOCUMENTOS`; exclui entradas/pastas gerenciadas | Legado preservado, não homologado novamente |
| Cadastro anterior de modelos | `/assinatura-digital/modelos/anteriores` | Estrutura anterior `ModelosClient` | Preservação do cadastro histórico; geração real pertence à nova tela de modelos | Legado preservado |

Reuso de `OperationalListFrame`, `OperationalFilters`, `OperationalTable` e `OperationalPagination`, com preferências separadas por seção. Colunas têm mínimos/larguras explícitos, conteúdo integral em `values`, seleção em `cells` e ações acessíveis. Nenhum contêiner próprio de scroll envolve a tabela.

O detalhe com abas não é registrado como listagem operacional no manifesto. O histórico abre seu próprio workspace em tela cheia. Manifesto consolidado em `src/components/app-ui/operational/modules/assinatura-digital.ts`; retirado o manifesto do módulo Documentos anterior, cujas rotas agora redirecionam.

O scanner estático de tabelas e ESLint foram executados. Testes de dados não comprovam geometria. Medição de notebook/desktop/tablet/celular, redimensionamento e comportamento hidratado exigem ambiente autenticado com as migrações aplicadas; não foram homologados visualmente nesta execução.
