# Saúde — migração residual para Drizzle

## Escopo entregue

- `src/lib/saude/health-stock-service.ts`: recebimentos, aprovação, política, transferências/aceite, importação de produtos, reconciliação e baixa com queries e transações Drizzle explícitas. Locks transacionais, idempotência e validações de escopo foram preservados.
- `src/db/schema/health-stock.ts`: mapeamento das quatro tabelas históricas de recebimentos e transferências; quantidades/custos físicos continuam `double precision`, sem converter os numerics monetários das movimentações.
- Actions residuais de Farmácia, laboratório, importações SUS, unificações, vacinação e TFD migradas, preservando contratos de erro dos consumidores e timeout de 60 segundos na importação SUS.
- Loaders residuais de acompanhamento, RAAS, vacinação/carteira/ESAVI/gestão, vigilância, unificações, laboratório, SISAB, centro especializado, TFD/laudos/viagens e gerencial migrados com joins e composição explícita de DTOs.
- `health-pharmacy-pages/stock.ts` e `requests.ts`: aliases para projeções distintas da mesma tabela física.
- Fixture decimal de `tests/drizzle-health-pharmacy-pages.test.ts`: total monetário coerente com quantidade `1.125` e custo `999999999999.123456`, mantendo os asserts de precisão (`1124999999999.01`).
- `care-program-service.ts`: transações usam `healthDatabaseConnection(context)`, respeitando a conexão injetada pela fixture.
- `production-service.ts`: ID não anulável na projeção do agendamento associado; evita que a detecção de ausência de `LEFT JOIN` do Drizzle descarte o snapshot da prestadora quando o município está vazio.

## Verificações

Inventário de referência: `.agent/current-migration-inventory.json`. Busca final por `prisma`, `Prisma`, `findMany`, `findUnique`, `$queryRaw` e `$transaction` sem ocorrências em `src/app/app-domain/saude/**` e `health-stock-service.ts`.

Resultados concluídos:

- Farmácia: `node --conditions=react-server --import tsx --test tests/drizzle-health-pharmacy-pages.test.ts tests/drizzle-health-pharmacy-pages-ast.test.ts` — **12/12**.
- `tests/health-pharmacy-invoice.test.ts` — **2/2**.
- `tests/drizzle-health-management-operations.test.ts` — passou com seus subtests.
- `tests/drizzle-health-catalog-tools.test.ts` — passou com seus subtests.
- Contratos AST de Farmácia e políticas de linhas de cuidado, cadastro, vacinação, acompanhamento e indicadores, executados sequencialmente — **17/17**.
- `git diff --check` no recorte alterado de Saúde — passou.
- Parse TypeScript e conferência de exports dos imports diretos de schemas em **36 arquivos alterados de Saúde** — zero erros (verificação sintática/de imports, não substitui typecheck).
- Comparação dos ASTs JSX com `HEAD`, normalizando apenas finais de linha, nas **19 páginas migradas** — nenhum JSX alterado.

## Validação em andamento

- Nova execução do checklist integrado após corrigir a projeção do snapshot da prestadora.
- Nova tentativa de TypeScript com heap de 4 GB e `--incremental false`.

Tentativas anteriores de TypeScript expiraram ou excederam memória; não constituem aprovação de tipos. A execução anterior do checklist passou pelos fluxos iniciais de estoque/Farmácia/vacinação/TFD e falhou na linha 983 em faturamento (esperado `9.00`, recebido `undefined`), motivando a correção de projeção acima. Não houve relaxamento dos asserts. Execuções PGlite pesadas devem ser sequenciais para evitar OOM.

## Integração

Sem commit e sem build global, conforme o recorte delegado. Há alterações concorrentes de outros agentes no workspace; este documento registra apenas o trabalho de Saúde. A aprovação final depende dos resultados do checklist e da verificação de tipos registrados acima.
