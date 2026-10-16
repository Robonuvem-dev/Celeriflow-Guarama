import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
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
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  try {
    await db.exec(`
      CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "Company" (id TEXT PRIMARY KEY);
      CREATE TABLE "Usuario" (id TEXT PRIMARY KEY); CREATE TABLE "ConstructionPortalIdentity" (id TEXT PRIMARY KEY);
      CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY);
      CREATE TABLE "Document" (id TEXT PRIMARY KEY); CREATE TABLE "DocumentVersion" (id TEXT PRIMARY KEY);
      CREATE TABLE "Department" (id TEXT PRIMARY KEY, "isActive" BOOLEAN DEFAULT true);
      CREATE TABLE "ProcessType" (id TEXT PRIMARY KEY, name TEXT, description TEXT, "isActive" BOOLEAN DEFAULT true, "initialDepartmentId" TEXT, "defaultSlaDays" INTEGER, "defaultPriority" TEXT, "requiresInterested" BOOLEAN DEFAULT true, "allowsInternalOpening" BOOLEAN DEFAULT false, "genericWorkflowEnabled" BOOLEAN DEFAULT false, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Subject" (id TEXT PRIMARY KEY, name TEXT, description TEXT, "processTypeId" TEXT, "slaDays" INTEGER, "isActive" BOOLEAN DEFAULT true, "initialDepartmentId" TEXT, "defaultPriority" TEXT, "requiresInterested" BOOLEAN DEFAULT true, "allowsInternalOpening" BOOLEAN DEFAULT false, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessWorkflowStage" (id TEXT PRIMARY KEY, "processTypeId" TEXT, "subjectId" TEXT, "departmentId" TEXT, position INTEGER, "slaDays" INTEGER, "isActive" BOOLEAN DEFAULT true, label TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessSequence" (year INTEGER PRIMARY KEY, "nextNumber" INTEGER, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Process" (id TEXT PRIMARY KEY, "protocolNumber" TEXT UNIQUE, "processTypeId" TEXT, "subjectId" TEXT, "personId" TEXT, "companyId" TEXT, description TEXT, priority TEXT, status TEXT, "currentDepartmentId" TEXT, "currentWorkflowStageId" TEXT, "expectedCompletionAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessMovement" (id TEXT PRIMARY KEY, "processId" TEXT, "toDepartmentId" TEXT, "employeeId" TEXT, reason TEXT, status TEXT, "dueAt" TIMESTAMP(3), "movedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessEvent" (id TEXT PRIMARY KEY, "processId" TEXT, "eventType" TEXT, description TEXT, "newStatus" TEXT, "departmentId" TEXT, "employeeId" TEXT, metadata TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "Department" (id) VALUES ('sector');
      INSERT INTO "ProcessType" (id,name,"initialDepartmentId") VALUES ('type','Alvará','sector');
      INSERT INTO "Subject" (id,name,"processTypeId") VALUES ('subject','Projeto','type');
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
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const process = await prisma.$transaction((tx) => createConstructionExternalProcess(tx, "identity", { processTypeId: "type", subjectId: "subject", personId: "person", description: "Projeto externo real" }));
    assert.equal(process.protocolNumber, `PROC-${new Date().getFullYear()}-000041`);
    const row = (await db.query<{ currentWorkflowStageId: string; personId: string; status: string }>(`SELECT "currentWorkflowStageId","personId",status FROM "Process" WHERE id=$1`, [process.id])).rows[0];
    assert.deepEqual(row, { currentWorkflowStageId: "stage", personId: "person", status: "Aguardando Recebimento" });
    const movement = (await db.query<{ employeeId: null; toDepartmentId: string }>(`SELECT "employeeId","toDepartmentId" FROM "ProcessMovement" WHERE "processId"=$1`, [process.id])).rows[0];
    assert.deepEqual(movement, { employeeId: null, toDepartmentId: "sector" });
    const event = (await db.query<{ employeeId: null; metadata: string }>(`SELECT "employeeId",metadata FROM "ProcessEvent" WHERE "processId"=$1`, [process.id])).rows[0];
    assert.equal(event.employeeId, null); assert.equal(JSON.parse(event.metadata).identityId, "identity");
    await db.exec(`UPDATE "ProcessType" SET "genericWorkflowEnabled"=true WHERE id='type'`);
    await assert.rejects(prisma.$transaction((tx) => createConstructionExternalProcess(tx, "identity", { processTypeId: "type", subjectId: "subject", personId: "person" })), /ator interno/);
    assert.equal((await db.query<{ nextNumber: number }>(`SELECT "nextNumber" FROM "ProcessSequence"`)).rows[0].nextNumber, 42);
  } finally { await prisma?.$disconnect(); await server.stop(); await db.close(); }
});

test("reenvio externo incrementa uma única revisão, preserva evidência e retorna ao analista; replay de outra identidade é negado", async () => {
  const state = { revisionCount: 0, reviewStatus: "CORRECTION_REQUIRED", assignedEmployeeId: null as string | null, correctionDeadline: new Date(Date.now() + 86400000), additionalValues: { purpose: "Anterior" } as Record<string, string> };
  const persisted = new Map<string, { id: string; caseId: string; identityId: string; kind: string; evidenceSnapshot: unknown }>();
  const events: unknown[] = []; const responsible: string[] = [];
  let accessible = true;
  const tx = {
    $queryRaw: async () => [], $executeRaw: async () => 1,
    constructionCase: {
      findFirst: async () => accessible ? { id: "case", processId: "process", ...state, firstAnalystId: "analyst", formSnapshot: { definition: { fields: [{ key: "purpose", label: "Finalidade", type: "TEXT", required: true, options: [] }], checks: [], documents: [] } }, process: { status: "Em Análise", completedAt: null, currentDepartmentId: "sector", companyId: null } } : null,
      update: async (input: { data: { reviewStatus: string; revisionCount: { increment: number }; assignedEmployeeId: string; correctionDeadline: null; additionalValues: Record<string, string> } }) => { state.reviewStatus = input.data.reviewStatus; state.revisionCount += input.data.revisionCount.increment; state.assignedEmployeeId = input.data.assignedEmployeeId; state.additionalValues = input.data.additionalValues; return { id: "case" }; },
    },
    constructionServiceRequest: {
      findUnique: async (input: { where: { requestKey: string } }) => persisted.get(input.where.requestKey) || null,
      findFirst: async () => null,
      create: async (input: { data: { requestKey: string; caseId: string; identityId: string; kind: string; evidenceSnapshot: unknown } }) => { const request = { id: "service-request", ...input.data }; persisted.set(input.data.requestKey, request); return request; },
    },
    constructionTermVersion: { findFirst: async () => ({ id: "term", version: 1 }) },
    constructionTermAcceptance: { findUnique: async () => ({ id: "acceptance" }) },
    constructionMessage: { findMany: async () => [{ documentId: "current-project" }] },
    constructionStaffRole: { findFirst: async () => ({ id: "analyst-role" }) },
    document: { findMany: async (input: { where: { id: { in: string[] } } }) => input.where.id.in.includes("current-project") ? [{ id: "current-project", versions: [{ id: "ged-version", status: "FINAL", hashSha256: "hash", versionNumber: 1 }] }] : [] },
    process: { update: async (input: { data: { currentResponsibleEmployeeId: string } }) => { responsible.push(input.data.currentResponsibleEmployeeId); return { id: "process" }; } },
    processEvent: { create: async (input: unknown) => { events.push(input); return { id: "event" }; } },
  } as unknown as Prisma.TransactionClient;
  const input = { caseId: "case", requestKey: randomUUID(), kind: "CORRECTION", revision: 0, termId: "term", notes: "Projeto corrigido conforme exigência", documentIds: ["current-project"], additionalValues: { purpose: "Corrigida" } };
  await assert.rejects(submitConstructionServiceRequest(tx, "identity", { ...input, documentIds: ["other-process-document"] }), /compartilhados na comunicação/);
  const id = await submitConstructionServiceRequest(tx, "identity", input);
  assert.equal(await submitConstructionServiceRequest(tx, "identity", input), id);
  assert.equal(state.revisionCount, 1); assert.equal(state.reviewStatus, "RESUBMITTED"); assert.equal(state.assignedEmployeeId, "analyst");
  assert.deepEqual(state.additionalValues, { purpose: "Corrigida" }); assert.deepEqual(responsible, ["analyst"]); assert.equal(events.length, 1); assert.equal(persisted.size, 1);
  assert.deepEqual((persisted.get(input.requestKey)?.evidenceSnapshot as { previousValues: unknown }).previousValues, { purpose: "Anterior" });
  await assert.rejects(submitConstructionServiceRequest(tx, "other-participant", input), /Referência de pedido indisponível/);
  accessible = false;
  await assert.rejects(submitConstructionServiceRequest(tx, "identity", input), /indisponível para sua conta/);
});

test("operação como PJ exige empresa habilitada e vínculo profissional vigentes", async () => {
  let qualified = false; let employer = false;
  const tx = { company: { findFirst: async () => qualified ? { id: "company" } : null }, constructionPortalIdentity: { findFirst: async () => employer ? { id: "identity" } : null } } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertConstructionExternalCompany(tx, "identity", "company"), /construtora requerente/);
  qualified = true;
  await assert.rejects(assertConstructionExternalCompany(tx, "identity", "company"), /vínculo vigente à construtora/);
  employer = true;
  await assert.doesNotReject(assertConstructionExternalCompany(tx, "identity", "company"));
  await assert.doesNotReject(assertConstructionExternalCompany(tx, "identity", null));
});

test("atendimento exige ator interno autorizado e ato municipal real no caso antes de concluir pedido", async () => {
  const request = { id: "request", caseId: "case", kind: "START", status: "PENDING", resolvedBy: null as string | null, payload: {}, createdAt: new Date("2026-10-10") };
  let scope = true; let realStart = false; let events = 0;
  const tx = {
    $queryRaw: async () => [],
    constructionServiceRequest: { findUnique: async () => ({ ...request }), findUniqueOrThrow: async () => ({ ...request }), update: async (input: { data: { status: string; resolvedBy: string } }) => { request.status = input.data.status; request.resolvedBy = input.data.resolvedBy; return { id: request.id }; } },
    constructionCase: { findFirst: async () => scope ? { id: "case", processId: "process", process: { currentDepartmentId: "sector" } } : null },
    constructionLifecycleStart: { findFirst: async () => realStart ? { id: "start" } : null },
    processEvent: { create: async () => { events++; return { id: "event" }; } },
  } as unknown as Prisma.TransactionClient;
  const access = { administrator: false, employeeId: "analyst", departmentId: "sector", roles: ["ANALYST"] };
  const input = { id: "request", decision: "ACCEPTED", resolution: "Início registrado pelo setor responsável", lifecycleRecordId: "start" };
  await assert.rejects(resolveConstructionServiceRequest(tx, { ...access, employeeId: null, roles: [] }, "external", input), /servidor|analista ou gestor/);
  await assert.rejects(resolveConstructionServiceRequest(tx, access, "actor", input), /ato municipal correspondente/);
  assert.equal(request.status, "PENDING"); assert.equal(events, 0);
  realStart = true;
  assert.equal(await resolveConstructionServiceRequest(tx, access, "actor", input), "request");
  assert.equal(request.status, "ACCEPTED"); assert.equal(events, 1);
  assert.equal(await resolveConstructionServiceRequest(tx, access, "actor", input), "request");
  assert.equal(events, 1);
  scope = false;
  await assert.rejects(resolveConstructionServiceRequest(tx, access, "actor", input), /no seu setor/);
});
