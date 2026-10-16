import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { openConstructionExternalApplication } from "../src/lib/obras/construction-external-opening";
import { stageConstructionInternalDocument } from "../src/lib/obras/construction-internal-documents";

test("Prisma real: aberturas integrais externa/interna com migrations 16–21/27/30, GED, participantes, replay e rollback", async () => {
  const db = new PGlite(); const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  const definition = { fields: [{ key: "use", label: "Uso declarado", type: "CHOICE", required: true, options: ["Residencial"] }], checks: [{ key: "representation", label: "Representação conferida", required: true }], documents: [{ label: "Projeto", required: true }] };
  const hashSha256 = createHash("sha256").update(Buffer.from("%PDF-1.4\nConstruction opening fixture\n%%EOF")).digest("hex");
  try {
    // Core ACL/audit compatibility tables use the actual generated scalar metadata.
    // Construction tables/constraints/triggers below are created exclusively by the deployed migrations.
    for (const name of ["Usuario", "ConfiguracaoPerfil", "UsuarioModulo", "ConfiguracaoModulo", "AuditEvent"]) {
      const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name)!;
      const types: Record<string, string> = { String: "TEXT", Boolean: "BOOLEAN", Int: "INTEGER", DateTime: "TIMESTAMP(3)", Json: "JSONB", Decimal: "DECIMAL", Float: "DOUBLE PRECISION", BigInt: "BIGINT", Bytes: "BYTEA" };
      const columns = model.fields.filter((field) => field.kind !== "object").map((field) => `"${field.dbName || field.name}" ${types[field.type] || "TEXT"}${field.isList ? "[]" : ""}${field.name === "id" ? " PRIMARY KEY" : ""}${field.type === "DateTime" && field.name === "createdAt" ? " DEFAULT CURRENT_TIMESTAMP" : ""}`);
      await db.exec(`CREATE TABLE "${model.dbName || model.name}" (${columns.join(",")})`);
    }
    await db.exec(`
      CREATE TABLE "Person" (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'Ativo');
      CREATE TABLE "Company" (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'Ativo');
      CREATE TABLE "Department" (id TEXT PRIMARY KEY, "isActive" BOOLEAN DEFAULT true);
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY, "departmentId" TEXT, "isActive" BOOLEAN DEFAULT true);
      CREATE TABLE "RealEstate" (id TEXT PRIMARY KEY, "municipalInsc" TEXT, registration TEXT, "streetName" TEXT, number TEXT, lot TEXT, block TEXT, "landArea" DOUBLE PRECISION, "builtArea" DOUBLE PRECISION, "propertyUse" TEXT, "fiscalZone" TEXT, "taxpayerId" TEXT);
      CREATE TABLE "ProcessType" (id TEXT PRIMARY KEY, name TEXT, description TEXT, "isActive" BOOLEAN DEFAULT true, "initialDepartmentId" TEXT, "defaultSlaDays" INTEGER, "defaultPriority" TEXT, "requiresInterested" BOOLEAN DEFAULT true, "allowsInternalOpening" BOOLEAN DEFAULT true, "genericWorkflowEnabled" BOOLEAN DEFAULT false, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Subject" (id TEXT PRIMARY KEY, name TEXT, description TEXT, "processTypeId" TEXT, "slaDays" INTEGER, "isActive" BOOLEAN DEFAULT true, "initialDepartmentId" TEXT, "defaultPriority" TEXT, "requiresInterested" BOOLEAN DEFAULT true, "allowsInternalOpening" BOOLEAN DEFAULT true, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessWorkflowStage" (id TEXT PRIMARY KEY, "processTypeId" TEXT, "subjectId" TEXT, "departmentId" TEXT, position INTEGER, "slaDays" INTEGER, "isActive" BOOLEAN DEFAULT true, label TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessSequence" (year INTEGER PRIMARY KEY, "nextNumber" INTEGER, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Process" (id TEXT PRIMARY KEY, "protocolNumber" TEXT UNIQUE, "processTypeId" TEXT, "subjectId" TEXT, "personId" TEXT, "companyId" TEXT, description TEXT, priority TEXT, status TEXT, "currentDepartmentId" TEXT, "currentResponsibleEmployeeId" TEXT, "currentWorkflowStageId" TEXT, "expectedCompletionAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessMovement" (id TEXT PRIMARY KEY, "processId" TEXT REFERENCES "Process"(id), "toDepartmentId" TEXT, "employeeId" TEXT, reason TEXT, status TEXT, "dueAt" TIMESTAMP(3), "movedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "ProcessEvent" (id TEXT PRIMARY KEY, "processId" TEXT REFERENCES "Process"(id), "eventType" TEXT, description TEXT, "newStatus" TEXT, "departmentId" TEXT, "employeeId" TEXT, metadata TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Document" (id TEXT PRIMARY KEY, title TEXT NOT NULL, "documentType" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, status TEXT DEFAULT 'Válido', "validUntil" TIMESTAMP(3), "publicLabel" TEXT DEFAULT 'Documento autenticado', "retentionMonths" INTEGER DEFAULT 60, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "DocumentVersion" (id TEXT PRIMARY KEY, "documentId" TEXT REFERENCES "Document"(id), "versionNumber" INTEGER, "fileUrl" TEXT, "hashSha256" TEXT, status TEXT DEFAULT 'FINAL', "lockedAt" TIMESTAMP(3), "finalizedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, "publicValidationCode" TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP, UNIQUE("documentId","versionNumber"));
      CREATE TABLE "ProcessDocument" (id TEXT PRIMARY KEY, "processId" TEXT REFERENCES "Process"(id), "documentId" TEXT REFERENCES "Document"(id), title TEXT, "fileUrl" TEXT, "documentType" TEXT, purpose TEXT, "employeeId" TEXT, "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,ativo) VALUES ('admin',false); INSERT INTO "Person" (id) VALUES ('owner'),('engineer-person'),('broker-person'); INSERT INTO "Company" (id) VALUES ('builder');
      INSERT INTO "Department" (id) VALUES ('sector'); INSERT INTO "Employee" (id,"departmentId") VALUES ('analyst','sector');
      INSERT INTO "RealEstate" (id,"municipalInsc","streetName",number,"landArea","builtArea") VALUES ('property','TEST-001','Rua sintética','10',300,0);
      INSERT INTO "ProcessType" (id,name,"initialDepartmentId") VALUES ('type','Alvará','sector');
      INSERT INTO "Subject" (id,name,"processTypeId") VALUES ('subject','Projeto','type');
      INSERT INTO "ProcessWorkflowStage" (id,"processTypeId","subjectId","departmentId",position,"slaDays") VALUES ('stage','type','subject','sector',1,15);
    `);
    for (const migration of ["20261010160000_construction_foundation", "20261010170000_construction_rules_profiles", "20261010180000_construction_project_reviews", "20261010190000_construction_analyst_replacement", "20261010200000_construction_portal_participation", "20261010210000_construction_external_requests", "20261010270000_construction_company_validity", "20261010300000_construction_internal_documents"]) await db.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await db.exec(`
      INSERT INTO "ConstructionConfigVersion" (id,version,"freeRevisions","correctionDays","checkPropertyDebts","subjectIds","areaWeights",instructions,"publishedBy") VALUES ('config',1,2,30,false,'{subject}','{"existingArea":1,"expandedArea":1,"irregularArea":1,"renovationArea":0,"demolitionArea":-1}','Orientação demonstrativa','admin');
      INSERT INTO "ConstructionProfessional" (id,"personId","professionalType",council,registration,"startsAt","updatedAt") VALUES ('engineer','engineer-person','ENGINEER','CREA','TEST-E','2020-01-01',CURRENT_TIMESTAMP),('broker','broker-person','BROKER','CRECI','TEST-B','2020-01-01',CURRENT_TIMESTAMP);
      INSERT INTO "ConstructionPortalIdentity" (id,"firebaseUid",email,"professionalId","createdBy","updatedAt") VALUES ('identity','fixture-engineer','engineer@example.invalid','engineer','admin',CURRENT_TIMESTAMP),('broker-identity','fixture-broker','broker@example.invalid','broker','admin',CURRENT_TIMESTAMP);
      INSERT INTO "ConstructionTermVersion" (id,version,text,"publishedBy") VALUES ('term',1,'Termo demonstrativo de abertura','admin');
      INSERT INTO "ConstructionStaffRole" (id,"employeeId","departmentId",role,"startsAt","updatedAt") VALUES ('analyst-role','analyst','sector','ANALYST','2020-01-01',CURRENT_TIMESTAMP);
      INSERT INTO "ConstructionDistributionVersion" (id,"departmentId",version,strategy,"employeeId","publishedBy") VALUES ('distribution','sector',1,'USER','analyst','admin');
      INSERT INTO "ConstructionCompanyProfile" (id,"companyId","startsAt","endsAt","legalReference","createdBy","updatedAt") VALUES ('builder-profile','builder','2020-01-01','2099-12-31','Habilitação sintética','admin',CURRENT_TIMESTAMP);
      INSERT INTO "ConstructionProfessionalEmployer" (id,"professionalId","companyId","startsAt","updatedAt") VALUES ('builder-employer','engineer','builder','2020-01-01',CURRENT_TIMESTAMP);
    `);
    await db.query(`INSERT INTO "ConstructionDefinitionVersion" (id,kind,version,definition,"publishedBy") VALUES ('form','FORM',1,$1,'admin')`, [JSON.stringify(definition)]);
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }), transactionOptions: { timeout: 30000 } });
    const client = prisma;
    async function prepare(applicationId: string, identityId = "identity", companyId: string | null = null) {
      await client.constructionExternalApplication.create({ data: { id: applicationId, requestKey: randomUUID(), identityId, personId: companyId ? null : "owner", companyId, propertyIds: ["property"], subjectIds: ["subject"], authorizationReason: "Representação e titularidade conferidas pelo administrador", authorizedBy: "admin", expiresAt: new Date("2099-12-31") } });
      const document = await client.document.create({ data: { title: "Projeto", documentType: "Projeto urbanístico", fileUrl: `https://fixture.invalid/${applicationId}.pdf`, status: "Válido" }, select: { id: true } });
      const version = await client.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: `https://fixture.invalid/${applicationId}.pdf`, hashSha256, status: "FINAL" }, select: { id: true } });
      await client.constructionExternalDocument.create({ data: { applicationId, requestKey: randomUUID(), label: "Projeto", documentId: document.id, documentVersionId: version.id, hashSha256, filename: `${applicationId}.pdf`, mimeType: "application/pdf" } });
      return { applicationId, requestKey: randomUUID(), configurationVersion: 1, formVersion: 1, additionalValues: { use: "Residencial" }, processTypeId: "type", subjectId: "subject", personId: companyId ? "" : "owner", companyId: companyId || "", category: "BUILDING", locationType: "URBAN", regularization: false, modalityId: "construction-permit-01", purposeId: "construction-purpose-01", constructionTypeId: "construction-type-01", propertyIds: ["property"], existingArea: "10", expandedArea: "90", irregularArea: "0", renovationArea: "0", demolitionArea: "0", description: "Abertura integral demonstrativa", termId: "term", acceptTerm: true, documentIds: { Projeto: document.id }, checks: { representation: true } };
    }
    const input = await prepare("application");
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "broker-identity", input)), /Autorização indisponível/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, checks: {} })), /critérios obrigatórios/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, documentIds: {} })), /documentos obrigatórios/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, documentIds: { Projeto: "foreign-document" } })), /não pertence/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, additionalValues: { use: "Comercial" } })), /opção inválida/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, formVersion: 0 })), /formulário mudou/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, termId: "old-term" })), /termo vigente/);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, personId: "broker-person" })), /fora da autorização/);
    await db.query(`UPDATE "Document" SET "validUntil"='2020-01-01' WHERE id=$1`, [input.documentIds.Projeto]);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", input)), /GED alterado\/inválido/);
    await db.query(`UPDATE "Document" SET "validUntil"=NULL WHERE id=$1`, [input.documentIds.Projeto]);
    assert.equal(await client.process.count(), 0);
    const caseId = await client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", input));
    assert.equal(await client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", input)), caseId);
    const record = await client.constructionCase.findUniqueOrThrow({ where: { id: caseId }, select: { processId: true, totalArea: true, assignedEmployeeId: true, formSnapshot: true, participants: { select: { role: true, identityId: true } }, acceptances: { select: { termId: true } }, properties: { select: { realEstateId: true } } } });
    assert.equal(record.totalArea.toFixed(4), "100.0000"); assert.equal(record.assignedEmployeeId, "analyst");
    assert.deepEqual(record.participants, [{ role: "TECHNICAL", identityId: "identity" }]); assert.deepEqual(record.acceptances, [{ termId: "term" }]); assert.deepEqual(record.properties, [{ realEstateId: "property" }]);
    await assert.rejects(db.query(`INSERT INTO "ConstructionParticipant" (id,"caseId","identityId",role,reason,"createdBy") VALUES ('invalid-role',$1,'broker-identity','APPLICANT_PROFESSIONAL','Reprodução da incompatibilidade detectada','admin')`, [caseId]), /check constraint/);
    assert.equal(await client.process.count(), 1); assert.equal(await client.constructionCase.count(), 1); assert.equal(await client.processDocument.count(), 1); assert.equal(await client.constructionMessage.count(), 1);
    assert.equal((await client.constructionExternalApplication.findUniqueOrThrow({ where: { id: input.applicationId } })).caseId, caseId);
    const movement = (await db.query<{ employeeId: null; toDepartmentId: string }>(`SELECT "employeeId","toDepartmentId" FROM "ProcessMovement" WHERE "processId"=$1`, [record.processId])).rows[0];
    assert.deepEqual(movement, { employeeId: null, toDepartmentId: "sector" });
    const message = await client.constructionMessage.findFirstOrThrow({ where: { caseId }, select: { evidenceSnapshot: true } });
    assert.equal((message.evidenceSnapshot as { hashSha256: string }).hashSha256, hashSha256);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", { ...input, requestKey: randomUUID() })), /já foi protocolada/);
    const brokerInput = await prepare("broker-application", "broker-identity");
    const brokerCase = await client.$transaction((tx) => openConstructionExternalApplication(tx, "broker-identity", brokerInput));
    assert.equal((await client.constructionParticipant.findFirstOrThrow({ where: { caseId: brokerCase }, select: { role: true } })).role, "BROKER");
    const companyInput = await prepare("company-application", "identity", "builder");
    await db.exec(`UPDATE "ConstructionCompanyProfile" SET "isActive"=false WHERE id='builder-profile'`);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", companyInput)), /habilitação vigente/);
    await db.exec(`UPDATE "ConstructionCompanyProfile" SET "isActive"=true WHERE id='builder-profile'`);
    await db.exec(`UPDATE "ConstructionProfessionalEmployer" SET "isActive"=false WHERE id='builder-employer'`);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", companyInput)), /vínculo vigente à construtora/);
    await db.exec(`UPDATE "ConstructionProfessionalEmployer" SET "isActive"=true WHERE id='builder-employer'`);
    const companyCase = await client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", companyInput));
    assert.equal((await client.constructionCase.findUniqueOrThrow({ where: { id: companyCase }, select: { process: { select: { companyId: true } } } })).process.companyId, "builder");
    const rollbackInput = await prepare("rollback-application");
    const before = await client.processSequence.findUniqueOrThrow({ where: { year: new Date().getFullYear() }, select: { nextNumber: true } });
    await db.exec(`UPDATE "ConstructionStaffRole" SET "isActive"=false WHERE id='analyst-role'`);
    await assert.rejects(client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", rollbackInput)), /não possui profissional elegível/);
    await db.exec(`UPDATE "ConstructionStaffRole" SET "isActive"=true WHERE id='analyst-role'`);
    await assert.rejects(client.$transaction(async (tx) => { await openConstructionExternalApplication(tx, "identity", rollbackInput); throw new Error("Downstream rollback"); }), /Downstream rollback/);
    assert.equal(await client.process.count(), 3); assert.equal(await client.constructionCase.count(), 3); assert.equal(await client.constructionParticipant.count(), 3); assert.equal(await client.constructionTermAcceptance.count(), 3); assert.equal(await client.processDocument.count(), 3); assert.equal(await client.constructionMessage.count(), 3);
    assert.equal((await client.constructionExternalApplication.findUniqueOrThrow({ where: { id: rollbackInput.applicationId } })).caseId, null);
    assert.deepEqual(await client.processSequence.findUniqueOrThrow({ where: { year: new Date().getFullYear() }, select: { nextNumber: true } }), before);
    const recovered = await client.$transaction((tx) => openConstructionExternalApplication(tx, "identity", rollbackInput));
    assert.ok(recovered); assert.equal(await client.process.count(), 4);

    // Run the same transaction service called by the internal Server Action, with the real Protocols service.
    const { openConstructionInternalCase } = await import("../src/lib/obras/construction-internal-opening");
    const access = { administrator: false, employeeId: "analyst", departmentId: "sector", roles: ["ANALYST"] };
    const internalInput = { ...input, requestKey: randomUUID() };
    await assert.rejects(client.$transaction((tx) => openConstructionInternalCase(tx, access, "admin", internalInput)), /não foi preparado/);
    const internalDocument = await client.$transaction((tx) => stageConstructionInternalDocument(tx, access, "admin", { requestKey: internalInput.requestKey, uploadKey: randomUUID(), formVersion: 1, label: "Projeto" }, { fileUrl: "https://fixture.invalid/internal.pdf", hashSha256, filename: "internal.pdf", mimeType: "application/pdf" }));
    internalInput.documentIds = { Projeto: internalDocument.id };
    await assert.rejects(client.$transaction((tx) => openConstructionInternalCase(tx, access, "admin", { ...internalInput, checks: {} })), /critérios obrigatórios/);
    assert.equal(await client.process.count(), 4);
    const internalCase = await client.$transaction((tx) => openConstructionInternalCase(tx, access, "admin", internalInput));
    assert.equal(await client.$transaction((tx) => openConstructionInternalCase(tx, access, "admin", internalInput)), internalCase);
    assert.equal(await client.process.count(), 5); assert.equal(await client.constructionCase.count(), 5); assert.equal(await client.processDocument.count(), 5);
    const internalRecord = await client.constructionCase.findUniqueOrThrow({ where: { id: internalCase }, select: { processId: true, totalArea: true, assignedEmployeeId: true, formSnapshot: true, participants: { select: { id: true } }, process: { select: { protocolNumber: true } } } });
    assert.equal(internalRecord.totalArea.toFixed(4), "100.0000"); assert.equal(internalRecord.assignedEmployeeId, "analyst"); assert.deepEqual(internalRecord.participants, []);
    assert.equal(internalRecord.process.protocolNumber, `PROC-${new Date().getFullYear()}-000005`);
    assert.equal((internalRecord.formSnapshot as { documents: { hashSha256: string }[] }).documents[0].hashSha256, hashSha256);
    assert.equal((await db.query<{ employeeId: string }>(`SELECT "employeeId" FROM "ProcessMovement" WHERE "processId"=$1`, [internalRecord.processId])).rows[0].employeeId, "analyst");
    assert.equal((await db.query<{ caseId: string }>(`SELECT "caseId" FROM "ConstructionInternalOpeningDocument" WHERE "documentId"=$1`, [internalDocument.id])).rows[0].caseId, internalCase);
    assert.equal(await client.auditEvent.count(), 2);
    const internalRollback = { ...internalInput, requestKey: randomUUID() };
    const rollbackDocument = await client.$transaction((tx) => stageConstructionInternalDocument(tx, access, "admin", { requestKey: internalRollback.requestKey, uploadKey: randomUUID(), formVersion: 1, label: "Projeto" }, { fileUrl: "https://fixture.invalid/internal-rollback.pdf", hashSha256, filename: "internal-rollback.pdf", mimeType: "application/pdf" }));
    internalRollback.documentIds = { Projeto: rollbackDocument.id };
    await assert.rejects(client.$transaction(async (tx) => { await openConstructionInternalCase(tx, access, "admin", internalRollback); throw new Error("Internal downstream rollback"); }), /Internal downstream/);
    assert.equal(await client.process.count(), 5); assert.equal(await client.constructionCase.count(), 5); assert.equal(await client.processDocument.count(), 5); assert.equal(await client.auditEvent.count(), 2);
    assert.equal((await db.query<{ caseId: null }>(`SELECT "caseId" FROM "ConstructionInternalOpeningDocument" WHERE "documentId"=$1`, [rollbackDocument.id])).rows[0].caseId, null);
  } finally { await prisma?.$disconnect(); await server.stop(); await db.close(); }
});
