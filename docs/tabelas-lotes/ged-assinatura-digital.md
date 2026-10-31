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

O scanner estático de tabelas e ESLint passaram. A homologação conectada em Chromium autenticado mediu o acervo em desktop (1440×900), notebook (1366×768), tablet (820×1180) e celular (390×844), com capturas por dispositivo. A página não apresentou overflow horizontal; a tabela coube em desktop/notebook e preservou a rolagem interna autorizada no celular. O painel do histórico foi medido em 1440×1000, cobrindo integralmente o viewport após a animação de abertura. Fonte de tabela: 13px. O lote de navegador, a seleção de zona OCR e os originais versionados também foram exercitados.

Também passaram o arraste da divisória de coluna, a persistência da largura após recarga, a abertura do conteúdo completo de célula truncada e a restauração das larguras. No celular foram conferidos busca utilizável, ações compactas acessíveis e deslocamento interno da tabela. A geometria do painel foi medida após o término da animação.

As medições conectadas usaram resultados com menos de 20 itens, sem completar linhas artificialmente. A paginação cheia 20/20/1 e os limites/escopos são cobertos pelos testes de dados. As rotas de gestão e anteriores passaram na navegação HTTP autenticada; a geometria foi medida nas estruturas compartilhadas de acervo e histórico. Evidência detalhada em `docs/GED_HOMOLOGACAO_RESULTADO.json`; capturas no diretório temporário registrado nesse arquivo.
