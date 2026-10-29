# Auditoria ampliada de persistência Prisma → Drizzle

Data: 28/10/2026. Auditoria local, somente leitura, com criação exclusiva deste documento. Não foram executados build, suíte de testes, npm, comandos Git, conexão remota ou escrita em banco. As contagens de dados abaixo pertencem ao snapshot existente, não a uma consulta nova de produção.

## Resultado executivo

- O gate executado nesta revisão passou: **3.791 fontes, zero arquivos/acessos legados, zero dependências/scripts/pacotes de lock Prisma**. O número anterior informado pela central era 3.790; a árvore está recebendo trabalho concorrente. Este resultado é pontual, não um congelamento da árvore.
- Importação real dos objetos de `src/db/schema` por `node --import tsx`, com `getTableConfig`, confirmou **924 nomes físicos, 1.193 declarações, 12.145 colunas declaradas e 367 FKs declaradas**. Declarações são projeções: esses números não representam 1.193 tabelas distintas nem todas as colunas/FKs físicas.
- A diferença para **1.006 tabelas físicas** está inteiramente reconciliada: **997 tabelas públicas + 9 tabelas `neon_auth`**. O fixture tem **998 relações públicas**, porque inclui **a view `HrPortalReferenceDiagnostics`**. Portanto: **997 − 924 = 73 tabelas públicas sem `pgTable`**, mais uma view sem `pgTable`. Nenhum dos 924 nomes Drizzle está fora do fixture.
- Dessas 74 relações sem `pgTable`, **51 nomes têm referência exata em `src`** (incluindo o ledger SQL histórico). Existem consumidores SQL Drizzle reais; ausência de `pgTable` não significa dependência Prisma. As outras **23 relações** incluem a view, a junção `_SchoolToSchoolBus` e tabelas sem consumidor nominal de runtime localizado. Algumas dessas tabelas contêm dados e são usadas por ferramentas SQL.
- Não foi encontrado Prisma ativo na aplicação, nem DMMF/`_runtimeDataModel`, ORM alternativo de persistência ou proxy de delegates Prisma em `src`. Foi encontrado **um oráculo temporário não rastreado em `.agent` com imports Prisma reais**, detalhado adiante. Não integra aplicação/CI, mas impede dizer que não existe código executável Prisma em nenhum arquivo local.
- **Não é correto concluir “todas as tabelas estão tipadas em Drizzle”, “todos os fluxos foram testados” ou “o checker prova completude”.** A saída do checker é explicitamente uma comparação offline das colunas declaradas; tabelas acessadas apenas por SQL ficam fora dessa verificação.

## Evidências e método reproduzível

1. Executado `node scripts/verify-database-migration.mjs`: `PASS`, `COMPLETION_GATE`, `sources: 3791`, `filesWithLegacyAccess: 0`, `occurrences: 0`, `dependencies: []`, `scripts: []`, `lockPackages: []`, `findings: []`.
2. Executado Node read-only sobre todos os arquivos de `src/db/schema`: importação TSX, filtragem de objetos Drizzle `Table`, inspeção `getTableConfig`. Resultado: `declarations: 1193`, `tables: 924`, `columns: 12145`, `foreignKeys: 367`. Não importou o cliente nem criou pool.
3. Comparação exaustiva de conjuntos nominais entre todas as declarações `pgTable` e todas as entradas `catalog.columns` do fixture. Resultado: 74 relações ausentes, zero nomes excedentes. A contagem lexical foi cruzada com os objetos importados acima.
4. Leitura do snapshot local `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/{catalog,manifest}.json`: `manifest.counts` distingue tabelas de dados; `catalog.tables.kind` distingue `r`, `v` e `S`. Não foi necessário ler os arquivos de linhas nem expor credenciais.
5. Busca de todos os nomes ausentes em `src` e `scripts`, refinada por limites de identificador para não confundir `SstEquipment` com `SstEquipmentDelivery`, por exemplo. As linhas citadas são evidência de consumidores, não promessa de execução homologada.
6. Varredura AST adicional de `import(...)`/`require(...)` não literais nas árvores de fontes do gate: somente `scripts/drizzle-verify-schema.ts:23` (arquivos fixados na pasta de schemas) e `scripts/verify-planning-postgres.mjs:13` (módulo PostgreSQL embarcado informado explicitamente por ambiente para teste local). Nenhum desses resolve Prisma implicitamente. O conteúdo de um módulo externo informado por ambiente não é certificável por esta auditoria.
7. Inventário de caminhos rastreados pela leitura binária read-only do índice local, sem comando Git: índice v2, 4.352 entradas; único arquivo executável/configuracional rastreado em pasta oculta encontrado: `.github/workflows/ci.yml`. `.agent/oracle-integration-null.mjs` não consta no índice. `.git/hooks` contém somente arquivos `*.sample`.

O fixture declara `sourceSha256: bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d` e `catalogSha256: 1b6ca54c94a3aa6638ad61324483b32773ceb45efbd90020a49e6dce9b5497cb`. Esses são os valores do arquivo examinado; não são um recálculo de integridade do banco atual.

## Reconciliação exata de catálogo

| Universo | Quantidade | Origem/explicação |
| --- | ---: | --- |
| Tabelas de dados em todos os schemas | 1.006 | `manifest.counts` do snapshot |
| Tabelas de dados públicas | 997 | Exclui nove tabelas `neon_auth` |
| Relações públicas representadas no fixture | 998 | 997 tabelas + uma view |
| Tabelas públicas com `pgTable` | 924 | Objetos Drizzle importados |
| Tabelas públicas sem `pgTable` | 73 | Diferença nominal completa abaixo |
| View pública sem `pgTable` | 1 | `HrPortalReferenceDiagnostics`, `kind: v` |
| Objetos do catálogo completo em `catalog.tables` | 1.008 | 1.006 tabelas + view + sequência |

As nove tabelas externas são `neon_auth.account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`. No snapshot, apenas `project_config` tem uma linha; as demais têm zero. Não foram localizados imports/SQL da aplicação para esse schema. São objetos instalados do serviço de autenticação Neon, não tabelas de domínio esquecidas pelo conjunto de 924. A sequência é `public.Invoice_invoiceNumber_seq`.

Diferença de conjuntos observada entre `manifest.counts` e fixture: somente essas nove tabelas aparecem no primeiro e não no segundo; somente `public.HrPortalReferenceDiagnostics` aparece no segundo e não no primeiro. Isso explica exatamente **1.006 − 9 + 1 = 998**, sem supor oito tabelas perdidas.

### Inventário completo das 74 relações sem `pgTable`

Convenções: caminhos de runtime são relativos a `src/`; caminhos de ferramentas a `scripts/`. “Catálogo transversal” refere-se à allowlist `scripts/lib/cross-domain-application-tables.ts`: a simples presença nela não prova um fluxo de negócio ativo. Linhas são do estado lido nesta revisão.

| Relação | Consumidor localizado / classificação |
| --- | --- |
| `CamDocumentoLegislativo` | Catálogo transversal:95; nenhum nome exato em runtime localizado |
| `CamParecer` | Catálogo transversal:94; nenhum nome exato em runtime localizado |
| `CamPauta` | `municipal-system-dataset.ts:207`, `lib/municipal-dataset-insert.ts:14`; ferramenta SQL; 4 linhas no snapshot |
| `CamPresencaSessao` | Catálogo transversal:94; nenhum nome exato em runtime localizado |
| `CamVotacao` | Catálogo transversal:94; nenhum nome exato em runtime localizado |
| `CamVoto` | Catálogo transversal:95; nenhum nome exato em runtime localizado |
| `ControlledMedicineBook` | `app/app-domain/saude/farmacia/actions.ts:137–138`; INSERT/UPDATE por `database.execute(sql)` |
| `CulturaConselhoDocumento` | `db/repositories/culture/queries.ts:71,78–79`; SQL Drizzle, vínculo documental com atributos |
| `CulturaEventoDocumento` | Mesmo arquivo:42,68; SQL Drizzle, vínculo documental com atributos |
| `CulturaProjetoDocumento` | Mesmo arquivo:34,69; SQL Drizzle, vínculo documental com atributos |
| `CulturaReservaDocumento` | Mesmo arquivo:54,70; SQL Drizzle, vínculo documental com atributos |
| `DebtInstallmentSchedule` | `lib/tributacao/index.ts:465`; SQL explícito |
| `FleetOperation` | Catálogo transversal:52; nenhum nome exato em runtime localizado |
| `HealthLabExamMaterial` | `app/app-domain/saude/laboratorio/actions.ts:25`; INSERT SQL no mesmo `tx` do modelo de exame |
| `HealthLabQuestionGroup` | Catálogo transversal:76; nenhum nome exato em runtime localizado |
| `HealthLabQuestionItem` | Catálogo transversal:76; nenhum nome exato em runtime localizado |
| `HealthLabQuestionnaire` | Catálogo transversal:76; nenhum nome exato em runtime localizado |
| `HrBudgetUnitEntityMapping` | `db/repositories/sst-pages/functional-options.ts:27`; também `lib/sst/functional-service.ts:33`, `report-service.ts:59,75,80` e serviços funcionais |
| `HrPortalReferenceDiagnostics` | **View**, não tabela; sem nome exato em `src`/`scripts` localizado |
| `HrVacationConcessionSource` | `lib/sst/aso-flow-service.ts:42,70`; SQL explícito |
| `InformationRequest` | `municipal-system-dataset.ts:208`, `lib/municipal-dataset-insert.ts:14`; ferramenta SQL; 4 linhas no snapshot |
| `LegalTextRelation` | Catálogo transversal:13, `verify-master-data.mjs:18`; inspeção SQL de ferramenta |
| `MedicineBatch` | `lib/cross-domain-database.ts:58`, `seed-municipal-demo.ts:102,173`; escrita SQL de seed; **88 linhas** no snapshot |
| `MedicineDosageTemplate` | `app/app-domain/saude/farmacia/actions.ts:108`; INSERT/ON CONFLICT SQL Drizzle |
| `MedicineInteraction` | Mesmo arquivo:101; INSERT/ON CONFLICT SQL; leitura na página `farmacia/page.tsx:49` |
| `OfficialPublication` | Catálogo transversal:20; nenhum nome exato em runtime localizado |
| `PortalMenu` | `municipal-system-dataset.ts:171`, `lib/municipal-dataset-insert.ts:13`; ferramenta SQL; 4 linhas no snapshot |
| `PreliminaryTechnicalStudy` | `db/repositories/procurement/purchase-processes.ts:44`; subconsulta SQL de contagem; dataset:144; 10 linhas no snapshot |
| `SatisfactionSurvey` | Catálogo transversal:19; nenhum nome exato em runtime localizado |
| `SchoolBus` | Catálogo transversal:61; nenhum nome exato em runtime localizado |
| `SocialProgramParticipation` | `municipal-system-dataset.ts:194`, `lib/municipal-dataset-insert.ts:14`; ferramenta SQL; 10 linhas no snapshot |
| `SocialRecord` | Mesmo dataset:192, mesmo helper:14; ferramenta SQL; 10 linhas no snapshot |
| `SstAsoCorrection` | `lib/sst/aso-flow-service.ts:55,86,96,99`; `db/repositories/sst-pages/aso.ts:43`; SQL |
| `SstAsoDocument` | `lib/sst/aso-flow-document.ts:28,34,67,74`, `aso-flow-access.ts:7`; SQL |
| `SstAsoFlowSettings` | `lib/sst/aso-flow-service.ts:26,54`, `db/repositories/sst-pages/aso.ts:37`; SQL |
| `SstAsoFlowSource` | `lib/sst/aso-service.ts:76`; SQL |
| `SstBenefitCancellation` | `lib/sst/benefit-posting.ts:129,146`; SQL |
| `SstBenefitPayrollMapping` | Mesmo arquivo:108,116; SQL |
| `SstCatLayoutMedical` | `lib/sst/accident-layout-service.ts:25,74`; SQL |
| `SstCatLayoutVersion` | Mesmo arquivo:22,55,57,73; SQL |
| `SstCatLedger` | `lib/sst/accident-service.ts:140,143,146,152`; SQL |
| `SstCertificateDecisionRevision` | `lib/sst/functional-certificate-service.ts:125,152`, `db/repositories/sst-pages/certificates.ts:28`; SQL |
| `SstCertificateFunctionalSource` | `lib/sst/certificate-service.ts:75`, `functional-certificate-list.ts:18,20,21`, `functional-certificate-service.ts:76`; SQL |
| `SstCertificateLeaveConfirmation` | `lib/sst/certificate-service.ts:126`, `functional-certificate-service.ts:63,68`, `db/repositories/sst-pages/certificates.ts:29`; SQL |
| `SstClosureEmission` | `lib/sst/closure-document.ts:58`; SQL |
| `SstElectionBallot` | `lib/sst/prevention-service.ts:244,255`; SQL |
| `SstElectionCandidate` | Mesmo arquivo:227,239,255,265; SQL |
| `SstElectionElector` | Mesmo arquivo:134,212,252,260,262; SQL |
| `SstElectionTurnout` | Mesmo arquivo:242,252,266; SQL |
| `SstEquipment` | `lib/sst/equipment-service.ts:45,50,68`; `db/repositories/sst-pages/equipment.ts:27,34`; SQL |
| `SstEquipmentDelivery` | `lib/sst/equipment-service.ts:66,91`; `equipment-queries.ts:30,37`; SQL |
| `SstEquipmentDeliveryItem` | `lib/sst/equipment-service.ts:96,107,113,120,121`; `equipment-queries.ts:30,40`; SQL |
| `SstEquipmentEvent` | `lib/sst/equipment-service.ts:105,116,122`; `equipment-queries.ts:41,61,62,64`; SQL |
| `SstEquipmentPolicy` | `lib/sst/equipment-service.ts:57,72`; `db/repositories/sst-pages/equipment.ts:17`; SQL |
| `SstEquipmentRequirement` | `lib/sst/equipment-service.ts:140,141`; `equipment-queries.ts:80`; SQL |
| `SstEsocialAttempt` | `lib/sst/esocial-service.ts:120`; SQL |
| `SstEsocialConfiguration` | Mesmo arquivo:38,44,62,103; SQL |
| `SstEsocialEvent` | Mesmo arquivo:57,64,68,75,88,91; também `accident-layout-service.ts:89`; SQL |
| `SstEsocialEvidence` | Mesmo arquivo:79,109,128,132; também `accident-layout-service.ts:86,89`; SQL |
| `SstFoundationalRevocation` | `lib/sst/service-order-service.ts:40,66,93,97,110,116`; `db/repositories/sst/functional.ts:21`; SQL |
| `SstLeavePayrollRuleVersion` | Catálogo transversal:127; nenhum nome exato em runtime localizado |
| `SstLeavePayrollScopeEvidence` | `lib/sst/functional-leave-posting.ts:44`; SQL |
| `SstPreventionRevision` | `lib/sst/prevention-service.ts:52,132,143,182,205`; SQL |
| `SstReasonRegimePolicy` | `lib/sst/functional-certificate-service.ts:26,47`; `db/repositories/sst-pages/administration.ts:45`; SQL |
| `SstRestrictionEmailOutbox` | `lib/sst/restriction-cron-service.ts:27–42`, `restriction-service.ts:53,72,103–114`; SQL |
| `SstRoleAttribute` | `lib/sst/restriction-service.ts:31,47`; `db/repositories/sst-pages/clinical-options.ts:54`; SQL |
| `SstServiceOrder` | `lib/sst/service-order-service.ts:56,78,86,93,108,110,116`; SQL |
| `SstTechnicalResponsibility` | Mesmo arquivo:32,40,42,66,86; `db/repositories/sst/functional.ts:21`; SQL |
| `TaxCaseLink` | `db/repositories/taxation-pages/cadastral-details.ts:43`, `economic-processes.ts:10`; `lib/tributacao/index.ts:486,489`; SQL |
| `TaxCollectionProfile` | `db/repositories/taxation-pages/collection.ts:30`; SQL |
| `TaxCollectionRule` | Catálogo transversal:123; nenhum nome exato em runtime localizado |
| `TermOfReference` | `db/repositories/procurement/purchase-processes.ts:45`; subconsulta SQL; dataset:145; 10 linhas no snapshot |
| `_SchoolToSchoolBus` | Junção física **pura**, colunas `A`, `B`; zero linhas no snapshot; sem consumidor nominal `src`/`scripts` localizado |
| `_prisma_migrations` | Ledger histórico de 156 linhas no snapshot; `scripts/database-migrate-core.mjs`, verificadores e wrapper `db/repositories/tax-final-helpers/migration-inspection.ts:28`; SQL explícito de autoridade/inspeção, **não CLI Prisma** |

Não tratar todos os vínculos como “junção pura”: os vínculos documentais culturais, por exemplo, carregam `id`, finalidade e data usados por suas consultas. A única junção pura adicional identificada nesse conjunto nominal é `_SchoolToSchoolBus`.

As 22 tabelas sem nome exato em runtime não estão automaticamente “abandonadas”: os datasets/inspectores acima as alcançam por allowlist e identificador SQL. Mesmo tabelas com zero linhas podem ser parte de contrato instalado. A classificação segura é **sem consumidor nominal de runtime localizado**, preservando schema/dados. `MedicineBatch` e os datasets populados merecem decisão explícita de cobertura, não remoção.

## Caminho real de persistência e amostra de todos os domínios

Base comum confirmada por leitura: `src/db/client.ts:16–19` resolve `DATABASE_URL`; `src/db/connection.ts:14–25` cria `Pool` Neon e `drizzle({ client: pool })`. O `Proxy` em `client.ts:26–31` é inicialização preguiçosa que devolve métodos vinculados ao **cliente Drizzle real**, não emulação de delegates/modelos Prisma. `DatabaseExecutor` em `transaction.ts:9` expõe métodos SQL Drizzle. `AppContext.database` em `tenant-context.ts:19–22` é tipado como `Database`.

Para transações, `transaction.ts:34–52` adquire um cliente do pool, constrói Drizzle sobre esse mesmo cliente e abre a transação; a callback recebe `tx`. `lib/sst/database.ts:7–13` e `db/repositories/tax-actions/context.ts:7–11` preservam a conexão fornecida pelo contexto e rejeitam contextos incompatíveis, em vez de oferecer provider fake alternativo.

Amostra estática por domínio (não são execuções de UI/negócio). Entradas abaixo são relativas a `src/app/app-domain/`; destinos são relativos a `src/`. Onde há tabela diretamente na página/action, isso é uso Drizzle válido, sem exigir repositório intermediário. `db/client` termina sempre em `db/connection` descrito acima.

| Domínio / entrada amostrada | Persistência localizada |
| --- | --- |
| Administração — `administracao/actions.ts` | `db/client` + `db/repositories/administration/leadership.ts` |
| Atendimento — `atendimento/actions.ts` | `db/client` + `db/repositories/platform/sequences.ts` |
| Auditoria — `auditoria/page.tsx` | `db/client` + `db/repositories/platform/audit-queries.ts` |
| Cadastros — `cadastros/actions.ts` | `db/client` + `db/repositories/platform/audit.ts` |
| Câmara — `camara/page.tsx` | `db/client` + `db/repositories/chamber/queries.ts`; actions também usam `db/schema/chamber` |
| Cemitérios — `cemiterios/actions.ts` | `db/client.databaseConnection` → `lib/tributacao/s9-service.ts` |
| Compras — `compras/catalogo/actions.ts` | `db/client.databaseConnection` + `db/transaction` + `db/schema/master-data`/`assets-stock` |
| Configurações — `configuracoes/page.tsx` | `db/client` + `db/repositories/platform/instance-configuration.ts` |
| Controle interno — `controle-interno/actions.ts` | `db/client` → `lib/c7/operations-service.ts` → `db/repositories/platform/audit.ts` |
| Cultura — `cultura/actions.ts` | `db/client` + `db/repositories/culture/reservations.ts` |
| Dashboard — `dashboard/page.tsx` | `db/client` + `db/repositories/platform/identity.ts` |
| Documentos — `documentos/assinaturas/page.tsx` | `db/client` + `db/repositories/documents/queries.ts` |
| Educação — `educacao/academico/page.tsx` | `db/client` + `db/repositories/education/core.ts` |
| Financeiro — `financeiro/automacoes/page.tsx` | `db/client` + `db/repositories/finance-pages/banking.ts` |
| Frotas — `frotas/page.tsx` | `lib/frotas/queries.ts`, `service.ts`; `db/repositories/fleet/records.ts` e `page-data.ts`; contexto alcança `db/client` |
| Iluminação — `iluminacao-publica/iluminacao-energia/page.tsx` | `db/client` + `db/repositories/infrastructure/services.ts` |
| Indicadores — `indicadores/page.tsx` | `db/client` + `db/repositories/administration/indicators.ts` |
| Meio ambiente — `meio-ambiente/actions.ts` | `db/client` + `db/repositories/environment/operations.ts` |
| Notificações — `notificacoes/actions.ts` | `db/client` → `lib/notifications/internal-notifications.ts` → `db/repositories/platform/notifications.ts` |
| Obras — `obras/page.tsx` | `db/client` + `db/repositories/works-pages/infrastructure.ts`; actions também usam tabelas `infrastructure` |
| Patrimônio — `patrimonio/almoxarifados/actions.ts` | `db/client` + `db/schema/assets-stock`, `administration`, `master-data` |
| Planejamento — `planejamento/actions.ts` | `lib/planejamento/service.ts` → `db/repositories/planning/instruments.ts`; contexto → `db/client` |
| Portal cidadão — `portal-cidadao/page.tsx` | `db/client` + `db/schema/portal-content`/`portal-services` |
| Portal paciente — `portal-paciente/actions.ts` | `lib/portal-paciente/access.ts` → `db/client` + `db/repositories/health/patient-portal.ts` |
| Portal servidor — `portal-servidor/aniversariantes/page.tsx` | `lib/portal-servidor/access.ts` → `db/client` + `db/repositories/portal-servidor/identity.ts` |
| Processos — `processos/page.tsx` | Redireciona a `/protocolos`; nenhuma persistência própria nessa entrada |
| Protocolos — `protocolos/acompanhamento/page.tsx` | `db/client` + `db/repositories/processes/listing.ts` |
| RH — `rh/adiantamentos/page.tsx` | `db/client` + `db/repositories/personnel-pages/requests.ts` |
| Saneamento — `saneamento/actions.ts` | `db/client` + `db/repositories/sanitation/operations.ts` |
| Saúde — `saude/acolhimento/page.tsx` | `db/client` + `db/schema/health-agenda`, `health-registration`, `health-workforce`, `people` |
| Segurança — `seguranca/actions.ts` | `db/client` + `db/repositories/security-mobility/commands.ts` |
| Social — `social/actions.ts` | `db/client` + `db/repositories/social/operations.ts` |
| SST — `sst/acidentes/page.tsx` | `lib/sst/database.ts` → `db/client`; `db/repositories/sst/scope.ts`, `sst-pages/accidents.ts` e `lib/sst/accident-service.ts` |
| Suporte técnico — `suporte-tecnico/page.tsx:57–58` | Apenas contexto/autorização → identidade Drizzle; página informa fluxos ainda dependentes da configuração do contrato (:78–79), não um CRUD homologado |
| Transparência — `transparencia/acessos/page.tsx` | `db/client` + `db/schema/transparency` |
| Tributação — `tributacao/alvaras/actions.ts` | `db/repositories/tax-actions/context.ts` → contexto e `db/client`; amostra somente lida, sem tocar nas rotas em edição |

O agrupamento `(auth)` não oferece amostra `page/actions` equivalente no inventário de imports; a autenticação comum é carregada por `tenant-context.ts:2` via `lib/platform/session`. A auditoria de persistência não equipara Firebase Auth a um banco de negócio alternativo.

## SQL direto, ferramentas, providers e deploy

- **SQL Drizzle legítimo:** `culture/queries.ts:65–79` executa projeções SQL/UNION fixas; `procurement/purchase-processes.ts:41–46` usa subconsultas SQL com tabelas Drizzle; farmácia usa parâmetros do template `sql`; `sst/sql.ts:7–8` apenas encaminha uma instância `SQL` para `database.execute`. Esses usos não são recriação de um ORM Prisma.
- **Transação híbrida real:** `lib/sst/equipment-service.ts:39–58` combina SQL explícito de `SstEquipment`, tabela Drizzle de material, locks e auditoria no mesmo `tx`; não há modelo fake intermediário. `sst-pages/equipment.ts:26–34` decodifica datas retornadas por SQL. Isso demonstra um caminho implementado, não sua homologação funcional completa.
- **Ferramenta genérica delimitada:** `scripts/lib/cross-domain-database.ts:32–50` lê metadados PostgreSQL físicos limitados pela allowlist; `:55–59` restringe tabelas graváveis; `:62–92` valida colunas e usa `sql.identifier`/parâmetros. É inserção SQL deliberada, não DMMF nem delegates `findMany/create/update`. `scripts/lib/municipal-dataset-insert.ts` é outro consumidor SQL para o dataset indicado no inventário.
- **Providers externos simulados existem**, em `lib/integrations/runtime.ts:40–46` e `registry.ts`: dizem respeito a conectores de integração. A persistência da execução é feita pelos repositórios Drizzle `platform/integrations` (`runtime.ts:4,78,92,100`), inclusive quando o conector externo é MOCK. Não são um provider fake de banco.
- **Bancos alternativos:** a busca de imports e conectores em `src` não localizou SQLite, MongoDB/Mongoose, TypeORM, Sequelize, Knex, Supabase ou Firestore como persistência de domínio. `scripts/lib/cross-domain-local-database.ts` usa PGlite local via bridge loopback e a mesma `createDatabaseConnection` Drizzle para ferramentas isoladas. Isso não constitui fallback de produção.
- **SQL de migração fora do ORM:** `scripts/database-migrate-driver.mjs` usa `neon.Client` diretamente para uma conexão física de DDL/recibos; o ramo opcional `DATABASE_MIGRATION_DRIVER=pg` faz `import("pg")`. `pg` não está em `package.json`; o próprio comentário exige dependência direta antes do uso. Esse ramo é acionável se alguém configurar `pg`, mas o default/deploy é Neon e não depende Prisma. Não foi executado.
- **CI:** `.github/workflows/ci.yml:34–39` executa verificação SQL, gate, typecheck auxiliar, testes e build; nenhuma etapa Prisma. Os passos foram apenas lidos.
- **Build/deploy:** `scripts/build.mjs:48–56` executa gate, `verify-files` e, somente no build de produção Vercel, `database-migrate.mjs deploy` com URL explícita selecionada pelo build; segue typegen/typecheck/build Next. Nenhum `prisma generate/migrate/db`. `package.json` não define `postinstall` ou `prepare` Prisma. `vercel.json` configura seis crons de aplicação, não hook Prisma.
- **Limite do gate:** `verify-database-migration.mjs:13–23` ignora pastas ocultas e `generated`; o AST cobre imports literais e delegates, não promete resolver qualquer programa dinâmico arbitrário. A inspeção complementar acima cobriu os caminhos não literais encontrados e o índice de arquivos ocultos rastreados, sem mudar o gate.
- **Resíduo local real:** `.agent/oracle-integration-null.mjs:10–13` faz `require("@prisma/client")`, `require("@prisma/adapter-neon")` e `new PrismaClient`; `:20–28` usa sentinelas/delegate/`$disconnect`. É oráculo temporário não rastreado, fora do gate, aplicação e CI. Com dependências removidas, sua execução manual depende de pacotes ausentes ou remanescentes locais. Não foi executado nem apagado. Outro arquivo temporário com nome legado não é prova de acesso executável por seu nome.

Comentários sobre semântica histórica Prisma, arquivos SQL em `prisma/migrations-ibema`, referências ao ledger `_prisma_migrations`, e strings de detectores de auditoria **não foram contabilizados como dependência de CLI/runtime Prisma**.

## Pendências acionáveis, sem extrapolar a evidência

1. **Cobertura física tipada não é completa.** A central deve registrar as 73 tabelas públicas sem `pgTable`, distinguir os acessos SQL intencionais e, onde a exigência de cobertura tipada o requerer, acrescentar mapeamentos/repositórios explícitos. Prioridade concreta: tabelas operacionais SST, farmácia e laboratório com INSERT/UPDATE já ativos. O checker atual não verifica colunas dentro desses templates SQL; seu PASS não cobre essas tabelas.
2. **Formalizar destino dos 22 nomes de tabelas sem consumidor nominal de runtime**, especialmente `MedicineBatch` (88 linhas) e tabelas de dataset populadas. Verificar contratos/rotas esperados antes de chamar isso de legado. `SchoolBus`/`_SchoolToSchoolBus`, questionários de laboratório, plenário/câmara e `TaxCollectionRule` são exemplos precisos para essa confirmação. Ausência nominal não prova desuso por SQL dinâmico/funções/triggers do banco.
3. **Oráculo oculto Prisma fora do produto:** decidir sua retirada/arquivamento como evidência textual na limpeza central, preservando trabalho temporário do usuário. Até essa decisão, reportar “zero dependências ativas de aplicação/CI”, não “zero arquivos executáveis Prisma no workspace”.
4. **Ramo opcional TCP `pg`:** se for suportado operacionalmente, declarar/validar dependência direta; se não, documentar a opção como indisponível nesta instalação. Não atribuir essa ausência ao Prisma nem tratá-la como falha do caminho Neon padrão.
5. **Manter a distinção de universos nos relatórios:** 1.006 tabelas totais, 997 tabelas públicas, 998 relações públicas, 924 tabelas mapeadas, 1.193 declarações. O fixture não fornece discriminador de tipo de relação; para chamar 998 de “tabelas”, é necessário consultar o catálogo completo, que mostra a view. Não enfraquecer o gate para acomodar diferenças nominais.

Esta auditoria estabelece inventário e caminhos estáticos de persistência. A compilação e as verificações funcionais finais pertencem à integração central; nenhum fluxo foi declarado testado por esta revisão.
