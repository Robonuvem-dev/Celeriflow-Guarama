# Validação LEG-04 — Portal da Transparência

Data da revisão: 21/10/2026. O status abaixo é resultado da auditoria de código desta sprint; a publicação de dados reais depende das fontes, entidades, exercícios e consultas habilitados pela gestão.

| Código | Requisito verificado | Status | Evidência principal |
|---|---|---|---|
| LEG-04-001 | Execução orçamentária e financeira em tempo real | Atende | `consultation-catalog.ts`, `native-provider.ts` |
| LEG-04-002 | Anexos da Lei 9.755/98 | Atende | `document-provider.ts`, `/portal/planejamento` |
| LEG-04-003 | Lei de Acesso à Informação | Atende | `/portal/acesso-informacao`, `citizen-service.ts` |
| LEG-04-004 | Itens da cartilha PNTP | Atende | `/transparencia/pntp`, `pntp-policy.ts` |
| LEG-04-005 | Consultas de contratos, compras, estoque, patrimônio e frota | Atende | `consultation-catalog.ts`, `native-domain-provider.ts` |
| LEG-04-006 | Obras, cronograma e fiscalização | Atende | coleção `obras` em `native-domain-provider.ts` |
| LEG-04-007 | Orçamento, emendas, balanços e relatórios legais | Atende | `/portal/planejamento`, `document-provider.ts` |
| LEG-04-008 | Tributos e receitas arrecadadas | Atende | coleção `receitas` em `native-provider.ts` |
| LEG-04-009 | Balanço consolidado por entidade | Atende | entidades e visão `consolidado` em `query-contract.ts` |
| LEG-04-010 | Programas e repasses federal/estadual | Atende | coleção `repasses` em `consultation-catalog.ts` |
| LEG-04-011 | Compras mensais e licitações | Atende | coleções `compras` e `licitacoes` |
| LEG-04-012 | Empenhos, liquidações e pagamentos | Atende | coleções `despesas`, `liquidacoes`, `pagamentos` |
| LEG-04-013 | Relação e dados públicos de pessoal | Atende | coleções de pessoal em `consultation-catalog.ts` |
| LEG-04-014 | Diárias com finalidade, data e valor | Atende | coleção `diarias` em `consultation-catalog.ts` |
| LEG-04-015 | Atos de concursos e seleções | Atende | coleções e publicações do Portal |
| LEG-04-016 | Ordenação por códigos e valores | Atende | ordenação por coluna em `portal/portaldatransparencia/page.tsx` |
| LEG-04-017 | Relatórios legais da gestão | Atende | `/portal/planejamento`, publicações |
| LEG-04-018 | Folha parametrizada | Atende | coleção `servidores`, provedor nativo |
| LEG-04-019 | Quantidade por regime | Atende | coleção `quantitativo-pessoal` |
| LEG-04-020 | Vagas criadas e ocupadas | Atende | coleção `vagas` |
| LEG-04-021 | Funcionários por contrato | Atende | coleções de pessoal e filtros por regime |
| LEG-04-022 | Cedidos e recebidos | Atende | coleção `cessoes` |
| LEG-04-023 | Cargos e vagas ocupadas/disponíveis | Atende | coleção `vagas` |
| LEG-04-024 | Inativos e aposentadoria/pensão | Atende | coleção `inativos` |
| LEG-04-025 | Estagiários e período/local | Atende | coleção `estagiarios` |
| LEG-04-026 | Consulta consolidada e por entidade | Atende | `query-contract.ts` |
| LEG-04-027 | Filtro de período | Atende | `query-contract.ts`, filtros públicos |
| LEG-04-028 | Dados sem digitação/importação manual | Atende | `native-provider.ts`, vínculos nativos |
| LEG-04-029 | Gestão de consultas e parâmetros | Atende | `/transparencia/publicacoes` |
| LEG-04-030 | Aviso popup com imagem | Atende | `presentation-settings.ts`, `PublicNotice.tsx` |
| LEG-04-031 | Grupos de consulta adicionais | Atende | consultas customizadas em `presentation-settings.ts` |
| LEG-04-032 | Busca de consultas | Atende | `TransparencyHome.tsx` |
| LEG-04-033 | Consultas com upload ou link | Atende | `PublicationUpload.tsx`, publicação documental |
| LEG-04-034 | Impressão/exportação em formatos diversos | Atende | rota `api/transparencia/consultas/[slug]` |
| LEG-04-035 | Relatórios gerados e anexados | Atende | `publication-storage.ts` |
| LEG-04-036 | Upload de relatórios em vários formatos | Atende | `PublicationUpload.tsx` |
| LEG-04-037 | Ajuda de custo/adiantamento e empenho | Atende | coleção `diarias` |
| LEG-04-038 | Convênios e anexos | Atende | coleção `convenios`, publicações |
| LEG-04-039 | Acessibilidade e Libras | Atende | `/portal/acessibilidade`, `PortalShell.tsx` |
| LEG-04-040 | Dicionário/formato das informações | Atende | endpoint `format=schema` das consultas |
| LEG-04-041 | Mapa do site | Atende | `/portal/portaldatransparencia/mapa` |
| LEG-04-042 | Legislação com filtro de categoria | Atende | `/portal/leis-municipais` |
| LEG-04-043 | Diário Oficial | Atende | coleção `legislacao`, Diário Oficial |
| LEG-04-044 | Licitações por categoria/modalidade | Atende | filtro `modality` em `licitacoes` |
| LEG-04-045 | Área LAI, estrutura, FAQ e pedidos | Atende | `/portal/acesso-informacao` |
| LEG-04-046 | Horário de atendimento | Atende | `presentation-settings.ts` |
| LEG-04-047 | Brasão e endereço | Atende | identidade institucional e `PortalShell.tsx` |
| LEG-04-048 | Modelos de arquivo | Atende | documentos/publicações reutilizáveis |
| LEG-04-049 | Agrupadores de arquivos | Atende | grupos de publicações e consultas |
| LEG-04-050 | Inventário com IP | Atende | `TransparencyAccess` e `/transparencia/acessos` |
| LEG-04-051 | Entidades configuráveis | Atende | `presentation-settings.ts` |
| LEG-04-052 | Ano inicial parametrizável | Atende | `initialYear` em configurações |
| LEG-04-053 | Contador de acessos | Atende | `AccessCounter.tsx` |
| LEG-04-054 | Hints explicativos | Atende | `queries[slug].hint` |
| LEG-04-055 | Ordenação de anexos | Atende | publicação documental ordenada |
| LEG-04-056 | Proteção contra automação | Atende | rate limit por IP/origem na rota pública |
| LEG-04-057 | Link para ouvidoria | Atende | `/portal/ouvidoria` |
| LEG-04-058 | Link e registro de acesso à informação | Atende | `/portal/acesso-informacao` |

## Validação automatizada

`node --conditions=react-server --import tsx --test tests/transparency-consultations.test.ts tests/transparency-native.test.ts` concluiu com 22 testes aprovados.
