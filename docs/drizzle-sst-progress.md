# SST — handoff da migração Drizzle

## Estado real

Atualizado em 28/10/2026. O núcleo SST do escopo retido foi migrado para Drizzle e os testes de serviço foram preparados com banco isolado real. A revisão estática e o ESLint passaram. O último reteste central das quatro suítes SST teve **35 PASS / 1 FAIL**; há correção de origem temporal da fixture para reteste abaixo. O diagnóstico TypeScript, o build e a aprovação integrada dependem do gate central.

As buscas atuais não encontram imports/delegates Prisma, `$queryRaw`, `$executeRaw` ou `$transaction` em `src/lib/sst/**`, nos `.ts` de `src/app/app-domain/sst/**`, em `src/app/api/sst/**` ou nos testes `tests/sst-*.test.ts`.

## Correções do gate central — quatro suítes para reteste

O parent informou **167 testes, 133 PASS e 34 FAIL em 725,87 s**, sendo **20 falhas SST em quatro arquivos**. Diagnóstico consultado: `.agent/drizzle-sst-fleet-portal-failures.json`. Os patches abaixo estão salvos para reteste central; esta frente executou somente verificações leves. TaxActions foi pausado com as alterações locais preservadas.

| Suíte | Falhas informadas | Correção preparada |
| --- | ---: | --- |
| `tests/sst-clinical-services.test.ts` | 16 | Os questionários `foreign-q` e `psy-q` tinham `questions=[]`, rejeitado pelo CHECK histórico de 1–100 questões. Os três seeds agora usam questões reais validadas por `questionnaireQuestions`, com seção e escolhas explícitas. As diferenças de UG/atuação e os asserts de rejeição permanecem. Dois matchers latentes de indisponibilidade do banco/auditoria também passam a conferir `cause` e SQLSTATE; `getPostgresError` expõe apenas código/constraint. |
| `tests/sst-functional-leave-posting.test.ts` | 1 | A falha `LEGACY_FLOAT_PRECISION_UNSUPPORTED` é conferida na causa PostgreSQL com SQLSTATE `P0001`. Os asserts originais permanecem, acrescidos de snapshots completos de folha, itens, escopos, evidências de escopo, versões de regra, origens e auditoria, comparados antes/depois do erro e do retorno `BLOCKED`. O arredondamento `HALF_UP` continua exigindo `0.02`. |
| `tests/sst-integrations.test.ts` | 1 | O workflow usa `createSstAccidentFixture`, que reaplica o histórico clínico/CAT/layout real. `SstCat` tem as 12 colunas da projeção, inclusive `submissionKey`, e `kind='TYPICAL'`. Evidências possuem todos os campos, investigação, pareceres favoráveis, atendimento canônico do ator e homologação nessa ordem. Layouts incluem proveniência, chaves e autor; a versão `COMPLETE` e seu vínculo médico são inseridos na mesma transação, respeitando o trigger diferido. Permanecem hashes, retries, ambientes, ACL, ausência de recibo oficial e bloqueio de transmissão. |
| `tests/sst-prevention.test.ts` | 2 | A falha `ballot unavailable` usa causa PostgreSQL + `P0001`, com rollback de comparecimento/cédula e auditoria inalterada. A paginação usa fixture sem o seed eleitoral, mantendo os totais originais **46 com leitura clínica / 45 sem leitura clínica**, com novos registros adversariais de outra UG, grants externos, escopo vazio e UG selecionada. |

### Prova do candidato extra da paginação

O seed comum inseria `election` (`budgetUnitId='ug'`, `kind='ELECTION'`, `clinical=false`) e `another` (`budgetUnitId='other'`, também não clínico). O contexto tem `allowedBudgetUnitIds=['ug']`; `listPrevention` sem filtro de espécie inclui `election` e exclui `another`. Logo, no cenário anterior, a contagem era **45 visitas + 1 audiometria + 1 eleição autorizada = 47**, exatamente o valor reportado pelo gate. Após revogar leitura clínica, seria **46**, não 45. A inspeção do predicado de produção confirma que os filtros de UG e clínico são aplicados tanto ao `count` quanto às linhas; a divergência vinha do seed de outro cenário.

A factory agora recebe `seedElections: false` apenas na paginação. O cenário eleitoral verifica explicitamente as duas linhas do baseline; o de paginação exige tabela inicialmente vazia e depois confere a composição física por UG/flag clínico. Com os dois registros adversariais, o banco contém **48** linhas: UG autorizada **45 operacionais + 1 clínica** e outra UG **1 operacional + 1 clínica**. O usuário de uma UG vê 46/45; o usuário autorizado nas duas vê 48, mas selecionar `ug` continua retornando exatamente os mesmos 46 IDs. Grant clínico isolado na outra UG não amplia autorização. Payload clínico não integra a projeção da lista, e os asserts de auditoria impedem efeitos colaterais nas leituras.

`tests/helpers/sst-database-error.ts` percorre a cadeia de `Error.cause`, protege contra ciclos e exige mensagem e SQLSTATE **na mesma causa**, sem aceitar mensagem do wrapper SQL/params. É usado somente pelas suítes SST. As constraints e os contratos de produção que motivaram os erros continuam sendo exercitados.

Validação leve concluída após os patches:

- ESLint dos quatro arquivos e do helper: **exit code 0**, sem warnings.
- Parse AST dos cinco arquivos: **zero erros**, **36 cenários preservados**.
- Dez verificações leves do matcher com `DrizzleQueryError` real em memória: causas diretas/encadeadas, SQLSTATE incorreto, falso positivo em SQL/params, erro genérico, ciclo e preservação do stack. Todas passaram, sem abrir banco.
- Conferência estática das colunas dos nove INSERTs CAT/evidência/layout contra o SQL histórico: **zero colunas faltantes**. Contagens físicas: CAT **12**, evidência **13**, layout **14**, vínculo médico **4**. A projeção Drizzle de CAT coincide nas 12 colunas.

### Reteste central solicitado

Os quatro arquivos conservam **36 cenários** (18 clínicos, 6 de postagem, 5 de integração e 7 de prevenção), incluindo os 20 que falharam. Executar serialmente:

```powershell
$sstRetest = @(
  'tests/sst-clinical-services.test.ts'
  'tests/sst-functional-leave-posting.test.ts'
  'tests/sst-integrations.test.ts'
  'tests/sst-prevention.test.ts'
)
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 @sstRetest
```

A confirmação runtime, o typecheck e o build pertencem ao gate central. O lote SST Pages de 16 testes aprovado anteriormente fica como evidência do parent.

### Retorno central: 35 PASS / 1 FAIL SST e correção temporal

O lote central de quatro suítes SST e duas de Compras terminou em **191,515 s**, com **37 PASS / 3 FAIL** no total. SST teve **35 PASS / 1 FAIL**; postagem, integração e prevenção passaram integralmente. As duas falhas de Compras possuem outro owner. Log consultado: `C:/Users/trici/.local/share/opencode/shell/969fc413fd5d7b689a08b7e442ae2897ef72c357/sh_183ded63d00110ZmQF6dREOyj1.out`.

A única falha SST foi a origem de `createdAt` no cenário de autorização/emissão clínica (`tests/sst-clinical-services.test.ts`, antigo assert da linha 237). A inspeção rastreou a escrita até o default físico **`CURRENT_TIMESTAMP` em `TIMESTAMP(3)` sem timezone**; a transação clínica inicia depois de `before`, sem transação de seed envolvendo a chamada. A leitura de `clinicalRecordDocument` é um **select tipado Drizzle**, cujo decoder interpreta esse valor como UTC; não é um `execute<T>` sem conversão. O default converte o instante para o timezone da sessão antes de descartar o offset. A fixture não fixava essa sessão e o host desta execução usa `America/Sao_Paulo` (offset 180 minutos). O log original não expõe o valor bruto, portanto o deslocamento exato ainda depende da conferência runtime abaixo.

Correção restrita à origem da fixture clínica: **`SET TIME ZONE 'UTC'` antes dos seeds**, estabelecendo o mesmo contrato UTC das colunas do runtime. Não foram alterados serviço, projeção, default histórico, política ou tolerância. O limite original `createdAt >= before - 1000` permanece. O cenário agora registra, por trigger de teste na **mesma transação do INSERT**, `transaction_timestamp() AT TIME ZONE 'UTC'`, `clock_timestamp() AT TIME ZONE 'UTC'` e `current_setting('TimeZone')`. Exige autor canônico, timezone UTC, igualdade exata entre `createdAt` e o início da transação e igualdade exata entre leitura bruta e DTO tipado. Os valores raw são decodificados explicitamente por `databaseTimestamp`; o generic de `execute<T>` não os converte. Se o limite ainda falhar, a mensagem inclui `before`, valor reportado, valor persistido e ambos os relógios, distinguindo drift de timezone de início transacional antigo sem ampliar tolerância.

ESLint direcionado e parse AST deste patch passaram; os **18 cenários clínicos** estão preservados. Nenhum banco foi aberto nesta frente. Reteste focal serial solicitado ao parent:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="report authorization precedes private data" tests/sst-clinical-services.test.ts
```

Depois do cenário focal, o parent pode confirmar a suíte clínica completa na fila central. O patch temporal ainda não representa aprovação runtime.

### Escopo e propriedade

- Entrega desta frente: serviços em `src/lib/sst/**`, actions/APIs SST `.ts`, schemas/repositórios SST existentes, helpers/testes exclusivos SST e `scripts/verify-sst-migration-history.ts`.
- A frente de diagnóstico TypeScript é responsável pelos `.tsx` de `src/app/app-domain/sst/**`, por `src/db/repositories/sst-pages/**`, `src/lib/contracts/sst-pages.ts` e eventual `src/db/schema/sst-pages.ts`. A migração das páginas deve ser conferida nessa entrega.
- Download, `src/db/repositories/platform/downloads` e testes correspondentes são do parent. Portal do Servidor, RH/payroll/workforce, writers e configuração compartilhados permanecem sob seus respectivos owners.

## Serviços migrados

- Agenda, ASO/exames/anamnese, prontuários/vacinas/atuações, questionários, acidentes/CAT/layout, restrições/cron/e-mail, programas/GHE, prevenção/CIPA.
- História funcional, responsabilidade técnica e ordens de serviço.
- Atestados, política de regimes, confirmação e revisões periciais, origem e postagem/reversão de afastamentos na folha.
- Planos/beneficiários, ledger e demonstrativos, mapeamentos e postagem/cancelamento de benefícios.
- Equipamentos, entregas/revisões/baixas, consultas/relatórios e consumo transacional de estoque.
- Relatórios analíticos, fechamento funcional/PPP, emissão protegida, reconhecimento técnico PPP, fontes/preparação/transmissão eSocial.
- `exposureMemberWhere` agora produz condição SQL Drizzle; há teste preparado com empregados reais, arrays vazios/nulos, inatividade e outra secretaria.
- A API de expiração de restrições utiliza a conexão Drizzle, preservando o claim de outbox, limites de tentativas e bloqueio de reenvio sem confirmação.

## Contratos externos / coordenação

- `bookAppointment`, `cancelAppointment`, `registerCertificate` usam a conexão Drizzle do contexto por padrão. `sstDatabase` resolve `context.database ?? db`; `sstContextConnection` recupera o pool Neon do banco recebido e rejeita um executor explícito incompatível com a abertura de transação.
- `buildOwnFinalPppSource` / `portalPppReport` leem `context.database`; titularidade continua derivada de `context.user.employeeId`, vínculo ativo e mapeamento histórico oficial UG/entidade, sem RBAC administrativo concedido pelo serviço.
- Os wrappers do Portal continuam responsáveis pelo escopo próprio de agenda e pelo escopo departamental de atestados. Assinaturas anteriores foram preservadas, com conexão opcional ao fim das mutações.
- `asoDocumentOwners(executor, url)` preserva `Promise<{ budgetUnitId: string }[]>`; download e seus testes pertencem ao parent e o handoff já foi confirmado.
- `enqueueHrIntegration`, estoque e `insertAuditEvent` recebem a transação Drizzle da operação SST. `ingestGedDocument` recebe a conexão e seu `afterCreate(tx, documentId)` vincula o anexo na mesma transação GED.
- Actions aguardadas mantêm `{ error }`; ações de formulário mantêm o contrato original.
- A busca global de consumidores de `protocolScope` já foi comunicada ao parent: não há chamadores da função legada. A remoção de seu tipo/import Prisma em `src/lib/protocols/access.ts` é uma pendência compartilhada; SST usa `protocolScopeCondition`.

## Persistência e fronteiras de tipos

- Os schemas são mapeamentos runtime das tabelas existentes. As constraints/triggers e funções históricas continuam sendo a autoridade física; nenhuma migração/DDL de produção foi criada nesta frente.
- Consultas recebem `DatabaseExecutor`/`DatabaseTransaction`; somente uma `DatabaseConnection` abre `withDatabaseTransaction`. Não há tradutor/emulador de delegates Prisma.
- `SstExposureGroup.departmentIds`/`roleIds` são nullable no físico; snapshots preservam `null` e consumidores tratam o conjunto vazio na leitura sem regravar registros.
- `BudgetUnit.secretariatId` é `NOT NULL`; timestamps de prevenção mantêm `TIMESTAMPTZ` sem precisão explícita.
- Benefícios usam `numeric(18,2)`, `exactNumeric` e `ExactDecimal` isolado. Valores/agregados financeiros SQL retornam texto e não passam por `Number`; contagens e medidas físicas continuam numéricas conforme seus contratos.
- `execute<T>()` não aplica decoder de coluna. `sstRows` mantém o retorno inferido do driver, e as leituras brutas que expõem datas usam DTO wire com strings e `sstTimestamp`/`databaseTimestamp` na fronteira. Foram revisados ASO/história funcional, relatórios, responsabilidades, equipamentos/eventos, CAT/layout/recibos, prevenção e eSocial.
- Conversões nullable são explícitas, incluindo `caValidUntil`, `nextReviewAt` e `revokedAt`. Datas civis retornadas como `DATE` permanecem à meia-noite UTC no DTO. Selects tipados Drizzle já decodificados e parsing legítimo de inputs/policies foram preservados.
- JSON mantém seu contrato: snapshots persistidos com datas ISO continuam JSON; o `content` do consolidado usa `to_jsonb` e permanece JSON para a página/PDF. `writeOffs.date` é projetado explicitamente em ISO UTC; `occurredAt` externo ao JSON é convertido em `Date`. SQL NULL e JSON `null` não são convertidos genericamente.
- Arrays vinculados usam `sql.param(array)`; listas SQL usam `sstParameters`, inclusive para o conjunto vazio.
- Locks consultivos, locks de linhas, idempotência, auditoria e rollback de postagem/lote/estoque permanecem na transação de origem.

## Testes preparados

Há 24 arquivos `tests/sst-*.test.ts`. As 19 suítes abaixo possuem cenários de serviço/consulta adaptados para o driver Neon/Drizzle real, sobre o transporte local de `tests/helpers/local-drizzle-database.ts`. **Esses cenários adaptados ainda não foram executados nesta frente.**

| Área | Arquivos em `tests/` | Cenários preparados |
| --- | --- | --- |
| Clínico, ASO e questionários | `sst-clinical-services.test.ts`, `sst-aso.test.ts`, `sst-aso-flow.test.ts`, `sst-questionnaires.test.ts` | Grants reais por disciplina, autoria, vigência civil/fusos, questionários, idempotência, revisões/correções e origem eSocial. |
| Atestados e relatórios | `sst-certificates.test.ts`, `sst-functional-certificates.test.ts`, `sst-functional-report.test.ts`, `sst-report.test.ts` | Restrições históricas, decisão/revisão, anexos/origem, paginação, denominador de ausência, ACL e exportação sem PHI na auditoria. |
| Origem/postagem de afastamento | `sst-functional-payroll-origin.test.ts`, `sst-functional-leave-posting.test.ts` | Regra/regime explícitos, união de minutos, cálculo exato, folha fechada, compensação, reconciliação e rollback. |
| Benefícios | `sst-benefits-service.test.ts`, `sst-benefits-posting.test.ts` | Ledger, Decimal, geração idempotente, titularidade Portal, escopo UG/entidade, postagem/lote e cancelamento sem duplicidade. |
| Equipamentos | `sst-equipment.test.ts` | Entrega coletiva atômica, falta parcial de estoque, inventário/lote bloqueado, revisão/baixa, relatórios e mapeamento PGR. |
| Prevenção/CIPA | `sst-prevention.test.ts` | Voto único, anonimato, rollback da cédula, candidatura da identidade autenticada, atas/presenças, rotinas e paginação autorizada. |
| Acidentes/CAT | `sst-accidents.test.ts`, `sst-accidents-layout.test.ts` | Evidências, habilitação, layout, recibo oficial, restrições/outbox e escopos de leitura. |
| Integrações/fechamento | `sst-integrations.test.ts`, `sst-integrations-closure.test.ts` | Proveniência/hash, separação de ambientes, falha fechada de transmissão, consolidado/PDF, grants por disciplina e PPP próprio. |
| GHE | `sst-exposure.test.ts` | Filtro Drizzle real por lotação/cargo e arrays nulos/vazios. |

`sst-agenda.test.ts`, `sst-benefits.test.ts`, `sst-programs.test.ts`, `sst-functional-history.test.ts` e `sst-integrations-state.test.ts` conservam testes de política/SQL histórico explícito. Eles não substituem a validação dos serviços integrados. Testes históricos com PGlite direto continuam válidos quando executam SQL real, sem cliente Prisma fabricado.

### Fixtures e revisão estática

- `sst-drizzle-context.ts` fornece usuário completo e `database` real. O accessor legado `prisma` apenas lança em caso de acesso; é não enumerável para permitir composição de contexto sem avaliá-lo.
- `sst-drizzle-fixture.ts` extrai tabelas nomeadas/índices do baseline e aplica migrações selecionadas. Reaplica também os ALTERs históricos específicos de `Person` e a coluna `Material.subcategoryId`, necessários às projeções atuais. Não usa DMMF.
- `sst-clinical-fixture.ts` e `sst-accident-fixture.ts` compartilham a cadeia histórica SST com checks, FKs e triggers reais. Seeds incluem grants, períodos oficiais e snapshot funcional necessário ao ASO.
- Foram conferidos selects completos versus colunas/defaults dos seeds de benefícios, equipamentos, origem de afastamento, relatórios e clínico. Corrigidos CNPJ obrigatório de `Company`, extensões de `Person`/`CostCenter` e snapshot histórico do vínculo.
- As factories de serviço encerram pool/transporte quando a preparação falha. O teardown remanescente de CIPA foi corrigido para usar `close()` da fixture.
- A busca nos testes não encontra imports Prisma, delegates, raw APIs Prisma ou casts de contexto. Os dois casts adversariais de `sst-integrations.test.ts` são payloads deliberadamente inválidos de transporte eSocial, não mocks de persistência.
- `scripts/verify-sst-migration-history.ts` usa Drizzle; `_prisma_migrations` e caminhos `prisma/migrations-ibema` são referências históricas intencionais.

## Validação executada nesta frente

- ESLint do lote completo SST passou: produção, repositórios, schemas, helpers, testes e script de histórico.
- Após os últimos ajustes, ESLint direcionado dos 11 arquivos de fixtures/testes alterados passou com exit code 0.
- O TS2322 de `src/db/repositories/sst/sql.ts` informado no diagnóstico central foi corrigido preservando a inferência de `execute<T>().rows`; a confirmação TypeScript do patch pertence ao próximo gate.
- Testes de serviço adaptados, PGlite, carga Neon, typecheck/tsc e build não foram executados nesta frente. Nenhum commit/push/deploy foi realizado.

## Validação pelo parent

Os comandos abaixo são o handoff, não resultados de execução. A bateria SST deve ser serial: o transporte local altera a configuração Neon global do processo e cada fixture precisa encerrar seus recursos antes da seguinte.

### Lint SST

```powershell
npx eslint src/lib/sst src/db/repositories/sst "src/db/schema/sst-*.ts" "tests/helpers/sst-*.ts" "tests/sst-*.test.ts" scripts/verify-sst-migration-history.ts
```

### Bateria isolada SST

```powershell
$sstTests = (Get-ChildItem tests -Filter 'sst-*.test.ts' | Sort-Object Name).FullName
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 @sstTests
```

Essa seleção cobre os 24 arquivos SST e inclui os testes SQL históricos. Os testes `drizzle-sst-pages*` e os contratos Portal/download devem entrar na seleção central de seus owners.

### Gate integrado e histórico

```powershell
npm run typecheck
npm run build
```

Conferência de checksums, somente na conexão autorizada pelo gate central (`DATABASE_URL`, carregada pelo script):

```powershell
node --conditions=react-server --import tsx scripts/verify-sst-migration-history.ts
```

O verificador é somente leitura; consulta migrações concluídas e compara os checksums históricos, aceitando variantes LF/CRLF dos mesmos comandos.

## Pendências para encerramento

1. Executar a bateria serial e corrigir eventuais falhas runtime de fixtures, constraints ou contratos; o ESLint não comprova esses cenários.
2. Confirmar os diagnósticos TypeScript/build centrais após o patch de `sstRows` e as alterações da frente de páginas.
3. Validar os wrappers Portal de agenda/atestados e emissão PPP, download protegido e a atomicidade com os writers compartilhados no gate integrado.
4. Parent concluir a remoção de `protocolScope` no arquivo compartilhado e consolidar o inventário global.
5. Registrar os resultados reais do gate antes de declarar a migração encerrada. A ausência de adaptador real A1/XMLDSig/XSD/mTLS e as pendências fiscais já modeladas pelo eSocial continuam representadas como bloqueios do contrato, sem aceite oficial fabricado.
