import { createHash } from "node:crypto";
import { and, desc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import * as f from "@/db/schema/construction-enforcement";
import { constructionCases, constructionCaseProperties } from "@/db/schema/construction-core";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies, documents, realEstates } from "@/db/schema/registry";
import { processes, processDocuments, processEvents } from "@/db/schema/processes";
import { documentVersions } from "@/db/schema/document-workflow";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { createValidatedProcess } from "@/lib/protocols/service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import type { ConstructionAccess } from "./construction-policy";
import { enforcementOpeningSchema, enforcementAssignmentSchema, enforcementVisitSchema, enforcementActSchema, enforcementAcknowledgementSchema, enforcementNextStatus } from "./construction-enforcement-policy";

type Actor = { id: string; access: ConstructionAccess };
type Replay = { id: string; createdBy: string; requestHash: string };
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function replay(existing: Replay | null | undefined, actor: Actor, input: unknown) {
  if (!existing) return null;
  if (existing.createdBy !== actor.id || existing.requestHash !== fingerprint(input)) throw new Error("Chave de operação reutilizada com outro autor ou conteúdo.");
  return existing.id;
}
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

async function eligibleInspector(tx: DatabaseTransaction, employeeId: string, departmentId: string) {
  const day = today();
  // Hold the designation/placement until this operation commits; revocation cannot race an act.
  const roles = await tx.execute<{ id: string }>(sql`
    SELECT r."id" FROM "ConstructionStaffRole" r
    JOIN "Employee" e ON e."id"=r."employeeId"
    JOIN "Department" d ON d."id"=r."departmentId"
    WHERE r."employeeId"=${employeeId} AND r."departmentId"=${departmentId}
      AND r."role"='INSPECTOR' AND r."isActive" AND e."isActive" AND d."isActive"
      AND e."departmentId"=${departmentId} AND r."startsAt"<=${day.toISOString().slice(0, 10)}::date
      AND (r."endsAt" IS NULL OR r."endsAt">=${day.toISOString().slice(0, 10)}::date)
    ORDER BY r."startsAt" DESC, r."id" LIMIT 1 FOR SHARE OF r,e,d`);
  const role = roles.rows[0];
  if (!role) throw new Error("Fiscal deve estar ativo e possuir designação vigente no setor do processo.");
  return role.id;
}
async function scopedCase(tx: DatabaseTransaction, actor: Actor, caseId: string) {
  if (!actor.access.administrator && (!actor.access.departmentId || !actor.access.roles.some(role => ["INSPECTOR", "MANAGER"].includes(role)))) return null;
  return (await tx.select({ ...getTableColumns(f.constructionEnforcementCases), process: { currentDepartmentId: processes.currentDepartmentId, completedAt: processes.completedAt, status: processes.status } }).from(f.constructionEnforcementCases).innerJoin(processes, eq(processes.id, f.constructionEnforcementCases.processId)).where(and(eq(f.constructionEnforcementCases.id, caseId), actor.access.administrator ? undefined : eq(processes.currentDepartmentId, actor.access.departmentId!))).limit(1))[0] ?? null;
}
async function lockCase(tx: DatabaseTransaction, actor: Actor, caseId: string) {
  await tx.execute(sql`SELECT "id" FROM "ConstructionEnforcementCase" WHERE "id"=${caseId} FOR UPDATE`);
  const item = await scopedCase(tx, actor, caseId);
  if (!item) throw new Error("Fiscalização indisponível no seu setor.");
  // Serialize with protocol movements/archiving and re-read the current scope.
  await tx.execute(sql`SELECT "id" FROM "Process" WHERE "id"=${item.processId} FOR UPDATE`);
  const current = await scopedCase(tx, actor, caseId);
  if (!current) throw new Error("O setor do processo mudou. Atualize a página.");
  return current;
}
type LockedCase = Awaited<ReturnType<typeof lockCase>>;
function assertActive(item: LockedCase, revision: number) {
  if (item.revision !== revision) throw new Error("O processo fiscal mudou. Atualize a página antes de registrar.");
  if (!item.process.currentDepartmentId || item.process.completedAt || ["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(item.process.status)) throw new Error("Receba o protocolo e mantenha-o ativo antes de registrar fiscalização.");
}
async function assertAuthor(tx: DatabaseTransaction, actor: Actor, item: LockedCase) {
  if (!actor.access.employeeId || item.assignedEmployeeId !== actor.access.employeeId) throw new Error("Registro reservado ao fiscal designado neste processo.");
  return eligibleInspector(tx, actor.access.employeeId, item.process.currentDepartmentId!);
}
async function history(tx: DatabaseTransaction, actor: Actor, item: { id: string; processId: string }, eventType: string, description: string, targetId: string, departmentId: string | null) {
  await tx.insert(processEvents).values({ processId: item.processId, eventType, description, departmentId, employeeId: actor.access.employeeId, metadata: JSON.stringify({ enforcementCaseId: item.id, targetId, actorId: actor.id, demonstration: true }) });
  await writeAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionEnforcementCase", targetId: item.id });
}
async function evidenceSnapshots(tx: DatabaseTransaction, processId: string, entries: { documentId: string; kind: string }[]) {
  const result: { documentId: string; kind: string; versionSnapshot: JsonValue }[] = [];
  for (const entry of entries) {
    const [document] = await tx.select({ id: documents.id, title: documents.title, documentType: documents.documentType, status: documents.status, validUntil: documents.validUntil }).from(processDocuments).innerJoin(documents, eq(documents.id, processDocuments.documentId)).where(and(eq(processDocuments.processId, processId), eq(processDocuments.documentId, entry.documentId))).limit(1);
    const version = document ? (await tx.select({ id: documentVersions.id, versionNumber: documentVersions.versionNumber, hashSha256: documentVersions.hashSha256, status: documentVersions.status, fileUrl: documentVersions.fileUrl }).from(documentVersions).where(eq(documentVersions.documentId, document.id)).orderBy(desc(documentVersions.versionNumber)).limit(1))[0] : null;
    if (!document || !version || !["FINAL", "SIGNED"].includes(version.status) || !version.hashSha256 || !["Válido", "Valido", "VÃ¡lido", "Assinado"].includes(document.status) || (document.validUntil && document.validUntil < new Date())) throw new Error("Evidência exige documento vinculado ao processo e versão GED atual válida/finalizada.");
    if (entry.kind === "PHOTO" && !/\.(jpe?g|png|webp|gif|heic)(?:[?#]|$)/i.test(version.fileUrl)) throw new Error("Evidência fotográfica exige arquivo de imagem no GED (JPEG, PNG, WEBP, GIF ou HEIC).");
    result.push({ ...entry, versionSnapshot: { documentId: document.id, title: document.title, documentType: document.documentType, versionId: version.id, versionNumber: version.versionNumber, hashSha256: version.hashSha256, fileUrl: version.fileUrl } });
  }
  return result;
}

export async function openConstructionEnforcement(tx: DatabaseTransaction, actor: Actor, input: unknown) {
  const data = enforcementOpeningSchema.parse(input);
  if (!actor.access.administrator && !actor.access.roles.some((role) => ["INSPECTOR", "MANAGER"].includes(role))) throw new Error("Abertura exige fiscal ou gestor urbanístico vigente.");
  if (!actor.access.employeeId) throw new Error("Vincule o usuário a um servidor para protocolar.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ENFORCEMENT_OPEN:${data.requestKey}`}))`);
  const existing = replay((await tx.select().from(f.constructionEnforcementCases).where(eq(f.constructionEnforcementCases.requestKey, data.requestKey)).limit(1))[0], actor, data);
  if (existing) {
    await lockCase(tx, actor, existing);
    return existing;
  }
  const [employee] = await tx.select({ id: employees.id, departmentId: employees.departmentId }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, actor.access.employeeId), eq(employees.isActive, true), eq(departments.isActive, true))).limit(1);
  if (!employee?.departmentId) throw new Error("Servidor sem lotação ativa.");
  const [property] = await tx.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, registration: realEstates.registration, streetName: realEstates.streetName, number: realEstates.number, lot: realEstates.lot, block: realEstates.block, landArea: realEstates.landArea, builtArea: realEstates.builtArea }).from(realEstates).where(eq(realEstates.id, data.realEstateId)).limit(1);
  if (!property) throw new Error("Imóvel cadastral indisponível.");
  if (data.personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.personId), eq(people.status, "Ativo"))).limit(1)).length) throw new Error("Pessoa interessada indisponível.");
  if (data.companyId && !(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.status, "Ativo"))).limit(1)).length) throw new Error("Empresa interessada indisponível.");
  if (data.permitCaseId && !(await tx.select({ id: constructionCases.id }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(and(eq(constructionCases.id, data.permitCaseId), eq(constructionCases.category, "BUILDING"), exists(tx.select({ id: constructionCaseProperties.id }).from(constructionCaseProperties).where(and(eq(constructionCaseProperties.caseId, constructionCases.id), eq(constructionCaseProperties.realEstateId, property.id)))), actor.access.administrator ? undefined : actor.access.departmentId ? eq(processes.currentDepartmentId, actor.access.departmentId) : isNull(processes.currentDepartmentId))).limit(1)).length) throw new Error("Processo de obra não corresponde ao imóvel/setor. O vínculo não comprova alvará emitido.");
  const process = await createValidatedProcess(tx, employee, actor.id, { processTypeId: data.processTypeId, subjectId: data.subjectId, initialDepartmentId: employee.departmentId, personId: data.personId || null, companyId: data.companyId || null, description: `[DEMONSTRATIVO — fiscalização edilícia/posturas] ${data.reason}` });
  const [scope] = await tx.select({ currentDepartmentId: processes.currentDepartmentId }).from(processes).where(eq(processes.id, process.id)).limit(1);
  if (!scope) throw new Error("Process não encontrado.");
  if (!actor.access.administrator && scope.currentDepartmentId !== actor.access.departmentId) throw new Error("Selecione assunto de fiscalização destinado ao seu setor.");
  const [item] = await tx.insert(f.constructionEnforcementCases).values({ requestKey: data.requestKey, requestHash: fingerprint(data), processId: process.id, realEstateId: property.id, permitCaseId: data.permitCaseId || null, permitStatus: data.permitStatus, locationType: data.locationType, reason: data.reason, cadastralSnapshot: property, createdBy: actor.id }).returning();
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_OPENED", data.reason, item.id, scope.currentDepartmentId);
  return item.id;
}

export async function assignConstructionEnforcement(tx: DatabaseTransaction, actor: Actor, input: unknown) {
  const data = enforcementAssignmentSchema.parse(input);
  if (!actor.access.administrator && !actor.access.roles.includes("MANAGER")) throw new Error("Designação reservada ao gestor urbanístico.");
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay((await tx.select().from(f.constructionEnforcementAssignments).where(eq(f.constructionEnforcementAssignments.requestKey, data.requestKey)).limit(1))[0], actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const departmentId = item.process.currentDepartmentId!;
  const staffRoleId = await eligibleInspector(tx, data.employeeId, departmentId);
  if (item.assignedEmployeeId === data.employeeId) throw new Error("O fiscal já está designado.");
  const [record] = await tx.insert(f.constructionEnforcementAssignments).values({ caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), previousEmployeeId: item.assignedEmployeeId, employeeId: data.employeeId, departmentId, staffRoleId, reason: data.reason, createdBy: actor.id }).returning();
  await tx.update(f.constructionEnforcementCases).set({ assignedEmployeeId: data.employeeId, revision: sql`${f.constructionEnforcementCases.revision} + 1` }).where(eq(f.constructionEnforcementCases.id, item.id));
  await tx.update(processes).set({ currentResponsibleEmployeeId: data.employeeId }).where(eq(processes.id, item.processId));
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_ASSIGNED", data.reason, record.id, departmentId);
  return record.id;
}

export async function recordConstructionEnforcementVisit(tx: DatabaseTransaction, actor: Actor, input: unknown) {
  const data = enforcementVisitSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay((await tx.select().from(f.constructionEnforcementVisits).where(eq(f.constructionEnforcementVisits.requestKey, data.requestKey)).limit(1))[0], actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const staffRoleId = await assertAuthor(tx, actor, item);
  if (new Date(data.visitedAt) > new Date()) throw new Error("Diligência não pode estar no futuro.");
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const [record] = await tx.insert(f.constructionEnforcementVisits).values({ caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), visitedAt: new Date(data.visitedAt), findings: data.findings, employeeId: actor.access.employeeId!, departmentId: item.process.currentDepartmentId!, staffRoleId, createdBy: actor.id }).returning();
  if (evidence.length) await tx.insert(f.constructionEnforcementEvidence).values(evidence.map(entry => ({ ...entry, visitId: record.id })));
  await tx.update(f.constructionEnforcementCases).set({ revision: sql`${f.constructionEnforcementCases.revision} + 1` }).where(eq(f.constructionEnforcementCases.id, item.id));
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_VISIT", data.findings, record.id, item.process.currentDepartmentId);
  return record.id;
}

export async function issueConstructionEnforcementAct(tx: DatabaseTransaction, actor: Actor, input: unknown) {
  const data = enforcementActSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay((await tx.select().from(f.constructionEnforcementActs).where(eq(f.constructionEnforcementActs.requestKey, data.requestKey)).limit(1))[0], actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const staffRoleId = await assertAuthor(tx, actor, item);
  const status = enforcementNextStatus(item.status, data.kind);
  const issuedAt = new Date(data.issuedAt);
  if (issuedAt > new Date()) throw new Error("Emissão não pode estar no futuro.");
  const [latest] = await tx.select({ issuedAt: f.constructionEnforcementActs.issuedAt }).from(f.constructionEnforcementActs).where(eq(f.constructionEnforcementActs.caseId, item.id)).orderBy(desc(f.constructionEnforcementActs.issuedAt)).limit(1);
  if (latest && latest.issuedAt > issuedAt) throw new Error("A emissão deve preservar a ordem cronológica dos atos deste processo.");
  if (data.visitId) {
    const [visit] = await tx.select({ visitedAt: f.constructionEnforcementVisits.visitedAt }).from(f.constructionEnforcementVisits).where(and(eq(f.constructionEnforcementVisits.id, data.visitId), eq(f.constructionEnforcementVisits.caseId, item.id))).limit(1);
    if (!visit || visit.visitedAt > issuedAt) throw new Error("Selecione diligência deste processo anterior à emissão.");
  }
  if (data.relatedActId) {
    const [related] = await tx.select({ issuedAt: f.constructionEnforcementActs.issuedAt, kind: f.constructionEnforcementActs.kind }).from(f.constructionEnforcementActs).where(and(eq(f.constructionEnforcementActs.id, data.relatedActId), eq(f.constructionEnforcementActs.caseId, item.id))).limit(1);
    const relatedActs = related ? await tx.select({ id: f.constructionEnforcementActs.id }).from(f.constructionEnforcementActs).where(and(eq(f.constructionEnforcementActs.relatedActId, data.relatedActId), eq(f.constructionEnforcementActs.kind, "LIFT_EMBARGO"))) : [];
    if (!related || related.issuedAt > issuedAt) throw new Error("Ato relacionado deve pertencer ao processo e ser anterior à emissão.");
    if (data.kind === "LIFT_EMBARGO" && (related.kind !== "EMBARGO" || relatedActs.length)) throw new Error("Selecione embargo vigente deste processo.");
  }
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const year = issuedAt.getUTCFullYear();
  const [sequence] = await tx.insert(f.constructionEnforcementSequences).values({ year, kind: data.kind, nextNumber: 2 }).onConflictDoUpdate({ target: [f.constructionEnforcementSequences.year, f.constructionEnforcementSequences.kind], set: { nextNumber: sql`${f.constructionEnforcementSequences.nextNumber} + 1` } }).returning();
  const number = `DEMO-FISC-${year}-${data.kind}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
  const [record] = await tx.insert(f.constructionEnforcementActs).values({ caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), number, kind: data.kind, visitId: data.visitId || null, relatedActId: data.relatedActId || null, reason: data.reason, legalBasis: data.legalBasis, issuedAt, deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null, employeeId: actor.access.employeeId!, departmentId: item.process.currentDepartmentId!, staffRoleId, createdBy: actor.id }).returning();
  if (evidence.length) await tx.insert(f.constructionEnforcementEvidence).values(evidence.map(entry => ({ ...entry, actId: record.id })));
  await tx.update(f.constructionEnforcementCases).set({ status, revision: sql`${f.constructionEnforcementCases.revision} + 1` }).where(eq(f.constructionEnforcementCases.id, item.id));
  await history(tx, actor, item, `CONSTRUCTION_ENFORCEMENT_${data.kind}`, `${number}: ${data.reason}`, record.id, item.process.currentDepartmentId);
  return record.id;
}

export async function acknowledgeConstructionEnforcementAct(tx: DatabaseTransaction, actor: Actor, input: unknown) {
  const data = enforcementAcknowledgementSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay((await tx.select().from(f.constructionEnforcementAcknowledgements).where(eq(f.constructionEnforcementAcknowledgements.requestKey, data.requestKey)).limit(1))[0], actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  await assertAuthor(tx, actor, item);
  const [act] = await tx.select({ issuedAt: f.constructionEnforcementActs.issuedAt, number: f.constructionEnforcementActs.number }).from(f.constructionEnforcementActs).where(and(eq(f.constructionEnforcementActs.id, data.actId), eq(f.constructionEnforcementActs.caseId, item.id))).limit(1);
  const acknowledgedAt = new Date(data.acknowledgedAt);
  if (!act || acknowledgedAt < act.issuedAt || acknowledgedAt > new Date()) throw new Error("Ciência deve ser posterior à emissão e não pode estar no futuro.");
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const [record] = await tx.insert(f.constructionEnforcementAcknowledgements).values({ actId: data.actId, requestKey: data.requestKey, requestHash: fingerprint(data), acknowledgedAt, method: data.method, recipient: data.recipient, notes: data.notes, createdBy: actor.id }).returning();
  if (evidence.length) await tx.insert(f.constructionEnforcementEvidence).values(evidence.map(entry => ({ ...entry, acknowledgementId: record.id })));
  await tx.update(f.constructionEnforcementCases).set({ revision: sql`${f.constructionEnforcementCases.revision} + 1` }).where(eq(f.constructionEnforcementCases.id, item.id));
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_ACKNOWLEDGED", `Ciência de ${act.number}: ${data.notes}`, record.id, item.process.currentDepartmentId);
  return record.id;
}
