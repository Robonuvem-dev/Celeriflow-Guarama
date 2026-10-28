import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { secretariats, departments, employees } from "../src/db/schema/administration";
import { users, accessProfiles } from "../src/db/schema/identity";
import { people } from "../src/db/schema/people";
import { taxpayers, realEstates, documents } from "../src/db/schema/registry";
import { processes, processTypes, processSubjects, processDocuments, processEvents } from "../src/db/schema/processes";
import { constructionCases, constructionCaseProperties, constructionCatalogEntries, constructionConfigVersions, constructionLifecycleStarts, constructionParticipants, constructionPortalIdentities, constructionProfessionals, constructionReviews, constructionViabilityResults } from "../src/db/schema/construction-core";
import { constructionTerms, constructionTermAcceptances } from "../src/db/schema/construction-portal";
import { constructionCompletions, constructionInspectionPlans, constructionInspections } from "../src/db/schema/construction-lifecycle";
import { constructionDocumentRequests, constructionIssuedDocuments, constructionPdfAnnotations } from "../src/db/schema/construction-documents";
import { constructionFees } from "../src/db/schema/construction-taxation";
import { taxes } from "../src/db/schema/taxation-core";
import { documentIcpEvidence, documentVersions } from "../src/db/schema/document-workflow";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { assertConstructionGedSignature, createConstructionPdfRevision, issueConstructionDocument, publishConstructionArtifact, publishConstructionDocumentTemplate } from "../src/lib/obras/construction-documents-service";
import { requestConstructionArtifactChange } from "../src/lib/obras/construction-document-requests";
import { submitConstructionServiceRequest } from "../src/lib/obras/construction-request-service";
import { resolveConstructionServiceRequest } from "../src/lib/obras/construction-request-resolution";
import { publishConstructionTaxRule } from "../src/lib/obras/construction-taxation";
import { requestInternalDocumentSignatures, registerRequestedInternalDocumentSignature, findPublicDocumentValidation } from "../src/lib/documents/document-flow-service";
import { constructionFileHash, generateConstructionPdf } from "../src/lib/obras/construction-documents-policy";
import { readConstructionPdf, storeConstructionPdf } from "../src/lib/obras/construction-document-storage";
import { assertConstructionProjectStampDownload, getConstructionProjectStamp, publishConstructionProjectStamp, stampConstructionApprovedProject } from "../src/lib/obras/construction-project-stamp";
import { resolveConstructionComplementArtifact } from "../src/lib/obras/construction-document-downloads";

// Real production driver and municipal migrations; no CRUD mocks.
// Only a temporary filesystem replaces the configured physical backup destination.
// node --conditions=react-server --import tsx --test tests/construction-documents*.test.ts
test("PostgreSQL: emissão GED, assinaturas internas verificáveis, publicação, ciclos de mudança, habite-se e revisão PDF", { timeout: 240000 }, async () => {
  const fixture = await createLocalDrizzleDatabase(); const db = fixture.connection.db, pg = fixture.database;
  // Shared GED session entrypoints resolve this lazy production connection on
  // first use. This file has one sequential integration and its own test process.
  const globalDatabase = globalThis as typeof globalThis & { celeriflowDatabase?: DatabaseConnection };
  const previousDatabase = globalDatabase.celeriflowDatabase;
  globalDatabase.celeriflowDatabase = fixture.connection;
  const base = path.join(process.env.LOCALAPPDATA || process.cwd(), "Temp", "opencode");
  let temporary: string | undefined;
  const originalEnvironment = { instance: process.env.CELERIFLOW_INSTANCE_ID, backup: process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR, blob: process.env.BLOB_READ_WRITE_TOKEN };
  try {
    await mkdir(base, { recursive: true }); temporary = await mkdtemp(path.join(base, "construction-documents-test-"));
    process.env.CELERIFLOW_INSTANCE_ID = "construction-documents-test"; process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR = temporary; delete process.env.BLOB_READ_WRITE_TOKEN;
    const directory = "prisma/migrations-ibema";
    for (const migration of readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) await pg.exec(readFileSync(path.join(directory, migration, "migration.sql"), "utf8"));
    await pg.exec(readFileSync("db/migrations/20261028193000_construction_document_rejection/migration.sql", "utf8"));
    const transaction = <T>(operation: Parameters<typeof withDatabaseTransaction<T>>[1]) => withDatabaseTransaction(fixture.connection, operation, { timeoutMs: 60000 });
    const [secretariat] = await db.insert(secretariats).values({ name: "Demonstração" }).returning(); const [department] = await db.insert(departments).values({ name: "Engenharia", secretariatId: secretariat.id }).returning();
    const [employee] = await db.insert(employees).values({ name: "Gestor demonstrativo", departmentId: department.id, secretariatId: secretariat.id }).returning();
    const [profile] = await db.insert(accessProfiles).values({ codigo: "DOCUMENT_TEST", nome: "Teste", permissoes: "{}" }).returning();
    const [user] = await db.insert(users).values({ nome: "Assinante demonstrativo", email: "signer@example.invalid", perfilId: profile.id, employeeId: employee.id }).returning();
    const [other] = await db.insert(users).values({ nome: "Segundo assinante", email: "second@example.invalid", perfilId: profile.id }).returning();
    const access = { administrator: false, employeeId: employee.id, departmentId: department.id, roles: ["MANAGER"] };
    // Only user is consumed by these already-authorized GED/domain entrypoints.
    const context = { database: db, user: { id: user.id, firebaseUid: "synthetic-test-uid", email: user.email, name: user.nome, role: "GESTOR", profileCode: "DOCUMENT_TEST", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: employee.id, departmentId: department.id, secretariatId: secretariat.id } } as AppContext;
    const secondContext = { ...context, user: { ...context.user, id: other.id, name: other.nome, email: other.email } };
    const [person] = await db.insert(people).values({ fullName: "Requerente sintético", cpf: "00000000191" }).returning();
    const [taxpayer] = await db.insert(taxpayers).values({ taxpayerType: "PF", personId: person.id }).returning();
    const [property] = await db.insert(realEstates).values({ municipalInsc: "DEMO-DOCUMENT-1", taxpayerId: taxpayer.id, landArea: 200 }).returning();
    const [processType] = await db.insert(processTypes).values({ name: "Licenciamento demonstrativo" }).returning(); const [subject] = await db.insert(processSubjects).values({ name: "Obra", processTypeId: processType.id }).returning();
    const [licensingProcess] = await db.insert(processes).values({ protocolNumber: "DEMO/2026/1", processTypeId: processType.id, subjectId: subject.id, personId: person.id, currentDepartmentId: department.id, status: "Em Análise" }).returning();
    const [configuration] = await db.insert(constructionConfigVersions).values({ version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: false, subjectIds: [subject.id], areaWeights: {}, instructions: "Demonstrativo", publishedBy: user.id }).returning();
    const [record] = await db.insert(constructionCases).values({ requestKey: randomUUID(), processId: licensingProcess.id, configurationId: configuration.id, category: "BUILDING", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal(0), expandedArea: new Decimal(100), irregularArea: new Decimal(0), renovationArea: new Decimal(0), demolitionArea: new Decimal(0), totalArea: new Decimal(100), calculationSnapshot: {}, createdBy: user.id, reviewStatus: "APPROVED", assignedEmployeeId: employee.id }).returning();
    await db.insert(constructionCaseProperties).values({ caseId: record.id, realEstateId: property.id, cadastralSnapshot: {} });
    await db.insert(constructionViabilityResults).values({ caseId: record.id, requestKey: randomUUID(), outcome: "APPROVED", calculationSnapshot: {}, createdBy: user.id });
    const [professional] = await db.insert(constructionProfessionals).values({ personId: person.id, professionalType: "ENGINEER", council: "CREA", registration: "DEMO-1", startsAt: new Date("2020-01-01T00:00:00Z") }).returning();
    const [identity] = await db.insert(constructionPortalIdentities).values({ firebaseUid: "portal-demo-uid", email: "portal@example.invalid", professionalId: professional.id, createdBy: user.id }).returning();
    await db.insert(constructionParticipants).values({ caseId: record.id, identityId: identity.id, role: "TECHNICAL", reason: "Participação sintética", createdBy: user.id });
    const [term] = await db.insert(constructionTerms).values({ version: 1, text: "Demonstração", publishedBy: user.id }).returning(); await db.insert(constructionTermAcceptances).values({ caseId: record.id, identityId: identity.id, termId: term.id });
    const [tax] = await db.insert(taxes).values({ code: "DEMO-DOCUMENTS", name: "Taxa sintética", taxType: "Taxa" }).returning();
    const rules = new Map<string, string>();
    async function rule(kind: "PERMIT" | "HABITE_SE" | "CORRECTION" | "RENEWAL") { const row = await transaction(tx => publishConstructionTaxRule(tx, user.id, { kind, taxId: tax.id, startsAt: "2020-01-01", endsAt: "", fixedAmount: "10", amountPerSquareMeter: "0", legalBasis: "Regra demonstrativa sem validade oficial", guideInstructions: "Não realizar pagamento bancário", demonstration: true })); rules.set(kind, row.id); }
    // Existing formal exemptions are documentary preconditions. Actual fee/DAM
    // issuance and its transactional rollback live in construction-taxation.test.ts.
    async function exempt(kind: "PERMIT" | "HABITE_SE" | "CORRECTION" | "RENEWAL", documentRequestId = "") { const [row] = await db.insert(constructionFees).values({ caseId: record.id, kind, revision: 0, cycleKey: documentRequestId ? `DOCUMENT_REQUEST:${documentRequestId}` : "INITIAL", requestKey: randomUUID(), ruleId: rules.get(kind)!, taxpayerId: taxpayer.id, realEstateId: property.id, amount: new Decimal(10), calculationSnapshot: {}, exemptionReason: "Isenção formal exclusivamente demonstrativa", createdBy: user.id }).returning(); return row.id; }
    const issued = async (id: string) => (await db.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.id, id)))[0];
    const version = async (id: string) => (await db.select().from(documentVersions).where(eq(documentVersions.id, id)))[0];
    const issue = (input: unknown, scope = access) => issueConstructionDocument(fixture.connection, scope, user.id, input);
    const publish = (id: string) => transaction(tx => publishConstructionArtifact(tx, access, user.id, id));
    const templates = new Map<string, string>();
    for (const kind of ["VIABILITY", "PERMIT", "OCCUPANCY"] as const) templates.set(kind, await transaction((tx) => publishConstructionDocumentTemplate(tx, access, user.id, { kind, title: `${kind} DEMONSTRAÇÃO`, body: "Documento {{number}}\nProcesso {{protocol}}\nÁrea {{totalArea}} m²\nRequerente {{applicant}}", stamp: "DEMONSTRAÇÃO - {{kind}} {{number}}", signaturePolicy: "INTERNAL_ALLOWED" })));
    const input = (kind: "VIABILITY" | "PERMIT" | "OCCUPANCY", extra: Record<string, string> = {}) => ({ caseId: record.id, kind, requestKey: randomUUID(), templateVersionId: templates.get(kind)!, ...extra });
    async function signAndPublish(id: string) { const row = await issued(id); if ((await version(row.documentVersionId)).status === "FINAL") await requestInternalDocumentSignatures(context, row.documentId, [user.id]); await registerRequestedInternalDocumentSignature(context, row.documentId, { ipAddress: null, userAgent: "PGlite test" }, new Date()); await publish(id); return row; }
    const viability = await issue(input("VIABILITY")); await signAndPublish(viability);
    await assert.rejects(issue(input("PERMIT"), { ...access, departmentId: "other-sector" }), /indisponível/);
    await assert.rejects(issue(input("PERMIT")), /Taxa PERMIT/); await rule("PERMIT"); await exempt("PERMIT");
    const initialInput = input("PERMIT", { validUntil: "2027-12-31" });
    const beforeFailure = {
      documents: (await db.select({ total: count() }).from(documents))[0].total,
      versions: (await db.select({ total: count() }).from(documentVersions))[0].total,
      links: (await db.select({ total: count() }).from(processDocuments))[0].total,
      events: (await db.select({ total: count() }).from(processEvents))[0].total,
    };
    await pg.exec(`CREATE FUNCTION reject_document_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CONSTRUCTION_DOCUMENT_ISSUED' THEN RAISE EXCEPTION 'document history rejected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_document_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_document_history()`);
    await assert.rejects(issue(initialInput));
    assert.equal((await db.select({ total: count() }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.kind, "PERMIT")))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(documents))[0].total, beforeFailure.documents);
    assert.equal((await db.select({ total: count() }).from(documentVersions))[0].total, beforeFailure.versions);
    assert.equal((await db.select({ total: count() }).from(processDocuments))[0].total, beforeFailure.links);
    assert.equal((await db.select({ total: count() }).from(processEvents))[0].total, beforeFailure.events);
    await pg.exec(`DROP TRIGGER reject_document_history ON "ProcessEvent"`);
    const permitId = await issue(initialInput);
    assert.equal(await issue(initialInput), permitId);
    const permit = await issued(permitId); assert.equal(permit.processId, licensingProcess.id); assert.equal(permit.sequence, 1);
    assert.equal((await db.select().from(processDocuments).where(eq(processDocuments.documentId, permit.documentId)))[0].processId, licensingProcess.id);
    const bytes = await readConstructionPdf(permit.fileUrl, permit.hashSha256); assert.equal(constructionFileHash(await readFile(permit.backupPath)), constructionFileHash(bytes));
    await assert.rejects(publish(permitId), /assinaturas/);
    await requestInternalDocumentSignatures(context, permit.documentId, [user.id, other.id]);
    await registerRequestedInternalDocumentSignature(context, permit.documentId, { ipAddress: null, userAgent: "PGlite" }, new Date());
    await assert.rejects(publish(permitId), /assinaturas/);
    await registerRequestedInternalDocumentSignature(secondContext, permit.documentId, { ipAddress: null, userAgent: "PGlite" }, new Date());
    await writeFile(permit.backupPath, "corrupted bytes"); await assert.rejects(publish(permitId), /diverge/); await writeFile(permit.backupPath, bytes);
    await publish(permitId);
    assert.equal((await assertConstructionGedSignature(db, permit.documentVersionId)).status, "SIGNED");
    const verification = await findPublicDocumentValidation(db, permit.validationCode); assert.equal(verification?.signature.kind, "INTERNAL"); assert.equal(verification?.signature.valid, true);
    assert.equal((await db.select({ total: count() }).from(documentIcpEvidence))[0].total, 0, "Internal demonstration must never claim A1 certificate evidence");
    const rejectedKey = randomUUID();
    const rejectedService = await transaction(tx => submitConstructionServiceRequest(tx, identity.id, { caseId: record.id, kind: "DOCUMENT_CORRECTION", revision: 0, termId: term.id, sourceIssuedDocumentId: permitId, requestKey: rejectedKey, notes: "Correção documental sujeita à decisão municipal", documentIds: [], additionalValues: {} }));
    const [rejectedRequest] = await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.requestKey, rejectedKey));
    await transaction(tx => resolveConstructionServiceRequest(tx, access, user.id, { id: rejectedService, decision: "REJECTED", resolution: "Correção indeferida com fundamento municipal" }));
    const beforeRejectedIssue = (await db.select({ total: count() }).from(constructionIssuedDocuments))[0].total;
    await assert.rejects(issue(input("PERMIT", { documentRequestId: rejectedRequest.id })), /Pedido de correção ou renovação indisponível/);
    assert.equal((await db.select({ total: count() }).from(constructionIssuedDocuments))[0].total, beforeRejectedIssue);
    assert.equal((await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, rejectedRequest.id)))[0].status, "REJECTED");
    assert.equal((await issued(permitId)).status, "PUBLISHED");
    const change = async (sourceIssuedDocumentId: string, type: "CORRECTION" | "RENEWAL") => transaction((tx) => requestConstructionArtifactChange(tx, identity.id, { caseId: record.id, sourceIssuedDocumentId, type, reason: "Pedido demonstrativo de ajuste do documento", requestKey: randomUUID() }));
    const viabilityRequest = await change(viability, "CORRECTION");
    await assert.rejects(issue(input("VIABILITY", { documentRequestId: viabilityRequest })), /Taxa CORRECTION/);
    await rule("CORRECTION"); const viabilityFee = await exempt("CORRECTION", viabilityRequest);
    assert.equal((await db.select().from(constructionFees).where(eq(constructionFees.id, viabilityFee)))[0].cycleKey, `DOCUMENT_REQUEST:${viabilityRequest}`);
    const correctedViability = await issue(input("VIABILITY", { documentRequestId: viabilityRequest })); await signAndPublish(correctedViability);
    assert.equal((await issued(viability)).status, "SUPERSEDED");
    const correction = await change(permitId, "CORRECTION");
    await assert.rejects(issue(input("PERMIT", { documentRequestId: correction })), /Taxa CORRECTION/, "Original permit and another request's fee must not release this request");
    await exempt("CORRECTION", correction); const correctedPermit = await issue(input("PERMIT", { documentRequestId: correction, validUntil: "2027-12-31" }));
    assert.equal((await issued(permitId)).status, "PUBLISHED", "Source stays available while replacement is unsigned"); await signAndPublish(correctedPermit);
    const renewal = await change(correctedPermit, "RENEWAL"); await rule("RENEWAL"); await exempt("RENEWAL", renewal);
    await assert.rejects(issue(input("PERMIT", { documentRequestId: renewal, validUntil: "2027-12-31" })), /ampliar/);
    const renewedPermit = await issue(input("PERMIT", { documentRequestId: renewal, validUntil: "2028-12-31" })); await signAndPublish(renewedPermit);
    assert.equal((await issued(renewedPermit)).sequence, 3);
    assert.equal((await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, renewal)))[0].issuedDocumentId, renewedPermit);
    await assert.rejects(issue(input("OCCUPANCY")), /Taxa HABITE_SE/); await rule("HABITE_SE"); await exempt("HABITE_SE");
    await assert.rejects(issue(input("OCCUPANCY")), /conclusão/);
    const [completion] = await db.insert(constructionCompletions).values({ caseId: record.id, requestKey: randomUUID(), number: "DEMO-CONCLUSION-1", kind: "TOTAL", completedAt: new Date("2026-01-03T00:00:00Z"), area: new Decimal(100), cumulativeArea: new Decimal(100), remainingArea: new Decimal(0), notes: "Conclusão sintética", evidenceSnapshot: {}, debtSnapshot: {}, createdBy: user.id }).returning();
    await assert.rejects(issue(input("OCCUPANCY", { completionId: completion.id })), /início registrado/);
    const [inspectionType] = await db.insert(constructionCatalogEntries).values({ kind: "INSPECTION_TYPE", name: "Vistoria demonstrativa" }).returning();
    const [review] = await db.insert(constructionReviews).values({ caseId: record.id, requestKey: randomUUID(), revision: 0, reviewType: "PROJECT", decision: "APPROVED", notes: "Projeto sintético aprovado", definitionSnapshot: {}, evidenceSnapshot: {}, createdBy: user.id }).returning();
    await db.insert(constructionInspectionPlans).values({ caseId: record.id, requestKey: randomUUID(), reviewId: review.id, inspectionTypes: [{ id: inspectionType.id }], definitionSnapshot: {}, createdBy: user.id });
    await db.insert(constructionLifecycleStarts).values({ caseId: record.id, requestKey: randomUUID(), startedAt: new Date("2026-01-01T00:00:00Z"), notes: "Início sintético", evidenceSnapshot: {}, createdBy: user.id });
    await assert.rejects(issue(input("OCCUPANCY", { completionId: completion.id })), /vistorias/);
    await db.insert(constructionInspections).values({ caseId: record.id, sequence: 1, requestKey: randomUUID(), inspectionTypeId: inspectionType.id, requestedAt: new Date("2026-01-02T00:00:00Z"), inspectedAt: new Date("2026-01-02T00:00:00Z"), status: "APPROVED", requestNotes: "Vistoria sintética", definitionSnapshot: {}, evidenceSnapshot: {}, requestedBy: user.id, inspectedBy: user.id });
    const occupancy = await issue(input("OCCUPANCY", { completionId: completion.id }));
    const awaitingOccupancy = await issued(occupancy); assert.equal((await version(awaitingOccupancy.documentVersionId)).status, "PENDING_SIGNATURE", "Habite-se issuance automatically requests its required internal GED signature");
    const occupancyRow = await signAndPublish(occupancy);
    assert.equal((await db.select().from(constructionCompletions).where(eq(constructionCompletions.id, completion.id)))[0].occupancyDocumentId, occupancyRow.documentId);
    const projectBytes = await generateConstructionPdf({ title: "Projeto", body: "Original arquitetônico demonstrativo", stamp: "DEMO", validationCode: "project", demonstration: true }); const stored = await storeConstructionPdf(projectBytes, "project.pdf");
    const [project] = await db.insert(documents).values({ title: "Projeto arquitetônico", documentType: "Projeto", fileUrl: stored.fileUrl, status: "Válido" }).returning(); const [projectVersion] = await db.insert(documentVersions).values({ documentId: project.id, versionNumber: 1, fileUrl: stored.fileUrl, hashSha256: stored.hashSha256 }).returning(); await db.insert(processDocuments).values({ processId: licensingProcess.id, documentId: project.id });
    const annotationId = await createConstructionPdfRevision(context, access, { caseId: record.id, documentId: project.id, sourceVersionId: projectVersion.id, requestKey: randomUUID(), annotations: [{ kind: "NOTE", page: 1, x: 40, y: 200, width: 180, height: 50, text: "Revisar projeto" }] }, fixture.connection);
    const [annotation] = await db.select().from(constructionPdfAnnotations).where(eq(constructionPdfAnnotations.id, annotationId)); assert.equal(annotation.originalHash, stored.hashSha256); assert.notEqual(annotation.revisionHash, stored.hashSha256);
    assert.equal(constructionFileHash(await readFile(path.join(path.dirname(annotation.backupPath), `${annotation.originalHash}.pdf`))), stored.hashSha256); assert.equal((await version(projectVersion.id)).hashSha256, stored.hashSha256);
    const revisedProject = await version(annotation.revisionVersionId);
    const ordinary = await resolveConstructionComplementArtifact(db, record.id, project.id, revisedProject); assert.ok(ordinary?.bytes, "Ordinary annotated FINAL complement stays downloadable");
    const stampInput = { caseId: record.id, documentId: project.id, sourceVersionId: revisedProject.id, templateVersionId: templates.get("PERMIT")!, signerIds: [user.id, other.id], requestKey: randomUUID() };
    await assert.rejects(stampConstructionApprovedProject(context, { ...access, roles: ["ANALYST"] }, stampInput, fixture.connection), /gestor/);
    await assert.rejects(stampConstructionApprovedProject(context, access, stampInput, fixture.connection), /evidência/, "Free annotations are not approved-project evidence");
    const [stampReview] = await db.insert(constructionReviews).values({ caseId: record.id, requestKey: randomUUID(), revision: 0, reviewType: "PROJECT", decision: "APPROVED", notes: "Deferimento sintético da revisão anotada", definitionSnapshot: {}, evidenceSnapshot: { documentIds: { "Projeto": project.id }, documents: [{ id: project.id, versions: [{ id: revisedProject.id }] }] }, createdBy: user.id }).returning();
    const stampId = await stampConstructionApprovedProject(context, access, stampInput, fixture.connection); const stamp = (await getConstructionProjectStamp(db, stampId))!;
    assert.equal(stamp.reviewId, stampReview.id); assert.equal(stamp.originalHash, revisedProject.hashSha256); assert.notEqual(stamp.hashSha256, revisedProject.hashSha256); assert.equal((await version(stamp.documentVersionId)).status, "PENDING_SIGNATURE");
    assert.equal(constructionFileHash(await readFile(stamp.originalBackupPath)), revisedProject.hashSha256);
    await assert.rejects(assertConstructionProjectStampDownload(db, stamp), /aguarda/);
    const stampedVersion = await version(stamp.documentVersionId);
    await assert.rejects(resolveConstructionComplementArtifact(db, record.id, stamp.documentId, stampedVersion), /aguarda/, "Complement route helper cannot bypass pending stamp signatures");
    await assert.rejects(publishConstructionProjectStamp(context, access, stampId, fixture.connection), /assinaturas/);
    await registerRequestedInternalDocumentSignature(context, stamp.documentId, { ipAddress: null, userAgent: "PGlite" }, new Date()); await assert.rejects(publishConstructionProjectStamp(context, access, stampId, fixture.connection), /assinaturas/);
    await registerRequestedInternalDocumentSignature(secondContext, stamp.documentId, { ipAddress: null, userAgent: "PGlite" }, new Date()); await publishConstructionProjectStamp(context, access, stampId, fixture.connection);
    const publishedStamp = (await getConstructionProjectStamp(db, stampId))!; const stampedBytes = await assertConstructionProjectStampDownload(db, publishedStamp);
    const signedStampVersion = await version(stamp.documentVersionId); assert.ok(await resolveConstructionComplementArtifact(db, record.id, stamp.documentId, signedStampVersion));
    await assert.rejects(resolveConstructionComplementArtifact(db, record.id, stamp.documentId, { ...signedStampVersion, hashSha256: projectVersion.hashSha256 }), /não corresponde/, "Original PDF hash cannot authorize the stamped copy");
    assert.equal((await findPublicDocumentValidation(db, stamp.validationCode))?.signature.kind, "INTERNAL");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"); const pdfTask = getDocument({ data: new Uint8Array(stampedBytes), standardFontDataUrl: path.resolve("node_modules/pdfjs-dist/standard_fonts").replaceAll("\\", "/") + "/" }); const stampedPdf = await pdfTask.promise;
    try { const content = await (await stampedPdf.getPage(1)).getTextContent(); const text = content.items.map((item) => "str" in item ? item.str : "").join(" "); assert.match(text, /PROJETO APROVADO/); assert.match(text, /COPIA DERIVADA DEMONSTRATIVA/); assert.ok(text.includes((await issued(renewedPermit)).number)); assert.match(text, /Original arquitetônico demonstrativo/); } finally { await pdfTask.destroy(); }
    await assert.rejects(pg.query(`UPDATE "ConstructionProjectStamp" SET "hashSha256"='tampered' WHERE id=$1`, [stampId]), /immutable/);
    assert.equal((await db.select({ total: count() }).from(processes))[0].total, 1, "All licensing artifacts remain in the same Process"); assert.equal((await db.select({ total: count() }).from(constructionDocumentRequests).where(eq(constructionDocumentRequests.status, "FULFILLED")))[0].total, 3);
  } finally {
    if (previousDatabase === undefined) delete globalDatabase.celeriflowDatabase; else globalDatabase.celeriflowDatabase = previousDatabase;
    for (const [key, value] of Object.entries({ CELERIFLOW_INSTANCE_ID: originalEnvironment.instance, CONSTRUCTION_DOCUMENT_BACKUP_DIR: originalEnvironment.backup, BLOB_READ_WRITE_TOKEN: originalEnvironment.blob })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { await fixture.close(); } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
  }
});
