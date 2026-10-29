# Filtros e contexto extensos: leitura por partes

## Contrato implementado

`OperationalFilters` mantém sua API (`children`, `activeCount`, `label`). A alteração em `OperationalListFrame.tsx` fica no filtro; `OperationalListFrame` e `OperationalLinkPagination` mantêm seus contratos.

- Dispositivo vem de `useOptionalOperationalWorkspace()`, com fallback **incondicional** ao hook `useOperationalDevice()`. Um filtro fora do provider continua legítimo. Largura de tela não classifica notebook como telefone.
- **Desktop/notebook e dispositivo não classificado:** janela `overflow: hidden`, com **Parte 1 de N / Anterior / Próxima / Fechar** sempre no rodapé. Wheel e touchmove não movimentam livremente o conteúdo; deslocamentos nativos inesperados são restaurados à parte selecionada.
- **Tablet/phone, inclusive paisagem:** somente o corpo do diálogo usa `overflow-y: auto`. Cabeçalho e rodapé permanecem visíveis; o popup externo continua `overflow: hidden`, evitando duas áreas verticais.
- O popup é flex, limitado a `calc(100dvh - 16px)`. Cabeçalho/rodapé não encolhem; a janela tem `flex: 1 1 auto; min-height: 0`.

## Como as partes funcionam

`OperationalPagedContent.tsx` mantém **uma única árvore DOM** para o conteúdo inteiro. Não clona, desmonta, desabilita, move campos entre forms, usa `inert` ou troca `name`/`value` para paginar. Estado React, valores nativos, associação ao formulário e `FormData` permanecem integrais durante a navegação.

As partes são deslocamentos explícitos da janela. Há sobreposição de até 96 px (limitada a 25% da janela). São acrescentadas janelas quando um controle/label/bloco cabível ficaria cortado entre as partes regulares. Toda a extensão do contexto, inclusive trechos sem controles, é coberta sem lacunas; texto e fonte não são reduzidos para simular encaixe.

`ResizeObserver` observa janela e conteúdo. `MutationObserver` observa inserções, remoções, atributos e texto. Eventos de fontes (`fonts.ready`/`loadingdone`), resize normal e `visualViewport.resize` também recalculam as partes, agrupados com `requestAnimationFrame`.

Tab e Shift+Tab seguem a ordem original de **todos** os controles. `focus` e validação nativa (`invalid`) selecionam uma parte que contenha o controle inteiro. Uma segunda verificação no frame seguinte trata o scroll automático de foco do Chromium. Esc e o botão Fechar usam o diálogo existente; `finalFocus` retorna explicitamente ao botão que abriu o filtro.

Os botões de navegação e Fechar são `type="button"` e interrompem a propagação do clique, inclusive em árvores React com formulários ancestrais e portal do diálogo. Botões de submit do consumidor continuam com seu comportamento original.

## Regras para integração pelo principal

**Nenhuma alteração em `operational.module.css` é necessária para esta entrega.** Os estilos geométricos abaixo já estão locais no JSX e prevalecem sobre as antigas regras móveis de overflow do popup:

```css
/* Equivalente dos estilos locais; referência para eventual consolidação. */
.filtersDialog {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100dvh - 16px);
  overflow: hidden; /* também em phone/tablet */
}
/* Cabeçalho e rodapé: flex-shrink: 0. */
/* Wrapper de conteúdo e janela: flex: 1 1 auto; min-height: 0; min-width: 0. */
/* Somente janela móvel: overflow-y: auto; desktop/unclassified: hidden. */
```

Para reutilizar `OperationalPagedContent` em outro contexto, seu pai precisa ter uma altura/altura máxima efetiva e permitir encolhimento com `min-height: 0`. Passe `device`, `children`, `label` acessível e, se necessário, `footer`. O rodapé permanece fora da janela.

- Não introduzir containers internos com scroll vertical próprio nem aplicar `overflow: auto` ao popup inteiro.
- Pode-se marcar um grupo com `data-operational-block` para oferecer também uma parte onde ele apareça inteiro, quando couber.
- Um widget individual mais alto que a janela não pode ficar inteiro em uma parte: seu dono precisa dividi-lo em controles/blocos menores. O paginador não reduz fontes/tamanhos nem declara um falso estado de encaixe. Contexto textual maior que a janela continua acessível pelas partes sobrepostas.
- A preservação de DOM/rascunhos descrita é **entre partes**; o ciclo de montagem ao fechar o diálogo permanece o da base UI existente.

## Verificação específica em Chromium real

```powershell
node --test tests/operational-filters.browser.test.mjs
npx --no-install eslint src/components/app-ui/operational/OperationalListFrame.tsx src/components/app-ui/operational/OperationalPagedContent.tsx tests/operational-filters-browser-fixture.tsx tests/operational-filters.browser.test.mjs
node node_modules/typescript/bin/tsc -p tests/operational-filters.tsconfig.json --noEmit --pretty false
```

O teste usa o mesmo padrão do harness existente `scripts/verify-operational-browser.mjs`: esbuild, CSS Modules real, Tailwind compilado, faces Inter do cache Next, playwright-core instalado no diretório temporário aprovado e Chrome real. Aceita `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_PATH`, `OPERATIONAL_CDP_URL` e `OPERATIONAL_BROWSER_OUTPUT` (diretório existente).

Cobertura: 80 inputs com alturas/títulos variados e valores controlados/nativos; cobertura integral dos controles nos limites; seis resoluções desktop de 1920×1080 a 683×384 e 390×844 mantendo a política desktop; identidade dos nós; rascunhos; submissão de todos os 80 campos; navegação sem submit/propagação; Tab/Shift+Tab; foco programático e validação de controle fora da parte; Esc/focus trap/retorno; wheel e gesto touch real; contexto longo; inserção e mudança de geometria/fonte; resize com campo focado; tablet e phone retrato/paisagem com exatamente uma área de scroll natural; fallback fora do provider, override pelo provider e dispositivo não classificado.

Evidência JSON em `%LOCALAPPDATA%/Temp/opencode/operational-filters-browser-results.json` por padrão. O escopo é a base React e seus consumidores controlados; não aciona rotas, autenticação ou banco.

### Resultado desta execução — 29/10/2026

- Chromium **156.0.8078.73**: **11/11 testes passaram**, sem erros de runtime do navegador.
- ESLint dos dois componentes e dos dois arquivos de teste: passou sem avisos.
- TypeScript com `tests/operational-filters.tsconfig.json`: passou.
- O relatório inclui geometria das janelas/rodapés, quantidade de partes, cobertura dos 80 campos, rascunhos/submissão e verificações de teclado/touch.
