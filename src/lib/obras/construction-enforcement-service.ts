import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { createValidatedProcess } from "@/lib/protocols/service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import type { ConstructionAccess } from "./construction-policy";
import { enforcementOpeningSchema, enforcementAssignmentSchema, enforcementVisitSchema, enforcementActSchema, enforcementAcknowledgementSchema, enforcementCaseWhere, enforcementNextStatus } from "./construction-enforcement-policy";

type Actor = { id: string; access: ConstructionAccess };
type Replay = { id: string; createdBy: string; requestHash: string };
const fingerprint = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function replay(existing: Replay | null, actor: Actor, input: unknown) {
  if (!existing) return null;
  if (existing.createdBy !== actor.id || existing.requestHash !== fingerprint(input)) throw new Error("Chave de operação reutilizada com outro autor ou conteúdo.");
  return existing.id;
}
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

async function eligibleInspector(tx: Prisma.TransactionClient, employeeId: string, departmentId: string) {
  const day = today();
  // Hold the designation/placement until this operation commits; revocation cannot race an act.
  const roles = await tx.$queryRaw<{ id: string }[]>`
    SELECT r."id" FROM "ConstructionStaffRole" r
    JOIN "Employee" e ON e."id"=r."employeeId"
    JOIN "Department" d ON d."id"=r."departmentId"
    WHERE r."employeeId"=${employeeId} AND r."departmentId"=${departmentId}
      AND r."role"='INSPECTOR' AND r."isActive" AND e."isActive" AND d."isActive"
      AND e."departmentId"=${departmentId} AND r."startsAt"<=${day}
      AND (r."endsAt" IS NULL OR r."endsAt">=${day})
    ORDER BY r."startsAt" DESC, r."id" LIMIT 1 FOR SHARE OF r,e,d`;
  const role = roles[0];
  if (!role) throw new Error("Fiscal deve estar ativo e possuir designação vigente no setor do processo.");
  return role.id;
}
async function lockCase(tx: Prisma.TransactionClient, actor: Actor, caseId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionEnforcementCase" WHERE "id"=${caseId} FOR UPDATE`;
  const item = await tx.constructionEnforcementCase.findFirst({ where: { AND: [{ id: caseId }, enforcementCaseWhere(actor.access)] }, include: { process: { select: { currentDepartmentId: true, completedAt: true, status: true } } } });
  if (!item) throw new Error("Fiscalização indisponível no seu setor.");
  // Serialize with protocol movements/archiving and re-read the current scope.
  await tx.$queryRaw`SELECT "id" FROM "Process" WHERE "id"=${item.processId} FOR UPDATE`;
  const current = await tx.constructionEnforcementCase.findFirst({ where: { AND: [{ id: caseId }, enforcementCaseWhere(actor.access)] }, include: { process: { select: { currentDepartmentId: true, completedAt: true, status: true } } } });
  if (!current) throw new Error("O setor do processo mudou. Atualize a página.");
  return current;
}
type LockedCase = Awaited<ReturnType<typeof lockCase>>;
function assertActive(item: LockedCase, revision: number) {
  if (item.revision !== revision) throw new Error("O processo fiscal mudou. Atualize a página antes de registrar.");
  if (!item.process.currentDepartmentId || item.process.completedAt || ["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(item.process.status)) throw new Error("Receba o protocolo e mantenha-o ativo antes de registrar fiscalização.");
}
async function assertAuthor(tx: Prisma.TransactionClient, actor: Actor, item: LockedCase) {
  if (!actor.access.employeeId || item.assignedEmployeeId !== actor.access.employeeId) throw new Error("Registro reservado ao fiscal designado neste processo.");
  return eligibleInspector(tx, actor.access.employeeId, item.process.currentDepartmentId!);
}
async function history(tx: Prisma.TransactionClient, actor: Actor, item: { id: string; processId: string }, eventType: string, description: string, targetId: string, departmentId: string | null) {
  await tx.processEvent.create({ data: { processId: item.processId, eventType, description, departmentId, employeeId: actor.access.employeeId, metadata: JSON.stringify({ enforcementCaseId: item.id, targetId, actorId: actor.id, demonstration: true }) } });
  await writeAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionEnforcementCase", targetId: item.id });
}
async function evidenceSnapshots(tx: Prisma.TransactionClient, processId: string, entries: { documentId: string; kind: string }[]) {
  const result: { documentId: string; kind: string; versionSnapshot: Prisma.InputJsonValue }[] = [];
  for (const entry of entries) {
    const link = await tx.processDocument.findFirst({ where: { processId, documentId: entry.documentId }, select: { document: { select: { id: true, title: true, documentType: true, status: true, validUntil: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, hashSha256: true, status: true, fileUrl: true } } } } } });
    const document = link?.document;
    const version = document?.versions[0];
    if (!document || !version || !["FINAL", "SIGNED"].includes(version.status) || !version.hashSha256 || !["Válido", "Valido", "VÃ¡lido", "Assinado"].includes(document.status) || (document.validUntil && document.validUntil < new Date())) throw new Error("Evidência exige documento vinculado ao processo e versão GED atual válida/finalizada.");
    if (entry.kind === "PHOTO" && !/\.(jpe?g|png|webp|gif|heic)(?:[?#]|$)/i.test(version.fileUrl)) throw new Error("Evidência fotográfica exige arquivo de imagem no GED (JPEG, PNG, WEBP, GIF ou HEIC).");
    result.push({ ...entry, versionSnapshot: { documentId: document.id, title: document.title, documentType: document.documentType, versionId: version.id, versionNumber: version.versionNumber, hashSha256: version.hashSha256, fileUrl: version.fileUrl } });
  }
  return result;
}

export async function openConstructionEnforcement(tx: Prisma.TransactionClient, actor: Actor, input: unknown) {
  const data = enforcementOpeningSchema.parse(input);
  if (!actor.access.administrator && !actor.access.roles.some((role) => ["INSPECTOR", "MANAGER"].includes(role))) throw new Error("Abertura exige fiscal ou gestor urbanístico vigente.");
  if (!actor.access.employeeId) throw new Error("Vincule o usuário a um servidor para protocolar.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ENFORCEMENT_OPEN:${data.requestKey}`}))`;
  const existing = replay(await tx.constructionEnforcementCase.findUnique({ where: { requestKey: data.requestKey } }), actor, data);
  if (existing) {
    await lockCase(tx, actor, existing);
    return existing;
  }
  const employee = await tx.employee.findFirst({ where: { id: actor.access.employeeId, isActive: true, department: { isActive: true } }, select: { id: true, departmentId: true } });
  if (!employee?.departmentId) throw new Error("Servidor sem lotação ativa.");
  const property = await tx.realEstate.findUnique({ where: { id: data.realEstateId }, select: { id: true, municipalInsc: true, registration: true, streetName: true, number: true, lot: true, block: true, landArea: true, builtArea: true } });
  if (!property) throw new Error("Imóvel cadastral indisponível.");
  if (data.personId && !await tx.person.findFirst({ where: { id: data.personId, status: "Ativo" }, select: { id: true } })) throw new Error("Pessoa interessada indisponível.");
  if (data.companyId && !await tx.company.findFirst({ where: { id: data.companyId, status: "Ativo" }, select: { id: true } })) throw new Error("Empresa interessada indisponível.");
  if (data.permitCaseId && !await tx.constructionCase.findFirst({ where: { id: data.permitCaseId, category: "BUILDING", properties: { some: { realEstateId: property.id } }, ...(actor.access.administrator ? {} : { process: { currentDepartmentId: actor.access.departmentId } }) }, select: { id: true } })) throw new Error("Processo de obra não corresponde ao imóvel/setor. O vínculo não comprova alvará emitido.");
  const process = await createValidatedProcess(tx, employee, actor.id, { processTypeId: data.processTypeId, subjectId: data.subjectId, initialDepartmentId: employee.departmentId, personId: data.personId || null, companyId: data.companyId || null, description: `[DEMONSTRATIVO — fiscalização edilícia/posturas] ${data.reason}` });
  const scope = await tx.process.findUniqueOrThrow({ where: { id: process.id }, select: { currentDepartmentId: true } });
  if (!actor.access.administrator && scope.currentDepartmentId !== actor.access.departmentId) throw new Error("Selecione assunto de fiscalização destinado ao seu setor.");
  const item = await tx.constructionEnforcementCase.create({ data: { requestKey: data.requestKey, requestHash: fingerprint(data), processId: process.id, realEstateId: property.id, permitCaseId: data.permitCaseId || null, permitStatus: data.permitStatus, locationType: data.locationType, reason: data.reason, cadastralSnapshot: property, createdBy: actor.id } });
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_OPENED", data.reason, item.id, scope.currentDepartmentId);
  return item.id;
}

export async function assignConstructionEnforcement(tx: Prisma.TransactionClient, actor: Actor, input: unknown) {
  const data = enforcementAssignmentSchema.parse(input);
  if (!actor.access.administrator && !actor.access.roles.includes("MANAGER")) throw new Error("Designação reservada ao gestor urbanístico.");
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay(await tx.constructionEnforcementAssignment.findUnique({ where: { requestKey: data.requestKey } }), actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const departmentId = item.process.currentDepartmentId!;
  const staffRoleId = await eligibleInspector(tx, data.employeeId, departmentId);
  if (item.assignedEmployeeId === data.employeeId) throw new Error("O fiscal já está designado.");
  const record = await tx.constructionEnforcementAssignment.create({ data: { caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), previousEmployeeId: item.assignedEmployeeId, employeeId: data.employeeId, departmentId, staffRoleId, reason: data.reason, createdBy: actor.id } });
  await tx.constructionEnforcementCase.update({ where: { id: item.id }, data: { assignedEmployeeId: data.employeeId, revision: { increment: 1 } } });
  await tx.process.update({ where: { id: item.processId }, data: { currentResponsibleEmployeeId: data.employeeId }, select: { id: true } });
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_ASSIGNED", data.reason, record.id, departmentId);
  return record.id;
}

export async function recordConstructionEnforcementVisit(tx: Prisma.TransactionClient, actor: Actor, input: unknown) {
  const data = enforcementVisitSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay(await tx.constructionEnforcementVisit.findUnique({ where: { requestKey: data.requestKey } }), actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const staffRoleId = await assertAuthor(tx, actor, item);
  if (new Date(data.visitedAt) > new Date()) throw new Error("Diligência não pode estar no futuro.");
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const record = await tx.constructionEnforcementVisit.create({ data: { caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), visitedAt: new Date(data.visitedAt), findings: data.findings, employeeId: actor.access.employeeId!, departmentId: item.process.currentDepartmentId!, staffRoleId, createdBy: actor.id, evidence: { create: evidence } } });
  await tx.constructionEnforcementCase.update({ where: { id: item.id }, data: { revision: { increment: 1 } } });
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_VISIT", data.findings, record.id, item.process.currentDepartmentId);
  return record.id;
}

export async function issueConstructionEnforcementAct(tx: Prisma.TransactionClient, actor: Actor, input: unknown) {
  const data = enforcementActSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay(await tx.constructionEnforcementAct.findUnique({ where: { requestKey: data.requestKey } }), actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  const staffRoleId = await assertAuthor(tx, actor, item);
  const status = enforcementNextStatus(item.status, data.kind);
  const issuedAt = new Date(data.issuedAt);
  if (issuedAt > new Date()) throw new Error("Emissão não pode estar no futuro.");
  const latest = await tx.constructionEnforcementAct.findFirst({ where: { caseId: item.id }, orderBy: { issuedAt: "desc" }, select: { issuedAt: true } });
  if (latest && latest.issuedAt > issuedAt) throw new Error("A emissão deve preservar a ordem cronológica dos atos deste processo.");
  if (data.visitId) {
    const visit = await tx.constructionEnforcementVisit.findFirst({ where: { id: data.visitId, caseId: item.id }, select: { visitedAt: true } });
    if (!visit || visit.visitedAt > issuedAt) throw new Error("Selecione diligência deste processo anterior à emissão.");
  }
  if (data.relatedActId) {
    const related = await tx.constructionEnforcementAct.findFirst({ where: { id: data.relatedActId, caseId: item.id }, select: { issuedAt: true, kind: true, relatedActs: { where: { kind: "LIFT_EMBARGO" }, select: { id: true } } } });
    if (!related || related.issuedAt > issuedAt) throw new Error("Ato relacionado deve pertencer ao processo e ser anterior à emissão.");
    if (data.kind === "LIFT_EMBARGO" && (related.kind !== "EMBARGO" || related.relatedActs.length)) throw new Error("Selecione embargo vigente deste processo.");
  }
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const year = issuedAt.getUTCFullYear();
  const sequence = await tx.constructionEnforcementSequence.upsert({ where: { year_kind: { year, kind: data.kind } }, create: { year, kind: data.kind, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
  const number = `DEMO-FISC-${year}-${data.kind}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
  const record = await tx.constructionEnforcementAct.create({ data: { caseId: item.id, requestKey: data.requestKey, requestHash: fingerprint(data), number, kind: data.kind, visitId: data.visitId || null, relatedActId: data.relatedActId || null, reason: data.reason, legalBasis: data.legalBasis, issuedAt, deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null, employeeId: actor.access.employeeId!, departmentId: item.process.currentDepartmentId!, staffRoleId, createdBy: actor.id, evidence: { create: evidence } } });
  await tx.constructionEnforcementCase.update({ where: { id: item.id }, data: { status, revision: { increment: 1 } } });
  await history(tx, actor, item, `CONSTRUCTION_ENFORCEMENT_${data.kind}`, `${number}: ${data.reason}`, record.id, item.process.currentDepartmentId);
  return record.id;
}

export async function acknowledgeConstructionEnforcementAct(tx: Prisma.TransactionClient, actor: Actor, input: unknown) {
  const data = enforcementAcknowledgementSchema.parse(input);
  const item = await lockCase(tx, actor, data.caseId);
  const existing = replay(await tx.constructionEnforcementAcknowledgement.findUnique({ where: { requestKey: data.requestKey } }), actor, data);
  if (existing) return existing;
  assertActive(item, data.revision);
  await assertAuthor(tx, actor, item);
  const act = await tx.constructionEnforcementAct.findFirst({ where: { id: data.actId, caseId: item.id }, select: { issuedAt: true, number: true } });
  const acknowledgedAt = new Date(data.acknowledgedAt);
  if (!act || acknowledgedAt < act.issuedAt || acknowledgedAt > new Date()) throw new Error("Ciência deve ser posterior à emissão e não pode estar no futuro.");
  const evidence = await evidenceSnapshots(tx, item.processId, data.evidence);
  const record = await tx.constructionEnforcementAcknowledgement.create({ data: { actId: data.actId, requestKey: data.requestKey, requestHash: fingerprint(data), acknowledgedAt, method: data.method, recipient: data.recipient, notes: data.notes, createdBy: actor.id, evidence: { create: evidence } } });
  await tx.constructionEnforcementCase.update({ where: { id: item.id }, data: { revision: { increment: 1 } } });
  await history(tx, actor, item, "CONSTRUCTION_ENFORCEMENT_ACKNOWLEDGED", `Ciência de ${act.number}: ${data.notes}`, record.id, item.process.currentDepartmentId);
  return record.id;
}
