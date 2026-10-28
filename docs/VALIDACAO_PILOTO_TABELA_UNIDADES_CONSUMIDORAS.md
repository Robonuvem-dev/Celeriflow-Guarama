# Piloto do padrão de tabelas — Unidades Consumidoras

**Data:** 28/10/2026  
**Rota:** `/saneamento/unidades`  
**Menu:** Água e Saneamento → Unidades Consumidoras  
**Situação:** piloto implementado e verificado tecnicamente nos cenários abaixo; aguardando validação visual/funcional do proprietário antes de aplicar às outras listagens.

## 1. Como abrir para validar

No ambiente local, iniciar o projeto com `npm run dev`, autenticar-se normalmente no domínio do sistema e abrir:

```text
http://app.localhost:3000/saneamento/unidades
```

Usar a porta efetiva caso o servidor de desenvolvimento tenha escolhido outra. `app.localhost` é o hostname local que o proxy do projeto reconhece como sistema administrativo.

O piloto foi ativado somente nessa rota. A base nova está em `src/components/app-ui/operational/`; o escopo de aplicação às demais tabelas depende da validação solicitada.

## 2. Composição do piloto

- Header de contexto compacto com marca, título, menu, nova unidade, restauração de larguras e menu do usuário.
- O menu abre em sobreposição e não reserva uma coluna lateral nem uma trilha de ícones.
- Uma faixa compacta contém a busca e o acionador de filtros. Status e categoria ficam em diálogo, com aplicação e limpeza explícitas.
- Tabela com as oito colunas: Identificador, Rua e número, Bairro, CEP, Titular, Categoria, Status e Ações.
- Paginação fixa de 20 registros, com intervalo/total filtrado, primeira/anterior/próxima/última e campo para ir à página.
- Fonte nominal de **13 px** (`0.8125rem`) e linhas de **24 px** no modo computador/tablet. A fonte não diminui para forçar o encaixe.
- No smartphone reconhecido, linhas de 32 px, rolagem vertical da página quando necessária e rolagem horizontal somente no contêiner da tabela.
- Textos de rua, bairro e titular têm ícone explícito de leitura integral. Campos curtos ganham o ícone se o texto não couber.
- O diálogo de conteúdo apresenta campo, identificador do registro, leitura por trechos e cópia integral. Não exige download nem abre nova janela.

### Colunas e preferências

As colunas de dados podem ser ajustadas por arraste e setas do teclado. O ajuste redistribui largura, começando pelas colunas adjacentes elegíveis, e não amplia o total da tabela.

Há restauração pelo botão do header, duplo clique no ajuste e tecla `Home`. Preferências são salvas por usuário/tabela, somente com proporções de largura, e revalidadas ao mudar de dimensão.

A coluna utilitária Ações fica fixa em **64 px**: dois controles de 24 px, intervalo de 4 px e 12 px de preenchimento. Essa restrição mantém Editar e Inativar acessíveis quando outras colunas são redimensionadas.

A ordenação atual do servidor foi preservada: `createdAt desc`, com desempate por `id asc`. Os metadados das colunas declaram a ausência de ordenação interativa no cabeçalho; o piloto não faz ordenação parcial dos 20 itens visíveis.

## 3. Encaixe medido no navegador

Condições: Chrome local, fonte-base do documento de 16 px, leitura dos dados existentes, viewport em pixels CSS. Foram conferidos limites dos contêineres, última linha, última coluna, paginação, cabeçalhos e fontes, além da ausência de barras.

| Viewport | Registros | Colunas | Fonte | Linha | Overflow da página/tabela | Última linha e paginação |
|---|---:|---:|---:|---:|---|---|
| 1920×1080 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1440×900 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1366×768 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1280×720 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1366×650 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 1024×768 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 768×1024 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |
| 800×600 | 20 | 8 | 13 px | 24 px | Não | Dentro da área |

Não foram detectadas colunas escondidas nem cabeçalhos recortados nesses cenários. A tabela usou exatamente a largura do contêiner. Em telas altas, as linhas mantiveram 24 px, sem esticar para preencher toda a altura.

### Orçamento nominal mínimo desta configuração

```text
Header principal:        36 px
Busca/filtros:           32 px
Cabeçalho da tabela:     24 px
20 linhas × 24 px:      480 px
Paginação:               28 px
Total:                  600 px
```

A soma dos mínimos das oito colunas é **740 px**. Assim, a referência nominal calculada é uma área de janela de pelo menos **740×600 px CSS**, com fonte-base de 16 px; a matriz efetivamente testada começa em 768 px de largura ou 800×600 no caso de baixa altura.

As linhas usam divisórias internas que não acrescentam pixels ao orçamento de altura. Título e ações foram integrados no header do piloto; não há outra faixa de título ou rodapé institucional consumindo altura entre esses elementos.

## 4. Celular e tablet com interação emulada

Também foram usados perfis de dispositivo com toque, além dos viewports desktop:

| Perfil/cenário | Resultado |
|---|---|
| iPhone emulado, 390×844 | 20 registros e oito colunas; tabela de 740 px com rolagem horizontal local; nenhuma rolagem horizontal da página. |
| iPhone emulado, 844×390 | 20 registros; rolagem vertical da página autorizada e paginação alcançável; sem outra área vertical rolável dentro da tabela. |
| iPad emulado, 1024×768 | 20 registros, oito colunas, sem rolagem; abertura de detalhes e ajuste de coluna por toque verificados. |
| iPad emulado, 768×1024 | Mesmo resultado, preservando largura total durante o ajuste por toque. |

A política não usa a largura da janela como identificação de celular. Reconhece assinaturas de smartphones comuns e trata tablets/desktop separadamente; navegadores não classificados seguem as restrições de computador/tablet. Essa identificação é conservadora e não constitui prova universal da classe física do aparelho. Validar aparelhos e navegadores reais utilizados pelo município antes da expansão.

## 5. Comportamentos verificados

### Na rota real

- Menu inicialmente recolhido e sem faixa lateral vazia.
- Abrir o menu em sobreposição não muda a largura da tabela; `Esc` fecha a sobreposição.
- Valores integrais de rua/titular disponíveis por acionador visível.
- Cópia do valor integral e retorno do foco à célula ao fechar o diálogo.
- Ajuste de colunas pelo mouse, teclado e toque sem aumentar a largura total.
- Preferência mantida após recarregar e restauração de larguras no header/teclado.
- Intervalo da página seguinte atualizado para 21–40.
- Aplicação de status/categoria retorna à primeira página.
- Navegação preserva os filtros na URL.
- Limpeza explícita e resultado vazio com `0–0 de 0 registros`.

### Massa controlada isolada, sem cadastro de dados de negócio no banco

Os mesmos componentes foram renderizados com 21 registros e um campo extenso, usando as folhas de estilo da aplicação:

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

Executadas com sucesso:

```powershell
node --import tsx --test tests/operational-table.test.ts tests/sanitation-unit-identifier.test.ts
npm run build
```

Resultado: **seis testes aprovados**, além de ESLint nos arquivos alterados e **build completo aprovado**, com as oito partições de checagem TypeScript, compilação do Next.js e geração das páginas concluídas.

Os testes persistidos cobrem conservação da largura total, limites das colunas, proteção da coluna de ações, reaplicação de preferências em tablet, conflito abaixo da largura mínima e leitura integral com grafemas Unicode.

## 8. Roteiro rápido para o proprietário validar

- [ ] Conferir a aparência e a densidade das 20 linhas em notebook/tablet.
- [ ] Abrir rua, bairro e titular pelo ícone e conferir a informação integral.
- [ ] Arrastar divisórias, usar setas e restaurar as larguras.
- [ ] Pesquisar, aplicar/limpar filtros, navegar e ir a uma página específica.
- [ ] Abrir e fechar o menu sem perder largura de tabela.
- [ ] Conferir os acessos Nova unidade, Editar e Inativar.
- [ ] Conferir celular, zoom e aparelhos efetivamente utilizados.
- [ ] Informar os ajustes desejados no piloto antes da aplicação às outras tabelas.
