# Lote `social-educacao-publico`

Data: 29/10/2026. Referências lidas: `AGENTS.md`, `TABELAS_CONTRATO_EXECUCAO.md`, `Padrão de Tabelas.md` v1.1, plano e inventário. Guia instalado lido: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (composição RSC, props serializáveis e providers).

Revisão de conclusão do código: orientação posterior autoriza scroll em **tablets/celulares**, nunca em notebook/desktop, e disponibiliza `OperationalTablePanel`/`OperationalSurface` pela frente principal. A composição foi atualizada para essa API; a proposta de provider público da primeira entrega foi substituída pela implementação abaixo.

## Resultado e limites da entrega

- **25 estruturas operacionais com configuração implementada:** Social 12, Educação 3 e Público 10. **Uma especial preservada:** cookies.
- Revisão strict adicional: **duas grades de edição do baseline de 32 pontos também convertidas**, itens de requisição Social e partes/frações ITBI. A seção de reconciliação abaixo registra os IDs originais, renderizadores atuais, contratos de envio e testes off-page; não são recontadas nas 25 estruturas tabulares originais.
- **Todas as 25 usam a composição comum, sem fallback HTML.** As dez públicas abrem `OperationalTablePanel`, que fornece `OperationalSurface`, contexto, tokens e header próprios. Social e as três listagens simples de Educação usam o workspace da rota; consultas em páginas mistas e as duas grades do professor abrem painéis operacionais explícitos.
- Código local concluído e API compartilhada disponível na revisão strict. A checagem de tipos dos dez arquivos desta revisão passou com o ambiente Next (`next-env.d.ts`), sem stubs ou alterações em arquivos reservados.
- Mínimos revisados para prévia + acesso integral, com **todas as coleções dinâmicas da Transparência e as nove configurações públicas estáticas testadas pelo distribuidor em 1224px**. Pior caso dinâmico: 15 campos de pessoal + entidade + acesso, mínimo 1208px.
- **Zero estruturas homologadas visualmente.** ESLint e testes de payload não provam encaixe, foco, redimensionamento, zoom ou comportamento em navegador.
- Nenhuma action existente teve assinatura, parâmetros ou retorno alterados. DTOs/consultas/permissões foram conservados. A única troca nas consultas de Construção Civil e Processos foi o literal 20 pela constante comum, mantendo `where`, ordenação, total e recorte Drizzle.

## Composição e arquivos de apoio

| Arquivo | Responsabilidade |
|---|---|
| `src/app/app-domain/social/OperationalList.tsx` | Configuração de domínio em tuplas explícitas; delega tabela, detalhes, larguras e paginação aos primitives comuns. Cada tela declara larguras iniciais/mínimas reais. |
| `src/app/app-domain/educacao/EducationListClient.tsx` | Conserva contrato dos 17 consumidores, filtros, exportação CSV integral e todos os campos; detalhes integrais usam leitura paginada da célula comum. Três rotas simples em workspace e 14 páginas mistas em `OperationalTablePanel`. |
| `src/app/app-domain/educacao/professor/entry-drafts.ts` | Serialização integral de chamada/notas independente do recorte visual. |
| `src/app/app-domain/educacao/professor/entry-drafts.test.ts` | Testes de 41/21 alunos, faltas fora da página, feedback, limpeza explícita, recuperação zero e notas nulas fora da página. |
| `src/app/portal/PublicOperationalList.tsx` | Adaptador público sem autenticação adicional: exclusivamente `OperationalTablePanel` + `OperationalListFrame` + `OperationalTable` + paginação comum. Sem tabela HTML alternativa, detecção de contexto ou fallback. |
| `src/app/portal/public-columns.ts` | Configuração dinâmica da Transparência: mínimos textuais 64px, datas 76px, moeda 88px, entidade 72px e acesso 128px. Todas as colunas preservadas. |
| `src/app/portal/public-columns.test.ts` | Verifica campos e distribuição real de larguras da base em 1224px para todo o catálogo/consolidado e nove configurações públicas estáticas extraídas das páginas. Não substitui medição no navegador. |
| `src/app/portal/PublicRowAction.tsx` | Mantém lançamento de parcela e links em diálogo acessível fora da altura da linha. |
| `src/app/portal/PublicTableViews.tsx` | Licitações/contratos apresentados um por vez; conserva entrada direta e navegação por `#licitacoes`/`#contratos`. |
| `src/components/app-ui/operational/modules/social-educacao-publico.ts` | Manifesto `OperationalModuleConfig[]`: 11 rotas Social e três rotas simples Educação; menus/destinos/`exact` preservados. `operationalPanelRoutes` documenta 14 páginas mistas Educação e dez rotas públicas (incluindo ITBI/novo), sem registrá-las no shell administrativo. `operationalEditingGrades` associa as duas grades adicionais ao baseline e a seus renderizadores reais. |
| `src/app/app-domain/social/requisicoes/BenefitRequestItemsEditor.tsx` e `benefit-item-drafts.ts` | Edição de benefícios solicitados em painel/tabela 20; estado integral em `BenefitWorkflowClient`, edição por ID estável, validação de itens fora da página e serialização sem IDs de UI. |
| `src/app/portal/tributario/itbi/novo/OnlineItbiPartyEditor.tsx` e `party-drafts.ts` | Editor compartilhado de transmitentes/adquirentes, painel/tabela 20; estado integral no pai e construção coerente de payload a partir de `FormData` mais todos os titulares, sem arredondar participações. |
| Layouts `social/layout.tsx` e `educacao/layout.tsx` | Hook opcional: só retornam filhos quando o workspace já existe; demais rotas mantêm o menu original. |

## Social — 12 estruturas

Base de arquivos: `src/app/app-domain/social/`. Estado **implementada**, com integração compartilhada B01. Busca/filtros precedem o recorte; mudança de filtro retorna à página 1 e página inválida é limitada ao total disponível. Textos integrais são enviados em `values`; colunas de ação têm limites fixos suficientes para os controles. Os mínimos das variantes permanecem entre 270 e 790px, abaixo do orçamento de 1224px, sem necessidade de reduzir a fonte.

| # | Arquivo / rota | Colunas e variantes preservadas | Origem / paginação / alterações |
|---|---|---|---|
| S01 | `atendimentos/AtendimentosClient.tsx` · `/social/atendimentos` | Data/hora, usuário/família, tipo, unidade, técnico, sigilo, ações. Mínimo declarado total 624px. | DTO da página com leituras Drizzle; cliente 20. Filtros tipo/busca e diálogo de relato mantidos. Sigilo continua textual, sem depender de cor. |
| S02 | `configuracoes/SocialCatalogsClient.tsx` · `/social/configuracoes` · catálogos | Nome, descrição, situação, editar. Mínimo 425px. | Drizzle no servidor; cliente 20. Catálogo/busca/situação mantidos; edição e cadastro em diálogo, incluindo equipamentos autorizados de vulnerabilidade. |
| S03 | Mesmo arquivo/rota · vigências | Início da vigência e valor alinhado à direita. Mínimo 270px. | Histórico Drizzle integral recebido; cliente 20. Visão própria selecionável, sem duas tabelas simultâneas. Registro de vigência mantém datas/valores e histórico. |
| S04 | `encaminhamentos/ReferralClient.tsx` · `/social/encaminhamentos` | Pessoa/família, destino, equipamento, situação, detalhes/retorno; na rede: órgão, tipo, telefone, situação, editar. Mínimo 570px. | Drizzle/DTO existentes; cliente 20 por visão. Busca, contrarreferência condicional, edição de órgão e impressão de comprovante mantidos. |
| S05 | `familias/FamiliasClient.tsx` · `/social/familias` | Responsável, NIS, código familiar, renda, status, editar/ativar/inativar. Mínimo 640px. | Estado cliente originado em Drizzle; 20. Mutações locais e filtros mantidos. Não se ocultam mais renda/código/status por breakpoint. |
| S06 | `pessoas/[id]/SocialPersonClient.tsx` · `/social/pessoas/[id]` | Data, registro, equipamento, situação ou sigilo, ações; financeiro também valor separado de situação. Mínimos 580/680px. | Drizzle e política de acesso existentes; cliente 20 para fatos, lançamentos e atendimentos. Dados pessoais, competência e totais filtrados não cancelados acessíveis em sobreposição; encerrar/cancelar/detalhes preservados. |
| S07 | `pessoas/page.tsx` · `/social/pessoas` | Pessoa/nome social, CPF, NIS, situação, link para prontuário. Mínimo 540px. | `listSocialPeoplePage` mantida: total filtrado, ordem nome/id, `limit(20)`/offset no repositório. `OperationalLinkPagination` conserva `q`. |
| S08 | `profissionais/SocialProfessionalsClient.tsx` · `/social/profissionais` | Profissional, equipamento, cargo, expediente, situação, editar. Mínimo 570px. | Drizzle/DTO existentes; cliente 20. Escopos, dias, vínculo, RMA e permissões de gravação não foram alterados. |
| S09 | `prontuario/ProntuarioClient.tsx` · `/social/prontuario` | Atualização, unidade, pessoa/família, tipo, sigilo separado, status, editar/ativar. Mínimo 700px. | Drizzle/estado cliente; 20. Consulta local CadÚnico/RMA transferida para diálogo acionado no header, preservando busca/resultado/registro e actions. |
| S10 | `requisicoes/BenefitWorkflowClient.tsx` · `/social/requisicoes` | Requisições: família e benefício separados, equipamento, situação, quantidade e valor separados, detalhes/avaliar/entregar. Estoque: benefício, equipamento, saldo/unidades. Cotas: benefício, equipamento, total, utilizado, saldo, início e fim separados. Mínimos 790/350/600px. | Drizzle/DTO existentes; cliente 20 por visão. Avaliação condicional, autorização de regras/cotas, cancelamento no detalhe, comprovante, entrega, entrada e itens não salvos do formulário mantidos. Cálculos monetários em centavos existentes mantidos. |
| S11 | `unidades/UnidadesClient.tsx` · `/social/unidades` | Unidade, tipo, telefone, local, responsável, status, editar/ativar. Mínimo 690px. | Drizzle/estado cliente; 20. Edição completa de unidade, sigilo, patrimônio, responsável e coordenadas mantida. |
| S12 | `visitas/VisitasClient.tsx` · `/social/visitas` | Família, local, técnico, data, situação, detalhes. Mínimo 574px. | Drizzle/DTO existentes; cliente 20. Busca por objetivo/técnico/local/família, filtro e diálogo de objetivo mantidos. |

As larguras acima são **configuração de código**, sem medição de viewport. O diagnóstico de mínimos incompatíveis permanece responsabilidade da tabela comum; não houve ocultação de campos para simular encaixe.

## Educação — 3 estruturas, múltiplos consumidores

Base de arquivos: `src/app/app-domain/educacao/`. Estado **implementada**. Conflito local de páginas mistas resolvido por painéis próprios; integração compartilhada B01 e homologação visual permanecem com a frente principal.

| # | Estrutura | Colunas / origem / paginação / edição |
|---|---|---|
| E01 | `EducationListClient.tsx` | Preserva **todas as colunas declaradas pelos consumidores**, alinhamento, status, detalhes e ações. `responsive` permanece aceito, sem ocultar campos. Largura inicial/mínima: narrow 90/64, medium 140/80 e demais 210/96; ficha integral 150/80 e ações opcionais 80 fixos. A ficha vai em `values.__detail` e usa leitura integral paginada da tabela comum, substituindo o antigo diálogo com scroll desktop. Dados Drizzle continuam no servidor; busca/filtro antes de cliente 20 e CSV integral mantidos. Páginas mistas abrem painel próprio. |
| E02 | `professor/ProfessorEntryGrids.tsx` · chamada | Ordem, aluno, presença. Mínimo 305px. `OperationalTablePanel`/Surface próprios; cliente 20 e ordem com offset. Presença por turma/aluno e **metadados da aula por turma**, mantidos no componente pai dos painéis. Fechar/desmontar/reabrir o conteúdo não elimina rascunhos. Envio serializa **todos** os alunos; disciplina/data/etapa/aulas/conteúdo/observações continuam disponíveis. |
| E03 | Mesmo arquivo · notas | Aluno, nota, conceito, ausente, recuperação. Mínimo 530px. Painel próprio e cliente 20, controles em `cells`. Estado por avaliação/aluno no pai; preservado ao paginar/trocar avaliação/fechar. Envio integral conserva feedback e notas antigas, inclusive **null**, fora da página; zero e limpeza explícita não são confundidos com ausência de edição. Formulário de envio separado da paginação evita `<form>` aninhado; salvar fica no header da Surface. |

### Rotas consumidoras de E01 (não recontadas como estruturas)

| Rota | Colunas do consumidor |
|---|---|
| `/educacao/academico` | Escola, período, turma, tipo, alunos/vagas, vínculos, situação. |
| `/educacao/alunos` | Código, aluno, CPF, escola, turma, situação. |
| `/educacao/biblioteca` | Título, tombo, aluno, vencimento, situação. |
| `/educacao/calendario` | Início, término, evento, tipo. |
| `/educacao/documentos` | Emissão, documento, aluno, arquivo, emitido por. |
| `/educacao/educacenso` | Data, operação, competência, arquivo, resumo, situação. |
| `/educacao/escolas` | Escola, INEP, direção, vagas, turmas, alunos, situação. |
| `/educacao/matriculas` | Matrícula, aluno, escola, turma, ano, situação. |
| `/educacao/merenda` | Data, escola, material, tipo, quantidade, saldo. |
| `/educacao/portal-interativo` | Atividade, aluno, pontuação, acertos, data. |
| `/educacao/portal-responsavel` | Aluno, tipo, escola/componente, turma, detalhe, situação. |
| `/educacao/pre-matricula` | Protocolo, candidato, escola, processo, posição, situação. |
| `/educacao/professor` | Data, registro, turma, disciplina, descrição, situação; mais E02/E03 em diálogos. |
| `/educacao/professores` | Professor, matrícula, escolas, turmas, situação. |
| `/educacao/recursos-escolares` | Plano, escola, conta, total, situação. |
| `/educacao/suporte` | Protocolo, assunto, solicitante, abertura, situação. |
| `/educacao/transporte` | Rota, veículo, início, eventos, situação. |

Não foram modificadas as queries, limites de leitura preexistentes ou schemas das páginas consumidoras. A estrutura compartilhada é contada uma vez; as duas grades editáveis são contadas separadamente.

## Público — 10 estruturas + 1 especial

Base de arquivos: `src/app/portal/`. **Todas as dez implementadas, sem fallback.** Cada listagem abre painel full-screen explícito, com header/contexto/tokens da Surface comum; não depende do workspace administrativo. `PortalShell`, navegação institucional, acessibilidade, identidade, consentimento, gráficos e metadados são preservados na página de origem. Não há `100dvh` inline somado ao header público. Nenhum login foi adicionado às consultas abertas nem removido das áreas pessoais/profissionais.

| # | Arquivo / rota | Colunas / origem / paginação / preservação |
|---|---|---|
| P01 | `construcao-civil/page.tsx` · `/portal/construcao-civil` | Protocolo, categoria, análise, abrir. Mínimo 450px. Drizzle servidor 20 com ordenação data/id, total e busca originais. Preserva identidade profissional, vínculos e abertura autorizada. |
| P02 | `convenentes/page.tsx` · `/portal/convenentes` | Contrato, parcela, competência UTC, valor BRL, operações de origem, lançamento. Mínimo 640px. `listOwnPartnerDiscounts` mantida; parcelas dos contratos autorizados em um conjunto paginável cliente 20, com número do contrato explícito em cada linha. Grants, instruções, reserva, chave de request e folha autorizada mantidos; lançamento em diálogo fora da linha. |
| P03 | `licitacoes-e-contratos/page.tsx` · `#licitacoes` | Licitação, modalidade, situação, processo, objeto integral, sessão. Mínimo 600px. `getPublicBiddings` Drizzle existente; cliente 20 sobre o conjunto retornado; CSV integral na API original. Limite de leitura de 100 da origem não foi alterado nem chamado de total global. |
| P04 | Mesmo arquivo · `#contratos` | Contrato, situação, fornecedor, documento mascarado, início, fim, valor atualizado. Mínimo 710px. `getPublicContracts` existente; cliente 20. Máscara, UTC, CSV e ordem preservados. Visão por hash evita duas tabelas simultâneas e mantém links diretos. |
| P05 | `minha-area/processos/page.tsx` · `/portal/minha-area/processos` | Protocolo, serviço separado, situação, setor, abertura, prazo, abrir. Mínimo 675px. `getCitizenAccount`/escopo e `listCitizenProcesses` mantidos; Drizzle servidor 20, busca/total filtrado mantidos. Ajuda de vazio/contato e solicitações preservadas. |
| P06 | `planejamento/page.tsx` · `/portal/planejamento` | Entidade, exercício separado, documento, completude, SHA-256 integral, publicação, download/formato. Mínimo 690px. `listPlanningPublications` e versão/hash/origem mantidos; servidor 20 com year/entity preservados pela paginação. |
| P07 | `portaldatransparencia/estatisticas/page.tsx` | Entidade, canal, recebidos, atendidos, indeferidos, parciais, sem classificação, identificados, anônimos. Mínimo **760px**, revisado após falha real em 800×600; fonte e nove campos preservados, com detalhes condicionais nos cabeçalhos/valores. Mesmas agregações Drizzle; cliente 20, quatro linhas legítimas. Somente agregados chegam ao client. A tabela abre painel; satisfação/feedback continuam na página contextual. |
| P08 | `portaldatransparencia/page.tsx` · somente variante de consulta | Todas as colunas, entidade no consolidado e acesso/detalhes/links. Mínimos por tipo: texto 64, data 76, moeda 88, entidade 72 e acesso 128px; pior caso 1208px. `runTransparencyConsultation` e fontes mantidas; **pageSize=20 antes do parse da tela**, sem mudar schema/API/exportação. Ordenação GET preserva parâmetros e volta à página 1; paginação conserva fonte/entidade/ano/filtros/ordem. Menu, proveniência, totais, exportações integrais, feedback e home permanecem na origem. Link de detalhes usa navegação de documento para sair do painel e alcançar a âncora de detalhes/eventos/itens, sem ficar encoberto pelo diálogo. |
| P09 | `portaldatransparencia/painel/page.tsx` | Mês, arrecadado, empenhado na emissão, pago na data própria. Mínimo 530px. Mesmas fontes/agregações/Decimal; cliente 20 com 12 meses reais. Tabela equivalente abre painel próprio; gráfico, oito indicadores, avisos de fonte, critérios contábeis e navegação continuam na origem. |
| P10 | `tributario/page.tsx` · `/portal/tributario` | Lançamento, tributo, exercício, situação, valor, pago confirmado, saldo, guias integrais compostas. Mínimo 850px. `readTaxpayerAccount`, vínculos e valores conciliados mantidos; cliente 20 após consulta de contribuinte/ano. Extrato abre painel; imóveis/empresas/certidões/alvarás/dívida/parcelamentos ficam preservados na página de contexto e documentos próprios continuam acessíveis. |
| PX | `privacidade/page.tsx` · `/portal/privacidade` | **Especial preservada sem edição:** categoria, uso nesta etapa, controle. Documento e consentimento não recebem paginação operacional. |

## Integração e verificação restantes

### B01 — resolvido na revisão strict: API compartilhada

Frame, filtros/paginação comuns, Surface/provider/header, hook opcional e controles `OperationalRow.cells` estão disponíveis. O lote mantém rascunhos nos pais dos painéis, porque o conteúdo pode desmontar ao fechar. A checagem de tipos direcionada passou com essa API real, incluindo os dois novos editores e `planejamento/page.tsx`.

Só as rotas de `operationalModules` representam workspaces administrativos integrais; `operationalPanelRoutes` é metadado de cobertura. Integração global, build e homologação ficam com o principal. A política permanece scroll autorizado em tablet/celular, nunca notebook/desktop; nenhum breakpoint local concede a exceção a desktop. O lote não editou shared, `ClientLayout` ou `ModuleShell`.

### B02 — resolvido no código: contexto público e orçamento vertical

`PublicOperationalList` usa **incondicionalmente** `OperationalTablePanel`. O painel fornece sua própria `OperationalSurface`, sem navegação administrativa e sem autenticação; a identidade e a navegação institucional continuam no `PortalShell` atrás da consulta explícita. Não há mais detecção opcional de contexto nem ramo `<table>` HTML no adaptador.

O `100dvh` pertence ao diálogo full-screen da base, não a um contêiner inline sob o header institucional. Abrir/fechar a consulta preserva gráficos, menus, formulários, dados de contexto e destinos públicos. As dez tabelas não são registradas no `ClientLayout` administrativo. A tabela de cookies continua especial e intacta.

Aceitação de geometria/foco continua dependente da integração/navegador, mas a solução de composição já está implementada para os dez pontos, sem tabela velha alternativa.

### B03 — resolvido na revisão strict: dependências

Após `npm ci` da frente principal, `drizzle-orm` 0.45.4 está instalado e os tipos locais puderam ser verificados. O bloqueio da primeira entrega não permanece. Nenhum schema/query foi alterado e os checks não abrem conexão com DB.

### B04 — resolvido no código: páginas mistas

- Estatísticas conserva satisfação e `PageFeedbackSummary` abaixo dos agregados.
- Painel financeiro conserva oito indicadores e gráfico além da tabela mensal equivalente.
- Consulta de transparência conserva menu por assunto, proveniência, filtros, exportações, totais, feedback e detalhe por âncora.
- Área tributária conserva imóveis, empresas, certidões, alvarás, dívida e parcelamentos além do extrato.
- Educação conserva painéis/formulários de criação/importação/documentos e atividades do aluno/responsável nas páginas consumidoras.

Essas regiões têm função real e foram preservadas. A listagem abre agora uma área operacional isolada de tela cheia, em vez de compartilhar altura com gráficos ou formulários. Em Educação, 14 rotas mistas usam painel; escolas, professores e calendário mantêm listagem direta. Chamada/notas usam dois painéis independentes. Não há dependência de migrar/remover os formulários de negócio para caberem 20 linhas na área da tabela. A geometria final será medida após integração.

### B05 — detalhes integrais e matriz visual

A ficha integral de Educação deixou o antigo diálogo com scroll: todos os campos são encaminhados à coluna de detalhes, usando a leitura integral paginada da célula comum. Valores extensos de consulta pública, hashes, guias, descrições e observações continuam integrais em `values`; nenhuma redução de fonte ou ocultação de campo foi introduzida para atingir 1224px. Diálogos de ações de negócio e retorno de foco permanecem itens de regressão visual, não evidência de aprovação antecipada.

Após a integração, executar a matriz (inclusive 800×600, tablet/celular com scroll autorizado, notebook/desktop sem scroll e zoom 125/200%), 21 registros, última página, vazio/erro/carregamento, arraste/teclado/Home, detalhes/foco e ações com perfis distintos. Registrar dimensões reais antes de declarar telas validadas. O teste do algoritmo em 1224px não demonstra sozinho o encaixe vertical nem os limites visuais dos controles.

## Verificações executadas

1. **ESLint direcionado ao lote:** passou, exit 0, sem erros/warnings ESLint. Incluiu arquivos modificados de Social/Educação/Público e arquivos novos/manifesto. Avisos de normalização LF/CRLF são do Git ao listar o diff, não diagnósticos ESLint.
2. **Testes finais:** `node --import tsx --test src/app/portal/public-columns.test.ts src/app/app-domain/educacao/professor/entry-drafts.test.ts` — **5 passaram**: três de payload integral/41 alunos/nulos/zero e dois de preservação de campos/distribuição em 1224px para todo o catálogo público e nove configurações estáticas. Não são homologação visual.
3. **Tipos:** na revisão strict, diagnóstico sintático/semântico direcionado aos dez arquivos alterados/novos, com `next-env.d.ts`, **zero diagnósticos**. A tentativa anterior sem os tipos globais Next apontava apenas os imports CSS e foi corrigida no comando de verificação. Não foi executado build ou typecheck global pelo lote.
4. **Inspeção residual final:** nenhum `<table>`/fallback/detecção opcional de contexto em `PublicOperationalList`; grep do portal encontrou **somente** a tabela especial de cookies. Não há tabela HTML/`ErpListFrame`/`ErpPagination` operacional restante em Social/Educação. Os dez pontos públicos usam painel + tabela comum, sem alternativa antiga.
   Listas em cartões/mensagens de outras páginas públicas ainda usam `ErpPagination`; não são os dez pontos tabulares deste inventário e não foram reclassificadas como tabelas.
   `git diff --check` direcionado ao lote passou, sem erros de whitespace.
5. Consumidores localizados antes das mudanças; assinaturas existentes conservadas. Sem substituição em massa, mutações/seed no DB, commit ou push. Mudanças concorrentes fora do lote foram apenas observadas no status e não foram alteradas.

## Revisão strict — duas grades adicionais de edição

Instrução adicional: tratar as duas grades deste escopo identificadas no auditor strict; a terceira, de Saúde, pertence a outro lote. Leituras adicionais realizadas: guia Next instalado `01-app/02-guides/forms.md`, consumidores dos clients, actions e contratos de Social/ITBI, API real de Panel/ListFrame/Table e leitura do contrato `operationalEditingGrades` no auditor. Assinaturas exportadas dos clients e das actions preservadas.

| Grade / ID baseline | Destino / rota / colunas | Preservação e situação |
|---|---|---|
| `social/requisicoes/BenefitWorkflowClient.tsx:93:481` · `items.map` | `social/requisicoes/BenefitRequestItemsEditor.tsx` · `/social/requisicoes` · item, benefício, quantidade, valor financeiro, remover. Mínimo total 546px; no máximo 20 linhas. | **Implementada e reconciliada estaticamente.** `items` permanece no pai, com `draftId` estável. Filtro/paginação/remoção usam a identidade, sem substituir o array pelo recorte. Limite 30, modo VALUE, seleção de benefício e quantidade/valor preservados. Campo oculto `items` e chamada da action usam o mesmo serializador integral sem `draftId`. Validação visita todos os itens, mesmo com o painel fechado; erro não elimina o rascunho. Limpeza só depois de requisição salva com sucesso. |
| `src/app/portal/tributario/itbi/novo/OnlineItbiClient.tsx:18:217` · `partyEditor` / `rows.map` | `src/app/portal/tributario/itbi/novo/OnlineItbiPartyEditor.tsx` · `/portal/tributario/itbi/novo` · parte, CPF/CNPJ, participação na fração (%), remover. Mínimo total 476px; no máximo 20 linhas. Um renderizador atende transmitentes e adquirentes. | **Implementada e reconciliada estaticamente.** `sellers`/`buyers` permanecem no pai; filtro e edição por ID não perdem titulares nem alteram os outros percentuais. Limite 100 por grupo, total visível de participações e precisão de seis casas preservados; validação não arredonda o payload. Formulário principal usa `onSubmit`, captura `FormData` e junta todos os titulares/participações. Modalidade/aliquota exibida, valor, fração, devedor, versões de política/imóvel, formulários adicionais, contestação e anexos continuam no protocolo. Erro de envio não aciona reset automático dos campos do formulário. |

As grades são painéis com Surface/contexto próprios. Nenhum `<form>` de gravação foi colocado dentro do painel: a paginação comum impede propagação de seu submit, e a gravação continua no formulário pai com o array completo. Os novos editores só mantêm estado de visualização (busca/página); os dados não salvos não ficam nos filhos desmontáveis. Não houve alteração de autenticação, aliquotas, rateio de titulares ou actions/DB.

### Correção de tipos de Planejamento

`src/app/portal/planejamento/page.tsx`: `values.hash` agora recebe `record.hash ?? "—"`, respeitando `OperationalRow.values: Record<string, string>` sem alterar a origem/hash existente.

### Evidência strict desta revisão

- **ESLint:** passou nos dez arquivos desta revisão.
- **Tipos próprios:** zero diagnósticos nos dez arquivos (roots com `next-env.d.ts`, `noEmit`, sem incremental/artefatos). O principal mantém o check global.
- **Seis testes novos de rascunhos off-page:** três Social e três ITBI. Exercitam 30 itens, 41 transmitentes/21 adquirentes, edição filtrada na página 2/3, remoção antes de editar, estado imutável, envio integral em JSON/FormData, modalidades/fração/devedor/percentuais e erro de campo obrigatório/quantidade/valor/participação fora da página.
- **Auditor real, somente leitura:** `verify-operational-coverage.mjs --json`, filtrado aos dois IDs deste lote, retornou **`replaced-review` para ambos, `remaining: []`, renderizador final `OperationalTable`, consumidores reais e `editingReviewErrors: []` para essas associações**. Não é declaração de aprovação global do lote de Saúde nem de homologação geométrica.
- As primeiras tentativas de tipos/auditoria em paralelo atingiram 120s; a reexecução de tipos somente nos próprios arquivos e a auditoria com prazo maior concluíram. Não há bloqueio local pendente identificado por esses checks.
- Sem edição de shared/scanner/`ClientLayout`, build, operações de DB, commit ou push.

**Situação final do lote:** **25 estruturas operacionais implementadas + duas grades adicionais de edição reconciliadas**, todas com tabela comum e paginação 20; **1 especial preservada**. Público sem fallback e rascunhos integrais preservados. Integração global e homologação visual permanecem com a frente principal; esta evidência distingue a aprovação estática das medições em navegador.

## Correção das duas falhas encontradas nas páginas públicas reais

Referência recebida: [`rotas-publicas-execucao.md`](rotas-publicas-execucao.md), ensaio de produção de 29/10/2026, nove cenários. Esta seção registra **correção de fonte + reprodução antes/depois em Chromium isolado**, não uma nova execução daquele build de produção. O relatório original do agente de rotas/autenticação permanece com seus resultados históricos.

### Alterações desta revisão

1. `src/app/portal/portaldatransparencia/estatisticas/page.tsx:24`: mínimos das nove colunas passaram de 880px para **760px**. Nova sequência: `90, 80, 80, 80, 90, 70, 100, 90, 80`. Há 40px de margem no orçamento de 800px. Nenhum campo, query, rótulo, total ou fonte foi removido/reduzido; a tabela comum continua oferecendo título/valor integral quando a prévia não cabe.
2. `src/components/portal-institucional/PortalShell.tsx:500,511,551,561`: **autorização adicional exclusiva do principal para este arquivo**. Arquivo inteiro e consumidores/exportações inspecionados; assinaturas e destinos conservados. Menu desktop usa `flex-wrap` como proteção de espaço/ampliação de texto, padding horizontal dos links `px-2 → px-1.5` e do mapa `px-4 → px-3`. Não foi adicionado `overflow:hidden`, clipping, redução de fonte ou remoção de item. Setas, abertura por foco, Escape e menu compacto continuam disponíveis.
3. `src/app/portal/public-columns.test.ts`: a regressão das nove configurações estáticas agora exige **Estatísticas em 800px com os nove campos**, além do orçamento de 1224px para as demais configurações. O teste anterior de 1224px sozinho não detectava a falha real de 800px.

### Método do ensaio isolado

- Chromium **156.0.8078.73**, desktop Windows, fonte **Inter** efetiva.
- Renderiza o **PortalShell real completo** (acessibilidade, header, menu e footer) e `PublicOperationalList`/`OperationalTablePanel`/`OperationalTable` reais. Next Link/Image/navigation têm adaptadores locais; nenhuma página RSC, sessão, action ou DB é executada/importada.
- CSS global/Tailwind e CSS Modules são compilados dos **fontes atuais**. Somente os arquivos de fonte Inter em cache de `next/font` são reutilizados; não se usa o CSS antigo do build como implementação do fix.
- Configuração de Estatísticas é extraída por AST do atributo `columns` da página corrigida, sem copiar manualmente seus mínimos.
- Três contextos de pathname (`licitacoes-e-contratos`, `planejamento`, `portaldatransparencia/estatisticas`) × três viewports (1280×720, 1366×768, 800×600): nove medições do **shell isolado**, não navegações reais nessas páginas.
- O corpo controlado tem quatro agregados zerados para o teste correspondente ao estado observado na produção; um caso adicional usa **21 registros artificiais somente no fixture**, para verificar 20+1 e a linha 20. Não houve inserção de dados no banco.
- Servidor HTTP mínimo e navegador próprios foram encerrados no `finally`. Não se iniciou Next/dev/start, build, runner de produção ou autenticação, e nenhum servidor existente foi encerrado.

### Antes/depois medido, sem mascaramento

| Verificação | Antes da correção | Depois da correção |
|---|---|---|
| Documento/shell a 1280px, três contextos | `scrollWidth - innerWidth = 6` | **0px** nos três |
| UL do menu a 1280px | caixa 1248px, `scrollWidth=1270` | **caixa e scrollWidth 1248px** |
| Último item do menu | `x=1232.578125`, largura 53px, `right=1285.578125` | **x=1219, largura 45px, right=1264**, dentro do UL e viewport |
| Links visíveis desktop | 11 itens, último fora da caixa | **11 itens contidos, uma linha em 1280px**, fonte 13px, altura 45.5px; mapa com link de 44px de largura |
| Documento em 1366×768 e 800×600 | 0px horizontal | **0px** nos seis contextos |
| Estatísticas desktop 800×600 | `fit=conflict`, mínimo 880×504px, tabela ausente | **`fit=ready`, mínimo 760×504px**, tabela renderizada com largura 800px |
| Estatísticas: campos/linhas | zero renderizados devido ao conflito | **9 colunas, 0 ocultas, 4 linhas de 24px, fonte Inter 13px** |
| Corpo e rodapé a 800×600 | corpo `(0,68,800,504)`, rodapé `(0,572,800,28)` | Mesmas coordenadas; overflow X/Y do corpo **0/0**, rodapé até `bottom=600` |
| Cabeçalhos longos | conflito bloqueava a consulta | `Sem classificação` e `Identificados` têm prévia + **acionador de título integral**, sem ocultar campos |
| 21 registros controlados | não executado no antes | **20 na primeira página + 1 na segunda**; linha 20 em `y=548, bottom=572`, sem ultrapassar corpo/rodapé |

No shell fechado, HTML/body/nav/UL permaneceram com `overflow-x:visible`; não foi a trava de scroll do modal que eliminou os 6px. A medição de documento é feita antes de abrir o painel, separadamente da medição da tabela.

Verificações adicionais aprovadas:

- Ampliação de texto do portal para **125%** em 1280px: fonte do menu 16.25px, todos os 11 itens contidos em duas linhas, sem overflow horizontal ou truncamento de rótulos.
- Os **sete submenus** foram abertos por foco, expondo os 41 destinos esperados no conjunto, sem overflow horizontal; Escape fecha normalmente.
- Menu compacto aberto em 800px: **11 links principais visíveis**, todos com altura de toque **44px**, sem overflow horizontal.
- Fechar o painel restaurou foco ao acionador real. Zero erros JavaScript no ensaio final.

### Artefatos exatos para o principal e o agente de rotas/autenticação

Diretório: `C:\Users\thiag\AppData\Local\Temp\opencode\`

- Harness isolado: `portal-regression-isolated.mjs`.
- Repro antes: `portal-regression-isolated-before-2026-10-29T15-20-20-156Z.json`.
- **Resultado após correção, passou:** `portal-regression-isolated-after-2026-10-29T15-21-19-481Z.json`.
- Screenshot shell 1280px: `portal-regression-isolated-after-2026-10-29T15-21-19-481Z-shell-1280.png`.
- Screenshot Estatísticas 800×600: `portal-regression-isolated-after-2026-10-29T15-21-19-481Z-stats-800.png`.
- As duas screenshots equivalentes `before-2026-10-29T15-20-20-156Z-*` também foram preservadas.

SHA-256 dos fontes medidos após correção:

- `PortalShell.tsx`: `a41e894ce86f1849358e8af6f52a930482cc2ced9c995eb9fb437f78c6e9994c`.
- `estatisticas/page.tsx`: `9e570822ac8fa74219aa934704b8263ec15133542d0b5182b62920f64d48f2ae`.
- O JSON registra também hashes da cadeia importada e do CSS/fonte usados no fixture.

ESLint e tipos próprios passaram nos arquivos de aplicação corrigidos; a checagem de tipos usa `next-env.d.ts`, `noEmit` e sem artefatos incrementais. Os dois testes de colunas passaram, incluindo a nova asserção de 800px. `git diff --check` é executado para os arquivos desta revisão.

**Próximo gate pertence ao principal/agente de rotas:** gerar/confirmar um novo build e repetir os cenários afetados no runner de páginas reais, revisando individualmente seus hashes de fonte. O build antigo conserva as falhas históricas; a prova isolada não é apresentada como HTTP/DB/autenticação ou homologação das páginas reais após build.
