# Handoff nominal — publicação do Planejamento

Destinatário: **ownerPlanejamento original / ownerPlanning**. Frente exclusiva: `src/lib/planejamento/publication.ts` e os novos arquivos abaixo. Implementação entregue localmente em 2026-10-28; integração e testes físicos ficam com o parent central.

## Entrega

- `src/lib/planejamento/publication.ts`: zero imports, delegates, raw queries ou transações Prisma. Mantidos os nove nomes/ordem de exports, os sete exports de função, a ordem/nome dos argumentos de negócio, defaults de formato/storage e todos os retornos.
- `src/lib/contracts/planning-publication-operations.ts`: contexto independente do legado, formato e contexto proprietário de conexão.
- `src/db/schema/planning-publication-operations.ts`: mappings completos de `PlanningReportPublication` e `PlanningPublicationEvent`, conferidos com o catálogo instalado e `prisma/migrations-ibema/20261011220000_planning_publication/migration.sql`. Apenas mappings de runtime; a autoridade física continua nos SQL históricos.
- `src/db/repositories/planning-publication-operations/records.ts`: leitores por executor; mutações, locks e eventos exclusivamente por `DatabaseTransaction`.
- `tests/drizzle-planning-publication-operations.test.ts`: teste puro executado e jornada física preparada com replay dos **156 SQL históricos**, driver de produção Neon/Drizzle e transporte PGlite local. Fixture SQL independente, sem DMMF.

## Contratos públicos preservados

| Export, em ordem original | Persistência / resultado |
| --- | --- |
| `PlanningPublicationStorage` | Mesmo tipo `{ put(filename, bytes, contentType), get(url) }` |
| `planningPublicationStorage` | Mesmo upload financeiro gerado e leitura de blob |
| `renderPlanningPublication(dataset, format)` | Mesmo PDF/CSV e metadados preservados; `Uint8Array` |
| `publishPlanningReport(context, raw, storage?)` | `context.connection: DatabaseConnection` **obrigatória**; `{ id, status: "PUBLISHED", publicUrl, fileHash }` |
| `withdrawPlanningPublication(context, raw)` | `context.connection: DatabaseConnection` **obrigatória**; ID; retirada repetida devolve o mesmo ID |
| `readPlanningPublishedFile(db, publicKey, storage?)` | `DatabaseExecutor`, inclusive `tx`; `{ bytes, filename, contentType, hash }` |
| `readPlanningArchivedFile(context, snapshotId, format, storage?)` | Contexto mínimo leitor; mesmo artefato ou `null` |
| `listPlanningPublications(db, raw)` | `DatabaseExecutor`; `{ total, page, records }`, projeção pública idêntica |
| `listPlanningPublicationManagement(context, instrumentId, requestedPage = 1)` | Contexto mínimo leitor; snapshots e subprojeção `publications` idênticos |

Contexto leitor: `{ user: PermissionUser, jurisdiction: PlanningJurisdiction, database?: DatabaseExecutor, connection?: DatabaseConnection }`. Resolução de leitura pelo `planningDatabase` existente: `database` → `connection.db` → executor padrão. Assim um `database: tx` continua enxergando escritas ainda não commitadas e nunca é convertido em conexão.

Os dois proprietários de escrita exigem conexão explícita: não usam fallback de conexão. Leituras preparatórias do snapshot e da publicação usam `context.connection.db`; **todos** os passos de cada callback transacional usam seu `tx` originário. Esses proprietários são operações multifase com IO externo e não devem ser usados como writers dentro de transação de outro chamador.

## Invariantes preservados

- Aprovação legal específica, operação de Planejamento, Câmara no Legislativo e permissão de criação/atualização na Transparência continuam obrigatórias.
- Leitura do snapshot continua no `readPreservedPlanningReport`: ente ativo, jurisdição, UG, seleção/target integralmente visíveis e hash do dataset conferido.
- Instrumentos/peças canônicas são bloqueados em ordem de IDs deduplicados/ordenados. `assertWholePiece` e estado canônico `PUBLISHED` são conferidos no claim **e** na confirmação, inclusive no replay.
- Lock consultivo `PlanningPublication:<snapshotId>:<format>` preservado com `pg_advisory_xact_lock(hashtext(...))` no mesmo `tx`.
- Identidade única por snapshot/formato, `publicKey`, filename, tipo MIME, título, solicitante, motivo inicial e `kind=REVIEW_COPY` preservados.
- Mesmo ciclo `PENDING → ARCHIVING → PUBLISHED` ou `FAILED`, retry com a mesma identidade/arquivo e `attempts + 1`, lease de dez minutos, fencing por ID/token/status, rejeição de lease ativo e proteção contra confirmação/falha de tentativa antiga.
- Storage continua fora da transação. URL/hash são preservados em transação própria da mesma conexão antes da sondagem; a confirmação exige bytes disponíveis e SHA-256 exato. Nenhum upload adicional no replay ou no retry com arquivo já registrado.
- Claim+`ARCHIVE_REQUESTED`, confirmação+`PUBLISHED`, falha+`FAILED` e retirada+`WITHDRAWN` são atômicos. Retirada usa lock da própria publicação; só `PUBLISHED` pode ser retirada, `WITHDRAWN` não pode ser republicada.
- Histórico, snapshots, versão, norma, classificações, referências Financeiro/C7 e ledger não são regravados. As proteções de imutabilidade são as dos triggers históricos.
- Download privado pode recuperar o artefato após retirada; download público exige `PUBLISHED`. Mesmo SHA e bytes em ambos; integridade divergente continua com `AccessError` 423 e público ausente com 404.
- Listagem pública: filtros literais case-insensitive de entidade/ano, somente confirmadas, 20 por página, clamp, `publishedAt DESC/publicKey ASC`, sem IDs internos de snapshot.
- Gestão: permissão `issueReports`, instrumento visível, contenção JSON de todas as UGs do snapshot para não-admin, todos os IDs selecionados e target visíveis; `createdAt DESC/id ASC`, clamp seguro de página. Arrays raw **novos** são `sql.param(ids)::text[]`.
- Timestamps das novas consultas são selects de colunas tipadas Drizzle (UTC `Date`); só o contrato público de listagem converte para ISO. Nenhum timestamp/numeric cru é decodificado por cast. Valores Decimal/Float/JSON null do snapshot são preservados pelo leitor existente sem round-trip numérico nesta frente.

## Integração obrigatória do ownerPlanejamento original

### 1. Limpeza dos tipos compartilhados

Na última leitura, `src/lib/planejamento/access.ts` ainda define `PlanningContext = AppContext & ...`, com `prisma` obrigatório e `database` herdado mais estreito. Esta frente **não** o emulou nem fez casts para satisfazer esse legado.

Os helpers abaixo precisam aceitar o contexto mínimo de autorização `{ user, jurisdiction }`, com `database?: DatabaseExecutor`/`connection?: DatabaseConnection` apenas onde consumidos:

- `assertPlanningOperation` e `assertPlanningLegalAuthority` (`access.ts`);
- `lockLegalInstrument` e `assertWholePiece` (`operations-core.ts`);
- `planningInstrumentScope` e helpers de escopo encadeados (`src/db/repositories/planning/scope.ts`);
- `readPreservedPlanningReport` (`reports.ts`) e leitores de página que ele já usa.

Depois da limpeza do `PlanningContext`, esses contextos são estruturalmente compatíveis. Não manter `prisma` obrigatório nem resolver esses pontos com `as`, fake client ou segunda conexão.

### 2. Binding raw de arrays nos helpers existentes

Na última leitura, estes pontos compartilhados interpolam diretamente arrays JS em raw `ANY(...)`:

- `planningEntityScope` e `planningUnitScope`, em `src/db/repositories/planning/scope.ts`;
- `assertWholePiece`, em `src/lib/planejamento/operations-core.ts`.

O owner original deve usar `sql.param(context.user.allowedBudgetUnitIds)::text[]` nesses pontos. A suíte nova usa não-admin com duas UGs e seleção de vários instrumentos para detectar expansão em tupla; não mascarar o problema usando somente administrador ou UG única.

### 3. Consumidores auditados antes da mudança de persistência

Busca global por imports e todos os nove nomes de export realizada antes da edição. Consumidores atuais:

- `src/app/app-domain/planejamento/actions.ts`: casos `reportPublish` e `reportWithdraw`. O contexto passado deve garantir `connection: DatabaseConnection` originária. Tratamento de erro/retorno da Action permanece do owner de Actions.
- `src/lib/planejamento/report-response.ts`: publicação em `planningReportSnapshotResponse`; garantir a mesma conexão de contexto. Leitura de arquivo em `planningReportResponse` aceita o contexto mínimo/executor.
- `src/components/app-ui/planejamento/PlanningManagementPage.tsx`: `listPlanningPublicationManagement(context, id, page)` permanece leitor; pode receber `database: tx`.
- `src/lib/planejamento/publication-response.ts`: apenas import do tipo storage desta lib; sua leitura pública já está no módulo de Transparência.
- `tests/planning-publication.test.ts`: suíte legada com fixture Prisma; é do owner original e não foi editada. Deve ser integrada ao fluxo Drizzle pelo responsável. A nova suíte independente cobre esta entrega.
- `tests/drizzle-planning-pages.test.ts`: usa `publication-response`, portanto só tem dependência transitiva de tipo nesta entrega.

Portal/API de Transparência já importam os exports homônimos de `src/lib/transparencia/planning-publications.ts`, não os desta lib; esse caminho continua sob seu owner.

## Verificação e fila central

Executado nesta frente:

1. Teste puro: **PASS 1/1**, callback ~81 ms, processo ~981 ms; todas as colunas, nulabilidade e tipos dos dois mappings contra o catálogo independente instalado.
2. ESLint dos cinco arquivos TS: **PASS**, zero erros/warnings.
3. Parsing/export AST dos cinco arquivos: **PASS**, zero diagnósticos de sintaxe; nove nomes/ordem originais de exports preservados, incluindo sete funções.

Suíte física preparada (seis subtestes), a executar pelo parent após as integrações acima:

1. Executor originário enxerga publicação/eventos não commitados; rollback do chamador remove ambos e preserva os demais domínios.
2. CSV e PDF, bytes/hash privados e públicos, resposta HTTP, replay, imutabilidade e retirada idempotente.
3. Storage/sondagem divergente, retry sem novo upload e falhas SQL injetadas em cada evento (`ARCHIVE_REQUESTED`, `PUBLISHED`, `WITHDRAWN`, `FAILED`) provando atomicidade de estado+evidência.
4. Lease ativo, expiração/takeover e fencing contra confirmação/falha da tentativa antiga.
5. Mudança legal no target durante upload, peça integral, falta de permissão legal/Transparência, outro ente/UG, Câmara/jurisdição e ente inativo; snapshot de hash divergente.
6. Gestão com seleção/target/JSON completo, administrador versus não-admin, ordenação/paginação determinística, listagem pública e runtime ausente restaurado por rollback.

São seis subtestes físicos (o item 3 agrupa as quatro injeções), mais um teste puro. O replay histórico tem asserção explícita de 156 arquivos e não usa migrations futuras, fixtures geradas nem credenciais remotas. As comparações de estado/valores/datas/evidência são SQL independentes dos repositories migrados.

```powershell
# Leve — já executado
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-name-pattern="^pure publication catalog" tests/drizzle-planning-publication-operations.test.ts

# Parent central — físico, ainda não executado nesta frente
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-planning-publication-operations.test.ts
```

PGlite tem um backend; a fixture limita o pool a um antes dos cenários concorrentes. Isso verifica serialização em fila e fencing de leases entre fases, não contenção simultânea real entre backends PostgreSQL. Typecheck e build globais permanecem na agenda central; os resultados leves não certificam a integração física.
