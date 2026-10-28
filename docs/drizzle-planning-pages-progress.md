# Planejamento — páginas, lookups e relatórios em Drizzle

## Estado da entrega

Implementação do escopo atribuída nesta frente concluída na árvore compartilhada. **Validação leve aprovada; execução SQL, typecheck e build aguardam a integração central e os ajustes de contrato/core indicados abaixo.**

Baseline visual informado: `5cfa75d`, árvore `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`. A comparação foi feita por parsing/impressão de AST, sem operações Git.

## Inventário e preservação visual

Todos os **15 TSX** de `src/components/app-ui/planejamento/` foram examinados:

| Arquivo | Migração / verificação |
| --- | --- |
| `PlanningCatalogPage.tsx` | Catálogos canônicos, rateios somente na receita e opções dos formulários |
| `PlanningReferencePage.tsx` | Versões não MSC, árvore paginada e relações municipais autorizadas |
| `PlanningImportsPage.tsx` | Peças autorizadas e linhas com ordenação original `code,id` |
| `PlanningPages.tsx` | Entes/UGs, pais PPA/LDO, programas e contrapartes |
| `PlanningMaintenancePage.tsx` | Todos os ramos de manutenção, conversão de valores civis/Decimal e relações opcionais |
| `PlanningManagementPage.tsx` | GED, versões, peers, emendas, cotas/eventos, créditos, vínculos legislativos e legado |
| `PlanningHearingsPage.tsx` | Audiências/anexos e demandas com UG responsável autorizada |
| `PlanningReportForm.tsx` | Opções de peças, UGs, fontes, pares programa/ação distintos e créditos |
| `PlanningVersionPage.tsx` | Validação do snapshot e construtor Decimal isolado |
| `PlanningDocumentUpload.tsx` | AST integral preservada; contratos de ingresso/documentos conferidos |
| `PlanningForm.tsx` | AST integral preservada; actions chamadas via `await` continuam tratadas por `{ error }` |
| `PlanningLookupField.tsx` | AST integral preservada; opções, total/página e erro conservados |
| `PlanningRecordEditor.tsx` | AST integral preservada |
| `PlanningReportSubmission.tsx` | AST integral preservada; emissão, download e resultado de publicação conservados |
| `PlanningMovementHistory.tsx` | AST integral preservada; leitor permanece sob ownership do core |

Resultado visual: **14/15 JSX exatamente idênticos**. Em `PlanningVersionPage.tsx`, a única diferença no JSX é `new Prisma.Decimal(...)` → `new Decimal(...)`; normalizando somente esse binding, **15/15** são idênticos. Nenhum nó, atributo, texto, classe CSS ou cálculo visual foi modificado.

Também foi comparada a AST integral de `src/app/app-domain/financeiro/orcamento/planejamento/{page,PlanejamentoClient}.tsx`: ambas são idênticas à baseline, inclusive cálculos e redirect/wrapper.

## Persistência e contratos

### Arquivos de biblioteca migrados

- `src/lib/planejamento/lookups.ts`: preservados os **33 campos** da lista exportada, filtros, permissões DOCUMENTOS/CAMARA, paginação e `{ options, total, page }`.
- `src/lib/planejamento/reports.ts`: fontes completas atuais/históricas, todas as famílias, cortes físico/financeiro, eliminação de transferências, composições fiscais, GED/layout, preservação e releitura autorizada do snapshot; cadastro de obra e configuração fiscal transacionais.
- `src/lib/planejamento/report-layouts.ts`: documento GED lido pelo mesmo executor transacional, versão/hash preservados, snapshot/revisão legal nos estados fechados e auditoria.
- `src/lib/planejamento/publication-response.ts`: executor Drizzle e leitor público já migrado de Transparência, com os mesmos bytes, headers e respostas 404/423/503.

Todos os nomes exportados desses quatro arquivos correspondem à baseline. Consumidores conferidos em `src` e `tests`: actions de Planejamento, `report-response.ts`, `publication.ts` e testes de planejamento/publicação/adoção municipal. Contratos de erro das actions não foram alterados. A adaptação intencional de parâmetro é `PrismaClient` → `DatabaseExecutor` no wrapper público.

### Repositórios exclusivos novos

`src/db/repositories/planning-pages/`:

- `shared.ts`: seleção do executor, ente/UG, peça e ancestrais, classes documentais e paginação.
- `catalogs.ts`: catálogos canônicos, classificadores, versões publicadas e referências municipais.
- `navigation.ts`: entidades/vínculos, pais, programas, contrapartes e importações.
- `maintenance.ts`: consultas explícitas por entidade de manutenção.
- `management.ts`: gestão de documentos, versões, emendas, quotas, créditos, opções e legado.
- `hearings.ts`: audiências, anexos e demandas.
- `lookups.ts`: projeções SQL fixas por domínio, parametrizadas; nenhuma tradução de query Prisma.
- `reports.ts`: fontes integrais de relatório, programas/objetivos/indicadores/metas, movimentos, quotas/eventos, créditos e snapshots. As relações das linhas são carregadas em lotes pelo executor recebido.

Os leitores recebem `ReadExecutor`. Predicados compartilhados de ente/instrumento/UG/linha são reutilizados de `planning/scope.ts`. `every` em créditos/emendas é reproduzido por `NOT EXISTS` de item cujo escopo é `IS NOT TRUE`, incluindo lote vazio. Seletores de predecessores distinguem JSON `null`, chave ausente e valor string de UG/ente; seletores normativos respeitam edição fixada e revisão de apresentação vigente/futura.

`persistPlanningReport` usa `withDatabaseTransaction(planningConnection(context), ...)` com **`repeatable read` e timeout de 30 s**. Dataset, UGs distintas e INSERT do snapshot usam a mesma transação. A releitura confere todas as peças, UGs e hash. Não existe segunda ORM nesse caminho implementado.

### Contrato e mappings

- `src/lib/contracts/planning-pages.ts`: `ReadExecutor`, DTOs de lookup e validação dos objetos de relatório/snapshot/dataset, preservando propriedades JSON adicionais com `passthrough`.
- `src/db/schema/planning-pages.ts`: mappings completos de colunas de `PlanningCommunityDemand`, `PlanningLegislativeAmendment`, `PlanningAmendmentItem` e `PlanningReportSnapshot`.
- Os quatro mappings foram conferidos com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: quantidade de colunas, nomes, tipos e nulabilidade sem divergências. Nenhum DDL foi executado.
- Decimais são construídos de strings. Selects tipados fazem o decode temporal/numeric; os lookups raw retornam somente strings e contagens. Não há raw timestamp retornado sem decode nesta frente.

## Verificações executadas

1. **ESLint: exit 0, zero warnings** em todos os TSX, quatro libs atribuídos, oito repositórios, mapping, contrato e dois testes próprios.
2. **Parsing: 31 arquivos, zero erros sintáticos**. Inspeção estática dos imports locais não encontrou símbolos/caminhos ausentes; inventário de exports dos quatro libs coincide com a baseline.
3. **Suíte AST/mappings: 3 PASS / 0 FAIL / 0 SKIP**, comando:

   ```powershell
   node --max-old-space-size=256 --import tsx --test tests/drizzle-planning-pages-visual.test.ts
   ```

4. Grep do escopo TSX e dos quatro libs: zero referências Prisma/GetPayload e zero `as unknown as`.

A suíte SQL real **não foi executada nesta frente**. Typecheck e build permanecem centralizados, conforme a distribuição do trabalho.

## Testes SQL preparados para a janela central

`tests/drizzle-planning-pages.test.ts` usa fixture independente `createLocalDrizzleDatabase`, Neon/Drizzle sobre PGlite/socket e replay dos SQLs históricos via runner oficial. Oito cenários internos:

1. Ente/UG/jurisdição, projeções completas, limites e paginação.
2. Catálogos, percentual Decimal de seis casas, versões MSC e opcionais.
3. Todos os campos de lookup, SQL parametrizado, códigos versus IDs, JSON `null` versus chave ausente e revisão vigente/futura.
4. Audiência/GED, `every` em emenda/crédito, lote vazio e eventos de quota filtrados/ordenados.
5. Todos os ramos de manutenção, precisão monetary/física/Float, JSON íntegro e nulabilidade.
6. Todas as famílias de relatório, cortes, composições fiscais/layout, transação `READ ONLY`, leitura de alteração não commitada pelo executor e rollback.
7. Snapshot imutável, versão histórica, autorização integral de UGs, hash e preservação após novo movimento.
8. Bytes/headers de publicação, estados não públicos/retirada, hash divergente 423 e erro de storage 503.

O seed cria secretarias reais para todas as UGs. Edições de catálogo são preenchidas em `DRAFT` antes de publicar, respeitando o trigger histórico. IDs/códigos/nomes próprios têm prefixo PP; constraints e dados de referência históricos são preservados.

Após os ajustes do core abaixo, comando sugerido para execução **central e sequencial**:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-planning-pages.test.ts
```

## Dependências de integração encaminhadas ao core/parent

### 1. Arrays nos predicados compartilhados

Na última inspeção, `src/db/repositories/planning/scope.ts` interpolava arrays diretamente em `ANY(${array}::text[])`, nos predicados de ente e UG, propagados aos escopos de instrumento/linha. Compilação estática com `PgDialect` demonstrou:

| UGs | SQL atual |
| --- | --- |
| zero | `ANY(()::text[])` |
| uma | `ANY(($1)::text[])` com parâmetro string da UG |
| duas | `ANY(($1, $2)::text[])` |

O array precisa ser um parâmetro único, por exemplo `ANY(${sql.param(array)}::text[])`, que compila como `ANY($1::text[])`. O seletor novo de versões nesta frente já usa esse formato. `documents.ts` também tem o mesmo padrão no gate de todas as UGs. Esses arquivos compartilhados são de outro owner e não foram editados aqui.

### 2. Contexto transacional e remoção da obrigatoriedade Prisma

Na última inspeção, `PlanningContext` ainda herdava `AppContext.database?: Database` e `prisma` obrigatório. Leituras internas desta frente passam `{ ...context, database: tx }`, sem casts, e a fixture própria usa `{ user, jurisdiction, database, connection }`. O contrato de Planejamento precisa aceitar `DatabaseExecutor` e permitir o contexto Drizzle sem client Prisma, alinhado a `PlanningDatabaseContext` já existente em `database.ts`.

### 3. Helpers ainda em migração pelo core

Permaneciam Prisma em leituras recentes: `service.ts` (`lockPlanningInstrument`, listagem/detalhe), `versions.ts` (leitura/consistências/compatibilidade), `fiscal-execution.ts` (RCL e renúncias), `publication.ts` e parte de `access.ts`. Páginas/relatórios preservam os contratos desses exports, aguardando a conclusão da frente core. `operations-core.ts`, `documents.ts`, `catalog-presentation.ts` e `execution-bridge.ts` já tinham os caminhos Drizzle consultados por esta frente.

Testes existentes ainda têm fixtures Prisma e estão fora do escopo de edição desta frente; a suíte própria é independente. A entrega não deve ser registrada como SQL/build aprovado antes da rodada central.

## Ownership paralelo mantido

P1: parent informou **9 PASS / 0 FAIL**. Obras AST: **3 PASS**. A primeira falha SQL de Obras era colisão `PURPOSE/Residencial` no seed; correção com nome exclusivo, vínculo de finalidade e lint/parsing está em `tests/drizzle-works-pages.test.ts` e no relatório próprio. Reteste SQL de Obras e migração dos dois helpers de Assets seguem coordenados pelo parent.
