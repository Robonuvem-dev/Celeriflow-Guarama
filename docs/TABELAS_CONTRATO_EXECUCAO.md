# Contrato de integração dos lotes de tabelas

Execução autorizada pelo proprietário em 29/10/2026, incluindo agentes auxiliares por lotes. Referências: `Padrão de Tabelas.md`, `PLANO_ADEQUACAO_PADRAO_TABELAS.md` e piloto de Unidades Consumidoras. O escopo-base é de 330 estruturas operacionais com rota; seis legados, sete formatos especiais e 32 grades de edição têm classificação própria.

## Responsabilidade compartilhada

O executor principal mantém exclusivamente `src/components/app-ui/operational/*`, `src/lib/operational-tables.ts`, `ClientLayout.tsx`, `ModuleShell.tsx`, `PageFrame.tsx`, `PageHeader.tsx`, `ErpPageTitle.tsx`, scanner, integração e build. Cada lote altera somente seus módulos, seu manifesto e seu relatório. Não executar substituições em massa, commits, pushes, seeds ou mutações no banco.

## API comum (compatível com o piloto)

- `OperationalColumn` de `@/lib/operational-tables`: `{ key, label, type: "text" | "identifier" | "status" | "actions", initialWidth, minWidth, maxWidth?, resizable, sortable, details: "overflow" | "none", align?: "left" | "center" | "right" }`. Declarar limites reais por coluna. Não ocultar campos para caber.
- `OperationalRow` de `@/components/app-ui/operational/OperationalTable`: `{ id, label, values: Record<string,string>, actions?: ReactNode, cells?: Record<string,ReactNode> }`. `values` contém o texto integral; `cells` permite preservar links, seleção e controles específicos. Conteúdo composto deve ter acesso integral explícito, sem empilhar atributos independentes.
- `OperationalTable`: `{ columns, rows, preferenceId, resetVersion?, state?: "ready" | "loading" | "error", onRetry?, caption?, emptyMessage?, loadingMessage?, errorMessage? }`. Usar no máximo os 20 registros da página. Mede espaço, distribui larguras, diagnostica mínimos incompatíveis, preserva fonte, oferece detalhes, teclado e restauração por Home/duplo clique. Não implementa filtragem ou recorte de dados automaticamente.
- `OperationalListFrame` de `@/components/app-ui/operational/OperationalListFrame`: `{ children, toolbar?, actions?, pagination, label? }`. Organiza faixa de 32px, corpo flexível e rodapé de 28px; as ações vão ao header do workspace. `children` é a tabela, sem wrapper de scroll.
- `OperationalPagination` de `OperationalTable`: `{ page, total, pending?, onPageChange }`, tamanho sempre `OPERATIONAL_PAGE_SIZE = 20`.
- `OperationalLinkPagination` de `OperationalListFrame`: `{ page, total, pathname?, values?: Record<string,string|number|undefined|null>, pageParam?: string }`. Preserva parâmetros de consulta, usa navegação de rota para primeira/anterior/próxima/última e salto.
- `OperationalFilters` de `OperationalListFrame`: `{ children, activeCount?, label? }`. Sobreposição acessível para filtros excedentes; pode conter formulário GET existente. Busca principal permanece na faixa compacta. Preservar aplicação/limpeza e semântica de filtros.
- `OperationalHeaderActions` e `useOperationalWorkspace` existentes continuam disponíveis. `useOptionalOperationalWorkspace()` de `OperationalWorkspace` retorna o contexto ou `null`; layouts específicos usam esse hook para retornar apenas `children` nas rotas já registradas.
- Tokens em `operational/operational.module.css`: `list`, `toolbar`, `searchForm`, `searchInput`, `filterButton`, `iconButton`, `rowActions`, `newButton`, `newLabel`, `dialog`, `dialogButton`, `primaryButton`, `filterFields`, `dialogFooter`, `dialogButtons`, `srOnly`.

## Manifesto de cada lote

Criar `src/components/app-ui/operational/modules/<lote>.ts` exportando `operationalModules` tipado como `OperationalModuleConfig[]`, importando o tipo de `../routes`.

```ts
type OperationalModuleConfig = {
  key: string;
  moduleTitle: string;
  moduleCaption?: string;
  moduleIcon: ModuleIconName;
  navigation: ModuleNavGroup[];
  routes: { pathname: string; title: string; excludeQuery?: Record<string, string[]> }[];
};
```

Usar caminhos concretos ou templates Next (`[id]`, `[...slug]`); registrar somente rotas realmente migradas para composição operacional. `excludeQuery` permite manter outra composição quando uma variante de formulário compartilha a URL (ex.: `view=movimentar`). Reutilizar os destinos e a identidade dos menus existentes; preservar `exact` e filtros de query. O principal integra os manifestos no `ClientLayout`; `ModuleShell` reconhece o workspace e evita menu duplicado. Layouts próprios devem ser adaptados pelo lote via `useOptionalOperationalWorkspace`. Para rotas fora da composição operacional (documento, formulário, detalhe com várias áreas), preservar o fluxo e registrar conflito estrutural concreto.

## Evidência por lote

Criar `docs/tabelas-lotes/<lote>.md`: cada estrutura/arquivo e rotas, colunas, origem/paginação, alterações, verificação executada e situação real (`implementada`, `validada`, `bloqueada`, `legado`, `especial`). Distinguir implementação de homologação visual. Não declarar que testes estáticos provam geometria. Casos bloqueados devem identificar requisito e menor adaptação necessária; continuar os independentes.

Inspecionar cada arquivo antes de editar e todos os consumidores antes de alterar assinaturas exportadas. Preservar DTOs, queries/ORM, ações, permissões, totais filtrados, ordenação, seleção não salva e exportação integral. O mesmo componente compartilhado não é contado novamente por rota. Rodar ESLint nos arquivos alterados do lote; o principal executa integração, testes e build completo.
