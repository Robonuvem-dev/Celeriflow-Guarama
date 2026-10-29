import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import * as core from "@/db/schema/construction-core";
import * as construction from "@/db/schema/construction-documents";
import * as ged from "@/db/schema/document-workflow";
import * as portal from "@/db/schema/construction-portal";
import { people } from "@/db/schema/people";
import { companies, documents } from "@/db/schema/registry";
import { processes, processDocuments, processEvents } from "@/db/schema/processes";
import { users, accessProfiles, modules, userModulePermissions } from "@/db/schema/identity";
import { internalNotifications } from "@/db/schema/notifications";
import { auditEvents } from "@/db/schema/audit";
import { findActiveConstructionPortalIdentity, findConstructionCaseForAccess, findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { createAssetsFixture } from "@/lib/patrimonio/__tests__/drizzle-fixture";
import type { AppContext } from "@/lib/platform/tenant-context";
import { Decimal } from "@/db/decimal";
import { assertConstructionGedSignature } from "../construction-documents-service";
import { assertConstructionProjectStampDownload, findConstructionProjectStampByFile, getConstructionProjectStamp, listConstructionProjectStamps, publishConstructionProjectStamp, stampConstructionApprovedProject } from "../construction-project-stamp";
import { resolveConstructionComplementArtifact } from "../construction-document-downloads";
import { generateConstructionPdf } from "../construction-documents-policy";
import { storeConstructionPdf } from "../construction-document-storage";
import { appendConstructionMessage } from "../construction-conversation";
import { notifyConstructionMessageDepartment } from "../construction-message-notifications";

test("Construção: habilitação vigente, ACL, carimbo transacional e download da versão assinada exata", { timeout: 60000 }, async () => {
  const fixture = await createAssetsFixture([...Object.values(core), ...Object.values(construction), ...Object.values(ged), ...Object.values(portal), people, companies, documents, processes, processDocuments, processEvents, users, accessProfiles, modules, userModulePermissions, internalNotifications]);
  const temporary = await mkdtemp(path.join(process.env.LOCALAPPDATA || process.cwd(), "Temp", "opencode", "construction-drizzle-"));
  const previous = { instance: process.env.CELERIFLOW_INSTANCE_ID, backup: process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR, blob: process.env.BLOB_READ_WRITE_TOKEN };
  process.env.CELERIFLOW_INSTANCE_ID = "construction-drizzle-test"; process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR = temporary; delete process.env.BLOB_READ_WRITE_TOKEN;
  const db = fixture.connection.db;
  try {
    await db.insert(people).values({ id: "person", fullName: "Profissional", cpf: "00000000191" });
    await db.insert(core.constructionProfessionals).values({ id: "professional", personId: "person", professionalType: "ENGINEER", council: "CREA", registration: "TEST", startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: new Date("2026-10-28T00:00:00Z") });
    await db.insert(core.constructionPortalIdentities).values({ id: "identity", firebaseUid: "uid", email: "professional@example.invalid", professionalId: "professional", createdBy: "actor" });
    const principal = { firebaseUid: "uid", email: "professional@example.invalid" };
    assert.deepEqual(await findActiveConstructionPortalIdentity(db, principal, new Date("2026-10-28T00:00:00Z")), { id: "identity", professionalId: "professional", professional: { professionalType: "ENGINEER", person: { fullName: "Profissional" } } });
    assert.equal(await findActiveConstructionPortalIdentity(db, principal, new Date("2026-10-29T00:00:00Z")), null);
    assert.equal(await findActiveConstructionPortalIdentity(db, { ...principal, email: "other@example.invalid" }, new Date("2026-10-28T00:00:00Z")), null);
    await db.update(people).set({ status: "Inativo" }).where(eq(people.id, "person"));
    assert.equal(await findActiveConstructionPortalIdentity(db, principal, new Date("2026-10-28T00:00:00Z")), null);
    await db.update(people).set({ status: "Ativo" }).where(eq(people.id, "person"));
    await db.insert(processes).values({ id: "process", protocolNumber: "CIV/2026/1", processTypeId: "type", subjectId: "subject", status: "Em Análise", currentDepartmentId: "department", personId: "person" });
    await db.insert(core.constructionCases).values({ id: "case", requestKey: randomUUID(), processId: "process", configurationId: "config", category: "BUILDING", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal("0"), expandedArea: new Decimal("100.0001"), irregularArea: new Decimal("0"), renovationArea: new Decimal("0"), demolitionArea: new Decimal("0"), totalArea: new Decimal("100.0001"), calculationSnapshot: {}, createdBy: "actor", reviewStatus: "APPROVED" });
    await db.insert(core.constructionParticipants).values({ caseId: "case", identityId: "identity", role: "TECHNICAL", reason: "Vínculo", createdBy: "actor", startsAt: new Date("2030-01-01T00:00:00Z") });
    assert.ok(await findConstructionCaseForPortal(db, "case", "identity"), "ACL legado não filtra startsAt");
    assert.equal(await findConstructionCaseForPortal(db, "case", "other"), null);
    const access = { administrator: false, employeeId: "employee", departmentId: "department", roles: ["MANAGER"] };
    assert.equal(await findConstructionCaseForAccess(db, "case", { ...access, departmentId: "other" }), null);
    assert.equal(await findConstructionCaseForAccess(db, "case", { ...access, roles: [] }), null);
    const context: AppContext = { user: {
      id: "actor", firebaseUid: "actor-uid", email: "actor@example.invalid", name: "Gestor",
      role: "Gestor", profileCode: "CONSTRUCTION_TEST", permissions: "{}",
      modulePermissions: [{ code: "OBRAS", canView: true, canEdit: true }], allowedBudgetUnitIds: [],
      employeeId: "employee", departmentId: "department", secretariatId: null,
    } };
    await fixture.pg.exec(`INSERT INTO "Department" (id,name) VALUES ('department','Engenharia'); INSERT INTO "Employee" (id,"departmentId") VALUES ('employee','department');`);
    await db.insert(accessProfiles).values({ id: "profile", codigo: "CONSTRUCTION_TEST", nome: "Gestor", permissoes: "{}" });
    await db.insert(users).values({ id: "actor", nome: "Gestor", email: "actor@example.invalid", perfilId: "profile", employeeId: "employee" });
    await db.insert(modules).values({ id: "obras", codigo: "OBRAS", nome: "Obras" });
    await db.insert(userModulePermissions).values({ usuarioId: "actor", moduloId: "obras", canView: true, canEdit: true });
    await db.insert(portal.constructionStaffRoles).values({ employeeId: "employee", departmentId: "department", role: "MANAGER", startsAt: new Date("2020-01-01T00:00:00Z") });
    const communication = { caseId: "case", requestKey: randomUUID(), content: "Complementação profissional" };
    await assert.rejects(withDatabaseTransaction(fixture.connection, tx => appendConstructionMessage(tx, { identityId: "identity" }, communication)), /Aceite o termo/);
    await db.insert(portal.constructionTerms).values({ id: "term", version: 1, text: "Responsabilidade", publishedBy: "actor" });
    await db.insert(portal.constructionTermAcceptances).values({ caseId: "case", identityId: "identity", termId: "term" });
    const messageId = await withDatabaseTransaction(fixture.connection, async tx => { const id = await appendConstructionMessage(tx, { identityId: "identity" }, communication); await notifyConstructionMessageDepartment(tx, "case", id); await notifyConstructionMessageDepartment(tx, "case", id); return id; });
    assert.equal(await withDatabaseTransaction(fixture.connection, tx => appendConstructionMessage(tx, { identityId: "identity" }, communication)), messageId);
    assert.equal((await db.select().from(internalNotifications)).length, 1, "destinatário vigente recebe uma notificação deduplicada");
    await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => { const id = await appendConstructionMessage(tx, { identityId: "identity" }, { ...communication, requestKey: randomUUID() }); await notifyConstructionMessageDepartment(tx, "case", id); throw new Error("rollback comunicação"); }), /rollback comunicação/);
    assert.equal((await db.select().from(portal.constructionMessages)).length, 1); assert.equal((await db.select().from(internalNotifications)).length, 1);
    const sourcePdf = await storeConstructionPdf(await generateConstructionPdf({ title: "Projeto original", body: "Projeto para deferimento", stamp: "Teste", validationCode: "test", demonstration: true }), "original.pdf");
    await db.insert(documents).values({ id: "source-document", title: "Projeto", documentType: "Projeto", fileUrl: sourcePdf.fileUrl, status: "Válido" });
    await db.insert(ged.documentVersions).values({ id: "source-version", documentId: "source-document", versionNumber: 1, fileUrl: sourcePdf.fileUrl, hashSha256: sourcePdf.hashSha256 });
    await db.insert(processDocuments).values({ processId: "process", documentId: "source-document" });
    await db.insert(core.constructionReviews).values({ id: "review", caseId: "case", requestKey: randomUUID(), revision: 0, reviewType: "PROJECT", decision: "APPROVED", notes: "Deferido", definitionSnapshot: {}, evidenceSnapshot: { documents: [{ id: "source-document", versions: [{ id: "source-version" }] }] }, createdBy: "actor", createdAt: new Date("2026-10-28T03:04:05.678Z") });
    await db.insert(construction.constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará", body: "Projeto {{protocol}}", stamp: "Área {{totalArea}}", signaturePolicy: "INTERNAL_ALLOWED", createdBy: "actor" });
    const input = { caseId: "case", documentId: "source-document", sourceVersionId: "source-version", templateVersionId: "template", requestKey: randomUUID(), signerIds: ["actor", "actor"] };
    await assert.rejects(stampConstructionApprovedProject(context, { ...access, departmentId: "other" }, input, fixture.connection), /indisponível/);
    const id = await stampConstructionApprovedProject(context, access, input, fixture.connection);
    const row = (await getConstructionProjectStamp(db, id))!;
    assert.equal(await stampConstructionApprovedProject(context, access, input, fixture.connection), id, "replay não cria nova cópia nem reenvia assinatura");
    assert.ok(row.createdAt instanceof Date); assert.equal(row.publishedAt, null);
    assert.deepEqual((row.stampSnapshot as { signerIds: string[] }).signerIds, ["actor"]);
    assert.equal((await findConstructionProjectStampByFile(db, row.fileUrl))?.id, id);
    assert.equal(await findConstructionProjectStampByFile(db, "construction-local:unknown"), null);
    assert.equal((await listConstructionProjectStamps(db, "case")).length, 1);
    await assert.rejects(assertConstructionProjectStampDownload(db, row), /aguarda assinaturas/);
    await assert.rejects(publishConstructionProjectStamp(context, access, id, fixture.connection), /assinaturas/);
    await db.update(ged.documentVersions).set({ status: "SIGNED" }).where(eq(ged.documentVersions.id, row.documentVersionId));
    await db.update(ged.documentSignatures).set({ status: "SIGNED", signedAt: new Date() }).where(eq(ged.documentSignatures.documentVersionId, row.documentVersionId));
    await withDatabaseTransaction(fixture.connection, async tx => { assert.equal((await assertConstructionGedSignature(tx, row.documentVersionId)).documentId, row.documentId); });
    await db.update(core.constructionCases).set({ revisionCount: 1 }).where(eq(core.constructionCases.id, "case"));
    await assert.rejects(publishConstructionProjectStamp(context, access, id, fixture.connection), /não está mais vigente/);
    await db.update(core.constructionCases).set({ revisionCount: 0 }).where(eq(core.constructionCases.id, "case"));
    await publishConstructionProjectStamp(context, access, id, fixture.connection);
    const published = (await getConstructionProjectStamp(db, id))!;
    assert.ok(published.publishedAt instanceof Date);
    assert.ok((await assertConstructionProjectStampDownload(db, published)).length > 0);
    await assert.rejects(assertConstructionProjectStampDownload(db, { ...published, documentId: "wrong" }), /diverge/);
    await assert.rejects(resolveConstructionComplementArtifact(db, "other", row.documentId, { id: row.documentVersionId, status: "SIGNED", hashSha256: row.hashSha256, fileUrl: row.fileUrl }), /não corresponde/);
    await db.update(ged.documentSignatures).set({ documentHash: "wrong" }).where(eq(ged.documentSignatures.documentVersionId, row.documentVersionId));
    await assert.rejects(assertConstructionGedSignature(db, row.documentVersionId), /assinaturas/);
    await db.update(ged.documentSignatures).set({ documentHash: row.hashSha256 }).where(eq(ged.documentSignatures.documentVersionId, row.documentVersionId));
    await writeFile(path.join(temporary, "construction-drizzle-test", `${row.hashSha256}.pdf`), "corrupted");
    await assert.rejects(assertConstructionProjectStampDownload(db, published), /diverge/);
    assert.equal((await db.select().from(auditEvents)).length, 3, "ingestão, solicitação de assinatura e publicação na trilha");
  } finally {
    for (const [key, value] of [["CELERIFLOW_INSTANCE_ID", previous.instance], ["CONSTRUCTION_DOCUMENT_BACKUP_DIR", previous.backup], ["BLOB_READ_WRITE_TOKEN", previous.blob]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await fixture.close(); await rm(temporary, { recursive: true, force: true });
  }
});
