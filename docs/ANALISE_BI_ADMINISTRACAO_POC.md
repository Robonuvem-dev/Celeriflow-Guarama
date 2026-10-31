# BI da Administração — diagnóstico, autosserviço e Smart TV

Data: 31/10/2026. Escopo: análise do código atual e proposta de evolução com base nos 17 requisitos enviados nas duas imagens. As telas e rotas novas abaixo são propostas, não funcionalidades já entregues.

**Plano de implantação atualizado:** [Inteligência e BI + Smart TV pública](PLANO_IMPLANTACAO_BI_SMARTTV.md). A definição posterior do usuário estabelece `/Smarttv` como entrada pública principal da TV, com identidade municipal, páginas rotativas, dashboards divulgáveis, imagens e legendas. O plano detalha essa decisão e a sequência de entregas.

## 1. Conclusão executiva

Há um painel administrativo conectado aos cadastros e demandas, com gráficos fixos, filtro por secretaria, comparativo e exportação. Ainda não há um ambiente em que servidores possam criar e salvar seus próprios indicadores, gráficos, dashboards e relatórios, publicar links externos e montar canais de TV.

Recomendação: criar **Administração → Inteligência e BI**, aproveitando o painel atual como modelo inicial e utilizando um catálogo de dados comum a três experiências:

1. **Estúdio do servidor:** criação e organização de análises.
2. **Portal de visualização:** painéis/relatórios publicados, com ou sem login conforme a publicação.
3. **Central de telas:** programação, compartilhamento e rotação em Smart TV.

O usuário cria uma análise uma vez. Dashboard, relatório, celular e TV consomem definições versionadas e o mesmo contrato de consulta, respeitando a audiência de cada publicação.

## 2. O que existe e o que pode ser mostrado

| Local | Evidência no código | Alcance real |
| --- | --- | --- |
| `/administracao` e `/administracao/indicadores` | `src/app/app-domain/administracao/page.tsx` reexporta a página de indicadores | São duas entradas do mesmo painel, não dois construtores |
| Painel administrativo | `src/app/app-domain/administracao/indicadores/AdministrationDashboard.tsx` | Seis cartões, barras de servidores/cargos, rosca de demandas e evolução mensal; composição fixa |
| Filtro e comparativo | Mesmo componente | Prefeitura/secretaria; busca textual e tabela completa com páginas de 20 registros |
| Fonte administrativa | `src/lib/administration/bi-service.ts` e `src/db/repositories/administration/bi.ts` | Drizzle sobre instituição, secretarias, departamentos, unidades, servidores, cargos e demandas |
| Exportação administrativa | `src/lib/administration/bi-export.ts` e `src/app/api/administracao/indicadores/exportar/route.ts` | CSV, XLSX e ZIP com CSVs/Power Query, protegidos por login |
| PDF do painel | Botão `window.print()` e CSS de impressão | Impressão/salvar como PDF pelo navegador; não há endpoint administrativo gerador de PDF |
| `/indicadores` | `src/app/app-domain/indicadores/page.tsx` | Outro painel fixo, transversal, com início/fim e padrão de ano atual até hoje; não é configuração de período de um projeto BI |
| Motor compartilhado de relatórios | `src/lib/reports/report-engine.ts` e `tabular-renderers.ts` | Definições programáticas, permissão `issueReports`, auditoria e renderizadores tabulares; ainda não são editor de relatórios pelo usuário |
| Permissões | `src/lib/platform/tenant-context.ts` | Perfis, perfis adicionais e operações por módulo; falta audiência por projeto/painel/relatório |

### Distinções importantes para a apresentação

- **Power BI:** o ZIP é um pacote de importação manual com consulta Power Query. Não é PBIX, embed, publicação no Power BI Service ou sincronização automática.
- **Drill-down:** selecionar a secretaria no filtro/tabela não equivale a clicar numa barra e percorrer uma hierarquia mantendo o contexto. Os SVGs atuais não têm esse comportamento.
- **Período:** estrutura e servidores refletem o cadastro atual. Demandas totalizam o histórico, e a série temporal cobre os últimos seis meses. Aplicar um filtro de datas novo não transforma o cadastro atual em um histórico de lotação.
- **Resultado de demandas:** o indicador atual de finalizadas inclui canceladas. Os indicadores novos devem separar resolução e cancelamento antes de calcular produtividade.
- **Objetos visíveis:** reduzir automaticamente o Top N de barras conforme a altura disponível não equivale a o usuário escolher quais objetos exibir.
- **Mobilidade:** há CSS responsivo. Não foi localizado manifest/PWA ou aplicativo móvel do BI nas áreas examinadas; navegador móvel não comprova sozinho o requisito de aplicativo.

## 3. Matriz dos 17 requisitos

“Parcial” significa que existe uma base aproveitável, mas não que o item completo possa ser declarado atendido. A análise é de código, não homologação em produção.

| # | Requisito das imagens | Situação atual | Entrega necessária / evidência de aceite |
| --- | --- | --- | --- |
| 1 | Compartilhar gráficos/relatórios sem usuário e senha | Não identificado no BI | Publicação específica; abrir gráfico e relatório em janela anônima |
| 2 | Criar gráficos resumidos com drill-down | Parcial: gráficos fixos | Criar gráfico; clicar em secretaria → departamento → unidade; voltar pelos níveis |
| 3 | Gerar link para dashboards/relatórios no site da entidade sem login | Não identificado no BI | Links de visualização e embed próprios; conferir em outro domínio e sem sessão |
| 4 | Criar filtros externos | Parcial: filtro interno de secretaria | Designer de filtros fora do gráfico, mapeados aos objetos, inclusive nas publicações permitidas |
| 5 | Configurar período inicial do projeto | Parcial: período em `/indicadores`, sem projetos | Salvar ano atual/mês atual/intervalo fixo/escolha ao abrir; testar reabertura e mudança do mês |
| 6 | Tabelas self-service | Não identificado | Servidor escolhe campos, agrupamentos, medidas, ordem e filtros; salva e reabre |
| 7 | Módulo de criação de painéis gráficos | Parcial: painel predefinido | Editor visual com inclusão, posição, tamanho, configuração e seleção de objetos |
| 8 | Módulo de criação de relatórios | Parcial: infraestrutura programática | Editor de relatório com campos, agrupamentos, subtotais, cabeçalho e exportação |
| 9 | Visualizar painéis/relatórios por portal web | Parcial: visualização interna | Biblioteca do portal para as publicações BI; abrir painel e relatório publicados |
| 10 | Todos os formatos de exportação descritos | Parcial | Testar individualmente formatos e integridade; detalhamento na seção 8 |
| 11 | Controle de acesso por grupos | Parcial: perfis de módulo | Grupos/perfis como audiência dos objetos e projetos; verificar leitura/edição/publicação/exportação separadamente |
| 12 | Aplicativo móvel | Não identificado para BI | PWA instalada ou app, conforme aceite da POC; comprovar instalação e visualização real |
| 13 | Intervalo parametrizado de atualização | Não identificado no BI | Configurar frequência; alterar um dado e demonstrar atualização pelo portal sem recarga manual |
| 14 | Escolher objetos exibidos no dashboard | Não identificado | Adicionar/remover/ocultar objetos no editor e selecionar objetos por publicação/TV |
| 15 | Interface Smart TV com rotação de painéis | Não identificado | Player dedicado e playlist com múltiplos painéis e duração configurável |
| 16 | Publicar objetos para diferentes dispositivos | Não identificado no BI | Publicar gráfico/tabela/painel/relatório e abrir o mesmo objeto em desktop, celular e TV |
| 17 | Compartilhar visualização entre móveis e TV | Não identificado no BI | Link/QR comum; para experiência sincronizada, sessão de apresentação com dispositivo controlador |

## 4. Área de uso dos servidores

### Navegação sugerida

```text
Administração
└── Inteligência e BI
    ├── Visão geral
    ├── Meus projetos
    ├── Indicadores
    ├── Análises e tabelas
    ├── Painéis
    ├── Relatórios
    ├── Modelos prontos
    ├── Publicações e compartilhamentos
    ├── Telas e Smart TV
    └── Fontes de dados e permissões
```

Projetos agrupam fontes, análises, relatórios, painéis e permissões de um objetivo: “Gestão da Secretaria de Educação”, “Demandas municipais”, “Sala de situação”. Não é necessário que o servidor entenda de SQL ou da organização das tabelas do sistema.

### Tela A — biblioteca e projetos

- Ações: **Novo projeto**, **Novo indicador**, **Novo painel**, **Novo relatório**, **Usar modelo**.
- Visões: Meus itens, Compartilhados comigo, Da secretaria e Publicados.
- Identificação de proprietário, área, última alteração, origem dos dados e situação de publicação.
- Modelos iniciais: gestão administrativa atual, demandas e prazos, estrutura/equipe, metas por secretaria.

### Tela B — criar análise/indicador

Assistente: **Fonte → Medidas → Agrupamentos → Filtros → Visualização → Salvar**.

Exemplo de uso:

```text
Nome: Demandas em atraso por secretaria
Fonte: Demandas internas
Medida: Contagem de demandas
Filtro: Em aberto + Prazo vencido
Agrupar por: Secretaria
Visualização: Barras
Detalhamento: Secretaria → Departamento → Unidade
Período: Ano atual, pela data de abertura
```

Permitir cartões, barras/colunas, linhas, rosca, tabela e tabela dinâmica. A tabela self-service deve escolher linhas, colunas, medidas, ordenação, totais/subtotais e filtros; não apenas ocultar colunas de uma tabela fixa.

Cada indicador deve ter nome, descrição, unidade, fórmula, regra de período, meta e polaridade (maior/melhor, menor/melhor ou faixa). Fórmulas usam medidas conhecidas, operadores permitidos, divisão por zero tratada e expressões validadas. Exemplo: demandas resolvidas do conjunto selecionado ÷ total desse mesmo conjunto, excluídas as canceladas, conforme definição aprovada. Numerador e denominador devem usar a mesma população e regra temporal. Não executar JavaScript/SQL digitado pelo usuário.

### Tela C — editor do painel

```text
[Nome do painel] [Visualizar] [Salvar rascunho] [Publicar]

Objetos                 Área de composição          Propriedades
Indicador/KPI           Grade redimensionável       Fonte/medida
Gráfico de barras       Cartões e gráficos          Filtros e período
Gráfico de linhas       Tabelas e textos            Drill-down
Tabela dinâmica                                    Título/cores
Texto/imagem                                       Mostrar por dispositivo
```

- Selecionar e ordenar objetos; oferecer arraste e também controles de teclado/mover para acessibilidade.
- Filtros comuns no topo: período, secretaria, departamento, situação; cada objeto informa quais filtros recebe.
- Pré-visualização desktop, celular e TV, com layouts próprios da mesma definição.
- Rascunho separado da versão publicada; editar não modifica imediatamente o painel de uma TV em funcionamento.

### Tela D — editor de relatórios

Seleção de fonte, campos, ordem, agrupamentos, totais/subtotais, filtros, identidade institucional, orientação e quebras de página. Utilizar o mesmo indicador/consulta do painel para que gráfico e relatório conciliem os números. Prévia paginada e exportação de todos os resultados autorizados, não somente dos 20 registros da página visível.

Listagens de projetos/modelos/publicações e resultados operacionais reutilizam as tabelas compartilhadas de `docs/Padrão de Tabelas.md`: 20 registros, redimensionamento e conteúdo integral por detalhe. A composição gráfica e a paginação de relatório impresso têm requisitos próprios. Na TV, não se deve abrir uma tabela operacional cheia de controles; usar cartões, resumos e páginas/slides de detalhe legíveis.

## 5. Tela de Smart TV

### Tela administrativa — “Telas e Smart TV”

Separar duas entidades:

- **Canal:** programação de conteúdo, como “Gabinete”, “Recepção” ou “Sala de situação”.
- **Tela/dispositivo:** a TV que recebe um canal. Várias TVs podem usar o mesmo canal.

```text
Canal: Sala de situação municipal          [Prévia TV] [Gerar link/QR]
Atualizar dados: a cada 5 minutos          [Publicar programação]

Ordem  Painel                          Duração    Objetos
1      Visão geral da prefeitura       20 s       6 selecionados
2      Demandas e prazos               30 s       4 selecionados
3      Comparativo por secretaria      25 s       3 selecionados

Dispositivos: TV Gabinete · TV Reuniões
Situação: última comunicação · versão exibida · atualização dos dados
```

Configurações: ordem, duração individual, transição simples, tema, orientação, horário ativo, layouts por resolução e itens visíveis. Ações: pausar, avançar, voltar, reiniciar rotação e revogar o acesso de uma tela.

### Player dedicado

- Página sem menu administrativo, sem formulário de login e com aproveitamento integral da área disponível.
- Layout 16:9 e opção retrato; poucos objetos por slide; cartões grandes, títulos legíveis à distância e cores contrastantes.
- Exibir instituição, nome do painel, período aplicado, horário da última atualização e posição na programação.
- Rotacionar automaticamente; controle remoto por setas/OK e comandos simples na tela quando acionados.
- Reconectar após queda da rede. Manter temporariamente o último snapshot autorizado e indicar quando os dados estiverem desatualizados. Ao revogar acesso, não continuar exibindo indefinidamente dados em cache; definir prazo máximo de funcionamento desconectado.
- A duração de um slide (ex.: 20 segundos) é independente da atualização dos dados (ex.: 5 minutos).

### Como colocar na TV

**Opção principal:** abrir o link do canal no navegador da Smart TV e favoritar. Um QR facilita enviar/abrir a URL pelo celular; a TV não precisa ler QR pela câmera. Sem instalar o sistema completo ou manter uma sessão administrativa.

**Melhor operação permanente:** usar navegador em modo quiosque em um mini-PC/Android TV conectado por HDMI, com inicialização automática do player e prevenção de suspensão. Navegadores integrados de TVs variam; a compatibilidade deve ser testada nos equipamentos usados na POC. O fullscreen pode exigir ação inicial do controle remoto.

**Vinculação opcional:** a TV abre “Conectar tela”, mostra um código temporário e o gestor associa a TV ao canal pelo celular já autenticado. O dispositivo recebe somente uma credencial de visualização daquele canal. Esse fluxo não substitui a opção de link anônimo exigida pela POC.

### Celular e TV compartilhando a visualização

1. **Mesmo conteúdo:** link/QR da mesma publicação; todos recebem a mesma versão e dados, com layout adaptado.
2. **Modo apresentação sincronizada:** celular autenticado controla a sessão — painel/slide atual, pausa e navegação — e TVs/dispositivos espectadores acompanham. Para a primeira versão, polling leve do estado de apresentação; eventos em tempo real podem ser adicionados depois. A sincronização de comandos não deve disparar recomputação dos dados a cada troca de slide.

## 6. Compartilhamento e incorporação no site

Oferecer três modos por publicação:

| Modo | Acesso | Uso |
| --- | --- | --- |
| Interno | Login + audiência por grupos/perfis e escopo da fonte | Trabalho dos servidores |
| Link de visualização | Sem login, por link próprio revogável | Compartilhamento de conteúdo explicitamente destinado a essa audiência |
| Público no portal | Sem login, publicado na biblioteca institucional | Indicadores de divulgação à população |

O link pode apontar para um gráfico, uma tabela, um relatório, um painel ou um canal. A publicação define versão, filtros fixos, filtros que o visitante pode alterar, campos disponíveis, detalhamento permitido e formatos de download. Filtros externos não podem ampliar o recorte publicado.

Rotas propostas:

```text
/administracao/bi/projetos
/administracao/bi/paineis
/administracao/bi/relatorios
/administracao/bi/publicacoes
/administracao/bi/telas

/portal/bi
/portal/bi/p/<publicacao>
/portal/bi/embed/<publicacao>
/Smarttv
```

Usar a família pública `/portal/bi` aproveita a distinção de rotas do proxy para a biblioteca e publicações. A entrada de TV `/Smarttv`, definida posteriormente pelo usuário, exige reconhecimento público específico antes do rewrite administrativo. As páginas públicas ainda precisam de consultas/DTOs próprios, sem reaproveitar contexto administrativo privilegiado. Links não listados devem ter identificador imprevisível; a publicação pública de portal pode usar slug. O visitante de um link sem login é portador do link, não um usuário autenticado nem um destinatário cuja identidade foi comprovada.

Há um ponto concreto para embed: `next.config.ts` envia `X-Frame-Options: SAMEORIGIN` globalmente. Uma rota de incorporação externa precisará de política específica de `frame-ancestors` para os domínios autorizados e de revisão do cabeçalho conflitante nessa rota. Um link simples aberto em outra aba não é embed.

Permissões de projeto não substituem permissão na fonte. Publicação, leitura interna, detalhamento e exportação precisam seguir o recorte do servidor e o contrato específico de publicação. A política de campos públicos deve fazer parte do catálogo, principalmente para fontes com dados individuais de RH/Saúde/Social. Não é necessário publicar registros pessoais para demonstrar totais e indicadores agregados.

## 7. Arquitetura recomendada — nativa e com Drizzle

### Catálogo de fontes e medidas

Criar um registro de fontes curadas: `administracao.demandas`, `administracao.estrutura`, `administracao.equipe`; depois adicionar fontes de outros módulos individualmente. Cada uma define:

- dimensões, medidas e agregações permitidas;
- campos de data e significado temporal;
- hierarquias de detalhamento realmente existentes;
- filtros disponíveis, tipos, operadores e limites;
- permissões/escopos e política de publicação;
- regra de completude, unidade e tratamento de nulos;
- consulta autorizada em repositório Drizzle.

O servidor escolhe “quantidade de demandas por secretaria”, não escreve SQL. O compilador da especificação valida campos/expressões e monta consultas parametrizadas. Agregação, filtros e drill-down são executados no PostgreSQL, sem carregar todas as demandas no browser ou somar páginas limitadas como se fossem a base inteira.

O loader administrativo atual lê todas as demandas e agrega parte no serviço; serve como referência semântica inicial, mas deve evoluir para agregações no banco, índices por filtros e paginação de detalhe antes de alimentar múltiplos projetos e TVs.

### Configuração persistida proposta

| Entidade proposta | Responsabilidade |
| --- | --- |
| `BiProject` / `BiProjectGrant` | Área de trabalho, proprietário, grupos e operações autorizadas |
| `BiIndicator` | Definição semântica de fórmula, meta, unidade e temporalidade |
| `BiAnalysis` | Fonte, medidas, dimensões, filtros, visualização e drill-down |
| `BiDashboard` / `BiDashboardVersion` | Composição dos objetos e layouts por dispositivo; rascunho/publicação |
| `BiReport` / versões | Campos, agrupamentos, totais e apresentação de relatórios |
| `BiPublication` | Audiência, versão, link/slug, recorte publicado, filtros externos e embed |
| `BiDisplayChannel` / `BiDisplaySlide` | Programação de painéis, duração e objetos visíveis |
| `BiDisplayDevice` / `BiPresentationSession` | Vínculo de tela, estado de conexão e apresentação sincronizada |
| `BiRefreshPolicy` / `BiSnapshot` | Frequência, resultado agregado, momento de captura e estado de atualização |

Esses nomes são de desenho, não tabelas já existentes. Implementar schemas/repositórios Drizzle e migrations SQL pelo executor oficial, respeitando a configuração de instância do projeto. JSONB versionado serve às configurações validadas; relações de propriedade, acesso, publicação e programação precisam de chaves/constraints próprias.

### Atualização dos dados

- Separar atualização sob demanda, cache do resultado e atualização agendada.
- Cache por fonte/versão/escopo/filtros/período. Não compartilhar resultado privado entre grupos ou usar cache público para consultas internas.
- Quando dez TVs mostram o mesmo canal e recorte público, reutilizar um snapshot; não fazer dez recomputações.
- Snapshot informa `capturedAt`, período, completude e falha de atualização. Relógio na tela não é evidência de dados atualizados.
- Para fontes simples, polling e recomputação ao expirar o cache. Para publicação que deve atualizar sem espectadores, agendador persistente e jobs com repetição/lease.
- Períodos relativos usam o fuso institucional e limites consistentes entre gráfico, drill-down e exportação. Explicitar “posição atual” para medidas sem histórico temporal.

## 8. Exportações: tratar o requisito integralmente

| Saída pedida | Hoje no BI administrativo | Caminho proposto |
| --- | --- | --- |
| PDF | Impressão do navegador | Exportação real de painel/relatório, incluindo filtros, período e atualização |
| PNG / JPG / GIF | Não identificado | Renderização dos objetos publicados e codificação real de cada formato |
| CSV / XLSX | Implementados para a seleção | Reutilizar e estender ao resultado da análise/relatório salvo |
| XLS | Não identificado | Encoder/conversor do formato XLS; XLSX não é XLS |
| DOCX | Não identificado no BI | Gerador de relatório com tabela e gráficos; reutilizar a dependência DOCX existente quando adequado |
| RTF | Não identificado | Renderizador RTF específico |
| HTML | Não oferecido como download no BI | Documento completo com recursos incorporados e metadados |
| MHT | Não identificado | Arquivo MIME multipart/related com recursos do relatório |
| Texto | Não oferecido no BI administrativo | Renderizador TXT, aproveitando convenções do motor compartilhado |

Não renomear CSV para XLS, HTML para DOCX ou JPG para GIF. Validar extensão, MIME, bytes e abertura em aplicativos compatíveis. Para dashboards em planilha, definir abas de dados e, quando exigido, gráficos/imagens; para imagem/PDF, manter fidelidade visual e metadados. O enunciado usa “ou” entre alguns formatos: confirmar a interpretação de aceite e demonstrar cada saída cobrada, sem assumir que CSV cobre todas.

Renderizadores devem consumir a mesma definição/dataset das visualizações. O motor atual de relatórios é uma base útil, mas sua lista de formatos e integração BI precisam ser ampliadas. Exportação volumosa ou renderização pesada pode usar jobs e arquivos privados no Blob com download autorizado; não manter uma requisição serverless indefinidamente aberta.

## 9. Ordem de implementação sugerida

1. **Fundação e definição dos dados:** catálogo administrativo, temporalidade, indicadores corretos, projetos, grupos e contrato de análise. Transformar o painel atual em modelo inicial preservando a entrada atual.
2. **Estúdio do servidor:** indicadores, gráficos, tabelas self-service, drill-down, filtros, período inicial e painéis salvos/versionados.
3. **Relatórios e saídas:** editor, reutilização do motor de relatórios e formatos exigidos; conciliação entre gráfico, detalhe e exportação.
4. **Publicações:** links sem login, portal, publicação de objetos, filtros externos e embed em domínio autorizado.
5. **TV e mobilidade:** canais, dispositivos, rotação, atualização automática, visualização compartilhada e apresentação controlada pelo celular. PWA instalada se aceita como aplicativo; se o edital exigir app nativo, prever entrega própria.
6. **Homologação dos 17 itens:** dados controlados, contas/grupos diferentes, janela anônima, site externo, celular instalado e TV real; evidências por item e por formato.

É possível desenvolver o player com dados controlados em paralelo às demais etapas, mas o aceite da TV deve usar publicações reais produzidas pelo estúdio, sem uma coleção separada de telas estáticas.

## 10. Roteiro proposto para a POC

1. Servidor de uma secretaria cria o projeto “Gestão de demandas” usando uma fonte disponível.
2. Cria um indicador, uma tabela self-service e um gráfico; define ano atual como período de abertura.
3. Clica na secretaria do gráfico e aprofunda para departamento/unidade suportados pela fonte; volta pelos níveis.
4. Cria painel selecionando objetos e vinculando filtros; salva e reabre.
5. Cria relatório da mesma análise; concilia total e exporta os formatos acordados.
6. Compartilha o projeto com um grupo e verifica acesso permitido/negado com duas contas.
7. Publica um painel, um gráfico e um relatório com recorte próprio. Abre seus links sem sessão.
8. Incorpora o painel no site institucional e aplica um filtro externo permitido.
9. Configura atualização, altera dado de demonstração e observa a nova captura refletida no portal.
10. Cria um canal com três painéis, objetos selecionados e durações diferentes; abre na TV e comprova rotação.
11. Abre a mesma publicação no celular; no modo apresentação, avança no celular e observa a TV acompanhar.
12. Demonstra instalação móvel conforme o aceite do requisito de aplicativo e testa revogação do compartilhamento.

## 11. Verificação feita nesta análise

- Leitura dos componentes, consultas Drizzle, exportadores, navegação, proxy, políticas de iframe e infraestrutura de relatórios/perfis.
- `node --import tsx --test tests/administration-bi.test.ts`: **2 testes aprovados**, zero falhas. Cobrem resumo/cancelamento/sem vínculo, CSV, tipos numéricos XLSX e pacote Power Query.
- Não houve modificação funcional, criação das telas propostas, migração de banco ou publicação de código nesta análise. Os testes acima não comprovam navegação autenticada, Smart TV real ou os recursos futuros.
