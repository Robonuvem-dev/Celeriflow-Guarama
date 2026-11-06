# Checkup geral — 06/11/2026

## Resultado executivo

**Integração final:** dois pulls incorporaram 37 commits remotos. O build completo integrado passou, bundle `QFOYnJkrDcXOFYhhqbe3w` (17 partições de tipagem e 114 páginas estáticas); 3.833 hashes de fontes/configurações conferidos. Tipagem auxiliar 12/12, 38 testes dos fluxos sobrepostos e 12 testes das correções finais aprovados. O reteste autenticado de 69 cenários ficou bloqueado antes de iniciar porque o Chrome autorizado foi desconectado. A checagem de runtime também identificou **cota excedida do banco (`53000`)**, com saúde **503 local e na produção anterior ao push**. A cobertura histórica abaixo mantém seus bundles de origem; ver `checkup/INTEGRACAO_PUBLICACAO_2026-11-06.md`.

Foram encontrados e corrigidos localmente problemas reais de navegação/layout, autenticação, detalhes com IDs codificados e hidratação. A cobertura publicada concluiu **todos os 485 itens internos e três externos dos menus**, abrangendo **1.137 destinos**. O **quinto build passou** e a rodada autenticada de 70 destinos terminou com **64 abertos, quatro exigências de vínculo pessoal de paciente e duas mensagens legítimas de acesso indisponível**, sem erros JavaScript/HTTP, 404 ou bloqueios de layout nos destinos exercitados. A repetição de todos os menus nesse bundle concluiu **459/459 destinos internos abertos**, cobrindo os **485/485 itens internos**, sem erros de página, console ou recursos HTTP. **Isso não homologa integralmente todos os CRUDs, estados e dispositivos.** A conta recebeu o vínculo fictício solicitado de Thiago Morcatty, com consultas pessoais e PDF de contracheque confirmados, conforme `checkup/THIAGO_MORCATTY_DEMO.md`.

| Verificação | Resultado e limite |
| --- | --- |
| Inventário de páginas | 789 arquivos `page`, incluindo rotas dinâmicas, entradas legadas e portais |
| Destinos dos menus operacionais | Nenhum destino interno sem rota física correspondente |
| Links literais locais | Nenhum destino sem rota física; aliases `/app-domain` são resolvidos pelo Proxy |
| Definições de navegação | 30 configurações compartilhadas, incluindo variantes de módulos |
| Produção, acesso anônimo | 49 destinos: 31 abriram, 13 exigiram login, **5 responderam HTTP 500**; nenhum HTTP 404 nessa rodada |
| Local após correções, acesso anônimo | Os mesmos 49 destinos: 31 abriram e 18 exigiram login, sem HTTP 500/404 |
| Navegador local, páginas reais | 8 casos aprovados; validação anônima e de redirecionamento, não das funcionalidades após login |
| Navegador, shell compartilhado | 1366×768 e 1280×720: menu expandido/recolhido e formulário paginado com 24 campos; payload integral preservado, sem overflow do documento |
| Banco configurado no projeto | 1.009 tabelas/definições esperadas confrontadas com metadados físicos: nenhuma tabela ou coluna esperada ausente |
| Testes principais | 57 aprovados, zero falhas na rodada final |
| Tributação, rodada adicional | 46 aprovados, zero falhas; arrecadação, econômico e cadeia financeira |
| Produção autenticada, entradas de módulos | 29 destinos com HTTP 200, sem HTTP 500/404, erros de página ou recursos HTTP falhos; diagnóstico CSP repetido no console, detalhado abaixo |
| Produção autenticada, páginas internas | 1.137 destinos observados após repetição de falhas transitórias: 1.072 abertos, 14 erros de renderização, 20 bloqueios de tabela, 7 erros internos, 14 não encontrados, 6 erros de recurso e 4 exigindo outra autenticação |
| Itens de menu | 485/485 internos observados (459 destinos distintos) e 3/3 saídas externas abertas com HTTP 200 |
| Todos os menus no quinto bundle local | 459/459 destinos internos abertos; 485/485 itens internos cobertos, 203 registros de interações seguras e zero erros de página/console/HTTP |
| Lint dos arquivos alterados | Aprovado |
| Builds completos | Quinto aprovado: 17 partições de tipos, compilação Next e 110 páginas estáticas; bundle `HHDyi0BcxF-ayZIhzfHrS` |
| Navegador no terceiro build de produção local | 18 destinos autenticados aprovados; shell único, sem erros de página, console, recursos HTTP ou overflow em 1366×768 |
| Interações no terceiro build local | 16/16 aprovadas em 1366×768, 1280×720, tablet e celular |
| Sessões/atas no quarto bundle | 6/6 aprovadas, incluindo gravação, preservação de rascunhos e proteção concorrente |
| Fluxos finais no quinto bundle | 6/6 em 1366×768 e 1280×720: Motor Fiscal, Usuários e arquivo/payload de Frota, sem erros JavaScript ou submissões de negócio |
| Novos exemplos no quinto bundle | 3/3: duas despesas solicitadas somando R$ 800,00; consulta SST e vínculo pessoal no Portal, às 9h de Brasília |
| Reteste dos 65 destinos problemáticos publicados | 59 abertos localmente, quatro exigem identidade de paciente e dois mostram restrição legítima à conta interna; reconciliação individual em `checkup/failure-reconciliation/REPORT.md` |
| Dados de apresentação | Rótulos revisados e exemplos persistidos; 25 destinos autenticados de produção sem marcadores/erros/bloqueios após as cargas; detalhes em `checkup/demonstration-data/REPAROS.md` |
| Releitura dos dados no quinto bundle | 459 menus, zero erros/bloqueios; três ocorrências técnicas de proveniência revisadas. Reconciliação mantém 116 telas com tabela sem linhas e 145 com mensagens de vazio no recorte padrão, sem equiparar vazio a defeito |
| Minutas de Planejamento | LDO/LOA em elaboração, audiência programada e contribuição em análise; 5/5 cenários de lista/detalhe/contexto aprovados |
| Cadastro funcional solicitado | Thiago Morcatty vinculado à conta; 23 pontos, férias, contracheque demonstrativo e consulta SST agendada. Consultas/PDF já confirmados; correção da ficha fiscal aprovada localmente e ainda não publicada |

## 1. Por que o menu mudava

`ClientLayout` escolhia o shell operacional por meio do registro de **listagens**. Esse registro exclui deliberadamente variantes como `view=manage`, além de não cadastrar todo formulário, detalhe e painel inicial. Quando uma dessas páginas era aberta, a escolha caía no layout antigo do módulo. A diferença entre formulário e tabela acabava alterando também o menu e o header.

### Correção

- A escolha da navegação foi separada da escolha do renderizador tabular.
- O shell identifica o módulo também nos formulários, detalhes e painéis, mantendo as exclusões de consulta para a composição do conteúdo.
- A barra lateral compartilhada permanece recolhível para ícones.
- Formulários/conteúdo complexo usam `OperationalPagedContent`, com navegação por partes no desktop e a política existente de tablet/celular.
- `PageFrame`, `PageHeader` e `ErpPageTitle` preservam a composição e os títulos dos formulários; a compactação específica de listagens continua restrita às listagens.
- As entradas públicas de login/recuperação do Portal do Servidor conservam sua composição própria.
- Controle Interno e Iluminação Pública também receberam resolução consistente de navegação.
- `/rh/pasta-funcional/[id]` foi registrado como listagem: havia uma tabela sem provider operacional reconhecido. O scanner passou a informar **zero rotas com provider ausente**.

### Cobertura estática por módulo prioritário

Contagem de arquivos físicos, não de todas as combinações possíveis de parâmetros/abas. As entradas legadas podem redirecionar. Existência de um handler dinâmico não comprova que todos os IDs ou valores de catálogo são válidos.

| Módulo/namespace | Páginas inventariadas | Revisão realizada |
| --- | ---: | --- |
| Compras e Contratos | 45 | Rotas físicas, navegação, formulários/detalhes com o mesmo shell; testes de ciclo contratual |
| Protocolos e Processos | 22 | Rotas/navegação; testes locais de abertura, publicação de fluxo, rollback, sequência e sigilo |
| RH e Folha | 61 | Rotas/navegação, variantes de gestão, pasta funcional e preservação de formulário |
| Tributação | 75 | Rotas/navegação e presença física de schema; testes específicos registrados abaixo |
| Financeiro | 32 | Rotas/navegação; consultas SSR com escopo, relações, valores decimais e payload N:N |
| Educação | 22 | Rotas/navegação; teste de ciclo de matrícula/histórico |
| Portal do Servidor | 38 | Rotas físicas, login público, resolução do shell e testes locais de autorização/bloqueio; duas páginas são públicas |
| Transparência administrativa | 17 | Rotas físicas e navegação; conteúdo autenticado não percorrido |
| Portal institucional/público | 58 | 49 destinos estáticos/entradas incluídos na rodada HTTP, com as páginas de login do sistema |

O inventário inclui ainda Administração, Atendimento, Cadastros, Câmara, Cemitérios, Configurações, Controle Interno, Cultura, Assinatura Digital/GED, Frotas, Iluminação, Meio Ambiente, Obras, Patrimônio, Planejamento, Saneamento, Saúde, Segurança, Social e SST. A relação arquivo a arquivo está em `checkup/routes.json`.

## 2. Erros de servidor encontrados em produção

| Rota | Antes, em produção sem sessão | Após correção, local |
| --- | --- | --- |
| `/portal/construcao-civil/autorizacoes` | HTTP 500 | Encaminha ao login administrativo, preservando destino |
| `/portal/construcao-civil/nova` | HTTP 500 | Encaminha ao login profissional, preservando destino/autorização |
| `/portal/construcao-civil/pedidos-administrativos` | HTTP 500 | Encaminha ao login administrativo |
| `/portal/convenentes` | HTTP 500 | Encaminha ao login administrativo |
| `/portal/departamentos/atestados` | HTTP 500 | Encaminha ao login administrativo |

As páginas chamavam verificadores de acesso que lançavam erro sem uma fronteira de página para tratar ausência de sessão. O helper `src/lib/platform/page-access.ts` encaminha erros 401 ao login e permite apresentar indisponibilidade de acesso em casos 403/423. Erros de infraestrutura continuam sendo propagados, evitando mascarar falhas reais de banco.

A mesma correção foi aplicada às páginas de detalhe/documentos/viabilidade da Construção Civil e ao layout de documentos após inspeção individual. Esses destinos dinâmicos tiveram revisão de código; não houve homologação de casos reais autenticados.

O Portal do Servidor também possuía um caso em que o bloqueio temporário lançava `Error` genérico. Agora usa `AccessError` com status 423, já tratado pelo layout funcional. Um teste local reproduz o bloqueio e confirma esse contrato.

**Publicação:** os resultados de produção registram a versão que estava publicada durante a coleta. O usuário autorizou pull, commit e push; dois pulls incorporaram 37 commits remotos até `8c849b1`. A validação integrada e a publicação estão registradas em `checkup/INTEGRACAO_PUBLICACAO_2026-11-06.md`; a cobertura histórica abaixo conserva sua versão de origem.

## 3. Desvios visuais ainda presentes

O scanner estrito de cobertura **não passou**. A integração do shell e o registro da pasta funcional corrigem a troca de menu/provider, mas não equivalem a migrar todas as tabelas adicionadas recentemente.

O scanner aponta 36 pontos de renderização HTML sem cadeia operacional reconhecida, além de reconciliação histórica pendente, grades de edição novas e componentes órfãos. Os 36 pontos foram classificados individualmente em 23 arquivos em `checkup/CLASSIFICACAO_TABELAS.md`: a lista mistura tabelas operacionais, grades contextuais e documentos/relatórios. A classificação não equivale à adequação nem altera a reprovação do scanner.

Exemplos para revisão:

- Compras: cadastros auxiliares, registro de preços externo e relatórios.
- Educação: disciplinas e licenças.
- Financeiro: cheques, acompanhamento decendial do ensino e fontes de recursos.
- Tributação: agrupamentos, declarações, fiscalização, ISS bancário, referências e relatórios cadastrais.
- Cemitérios: complementos/mapas e relatórios.
- GED: grades de regras e administração adicionadas depois do inventário histórico.

O detalhe do scanner está em `checkup/table-coverage.json`. O resultado histórico de aprovação citado em `ENTREGA_PADRAO_TABELAS.md` não deve ser interpretado como aprovação do estado atual.

## 4. Banco e testes

### Banco

`scripts/checkup-schema.ts` executa uma transação **READ ONLY**, consulta apenas metadados e confronta os nomes físicos das tabelas/colunas com as definições Drizzle e com o guard de login consultado por SQL direto.

- 1.009 definições esperadas.
- 1.122 tabelas/views com colunas visíveis nos metadados do schema público.
- Zero tabelas esperadas ausentes.
- Zero colunas esperadas ausentes.
- A inspeção inicial foi read-only. Na etapa posterior, o usuário solicitou expressamente a carga fictícia de Thiago Morcatty, aplicada no schema existente e detalhada em `checkup/THIAGO_MORCATTY_DEMO.md`; nenhuma migração/schema foi alterada.

Isso não certifica integridade de todos os dados, constraints, funções SQL, permissões por usuário ou integrações externas.

### Bases de teste

Os fixtures do Portal do Servidor e de Processos ainda não aplicavam duas migrações recentes. Foram ajustados para reproduzir os SQLs oficiais **em bancos locais descartáveis**, sem modificar os arquivos de migração.

O inventário financeiro ganhou cinco arquivos desde a referência histórica. Eles foram inspecionados individualmente e registrados como adições no manifesto de testes; as contagens e hashes do inventário histórico foram preservados.

### Rodada principal aprovada

57 testes, cobrindo:

- resolução do shell/listagens e limites públicos;
- geometria/paginação da base operacional;
- tratamento de autenticação das páginas;
- login funcional e bloqueio temporário;
- Proxy e retorno de login;
- ciclo de contratos, execução física e precisão monetária;
- matrículas e histórico educacional;
- consultas financeiras SSR, escopo UG e preservação de valores;
- processos, workflow, rollback, sequência e sigilo;
- fontes nativas da Transparência e critérios PNTP.

### Rodada adicional de Tributação

46 testes aprovados, zero falhas, com os arquivos `tax-financial-chain`, `drizzle-tax-collection-operations` e `drizzle-tax-economic`. Incluem importações/replay, DAS, DES-IF, parcelamento, benefícios, VAF, cadastro econômico, alvará/GED, arrecadação, compensação, restituição e estornos atômicos. São testes em bases isoladas, não mutações executadas no Chrome de produção.

### Navegação autenticada em produção

O histórico confirmou o uso de Chrome local independente, controlado por Playwright/CDP em `127.0.0.1:9337`. Esse método foi retomado e o usuário realizou o login. Cookies, tokens e estado de autenticação não foram exportados para os relatórios.

A primeira rodada abriu 29 destinos de entrada pelo navegador: todos retornaram HTTP 200, sem HTTP 500/404, erros JavaScript de página ou recursos HTTP falhos. O primeiro verificador marcou os 29 como `RESOURCE_ERROR` por uma mensagem idêntica de console: `upgrade-insecure-requests` é ignorado quando enviado em CSP report-only. Essa evidência bruta foi preservada em `checkup/authenticated-production-modules/report.json`; não deve ser interpretada como 29 falhas de abertura. A diretiva sem efeito foi removida localmente de `next.config.ts`, preservando os demais cabeçalhos. O verificador passou a registrar esse diagnóstico separadamente dos erros de execução.

Na entrada do Portal do Servidor, a sessão recebeu a mensagem **Acesso funcional indisponível**, com orientação de regularizar o vínculo ativo no RH. A conta administrativa não representa, por si só, uma identidade funcional para consultar dados pessoais. Transparência e Portal do Cidadão abriram suas entradas administrativas.

Após essa coleta inicial, o usuário pediu a criação do cadastro fictício de Thiago Morcatty como Coordenador de TI. A conta foi vinculada ao servidor e as consultas de ficha, ponto, férias, folha e contracheque/PDF passaram na validação autenticada. A evidência inicial foi preservada. A nova rodada identificou também 404 renderizado no detalhe fiscal de contribuintes novos e existentes; HTTP 200 sozinho não comprova abertura funcional.

A rodada ampliada percorre páginas estáticas, depois variantes de formulário obtidas dos links reais e amostras de detalhes com IDs obtidos da própria navegação. O relatório é salvo incrementalmente em `checkup/authenticated-production/report.json`; somente resultados concluídos podem ser considerados evidência. Abertura não comprova cadastro/alteração/exclusão ou todas as interações de cada tela.

### Ampliação solicitada: todos os itens internos dos menus

O solicitante apontou corretamente que verificar a primeira tela do módulo não atende à revisão de todos os itens internos. Foi acrescentado `scripts/checkup-all-menu-screens.mjs`, que relaciona **488 itens das 30 configurações de navegação**, com **459 destinos internos distintos**, e acrescenta páginas físicas estáticas, variantes de consulta e detalhes com IDs de links reais. O acompanhamento inicial está em `checkup/all-menu-production/MENU_COVERAGE.md`; a conclusão publicada está em `checkup/all-menu-production-retest/`. O JSON conserva erros, capturas e tentativas anteriores, e a execução pode ser retomada com `--resume`. O diagnóstico separa 404 renderizado com HTTP 200, erro interno, hidratação, recurso HTTP, acesso restrito, espaço insuficiente e falha de interação.

A coleta anterior foi preservada. Uma interrupção por bloqueio transitório de escrita de arquivo no Windows exigiu retomada; o coletor passou a usar checkpoints por substituição de arquivo e a conservar os destinos descobertos. Abas de teste são isoladas por destino para evitar que redirecionamentos tardios de uma tela contaminem a seguinte. Nenhum formulário de negócio é submetido por esse coletor.

**Correções locais adicionais, após reprodução autenticada:**

- A ficha fiscal recebia `THIAGO_MORCATTY_DEMO_2026_V1%3Ataxpayer` nos parâmetros da página, enquanto o ID persistido contém `:`. A normalização na fronteira da página resolveu a consulta de Thiago no navegador de desenvolvimento. Não foi alterado o ID persistido.
- A busca nominal fiscal gerava `LIKE '%%'` no CPF para termos sem dígitos. O predicado documental agora só é incluído com termo documental não vazio. A consulta real por `Morcatty` retornou uma pessoa; teste isolado cobre nome, CPF formatado, CNPJ alfanumérico, inscrição, endereço, ausência de resultado e paginação de 21 registros.
- O bloco de confirmação de senha de Tributação era irmão horizontal da tabela dentro do `main` flexível, consumindo a largura disponível. A confirmação e seu link de configuração foram preservados no painel compartilhado `OperationalFilters`, acionado pelo header. Em 1366×768, a listagem fiscal passou a dispor de **1.310 px**, com a linha encontrada visível e documento sem overflow. Não houve redução de campos nem CSS de célula específico do módulo.
- NFS-e lançava erro interno pela ausência de uma atividade de serviço ativa com alíquota de ISS. Passou a exibir a pendência de configuração com acesso à rotina existente de atividades/alíquotas. Isso não configura ISS nem homologa emissão de nota.
- Links de download de RH, comparativo fiscal e disponibilidade financeira passaram a usar navegação nativa, evitando prefetch de documentos como se fossem páginas React. Os três CSVs foram consultados autenticados por GET e retornaram HTTP 200 (72.744, 132 e 545 bytes, respectivamente).
- A auditoria de navegação rejeitava identificadores contendo `:` ou escapes percentuais. A validação agora admite esses identificadores, mantendo a proibição de query strings e dados de formulário no alvo.
- Foram explicitados os fusos de apresentação nas datas de pesquisa de preços, parametrizações de RH, sessões da Câmara, ativação de módulos, eventos e reservas culturais, após erros de hidratação observados em produção. A confirmação posterior no quinto bundle consta em `checkup/final-corrections-fifth-build/report.json`.

**Validações concluídas nesta ampliação:**

- Navegador autenticado, build local anterior: listagem e novo servidor apresentam a mesma sequência de links; registros funcionais e `?view=manage` também preservam a mesma sequência. Um workspace e um sidebar em cada caso, sem overflow do documento em 1366×768 (`checkup/local-authenticated/report.json`).
- Navegador autenticado de desenvolvimento, após as novas correções: ficha de Thiago, estado não configurado de NFS-e, busca fiscal nominal, comparativo anual, operações RH e disponibilidade financeira abriram sem erros JavaScript, console ou recursos HTTP (`checkup/local-corrections-development/report.json`).
- **14 testes aprovados**, zero falhas: busca fiscal com PostgreSQL isolado, resolução de shells e regressão do Proxy.
- Os builds subsequentes passaram; o quinto é a versão usada no reteste final descrito abaixo.

A tentativa adicional de interações em desenvolvimento (`checkup/menu-interactions-development/report.json`) registrou 3 casos aprovados e 13 não aprovados. Vários falharam pelo timeout de navegação de 30 segundos durante compilação: o log do servidor registrou compilações/requisições acima desse prazo. A emulação móvel ainda enviava identificação desktop e não valida a política de tablet/celular. O verificador foi ajustado para aguardar os elementos esperados, isolar cada cenário, tolerar o tempo de compilação e enviar identificação móvel realista. Esses casos serão repetidos no build local de produção; a tentativa anterior não deve ser convertida em aprovação nem tomada isoladamente como defeito funcional.

**Falhas adicionais constatadas naquela etapa:** em `camara/sessoes/SessoesClient.tsx`, os botões de nova sessão, gerenciamento e edição/visualização de atas não possuíam handlers nem destino. Foram implementados e validados posteriormente em seis cenários no quarto bundle. A coleta também identificou falta de espaço em Planejamento de Compras e Usuários; as correções foram confirmadas no quinto bundle.

### Atualização posterior: dados e novas falhas reais

- A retomada ampla terminou em `checkup/all-menu-production-retest/`: **1.137 destinos**, incluindo todos os **485 itens internos dos menus**, correspondentes a **459 destinos internos distintos**. As três entradas restantes são URLs externas; todas abriram HTTP 200 (`checkup/external-menu-production/report.json`). A contagem anterior de 460 destinos incluía `null`, usado para saídas externas, como se fosse um destino interno.
- A repetição com um trabalhador resolveu todos os erros transitórios de navegação/interação dessa rodada. Permaneceram na versão publicada 14 erros de renderização, 20 bloqueios de layout, sete erros internos, 14 páginas não encontradas, seis erros de recurso e quatro acessos que exigem autenticação própria. As correções locais correspondentes foram revalidadas no quinto bundle; não foram publicadas.
- O terceiro build completo passou; as **18 aberturas autenticadas locais** e **16 interações** citadas no quadro executivo confirmaram as correções anteriores de menu, Tributação, downloads e hidratação. Evidências: `checkup/local-corrections-production/report.json` e `checkup/menu-interactions-production/report.json`.
- A revisão de dados persistiu os exemplos e ajustes listados em `checkup/demonstration-data/REPAROS.md`, incluindo 1.014 nomes de referências RH e dois documentos baixáveis. Houve auditoria antes/depois; nenhuma migração/schema alterada.
- O censo final encontrou **zero marcadores em rótulos primários**, 1.117 tabelas físicas, **784 vazias** (809 inicialmente) e zero erros. Os marcadores técnicos restantes foram classificados por proveniência e dependências; não são tratados como nomes incorretos automaticamente.
- A validação dos novos registros revelou o mesmo problema de ID codificado em detalhes/edições de Compras, RH, Patrimônio, Social, SST e Planejamento. Cada página foi lida antes de normalizar o ID na fronteira da rota, preservando os parâmetros e verificações de acesso existentes.
- Saúde, Social, Notificações, Assinadores e o painel de workflow de Licitações receberam fuso de apresentação explícito após erros observados de hidratação.
- O ASO em branco sem UG deixou de exigir um parâmetro inexistente por exceção: oferece a seleção da unidade antes da emissão, mantendo a autorização clínica no acesso ao documento.
- As seis listagens não documentais do GED e Movimentos de Frota receberam correções de composição flexível, preservando a tabela e os formulários compartilhados. Planejamento de Compras e Usuários abriram sem bloqueio no terceiro bundle local; os bloqueios registrados referem-se à versão publicada anterior.
- Os botões de nova sessão, gerenciamento e visualização/edição de atas foram implementados localmente, com validação de campos, permissões, auditoria, proteção de edição concorrente e edição somente de atas em rascunho. No quarto bundle, **6/6 testes interativos passaram**: rascunhos preservados, sessão fictícia 8205 gravada em estado Agendada, horário de Brasília preservado, leitura integral da ata, gravação do texto inalterado e rejeição de edição concorrente. Evidência: `checkup/chamber-sessions-fourth-build-retest/report.json`.
- O **quarto build completo passou**, incluindo as 17 partições de tipagem e a compilação de produção. A rodada autenticada seguinte percorreu **65 destinos**: 60 classificados como abertos e cinco problemas remanescentes. Entre os 60 há duas páginas de Construção Civil que mostram a indisponibilidade de acesso para a conta interna, corretamente e sem erro 500; não são homologação do portal profissional. Evidência: `checkup/latest-fixes-fourth-build/report.json`.
- Os cinco remanescentes foram diagnosticados: Motor Fiscal e Usuários ainda deixavam formulários auxiliares ocupar a altura da tabela; dois detalhes da Ouvidoria e a edição de Almoxarifado também precisavam da normalização do ID. As correções subsequentes movem os formulários para a organização paginada compartilhada, mantendo-os montados para preservar rascunhos. O CSV de Frota também recebeu preservação explícita de arquivo e campos ao fechar/reabrir o painel.
- A primeira tentativa em desenvolvimento após esses ajustes foi interrompida por falta de espaço no cache Turbopack. Seus 15 erros de navegação são evidência de infraestrutura, não aprovação nem 15 falhas funcionais. Somente caches gerados foram removidos. Na tentativa posterior com webpack foi identificado um problema de `bufferUtil.mask` no WebSocket do ambiente de desenvolvimento; a repetição usa `WS_NO_BUFFER_UTIL=1`, sem alterar a aplicação publicada.
- O **quinto build completo passou**, com código 0: 17 partições de tipagem, compilação Next.js e 110 páginas estáticas. Bundle `HHDyi0BcxF-ayZIhzfHrS`, gravado às 17:08:24 UTC. Os 101 arquivos locais da aplicação registrados em `checkup/fifth-build-source-state.json`, capturados antes da compilação final, conservaram os mesmos hashes; nenhuma edição ficou posterior ao bundle. A validação autenticada pós-build está em execução na porta 3100, com servidor `TZ=UTC` e navegador em `America/Sao_Paulo`.
- A repetição isolada dos fluxos de Motor Fiscal, Usuários e Frota passou em **6/6 cenários**, em 1366×768 e 1280×720, sem erros JavaScript e sem envio de Server Actions de negócio. Foram conferidos busca, altura da tabela, rascunhos de formulários/perfis e payload integral do CSV após fechar/reabrir o painel. Evidência: `checkup/final-workflows-isolated/report.json` (desenvolvimento, não quinto bundle).
- A preparação da biblioteca foi repetida e retornou zero inclusões. Foi aplicado o pacote adicional `CHECKUP_FINANCE_SST_2026_V1`, após prévia com rollback: duas solicitações orçamentárias em **Solicitada**, duas disponibilidades SST e uma consulta de Thiago em **BOOKED**, às 9h de Brasília de 30/11/2026. A repetição retornou zero alterações; tipagem e ESLint passaram. A confirmação autenticada das novas telas no quinto bundle passou em **3/3**, com valores, estado, identidade profissional, horário da consulta e próximo horário de 9h30 conferidos; evidência em `checkup/finance-sst-samples-fifth-build/report.json`.
- As novas amostras revelaram formatação dependente do fuso do servidor na agenda SST e do Portal. As cinco páginas/componentes pertinentes foram lidas individualmente e passaram a explicitar `America/Sao_Paulo` na apresentação dos instantes. Esses ajustes foram feitos antes da compilação do quinto bundle e foram confirmados nele, com servidor em UTC e navegador no fuso de Brasília.
- Confirmação no quinto bundle: **6/6 fluxos finais aprovados**, em `checkup/final-workflows-fifth-build/report.json`; **70 aberturas concluídas**, em `checkup/final-corrections-fifth-build/report.json`. Os detalhes de Ouvidoria em Protocolos/Atendimento e a edição de Almoxarifado abriram HTTP 200, sem erro de hidratação ou 404 renderizado. A reconciliação dos 65 resultados inicialmente problemáticos retornou 59 `OPENED_LOCALLY`, quatro `SEPARATE_PATIENT_IDENTITY_REQUIRED` e dois `EXPECTED_ACCESS_MESSAGE`.
- Revisão adicional dos vazios: `CHECKUP_PREVENCAO_2026_V1` acrescentou programação SIPAT e visita técnica futuras, com pessoa responsável canônica, pelo serviço auditado. Prévia com rollback, tipagem, ESLint e repetição idempotente passaram. **3/3 cenários autenticados** de listagem e detalhes passaram no quinto bundle, conforme `checkup/prevention-samples-fifth-build/report.json`. Construção Civil foi inspecionada separadamente: os catálogos e imóveis existem, mas faltam configuração/formulário publicados e roteiro de tipo/assunto urbanístico para abertura; evidência e pendência registradas em `checkup/demonstration-data/REPAROS.md`.
- A repetição completa dos menus no quinto bundle terminou em **459/459 destinos internos abertos**, cobrindo **485/485 itens internos**, com zero erros JavaScript, de console ou HTTP e 203 registros de interações seguras. Evidência: `checkup/all-menu-fifth-build/report.json`. A ampliação às variantes e detalhes concluiu **1.169 destinos**, continuando a evidência dos menus dessa mesma origem/bundle, sem importar aprovações da versão publicada. Foram **1.159 abertos, quatro exigências de identidade de paciente, duas restrições legítimas, três 404 e um erro interno**. Os quatro problemas adicionais ocorreram em perfil/bloqueio de imóvel, relatório de pesquisa de preços e manutenção do PPA. As páginas não decodificavam os IDs como suas telas principais; fontes corrigidas e sexto build/reteste em preparação. Evidência original preservada em `checkup/all-screens-fifth-build/report.json`.
- Dez referências auxiliares fiscais foram acrescentadas pelo serviço versionado/auditado, com prévia rollback e reexecução idempotente. **5/5 cenários autenticados** dos cinco catálogos passaram, incluindo busca, código e origem; evidência em `checkup/tax-reference-samples-fifth-build-retest/report.json`. O novo censo read-only pós-cargas registrou **1.117 tabelas, 777 vazias, zero marcadores em rótulos primários e zero erros de consulta**; a situação de vazios continua dependente do fluxo e da tela.
- A ausência de LDO/LOA de apresentação foi resolvida com duas minutas encadeadas ao PPA existente, além de audiência programada e contribuição comunitária pendente. **5/5 cenários** de consulta, detalhe e contexto passaram no quinto bundle em `checkup/planning-draft-samples-fifth-build-retest/report.json`; repetição da carga retornou zero alterações. O censo posterior retornou **1.117 tabelas, 773 vazias, zero marcadores em rótulos primários e zero erros**. As previsões/metas das novas minutas permanecem vazias e não houve aprovação/publicação legal.
- A releitura de apresentação terminou em **459 destinos**, com três ocorrências de proveniência técnica revistas individualmente e nenhum erro/bloqueio. A reconciliação com as novas amostras de Planejamento preserva **116 telas com tabela sem linhas** e **145 com mensagem de vazio** no recorte padrão; filtros, ausência de pendências, vínculos e fluxos precisam de revisão individual. Evidência: `checkup/demonstration-data/current-visible-review/REPORT.md`.
- O vínculo faltante de centro de custo do contrato fictício de Thiago foi completado por revisão contratual 2, vigente em 06/11, pelo serviço auditado de RH. Prévia, tipagem e ESLint passaram; repetição idempotente com zero alterações e **2/2 cenários autenticados** de estatística atual/histórica aprovados. Conteúdo do demonstrativo fechado de outubro e consulta histórica preservados por comparação integral antes/depois. Evidência: `checkup/thiago-workforce-cost-samples-fifth-build/report.json`.

## 5. Evidências e reprodução

| Artefato | Conteúdo |
| --- | --- |
| `checkup/routes.json` | Inventário estático final por arquivo/rota |
| `checkup/production/routes.json` | Rodada HTTP anônima na versão publicada, antes das correções |
| `checkup/local/routes.json` | Rodada HTTP anônima local após correções |
| `checkup/schema.json` | Confronto read-only de metadados do banco |
| `checkup/table-coverage.json` | Resultado e bloqueadores do scanner de tabelas |
| `checkup/CLASSIFICACAO_TABELAS.md` | Classificação individual dos 36 pontos e das grades/órfãos |
| `checkup/authenticated-production-modules/report.json` | Primeira rodada autenticada: 29 entradas e diagnóstico CSP bruto |
| `checkup/authenticated-production/report.json` | Rodada autenticada ampliada, incremental enquanto em execução |
| `checkup/all-menu-production/MENU_COVERAGE.md` | Cada um dos 488 itens de menu com resultado individual |
| `checkup/all-menu-production/report.json` | Menus, páginas internas, variantes, interações seguras, erros e capturas; checkpoint retomável |
| `checkup/local-authenticated/report.json` | Comparação autenticada de menus entre listagem, formulário e variante de gestão no build local |
| `checkup/local-corrections-development/report.json` | Reprodução autenticada e verificação das seis telas após as correções adicionais |
| `checkup/shell-browser.json` | Preservação de 24 campos e geometria em duas dimensões desktop |
| `checkup/screenshots/` | Capturas do shell com dados controlados |
| `checkup/browser/` | Capturas de páginas reais e relatório de navegador local |
| `checkup/browser-production-build/` | Oito páginas reais anônimas no segundo build aprovado, sem erros de console/hidratação |
| `checkup/THIAGO_MORCATTY_DEMO.md` | Cadastro funcional solicitado, aplicação, consultas confirmadas e limites encontrados |
| `checkup/thiago-morcatty-browser/` | Capturas autenticadas, relatório e PDF do contracheque fictício |
| `checkup/final-corrections-fifth-build/report.json` | 70 destinos autenticados no quinto bundle: 64 abertos e seis restrições esperadas |
| `checkup/all-menu-fifth-build/report.json` | Todos os menus no quinto bundle: 459/459 destinos internos abertos, cobrindo 485 itens internos |
| `checkup/failure-reconciliation/REPORT.md` | Reconciliação individual dos 65 destinos problemáticos da versão publicada |
| `checkup/final-workflows-fifth-build/report.json` | Seis cenários de Motor Fiscal, Usuários e Frota em dois tamanhos notebook |
| `checkup/finance-sst-samples-fifth-build/report.json` | Três cenários de Orçamento e agenda SST integrada |
| `checkup/prevention-samples-fifth-build/report.json` | Listagem e dois detalhes da programação preventiva, três cenários aprovados |
| `checkup/prevention-sipat-pagination-fifth-build/report.json` | Navegação para a segunda parte da programação, com segunda atividade dentro da área visível |
| `checkup/tax-reference-samples-fifth-build-retest/report.json` | Cinco catálogos fiscais com códigos, origem e busca conferidos |
| `checkup/planning-draft-samples-fifth-build-retest/report.json` | Cinco cenários de LDO/LOA e contribuição comunitária em análise |
| `checkup/demonstration-data/current-visible-review/REPORT.md` | Reconciliação dos 459 menus, com marcadores técnicos e todos os vazios observados |

```powershell
node scripts/checkup-routes.mjs
node --conditions=react-server --import tsx scripts/checkup-schema.ts
node scripts/checkup-operational-shell.mjs

# Com um servidor local já iniciado:
$env:CHECKUP_OUTPUT = 'docs/checkup/local'
node scripts/checkup-routes.mjs --base-url=http://localhost:3100
node scripts/checkup-browser.mjs

# Com Chrome/CDP aberto e sessão do usuário autenticada:
$env:CHECKUP_AUTH_SCOPE = 'all'
node scripts/checkup-authenticated-browser.mjs
node scripts/checkup-all-menu-screens.mjs --resume

# Rodada principal:
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/operational-routes.test.ts tests/operational-table.test.ts tests/portal-page-access.test.ts tests/employee-portal-routes.test.ts tests/employee-portal-login.test.ts tests/portal-proxy.test.ts tests/processes-portals-drizzle.test.ts tests/finance-pages-static.test.ts tests/finance-pages-drizzle.test.ts tests/education-enrollment-lifecycle.test.ts tests/contract-lifecycle.test.ts tests/transparency-native.test.ts

# Build sem execução automática de SQL de deploy:
$env:VERCEL_ENV = 'preview'
npm run build
```

## 6. Pendências para homologação integral

1. Concluir a repetição local de menus e dos cinco problemas remanescentes, além das interações finais de formulários. Todos os 485 itens internos e três externos já foram observados na versão publicada; isso não homologa todos os CRUDs e estados.
2. Ampliar detalhes/variantes além dos 1.137 destinos já observados, quando surgirem outros IDs ou parâmetros: a amostragem de um registro não homologa todos os valores de uma rota dinâmica.
3. Adequar os pontos operacionais/contextuais e as grades novas conforme a classificação individual, preservando a semântica dos documentos/relatórios.
4. Confirmar a interface real de cada formulário/tabela com dados representativos e a matriz de dispositivos/zoom. Os dois cenários do shell compartilhado não homologam todas as telas.
5. Após publicação autorizada, repetir as verificações na nova versão de produção.
6. Confirmar no novo build e, após publicação autorizada, em produção: normalização do ID fiscal, busca nominal, geometria de Tributação, pendência de configuração NFS-e, downloads e hidratação. As correções adicionais têm evidência autenticada de desenvolvimento, distinta da validação da versão publicada.
