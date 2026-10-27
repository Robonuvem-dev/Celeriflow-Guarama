# Plano de melhorias — Portal da Transparência CeleriFlow

**Data:** 19/10/2026  
**Status:** funcionalidades das etapas de implementação entregues; validações técnicas concluídas, incluindo build de produção  
**Referência:** `docs/ANALISE_FRONTEND_PORTAL_TRANSPARENCIA_PAU_DOS_FERROS (1).md`  
**Base de diagnóstico:** leitura do documento, inspeção do código atual e análise de cinco capturas da referência em `docs/imagens`. As capturas permitem confirmar a composição visual desktop da referência; aparência renderizada do CeleriFlow, dados em produção, acessibilidade e desempenho ainda precisam de medição no navegador.

## 1. Recomendação executiva

Evoluir o portal para uma experiência de duas camadas:

1. **Página inicial de descoberta:** acolhimento, busca, atalhos e catálogo organizado pelos assuntos do cidadão.
2. **Área de consulta:** filtros, resultados, detalhamento, procedência e exportações já disponíveis.

O maior ganho está em facilitar a descoberta das informações. Hoje, o acesso sem parâmetros abre a consulta de publicações e apresenta menus, filtros e opções técnicas antes de explicar os caminhos possíveis.

O documento de referência oferece uma boa arquitetura de informação. As capturas adicionadas confirmam o uso de painéis temáticos, cartões com ícones e grades diferentes por seção. Valores exatos de cores, fontes, dimensões e breakpoints continuam sem medição por DevTools. A aplicação deve usar a identidade institucional existente no CeleriFlow. O complemento visual da seção 14 atualiza as decisões do plano a partir dessas imagens.

**Primeira entrega recomendada:** página inicial temática, navegação clara para as consultas existentes e revisão responsiva/acessível dessa jornada.

## 2. Diagnóstico: o que já existe e o que melhorar

| Frente | Evidência no projeto | Melhoria proposta | Prioridade |
|---|---|---|---|
| Entrada do portal | `src/app/portal/portaldatransparencia/page.tsx` assume `view=publicacoes` | Exibir uma página inicial orientada por assuntos quando o acesso não indicar uma consulta | P0 |
| Identidade institucional | `src/app/portal/layout.tsx` já aplica `PortalShell` | Reutilizar cabeçalho, rodapé e utilitários; alinhar a apresentação da transparência | P0 |
| Catálogo temático | `consultation-catalog.ts` já tem título, grupo e descrição; `publishedTransparencyCatalog` aplica publicação e ordem | Transformar o catálogo publicado em seções e cartões de acesso | P0 |
| Navegação das consultas | `ConsultationMenu.tsx` agrupa assuntos e filtra nomes/grupos | Manter navegação contextual e melhorar sua apresentação em telas pequenas | P1 |
| Pesquisa | Menu filtra consultas; campo `search` pesquisa dentro da coleção selecionada | Distinguir localizar assunto, pesquisar registros e pesquisar documentos | P0/P1 |
| Filtros e exportações | Contrato de URL, filtros específicos, paginação e sete formatos já implementados | Reduzir densidade inicial e melhorar hierarquia, sem perder recursos | P1 |
| Fontes dos dados | Há documentos, registros nativos, API de referência e exemplos fictícios | Tornar origem e contexto compreensíveis antes e depois do acesso | P0 |
| Atendimento ao cidadão | Rotas de e-SIC e ouvidoria e componente de informações do serviço | Dar destaque aos canais e explicar qual usar | P0 |
| Acessibilidade | `PortalShell` já oferece salto ao conteúdo, contraste e escala de texto; menus têm estados ARIA | Auditar a jornada completa e corrigir problemas comprovados | P0 |
| Avaliação | Estatísticas agregam `transparencySatisfaction`; avaliação passa pelo fluxo de atendimento | Criar avaliação específica da página, independente do protocolo de atendimento | P2 |
| Gestão editorial | Configuração de consultas, consultas documentais personalizadas e publicações já existem | Acrescentar gestão das seções e destinos que o catálogo atual não representa | P1/P2 |
| SEO | Layout tem metadados institucionais; sitemap atual lista páginas de marketing | Definir metadados e indexação próprios do portal municipal | P1 |
| Desempenho | Página de consulta usa `force-dynamic` e carrega dados da consulta na entrada | Separar o custo da descoberta do custo de consultar registros | P1 |

**P0:** essencial para a primeira entrega. **P1:** evolução seguinte. **P2:** expansão com dependências de dados ou governança.

### Pontos que exigem atenção no desenho

- O catálogo publicado indica que uma consulta está habilitada, mas não comprova disponibilidade de dados para toda combinação de entidade, fonte e exercício. O cartão não deve prometer conteúdo atualizado sem evidência.
- `defaultTransparencySettings()` usa `API_IBEMA` como fonte padrão. Isso é um valor padrão do código, não confirmação da configuração ativa do município. A primeira etapa precisa conferir a configuração real.
- O portal já distingue falha de fonte, conjunto vazio e ausência de publicação; essa informação deve continuar clara no novo desenho.
- O modelo atual usa configuração da instância e entidades Prefeitura/Câmara. A proposta de `tenantId` do documento só deve ser adotada após confirmar a arquitetura de isolamento do projeto.

## 3. Arquitetura de informação proposta

### Página inicial

```text
Cabeçalho institucional e recursos de acessibilidade existentes
Breadcrumb: Início / Transparência
H1: Portal da Transparência
Texto: Consulte como os recursos públicos são arrecadados e utilizados.
Busca: “O que você procura?” + ação “Buscar assuntos”
Atalhos: Receitas | Despesas | Licitações | Contratos | Servidores | e-SIC
Seções temáticas com título, explicação e cartões
Ajuda: Não encontrou? Acesso à informação | Ouvidoria | Glossário/FAQ
Avaliação da página, quando implementada
Rodapé institucional existente
```

Os atalhos devem ser configuráveis e levar a destinos publicados. Inicialmente, sua escolha será editorial; depois poderá ser revista com métricas agregadas de uso.

### Seções e relação com o conteúdo existente

| Seção proposta | Destinos disponíveis no código | Complementos a validar |
|---|---|---|
| Atendimento ao cidadão | `/portal/acesso-informacao`, `/portal/ouvidoria`, `/portal/servicos` | Carta de Serviços, contatos completos e normas locais |
| Receitas e despesas | `receitas`, `despesas`, `liquidacoes`, `pagamentos`, `restos-a-pagar`, `repasses`, painel financeiro | Emendas e ordem cronológica: confirmar página, publicação ou destino externo adequado |
| Pessoal e diárias | `servidores`, `estagiarios`, `autonomos`, `inativos`, `cessoes`, `vagas`, `padrao-remuneratorio`, `diarias`, `quantitativo-pessoal` | Concursos, processos seletivos e regulamentação de diárias |
| Compras, contratos e obras | `licitacoes`, `contratos`, `compras`, `convenios`, `obras` | Atas e Plano de Contratações Anual, conforme publicação disponível |
| Planejamento, contas e legislação | Biblioteca documental, `legislacao`, `/portal/planejamento` | Organizar PPA, LDO, LOA, RREO, RGF e prestações de contas conforme acervo publicado |
| Bens e recursos públicos | `patrimonio`, `estoque`, `frota`, `renuncia` | Informações complementares efetivamente publicáveis |
| Saúde e educação | `medicamentos`, `fila-saude`, `fila-creches` | Unidades, orientações e planos setoriais publicados |
| Institucional e ajuda | Portal institucional, mapa das consultas, estatísticas e página PNTP | FAQ, glossário e dados abertos com explicações próprias |

Esses são destinos implementados no código, sujeitos à habilitação e à disponibilidade real. As oito seções são uma proposta de navegação, não uma declaração de atendimento integral às exigências legais. PNTP/Radar devem ter acesso claro sem aparecer como certificação concedida ao sistema.

### Comportamento dos cartões

- Título em linguagem cidadã, descrição curta e ação de acesso.
- Uma única superfície de link, foco visível e indicação de destino externo.
- Grade com uma coluna no celular, duas no tablet e três ou quatro conforme espaço disponível.
- Seção sem itens publicados não aparece.
- Conteúdo indisponível deve oferecer explicação e alternativa útil; nenhum botão sem ação ou link `#`.
- Evitar siglas isoladas: por exemplo, “Relatório de Gestão Fiscal (RGF)”.

## 4. Rotas e compatibilidade

**Rota principal recomendada:** `/portal/portaldatransparencia`, já usada pela navegação institucional e pelo contrato de publicação.

- Acesso sem parâmetros: nova página inicial temática.
- Acesso com `view` e filtros: consulta correspondente, com o contrato atual de URL.
- Acessos antigos com filtros e sem `view`: continuar interpretando como consulta de publicações, após inventariar os parâmetros aceitos.
- Manter o redirecionamento de `/portal-transparencia`, preservando a query string.
- Preservar `/painel`, `/mapa`, `/pntp`, `/estatisticas`, APIs de consulta e downloads.
- Avaliar separadamente uma URL amigável `/transparencia`; ela não é necessária para entregar a melhoria.
- Adicionar `/portal/portaldatransparencia/pesquisa` para a busca de descoberta.

Antes de alterar o comportamento da entrada, revisar links do `PortalShell`, atalhos institucionais, caminhos de revalidação e consumidores de `publicTransparencyPath`.

## 5. Busca em duas entregas

### Entrega inicial: localizar assuntos e serviços

- Buscar títulos, descrições, grupos e sinônimos do catálogo publicado.
- Incluir destinos de atendimento explicitamente cadastrados.
- Normalizar acentos e caixa; ordenar correspondência de título antes de descrição.
- Usar URL compartilhável, por exemplo `/portal/portaldatransparencia/pesquisa?q=contratos`.
- Explicar o escopo: “Busque assuntos e serviços do portal”.
- Exibir estado vazio com sugestão de termos e link para e-SIC.
- Não consultar todos os provedores externos a cada tecla digitada.

### Evolução: publicações e registros

- Acrescentar publicações autorizadas à busca, com filtros realmente suportados pelos dados.
- Separar resultados em “Assuntos e serviços” e “Documentos publicados”.
- Para registros financeiros e de pessoal, encaminhar à consulta temática apropriada com filtros compatíveis.
- Definir indexação, paginação e limites antes de oferecer busca transversal de registros.
- Não anunciar busca no conteúdo integral dos PDFs sem extração/indexação implementada.
- Se houver sugestões assíncronas, aplicar debounce, proteção contra respostas fora de ordem e navegação por teclado.

## 6. Evolução da tela de consulta

1. Organizar a tela em contexto, filtros, resultados e ações secundárias.
2. Mostrar pesquisa, entidade e exercício primeiro; agrupar opções avançadas em bloco expansível.
3. Manter a origem visível, com textos simples para documentos municipais, dados nativos, referência externa e demonstração.
4. Rever a exposição do seletor de fonte na jornada principal conforme a política de publicação do município. Exemplos permanecem claramente identificados em uma jornada de demonstração.
5. Exibir filtros ativos e permitir limpar a busca, conservando o contexto adequado.
6. Reunir exportações em uma área “Baixar dados”, com formatos e escopo explicado.
7. Manter tabelas em região própria com rolagem horizontal quando necessário, sem provocar rolagem na página inteira.
8. Melhorar detalhes do registro e retorno à lista, preservando parâmetros e paginação.
9. Diferenciar visualmente carregamento, nenhum resultado, fonte indisponível e declaração de não adoção/não publicação.

## 7. Estratégia técnica e editorial

### Reaproveitamento prioritário

- `PortalShell`: identidade, navegação, acessibilidade e rodapé.
- `publishedTransparencyCatalog(settings)`: base dos assuntos publicáveis.
- `presentation-settings.ts`: títulos, descrições, habilitação e ordem existentes.
- `query-contract.ts` e `publicQueryHref`: composição de URLs e filtros.
- `consultation-service.ts`: origem, disponibilidade e execução de consultas.
- Política atual de publicação, validação de documentos e exportação.

### Componentes sugeridos

Em `src/components/transparencia/`, seguindo a estrutura atual:

- `TransparencyHome`: composição da página inicial.
- `TransparencyIntro`: título, orientação e acesso à busca.
- `TransparencyQuickLinks`: atalhos configurados.
- `TransparencySection` e `TransparencyCard`: catálogo visual.
- `TransparencyDiscoverySearch`: busca de assuntos e serviços.
- `TransparencyConsultation`: extração gradual da composição atual de consultas.
- `PageFeedbackForm`: avaliação da página, em etapa posterior.

Manter composição e leitura de dados no servidor; usar componentes client apenas onde houver interação. Antes da implementação, ler os guias relevantes da versão instalada do Next.js, conforme `AGENTS.md`.

### Dados e configuração

Na primeira entrega, derivar os cartões do catálogo publicado e configurar os destinos de atendimento em um ponto central. Evitar duplicar a lista de consultas em JSX.

Na evolução editorial, acrescentar apenas os atributos ainda necessários: seções ordenadas, atalhos, sinônimos, fundamento legal revisado e destinos internos/externos. Reutilizar permissões e auditoria existentes após verificar seus consumidores. Definir responsável e data de revisão de cada item.

Para links externos, validar protocolos e destinos permitidos, identificar a navegação externa e comunicar abertura em nova aba quando utilizada. Conteúdo externo continua com sua procedência explícita.

## 8. Acessibilidade, identidade e desempenho

### Acessibilidade desde a primeira entrega

- Um H1 por página, seções com H2 e regiões semânticas coerentes.
- Fluxo completo por Tab/Shift+Tab, foco visível e menus operáveis por teclado.
- Contraste mínimo de 4,5:1 para texto comum e 3:1 nos casos aplicáveis a texto grande e componentes.
- Reflow em 320 CSS px e zoom de 200%, com tabelas isoladas em regiões roláveis.
- Campos com rótulos e erros associados; feedback assíncrono anunciado quando necessário.
- Movimento reduzido respeitado e alvos de toque confortáveis.
- Verificar que a escala de texto e o alto contraste existentes funcionam também nos novos componentes.
- Auditoria automatizada acompanhada de testes manuais e amostra com leitor de tela.

### Identidade visual

Extrair tokens da identidade institucional existente: cor de marca, superfícies, texto, bordas, foco, espaçamento e tipografia. Aplicar os tokens de maneira consistente no hub e nas consultas. Validar a identidade em protótipo antes de implementar o conjunto de telas.

### Desempenho e SEO

- Medir a situação atual antes de estabelecer comparação.
- Fazer a página inicial depender apenas do catálogo/configuração necessários à descoberta.
- Avaliar cache/revalidação do catálogo conforme o ambiente de implantação e os eventos de publicação; consultas e permissões precisam continuar corretas após despublicação.
- Definir título, descrição e URL canônica específicos do portal e da busca.
- Revisar sitemap e domínio institucional; evitar multiplicar URLs indexáveis para combinações de filtros e fontes de demonstração.
- Objetivos de campo propostos, no percentil 75: LCP até 2,5 s, INP até 200 ms e CLS até 0,1, separados por dispositivo quando houver amostra suficiente. Lighthouse serve como diagnóstico de laboratório, não como comprovação desses resultados em campo.

## 9. Avaliação da página

Criar um fluxo de avaliação de usabilidade independente da avaliação de atendimento existente.

- Pergunta simples, escala de 1 a 5 e comentário opcional.
- Começar sem nome/e-mail, salvo necessidade editorial definida.
- Registrar página e contexto mínimo; não armazenar query strings brutas que possam conter dados pessoais.
- Informar que a avaliação não substitui e-SIC ou ouvidoria.
- Tratar envio, sucesso, falha e tentativa duplicada.
- Aplicar validação, limitação de frequência e prevenção de spam no servidor.
- Definir finalidade, retenção e acesso administrativo antes de ativar a coleta.
- Apresentar apenas agregados adequados em relatórios; comentários individuais ficam sob acesso autorizado.

## 10. Plano de execução e dependências

Estimativa inicial para uma pessoa desenvolvedora com apoio de design e revisão editorial: **20–30 dias úteis**, sujeita à auditoria inicial. O tempo de validação institucional e novas integrações não está embutido nessa estimativa.

| Etapa | Entregas | Dependências | Estimativa |
|---|---|---|---|
| 0 — Diagnóstico e desenho | Inventário de links e configuração real; capturas desktop/mobile; linha de base; protótipo do hub e de uma consulta | Ambiente acessível e responsável pelo conteúdo | 2–3 dias |
| 1 — Hub de transparência | Introdução, atalhos, seções/cartões, adaptação de entrada, reaproveitamento do catálogo e validação acessível | Etapa 0 e textos iniciais | 4–6 dias |
| 2 — Descoberta e consulta | Busca de assuntos, simplificação dos filtros, navegação mobile, origem e exportações mais claras | Etapa 1 e contrato de rotas validado | 5–7 dias |
| 3 — Conteúdo e gestão | Configuração editorial complementar, busca de documentos publicados, SEO e revisão dos destinos | Etapa 2 e acervo revisado | 4–6 dias |
| 4 — Feedback e consolidação | Avaliação da página, testes de jornada, auditoria final e medição comparativa | Política de coleta, etapas anteriores | 5–8 dias |

**Ponto de entrega incremental:** publicar as etapas 0 e 1 após validação, sem aguardar todo o plano. Acessibilidade e responsividade são critérios de cada etapa.

### Responsabilidades

- **Desenvolvimento:** componentes, contratos de navegação, busca, integração e verificações técnicas.
- **Design/UX:** hierarquia, protótipo, identidade e testes de localização de informações.
- **Comunicação e setores responsáveis:** descrições, contatos, documentos e destinos corretos.
- **Controladoria/jurídico:** aplicabilidade, fundamentos legais e evidências publicáveis.
- **Gestão do portal:** habilitação, revisão periódica e acompanhamento dos indicadores.

## 11. Critérios de aceite

| Código | Critério verificável |
|---|---|
| PT-01 | A entrada sem parâmetros apresenta introdução, busca e assuntos publicados, sem executar uma consulta financeira para montar os cartões. |
| PT-02 | Cartões apresentam título, descrição, destino funcional e ordem editorial; itens desabilitados não aparecem. |
| PT-03 | Links anteriores com `view`, fonte, filtros, paginação e registro continuam abrindo o contexto correto; acessos antigos com filtros sem `view` são contemplados. |
| PT-04 | Não há rolagem horizontal da página geral em 320, 390, 768, 1024 e 1440 px; tabelas podem rolar em região própria. |
| PT-05 | Todas as ações da jornada principal funcionam por teclado, com foco visível e hierarquia semântica revisada. |
| PT-06 | A busca de assuntos considera apenas destinos publicados, aceita acentos e apresenta resultados e estado vazio compreensíveis. |
| PT-07 | A busca documental, quando entregue, respeita publicação, entidade e filtros autorizados; rascunhos e itens retirados não aparecem. |
| PT-08 | Dados locais, dados de referência e exemplos continuam identificados; falha de origem não aparece como zero financeiro ou ausência confirmada de registros. |
| PT-09 | Filtros, ordenação, totais, detalhes, paginação e exportações mantêm coerência para o mesmo conjunto consultado. |
| PT-10 | e-SIC, ouvidoria e ajuda estão acessíveis pela página inicial e explicam a finalidade de cada canal. |
| PT-11 | Avaliação de página registra e confirma o envio sem exigir protocolo de atendimento e sem alterar sua avaliação existente. |
| PT-12 | Metadados, canônica, sitemap, regras de indexação e comportamento após despublicação são verificados no ambiente institucional. |

### Verificação na implementação

- Usar os testes existentes de transparência como base de regressão: `transparency-consultations`, `transparency-native`, `transparency-preservation` e `transparency-citizen-workflow`.
- Acrescentar testes focados nas novas regras de seleção hub/consulta, busca publicada e compatibilidade de URLs.
- Verificar manualmente a jornada hub → assunto → filtro → detalhe → download e a jornada hub → e-SIC/ouvidoria.
- Executar os checks apropriados às alterações e `npm run build` antes de commit/push, conforme as regras do projeto.
- Validar acessibilidade automatizada e manual; registrar as medições antes/depois com o mesmo cenário e ambiente.

## 12. Indicadores de resultado

1. **Encontrabilidade:** proporção de participantes que localizam receita, contrato, remuneração e e-SIC sem ajuda. Meta inicial proposta: pelo menos 80% em teste de tarefas, registrando tamanho e perfil da amostra.
2. **Tempo de localização:** comparar mediana antes/depois nas mesmas tarefas; definir meta após a linha de base.
3. **Busca sem resultado:** acompanhar termos agregados e revisar sinônimos, títulos e conteúdo.
4. **Qualidade dos destinos:** nenhum link interno quebrado no conjunto publicado; links externos revisados periodicamente.
5. **Acessibilidade:** nenhuma falha crítica ou séria conhecida na jornada auditada, complementada por validação manual.
6. **Desempenho:** acompanhar os objetivos de Web Vitals e a diferença entre a página inicial e consultas com dados externos.
7. **Satisfação da página:** acompanhar distribuição das notas e volume de respostas separadamente da satisfação de atendimento.

## 13. Ordem recomendada para começar

1. Conferir a configuração ativa, a disponibilidade dos destinos e os links antigos.
2. Aprovar um protótipo da página inicial com as seções propostas.
3. Implementar o hub reaproveitando o catálogo publicado e o layout institucional.
4. Validar teclado, celular e compatibilidade das consultas existentes.
5. Evoluir busca, consulta, gestão editorial e avaliação na sequência das etapas.

**Resultado esperado:** uma entrada compreensível para o cidadão, conectada à capacidade de consulta já existente, com publicação verificável, identidade consistente e evolução incremental.

## 14. Complemento visual — capturas fornecidas

**Revisão:** 19/10/2026. As observações abaixo se referem ao portal de referência de Pau dos Ferros. As capturas mostram trechos desktop em escalas aparentes diferentes; contagens de colunas são observáveis, mas não permitem deduzir breakpoints, dimensões CSS ou comportamento mobile. Não representam uma auditoria visual do CeleriFlow.

### 14.1 Inventário e observações confirmadas

| Captura em `docs/imagens/` | Elementos visíveis | Aplicação no projeto |
|---|---|---|
| `Captura de tela 2026-10-19 094009.png` | Barra superior azul, identidade institucional em faixa clara, navegação azul, faixa de contexto, introdução em painel branco e início das seções | Reutilizar o cabeçalho institucional existente e criar uma abertura própria para a transparência |
| `Captura de tela 2026-10-19 094020.png` | Gestão Administrativa em seis colunas e três linhas; Transparência Fiscal em três colunas | Configurar densidade por seção e dar espaço a títulos extensos |
| `Captura de tela 2026-10-19 094028.png` | Informações Institucionais em quatro colunas; última linha incompleta e alinhada à esquerda | Usar grade que preserve largura e alinhamento dos cartões na última linha |
| `Captura de tela 2026-10-19 094038.png` | Normas e Regulamentações em quatro colunas; Saúde Pública em três | Permitir composição editorial conforme tipo e quantidade de conteúdo |
| `Captura de tela 2026-10-19 094049.png` | ATRICON em quatro colunas; painel separado de satisfação com cinco opções, ícones expressivos e rótulos | Separar visualmente a avaliação da navegação e manter rótulos compreensíveis |

Na primeira captura, Atendimento ao Cidadão aparece em quatro colunas. O trecho visível de Execução Orçamentária e Financeira apresenta dois cartões lado a lado; o restante dessa seção não está mostrado. A navegação superior contém indicadores visuais de submenu, mas as capturas não demonstram como esses menus funcionam.

### 14.2 Linguagem visual a aproveitar

1. **Página em camadas:** fundo cinza muito claro, painéis brancos para introdução e seções, bordas discretas, cantos arredondados e sombras suaves.
2. **Agrupamento explícito:** título de seção centralizado e subtítulo/fundamento legal abaixo, antes da grade de cartões.
3. **Cartão compacto:** ícone dentro de um pequeno bloco colorido suave, título à esquerda, descrição curta e ação “Acessar →”. Alguns cartões da referência não apresentam descrição visível; no CeleriFlow, priorizar uma descrição útil em todos os itens.
4. **Cor como apoio:** diferentes cores aparecem nos ícones e ações. No projeto, usar uma paleta controlada por assunto e manter significado compreensível sem depender da cor.
5. **Separação entre grupos:** espaçamento externo maior que o espaço entre cartões, facilitando a leitura da página longa.
6. **Introdução acolhedora:** mensagem centralizada, orientação breve e botão de busca avançada. No CeleriFlow, manter a proposta de campo de busca visível e explicar seu escopo.

O primeiro print também mostra elementos gráficos de reconhecimento no cabeçalho e um controle flutuante com símbolo de Libras. Esses elementos não comprovam certificação do CeleriFlow nem funcionamento de uma ferramenta de tradução. Sua adoção depende de conteúdo institucional e funcionalidade reais.

### 14.3 Ajustes nas decisões de implementação

**A. Adotar um painel por seção como composição inicial do protótipo.**

Cada `TransparencySection` deve agrupar título, apresentação/fundamento legal e grade sobre uma mesma superfície. Isso torna o parentesco entre os assuntos mais explícito que uma sequência de cartões sem contêiner.

**B. Prever variantes de densidade para as grades.**

A referência não utiliza a mesma quantidade de colunas em todos os grupos. Para o CeleriFlow, propor:

- `featured`: dois cartões por linha em desktop, para caminhos prioritários com mais explicação.
- `standard`: três ou quatro cartões por linha, conforme largura e legibilidade.
- Mobile: uma coluna; tablet: duas, sujeitos à validação do protótipo.
- Seis colunas, como na Gestão Administrativa da referência, ficam condicionadas a testes de legibilidade; a proposta inicial prioriza três ou quatro.

Essas variantes são escolhas de projeto, não reprodução de medidas do site. Se a grade usar `auto-fit`, verificar o comportamento da última linha; para preservar os cartões sem expansão excessiva, usar colunas explícitas por faixa ou `auto-fill` quando adequado.

**C. Incluir ícones consistentes na primeira entrega.**

Usar a biblioteca `lucide-react` já instalada e um mapa central de ícones por assunto. Ícones decorativos devem ficar fora da leitura assistiva, pois o título já identifica o destino. Evitar depender de nomes de ícone arbitrários recebidos de configuração sem validação.

**D. Facilitar a orientação em uma página longa.**

Incluir um índice compacto de assuntos com âncoras reais para as seções, além da busca. Usar identificadores estáveis, cuidar da posição de chegada e validar a navegação por teclado. No celular, o índice pode ser recolhível. Esse índice é uma melhoria proposta, não um elemento confirmado nos prints.

**E. Preservar rótulos na avaliação de satisfação.**

O conjunto de cinco expressões é uma referência visual útil. Implementar opções como grupo de seleção com legenda e rótulos textuais, operável por teclado e sem depender das cores ou dos rostos para explicar as notas. A imagem não permite inferir o comportamento de seleção ou envio.

### 14.4 Atualização do primeiro pacote de trabalho

O protótipo e a etapa 1 devem contemplar:

1. Cabeçalho e rodapé institucionais existentes, abertura contextual e painel de boas-vindas com busca.
2. Índice de assuntos e atalhos prioritários, evitando repetir todos os destinos nas duas áreas.
3. Painéis temáticos brancos com títulos claros, subtítulos e cartões com ícones.
4. Pelo menos duas variantes de grade, verificadas com títulos curtos e longos.
5. Estados de foco, identificação de links externos e tratamento de destinos indisponíveis.
6. Protótipos em 390, 768 e 1440 px, mais verificação de reflow em 320 CSS px.

Esses itens refinam o escopo visual da etapa 1 e devem ser considerados na revisão de sua estimativa após o protótipo. A avaliação da página permanece na etapa 4, com sua própria persistência e política de coleta.

### 14.5 O que as capturas ainda não comprovam

- Família tipográfica, valores CSS exatos, contraste calculado e dimensões em CSS px.
- Estados de hover/foco, área realmente clicável dos cartões, menus abertos e ordem de tabulação.
- Layout mobile, comportamento sticky, reflow, zoom e tamanho de alvos de toque.
- Funcionamento do controle de Libras, pesquisa e envio de satisfação.
- Disponibilidade dos destinos, APIs utilizadas e desempenho.

**Conclusão da revisão visual:** os prints reforçam a recomendação de um hub de descoberta e tornam mais concreta sua apresentação: painéis temáticos, ícones suaves, cartões descritivos e densidade ajustada por seção. A implementação deve combinar essa organização com a legibilidade e os contratos funcionais do nosso portal.

## 15. Registro da primeira entrega — 19/10/2026

Implementados:

- Entrada temática em `/portal/portaldatransparencia`, com cabeçalho/rodapé institucionais existentes, apresentação, busca, atalhos e índice de assuntos.
- Painéis temáticos e cartões com ícones, descrições, foco visível, grades responsivas e identificação de fontes de referência/demonstração.
- Catálogo derivado das consultas publicadas, incluindo títulos/ordem editoriais e consultas documentais personalizadas.
- Destinos com entidade habilitada, exercício publicado e fonte apropriada; acesso externo ao Radar identificado.
- Busca de assuntos e serviços em `/portal/portaldatransparencia/pesquisa`, com normalização de acentos, sinônimos, resultados e estado vazio.
- Compatibilidade da entrada antiga com `view` ou filtros, mantendo a tela de consulta existente nessas URLs.
- Metadados do portal e orientação para não indexar a página de resultados de busca.

Verificações já realizadas: ESLint dos arquivos alterados, 30 testes de transparência aprovados (incluindo quatro testes novos de descoberta) e respostas HTTP 200 para a nova entrada, pesquisa com resultados, pesquisa vazia, consulta explícita e consulta legada com filtros sem `view`. A página renderizada foi inspecionada em navegador headless em 320, 390, 768 e 1440 px, sem rolagem horizontal da página geral, com um H1 e destinos válidos para as âncoras do índice, além de capturas para revisão desktop/mobile.

A verificação automatizada com axe-core 4.10.3 no conteúdo principal da nova entrada, em desktop, não encontrou violações nas regras selecionadas de WCAG 2 A/AA e WCAG 2.1 AA. Esse resultado tem o escopo dessa página e dessa execução, sem substituir a auditoria manual da jornada.

As próximas etapas seguem o plano: refinamento da tela de consulta, busca documental, configuração editorial complementar e avaliação da página. A aprovação visual institucional e a auditoria manual completa de acessibilidade continuam como validações de entrega.

## 16. Consolidação das etapas seguintes — 19/10/2026

Implementados o refinamento das consultas (filtros avançados, remoção individual de filtros ativos, menu mobile, downloads agrupados e retorno dos detalhes à lista), a busca documental com filtros/paginação e o editor de apresentação do hub.

A gestão editorial passou a incluir seções, atalhos, sinônimos, destinos complementares com responsável/data de revisão, fundamentos legais, URL institucional e controle da avaliação das páginas. Alterações têm auditoria e verificação contra sobrescrita simultânea.

A avaliação da página tem persistência própria, confirmação de envio, validação, antispam, limitação de frequência, idempotência e retenção de 365 dias. Comentários ficam sob acesso administrativo e os relatórios públicos exibem agregados. A migração foi aplicada e o fluxo foi verificado pelo navegador com persistência real; o registro técnico do teste foi removido.

Também foram acrescentados estados de carregamento/erro, URLs canônicas, sitemap institucional, regras de indexação e rotina diária de retenção. O conteúdo principal do hub, da busca e de uma consulta foi verificado em cinco larguras e auditado com axe-core, sem violações nas regras selecionadas nessa execução.

O guia `docs/PORTAL_TRANSPARENCIA_OPERACAO.md` descreve os caminhos de gestão, o comportamento da busca, as avaliações e o comando de monitoramento de destinos. A revisão institucional de conteúdo e as medições de desempenho de campo continuam sendo atividades operacionais do portal publicado.

Validação complementar: os 33 testes de transparência passaram, assim como o ESLint dos arquivos alterados. A verificação HTTP dos 40 destinos do hub confirmou respostas 200; Planejamento e Mapa das consultas excederam inicialmente o limite de 20 segundos e responderam na nova verificação em aproximadamente 2,7 s e 0,9 s, respectivamente. O comando `npm run build` foi concluído com código 0: as quatro partições de checagem de tipos passaram, a compilação de produção foi concluída e as 95 páginas estáticas foram geradas.
