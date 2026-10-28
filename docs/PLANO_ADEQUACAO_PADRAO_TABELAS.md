# CeleriFlow — auditoria e plano de adequação das tabelas

**Data:** 28/10/2026  
**Base de código inspecionada:** `0831a93` — `ajuste de links e cards`  
**Referência de requisitos:** [Padrão de Tabelas.md](Padr%C3%A3o%20de%20Tabelas.md), versão 1.1.

**Estado:** diagnóstico e planejamento; nenhuma tela foi alterada nesta auditoria.

**Revisão do plano após a validação do piloto:** o menu deve recolher para uma barra de ícones, como na entrada de Água e Saneamento, e não desaparecer. Ícones nas células são condicionais: só quando o valor não cabe ou quando o campo precisa de visualização composta. Uma barra de ícones funcional não é um desvio de R10, e texto integral que cabe não deve receber acionador redundante. As contagens e medições abaixo continuam identificadas pelo snapshot original; a interpretação e os próximos ajustes seguem a revisão 1.1.

## 1. Resposta objetiva e quantidade antes de começar

**As tabelas do sistema não atendem integralmente ao padrão solicitado.** A base de trabalho identificada é:

| Medida | Quantidade | Significado |
|---|---:|---|
| Arquivos de código analisados em `src` | **2.531** | Leitura estática, excluindo testes e arquivos gerados |
| Estruturas tabulares lógicas inventariadas | **343** | 332 tabelas/componentes e 11 grades de dados em CSS Grid |
| Arquivos que contêm essas estruturas | **298** | Um arquivo pode conter várias tabelas |
| Estruturas operacionais/consultas ligadas a rotas | **330** | Base inicial da adequação, incluindo componentes compartilhados |
| Estruturas operacionais legadas, sem rota consumidora identificada | **6** | Avaliar uso antes de migrar ou excluir |
| Estruturas de formatos especiais | **7** | Documentos, relatórios de impressão e tabela informativa, sem impor 20 linhas |
| Rotas-template relacionadas às estruturas inventariadas | **340** | 330 internas e 10 públicas; inclui os formatos especiais |
| Grades CSS repetidas de edição/seleção, inventariadas à parte | **32** | 30 ligadas a rotas e duas no componente legado de Planejamento; exigem tratamento estrutural |
| Conformidade integral comprovada com o novo documento | **0** | Não há uma base que reúna todos os requisitos nem validação integral de todas as telas |

**330 + 6 + 7 = 343.** Os 298 arquivos e as 340 rotas não se somam às 343 estruturas: são outras formas de medir o mesmo inventário.

### Quantidade a usar para planejar a execução

1. **330 estruturas operacionais com rota** para adequação e validação.
2. **32 grades CSS de edição/seleção** em uma frente de tratamento estrutural, sendo 30 ligadas a rotas e duas legadas.
3. **6 estruturas legadas** para decisão de manutenção/reuso, sem exclusão automática.
4. **7 formatos especiais** para manter os requisitos próprios de documento/relatório.

Esses números contam **implementações/templates**, não registros do banco e não todas as combinações de abas, parâmetros e dados. Uma tabela configurável pode atender muitas rotas e ter vários conjuntos de colunas. Cada variante relevante deverá ser validada na execução.

As 32 grades CSS não duplicam as tabelas do total de 343. Grades editáveis que já usam tabela HTML, como chamada/notas de Educação, estão nesse total e também precisam da análise de contexto de edição.

Não há evidência de uma implementação integral já aprovada. Nas 330 estruturas operacionais ligadas a rotas, **321 não apresentam mecanismo de redimensionamento identificado**; as outras **9 têm implementações parciais** que também apresentam desvios documentados abaixo. Portanto, o planejamento não considera nenhuma delas dispensada de adequação.

## 2. Escopo, método e limites da contagem

Foi respeitada a instrução mais recente do proprietário: **analisar e apresentar quantidades e plano antes de começar os ajustes**. As orientações de implementação contínua do documento de referência não foram executadas nesta entrega.

### 2.1 Varredura estática

Foi criado `scripts/audit-table-pattern.mjs`, um inventário de leitura que utiliza o parser do TypeScript e não altera telas nem consulta o banco. Ele identifica:

- Tabelas HTML, `Table` da UI, `ErpTableContainer`, `SanitationTable` e `ResizableTable`, incluindo aliases importados.
- Componentes compartilhados, helpers de renderização em TSX e reexportações utilizados pelas páginas.
- Localização por **arquivo, linha e coluna**, cabeçalhos reconhecíveis, sinais de paginação, redimensionamento, colunas escondidas, empilhamento e rolagem declarada.
- Grades CSS repetidas e outros candidatos a visualização de registros.
- Relação estática com arquivos `page.tsx`. Isso não certifica navegação com todos os perfis nem a acessibilidade de todos os parâmetros.

As 48 grades CSS explícitas encontradas foram classificadas para o snapshot auditado:

| Classificação | Quantidade | Tratamento |
|---|---:|---|
| Grades tabulares de dados | 11 | Incluídas nas 343 estruturas |
| Grades de edição/seleção | 32 | Frente estrutural separada |
| Listagens em cartões | 2 | Conferir aplicabilidade; não contadas novamente como tabelas |
| Gráficos | 2 | Não impor paginação tabular de 20 |
| Conteúdo informativo | 1 | Requisito próprio |

A varredura ampla também catalogou **857 expressões de repetição JSX candidatas**. Elas incluem menus, campos de formulário, indicadores, fichas, históricos e listagens em cartões; **não são 857 tabelas** e se sobrepõem às grades CSS. Não somar esse número ao escopo. A conversão de outras visualizações não tabulares deve ser avaliada por contexto, sobretudo em Frotas, Obras, Saúde e Portal do Paciente, sem chamar qualquer conjunto de cartões de tabela automaticamente.

### 2.2 Exclusões e prevenção de contagem duplicada

- Quatro `<table>` internos de componentes-base não foram somados novamente aos seus consumidores.
- Uma tabela duplicada exclusivamente para impressão em `CompactItemsTable.tsx` foi separada do modo operacional.
- Uma tabela HTML indevidamente aninhada em `ErpTableContainer`, em Saúde, foi registrada como defeito estrutural e não como segunda listagem lógica.
- Foram encontrados 20 fragmentos de `<table>` em strings de geração de HTML/relatórios. São fragmentos de código de saída, não necessariamente 20 relatórios diferentes, e não entram como listagens de tela.
- Os sete formatos especiais foram classificados após inspeção de seu objetivo. Consultas e prévias de relatórios que funcionam como listagens continuam na reserva operacional; sua aplicabilidade deve ser decidida quando houver conflito estrutural.

### 2.3 O que significa um sinal estático

Uma referência a `Pagination`, um `pageSize = 20`, `overflow-auto` ou `truncate` no arquivo **não prova**, isoladamente, o comportamento daquela tabela. A paginação pode estar no pai, uma segunda tabela pode usar o mesmo rodapé, e CSS/ancestrais podem mudar a geometria.

Por isso, os números abaixo diferenciam inventário, indícios de código e medições reais. Não foi declarado que 340 rotas passaram por homologação visual; a amostra de navegador está explicitada na seção 5.

## 3. Quantidade por módulo e origem

As colunas "operacionais com rota", "legadas" e "especiais" somam o total de cada linha. Os componentes compartilhados são contados uma única vez em sua origem.

| Módulo/origem | Total tabular | Operacionais com rota | Legadas | Especiais | Arquivos |
|---|---:|---:|---:|---:|---:|
| Administração | 8 | 7 | 1 | 0 | 8 |
| Atendimento | 3 | 2 | 1 | 0 | 3 |
| Auditoria | 1 | 1 | 0 | 0 | 1 |
| Cadastros | 8 | 8 | 0 | 0 | 8 |
| Câmara | 8 | 8 | 0 | 0 | 5 |
| Cemitérios | 7 | 4 | 1 | 2 | 6 |
| Compras e Contratos | 18 | 15 | 0 | 3 | 16 |
| Configurações | 4 | 4 | 0 | 0 | 4 |
| Controle Interno | 5 | 5 | 0 | 0 | 4 |
| Esportes e Cultura | 3 | 3 | 0 | 0 | 3 |
| Documentos/GED | 3 | 3 | 0 | 0 | 3 |
| Educação | 3 | 3 | 0 | 0 | 2 |
| Financeiro e Contábil | 28 | 25 | 3 | 0 | 22 |
| Frotas | 1 | 1 | 0 | 0 | 1 |
| Indicadores | 1 | 1 | 0 | 0 | 1 |
| Meio Ambiente | 9 | 9 | 0 | 0 | 9 |
| Obras e Construção Civil | 14 | 14 | 0 | 0 | 13 |
| Almoxarifado e Patrimônio | 14 | 14 | 0 | 0 | 12 |
| Portal do Servidor | 15 | 15 | 0 | 0 | 14 |
| Processos/Protocolo | 8 | 8 | 0 | 0 | 8 |
| RH e Folha | 24 | 23 | 0 | 1 | 23 |
| Água e Saneamento | 7 | 7 | 0 | 0 | 7 |
| Saúde | 27 | 27 | 0 | 0 | 25 |
| Segurança e Mobilidade | 1 | 1 | 0 | 0 | 1 |
| Assistência Social | 12 | 12 | 0 | 0 | 11 |
| SST | 23 | 23 | 0 | 0 | 22 |
| Transparência — administração | 8 | 8 | 0 | 0 | 8 |
| Tributação | 49 | 49 | 0 | 0 | 39 |
| Componentes compartilhados | 20 | 20 | 0 | 0 | 9 |
| Portal público | 11 | 10 | 0 | 1 | 10 |
| **Total** | **343** | **330** | **6** | **7** | **298** |

### Origens com zero tabelas próprias no levantamento

- **Planejamento:** não significa ausência de tabelas. Usa estruturas compartilhadas; há 18 pontos em `src/components/app-ui/planejamento`, também usados pela Câmara. Outros dois pontos compartilhados são de estrutura de Cemitérios.
- **Processos:** a entrada alternativa reutiliza/redireciona para Protocolo; os oito pontos próprios foram atribuídos a `protocolos`.
- **Iluminação Pública:** dashboard e links externos no menu atual. Há rotas internas antigas que reutilizam listagens não tabulares de Obras; não auditar o aplicativo externo IluminaFlow como se fosse código local.
- **Portal do Cidadão e Portal do Paciente:** predominam páginas de entrada, cartões e fichas; não há uma definição tabular própria capturada nessas pastas. Seus canais públicos e consultas relacionadas aparecem também em `src/app/portal`.
- **Dashboard geral, Notificações e Suporte Técnico:** não há estrutura tabular operacional própria identificada. Não converter indicadores, menus ou quadros informativos automaticamente em tabelas.

Um único componente de Segurança atende nove rotas-template; Educação reutiliza uma listagem em várias telas; Planejamento/Câmara compartilham implementações. O esforço de validação não é igual à quantidade de arquivos ou componentes.

## 4. Resultado frente a R01–R12

| Requisito | Diagnóstico | Direção da adequação |
|---|---|---|
| R01 — 20 por página | Há 98 pontos operacionais com constante literal 20 no próprio arquivo e outros com paginação herdada. Há dois casos explícitos com página de 8 itens e um BI que varia a quantidade pela altura. | Fixar 20 centralmente e conferir o fluxo de cada tabela, inclusive filhos e seletores. Não reprovar uma página com 10 linhas se o resultado total legítimo tiver só 10. |
| R02 — sem rolagem/recorte fora do celular | A amostra mostrou rolagem, overflow da página e linhas fora da área visível; `overflow:hidden` também aparece em telas com recorte. | Medir ancestrais, última linha, colunas e rodapé; corrigir o orçamento completo. |
| R03 — exceção de celular | Existem regras baseadas em largura, como `<640`, mas isso não identifica de forma confiável a classe física do dispositivo. | Definir a política de identificação e testar celular em paisagem e tablet/janela estreita. |
| R04 — uma informação/uma linha | Há 90 pontos operacionais com indícios de células empilhadas; há cabeçalhos/células sem restrição uniforme. | Conferir os indícios, separar campos e abrir conteúdos compostos em detalhes, preservando a semântica. |
| R05 — acesso integral sem ícone redundante | As bases usam truncamento e `title` sem um mecanismo universal de detalhes por célula. Existem soluções pontuais, não cobertura integral. | Medir o espaço real: mostrar ícone quando o conteúdo não cabe ou exige visão composta; retirar quando o texto passar a caber. |
| R06 — ajuste sem ampliar a tabela | Nove pontos têm ajuste identificado: sete de Saneamento e dois de Patrimônio. Patrimônio amplia a soma das larguras; Saneamento mantém a soma, mas tem outros desvios. | Uma única distribuição limitada pela largura útil, com mínimos, teclado e restauração. |
| R07 — estrutura estável | Alturas e paginações variam. Há rodapés fora de shell de listagem, tabelas com scroll e redução de densidade/fonte para caber. | Reservar header, filtros, corpo e rodapé; manter linhas uniformes, sem diminuir a fonte automaticamente. |
| R08 — faixa compacta única | Há `flex-wrap`, filtros em várias linhas, títulos repetidos, cards de indicadores e textos entre header e tabela. | Ações no contexto/header; filtros excedentes em sobreposição, sem empurrar a grade. |
| R09 — menu recolhido para ícones ao entrar | `ModuleShell`, RH e Compras iniciam o menu desktop expandido. O clique fecha somente o estado mobile nos casos inspecionados. | Recolher na entrada/navegação para uma barra de ícones e permitir expandir pelo sanduíche, como na entrada de Saneamento. |
| R10 — uso da área liberada | As barras de ícones de 56/80 px são navegação funcional permitida pela revisão do solicitante. Conferir se a tabela utiliza corretamente o restante. | Descontar a largura real da barra; eliminar apenas margens/faixas vazias extras e recalcular a tabela. |
| R11 — base/tokens únicos | Há seis famílias de renderização e estilos por módulo, não um componente que satisfaça todo o contrato. | Evoluir uma base única com configuração por tabela, sem acoplá-la ao ORM. |
| R12 — evidência e cobertura | Esta auditoria oferece inventário completo das estruturas identificadas e amostra real; não homologação de todas as variantes. | Registrar validação por rota/aba, viewport, estados e interação antes de marcar cada item como concluído. |

### Sinais quantitativos que se sobrepõem

Nas **336 estruturas operacionais do código** (330 com rota e seis legadas), o scanner encontrou:

- **9** com mecanismo de redimensionamento; **327** sem esse mecanismo identificado. Nas rotas, são 9 com ajuste e 321 sem.
- **67** com cabeçalhos/células escondidos por classes responsivas.
- **90** com indícios de empilhamento de conteúdo nas células.
- **118** com rolagem declarada em ancestrais reconhecidos no próprio JSX. Estilos herdados e CSS Modules podem acrescentar outros casos.
- **162** com indícios de truncamento; isso não implica automaticamente ausência de todo tipo de detalhe.
- **220** com algum sinal de paginação no arquivo; **116** exigem rastrear a paginação no pai/consulta ou confirmar sua ausência.

Não somar esses números como quantidade de tabelas: a mesma estrutura pode ter vários desvios. Sinais restritos de botões de detalhe também não servem para certificar todos os campos de uma tabela.

## 5. Evidências de navegador — amostra observada

Foram verificadas **sete rotas em três dimensões**, totalizando **21 observações**, além de quatro medições complementares e do ajuste de uma coluna de Materiais. Todas as páginas da amostra responderam HTTP 200. Não foram feitos ajustes de UI ou cargas de dados para produzir esses resultados.

Dimensões da amostra: **1366×768**, **768×1024** e **800×600**. A matriz completa, incluindo zoom e celular, permanece no plano de execução.

| Tela | Evidência observada | Requisitos afetados |
|---|---|---|
| `/saneamento/unidades` | 20 linhas; fonte 11 px no notebook e 10 px no cenário 800×600; menu de 208 px aberto no notebook; detalhe por célula ausente. Em 800×600, a última linha excedeu o limite visível em 17,5 px. | R02, R05, R07, R09; legibilidade da seção 4 |
| `/cadastros/pessoas-fisicas` | 20 linhas de 22 px e fonte 11 px; uma coluna oculta no tablet; última linha fora do limite em 800×600; sem ajuste de colunas. | R02, R06, R09 e proibição de ocultar campos |
| `/patrimonio/materiais` | Tabela de 1.485 px. No notebook, excedente horizontal de 353 px e vertical próximo de 148 px; no tablet, excedente horizontal de 743 px. | R02, R06 |
| `/rh/servidores` | 20 linhas; fontes 11/10,5 px; menu de 260 px inclusive no tablet; última linha fora da área em 800×600; sem ajuste de colunas. | R02, R06, R09, R10 |
| `/compras/catalogo` | Dez linhas no resultado disponível; uma coluna oculta no tablet; menu de 260 px aberto; rolagem vertical em 800×600. A quantidade de dez, sozinha, não prova paginação incorreta. | R02, R06, R09 e ocultação de campos |
| `/administracao` | Comparativo exibiu 4, 7 e 2 linhas conforme a altura. Há indicadores e gráficos antes da tabela. | R01 se o comparativo estiver no escopo operacional; conflito de composição a decidir |
| `/saude/pacientes` | 20 linhas de 41 px; no notebook, página com excedente vertical de 558 px e horizontal de 12 px; no tablet, excedente vertical de 156 px; sem ajuste de colunas. | R02, R06 |

### 5.1 Teste do redimensionamento

Em `/patrimonio/materiais`, uma seta para a direita no ajuste da coluna Nome mudou a largura total da tabela de **1.485 para 1.495 px**. Isso comprova que o ajuste atual aumenta a grade em vez de redistribuir espaço entre colunas.

Fontes: `MaterialCatalogTable.tsx:68–85,110–121` e `patrimonio/_components/ResizableTable.tsx:23–42`.

### 5.2 Orçamento vertical medido

Usando **24 px por linha apenas como referência inicial de projeto do documento**, 20 linhas precisam de **480 px de corpo**, fora cabeçalho e rodapé:

| Tela / viewport | Área disponível para o corpo | Corpo de 20×24 px | Diferença |
|---|---:|---:|---:|
| Saneamento — 1366×768 | 490 px | 480 px | +10 px |
| Saneamento — 800×600 | 282 px | 480 px | **−198 px** |
| Materiais — 1366×768 | 432,5 px | 480 px | **−47,5 px** |
| Materiais — 800×600 | 208,5 px | 480 px | **−271,5 px** |

Saneamento ainda apresentou excedente lateral de aproximadamente **3 px** em relação ao contêiner de recorte. Pequenos recortes também precisam ser corrigidos; ausência de uma barra na página não prova encaixe.

Essas medidas descrevem o layout atual da amostra, não um limite definitivo da futura base. Primeiro remover desperdícios e medir novamente. Se 20 linhas legíveis ainda não couberem, registrar o conflito; não reduzir fonte, recortar linhas ou liberar rolagem no tablet silenciosamente.

### 5.3 Pontos concretos de código

- `SanitationTable.tsx:23–25`: altura mínima calculada de 12 px e troca automática da fonte para 10 px. As sete listagens de Saneamento precisam revisão segundo o novo documento, mesmo tendo paginação e ajuste de largura.
- `sanitation.module.css:5,61`: scroll condicionado por breakpoint; o breakpoint não prova que o dispositivo é celular.
- `ErpTable.tsx:21–22,93,111`: rolagem genérica, alturas e fontes próprias; truncamento/title não implementam R05.
- `ui/table.tsx:9–16`: wrapper com `overflow-x-auto`, sem contrato de paginação, redimensionamento ou detalhe.
- `ErpPagination.tsx:36–39`: mostra o total, mas não o intervalo obrigatório "1–20 de N".
- `CompactItemsTable.tsx:22` e `PriceResearchDetailClient.tsx:38`: tamanho de página igual a oito.
- `HealthReportsClient.tsx:89`: `<table>` dentro de `ErpTableContainer`, que já renderiza outra `<table>`; corrigir a estrutura na adequação.
- `ModuleShell.tsx:300–303,342,400` no snapshot: estado desktop começa expandido e o clique fecha somente o menu mobile. A trilha recolhida de ícones é o comportamento agora solicitado, não um problema a eliminar.
- `rh/layout.tsx:45–46,68,108` e `compras/layout.tsx:35–36,63,100` no snapshot: revisar o recolhimento automático e o aproveitamento do restante da largura, preservando a barra de ícones.
- `sst/layout.tsx:20`: ancestral do módulo declara rolagem vertical para todo o conteúdo; a análise não pode limitar-se ao componente da tabela.
- `portal-servidor/layout.tsx:24`: usa `EmployeePortalShell`, fora do shell administrativo geral; validar sua composição e navegação no lote funcional.

## 6. Casos especiais e decisões estruturais

### 6.1 Sete formatos especiais conferidos

1. Relatório completo de sepultados — `cemiterios/relatorio/page.tsx`.
2. Documento de arrecadação — `cemiterios/taxas/guias/[id]/page.tsx`.
3. Três tabelas no relatório imprimível do instrumento — `compras/contratos/InstrumentLifecycleReport.tsx`.
4. Demonstrativo/snapshot de folha — `rh/operacoes/demonstrativos/[id]/page.tsx`.
5. Tabela informativa de cookies — `portal/privacidade/page.tsx`.

Preservar leitura, impressão e exportação desses formatos, sem paginar o documento final em blocos de 20 para fazê-lo caber no viewport.

### 6.2 Seis estruturas legadas

- `administracao/demandas/DemandasClient.tsx` — a página correspondente redireciona para Administração.
- `atendimento/AtendimentoClient.tsx`.
- `cemiterios/CemiteriosClient.tsx` — há reexportação legada, mas não foi encontrada uma página consumidora no grafo atual.
- `financeiro/orcamento/cadastros/CadastrosClient.tsx`.
- Duas tabelas em `financeiro/orcamento/planejamento/PlanejamentoClient.tsx`.

Confirmar consumidores antes de decidir reuso ou desativação. Esta auditoria não remove nenhum desses arquivos.

### 6.3 Decisões a registrar antes da execução dos casos afetados

| ID | Conflito concreto | Encaminhamento proposto no plano |
|---|---|---|
| D01 | Altura útil insuficiente para 20 linhas legíveis, demonstrada em 800×600 e em Materiais no notebook. | Compactar shell/faixas e medir; se persistir, apresentar dimensão mínima ou outra exceção para decisão do proprietário. |
| D02 | Largura de janela não identifica celular; celular em paisagem pode ser mais largo que um tablet/janela estreita. | Definir a política de dispositivo explicitamente; não adotar automaticamente "menos de 640 px = celular". |
| D03 | Tabelas analíticas dentro de BI com gráficos/indicadores, como Administração. | Confirmar se o comparativo deve usar a composição operacional de 20 ou manter requisito analítico específico. Mantido na reserva de escopo até decidir. |
| D04 | Duas tabelas simultâneas, abas e seletores em área pequena. Exemplos: conciliação, orçamento e grades de notas/chamada. | Medir cada cenário e propor a menor organização alternativa, preservando seleção, edição e contexto. |
| D05 | Muitas colunas com mínimos que excedem tablet/notebook. Exemplo: Materiais, com 12 colunas. | Apresentar os campos e larguras reais; não esconder, combinar ou deslocar campos para detalhes sem a decisão prevista no padrão. |
| D06 | Conteúdo extenso em pop-up sem exceção de scroll desktop autorizada. | Planejar leitura paginada/por blocos e cópia integral; eventual scroll interno precisa de autorização explícita. |

As decisões não bloqueiam a análise dos outros casos nem autorizam exceções automáticas. As 32 grades de edição/seleção devem ser associadas a D04 e ao contrato da tela antes de aplicar paginação, para não perder itens ainda não salvos.

## 7. Plano de adequação — execução futura

### Etapa 0 — fechar contexto e reservas de arquivos

- Confirmar a versão deste inventário e as mudanças posteriores à base `0831a93`.
- Classificar os seis legados e confirmar a fronteira das consultas analíticas/documentos.
- Registrar as 32 grades de edição/seleção e os casos D01–D06 por tela.
- Reservar arquivos compartilhados e combinar integração com o computador que estiver migrando Prisma/Drizzle.
- Preservar consultas, DTOs, filtros, permissões, total filtrado, ordenação e contratos de Server Actions. Não misturar esta adequação visual com migração de banco.

### Etapa 1 — base comum + 20 estruturas compartilhadas

1. Evoluir uma base comum em vez de manter estilos independentes por módulo.
2. Implementar shell de listagem, tokens, paginação central de 20, célula de detalhes condicionais ao espaço e diálogo acessível. Não adicionar ícones a todos os textos por categoria de campo.
3. Implementar distribuição de larguras limitada ao contêiner, mínimos, teclado, restauração e revalidação de preferências.
4. Ajustar os shells para recolhimento em barra de ícones, expansão manual e aproveitamento da largura restante. Preservar a referência visual do menu inicial de Saneamento; sobrepor a expansão apenas quando a largura for insuficiente para a grade. Conferir também wrappers de módulo, como o scroll de SST.
5. Integrar título/ações ao contexto e manter uma única faixa de filtros; filtros excedentes em sobreposição.
6. Tratar as 18 estruturas compartilhadas de Planejamento e duas de Cemitérios, com validação nas rotas consumidoras.

**Importante:** os quatro `<table>` internos de primitives não são outras quatro tabelas de negócio. A mudança neles pode afetar muitas telas, mas cada consumidor ainda precisa de configuração e validação.

### Etapa 2 — amostra técnica antes da migração em escala

Escolher três casos já incluídos nos lotes abaixo, sem contá-los duas vezes:

- Pessoas Físicas: identificação, campos ocultos e fontes/ações compactas.
- Saneamento/Unidades: 20 registros, redimensionamento existente, textos longos, fonte variável e orçamento baixo.
- Materiais: 12 colunas, detalhes, ações e redimensionamento que hoje amplia a grade.

Validar os três com o novo contrato completo antes de propagar a base. Não declarar conclusão global por concluir essa amostra.

### Etapas 3–7 — lotes de módulos

As quantidades são de estruturas operacionais com rota por origem; não incluem novamente os 20 pontos compartilhados da etapa 1.

| Lote | Módulos | Quantidade |
|---|---|---:|
| A — cadastros e operação básica | Administração 7; Cadastros 8; Saneamento 7; Meio Ambiente 9; GED/Documentos 3; Configurações 4 | **38** |
| B — execução e consulta financeira | Financeiro 25; Compras 15; Tributação 49; Indicadores 1; Controle Interno 5 | **95** |
| C — gestão funcional | RH 23; SST 23; Portal do Servidor 15 | **61** |
| D — serviços sociais e portais | Saúde 27; Assistência Social 12; Educação 3; consultas do Portal público 10 | **52** |
| E — operação especializada | Patrimônio 14; Obras 14; Frotas 1; Câmara 8; Cemitérios 4; Cultura 3; Segurança 1; Protocolo 8; Atendimento 2; Auditoria 1; Transparência administrativa 8 | **64** |
| Estruturas compartilhadas da etapa 1 | Planejamento/Câmara e estrutura de Cemitérios | **20** |
| **Total da base operacional com rota** | | **330** |

É possível dividir o trabalho por módulos independentes, mas somente um executor deve alterar a base comum e cada arquivo compartilhado. Não usar scripts de substituição genérica em massa.

### Em cada tabela/variante

- Registrar colunas obrigatórias, formatos, mínimos/máximos e campos com conteúdo integral.
- Confirmar se os dados chegam paginados do servidor ou se cabe paginação no cliente.
- Aplicar busca, filtros e ordenação antes do recorte; preservar os parâmetros e retornar à página 1 quando necessário.
- Ajustar a página após exclusão/inativação, proteger respostas assíncronas fora de ordem e preservar exportações do conjunto completo.
- Preservar seleção, confirmações e permissões de ações.
- Validar vazio, erro, carregamento, última página e 21 registros.
- Registrar versão e evidências antes de mudar de "adequada" para "validada".

### Etapa final — validação de cobertura

- Reexecutar o inventário e reconciliar cada ID da base com o componente/rota de destino.
- Validar cada rota-template e suas variantes relevantes, não apenas o arquivo compartilhado.
- Confirmar a classificação dos legados e dos formatos especiais.
- Registrar qualquer novo ponto criado pelas mudanças concorrentes.
- Executar lint, testes de comportamento necessários e build completo antes de qualquer commit/push autorizado.

## 8. Matriz e critérios para aprovação futura

Usar a matriz do documento original: 1920×1080, 1440×900, 1366×768, 1280×720, 1366×650, 1024×768, 768×1024, 800×600, celular 390×844 e celular em paisagem 844×390, além de zoom 125% e 200%.

Verificar, em cada cenário aplicável:

- 21 registros produzem 20 na primeira página e um na segunda; páginas incompletas não inventam linhas.
- Cabeçalho, registro 20, última coluna, botões e rodapé ficam dentro dos limites reais dos ancestrais.
- Não há ocultação de colunas, recorte de foco/ícone ou rolagem não autorizada.
- A fonte não é automaticamente reduzida para forçar o encaixe.
- Valores integralmente legíveis não têm ícone redundante. Valores truncados e conteúdos compostos necessários têm botão de detalhes; o diálogo preserva todo o conteúdo e foco/teclado.
- O arraste e o teclado não ampliam a soma das larguras além do espaço disponível.
- O menu recolhe para ícones ao entrar/navegar e libera a diferença de largura prevista; expandir manualmente continua funcionando e a barra de ícones permanece no modo recolhido.
- Filtros não fazem a toolbar crescer verticalmente fora do cenário autorizado.
- A validação usa também textos longos, valores grandes, acentos, nulos, datas e permissões diferentes.

Uma tela só é aprovada quando R01–R12 aplicáveis e as decisões estruturais tiverem evidência. **Nenhuma das 330 estruturas está marcada como migrada ou validada nesta entrega.**

## 9. Entregáveis desta auditoria e reprodução

- Este relatório: `docs/PLANO_ADEQUACAO_PADRAO_TABELAS.md`.
- Índice por arquivo/linha/coluna: `docs/INVENTARIO_TABELAS_CELERIFLOW.md`.
- Scanner de leitura: `scripts/audit-table-pattern.mjs`.

```powershell
# Resumo das contagens e sinais de código.
node scripts/audit-table-pattern.mjs --summary

# Inventário completo em JSON: campos reconhecidos, sinais e rotas candidatas.
node scripts/audit-table-pattern.mjs --inventory

# Saída CSV; uma linha por ponto, incluindo exclusões identificadas no escopo.
node scripts/audit-table-pattern.mjs --csv

# Índice legível e grades alternativas revisadas para este snapshot.
node scripts/audit-table-pattern.mjs --index
node scripts/audit-table-pattern.mjs --grids

# Conferir que o índice Markdown corresponde ao scanner, sem omissões/duplicatas.
node scripts/audit-table-pattern.mjs --verify-index
```

O scanner não certifica conformidade visual e suas classificações de grades CSS devem ser revistas quando o código mudar. Nenhuma migração de tela foi iniciada. O próximo passo é o proprietário avaliar **as quantidades, os lotes e os conflitos reais** antes da execução.
