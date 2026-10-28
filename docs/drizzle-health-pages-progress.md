# Saúde — páginas e componentes Drizzle

## Reserva exclusiva

- Transferência recebida em 28/10: todos os `.tsx` em `src/app/app-domain/saude/**`; novos repositories `health-pages/**`, contratos `src/lib/contracts/health-pages.ts` e mappings mínimos `src/db/schema/health-pages.ts`.
- Actions/APIs `.ts`, serviços e repositories/schemas Saúde existentes permanecem sob o owner original. Consultar serviços em migração e registrar handoffs aqui.
- Guia Next instalado de fetching lido. Queries recebem `DatabaseExecutor` (`context.database ?? db`); transações reais quando necessárias. Nenhuma API ORM simulada.
- Baseline visual: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`. Preservar AST JSX, CSS, handlers e contratos de actions.
- Gate pesado centralizado: sem build/tsc/PGlite/Git/DDL/carga/instalação nesta frente. Lint e parsing leves permitidos.

## Inventário inicial

- Snapshot de entrada local: 33 `.tsx` ainda contêm referências Prisma diretas; outras páginas já têm alterações Drizzle do owner anterior e também precisam de revisão de DTOs/escalares/JSX.
- Prioridades: consultas administrativas, farmácia/vacinação, TFD/acompanhamento e painéis/listas. Meta: zero Prisma em todos os `.tsx`, preservando filtros, ordenação, limites, nulls, escopo e sigilo.

## Validação

Em execução; nenhuma aprovação integral declarada.
