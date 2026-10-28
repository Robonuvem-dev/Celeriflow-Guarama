import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { getPostgresError } from "../src/db/errors";
import { users } from "../src/db/schema/identity";
import { withDatabaseTransaction } from "../src/db/transaction";
import { companies, documents } from "../src/db/schema/registry";
import { documentVersions } from "../src/db/schema/document-workflow";
import { employees } from "../src/db/schema/administration";
import { constructionCases, constructionLifecycleStarts, constructionParticipants, constructionPortalIdentities, constructionProfessionals } from "../src/db/schema/construction-core";
import { constructionCompanyProfiles, constructionProfessionalEmployers, constructionServiceRequests, constructionStaffRoles, constructionTerms } from "../src/db/schema/construction-portal";
import { constructionDocumentRequests, constructionDocumentTemplateVersions, constructionIssuedDocuments } from "../src/db/schema/construction-documents";
import { people } from "../src/db/schema/people";
import { processTypes, processSubjects, processWorkflowStages, processSequences, processes, processMovements, processEvents } from "../src/db/schema/processes";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { createConstructionSharedTables } from "./helpers/construction-shared-tables";
import { createConstructionRequestsFixture } from "./helpers/construction-requests-fixture";
import { assertExternalApplicationScope, validateExternalOpeningEvidence } from "../src/lib/obras/construction-external-policy";
import { assertConstructionRequestState, constructionServiceRequestSchema } from "../src/lib/obras/construction-request-policy";
import { createConstructionExternalProcess } from "../src/lib/obras/construction-external-process";
import { submitConstructionServiceRequest } from "../src/lib/obras/construction-request-service";
import { assertConstructionExternalCompany } from "../src/lib/obras/construction-external-company";
import { resolveConstructionServiceRequest } from "../src/lib/obras/construction-request-resolution";

test("autorização externa limita identidade, requerente, assunto, conjunto integral de imóveis e vigência", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const application = { identityId: "identity", personId: "person", companyId: null, propertyIds: ["property-a", "property-b"], subjectIds: ["subject"], expiresAt: new Date("2026-10-11T00:00:00Z"), revokedAt: null };
  const input = { personId: "person", companyId: "", subjectId: "subject", propertyIds: ["property-b", "property-a"] };
  assert.doesNotThrow(() => assertExternalApplicationScope(application, "identity", input, now));
  assert.throws(() => assertExternalApplicationScope(application, "other", input, now), /indisponível/);
  assert.throws(() => assertExternalApplicationScope({ ...application, expiresAt: now }, "identity", input, now), /vencida/);
  assert.throws(() => assertExternalApplicationScope({ ...application, revokedAt: now }, "identity", input, now), /indisponível/);
  for (const change of [{ personId: "other" }, { companyId: "company" }, { subjectId: "other" }, { propertyIds: ["property-a"] }, { propertyIds: ["property-a", "other"] }]) assert.throws(() => assertExternalApplicationScope(application, "identity", { ...input, ...change }, now), /fora da autorização/);
});

test("documentos e confirmações obrigatórios são exigidos antes da criação do protocolo", () => {
  const definition = { fields: [], checks: [{ key: "representation", label: "Representação", required: true }], documents: [{ label: "Projeto", required: true }, { label: "Complemento", required: false }] };
  assert.doesNotThrow(() => validateExternalOpeningEvidence(definition, { Projeto: "document" }, { representation: true }));
  assert.throws(() => validateExternalOpeningEvidence(definition, {}, { representation: true }), /documentos obrigatórios/);
  assert.throws(() => validateExternalOpeningEvidence(definition, { Projeto: "document" }, { representation: false }), /critérios obrigatórios/);
  assert.throws(() => validateExternalOpeningEvidence(definition, { Projeto: "document", Unknown: "document" }, { representation: true }), /não previsto/);
});

test("reenvio exige exigência vigente, revisão atual e processo ativo; renovação exige alvará de origem", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const record = { revisionCount: 1, reviewStatus: "CORRECTION_REQUIRED", correctionDeadline: new Date("2026-10-11"), process: { status: "Em Análise", completedAt: null } };
  assert.doesNotThrow(() => assertConstructionRequestState({ kind: "CORRECTION", revision: 1 }, record, now));
  assert.throws(() => assertConstructionRequestState({ kind: "CORRECTION", revision: 0 }, record, now), /revisão mudou/);
  assert.throws(() => assertConstructionRequestState({ kind: "CORRECTION", revision: 1 }, { ...record, correctionDeadline: new Date("2026-10-09") }, now), /Prazo/);
  assert.throws(() => assertConstructionRequestState({ kind: "CORRECTION", revision: 1 }, { ...record, reviewStatus: "APPROVED" }, now), /exigência/);
  assert.throws(() => assertConstructionRequestState({ kind: "COMPLETION", revision: 1 }, record, now), /aprovado/);
  assert.throws(() => assertConstructionRequestState({ kind: "INSPECTION", revision: 1 }, { ...record, process: { status: "Arquivado", completedAt: null } }, now), /encerrado/);
  const request = { caseId: "case", requestKey: randomUUID(), kind: "RENEWAL", revision: 1, termId: "term", notes: "Renovação fundamentada", documentIds: [] };
  assert.equal(constructionServiceRequestSchema.safeParse(request).success, false);
  assert.equal(constructionServiceRequestSchema.safeParse({ ...request, sourceIssuedDocumentId: "permit" }).success, true);
});

test("PostgreSQL: abertura cria processo central, sequência compartilhada, etapas reais e eventos sem funcionário; migration protege vínculos", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.database;
  try {
    await createConstructionSharedTables(db, [processTypes, processSubjects, processWorkflowStages, processSequences, processes, processMovements, processEvents]);
    await db.exec(`
      CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "Company" (id TEXT PRIMARY KEY);
      CREATE TABLE "Usuario" (id TEXT PRIMARY KEY); CREATE TABLE "ConstructionPortalIdentity" (id TEXT PRIMARY KEY);
      CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY);
      CREATE TABLE "Document" (id TEXT PRIMARY KEY); CREATE TABLE "DocumentVersion" (id TEXT PRIMARY KEY);
      CREATE TABLE "Department" (id TEXT PRIMARY KEY, "isActive" BOOLEAN DEFAULT true);
      INSERT INTO "Department" (id) VALUES ('sector');
      INSERT INTO "ProcessType" (id,name,"initialDepartmentId","requiresInterested","allowsInternalOpening") VALUES ('type','Alvará','sector',true,false);
      INSERT INTO "Subject" (id,name,"processTypeId","requiresInterested","allowsInternalOpening") VALUES ('subject','Projeto','type',true,false);
      INSERT INTO "ProcessWorkflowStage" (id,"processTypeId","subjectId","departmentId",position,"slaDays") VALUES ('stage','type','subject','sector',1,15);
      INSERT INTO "ProcessSequence" (year,"nextNumber") VALUES (${new Date().getFullYear()},41);
      INSERT INTO "Person" VALUES ('person'); INSERT INTO "Company" VALUES ('company'); INSERT INTO "Usuario" VALUES ('admin'); INSERT INTO "ConstructionPortalIdentity" VALUES ('identity'); INSERT INTO "ConstructionCase" VALUES ('case');
    `);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010210000_construction_external_requests/migration.sql", "utf8"));
    const insert = `INSERT INTO "ConstructionExternalApplication" (id,"requestKey","identityId","personId","propertyIds","subjectIds","authorizationReason","authorizedBy","expiresAt") VALUES ('application','auth-key','identity','person','{property}','{subject}','Representação conferida','admin','2027-01-01')`;
    await db.exec(insert);
    await assert.rejects(db.exec(insert), /duplicate key/);
    await assert.rejects(db.exec(`UPDATE "ConstructionExternalApplication" SET "companyId"='company' WHERE id='application'`), /interested_check/);
    await assert.rejects(db.exec(`UPDATE "ConstructionExternalApplication" SET "propertyIds"='{}' WHERE id='application'`), /scope_check/);
    await assert.rejects(db.exec(`DELETE FROM "ConstructionPortalIdentity" WHERE id='identity'`), /foreign key/);
    await db.exec(`INSERT INTO "ConstructionServiceRequest" (id,"requestKey","caseId","identityId",kind,revision,notes,payload,"evidenceSnapshot") VALUES ('request','request-key','case','identity','INSPECTION',0,'Vistoria solicitada','{}','{}')`);
    await assert.rejects(db.exec(`UPDATE "ConstructionServiceRequest" SET kind='UNKNOWN' WHERE id='request'`), /kind_check/);
    await assert.rejects(db.exec(`DELETE FROM "ConstructionCase" WHERE id='case'`), /foreign key/);
    const process = await withDatabaseTransaction(fixture.connection, (tx) => createConstructionExternalProcess(tx, "identity", { processTypeId: "type", subjectId: "subject", personId: "person", description: "Projeto externo real" }));
    assert.equal(process.protocolNumber, `PROC-${new Date().getFullYear()}-000041`);
    const row = (await db.query<{ currentWorkflowStageId: string; personId: string; status: string }>(`SELECT "currentWorkflowStageId","personId",status FROM "Process" WHERE id=$1`, [process.id])).rows[0];
    assert.deepEqual(row, { currentWorkflowStageId: "stage", personId: "person", status: "Aguardando Recebimento" });
    const movement = (await db.query<{ employeeId: null; toDepartmentId: string }>(`SELECT "employeeId","toDepartmentId" FROM "ProcessMovement" WHERE "processId"=$1`, [process.id])).rows[0];
    assert.deepEqual(movement, { employeeId: null, toDepartmentId: "sector" });
    const event = (await db.query<{ employeeId: null; metadata: string }>(`SELECT "employeeId",metadata FROM "ProcessEvent" WHERE "processId"=$1`, [process.id])).rows[0];
    assert.equal(event.employeeId, null); assert.equal(JSON.parse(event.metadata).identityId, "identity");
    await db.exec(`UPDATE "ProcessType" SET "genericWorkflowEnabled"=true WHERE id='type'`);
    await assert.rejects(withDatabaseTransaction(fixture.connection, (tx) => createConstructionExternalProcess(tx, "identity", { processTypeId: "type", subjectId: "subject", personId: "person" })), /ator interno/);
    assert.equal((await db.query<{ nextNumber: number }>(`SELECT "nextNumber" FROM "ProcessSequence"`)).rows[0].nextNumber, 42);
  } finally { await fixture.close(); }
});

test("reenvio externo incrementa uma única revisão, preserva evidência e retorna ao analista; replay de outra identidade é negado", async () => {
  const f = await createConstructionRequestsFixture();
  const db = f.db;
  const input = { caseId: "case", requestKey: randomUUID(), kind: "CORRECTION", revision: 0, termId: "term", notes: "Projeto corrigido conforme exigência", documentIds: ["current-project"], additionalValues: { purpose: "Corrigida" } };
  const submit = (value: unknown = input, identityId = "identity") => f.transaction(tx => submitConstructionServiceRequest(tx, identityId, value));
  const readCase = async () => (await db.select().from(constructionCases).where(eq(constructionCases.id, "case")))[0];
  const requestCount = async () => (await db.select({ total: count() }).from(constructionServiceRequests))[0].total;
  try {
    await db.update(constructionCases).set({ reviewStatus: "CORRECTION_REQUIRED", correctionDeadline: new Date(Date.now() + 86400000), additionalValues: { purpose: "Anterior" }, formSnapshot: { definition: { fields: [{ key: "purpose", label: "Finalidade", type: "TEXT", required: true, options: [] }], checks: [], documents: [] } } }).where(eq(constructionCases.id, "case"));
    await assert.rejects(submit({ ...input, documentIds: ["other-process-document"] }), /compartilhados na comunicação/);
    await db.update(documents).set({ validUntil: new Date("2000-01-01T00:00:00Z") }).where(eq(documents.id, "current-project"));
    await assert.rejects(submit(), /versão GED vigente/);
    await db.update(documents).set({ validUntil: null }).where(eq(documents.id, "current-project"));
    await db.insert(documentVersions).values({ id: "draft", documentId: "current-project", versionNumber: 2, fileUrl: "/draft.pdf", hashSha256: "b".repeat(64), status: "DRAFT" });
    await assert.rejects(submit(), /versão GED vigente/);
    await db.update(documentVersions).set({ status: "FINAL" }).where(eq(documentVersions.id, "draft"));
    await db.update(constructionStaffRoles).set({ isActive: false }).where(eq(constructionStaffRoles.id, "analyst-role"));
    await assert.rejects(submit(), /vínculo vigente/);
    await db.update(constructionStaffRoles).set({ isActive: true }).where(eq(constructionStaffRoles.id, "analyst-role"));
    await db.update(employees).set({ departmentId: "other" }).where(eq(employees.id, "analyst"));
    await assert.rejects(submit(), /vínculo vigente/);
    await db.update(employees).set({ departmentId: "sector" }).where(eq(employees.id, "analyst"));
    await f.database.exec(`CREATE FUNCTION reject_submission_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$; CREATE TRIGGER reject_submission_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_submission_history()`);
    await assert.rejects(submit());
    assert.equal(await requestCount(), 0); assert.equal((await readCase()).revisionCount, 0);
    assert.equal((await db.select().from(processes).where(eq(processes.id, "process")))[0].currentResponsibleEmployeeId, null);
    await f.database.exec(`DROP TRIGGER reject_submission_history ON "ProcessEvent"`);
    // Generic portal participation deliberately keeps the historical no-startsAt filter.
    await db.update(constructionParticipants).set({ startsAt: new Date("2099-01-01T00:00:00Z") }).where(eq(constructionParticipants.identityId, "identity"));
    const id = await submit();
    assert.equal(await submit(), id);
    const state = await readCase();
    assert.equal(state.revisionCount, 1); assert.equal(state.reviewStatus, "RESUBMITTED"); assert.equal(state.assignedEmployeeId, "analyst"); assert.equal(state.correctionDeadline, null);
    assert.deepEqual(state.additionalValues, { purpose: "Corrigida" }); assert.equal(await requestCount(), 1);
    assert.equal((await db.select().from(processes).where(eq(processes.id, "process")))[0].currentResponsibleEmployeeId, "analyst");
    const [request] = await db.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.id, id));
    assert.ok(request.createdAt instanceof Date);
    assert.deepEqual(request.evidenceSnapshot, { termId: "term", termVersion: 1, documents: [{ id: "current-project", versions: [{ id: "draft", status: "FINAL", hashSha256: "b".repeat(64), versionNumber: 2 }] }], previousValues: { purpose: "Anterior" }, firstAnalystId: "analyst" });
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, 1);
    await assert.rejects(submit(input, "other-participant"), /Referência de pedido indisponível/);
    await db.update(constructionParticipants).set({ isActive: false, endsAt: new Date() }).where(eq(constructionParticipants.identityId, "identity"));
    await assert.rejects(submit(), /indisponível para sua conta/);
  } finally { await f.close(); }
});

test("Drizzle: renovação cria o ciclo documental na mesma transação, exige termo vigente e impede pedidos pendentes duplicados", async () => {
  const f = await createConstructionRequestsFixture();
  const db = f.db;
  const input = { caseId: "case", requestKey: randomUUID(), kind: "RENEWAL", revision: 0, termId: "term", notes: "Renovação fundamentada do alvará", documentIds: [], sourceIssuedDocumentId: "permit" };
  const submit = (value: unknown = input) => f.transaction(tx => submitConstructionServiceRequest(tx, "identity", value));
  try {
    await db.insert(constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará", body: "Alvará", stamp: "Municipal", signaturePolicy: "INTERNAL_ALLOWED", createdBy: "manager-user" });
    await db.insert(constructionIssuedDocuments).values({ id: "permit", requestKey: randomUUID(), caseId: "case", processId: "process", kind: "PERMIT", year: 2026, sequence: 1, number: "PERMIT-1/2026", templateVersionId: "template", templateSnapshot: {}, documentId: "current-project", documentVersionId: "ged-version", fileUrl: "/project.pdf", hashSha256: "a".repeat(64), backupPath: "/backup.pdf", validationCode: "fixture", status: "PUBLISHED", createdBy: "manager-user" });
    await assert.rejects(submit({ ...input, termId: "obsolete" }), /termo vigente/);
    await assert.rejects(submit({ ...input, sourceIssuedDocumentId: "missing" }), /Alvará publicado indisponível/);
    await f.database.exec(`CREATE FUNCTION reject_renewal_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$; CREATE TRIGGER reject_renewal_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_renewal_history()`);
    await assert.rejects(submit());
    assert.equal((await db.select({ total: count() }).from(constructionDocumentRequests))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(constructionServiceRequests))[0].total, 0);
    await f.database.exec(`DROP TRIGGER reject_renewal_history ON "ProcessEvent"`);
    const id = await submit();
    assert.equal(await submit(), id);
    const [request] = await db.select().from(constructionDocumentRequests);
    assert.equal(request.identityId, "identity"); assert.equal(request.type, "RENEWAL"); assert.equal(request.status, "PENDING");
    const [serviceRequest] = await db.select().from(constructionServiceRequests);
    assert.equal(serviceRequest.status, "PENDING");
    assert.deepEqual(serviceRequest.payload, { additionalValues: {}, documentIds: [], sourceIssuedDocumentId: "permit", documentRequestId: request.id });
    await assert.rejects(submit({ ...input, requestKey: randomUUID() }), /pedido deste serviço/);
    await assert.rejects(submit({ ...input, requestKey: randomUUID(), kind: "DOCUMENT_CORRECTION" }), /pedido de emissão pendente/);
    await db.insert(constructionTerms).values({ version: 2, text: "Termo novo", publishedBy: "manager-user" });
    await assert.rejects(submit({ ...input, requestKey: randomUUID() }), /termo vigente/);
  } finally { await f.close(); }
});

test("operação como PJ exige empresa habilitada e vínculo profissional vigentes", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  const now = new Date("2026-10-10T12:00:00Z"), startsAt = new Date("2026-01-01T00:00:00Z"), endsAt = new Date("2026-10-10T00:00:00Z");
  const check = (companyId: string | null) => assertConstructionExternalCompany(db, "identity", companyId, now);
  try {
    await createConstructionSharedTables(fixture.database, [companies, constructionPortalIdentities, constructionProfessionals, constructionCompanyProfiles, constructionProfessionalEmployers]);
    await db.insert(companies).values({ id: "company", corporateName: "Construtora sintética", cnpj: "11222333000181", status: "Ativo" });
    await db.insert(constructionProfessionals).values({ id: "professional", personId: "person", professionalType: "ENGINEER", council: "CREA", registration: "TEST", startsAt });
    await db.insert(constructionPortalIdentities).values({ id: "identity", firebaseUid: "fixture-uid", email: "fixture@example.invalid", professionalId: "professional", createdBy: "actor" });
    await db.insert(constructionCompanyProfiles).values({ id: "profile", companyId: "company", startsAt, endsAt, isActive: false, legalReference: "Referência sintética", createdBy: "actor" });
    await db.insert(constructionProfessionalEmployers).values({ id: "employer", professionalId: "professional", companyId: "company", startsAt, endsAt, isActive: false });
    await assert.rejects(check("company"), /construtora requerente/);
    await db.update(constructionCompanyProfiles).set({ isActive: true }).where(eq(constructionCompanyProfiles.id, "profile"));
    await assert.rejects(check("company"), /vínculo vigente à construtora/);
    await db.update(constructionProfessionalEmployers).set({ isActive: true }).where(eq(constructionProfessionalEmployers.id, "employer"));
    await assert.doesNotReject(check("company"));
    await assert.doesNotReject(check(null));
    await assert.rejects(assertConstructionExternalCompany(db, "identity", "company", new Date("2026-10-11T00:00:00Z")), /construtora requerente/);
  } finally { await fixture.close(); }
});

test("Drizzle: atendimento exige ato municipal real, setor/autoria/replay, cronologia e rollback do histórico", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db, pg = fixture.database;
  const access = { administrator: false, employeeId: "analyst", departmentId: "sector", roles: ["ANALYST"] };
  const input = { id: "request", decision: "ACCEPTED", resolution: "Início registrado pelo setor responsável", lifecycleRecordId: "start" };
  const resolve = (value: unknown = input, actorId = "actor", scope: typeof access | { administrator: boolean; employeeId: null; departmentId: string; roles: string[] } = access) => withDatabaseTransaction(fixture.connection, tx => resolveConstructionServiceRequest(tx, scope, actorId, value));
  const events = async () => (await db.select({ total: count() }).from(processEvents))[0].total;
  const readRequest = async (id = "request") => (await db.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.id, id)))[0];
  const createdAt = new Date("2026-10-10T12:34:56.789Z");
  try {
    await createConstructionSharedTables(pg, [users, people, companies, processes, processEvents, constructionCases, constructionLifecycleStarts, constructionPortalIdentities]);
    await pg.exec(`CREATE TABLE "Document" (id TEXT PRIMARY KEY); CREATE TABLE "DocumentVersion" (id TEXT PRIMARY KEY);
      CREATE TABLE "ConstructionInspection" (id TEXT PRIMARY KEY,"caseId" TEXT,"requestedAt" TIMESTAMP(3));
      CREATE TABLE "ConstructionCompletion" (id TEXT PRIMARY KEY,"caseId" TEXT,"createdAt" TIMESTAMP(3));`);
    await pg.exec(readFileSync("prisma/migrations-ibema/20261010210000_construction_external_requests/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261010230000_construction_documents/migration.sql", "utf8"));
    await db.insert(users).values({ id: "actor", nome: "Ator sintético", email: "actor@example.invalid", perfilId: "profile" });
    await db.insert(processes).values({ id: "process", protocolNumber: "TEST-REQUEST", processTypeId: "type", subjectId: "subject", currentDepartmentId: "sector" });
    await db.insert(constructionCases).values({ id: "case", requestKey: randomUUID(), processId: "process", configurationId: "config", category: "BUILDING", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal(0), expandedArea: new Decimal(0), irregularArea: new Decimal(0), renovationArea: new Decimal(0), demolitionArea: new Decimal(0), totalArea: new Decimal(0), calculationSnapshot: {}, createdBy: "actor" });
    await db.insert(constructionPortalIdentities).values({ id: "identity", firebaseUid: "uid", email: "identity@example.invalid", professionalId: "professional", createdBy: "actor" });
    await db.insert(constructionServiceRequests).values({ id: "request", requestKey: randomUUID(), caseId: "case", identityId: "identity", kind: "START", revision: 0, notes: "Registro do início solicitado", payload: {}, evidenceSnapshot: {}, createdAt });
    await assert.rejects(resolve(input, "external", { ...access, employeeId: null, roles: [] }), /servidor|analista ou gestor/);
    await assert.rejects(resolve(), /ato municipal correspondente/);
    assert.equal((await readRequest()).status, "PENDING"); assert.equal(await events(), 0);
    await db.insert(constructionLifecycleStarts).values({ id: "start", caseId: "case", requestKey: randomUUID(), startedAt: new Date("2026-10-10T00:00:00Z"), notes: "Início registrado", evidenceSnapshot: {}, createdBy: "actor", createdAt: new Date(createdAt.getTime() - 1) });
    await assert.rejects(resolve(), /ato municipal correspondente/);
    await db.update(constructionLifecycleStarts).set({ createdAt }).where(eq(constructionLifecycleStarts.id, "start"));
    await pg.exec(`CREATE FUNCTION reject_request_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$;
      CREATE TRIGGER reject_request_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_request_history()`);
    await assert.rejects(resolve());
    assert.equal((await readRequest()).status, "PENDING"); assert.equal((await readRequest()).resolvedAt, null);
    await pg.exec(`DROP TRIGGER reject_request_history ON "ProcessEvent"`);
    assert.equal(await resolve(), "request");
    assert.equal((await readRequest()).status, "ACCEPTED"); assert.equal(await events(), 1);
    assert.deepEqual((await readRequest()).payload, { fulfilledRecordId: "start" });
    assert.ok((await readRequest()).resolvedAt instanceof Date);
    assert.equal(await resolve(), "request"); assert.equal(await events(), 1);
    await assert.rejects(resolve(input, "other-actor"), /já atendido/);
    await assert.rejects(resolve(input, "actor", { ...access, departmentId: "other" }), /no seu setor/);
    for (const [kind, table, column] of [["INSPECTION", "ConstructionInspection", "requestedAt"], ["COMPLETION", "ConstructionCompletion", "createdAt"]] as const) {
      const id = kind.toLowerCase();
      await db.insert(constructionServiceRequests).values({ id, requestKey: randomUUID(), caseId: "case", identityId: "identity", kind, revision: 0, notes: "Pedido cronológico", payload: {}, evidenceSnapshot: {}, createdAt });
      await pg.query(`INSERT INTO "${table}" (id,"caseId","${column}") VALUES ($1,'case',$2)`, [id, "2026-10-10 12:34:56.788"]);
      await assert.rejects(resolve({ ...input, id, lifecycleRecordId: id }), /ato municipal correspondente/);
      await pg.query(`UPDATE "${table}" SET "${column}"=$1 WHERE id=$2`, ["2026-10-10 12:34:56.789", id]);
      assert.equal(await resolve({ ...input, id, lifecycleRecordId: id }), id);
    }
    await pg.exec(`INSERT INTO "Document" (id) VALUES ('permit-doc'); INSERT INTO "DocumentVersion" (id) VALUES ('permit-version')`);
    await db.insert(constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará", body: "Alvará", stamp: "Municipal", signaturePolicy: "INTERNAL_ALLOWED", createdBy: "actor" });
    await db.insert(constructionIssuedDocuments).values({ id: "permit", requestKey: randomUUID(), caseId: "case", processId: "process", kind: "PERMIT", year: 2026, sequence: 1, number: "PERMIT-1", templateVersionId: "template", templateSnapshot: {}, documentId: "permit-doc", documentVersionId: "permit-version", fileUrl: "/permit.pdf", hashSha256: "a".repeat(64), backupPath: "/backup.pdf", validationCode: "fixture", status: "PUBLISHED", createdBy: "actor" });
    await db.insert(constructionDocumentRequests).values({ id: "document-request", requestKey: randomUUID(), caseId: "case", sourceIssuedDocumentId: "permit", type: "RENEWAL", reason: "Renovação documental" });
    await db.insert(constructionServiceRequests).values({ id: "renewal", requestKey: randomUUID(), caseId: "case", identityId: "identity", kind: "RENEWAL", revision: 0, notes: "Pedido de renovação", payload: { documentRequestId: "document-request" }, evidenceSnapshot: {}, createdAt });
    await assert.rejects(resolve({ ...input, id: "renewal" }), /ato municipal correspondente/);
    // Reproduce the preexisting physical bug before the forward-only upgrade.
    await assert.rejects(resolve({ ...input, id: "renewal", decision: "REJECTED" }), error => getPostgresError(error)?.code === "23514");
    assert.equal((await readRequest("renewal")).status, "PENDING");
    assert.equal((await db.select({ status: constructionDocumentRequests.status }).from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, "document-request")))[0].status, "PENDING");
    assert.equal(await events(), 3);
    await pg.exec(readFileSync("db/migrations/20261028193000_construction_document_rejection/migration.sql", "utf8"));
    // No request/event/history may survive a later failure in this same unit.
    await pg.exec(`CREATE TRIGGER reject_request_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_request_history()`);
    await assert.rejects(resolve({ ...input, id: "renewal", decision: "REJECTED" }), error => getPostgresError(error)?.code === "P0001");
    assert.equal((await readRequest("renewal")).status, "PENDING");
    assert.equal((await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, "document-request")))[0].status, "PENDING");
    assert.equal(await events(), 3);
    await pg.exec(`DROP TRIGGER reject_request_history ON "ProcessEvent"`);
    const rejection = { ...input, id: "renewal", decision: "REJECTED", resolution: "Renovação indeferida com fundamento municipal" };
    assert.equal(await resolve(rejection), "renewal");
    assert.equal(await events(), 4);
    const rejected = await readRequest("renewal");
    assert.equal(rejected.status, "REJECTED"); assert.equal(rejected.resolvedBy, "actor"); assert.equal(rejected.resolution, rejection.resolution);
    assert.ok(rejected.resolvedAt instanceof Date); assert.deepEqual(rejected.payload, { documentRequestId: "document-request", fulfilledRecordId: null });
    const [rejectedDocument] = await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, "document-request"));
    assert.equal(rejectedDocument.status, "REJECTED"); assert.equal(rejectedDocument.issuedDocumentId, null);
    assert.equal(await resolve(rejection), "renewal"); assert.equal(await events(), 4);
    assert.deepEqual(await readRequest("renewal"), rejected);
    await assert.rejects(resolve(rejection, "other-actor"), /já atendido/);
    await assert.rejects(resolve({ ...rejection, decision: "ACCEPTED" }), /já atendido/);
    for (const status of ["ACCEPTED", "CANCELLED", "RESUBMITTED"]) await assert.rejects(db.update(constructionDocumentRequests).set({ status }).where(eq(constructionDocumentRequests.id, "document-request")), error => getPostgresError(error)?.code === "23514");
    // A later cycle can still be fulfilled without rewriting the rejected one.
    await db.insert(constructionDocumentRequests).values({ id: "next-document-request", requestKey: randomUUID(), caseId: "case", sourceIssuedDocumentId: "permit", type: "RENEWAL", reason: "Novo ciclo após indeferimento" });
    await db.insert(constructionServiceRequests).values({ id: "next-renewal", requestKey: randomUUID(), caseId: "case", identityId: "identity", kind: "RENEWAL", revision: 0, notes: "Novo pedido de renovação", payload: { documentRequestId: "next-document-request" }, evidenceSnapshot: {}, createdAt });
    await db.update(constructionDocumentRequests).set({ status: "FULFILLED", issuedDocumentId: "permit" }).where(eq(constructionDocumentRequests.id, "next-document-request"));
    assert.equal(await resolve({ ...input, id: "next-renewal" }), "next-renewal"); assert.equal(await events(), 5);
    assert.equal((await readRequest("next-renewal")).status, "ACCEPTED"); assert.deepEqual(await readRequest("renewal"), rejected);
  } finally { await fixture.close(); }
});
