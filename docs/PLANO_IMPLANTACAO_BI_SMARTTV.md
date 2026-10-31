# Plano de implantação — Inteligência e BI + Smart TV pública

Data: 31/10/2026. Situação: primeira entrega de publicação e Smart TV implementada; detalhes e evidências em [Implementação BI e Smart TV](IMPLEMENTACAO_BI_SMARTTV.md). Estúdio completo, relatórios, portal/embed e mobilidade continuam no plano.

Referência: [diagnóstico do BI e matriz dos 17 requisitos da POC](ANALISE_BI_ADMINISTRACAO_POC.md).

## 1. Objetivo e decisões de produto

Implantar uma área de autosserviço em **Administração → Inteligência e BI** para os servidores criarem indicadores, análises, painéis e relatórios, com publicação para portal web, celular e TV.

A vitrine pública principal para TV será:

**https://guarama.celeriflow.com.br/Smarttv**

Definições incorporadas ao plano:

- Link público, estável, sem login, acessível diretamente no navegador da TV.
- Visualização ocupando a área disponível, com nome do município, logo e legendas importantes permanentes.
- Uma programação com várias páginas, rotacionadas automaticamente, contendo dashboards divulgáveis, indicadores, gráficos, imagens e informações institucionais.
- Administração da programação dentro do sistema, por servidores com permissão de publicação.
- A mesma fonte de indicadores alimenta o estúdio e a visualização pública. A página pública recebe somente o recorte publicado.
- Primeira entrega operacional centrada em uma programação municipal padrão. O modelo permitirá outras programações, sem exigir cadastro ou pareamento de TVs para usar o link principal.

## 2. Experiência pública em `/Smarttv`

### 2.1 Estrutura visual

```text
┌─────────────────────────────────────────────────────────────────┐
│ LOGO   NOME DO MUNICÍPIO                    Título da programação │
├─────────────────────────────────────────────────────────────────┤
│ Título da página                         Período de referência   │
│                                                                 │
│       INDICADORES · GRÁFICOS · IMAGENS · INFORMAÇÕES               │
│                                                                 │
│       Conteúdo organizado para leitura à distância               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Legendas / fonte / mensagem institucional                        │
│ Dados atualizados em: DD/MM HH:mm              Página 1 de 4      │
└─────────────────────────────────────────────────────────────────┘
```

- Cabeçalho e rodapé permanecem visíveis durante a troca das páginas.
- Nome/logo vêm do cadastro institucional (`Institution.name`, `city`, `state`, `logoUrl`), com título de exibição configurável. A implementação verificará o cadastro efetivo antes de definir o texto; não deduzirá o nome oficial pelo hostname.
- Sem logo cadastrada, preservar o nome por extenso e a área de identidade sem imagem quebrada.
- Cada página permite título, subtítulo, período, fonte, legendas dos gráficos e mensagem complementar.
- Legendas essenciais ficam estáticas e legíveis; textos institucionais longos são distribuídos em páginas. Faixa rotativa de avisos pode ser habilitada, sem ser necessária para entender os dados.
- Datas, unidades, moeda e percentuais em formato brasileiro. Indicar a data da captura dos dados, separada do relógio da tela.

### 2.2 Tipos de página

| Tipo | Composição | Exemplo |
| --- | --- | --- |
| Dashboard | Objetos selecionados de uma versão publicada de painel | Visão geral da prefeitura |
| Indicadores | Cartões com valores, metas e legendas | Demandas abertas, resolvidas, canceladas e vencidas |
| Comparativo | Gráficos resumidos, com paginação de categorias quando necessário | Totais por secretaria |
| Imagem institucional | Imagem, título, legenda e crédito/fonte | Campanha, serviço ou comunicado |
| Mista | Imagem e indicadores/gráficos | Foto de uma ação e seus resultados |

Os dados numéricos são renderizados a partir das consultas, e não incorporados como capturas manuais. Imagens são conteúdo editorial complementar, com prévia do enquadramento e opção de conter/preencher; logos e imagens informativas usam conter por padrão para evitar corte de texto.

### 2.3 Reprodução e parâmetros iniciais

- Padrão paisagem 16:9, com homologação em 1280×720 e 1920×1080; conferir escala em 4K e adaptação móvel.
- Sem rolagem na visualização de TV. Excesso de objetos ou categorias deve gerar mais páginas, sem tornar os textos ilegíveis.
- Duração inicial de 20 segundos por página, configurável entre 10 e 120 segundos.
- Troca simples, sem animações pesadas; após a última página, retornar à primeira.
- Com uma página, mantê-la exibida e atualizar os dados normalmente.
- Atualização inicial dos dados a cada 5 minutos, configurável a partir de 1 minuto conforme o custo da fonte. Verificação de versão/retirada da programação a cada 60 segundos enquanto conectada.
- Duração, dados e versão da programação têm controles independentes. Trocar de página não dispara consulta completa.
- Nova programação entra de forma consistente na próxima transição; nunca misturar páginas de versões diferentes.
- Controles discretos ao interagir: anterior, próximo, pausa, retomar e tela cheia; setas/OK quando suportados pelo navegador/controle remoto.
- O layout já ocupa a janela ao abrir. Ocultar barras do navegador via Fullscreen API exige interação inicial quando o equipamento assim determinar; em quiosque, configurar tela cheia na inicialização.

### 2.4 Estados operacionais

| Estado | Comportamento |
| --- | --- |
| Sem programação publicada | Exibir identidade municipal e mensagem institucional configurada |
| Carregamento inicial | Identidade municipal e indicação discreta de carregamento |
| Página com falha de dados | Preservar identificação, sinalizar indisponibilidade e continuar a rotação das demais |
| Falha de imagem | Usar composição de fallback sem ícone de imagem quebrada |
| Rede indisponível | Repetir a programação pública já carregada em memória, indicando última captura e perda de conexão |
| Conteúdo desatualizado | Indicar dados desatualizados após duas frequências sem captura válida |
| Expiração | Descartar snapshot de dados após 30 minutos sem validação, como padrão configurável; respeitar também vigência editorial das imagens/avisos |
| Programação retirada | Online, interromper a exibição na próxima verificação de versão; offline, respeitar a validade local máxima |

## 3. Tela interna para montar a programação

Entrada: **Administração → Inteligência e BI → Smart TV**.

```text
Programação municipal                         [Prévia] [Abrir /Smarttv]
Nome de exibição: Prefeitura Municipal ...     [Salvar rascunho]
Logo: Usar cadastro institucional              [Publicar]
Atualização de dados: 5 minutos
Rodapé: mensagem e legendas padrão

Ordem  Página                         Tipo           Duração   Situação
1      Visão geral                    Dashboard      20 s      Ativa
2      Demandas por secretaria        Gráficos       25 s      Ativa
3      Informações à população        Imagem         20 s      Ativa
4      Resultados e metas             Mista          30 s      Ativa

[Adicionar página] [Reordenar] [Duplicar] [Editar] [Remover]
```

Fluxo do servidor:

1. Selecionar um painel/indicador publicado para divulgação ou adicionar uma página de imagem/texto.
2. Escolher objetos, ordem, layout, título, legendas e tempo de exibição.
3. Definir período/filtros fixos e vigência opcional do conteúdo.
4. Conferir prévia em proporção de TV, com detecção de conteúdo que não cabe.
5. Salvar rascunho e publicar a programação completa.
6. Abrir/copiar o link público ou gerar QR para compartilhamento.

Cada publicação gera versão identificável, com autor e data. A edição seguinte fica em rascunho. A opção de restaurar uma versão permite corrigir uma programação sem modificar seu histórico.

## 4. Organização do BI e modelo técnico

### 4.1 Área dos servidores

Implementar bibliotecas de projetos, indicadores, análises/tabelas, painéis, relatórios, modelos, publicações e Smart TV. Reutilizar tabelas operacionais conforme `docs/Padrão de Tabelas.md`, incluindo paginação de 20 registros, colunas ajustáveis e leitura integral pelo detalhe.

O assistente de análise seguirá **Fonte → Medidas → Agrupamentos → Filtros → Visualização → Salvar**. O editor de painel permitirá escolher objetos, tamanhos e posição; o editor de relatórios permitirá campos, grupos, subtotais, identidade institucional e quebras de página.

### 4.2 Dados e persistência

Schemas/repositórios Drizzle e migrações aditivas para:

- Projetos e permissões por grupos/perfis.
- Indicadores e análises com especificações validadas.
- Painéis/relatórios e suas versões.
- Publicações com audiência, versão de origem e recorte de dados.
- Programações de TV, versões e páginas ordenadas, incluindo duração, layout, legenda e vigência.
- Mídias públicas vinculadas às páginas, com metadados, texto alternativo e crédito.
- Políticas de atualização e snapshots agregados.

Nomes sugeridos: `BiProject`, `BiProjectGrant`, `BiIndicator`, `BiAnalysis`, `BiDashboard`, `BiDashboardVersion`, `BiReport`, `BiPublication`, `BiDisplayChannel`, `BiDisplayChannelVersion`, `BiDisplaySlide`, `BiMediaAsset`, `BiSnapshot`.

A programação municipal padrão é uma referência persistida a um canal publicado. Evitar resolver a programação pelo primeiro registro do banco. Relacionamentos e unicidade ficam em constraints; composições flexíveis usam JSONB com schema e versão.

Catálogo inicial: estrutura administrativa, equipe agregada e demandas internas. Cada fonte define dimensões, medidas, data de referência, escopo e agregações possíveis. Estrutura/equipe atuais serão identificadas como posição atual; demandas serão filtradas pelo campo temporal definido. Resolver e cancelar são medidas distintas.

O schema atual associa departamentos e unidades à secretaria, mas não contém relação departamento → unidade nem unidade na demanda. A hierarquia inicial de demandas será secretaria → departamento. Outros níveis só entrarão quando existir vínculo real e validado na fonte; não inferir hierarquia pelos nomes.

Agregações serão realizadas no PostgreSQL, com parâmetros validados e Drizzle, sem leitura integral de demandas para cada tela. Validar totais do gráfico, detalhe e exportação usando a mesma população e regra temporal.

### 4.3 Publicação e APIs

Rotas previstas:

| Rota | Finalidade |
| --- | --- |
| `/administracao/bi/*` | Estúdio, configurações e publicações autenticadas |
| `/administracao/bi/smarttv` | Montagem da programação de TV |
| `/Smarttv` | Player público municipal padrão |
| `/smarttv` | Redirecionamento para a grafia canônica `/Smarttv` |
| `/portal/bi` | Biblioteca pública de BI |
| `/portal/bi/p/<publicacao>` | Painel, objeto ou relatório publicado |
| `/portal/bi/embed/<publicacao>` | Incorporação no site institucional |
| `/api/public/bi/smarttv` | Manifesto público: identidade, versão, páginas, vigência e política de atualização |
| `/api/public/bi/publicacoes/<id>/dados` | Dataset limitado à publicação pública selecionada |

Os nomes de API são contrato de planejamento e serão ajustados ao padrão existente durante a implementação. IDs de itens internos, parâmetros de fonte ou filtros enviados pelo cliente não dão acesso a consultas administrativas. A consulta pública verifica a publicação ativa e aplica seu recorte no servidor.

### 4.4 Pontos concretos de integração

- `src/proxy.ts`: reconhecer `/Smarttv` e o alias exato antes do rewrite administrativo e da exigência de sessão. Liberar apenas as rotas previstas. Os endpoints `/api` já não passam pelo matcher atual, portanto verificam sua própria política de acesso.
- Página pública dedicada sugerida em `src/app/Smarttv/page.tsx`, com componentes do player separados do shell operacional. Consultar os guias da versão Next instalada antes de implementar.
- `src/app/layout.tsx` inclui `CookieConsent` global: conferir sua renderização e prever comportamento apropriado à rota de exibição para que nenhum overlay cubra conteúdo na TV.
- `src/db/schema/administration.ts`: reutilizar identidade e logo existentes.
- `src/app/app-domain/administracao/navigation.ts`: integrar o estúdio e Smart TV na navegação.
- `src/lib/administration/bi-*` e repositórios atuais: reaproveitar semântica e exportações, verificando consumidores antes de alterar contratos.
- `src/lib/reports/*`: ampliar editor e renderizadores mantendo o controle de emissão e auditoria.
- `next.config.ts`: configurar embed por domínio autorizado na rota própria, tratando o conflito com `X-Frame-Options: SAMEORIGIN` global. A abertura direta de `/Smarttv` não depende dessa alteração.
- Blob/mídias: disponibilizar no player somente imagens vinculadas à publicação pública; validar tipo/tamanho e definir tratamento de arquivos substituídos ainda usados por versões ativas.

### 4.5 Atualização e desempenho

Separar manifesto, dados e mídias. Reutilizar snapshots entre TVs para a mesma versão/filtros/período. Não reutilizar cache interno como público. Combinar chave de versão com identidade da fonte e recorte para impedir mistura entre publicações.

Adotar inicialmente polling de versão e revalidação dos dados por TTL. Usar lease persistida para impedir que várias TVs recalculem simultaneamente o mesmo snapshot vencido. Para atualização independente de espectadores, adicionar agendador/jobs com repetição; timers locais do processo não serão responsáveis por tarefas persistentes na Vercel.

Publicar/retirar conteúdo invalida o manifesto, e o TTL público máximo dele acompanha a meta de 60 segundos. Evitar cache longo de HTML/manifesto que impeça a TV de detectar retirada. Mídias versionadas podem ter cache longo quando seu ciclo de vida permitir.

## 5. Etapas de implantação e aceite

A fundação de publicação/consulta agregada e a primeira TV operacional da E2 estão implementadas e homologadas em navegador conectado. Os demais componentes da E1, as etapas E3–E5 e a homologação em TV real/entrada em produção da E6 seguem pendentes. As dependências definem a sequência de trabalho; não representam prazo fechado.

| Etapa | Entregas executáveis | Dependências | Critério de conclusão |
| --- | --- | --- | --- |
| E1 — Fundação | Contratos de fontes, semântica dos indicadores, schema Drizzle, migrações, projetos/permissões, publicações e identidade municipal | Diagnóstico existente | Migrações conferidas; consultas e escopos validados; totais conciliados |
| E2 — Primeira TV operacional | Adaptar o painel administrativo como modelo publicável; editor de programação com dashboard/imagem/mista; `/Smarttv`; rotação; logo/nome/legendas; snapshot público | E1 | Link aberto sem sessão e três páginas reais em rotação, incluindo imagem e dados, com atualização comprovada |
| E3 — Estúdio de autosserviço | Indicadores/fórmulas, gráficos, filtros, período inicial, tabelas dinâmicas, drill-down real e editor de painéis | E1; integração com E2 | Servidor cria, salva, reabre e publica análise/painel próprio; consegue incluí-lo na programação já existente |
| E4 — Relatórios e exportações | Editor de relatórios, preview, agrupamentos, subtotais e renderizadores dos formatos da POC | E3 | Relatório salvo e conciliado; cada formato exigido abre corretamente e contém resultados completos |
| E5 — Portal e mobilidade | Biblioteca, links públicos de objetos/relatórios, filtros externos, embed, grupos e visualização móvel instalável conforme aceite | E3/E4; mecanismo público de E2 | Publicações abertas em janela anônima e site externo; grupos verificados; mesma publicação no celular e TV |
| E6 — Homologação e entrada em produção | Rodada dos 17 itens, ensaio contínuo na TV-alvo, documentação operacional, treinamento e publicação pelo fluxo do repositório | E2–E5 | Evidências por requisito; build aprovado; domínio/rotas e dados confirmados após deploy |

A E2 antecipa a experiência pública solicitada usando o mesmo modelo de publicação que receberá os painéis criados na E3. Ao concluir E2 será possível demonstrar a TV; a cobertura integral da POC depende das demais etapas.

Exportações previstas em E4: PDF, PNG, JPG, GIF, CSV, XLSX, XLS, DOCX, RTF, HTML, MHT e TXT. Conferir a redação exata de aceite para os formatos alternativos, implementar codecs/renderizadores reais e verificar MIME, bytes, abertura e fidelidade. Reutilizar CSV/XLSX existentes e infraestrutura de relatórios onde aplicável.

## 6. Cobertura da POC por etapa

| Requisitos da matriz de diagnóstico | Entrega principal | Evidência |
| --- | --- | --- |
| 1 e 3 — Link sem login/site institucional | E2/E5 | Acesso anônimo ao player e a gráfico/relatório, mais embed no site |
| 2 — Gráficos com drill-down | E3 | Navegação por níveis reais mantendo filtros e reconciliação dos totais |
| 4 e 5 — Filtros externos e período inicial | E3/E5 | Configuração persistida, reabertura e uso em publicação |
| 6 e 7 — Tabelas self-service e editor de painéis | E3 | Usuário cria e altera composição sem editar código |
| 8 e 10 — Relatórios e exportações | E4 | Relatório salvo; arquivos válidos em cada formato cobrado |
| 9 — Portal web | E5 | Biblioteca e visualização das publicações |
| 11 — Grupos | E1/E5 | Duas contas com audiências distintas e operações verificadas |
| 12 — Aplicativo móvel | E5 | Instalação e visualização em aparelho real; PWA se aceita, app nativo se exigido |
| 13 — Atualização configurável | E2/E3 | Alteração real refletida após intervalo configurado, com nova captura |
| 14 — Seleção de objetos | E2/E3 | Servidor altera os objetos do painel/página publicada |
| 15 — Smart TV com rotação | E2/E6 | Múltiplas páginas e tempos configurados em equipamento real |
| 16 e 17 — Dispositivos e compartilhamento | E2/E5 | Mesmo link/publicação em desktop, celular e TV |

O link compartilhado atenderá a experiência proposta de visualização entre dispositivos. Uma eventual exigência de controle sincronizado pelo celular terá sessão de apresentação própria; usar o mesmo link não sincroniza automaticamente o slide de TVs abertas em horários diferentes.

## 7. Homologação prática

### 7.1 Validação técnica

- Testes significativos de escopo/grupos, consulta pública, fórmulas, datas, paginação integral, publicação/versionamento e expiração de snapshots.
- Regressão das exportações e do painel administrativo existentes.
- Teste de `/Smarttv` e `/smarttv` no domínio do sistema sem cookies; verificar que as rotas internas continuam exigindo sessão.
- Verificar resposta pública e recursos do browser: somente campos e mídias publicados.
- Validar polling, troca consistente de versão, atualização concorrente, perda de rede, retorno da conexão e retirada de conteúdo.
- Ensaio visual com textos longos, logo ausente, imagens de proporções distintas, poucos/muitos dados, resultado vazio e número zero.
- Conferir legibilidade, ausência de cortes/rolagem e uso de controle remoto em 720p/1080p e TV real.
- Rodar verificações de tipos/lint pertinentes e `npm run build` antes de commit/push.

### 7.2 Roteiro de demonstração

1. Criar análise de demandas e configurar filtros/período.
2. Gerar indicador, tabela e gráfico; usar drill-down.
3. Montar/publicar painel e emitir relatório, conferindo os totais e formatos.
4. Na configuração Smart TV, criar três páginas: visão geral, comparativo e imagem/comunicado com legenda.
5. Ajustar durações e manter identidade municipal no cabeçalho/rodapé.
6. Publicar e abrir `https://guarama.celeriflow.com.br/Smarttv` sem sessão na TV e no celular.
7. Observar ao menos dois ciclos completos; depois alterar um dado e comprovar nova captura.
8. Editar rascunho sem mudar a TV; publicar e observar a nova versão entrar.
9. Demonstrar leitura por grupos no ambiente interno, publicação no portal e embed.
10. Simular indisponibilidade e retomada; restaurar uma versão anterior da programação.

Meta operacional de homologação: um ensaio contínuo de duas horas no equipamento-alvo, incluindo ciclos, atualização, reconexão e ausência de overlays. Registrar modelo/navegador da TV e capturas por requisito; navegador desktop em resolução de TV complementa, mas não substitui o equipamento.

## 8. Entrada em produção e operação

1. Preparar migrações aditivas, executar o planejamento oficial e conferir sua aplicação no banco de destino.
2. Concluir build/checks e preparar identidade, primeiras páginas e imagens reais de divulgação.
3. Publicar pelo fluxo GitHub → Vercel com a identidade local/credencial `Robonuvem-dev`, conforme as regras do repositório.
4. Conferir o deploy e testar a URL exata em janela anônima no domínio público.
5. Publicar a primeira programação; cadastrar o link nos favoritos da TV e habilitar tela cheia/quiosque conforme equipamento.
6. Orientar servidores sobre rascunho, publicação, legenda, vigência, qualidade das imagens e restauração de versões.
7. Acompanhar falhas de fonte, idade dos snapshots e versão pública em uso. Para problemas de conteúdo, restaurar versão ou retirar a programação; para regressão técnica, restaurar o deploy compatível mantendo as migrações aditivas.

Indicadores operacionais iniciais: última captura válida por fonte, falhas de atualização, duração das consultas e versão da programação publicada. Telemetria individual de TVs fica prevista como evolução se necessária; o funcionamento do link público não depende de identificar cada dispositivo.

## 9. Ordem de início

Unidade inicial executada: bases de publicação/consulta agregada e primeira versão utilizável de `/Smarttv`, conforme [registro de implementação](IMPLEMENTACAO_BI_SMARTTV.md). Próxima unidade: completar projetos/grupos da **E1** e o estúdio da **E3**, habilitando os servidores a criarem os próprios BIs e incluí-los nessa mesma programação. **E4–E6** completam os requisitos e a implantação integral.
