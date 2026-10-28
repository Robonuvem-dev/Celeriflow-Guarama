# Portal do Servidor — migração Drizzle

## Implementação da frente entregue; validação integrada pendente

Responsável desta sessão: `src/lib/portal-servidor/**`, `src/app/app-domain/portal-servidor/**`, `src/app/api/portal-servidor/**`, autenticação do portal, portais Concursos/Convenentes/Departamentos, validações públicas funcionais e testes `employee-portal*`.

## Handoffs necessários à integração

- RH: `enqueueHrIntegration` deve receber `DatabaseExecutor`/`DatabaseTransaction`, mantendo payload, replay e retorno completo do evento. Consumido nas transações do portal.
- RH: leitores `arePortalPayrollStatementsEnabled`, `getPayrollStatement`, `listServiceRightLedger`, `listMyRecertificationCampaigns` recebem `DatabaseExecutor`; writers `submitRecertificationProposal`, `submitEmployeeHrRequest`, `submitEmployeeCreditRequest`, `readOwnVerifiedReceipt` recebem `DatabaseConnection` quando abrem transação. `reserveVacationRightInTransaction` e `reconcileAttendanceSources` recebem a transação de origem.
- RH: contratos, folha, pagamentos/alocação, accruals/rights, consignações e regras preservam Decimal independente e DTOs em `contracts/personnel.ts`.
- SST: `bookAppointment`, `cancelAppointment`, `registerCertificate`, `buildOwnFinalPppSource` e demais serviços contextuais devem usar `context.database`/conexão Drizzle. Os wrappers do portal preservam autorização e não concedem RBAC administrativo.
- GED/Processos: `createValidatedProcess` recebe `DatabaseTransaction`; `ingestGedDocument` e `requestDocumentSignaturesForActor` recebem `DatabaseConnection`, com `afterCreate` na mesma transação Drizzle. Necessários ao portal para vínculo GED, evento e auditoria atômicos.
- Plataforma: `insertAuditEvent` é usado com o executor/transação recebido; não há gravação pela conexão global dentro de uma transação.

Nenhum build/tsc/teste PGlite pesado é executado nesta frente; validação integrada centralizada. Nenhum Git, instalação, DDL ou acesso ao Neon realizado.

## Entrega no escopo

- Bibliotecas próprias, páginas/actions do app-domain, APIs funcionais, sessão de autenticação e validações públicas convertidas para Drizzle.
- Concursos: listagem pública passa `db` ao serviço RH; consulta de edital preserva versão FINAL/SIGNED, documento Válido, ausência de pessoa e conferência SHA-256; comprovante usa auditoria Drizzle.
- Convenentes: consumidores contextuais revisados, sem acesso direto legado.
- Departamentos: consultas de unidades, servidores, motivos e recibos convertidas; mantidos escopo de UG, autorização clínica, autor, departamento histórico e departamento atual.
- Repositórios em `src/db/repositories/portal-servidor/{records,payroll,profile,contracts,reports}.ts`; contratos em `src/lib/contracts/employee-portal.ts`; mapeamentos das três tabelas funcionais em `src/db/schema/employee-portal.ts`.
- Leitores de identidade/aniversariantes em `src/db/repositories/portal-servidor/identity.ts` são reutilizados pelos consumidores próprios.

## Contratos exportados relevantes à integração

### Leitura com executor recebido

- `assertEmployeePortalLogin(db: DatabaseExecutor, user)`.
- `listFunctionalServices(db: DatabaseExecutor, employeeId)`.
- `readOwnFunctionalRequest(db: DatabaseExecutor, employeeId, requestId)`.
- `personalStatementPublicationAllowed(db: DatabaseExecutor, statement, employeeId)` e `ownReleasedStatementIds(db: DatabaseExecutor, employeeId, competence?)`.
- `verifyPublicReceipt(db: DatabaseExecutor, code)`, `verifyGeneratedDocument(db: DatabaseExecutor, code)` e `functionalSourceManifestIsCurrent(db: DatabaseExecutor, raw)`.
- `getOwnClockPolicy(context, executor = context.database ?? db)` permite a leitura dentro da transação já aberta.
- `payrollSnapshotHash` recebe JSON independente do ORM e `Decimal.Value`, normalizando valores monetários para o mesmo texto canônico dos hashes anteriores.

### Operações que abrem transação

- `readOwnVerifiedReceipt(connection: DatabaseConnection, employeeId, statementId)` e `cleanUnusedFunctionalUploads(connection: DatabaseConnection, actorId)`.
- Terceiro parâmetro opcional `connection: DatabaseConnection = databaseConnection`: `recordOwnClock`; `enrollOwnCourse`, `completeFunctionalCourse`, `submitOwnFunctionalEvaluation`, `submitCommissionEvaluation`, `saveCareerPolicy`; `publishFunctionalEvaluationResult`; `submitFunctionalRequest`, `requestFunctionalComplement`, `submitFunctionalComplement`, `decideFunctionalRequest`, `completeFunctionalDocumentRequest`; `publishFunctionalDocument`, `revokeFunctionalDocument`; `issueOwnFunctionalDocument`, `manageGeneratedDocument`; `publishPayrollByFunctionalPolicy`, `savePayrollPublicationPolicy`, `revokeFunctionalStatement`; `saveFunctionalService`, `saveManagedPortalPolicy`, `saveUploadRetention`.
- `enrollOwnCourse` aceita `Pick<AppContext, "user" | "database">`, permitindo fixture real sem fabricar contexto ou cliente legado; consumidores existentes continuam compatíveis.
- As actions client continuam devolvendo seus objetos de erro/sucesso; os wrappers de produção continuam usando a conexão padrão. Locks e operações derivadas recebem a mesma transação.

## Paridade revisada

- `portalRows` usa OIDs 1082/1114/1184 para hidratar somente colunas físicas de data/timestamp do resultado Neon; não converte strings ISO dentro de JSON. NUMERIC continua texto até conversão explícita para `Decimal`.
- Arrays em SQL parametrizado usam `sql.param(array)` e cast PostgreSQL explícito, incluindo arrays vazios.
- Modelos documentais ordenam por `name,id` no banco. Catálogos mantêm `sortOrder,id`. Totalizadores pessoais preservam a consulta sem restrição adicional a `valueType`.
- `PayrollItem.reference` é `string | null` conforme SQL histórico; `PayrollBenefit.customValue` e `BenefitConfig.baseValue` são DOUBLE PRECISION e mantêm os números legados usados pela UI. Datas e campos de `Dependent` e `Vacation` conferidos contra os mapeamentos físicos.
- Requerimentos preservam titularidade, checagem de versões, vínculo GED, complementação, replay, decisões e auditoria na transação de origem.

## Testes preparados para a execução central

- `tests/helpers/employee-portal-fixture.ts` usa `createLocalDrizzleDatabase`, com driver Neon/Drizzle real e conjuntos explícitos de tabelas extraídos do SQL histórico. Reinstala índices, FKs entre tabelas presentes e triggers de imutabilidade relevantes. Não gera esquema por metadados ORM.
- `tests/employee-portal-login.test.ts`: vínculo ativo do titular; recusa de cadastro ausente/inativo mesmo com outro servidor ativo; bloqueio por módulo/perfil/ausência de vínculo antes da consulta funcional.
- `tests/employee-portal-final-services.test.ts`: mantém testes de políticas/templates e totais integrais; adapta conciliação com compensação, versão obsoleta e rollback de livros; manifesto passa antes e falha depois do cancelamento real do pagamento; disputa concorrente de uma vaga com replay e auditoria única; roundtrip de datas UTC, precisão NUMERIC, JSON e distinção SQL NULL/JSON null.
- `tests/employee-portal-routes.test.ts` revisado; não contém persistência legada.
- Removidos DMMF, adaptador/cliente legado, mocks de persistência e casts de cliente/contexto dos testes próprios. Os caminhos `prisma/migrations*` na fixture são somente referências ao histórico SQL preservado.
- Estes testes de banco foram preparados e **não executados nesta frente**.

## Verificações leves executadas

1. ESLint de todas as raízes próprias, repositórios/contratos/mapeamentos novos, testes, helper e verificador: **código 0, sem diagnósticos**.
2. `node scripts/verify-employee-portal-drizzle.mjs`: **código 0**; 127 arquivos, 188 declarações de função exportadas, 55 arquivos com JSX, nenhuma falha de parse e nenhuma referência ativa Prisma detectada pela AST.
3. Grep de bibliotecas, app-domain, APIs, portais externos e testes próprios confirma ausência de chamadas/imports Prisma ativos. A fixture referencia somente os caminhos do SQL histórico.
4. Comparação JSX/CSS com a cópia-base imutável fornecida pelo parent: **código 0, nenhuma diferença nas árvores JSX dos 55 arquivos comparados**. Inventário complementar confirmou 55 arquivos com JSX em cada lado, sem arquivos JSX exclusivos de qualquer lado e sem arquivos `.css` em nenhum dos dois lados nas raízes do verificador. Resultado detalhado abaixo.

Comando do lint executado (PowerShell):

```powershell
node node_modules/eslint/bin/eslint.js "src/lib/portal-servidor/**/*.{ts,tsx}" "src/db/repositories/portal-servidor/**/*.ts" "src/db/schema/employee-portal.ts" "src/lib/contracts/employee-portal.ts" "src/app/app-domain/portal-servidor/**/*.{ts,tsx}" "src/app/api/portal-servidor/**/*.ts" "src/app/portal-servidor/**/*.{ts,tsx}" "src/app/api/auth/portal-servidor/session/route.ts" "src/app/portal/concursos/**/*.{ts,tsx}" "src/app/portal/convenentes/**/*.{ts,tsx}" "src/app/portal/departamentos/**/*.{ts,tsx}" "src/app/api/portal/concursos/**/*.ts" "src/app/api/portal/departamentos/**/*.ts" "src/app/validar-emissao/**/*.tsx" "src/app/validar-recibo/**/*.tsx" "tests/employee-portal*.ts" "tests/helpers/employee-portal-fixture.ts" "scripts/verify-employee-portal-drizzle.mjs"
```

### Comparação com a cópia-base fornecida pelo parent

Base: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`, informada pelo parent como head `5cfa75d` com apenas ajustes de cliente lazy, scripts de typecheck e documentação; módulos do portal originais. A cópia foi apenas lida. Não foi usado Git para obtê-la ou confirmar seu head.

Comando executado:

```powershell
node scripts/verify-employee-portal-drizzle.mjs --baseline-dir "C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync"
```

Saída exata, com código de saída **0**:

```json
{
  "files": 127,
  "exportedFunctions": 188,
  "jsxFiles": 55,
  "baselineCompared": 55,
  "failures": []
}
```

O inventário complementar, somente leitura e usando as mesmas raízes do verificador, retornou `currentJsxFiles: 55`, `baselineJsxFiles: 55`, `baselineOnlyJsx: []`, `currentOnlyJsx: []`, `currentCss: []` e `baselineCss: []`. Assim, a comparação não omitiu arquivos JSX inteiros removidos/adicionados; não havia arquivos CSS locais a comparar. Nenhuma correção visual foi necessária.

Limitações: o verificador compara as árvores JSX serializadas pelo printer TypeScript, normalizando formatação; cobre os elementos, textos, atributos, classes e expressões presentes nas árvores. Não compara implementação de funções/variáveis calculadas fora do JSX, conteúdo dos dados retornados pelos repositórios, componentes/estilos compartilhados importados fora das raízes, nem renderização no navegador, screenshots ou comportamento responsivo. O resultado comprova igualdade estática do JSX nesse escopo, não equivalência visual completa em execução. A validação de contratos, tipos e testes de banco continua centralizada após os handoffs.

## Pontos exatos para o integrador

- O parent assumiu o encaminhamento completo dos consumidores RH e informou que o agente SST foi avisado. Nesta continuação foram executadas apenas verificações leves de comparação e atualizado este relatório; não houve alterações em RH/SST/GED.
- RH ainda apresentava assinaturas legadas na última inspeção de `statement-service.ts`, `attendance-reconciliation.ts`, `vacation-rights.ts`, `recruitment-service.ts`, `recertification.ts`, `portal-requests.ts` e `credit-requests.ts`. Os consumidores do portal já passam executor/transação/conexão Drizzle conforme o contrato acima. Confirmar também `attendancePostingKey`, `resolveContractRevision`, `enqueueHrIntegration`, `arePortalPayrollStatementsEnabled`, leituras de direitos/recadastramento e os portais contextuais de concursos/convenentes.
- `getPayrollStatement` chama de volta `personalStatementPublicationAllowed`: precisa receber executor Drizzle e preservar DTO/serialização para os hashes dos recibos já emitidos.
- O teste de conciliação requer `attendancePostingKey(tx: DatabaseTransaction, ..., AttendanceRecord)` e `reconcileAttendanceSources(tx: DatabaseTransaction, ..., AttendanceRecord, AttendanceRecord, EmploymentContract)`, usando contratos independentes em `contracts/personnel.ts` e Decimal independente.
- GED/Processos: conferidas no código atual as assinaturas Drizzle de `createValidatedProcess`, `ingestGedDocument` com `afterCreate(tx: DatabaseTransaction, ...)` e `requestDocumentSignaturesForActor`. Consumidores próprios compatíveis; comprovação transacional integrada permanece na validação central.
- SST: confirmar execução contextual de agenda, certificados e PPP com Drizzle, mantendo as autorizações existentes e o recorte próprio do titular.
- Plataforma: `AppContext` ainda continha cliente legado na última inspeção; sua remoção pertence à integração compartilhada. Nenhum teste desta frente fabrica esse cliente.

Comandos preparados para a integração, após os handoffs:

```powershell
node scripts/verify-employee-portal-drizzle.mjs
node scripts/verify-employee-portal-drizzle.mjs --baseline-dir "C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync"
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/employee-portal-login.test.ts tests/employee-portal-final-services.test.ts tests/employee-portal-routes.test.ts
npm run typecheck
npm run build
```

A comparação estática com a cópia-base foi concluída conforme os resultados acima. Typecheck, build e testes de banco permanecem sob responsabilidade da validação central após os contratos; não há afirmação de aprovação integrada nesta entrega.
