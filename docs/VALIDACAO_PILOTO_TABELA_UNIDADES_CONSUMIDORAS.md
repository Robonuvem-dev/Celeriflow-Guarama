# Piloto do padrão de tabelas — Unidades Consumidoras

**Data:** 28/10/2026  
**Rota:** `/saneamento/unidades`  
**Menu:** Água e Saneamento → Unidades Consumidoras  
**Situação:** piloto aprovado pelo proprietário em 29/10/2026; aplicação às demais tabelas autorizada. As medições abaixo continuam identificadas pela revisão em que foram executadas. Na execução global, tablets e celulares receberam autorização de rolagem; notebook/computador mantêm a composição sem rolagem.

**Revisão 1.1:** menu lateral recolhido para ícones e detalhes de texto condicionais à largura real da célula, conforme a revisão de [Padrão de Tabelas.md](Padr%C3%A3o%20de%20Tabelas.md). A matriz de geometria e os comportamentos identificados como revisão 1.1 foram novamente verificados no navegador. As evidências anteriores são identificadas separadamente.

## 1. Como abrir para validar

No ambiente local, iniciar o projeto com `npm run dev`, autenticar-se normalmente no domínio do sistema e abrir:

```text
http://app.localhost:3000/saneamento/unidades
```

Usar a porta efetiva caso o servidor de desenvolvimento tenha escolhido outra. `app.localhost` é o hostname local que o proxy do projeto reconhece como sistema administrativo.

O piloto foi ativado somente nessa rota. A base nova está em `src/components/app-ui/operational/`; o escopo de aplicação às demais tabelas depende da validação solicitada.

## 2. Composição do piloto

- Header de contexto compacto com marca, título, nova unidade, restauração de larguras e menu do usuário.
- Menu lateral com a identidade e os ícones de Saneamento: **56 px recolhido**, mantendo os destinos acessíveis, e **208 px expandido**, com nomes e grupos. O sanduíche permanece no cabeçalho lateral.
- A partir de 960 px de janela, expandir o menu redistribui a largura disponível e a tabela recalcula suas colunas. Abaixo disso, a expansão sobrepõe o conteúdo e preserva o espaço de 56 px da barra recolhida.
- Uma faixa compacta contém a busca e o acionador de filtros. Status e categoria ficam em diálogo, com aplicação e limpeza explícitas.
- Tabela com as oito colunas: Identificador, Rua e número, Bairro, CEP, Titular, Categoria, Status e Ações.
- Paginação fixa de 20 registros, com intervalo/total filtrado, primeira/anterior/próxima/última e campo para ir à página.
- Fonte nominal de **13 px** (`0.8125rem`) e linhas de **24 px** no modo computador/tablet. A fonte não diminui para forçar o encaixe.
- No smartphone reconhecido, linhas de 32 px, rolagem vertical da página quando necessária e rolagem horizontal somente no contêiner da tabela.
- Todas as colunas de texto usam o mesmo critério: o ícone de leitura integral aparece **somente quando o valor não cabe**. Texto já legível não recebe botão nem reserva de espaço; ampliar a coluna retira novamente o ícone.
- O diálogo de conteúdo apresenta campo, identificador do registro, leitura por trechos e cópia integral. Não exige download nem abre nova janela.

### Colunas e preferências

As colunas de dados podem ser ajustadas por arraste e setas do teclado. O ajuste redistribui largura, começando pelas colunas adjacentes elegíveis, e não amplia o total da tabela.

Há restauração pelo botão do header, duplo clique no ajuste e tecla `Home`. Preferências são salvas por usuário/tabela, somente com proporções de largura, e revalidadas ao mudar de dimensão.

A coluna utilitária Ações fica fixa em **64 px**: dois controles de 24 px, intervalo de 4 px e 12 px de preenchimento. Essa restrição mantém Editar e Inativar acessíveis quando outras colunas são redimensionadas.

A ordenação atual do servidor foi preservada: `createdAt desc`, com desempate por `id asc`. Os metadados das colunas declaram a ausência de ordenação interativa no cabeçalho; o piloto não faz ordenação parcial dos 20 itens visíveis.

## 3. Encaixe medido no navegador

Condições da revisão 1.1: Chrome local, fonte-base do documento de 16 px, leitura dos dados existentes, viewport em pixels CSS e menu recolhido de 56 px. Foram conferidos limites dos contêineres, última linha, última coluna, cabeçalhos e fontes, além da ausência de barras. A paginação mantém a faixa inferior de 28 px.

| Viewport | Largura da tabela | Registros | Colunas | Fonte | Linha | Overflow da página/tabela | Última linha e paginação |
|---|---:|---:|---:|---:|---:|---|---|
| 1920×1080 | 1864 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1440×900 | 1384 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1366×768 | 1310 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1280×720 | 1224 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1366×650 | 1310 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1024×768 | 968 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 768×1024 | 712 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 800×600 | 744 px | 20 | 8 | 13 px | 24 px | Não | Dentro da área |

Não foram detectadas colunas escondidas nem cabeçalhos recortados nesses cenários. A tabela usou exatamente a largura do contêiner. Em telas altas, as linhas mantiveram 24 px, sem esticar para preencher toda a altura.

Em 1366×768, a expansão lateral foi verificada com **208 px de menu e 1158 px de tabela**, preservando os 20 registros. Em 768×1024, a expansão sobreposta manteve os **712 px** de área da tabela e impediu interação com o conteúdo encoberto até recolher o menu.

### Orçamento nominal mínimo desta configuração

```text
Header principal:        36 px
Busca/filtros:           32 px
Cabeçalho da tabela:     24 px
20 linhas × 24 px:      480 px
Paginação:               28 px
Total:                  600 px
```

A soma revisada dos mínimos das oito colunas é **702 px**, incluindo Ações fixa em 64 px. Somando a barra de ícones de 56 px, a referência nominal calculada é uma janela de pelo menos **758×600 px CSS**, com fonte-base de 16 px e menu recolhido. Essa referência é calculada; a matriz efetivamente testada começa em 768 px de largura ou 800×600 no caso de baixa altura.

As linhas usam divisórias internas que não acrescentam pixels ao orçamento de altura. Título e ações foram integrados no header do piloto; não há outra faixa de título ou rodapé institucional consumindo altura entre esses elementos.

## 4. Celular e tablet com interação emulada

Também foram usados perfis de dispositivo com toque, além dos viewports desktop:

| Perfil/cenário | Resultado |
|---|---|
| iPhone emulado, 390×844 | Barra lateral de 56 px, 20 registros e oito colunas; tabela de 702 px em área de 334 px, com rolagem horizontal local; nenhuma rolagem horizontal da página. |
| iPhone emulado, 844×390 | 20 registros; rolagem vertical da página autorizada e paginação alcançável; sem outra área vertical rolável dentro da tabela. |
| iPad emulado, 1024×768 | 20 registros, oito colunas e tabela de 968 px, sem rolagem; abertura de detalhes e ajuste de coluna por toque verificados. |
| iPad emulado, 768×1024 | Mesmo resultado com tabela de 712 px, preservando sua largura total durante o ajuste por toque; expansão/recolhimento do menu por toque também verificados. |

A política não usa a largura da janela como identificação de celular. Reconhece assinaturas de smartphones comuns e trata tablets/desktop separadamente; navegadores não classificados seguem as restrições de computador/tablet. Essa identificação é conservadora e não constitui prova universal da classe física do aparelho. Validar aparelhos e navegadores reais utilizados pelo município antes da expansão.

## 5. Comportamentos verificados

### Na rota real — revisão 1.1

- Menu inicialmente recolhido com barra funcional de ícones, oito destinos, identificação acessível e destaque da rota atual.
- Expansão para 208 px no desktop e recolhimento ao navegar; `Esc` recolhe e devolve o foco ao sanduíche.
- Em tablet estreito, expansão sobreposta sem alterar a largura da tabela, com fechamento pelo sanduíche e pela área externa; o fechamento externo devolve o foco ao sanduíche.
- Em 1366×768 com larguras padrão, os textos dos 20 registros consultados cabem e nenhum botão redundante de detalhes aparece.
- Reduzir a coluna Rua e número faz surgir o botão; ampliar até o texto caber o remove novamente. A restauração retira os ícones que deixam de ser necessários.
- Abertura do valor integral pelo botão necessário, cópia integral e retorno do foco à célula ao fechar o diálogo.
- Ajuste de colunas pelo teclado e por toque em tablet sem aumentar a largura total da tabela.

### Regressões verificadas na primeira entrega — evidência anterior

As verificações abaixo pertencem à primeira entrega do piloto e não foram repetidas nesta revisão de menu/detalhes:

- Ajuste de colunas pelo mouse sem aumentar a largura total.
- Preferência mantida após recarregar e restauração de larguras no header/teclado.
- Intervalo da página seguinte atualizado para 21–40.
- Aplicação de status/categoria retorna à primeira página.
- Navegação preserva os filtros na URL.
- Limpeza explícita e resultado vazio com `0–0 de 0 registros`.

### Massa controlada isolada — evidência da primeira entrega

Na primeira entrega, os componentes foram renderizados com 21 registros e um campo extenso, usando as folhas de estilo da aplicação, sem cadastro de dados de negócio no banco:

- Primeira página com 20 linhas e segunda com uma, sem completar com linhas fictícias.
- Campo com acentos, grafemas Unicode, parágrafos e uma palavra de 900 caracteres.
- Conteúdo integral percorrido em **sete trechos**, sem scroll no corpo do diálogo desktop.
- Concatenação dos trechos exatamente igual ao valor original, preservando caracteres e espaços.
- Cópia integral validada, considerando a normalização de finais de linha do clipboard do Windows.
- Carregamento e erro preservam a posição do rodapé; a ação de nova tentativa volta ao estado pronto.

A rota possui `loading.tsx` e `error.tsx` próprios, seguindo a API de retry da versão instalada do Next.js. O estado visual de erro/retry foi verificado em massa controlada; não foi provocado um erro deliberado de banco no ambiente de negócio para testar a fronteira do Next.

## 6. Limites e pendências reais

- Em **683×384 px CSS**, a área não comporta os mínimos desta configuração. O piloto mostra um diagnóstico com dimensões necessárias/disponíveis, em vez de reduzir fonte ou apresentar linhas/colunas recortadas.
- Essa redução de área é um teste de espaço; **não foi registrada como prova de zoom real do navegador**.
- Zoom real de 125%/200%, ampliação de fonte personalizada e teclado virtual em aparelhos físicos precisam da validação manual complementar. Não há declaração de suporte irrestrito a qualquer altura ou zoom.
- Caso o uso real resulte em área abaixo do limite, aplicar as decisões de espaço previstas no documento de padrão. Rolagem desktop, ocultação de campos e diminuição de fonte não foram adotadas como exceções automáticas.
- O teste de toque usou emulação de navegador. Conforto de toque e comportamento dos aparelhos efetivos permanecem pontos da validação do proprietário.

## 7. Validações de código

Comandos de verificação do piloto:

```powershell
node --import tsx --test tests/operational-table.test.ts tests/sanitation-unit-identifier.test.ts
npm run build
```

Resultado da revisão 1.1: **seis testes aprovados**, **ESLint aprovado nos arquivos alterados**, **`git diff --check` sem erros** e **build completo aprovado**, incluindo geração do Prisma Client, tipos de rotas, oito partições de checagem TypeScript, compilação do Next.js e geração das 95 páginas estáticas. A checagem TypeScript própria do projeto ocorre antes da compilação do Next.js.

Os testes persistidos cobrem conservação da largura total, limites das colunas, proteção da coluna de ações, reaplicação de preferências em tablet, conflito abaixo da largura mínima e leitura integral com grafemas Unicode.

## 8. Roteiro rápido para o proprietário validar

- [ ] Conferir a aparência e a densidade das 20 linhas em notebook/tablet.
- [ ] Conferir que texto integralmente visível não tem ícone redundante; estreitar rua, bairro ou titular e abrir o valor completo pelo botão que surge.
- [ ] Ampliar novamente a coluna e conferir que o ícone desaparece quando o texto passa a caber.
- [ ] Arrastar divisórias, usar setas e restaurar as larguras.
- [ ] Pesquisar, aplicar/limpar filtros, navegar e ir a uma página específica.
- [ ] Expandir/recolher pelo sanduíche, conferir a barra de ícones e a redistribuição de largura; no tablet estreito, conferir a expansão sobreposta e o recolhimento ao navegar.
- [ ] Conferir os acessos Nova unidade, Editar e Inativar.
- [ ] Conferir celular, zoom e aparelhos efetivamente utilizados.
- [ ] Informar os ajustes desejados no piloto antes da aplicação às outras tabelas.
