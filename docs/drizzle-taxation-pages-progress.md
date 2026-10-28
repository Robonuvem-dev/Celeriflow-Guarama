# Tributação — páginas e componentes de leitura

## Reserva exclusiva

- Somente `src/app/app-domain/tributacao/**/*.tsx` e arquivos novos em `src/db/repositories/taxation-pages/**`, `src/db/schema/taxation-pages.ts`, `src/lib/contracts/taxation-pages.ts` e este documento.
- Inventário inicial somente leitura: **146 TSX, 65 com referência direta Prisma**. Os 133 arquivos anteriores incluem actions `.ts`, fora desta reserva.
- Guias locais Next de Server Components/data fetching, AGENTS e planejamento/contratos/status integrais lidos. JSX, classes, texto e HTML preservados; resultado da comparação AST abaixo.
- Sem DDL, acesso remoto, build/tsc/PGlite concorrentes, Git, alteração de actions ou de schemas alheios.

## Handoff ao owner Tributação (serviços fora da reserva)

Os chamadores TSX já passam `context.database ?? db` às funções abaixo, preservando os demais argumentos e retorno. O owner deve migrar suas leituras/serviços para **DatabaseExecutor** (ou conexão explícita quando a unidade original abre read transaction), passando a mesma transação aos helpers:

- `simulateGroupedPropertyValuation` (`property-group-simulation.ts`)
- `readAnnualTaxComparison` (`annual-comparison.ts`)
- `readAnnualTaxSummary` (`annual-tax-summary.ts`)
- `readTaxAccountingMovements` (`accounting-movements.ts`)
- `readPgvBulkSelection` (`pgv-bulk.ts`)
- `readEconomicProfiles` (`economic-query.ts`)
- `tributarioBi` (`s9-service.ts`)
- `listVafOverview` (`s10-service.ts`)
- `assertPropertyCadastralAccess` (`property-access.ts`), usado em `imoveis/[id]/page.tsx`.
- `readPropertyStructure` (`property-structure.ts`), usado em `imoveis/[id]/PropertyStructure.tsx`.
- `assertInternalItbiProcessAccess` e `readInternalItbiChannel` (`itbi-process-channel.ts`), usados em `itbi/comunicacao/ItbiFieldHistory.tsx` e `itbi/comunicacao/page.tsx`.
- `getAssessmentAccount` (`s2-service.ts`), usado em `motor-fiscal/[id]/page.tsx`.
- `ensureTributarioS3Defaults` (`s3-service.ts`), chamado antes das leituras em `domicilio-tributario/page.tsx`.
- `collectionDashboard` (`s8-service.ts`), usado em `cobranca/page.tsx`.
- `ensureS9Defaults`, `listEnrollmentCandidates`, `selectProtestCandidates`, `daBook` (`s9-service.ts`), usados em `divida-ativa/page.tsx`; ordem original dos defaults/leitores preservada.
- `taxAssessmentCompensatedValue` (`scope.ts`), usado em `motor-fiscal/page.tsx`; já possui overload Drizzle do owner e continua recebendo o executor do chamador.
- **Fora de `src/lib/tributacao`:** `getFiscalRegistryWorkspaceData` em `src/app/app-domain/tributacao/cadastros-fiscais/data.ts`, consumido por `pessoas/[id]/page.tsx`, `economico/[id]/page.tsx` e `imoveis/[id]/page.tsx`. A action/helper `.ts` permanece na reserva do owner. Preservar o OR de categorias não restritas + UGs autorizadas, ordem `effectiveFrom DESC, createdAt DESC`, seletores e serialização ISO.
- `readFiscalInspectionPage` em `src/db/repositories/taxation/fiscal-inspection.ts` já é Drizzle; seu TSX agora também respeita `context.database ?? db`.

O diagnóstico central de 2026-10-28 (`.agent/drizzle-integration-build-errors.json`, `checkedAt=2026-10-28T16:53:45.690Z`) registrou **23 TS2345 nos consumidores TSX**, todos em chamadas aos serviços acima ainda tipados Prisma naquela rodada. Não houve adaptação por cast ou retorno ao cliente legado. O único erro dos repositórios próprios, `fiscal-options.ts`/`purposes`, foi corrigido depois desse diagnóstico e aguarda a próxima checagem central.

Atualização após transferência exclusiva dos motores imobiliários: `simulateGroupedPropertyValuation` e `readPropertyStructure` agora recebem **DatabaseConnection**, pois conservam as transações read snapshot originais. Seus três TSX consumidores próprios foram adaptados para `databaseConnection`; `assertPropertyCadastralAccess` e `readPgvBulkSelection` já recebem **DatabaseExecutor**. Handoff completo em `docs/drizzle-tax-property-progress.md`.

## Implementação concluída nesta reserva

- **146 TSX inventariados; zero imports Prisma, tipos Prisma ou chamadas `prisma.*` residuais.** 65 arquivos tinham referência direta inicial. Há 68 TSX diferentes da cópia visual de referência, incluindo integrações que já estavam sendo atualizadas por outra frente.
- 18 módulos explícitos em `src/db/repositories/taxation-pages/`: `overview`, `registry`, `lookups`, `assessments`, `cadastral-details`, `economic-processes`, `fiscal-options`, `fiscal-engine`, `integration-events`, `itbi`, `annual-batches`, `operations`, `nfse`, `simples`, `dte`, `collection`, `active-debt`, `desif`.
- DTOs próprios em `src/lib/contracts/taxation-pages.ts`; 13 projeções de leitura/165 colunas em `src/db/schema/taxation-pages.ts`. Sem registro global de relações, DDL ou camada compatível Prisma.
- Todas as consultas usam o `DatabaseExecutor` recebido. Nomes locais/props server-component `prisma` foram conservados onde aparecem no JSX original; o valor/tipo é Drizzle.
- `select()` tipado conserva os decoders de Date e Decimal. Todo timestamp selecionado por `execute()` e todo timestamp conhecido em JSON aninhado são convertidos explicitamente com `databaseTimestamp`; numeric bruto usa `new Decimal(string)`, nunca `Number` intermediário. Conversões finais `Number()` existentes nos DTOs de UI foram preservadas.
- UGs vazias produzem predicado falso. Escopos JSON comparam JSON string, sem transformar number/null em string. Lotes de dívida preservam existência de filho visível **e** ausência de filho invisível (`some + every`). Eventos limitados conservam limites individuais por pai e ordenação.
- Licenças configuradas são filtradas por IDs no SQL; partes/endereços e relações efetivamente consumidas pelos detalhes foram revisadas contra cada TSX. DTOs são projeções explícitas dos campos de leitura, sem casts de payload/schema.
- Certificados: DDL `20261010110000_add_a1_certificate_evidence/migration.sql` e catálogo independente confirmam `purposes JSONB NOT NULL DEFAULT '[]'`. Projeção exclusiva `pageSigningCertificates.purposes` usa `.$type<JsonValue>()`; mantém arrays, objetos e JSON `null`, sem `JSON.parse/stringify` de adaptação nem cast de `unknown`. JSX `Array.isArray(...).includes("GED")` idêntico.

## Verificações leves executadas

- ESLint nos 146 TSX, repositórios próprios, schema e contratos: **exit 0, zero erros e zero avisos** após a revisão final.
- Parse TypeScript/TSX dos mesmos arquivos: **zero diagnósticos sintáticos**.
- Comparação somente leitura das raízes JSX contra `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`: **146 TSX / 68 diferentes / zero divergências JSX**. Comparação conserva texto literal e normaliza apenas CRLF/LF.
- Recomparação após integrar os contratos transacionais imobiliários: **146 TSX / uma única expressão JSX de infraestrutura diferente**, `PropertyStructure prisma={prisma}` → `prisma={databaseConnection}`. Demais raízes, HTML, classes e textos idênticos; a estrutura preserva o repeatable-read original.
- Catálogo independente `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **13 tabelas/projeções, 165 colunas, zero divergências** de existência, tipo físico/precisão/escala e nulabilidade.
- Extração AST somente leitura de 166 templates SQL da implementação: nomes físicos de tabelas e referências de colunas qualificadas confrontados com o catálogo, sem divergências. Esta análise estática não substitui execução SQL.

## Validação central

Build, checagem estrita e testes de integração com driver Neon real/PGlite devem ser executados sequencialmente pelo integrador. Nenhum resultado global é inferido de lint/parse. Fixture compartilhada deve conservar dez transportes e pool de cinco clientes, histórico SQL como origem de DDL e catálogo independente como oráculo de colunas/tipos.

Fixture preparada em `src/db/repositories/taxation-pages/pages.integration.test.ts`, dentro da reserva, reutilizando `tests/helpers/taxation-drizzle-fixture.ts` e `local-drizzle-database.ts` existentes. **Não executada por esta frente**, para respeitar a fila central.

Primeira execução central informada: **6 subtestes PASS / 1 FAIL** (e falha do teste pai), com único defeito real na projeção `listPageValuationTaxes`: interpolar `${taxes.id}` dentro de subquery no SELECT gerava referência sem qualificação, autocorrelação na primeira expressão e SQLSTATE 42702 na segunda. Corrigidas individualmente **as duas expressões** para `m."taxId"="Tax"."id"`, com identificadores literais estáticos. Mantidas subqueries escalares, sem JOIN adicional, filtro ou ordenação novos. Acrescentado subteste com IPTU/ITBI, dois mapeamentos/contas de UGs distintas e terceiro tributo sem mapeamento; verifica correlação de ambos os campos, ausência de duplicação e manutenção do null. Correção aguarda reteste central. Demais cenários JSON null, Date/Decimal, escopos, limites e paginação passaram nessa execução informada.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 src/db/repositories/taxation-pages/pages.integration.test.ts
```

Cobertura preparada: catálogo derivado do histórico SQL; execução de todos os leitores pelo driver real; caminhos sem IDs e UGs ausentes/vazias/preenchidas; certificados com array/objeto/JSON null e validade; string/number/null nos escopos JSON; Decimal acima do limite de precisão de Number; Date de select tipado e SQL bruto/aninhado; uso da transação repeatable read e rollback; lotes visíveis/mistos/invisíveis/vazios; limites 5/6 de eventos por pai; paginação de pessoas com 25 registros/20 por página, total, endereços e relações opcionais. A central pode executar sequencialmente em `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Pacific/Auckland` para verificar os campos UTC contra os mesmos valores literais.

Estado: **migração das leituras TSX concluída; integração e validação pesada centrais pendentes**. Não há resultado de build/typecheck/teste de driver atribuído a esta frente. Permanecem os handoffs de serviços `.ts` relacionados acima.
