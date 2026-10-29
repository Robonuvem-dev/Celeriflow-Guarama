# CelerFlow — padrão global de tabelas profissionais

**Documento de instrução para o Codex · Versão 1.2 · 29/10/2026**

**Decisões de execução de 29/10/2026:** o proprietário aprovou o piloto e autorizou aplicar o padrão a todas as tabelas de todos os módulos, com organização em lotes e agentes auxiliares. Autorizou rolagem em **tablets e celulares**, mantendo a proibição em **notebooks e computadores**. Esta decisão substitui, neste documento e no plano anterior, as restrições de rolagem que incluíam tablets. A distinção é por política conservadora de dispositivo, sem inferir celular/tablet apenas pela largura da janela. A execução usa exclusivamente Drizzle; referências a Prisma em evidências anteriores são históricas.

**Revisão do solicitante após o piloto:** recolher o menu significa manter a barra lateral estreita com os ícones, como na página inicial de Água e Saneamento; não remover o menu inteiro. O ícone de detalhes só aparece quando o conteúdo não cabe na largura real da célula ou quando há uma visualização composta que exige mais espaço. Texto integral já legível na célula não deve ganhar um ícone redundante. Estas orientações substituem as interpretações anteriores em contrário.

## Como executar esta instrução

Analise primeiro o projeto e as tabelas existentes. Depois implemente o padrão abaixo em todas as listagens tabulares abrangidas pelo escopo. Execute o diagnóstico, a implementação e a verificação na mesma tarefa, sem parar após apresentar um plano ou corrigir apenas uma tela.

Este documento define o resultado esperado; a análise do código e a medição das telas devem acontecer no repositório real. Respeite as instruções aplicáveis do projeto e reutilize sua arquitetura, biblioteca de componentes e identidade visual. Adote a grafia oficial do produto encontrada no repositório.

**Regra central: as tabelas devem caber de verdade na área disponível. Esconder barras de rolagem enquanto linhas, colunas ou controles ficam recortados não atende a esta instrução.**

## 1. Objetivo e interpretação dos requisitos

Criar um padrão único de tabelas operacionais, com organização, densidade e consistência visual inspiradas nos ERPs citados pelo solicitante: TOTVS, IPM, Betha, Primavera e Elotech. Essas marcas são referências de categoria, não uma autorização para copiar uma interface específica nem uma afirmação de que todas adotam as mesmas regras.

A interface deve priorizar a leitura de muitos registros, o alinhamento de campos e a rapidez de consulta. A aparência deve ser sóbria, atual e integrada ao CelerFlow.

### 1.1 Contrato obrigatório

| ID | Requisito | Resultado observável |
| --- | --- | --- |
| R01 | Paginação fixa de 20 registros | Cada página completa contém exatamente 20 registros, um por linha. |
| R02 | Sem rolagem em computador e notebook | A página de listagem e a tabela cabem horizontal e verticalmente, com a última linha e a paginação acessíveis. |
| R03 | Rolagem permitida em tablet e celular | Mantêm paginação e podem rolar; o deslocamento horizontal, quando necessário, fica no contêiner da tabela. |
| R04 | Uma linha visual por célula | Cabeçalhos e células não quebram em duas linhas e não empilham campos. |
| R05 | Informação completa disponível sem redundância | Texto que cabe é mostrado sem ícone. Conteúdo que não cabe ou exige visualização composta tem um ícone para abrir os detalhes completos. |
| R06 | Colunas redimensionáveis | O usuário ajusta a largura arrastando as divisórias, dentro dos limites do espaço disponível. |
| R07 | Estrutura vertical estável | A altura das linhas é uniforme; cabeçalho, área da tabela e paginação não se deslocam a cada página. |
| R08 | Faixa intermediária mínima | Entre o header e a tabela existe apenas uma faixa compacta de busca e filtros. |
| R09 | Menu lateral recolhível para ícones | O botão sanduíche alterna menu expandido e barra estreita de ícones. Ao entrar na listagem, o menu recolhe para ícones e continua disponível. |
| R10 | Uso da área liberada | A tabela ocupa a largura restante após descontar a barra de ícones real, sem margens ou faixas vazias adicionais. |
| R11 | Implementação compartilhada | As telas usam o mesmo componente e os mesmos tokens, com configurações específicas por tabela. |
| R12 | Verificação antes de concluir | A entrega demonstra a cobertura das telas, os testes executados e os conflitos ainda existentes. |

**“20 itens por coluna” significa, neste documento, 20 registros por página: 20 linhas cujas colunas representam os campos dos mesmos registros. Não significa paginar cada coluna separadamente.**

Na última página ou em resultados com menos de 20 registros, mostrar somente os registros existentes. Não duplicar dados nem criar linhas fictícias para completar a contagem.

As exigências de encaixe integral no viewport se aplicam a computadores, notebooks e tablets. No celular, valem as exceções de rolagem da seção 10.2; paginação, conteúdo completo e linha única por célula continuam obrigatórios.

“Fixa verticalmente” significa manter a listagem dentro de uma área estável da tela. Não significa aplicar `position: fixed` individualmente às células nem permitir redimensionamento vertical de linhas.

### 1.2 Escopo

Aplicar o padrão às listagens, consultas, cadastros, resultados de pesquisa e grades operacionais de todos os módulos. Incluir implementações alternativas de tabela, e não apenas elementos HTML `<table>`.

Inventariar também tabelas em abas, seletores e modais. Quando houver duas tabelas simultâneas ou uma tabela dentro de um contêiner pequeno, verificar o orçamento de espaço antes de aplicar a regra de 20 linhas a cada uma. Registrar qualquer conflito estrutural e apresentar a menor adaptação necessária.

Relatórios para impressão, planilhas exportadas e visualizações que não sejam listagens operacionais mantêm seus requisitos próprios. Compartilhar a identidade visual quando pertinente, sem impor a esses formatos o limite de uma tela.

### 1.3 Leitura dos exemplos fornecidos

- **Pessoas:** referência para a ocupação da tela, a faixa de filtros curta, as 20 linhas e a paginação no rodapé.
- **Matrículas:** referência para a grade compacta e alinhada. Corrigir o aparente corte de textos de unidade e horário, oferecendo acesso explícito ao conteúdo completo.
- **Tabela de preços:** referência para a separação clara de campos e colunas. A barra horizontal visível nesse exemplo não deve ser reproduzida em computadores, notebooks ou tablets.

Os exemplos orientam a organização. Tipografia muito pequena, cortes de conteúdo e características visuais antigas não são requisitos a reproduzir.

## 2. Etapa obrigatória: analisar antes de alterar

### 2.1 Inspecionar o projeto

1. Ler a documentação e as instruções locais aplicáveis.
2. Identificar a stack, o shell do aplicativo, o header, o menu lateral, os componentes de tabela, os modais, os filtros e a paginação.
3. Localizar as rotas e todas as implementações de listagem. Procurar componentes compartilhados, tabelas nativas, grids e páginas com CSS próprio.
4. Identificar como chegam os dados: paginação no servidor ou no cliente, total de resultados, ordenação, busca e filtros.
5. Mapear dependências e comportamentos que devem ser preservados: permissões, seleção, ações, links, edição e exportação.

### 2.2 Produzir um inventário de cobertura

Usar uma tabela de diagnóstico com, pelo menos:

| Rota/tela | Componente atual | Colunas e prioridades | Filtros/ações | Paginação | Problema encontrado | Situação da migração |
| --- | --- | --- | --- | --- | --- | --- |
| Preencher a partir do projeto | Identificar arquivo/componente | Registrar campos e restrições | Registrar controles existentes | Cliente/servidor e tamanho | Medir e descrever | Pendente, migrada, validada ou bloqueada |

Não presumir que a lista de telas está completa após encontrar o primeiro componente de tabela.

### 2.3 Medir o layout real

Medir a área útil do navegador e dos contêineres. A resolução física do monitor não corresponde necessariamente ao espaço disponível para a aplicação.

Registrar altura e largura do header, toolbar, cabeçalho da tabela, linhas, paginação, margens, bordas e espaços. Identificar a origem de cada overflow, quebra de linha, corte ou desalinhamento.

Separar problemas do shell daqueles pertencentes à tabela. Uma tabela bem configurada ainda pode transbordar se um ancestral impuser uma largura mínima excessiva ou consumir altura demais.

### 2.4 Apresentar o diagnóstico e continuar

Antes das alterações, resumir os problemas, a solução compartilhada proposta e a sequência de migração. Continuar em seguida com as decisões rotineiras já cobertas por este documento.

Se houver incompatibilidade real entre requisitos, apresentar a medição e a decisão necessária. Avançar nas partes independentes que já estão definidas. Não transformar dúvidas de implementação comuns em pedidos de confirmação.

## 3. Estrutura única da tela

A composição vertical deve ser:

1. **Header compacto:** identidade do sistema, navegação, título/contexto da página e ações gerais essenciais.
2. **Faixa compacta de busca e filtros:** somente os controles necessários para consultar os registros.
3. **Área da tabela:** cabeçalho das colunas e até 20 linhas reais.
4. **Rodapé da tabela:** total, intervalo exibido e paginação.

Reservar o espaço da paginação desde o início. Nos cenários sem rolagem, ela deve permanecer dentro da área visível, inclusive com carregamento, erro, resultado vazio ou última página incompleta.

### 3.1 Header e ações

Integrar o título da página ao header/contexto já existente. Evitar uma segunda faixa alta repetindo o título.

Colocar ações como “Novo”, “Exportar” e “Configurar colunas” em uma área contextual compacta do header ou em seu menu de ações. A faixa entre header e tabela deve continuar dedicada à busca e aos filtros.

Preservar as ações existentes e suas permissões. Mudanças na posição visual não devem remover funcionalidades.

### 3.2 Busca e filtros

- Manter uma única linha compacta em computador, notebook e tablet.
- A busca ocupa o espaço flexível; filtros essenciais têm larguras controladas.
- Quando os filtros não couberem, usar um botão “Filtros” ou “Mais filtros” que abra uma sobreposição. Não empurrar a tabela para baixo.
- Mostrar a quantidade de filtros ativos junto ao acionador, sem criar uma faixa adicional de chips que cresça verticalmente.
- Oferecer aplicação e limpeza de filtros com rótulos claros.
- Usar rótulos acessíveis; placeholder não substitui o nome do campo.
- Preservar a semântica das consultas existentes. Ao aplicar uma nova busca ou filtro, retornar à primeira página.

A sobreposição de filtros deve respeitar a mesma política de dispositivo e rolagem definida neste documento. Caso contenha muitos campos, organizar em grupos ou etapas acessíveis, sem aumentar a altura da listagem.

### 3.3 Uso do espaço

Usar margens pequenas e consistentes. Remover da região de listagem espaços decorativos excessivos, blocos vazios e cartões que repitam informações já presentes no contexto ou no rodapé. Se um indicador tiver função operacional necessária, preservar seu acesso em uma solução compacta e justificar sua posição.

A área da tabela deve ocupar a largura liberada pelo recolhimento do menu, descontando a barra estreita de ícones que permanece visível, e a altura restante do shell. Não exigir tela cheia do navegador para que o layout funcione.

### 3.4 Acabamento visual

Usar tipografia consistente, preferencialmente a fonte sem serifa já adotada pelo produto. Diferenciar o cabeçalho com fundo neutro e peso de texto moderado. Usar divisórias finas entre linhas e colunas, alinhamento preciso e, quando útil, alternância muito suave de fundo entre registros.

Destacar a linha sob o ponteiro, a seleção e o foco de forma discreta e distinta. Reservar a cor principal do produto para ações e estados relevantes. Manter cantos, bordas, espaçamentos e ícones consistentes, evitando sombras pesadas, gradientes decorativos e aparência de cartões empilhados no corpo da tabela.

## 4. Altura, densidade e limite físico da tela

### 4.1 Calcular o orçamento vertical

Usar medidas reais, inclusive bordas e espaçamentos:

```text
altura_para_linhas = altura_util_do_viewport
                   - header
                   - faixa_de_busca_e_filtros
                   - cabecalho_da_tabela
                   - rodape_de_paginacao
                   - margens_bordas_e_espacos

altura_maxima_por_linha = altura_para_linhas / 20

altura_minima_necessaria = altura_dos_elementos_fixos
                        + 20 × altura_minima_legivel_da_linha
```

Exemplo apenas para explicar a conta: header de 48 px + filtros de 40 px + cabeçalho da tabela de 28 px + paginação de 36 px + espaços de 16 px consomem 168 px. Com linhas de 24 px, são necessários **648 px de altura útil**. Esses valores são uma hipótese de projeto, não uma medição do CelerFlow nem uma garantia para qualquer aparelho.

### 4.2 Tokens iniciais de projeto

Centralizar os valores e ajustá-los após medir o aplicativo:

| Elemento | Referência inicial | Regra |
| --- | --- | --- |
| Texto da tabela | 13–14 px, preferencialmente expresso em `rem` | Não reduzir automaticamente para fazer caber; preservar legibilidade e zoom. |
| Linha compacta | Aproximadamente 24–28 px | Altura uniforme e compatível com texto, bordas e controles. |
| Interação por toque | Área de acionamento confortável, validada no tablet | O tamanho visual do ícone não define o tamanho da área clicável. |
| Espaçamento horizontal da célula | Aproximadamente 6–8 px | Pequeno e consistente. |
| Ícone | Aproximadamente 16–18 px | Ter nome acessível e área clicável própria. |
| Bordas | Finas e discretas | Distinguir linhas e colunas sem pesar a interface. |

Esses números não substituem validação de acessibilidade e não são limites normativos universais. Se os controles ou o texto exigirem mais altura, atualizar o orçamento.

Em telas altas, a área da tabela pode continuar até o rodapé, com espaço livre abaixo das linhas. Não esticar 20 linhas até ficarem desproporcionalmente altas. Em páginas incompletas, manter a altura das linhas e a posição do rodapé.

### 4.3 Quando a altura não for suficiente

Primeiro eliminar desperdícios: títulos duplicados, margens grandes, toolbar alta e preenchimentos excessivos. Depois aplicar a densidade compacta que permaneça legível e utilizável.

Se ainda não couberem 20 linhas, registrar **a dimensão exata, a altura necessária e a altura disponível**. Não esconder registros, alterar o tamanho da página, reduzir a fonte abaixo do padrão, aplicar escala artificial ou habilitar rolagem fora do celular sem decisão explícita do solicitante.

Uma proibição absoluta de rolagem, combinada com 20 linhas legíveis, não pode ser garantida para qualquer janela arbitrariamente baixa ou qualquer nível de zoom. Esse conflito deve aparecer como pendência real, e não ser disfarçado como implementação concluída.

### 4.4 Direção técnica

Usar o sistema de layout já existente, preferencialmente Grid ou Flexbox para distribuir as faixas e a área restante. Considerar `100dvh` no shell apropriado, com compatibilidade tratada, e `min-height: 0` / `min-width: 0` nos elementos flexíveis quando necessário.

Não adicionar `100vh` a contêineres internos que já estejam abaixo de um header: isso pode somar alturas indevidamente. Não impor `overflow: hidden` global ao aplicativo e prejudicar formulários ou outras telas.

Conter overflow pode fazer parte do layout depois que seu dimensionamento estiver correto. A contenção, sozinha, não prova que os dados cabem.

## 5. Colunas ajustáveis sem criar rolagem horizontal

### 5.1 Definição por coluna

Cada tabela deve declarar, na configuração compartilhada:

- Chave estável e título do campo.
- Tipo de dado, alinhamento e formatação.
- Largura inicial, largura mínima e máxima quando pertinentes.
- Capacidade de redimensionamento e de ordenação.
- Forma de exibição: texto curto, prévia com detalhes ou ícone de conteúdo.
- Importância operacional e necessidade de permanecer visível.
- Função que recupera o valor integral para o pop-up.

As colunas de dados devem permitir ajuste de largura. Colunas utilitárias, como seleção e ações, podem ter limites mais restritos quando necessários para preservar sua usabilidade; documentar essas restrições.

### 5.2 Algoritmo de redimensionamento

Os limites de encaixe abaixo se aplicam aos cenários sem rolagem. No celular, as larguras mínimas podem exceder a largura visível e usar a rolagem horizontal autorizada da tabela, mantendo todas as colunas acessíveis.

1. Medir a largura útil real do contêiner.
2. Distribuir a largura entre as colunas, respeitando seus limites.
3. Ao ampliar uma coluna, reduzir outras colunas elegíveis, começando pela adjacente quando isso for compatível com a implementação.
4. Ao atingir as larguras mínimas das demais, limitar o arraste.
5. Manter a soma das larguras dentro do espaço disponível durante todo o gesto, incluindo bordas e colunas de ações.

Arrastar uma divisória não pode aumentar livremente a largura total da grade, ocultar a última coluna ou produzir uma barra horizontal.

Usar cursor e indicação visual de redimensionamento. Separar esse gesto da ordenação do cabeçalho. Oferecer uma alternativa por teclado ou por controle de ajuste acessível, além do arraste.

### 5.3 Persistência e adaptação

Quando o projeto permitir persistência de preferências, salvar larguras por usuário e identificação da tabela, sem armazenar dados das linhas. Oferecer “Restaurar larguras padrão”.

Ao reabrir a tela ou mudar a largura disponível, revalidar as preferências e redistribuí-las. Uma configuração salva em um monitor grande não pode provocar overflow em um notebook ou tablet.

Para tabelas HTML, considerar `table-layout: fixed`, largura explícita e um modelo único de larguras, como `colgroup`. Se o projeto já usar um grid, aplicar o comportamento equivalente. Cabeçalho e corpo devem compartilhar exatamente as mesmas larguras.

### 5.4 Quando houver colunas demais

Nos cenários sem rolagem, se a soma das larguras mínimas exceder a largura disponível, apresentar o conflito. Não ocultar colunas, combinar campos independentes, eliminar ações ou tornar os títulos incompreensíveis automaticamente.

Propor, com os campos identificados, uma destas decisões: acesso a campos secundários em detalhes, visões alternativas por grupo de colunas, seleção explícita de colunas ou revisão da largura mínima suportada. Implementar apenas a alternativa já autorizada no projeto ou aprovada pelo solicitante.

## 6. Uma informação por célula e uma linha por registro

### 6.1 Conteúdo tabular

Cada linha representa um registro e cada coluna representa um atributo identificável. Campos independentes, como nome, e-mail e CPF, devem ter suas próprias colunas.

Não empilhar nome e documento, título e descrição, status e observação ou múltiplas etiquetas em duas linhas dentro da mesma célula. Não usar expansão de linha, acordeão dentro do corpo ou subtabela que altere a altura do registro.

Campos de domínio compostos, como uma lista de horários, devem abrir uma apresentação estruturada no pop-up. Se forem separados em novas colunas, verificar antes o orçamento horizontal e manter o significado dos dados.

Aplicar uma linha também aos títulos das colunas. Usar títulos curtos e compreensíveis, com acesso ao significado completo quando necessário.

### 6.2 Ícones somente quando o conteúdo precisa de mais espaço

- Para texto simples que cabe integralmente na célula, mostrar somente o texto, sem ícone de detalhes nem espaço vazio reservado para ele.
- Para texto que não cabe: manter uma prévia de uma linha e disponibilizar o ícone de acesso integral. Não criar uma segunda linha na célula.
- Para conteúdo composto que exige uma apresentação própria, como endereço completo, geolocalização com coordenadas ou planejamento com materiais/serviços: um ícone específico pode representar o conteúdo e abrir o pop-up correspondente.
- O nome do campo não obriga o ícone: uma rua curta que já aparece completa na coluna Rua e número não precisa repeti-la em um pop-up.
- Para um identificador importante, como o nome do registro: preservar sua leitura direta quando houver espaço e adicionar o ícone apenas quando necessário.
- Se um texto normalmente curto deixar de caber após o ajuste de largura, disponibilizar também o acesso explícito ao valor completo.
- Reticências podem compor a prévia; não podem ser a única forma de tratamento do texto cortado.
- Tooltip pode ajudar a identificar a ação; não substitui o pop-up com o conteúdo integral.
- Não depender exclusivamente de quantidade fixa de caracteres: a necessidade de detalhes depende do tipo de campo e do espaço real após o redimensionamento.

Usar um componente interno que compare o conteúdo com a largura efetivamente disponível. Reservar espaço para o botão somente quando ele for necessário; não medir contra uma largura artificialmente diminuída por um ícone que ainda não deveria existir. Conter apenas a prévia do texto, sem recortar o botão, seu foco ou a própria célula. Reavaliar após alteração de largura, dados e fontes: ao ampliar a coluna e o texto passar a caber, retirar o ícone novamente.

O botão deve ter um nome acessível contextual, por exemplo: “Ver observação completa de [identificador]”. Reutilizar o conjunto de ícones do produto, sem emojis decorativos.

### 6.3 Formatação e ações

Alinhar textos à esquerda e valores numéricos à direita, com formatação consistente ao domínio. Usar formatos brasileiros quando essa for a configuração da aplicação. Representar ausências de modo uniforme, sem confundir vazio com zero.

Exibir status com texto curto e indicação visual discreta. A cor não deve ser a única maneira de distinguir o estado.

Manter as ações em uma coluna própria, com controles compactos e nomes claros. Quando houver várias ações, usar um menu de ações por registro sem aumentar a altura da linha. Preservar confirmações e permissões existentes para operações sensíveis.

## 7. Pop-up com informação completa

Abrir um diálogo da própria aplicação, e não uma nova janela do navegador. Apresentar o nome do campo, o identificador do registro e o conteúdo integral, respeitando as permissões existentes.

O conteúdo dentro do diálogo pode quebrar em múltiplas linhas: a proibição de duas linhas vale para as células da tabela. Textos extensos e palavras longas devem se adaptar à largura disponível.

O diálogo deve ter título acessível, botão visível para fechar, fechamento por `Esc`, foco inicial adequado, navegação por teclado contida no diálogo e retorno de foco ao acionador ao fechar. Reutilizar o componente acessível já existente quando possível.

### 7.1 Política conservadora de rolagem nos pop-ups

O pedido autoriza rolagem apenas no celular e não define uma exceção para pop-ups. Portanto, **este documento não autoriza silenciosamente rolagem interna em pop-ups de computador, notebook ou tablet**.

Quando um conteúdo não couber em um diálogo desses dispositivos, usar paginação de leitura ou navegação por blocos, preservando acesso a todo o texto e a possibilidade de copiar seu conteúdo completo. Indicar a posição de leitura e manter os controles visíveis. Não resumir, descartar trechos ou exigir download para ler a informação.

Se essa solução conflitar com o componente existente ou tornar a consulta inadequada, apresentar a decisão ao solicitante. A alternativa recomendável a avaliar é permitir rolagem vertical somente dentro do pop-up, mantendo a listagem fixa. Essa alternativa é uma sugestão e depende de autorização; não altera a regra vigente.

No celular, o diálogo pode ter rolagem interna, sem criar uma segunda área vertical concorrente no fundo. Ao fechar, restaurar o estado anterior da tela.

## 8. Menu lateral e navegação

- Disponibilizar o botão sanduíche em posição estável no cabeçalho do menu ou no header do aplicativo.
- Manter dois estados: expandido, com nomes e ícones; recolhido, com a barra lateral estreita de ícones visíveis.
- Ao entrar em uma subpágina de listagem, recolher automaticamente para a barra de ícones, sem fazer o menu desaparecer.
- Aplicar o mesmo estado inicial ao acessar diretamente a rota ou recarregar a página.
- Liberar a diferença entre a largura expandida e a recolhida, mantendo somente a largura efetiva da barra de ícones. Essa barra é navegação funcional, não espaço desperdiçado.
- Usar o mesmo comportamento e identidade do menu inicial de Água e Saneamento como referência. A tabela deve recalcular sua largura ao expandir/recolher.
- Quando a largura não permitir manter o menu expandido ao lado da tabela, sua expansão pode sobrepor a área de conteúdo, preservando a barra recolhida e os mínimos da grade.
- Recolher após a navegação efetiva para um item final. Apenas expandir um grupo do menu não deve ser confundido com navegar.
- Permitir recolher pelo botão e por `Esc`; quando houver sobreposição, permitir também o fechamento externo apropriado, preservando o foco. Os ícones continuam disponíveis no estado recolhido.
- Cada ícone deve ter nome acessível, indicação da rota ativa e identificação do destino ao passar o ponteiro.

Evitar efeitos que fechem imediatamente o menu toda vez que o usuário o abre. O recolhimento automático deve estar associado à entrada na rota e à navegação, não a toda renderização.

## 9. Paginação, busca e integridade dos dados

Fixar o tamanho da página em **20** em um ponto central da implementação. Não oferecer seletor de 10, 50, 100 ou “Todos” nas listagens deste padrão.

O rodapé deve apresentar o intervalo e o total filtrado, por exemplo: “1–20 de 179 registros”, além da página atual e dos controles de navegação. Nesse exemplo, são 9 páginas e a última contém 19 registros.

Requisitos funcionais:

1. Aplicar busca, filtros e ordenação ao conjunto de resultados, antes do recorte da página.
2. Usar ordenação estável, com desempate por identificador quando necessário.
3. Retornar à primeira página quando a busca, os filtros ou a ordenação mudarem.
4. Preservar busca, filtros e ordenação ao navegar entre páginas.
5. Desabilitar controles incompatíveis com a posição atual.
6. Após exclusão ou alteração que invalide a página atual, ajustar para uma página válida.
7. Evitar que respostas antigas de consultas substituam resultados de uma consulta mais recente.
8. Preservar o escopo das exportações e ações existentes; não restringi-las acidentalmente aos 20 registros visíveis.

Reutilizar a paginação no servidor quando ela existir. Se todos os dados já estiverem carregados legitimamente e o volume permitir, manter a paginação no cliente. Não simular paginação completa apenas escondendo registros e sem fornecer acesso aos demais.

Em resultado vazio, mostrar uma mensagem curta dentro da área reservada e a contagem zero. Em carregamento, preservar a estrutura. Em erro, apresentar mensagem e nova tentativa sem deslocar a tabela ou inventar resultados.

## 10. Dispositivos, responsividade e acessibilidade

### 10.1 Computadores, notebooks e tablets

Manter a regra de ausência de rolagem horizontal e vertical na listagem. Validar tablet em retrato e paisagem, com interação por toque.

Documentar as dimensões úteis mínimas que o projeto efetivamente suporta com 20 registros legíveis e todas as colunas obrigatórias. Não declarar suporte irrestrito quando a medição demonstrar incompatibilidade.

### 10.2 Celulares

Manter 20 registros por página, uma linha por célula e os mesmos recursos de consulta. Permitir rolagem vertical da página e rolagem horizontal no contêiner da tabela quando necessária, evitando dois contêineres verticais concorrentes.

Adaptar header e filtros ao espaço disponível, manter ações alcançáveis e aumentar a área de toque quando possível. A paginação deve permanecer alcançável sem ficar coberta por elementos fixos ou pelo teclado virtual.

### 10.3 Não confundir largura com tipo de aparelho

Usar a área disponível para dimensionar os componentes. Um breakpoint estreito, sozinho, não comprova que o aparelho é um celular: notebooks com janela estreita e tablets também podem atingir essa largura.

Inspecionar a política de dispositivos já adotada pelo projeto e registrar como a exceção de celular será identificada e testada, inclusive em paisagem. Não liberar rolagem em qualquer tela abaixo de um breakpoint e afirmar que a regra “somente celular” foi atendida.

Se o projeto não tiver uma forma suficientemente confiável de tratar essa distinção, apresentar a limitação e a decisão necessária. A alternativa é adotar a exceção por modo compacto em vez de classe física do dispositivo, mas isso muda o pedido e exige autorização. Estados não classificados não devem ganhar a exceção de rolagem silenciosamente.

### 10.4 Zoom, teclado e semântica

Preservar o zoom do navegador. Não usar escala automática, fonte progressivamente menor ou bloqueio de zoom para manter uma aparência de encaixe.

Usar semântica de tabela ou de grid compatível com a interação real. Manter cabeçalhos associados às células, estado de ordenação identificável, foco visível, contraste adequado e ações utilizáveis por teclado e toque.

Validar ampliação de texto e zoom. Caso a combinação de 20 linhas, altura fixa e proibição de rolagem impeça o acesso ao conteúdo, registrar o conflito. Não alegar conformidade de acessibilidade sem uma solução verificada.

## 11. Implementação centralizada e migração

Criar ou evoluir um componente comum de listagem. Os nomes abaixo são ilustrativos; adaptar à arquitetura existente:

- Shell de listagem: organiza header/contexto, filtros, tabela e paginação.
- Tabela compartilhada: aplica densidade, colunas, células e ações.
- Controle de larguras: calcula limites, redistribui espaço e restaura preferências.
- Célula de detalhes: mantém a linha única e abre o conteúdo integral.
- Diálogo de detalhes: oferece leitura completa e navegação acessível.
- Paginação compartilhada: fixa 20 registros e mantém estados e contagens.

Cada tela configura seus campos, consultas, filtros e ações. Ela não deve recriar regras próprias de altura, rolagem, fonte e espaçamento.

Sequência de execução:

1. Concluir inventário e diagnóstico de espaço.
2. Implementar a base compartilhada e seus tokens.
3. Aplicar em uma tabela representativa, com muitas colunas, textos longos, status, filtros e ações.
4. Verificar os critérios de aceitação nessa tabela e corrigir a base.
5. Migrar todas as demais tabelas do inventário, adaptando apenas as configurações de domínio.
6. Validar os casos distintos e revisar a cobertura de todas as rotas.
7. Registrar o padrão na documentação usada pelo projeto, orientando novas telas a reutilizarem a mesma base.

Concluir somente o piloto não conclui a tarefa. Se uma tela ficar bloqueada, identificá-la e explicar o requisito incompatível; continuar as migrações independentes.

Preservar regras de negócio, permissões, conteúdo dos dados e contratos existentes. Fazer alterações em API ou dependências somente quando necessárias para entregar o comportamento solicitado, explicando a razão.

## 12. Verificação e critérios de aceitação

### 12.1 Matriz de dimensões

Usar dimensões do **viewport em pixels CSS**, não apenas o tamanho anunciado do monitor. Adaptar a matriz aos dispositivos reais suportados, mantendo cobertura de largura e altura:

| Cenário | Dimensões de referência | Verificação principal |
| --- | --- | --- |
| Desktop amplo | 1920 × 1080 e 1440 × 900 | Uso do espaço e densidade sem linhas excessivamente altas. |
| Notebook | 1366 × 768 e 1280 × 720 | 20 registros, filtros e paginação integralmente visíveis. |
| Notebook com menor altura útil | 1366 × 650 | Orçamento vertical real e ausência de recorte. |
| Tablet em paisagem | 1024 × 768 | Colunas, toque, menu e detalhes sem rolagem. |
| Tablet em retrato | 768 × 1024 | Limites horizontais e acesso a todos os campos. |
| Estresse de espaço | 800 × 600 | Detectar e registrar incompatibilidades reais; não maquiar aprovação. |
| Celular em retrato | 390 × 844 | Rolagem permitida, filtros, leitura e paginação acessíveis. |
| Celular em paisagem | 844 × 390 | Exceção de celular, pouco espaço vertical e operação por toque. |

Essas dimensões são cenários de verificação, não uma declaração prévia de que todos são viáveis. Acrescentar zoom de 125% e 200%, registrando a área útil resultante e qualquer conflito. Testar teclado virtual nos dispositivos pertinentes.

### 12.2 Lista de aceitação

- [ ] Com exatamente 21 resultados, a primeira página apresenta 20 registros e a segunda apresenta 1; com volumes maiores, cada página completa mantém 20.
- [ ] O registro 20, o cabeçalho e todos os controles do rodapé ficam integralmente visíveis nos cenários sem rolagem aprovados.
- [ ] A página, seus contêineres intermediários e a tabela não apresentam overflow horizontal ou vertical nesses cenários.
- [ ] A ausência de barras não esconde linhas, colunas, botões, ícones ou focos.
- [ ] Nenhuma célula nem cabeçalho usa duas linhas visuais.
- [ ] Textos que cabem integralmente não exibem ícone redundante; textos que deixam de caber e conteúdos compostos necessários têm acionador visível para acesso integral.
- [ ] O ícone aparece/desaparece conforme o conteúdo passa a não caber/caber após redimensionamento, sem reservar uma faixa vazia permanente na célula.
- [ ] O pop-up mostra todo o conteúdo, com fechamento e navegação por teclado adequados.
- [ ] Nos cenários sem rolagem, as larguras permanecem dentro do contêiner durante e depois do arraste.
- [ ] As larguras mínimas impedem colunas inutilizáveis; as ações continuam acessíveis.
- [ ] Preferências de largura são revalidadas ao trocar de dimensão e podem ser restauradas.
- [ ] A toolbar permanece compacta e não cria linhas extras fora do celular.
- [ ] O menu recolhe para ícones ao navegar, expande manualmente e libera a diferença de largura prevista, sem desaparecer por completo.
- [ ] Busca e filtros atuam sobre o conjunto correto e retornam à página 1.
- [ ] Ordenação não fica limitada aos 20 registros da página atual.
- [ ] Resultados vazios, carregamento, erro e última página incompleta preservam o layout.
- [ ] Nenhuma tela perde ações, permissões, campos ou o escopo correto de exportação.
- [ ] O celular mantém acesso a todas as informações e controles, com rolagem funcional.
- [ ] O inventário identifica todas as telas migradas, validadas e eventualmente bloqueadas.

### 12.3 Como verificar sem mascarar problemas

Combinar inspeção visual com medição de geometria. Comparar `scrollWidth/clientWidth` e `scrollHeight/clientHeight` nos contêineres pertinentes, considerando arredondamentos. Verificar também os limites visuais de linhas, células, ícones e paginação, pois a contenção de overflow pode recortar conteúdo sem criar uma barra visível.

A prévia de texto intencionalmente truncada é aceitável somente com o acesso completo exigido. Recortar a célula, o botão ou uma linha inteira não é aceitável.

Usar dados representativos: nomes longos, descrições extensas, valores grandes, caracteres acentuados, múltiplos horários, campos vazios e combinações de filtros. Testar os extremos de redimensionamento de colunas e a restauração de preferências.

Utilizar os testes e ferramentas de navegador já presentes no projeto. Acrescentar testes de comportamento apenas quando úteis para proteger riscos reais, como paginação incorreta, perda de dados na consulta ou overflow durante o ajuste de colunas. A verificação do layout exige observação no navegador; testes unitários isolados não a substituem.

## 13. Critérios de reprovação imediata

O resultado não atende ao pedido se:

- Apenas esconde as barras de rolagem ou aplica `overflow: hidden` para ocultar o problema.
- Passa a mostrar menos de 20 registros para caber sem autorização.
- Exige reduzir o zoom, abrir o navegador em tela cheia ou usar fonte ilegível.
- Libera rolagem em notebook ou tablet por causa de um breakpoint genérico, sem tratar a regra de dispositivo.
- Mostra duas linhas na célula ou usa expansão de linhas para detalhes.
- Corta texto sem um ícone que abra a informação completa.
- Exibe um ícone de detalhes para apenas repetir um texto simples já integralmente legível na célula.
- Nos cenários sem rolagem, aumenta a largura total ao arrastar uma coluna e empurra outra para fora da tela.
- Esconde campos ou ações para aparentar responsividade.
- Deixa a paginação ou a última linha fora da área visível.
- Mantém o menu expandido após navegar para a subpágina, remove a barra de ícones ao recolher ou deixa espaço lateral vazio além da navegação funcional.
- Corrige somente uma tela e não identifica as demais no inventário.
- Cria um estilo independente por módulo que volta a divergir do padrão comum.

## 14. Entrega esperada do Codex

Ao finalizar, informar:

1. **Diagnóstico:** causas dos problemas encontrados e medidas relevantes.
2. **Implementação:** componente compartilhado, tokens e decisões de layout adotadas.
3. **Cobertura:** tabela com cada tela encontrada, seu estado de migração e a validação realizada.
4. **Evidências:** cenários de viewport, comportamentos verificados e resultados; imagens comparativas quando disponíveis.
5. **Pendências reais:** dispositivo, dimensão, tela, requisito incompatível e decisão necessária.
6. **Continuidade:** como uma nova tela deve reutilizar o padrão sem criar outra implementação.

Não afirmar que “todas as tabelas foram padronizadas” se a cobertura não estiver demonstrada. Distinguir o que foi implementado, o que foi validado e o que continua dependente de decisão.

## 15. Decisões que permanecem com o solicitante se surgir conflito

Estas alternativas **não estão autorizadas por este documento**. Apresentá-las somente quando uma necessidade concreta for demonstrada:

- Permitir rolagem vertical exclusivamente dentro de pop-ups longos, mantendo a listagem fixa.
- Adotar a exceção de rolagem por modo compacto em vez de classe física do aparelho.
- Mover campos secundários para detalhes ou visões alternativas quando as larguras mínimas não couberem.
- Definir uma altura útil mínima suportada ou uma exceção de acessibilidade para situações em que 20 linhas legíveis não cabem.

Ao pedir uma decisão, apresentar a tela afetada, a evidência e a menor mudança proposta. Não transformar estas possibilidades em exceções automáticas.

## 16. Referências técnicas de apoio

Os requisitos de produto vêm do solicitante. As referências abaixo apoiam a implementação e a avaliação dos limites técnicos; não estabelecem o tamanho de página de 20 registros nem os tokens visuais propostos.

- [MDN — table-layout](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/table-layout): layout fixo de tabela, largura explícita e distribuição de colunas.
- [MDN — text-overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-overflow): tratamento visual de texto excedente em conjunto com as demais propriedades de layout.
- [MDN — unidades de comprimento](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length): unidades relativas, dimensões e unidades de viewport.
- [W3C — Understanding Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow): redimensionamento, zoom e particularidades das tabelas. A exceção prevista para certas tabelas não dispensa o acesso às informações e aos controles.
- [W3C — Understanding Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html): ampliação de texto sem perda de conteúdo e acesso explícito ao conteúdo completo de células truncadas.
- [W3C — Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): foco, teclado, identificação e fechamento de diálogos modais.

**Instrução final: primeiro analisar, depois implementar a base compartilhada, migrar todas as tabelas do escopo e verificar o resultado. Resolver a geometria e o acesso aos dados, em vez de apenas alterar a aparência das barras de rolagem.**
