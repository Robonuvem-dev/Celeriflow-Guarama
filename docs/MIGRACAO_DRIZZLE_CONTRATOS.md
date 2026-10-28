# Migração Drizzle — contratos e handoffs

## Decisão explícita do proprietário — baseline SQL auditada

Em 28/10, após informar que não possui a cópia original de `20261011010000_add_sst_clinical_services`, o proprietário autorizou a criação de uma **nova baseline do estado atual auditado**, conservando os 156 SQLs e o ledger instalado intactos. Não é prova retrospectiva dos bytes clínicos nem autorização para resolver diferenças arbitrárias. A divergência deve continuar explicitamente registrada, com hashes instalado/normalizado, fonte, catálogo revisado e recibo de reconciliação. A inicialização é uma operação explícita separada do build/deploy; o deploy exige autoridade inicializada, ledger anterior íntegro e checksums exatos de todos os SQLs futuros. A adoção por proveniência exata mantém seus bloqueios originais.

## Regras de integração

- Consultar todos os consumidores antes de alterar função exportada.
- Actions aguardadas pela UI preservam objetos de sucesso/erro; actions de formulário preservam `Promise<void>`.
- Repositórios retornam DTOs explícitos, sem tipos ORM na UI.
- Cada transação intermodular migra inteira, em uma conexão; não combinar uma transação Prisma com outra Drizzle.
- IDs existentes, nomes físicos e tipos SQL permanecem os mesmos.
- As APIs de decimal, geração de IDs, JSON nulo e atualização de timestamps terão testes de compatibilidade antes de seu uso pelos módulos.

## Handoffs de páginas

Base visual analisada: `4476c3e`. Conferência posterior de `origin/main` em `3f05dcd` alterava somente documentação. O JSX das oito páginas abaixo foi comparado por AST com a base e permaneceu idêntico (desconsiderados CRLF/LF).

| Página em `src/app/app-domain/saneamento/` | Consulta extraída em `src/db/repositories/sanitation/queries.ts` | Contrato |
|---|---|---|
| `page.tsx` | `getSanitationTotals` | Três totais numéricos originais |
| `unidades/page.tsx` | `listConsumerUnits` | Mesmas nove propriedades; filtros e paginação de 20 |
| `leituras/page.tsx` | `listMeterReadings` | Registro completo e `unit.code`; competência atual definida na página |
| `faturas/page.tsx` | `listInvoices` | Mesmas sete propriedades; `dueDate` serializado na página |
| `servicos/page.tsx` | `listServiceOrders` | Registro completo e unidade opcional |
| `qualidade/page.tsx` | `listWaterQualityAnalyses` | Mesmas oito propriedades; data serializada na página |
| `portal/page.tsx` | `listPortalRequests` | Mesmas sete propriedades; data serializada na página |
| `relatorios/page.tsx` | `listSavedReports` | Mesmas seis propriedades |

Os DTOs estão em `src/lib/contracts/sanitation.ts`. As alterações nas páginas se limitam a imports e consultas; os componentes client continuam consumindo os mesmos formatos.

### Administração, Meio Ambiente e núcleo de Cadastros

Conferência ampliada com `scripts/drizzle-verify-handoffs.mjs`: **55 arquivos TSX alterados** com raízes JSX textualmente iguais a `3f05dcd` por AST (somente CRLF/LF normalizados), incluindo a página genérica de catálogos, páginas intermodulares, mesclagem, auditoria, notificações, configurações e formulário da instituição.

- Onze páginas de Administração: instituição, secretarias, departamentos, cargos, servidores, unidades, calendário e formulários de seleção usam `repositories/administration/queries.ts`. Criações/edições e auditoria permanecem na mesma transação Drizzle. DTOs em `contracts/administration.ts`.
- Dez páginas de Meio Ambiente: painel e nove listagens usam `repositories/environment/queries.ts`. Paginação/busca local, filtros, estados, revalidações e retornos das actions foram preservados. `generateEnvironmentalLicense` recebe `DatabaseExecutor`; seu consumidor de produção e testes foram conferidos. DTO da listagem de emissões mantém todas as propriedades do registro anterior.
- Oito páginas de Cadastros: PF, PJ, fornecedores e novo fornecedor, documentos e novo documento, imóveis e novo imóvel usam `repositories/registry`. Retornos completos, relações opcionais, datas e nulos comparados ao legado.
- `getSupplierList` e `getSupplierReportRows` recebem `DatabaseExecutor`; página e endpoint CSV adaptados. `buildSupplierWhere` retorna SQL parametrizado e seu único consumidor direto adicional, o teste de suporte, foi adaptado. Projeções e serialização para a UI/CSV permanecem iguais; evidências de documentos são carregadas em lote, sem N+1.
- Actions de criação de PF/PJ/fornecedor e actions internas de formulário continuam `Promise<void>`; actions de edição de fornecedor mantêm `{ error?: string }`. Demais actions de Cadastros mantêm o retorno do registro.
- O histórico imobiliário de Cadastros define `celeriflow.cadastral_actor` na mesma conexão/transação da gravação; os triggers continuam responsáveis por versões e proteção. Helpers Prisma de Tributação permanecem temporariamente para seus consumidores ainda não migrados.
- `master-data-page.tsx` usa `loadMasterDataPage` para os 14 catálogos: paginação de 20, DTO de linhas, colunas, campos, opções e ordenações conferidos com o trecho original por AST. Dashboard, organograma e qualidade usam `registry/overview.ts`; seus DTOs completos também foram comparados.
- `master-data-actions.ts` mantém `{ error?: string }`, autorização/revalidação e auditoria atômica, incluindo famílias, moeda padrão e versões jurídicas. A reconciliação preserva `reconcileCanonicalIdentity(context, raw)` e o retorno `{ error?: string }` de sua action; locks, idempotência, validação e log financeiro usam uma conexão Drizzle.
- `listConstructionPropertyUpdates` recebe `DatabaseExecutor`. Os dois consumidores de produção (Cadastros/imóveis e Obras/vistorias) e o teste PostgreSQL foram adaptados; filtros puros são reexportados do caminho anterior. DTO explícito mantém registro completo e conclusão `{ number, kind }`; escopo é aplicado antes da contagem/paginação. `resolveConstructionAccess(context)` mantém assinatura e passa a consultar papéis vigentes via Drizzle.

## Plataforma e serviços

- `AppContext.user` mantém a estrutura original por meio de `PermissionUser`, em `src/lib/contracts/identity.ts`.
- `AppContext.prisma` permanece temporariamente para consumidores não migrados; o campo opcional `database` permite usar Drizzle sem invalidar fixtures/contextos existentes. Contextos reais fornecem ambos durante a coexistência.
- Funções de autorização exportadas e `AccessError` mantêm nomes e assinaturas. `AccessError` foi extraída para arquivo independente e reexportada no caminho anterior.
- Resolução de identidade e ativação de módulos usam os repositórios Drizzle; reparação técnica do administrador conserva seus upserts, chave de conflito e valores anteriores.
- `getAdministrationBi(context, selection)` preserva assinatura e DTO, passando a consumir `loadAdministrationBiSource`. Ambos os consumidores (página e endpoint de exportação) foram localizados antes da alteração.
- `processWaterReadingAndBill` passa a receber `DatabaseExecutor`; seu único consumidor de produção, `leituras/leituras-actions.ts`, foi localizado e adaptado. Retorno e cálculo progressivo preservados com decimal independente.
- Actions de Saneamento e `searchConsumerUnits` preservam parâmetros, retornos de sucesso/erro, autorização e revalidações.
- `writeAuditEvent` legado permanece usando a transação recebida. `insertAuditEvent` é o repositório novo; não grava pela conexão global quando chamado dentro de uma transação.
- Mesclagem PF: assinaturas dos serviços agora recebem `DatabaseConnection` (mutações) ou `DatabaseExecutor` (candidatos). Todos os consumidores encontrados nas quatro actions foram adaptados; retornos `{ success: true } | { error: string }` e campos da página preservados. Execução/reversão continuam serializáveis; proposta, ledger e auditoria são gravados atomicamente.
- `readCanonicalIdentityIssues` recebe `DatabaseExecutor`; script operacional e teste de integridade adaptados. O oráculo temporário usa a implementação original do Git para evitar comparar o leitor novo consigo mesmo.
- Auditoria: `buildAuditEventWhere`/`buildAuditEventPageQuery` retornam filtros/ordenação SQL parametrizados; todos os consumidores localizados foram adaptados. `getAuditEventPage` recebe `DatabaseExecutor` e devolve `AuditEventPage` explícito com ator/perfil. Duas páginas preservam JSX, contagens e agrupamentos. APIs de sessão/interação preservam respostas, autenticação e cookies, substituindo somente a escrita da evidência.
- Notificações: listagem/contagem recebem `DatabaseExecutor`; reconhecimento recebe `DatabaseTransaction`. Duas páginas e duas actions foram adaptadas, mantendo `{ error: string | null }` e revalidações. Resolução dos links reautoriza Processos antes de aplicar o mesmo escopo de setor atual ou histórico. `createInternalNotifications` legado ainda atende produtores Prisma; `insertInternalNotifications` está preparado para produtores Drizzle e só pode ser chamado na transação completa de origem.
- Cargas municipais: `seedSanitationCity` e o contexto das onze funções `seed*` intermodulares recebem `DatabaseTransaction`; todos os consumidores transacionais encontrados nos dois runners e no teste foram adaptados. IDs determinísticos, dados e ordem de inserção preservados; contagens consideram apenas inserções efetivas. O writer SQL só aceita as 128 tabelas fixas dessa carga e não expõe consultas/mutações genéricas. `unit-identifier.ts` reexporta as implementações puras e a reserva Drizzle; nenhuma transação Prisma recebe o helper novo.
- Gestão de acesso: actions de usuários/perfis continuam com os mesmos parâmetros e `{ error: string | null }`; autorização, proteção do administrador técnico, vínculo funcional, provisionamento Firebase e revalidações mantidos. Remoção de ACL individual na edição, gravação de usuário/perfil e auditoria compartilham transação. Páginas de usuários/perfis/módulos, dashboard e instância mantêm DTOs e JSX. APIs antigas de Configurações preservam `void`/erros lançados; `saveInstanceConfiguration` mantém `{ error?, message? }` e grava valores JSON tipados com auditoria por chave na mesma transação.
- Cliente: `db` e `databaseConnection` conservam os nomes/tipos públicos. Importá-los não exige `DATABASE_URL`; o primeiro uso exige e resolve a configuração disponível naquele momento. A conexão real e o pool são reutilizados; criar uma consulta não abre conexão de rede.
- Integrações: `executeConfiguredIntegration`, `executeConfiguredHealthCheck`, `executeConfiguredStatementDownload` e `executeConfiguredHealthHttp` recebem `DatabaseExecutor`. Consumidores localizados em Configurações/Integrações, Financeiro/download-extratos, Saúde/vacinação e Saúde/farmácia; adaptação dos domínios coordenada com seus responsáveis. Os envelopes, status, mensagens, retries e sanitização permanecem. `saveIntegrationConnection`/`testIntegrationConnection` conservam `ActionResult` porque o componente client aguarda e trata `result.error`. O JSX da página não foi alterado.
- Numeração: `nextYearlyCodeDrizzle({ db, key, prefix, existingCodes, padding? })` é o writer novo. Preserva o bootstrap pelo maior código correspondente no ano e depois o incremento atômico por chave. Recebe a transação de origem quando numeração e entidade precisam de rollback conjunto. O `nextYearlyCode` legado permanece até a migração de Compras, Atendimento, Portal do Paciente e script patrimonial.
- ReportEngine: `writeReportIssuanceAudit` conserva a assinatura e os consumidores; usa `execution.context.database ?? db` com `insertAuditEvent`, omitindo preview e qualquer conteúdo do dataset. Cinco formatos de emissão, identificadores e ausência do payload foram conferidos no driver real.
- Financeiro intermodular: `resolveFinancialReportScope`, `readMunicipalFiscalIndex` e `assertCostScope` recebem `DatabaseExecutor`, aceitando a transação do chamador. `createLegacyExpenseInTransaction(tx, input)` devolve o ID da Expense e preserva Float, status `Empenhada`, vínculos Social e a mesma transação; ações Social já ligadas. Educação/merenda deve usar esse contrato preservando `Promise<void>`.
- C7: `runMunicipalControlDiagnostics` e `readControlWorkforceStatistics` recebem `DatabaseConnection`, com snapshot `repeatable read`; todos os helpers recebem o mesmo `tx`. Diagnósticos e recorte funcional histórico aprovados localmente. `taxAssessmentCompensatedValue(tx: DatabaseExecutor, id)` retorna Decimal independente; o overload legado será removido quando os consumidores tributários migrarem.

### Escalares de SQL sem mapeamento de coluna

O driver Neon/Drizzle 0.45.4 preserva **strings** para `timestamp`, `timestamptz`, `date` e `numeric` em `execute<T>(sql)`; o genérico `T` não converte os dados. Conferência real com literais fixos está em `.agent/neon-scalar-runtime-contract.json` (host com offset local de 180 minutos). Seleções de colunas tipadas usam normalmente seus mappers Drizzle.

Para DTOs que mantêm `Date`, usar `databaseTimestamp(value)` de `@/db/temporal` nos campos temporais retornados por SQL bruto, preservando UTC para `timestamp without time zone`, meia-noite UTC para `date` e o offset explícito para `timestamptz`. Tratar null no próprio campo. `new Date(rawTimestampSemZona)` depende do fuso do host e desloca três horas neste Windows; não representa o contrato antigo. JSON agregado também precisa decodificação explícita dos campos Date/Decimal declarados, sem inferir tipos pelo nome da chave. Numerics exatos continuam convertidos por `new Decimal(rawNumericString)`, nunca `Number` intermediário.

#### Parâmetros Date em SQL bruto — corrigidos no driver compartilhado

Também havia uma diferença na **ida** ao banco: sem encoder de coluna, o driver serializa `sql\`${date}\`` pelo fuso local por padrão. PostgreSQL descarta o offset ao inferir `timestamp without time zone`/`date`. No Neon real, `2026-01-01T05:00:00.123Z` tornava-se `02:00:00.123` neste host BRT; a mesma string ISO vinculada mantinha `05:00:00.123`. Isso fazia a expiração exata de `ProcessCitizenAccess` ser considerada vigente indevidamente no teste fixo.

`src/db/connection.ts` agora configura o **export público Neon `defaults.parseInputDatesAsUTC = true`**, antes de construir qualquer pool. Preserva a mesma representação UTC dos mappers de colunas e o instante de `timestamptz`; dispensa adaptações locais de comparação/vencimento. Os DTOs de retorno cru continuam precisando do decoder anterior.

Validação central: `tests/drizzle-driver-temporal.test.ts` passou com o driver real/SQL explícito em UTC, São Paulo e Auckland, cobrindo binds timestamp/date/timestamptz, fronteira de expiração, projeção de array e insert/returning tipados. `tests/citizen-process-tracking.test.ts` passou integralmente após a correção central, sem alterar policy ou expectativa. Oráculos de constantes Neon antes/depois: `.agent/neon-scalar-runtime-contract-before-utc-parameters.json` e `.agent/neon-scalar-runtime-contract.json`.

## Autoridade de DDL

Durante o inventário e a implantação da infraestrutura, a trilha `prisma/migrations-ibema` permanece a única autoridade de DDL. Drizzle Kit será usado para introspecção, sem `push` nem inicialização de baseline no banco atual. A mudança de autoridade ocorrerá somente após validar a reprodução do histórico e a adoção do banco instalado.

Reprodução e restauração locais aprovadas em `docs/drizzle-inventory/recovery.json`. A conferência de proveniência encontrou duas migrações com checksums históricos diferentes do SQL atual, sem origem anterior disponível no Git local. Os dois hashes permanecem registrados em `docs/drizzle-inventory/migration-history.json`; não alterar o ledger instalado para fazer uma comparação passar. A adoção deve preservar explicitamente essa evidência histórica.

Atualização da continuação: o hash instalado de Saúde foi reproduzido exatamente com finais de linha mistos, sem alteração do SQL; prova em `db/historical-provenance/20261015220000_health_aih_apac_workflows.json`, validada por `database-migrate-provenance.mjs`. O executor mantém hashes local/normalizado/instalado e o ledger integral nos recibos. Os 13 testes locais do executor passaram; a clínica continua sem proveniência comprovada. O gate de produção ainda não foi trocado e `adopt`/`replay` nunca são automáticos no build.
