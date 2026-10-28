# RH — páginas TSX / leituras Drizzle

## Escopo e estado

- Frente exclusiva: todos os **98 TSX** de `src/app/app-domain/rh/**` encontrados no início da transferência. A árvore efetiva tinha **68 arquivos com referência direta Prisma**, todos agora sem essa referência.
- Leituras extraídas para `src/db/repositories/personnel-pages/{records,catalog,requests,workforce,folder,legal-history}.ts`; DTOs independentes em `src/lib/contracts/personnel-pages.ts`. **71 TSX alterados**: os 68 com referências legadas e três páginas cujas leituras já eram Drizzle (quadro de cargos, recadastramento e demonstrativo). Todos os 98 foram incluídos nas checagens.
- Reutilizados os mapeamentos dos proprietários, sem mudar schemas, actions, APIs ou motores `lib/rh`.
- Os 13 seeds especializados e sua entrega anterior estão preservados.

## Provas leves já executadas

- Comparação AST somente leitura com `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync` (base informada `5cfa75d`): **98 TSX comparados, zero divergência de JSX** (inclui expressões JSX e literais CSS).
- Varredura dos 98 TSX: **zero referências diretas a Prisma**.
- `tests/drizzle-personnel-pages-ast.test.ts`: **2 PASS, 0 FAIL, 0 SKIP**, heap de 256 MiB. Fingerprint de JSX/CSS extraído da base fornecida: `8f8a5d76c51cfcb85e6312ff929e9168a454b7cde1b32423781d4a2f99486649`.
- ESLint final com heap de 384 MiB: **107 arquivos, zero erros, zero warnings** (98 TSX + seis repositórios + contrato + dois testes).
- Parse sintático e resolução de imports (incluindo classificação de módulos Node e CSS local): **107 arquivos, zero problemas**, heap de 256 MiB. Esta checagem não é typecheck semântico.
- Sem execução de seeds, PGlite, build, typecheck pesado, Git ou acesso/DDL Neon nesta frente.

## Contratos com o owner RH

- `accessiblePayrollWhere(user)` já passou a retornar `SQL` sobre o mapeamento canônico `payrolls`; todos os novos joins que o usam incluem `Payroll` sem alias.
- `calculateRemunerationAverage(DatabaseExecutor, raw, payrollScope?: SQL)` já migrado pelo owner; página médias adaptada à assinatura observada.
- `describeHrExternalReadiness` ainda foi observado recebendo `PrismaClient`. Para não passar Drizzle a uma função legada, a leitura SSR está integralmente em `readPersonnelExternalReadiness(DatabaseExecutor)`, reutilizando somente `hrExternalConfigurationSchema` e preservando seus dois ambientes/estados/indicadores. O motor de gravação permanece do owner RH.
- A leitura de análise de inscrições está agora em `readRecruitmentApplicationReview(DatabaseExecutor, PermissionUser, requestedPage)`, com autorização `canPerformModuleOperation(user, 'RH', 'update')`, mesma mensagem/status, paginação crescente e escopo textual JSON original. Isso remove a dependência SSR de `listRecruitmentApplicationsForReview` sem editar o motor do owner. `createdAt` e `decidedAt` crus são decodificados explicitamente com `databaseTimestamp`.
- Leitores já existentes `inspectPositionPlan`, `listRecertificationProgress`, `getPayrollStatement` continuam com a assinatura Drizzle observada.

## Semânticas preservadas nas novas leituras

- Mesmo `getTenantContextForModule`/`Operation`, `context.database ?? db`, escopos, validações, fallbacks, parâmetros e decisões no JSX.
- Folhas legadas sem `SstBenefitPayrollScope` continuam visíveis; folhas com escopo exigem UG autorizada. Listagem administrativa simples de folhas não ganhou filtro extra inexistente.
- Pedidos/adiantamentos/publicações com lista de UG vazia negam linhas; comparação JSON usa valores `jsonb`, distinguindo texto, booleano e ausência/null.
- Solicitações genéricas usam secretaria da UG → servidor e conservam exclusões de kinds; requerimentos funcionais mantêm filtro `origin` e `configuration.budgetUnitId`.
- Roteiros de diárias: existe definição publicada e não existe etapa fora das secretarias autorizadas; definição sem etapas continua satisfazendo `every`. Assuntos ativos ordenados por nome.
- Pasta funcional mantém exclusão dos três vínculos clínicos/SST no GED e condiciona consulta à permissão/vínculo central; cancelamentos são lidos pela chave de origem.
- Filtros de ponto mantêm inclusive o limite superior original à meia-noite do último dia local, sem ampliar o período.
- Datas e Decimal são lidos por **colunas Drizzle tipadas**, inclusive parcelas, entradas, contratos/revisões, cálculos, documentos e histórico legal. Revisão após o aviso do contrato real Neon: três `execute()` retornam somente `ConfiguracaoInstancia.id`, `Expense.id/sourceId/status` e campos textuais/booleanos de `PublicService`; nenhum temporal/numeric persistido nesses retornos. Na leitura bruta de inscrições, `createdAt` e `decidedAt` têm DTO bruto `string | Date` e são convertidos **somente com `databaseTimestamp`**, preservando null e UTC/milissegundos. `number` e a contagem são inteiros PostgreSQL, sem conversão monetária. Não há JSON de relações montado pelo SQL nestes leitores. JSON de políticas/snapshots conserva datas textuais de origem; não recebe conversão recursiva. `new Date(input)` de políticas/calendário permanece legítimo e inalterado.
- As sete contagens do dashboard conservam `.catch(() => 0)` individual e ordem original.
- Nenhuma transação/lock/isolation foi acrescentada ou removida em SSR que originalmente fazia consultas independentes.

## Validação central

`tests/drizzle-personnel-pages.test.ts` está preparado, **não executado nesta frente**, para execução central com a fixture autônoma já aprovada `createSpecializedDrizzleFixture`, replay sequencial de todo SQL histórico e transporte Neon/Drizzle real. Nove subcenários:

1. Filtros, contagens/páginas, relações opcionais, dependentes e limites originais do ponto.
2. Escopo JSON/UG vazio/admin, exclusões de kinds, filas crescentes e página final de 23 pedidos.
3. `some` definição publicada / `every` etapa no escopo, definição sem etapas e assuntos ativos ordenados.
4. JSON booleano versus texto, dinheiro `90071992547409.93`, visibilidade legada/UG das folhas, publicação, revisão e JSON null.
5. Consignações → parcelas → entradas, ordem, cancelamento compensatório, Decimal e datas.
6. Pasta funcional, identidade central, permissão GED, exclusão clínica, direitos assinados e cancelamentos.
7. Exercício/ente autorizado, versões GED finais/assinadas, gatilho legal histórico, ordem dos eventos e última versão por cargo.
8. Parametrizações aninhadas, incidências/faixas ordenadas, taxas de seis casas, nulls e fallbacks eSocial.
9. Inscrições por SQL bruto: timestamps PostgreSQL sem zona decodificados em UTC com milissegundos, datas textuais de snapshot intactas, null, autorização e semântica textual `#>>` (inclusive `1` JSON versus UG textual `"1"`). O cenário pode ser repetido em fusos distintos pelo parent sem alterar os valores ISO esperados.

Todos os inserts do cenário ficam na mesma transação local com rollback sentinela e conferência pós-rollback; não há importação/execução de seeds, Prisma ou DMMF no teste. Datas de DTO são verificadas por ISO, incluindo as de relações aninhadas. O driver e o DDL históricos continuam autoridades.

### Correção após a primeira rodada central

- Resultado recebido do parent: dois subcenários passaram; o terceiro tentou inserir etapas em definições já publicadas (`P0001`), abortando a transação e causando seis falhas subsequentes `25P02`.
- Conferidos os guards físicos em `20261009232100_database_guards/migration.sql`: as definições agora nascem `DRAFT`, recebem suas etapas e só depois passam a `PUBLISHED`, com `publishedAt` e `publishedByUsuarioId` válidos. O roteiro vazio também é publicado legalmente; o roteiro de controle continua rascunho.
- Os nove subcenários agora passam pelo helper local `scenario`, que abre `db.transaction(operation)` (savepoint real Drizzle) dentro de cada `t.test`. O callback recebe a transação aninhada; falhas revertem seu savepoint antes de chegarem ao Node, preservando a falha original e permitindo que os demais cenários sejam diagnosticados.
- Validação leve da correção (heap 256 MiB): um arquivo com zero erros/warnings de ESLint, zero problemas de parse, 29 imports resolvidos e nove callbacks de cenário recebendo a transação do savepoint. Reteste de persistência pendente do parent.

Comandos para o parent:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/drizzle-personnel-pages-ast.test.ts
node --max-old-space-size=512 --import tsx --test --test-concurrency=1 tests/drizzle-personnel-pages.test.ts
```

Executar PostgreSQL/PGlite somente quando a rodada central permitir. Build/typecheck semânticos globais permanecem responsabilidade do parent; nenhum resultado de persistência novo é declarado aqui.
