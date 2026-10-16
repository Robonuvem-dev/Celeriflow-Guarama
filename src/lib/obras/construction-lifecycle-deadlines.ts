import { Prisma } from "@prisma/client";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { assertInspectionCorrectionOpen, inspectionDeadlineEnd, inspectionDeadlineExtensionSchema } from "./construction-lifecycle-deadline-policy";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";

/** Caller authorizes the case. Only the latest unresolved failure of each inspection type is returned. */
export async function getConstructionInspectionCorrections(tx: Prisma.TransactionClient, caseId: string) {
  const ids = await tx.$queryRaw<{ id: string }[]>`SELECT i."id" FROM "ConstructionInspection" i
    WHERE i."caseId"=${caseId} AND i."status"='FAILED'
    AND NOT EXISTS (SELECT 1 FROM "ConstructionInspection" n WHERE n."caseId"=i."caseId" AND n."inspectionTypeId"=i."inspectionTypeId" AND n."sequence">i."sequence" AND n."status" IN ('APPROVED','FAILED'))
    ORDER BY i."sequence" DESC LIMIT 100`;
  const inspections = await tx.constructionInspection.findMany({ where: { id: { in: ids.map((item) => item.id) } }, include: { deadlineExtensions: { orderBy: { newDeadline: "desc" }, take: 1 } }, orderBy: { sequence: "desc" }, take: 100 });
  return inspections.map((inspection) => ({ inspectionId: inspection.id, inspectionTypeId: inspection.inspectionTypeId, inspectedAt: inspection.inspectedAt?.toISOString().slice(0, 10) || null, requirementNote: inspection.requirementNote || inspection.resultNotes || "Exigência de vistoria", originalDeadline: inspection.correctionDeadline?.toISOString() || null, effectiveDeadline: (inspection.deadlineExtensions[0]?.newDeadline || inspection.correctionDeadline)?.toISOString() || null, correctionSnapshot: inspection.correctionSnapshot, latestExtension: inspection.deadlineExtensions[0] ? { id: inspection.deadlineExtensions[0].id, reason: inspection.deadlineExtensions[0].reason, createdAt: inspection.deadlineExtensions[0].createdAt.toISOString(), previousDeadline: inspection.deadlineExtensions[0].previousDeadline?.toISOString() || null, newDeadline: inspection.deadlineExtensions[0].newDeadline.toISOString() } : null }));
}

/** Locks the case; use on both staff requests and generic portal requests, not only in the UI. */
export async function assertConstructionInspectionRequestDeadline(tx: Prisma.TransactionClient, caseId: string, options: { inspectionTypeId?: string; scheduledAt?: string; now?: Date } = {}) {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`;
  const requirements = await getConstructionInspectionCorrections(tx, caseId);
  const applicable = requirements.filter((item) => !options.inspectionTypeId || item.inspectionTypeId === options.inspectionTypeId);
  for (const requirement of applicable) {
    assertInspectionCorrectionOpen(requirement.effectiveDeadline ? new Date(requirement.effectiveDeadline) : null, options.now || new Date(), options.scheduledAt);
    if (options.scheduledAt && requirement.inspectedAt && options.scheduledAt < requirement.inspectedAt) throw new Error("Nova vistoria não pode anteceder a vistoria reprovada que originou a exigência.");
  }
  return applicable;
}

export async function extendConstructionInspectionDeadline(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, rawInput: unknown, now = new Date()) {
  const data = inspectionDeadlineExtensionSchema.parse(rawInput);
  if (!access.employeeId || (!access.administrator && !access.roles.includes("MANAGER"))) throw new Error("Regularização de prazo exige gestor urbanístico com vínculo a servidor.");
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, include: { process: { select: { status: true, currentDepartmentId: true } } } });
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  const existing = await tx.constructionInspectionDeadlineExtension.findUnique({ where: { requestKey: data.requestKey } });
  if (existing) {
    if (existing.caseId !== data.caseId || existing.inspectionId !== data.inspectionId || existing.createdBy !== actorId) throw new Error("Chave de regularização indisponível.");
    return existing.id;
  }
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("O processo precisa estar recebido e ativo para regularizar o prazo.");
  const requirements = await getConstructionInspectionCorrections(tx, record.id);
  const requirement = requirements.find((item) => item.inspectionId === data.inspectionId);
  if (!requirement) throw new Error("A exigência de vistoria não está mais pendente.");
  const previousDeadline = requirement.effectiveDeadline ? new Date(requirement.effectiveDeadline) : null;
  const newDeadline = inspectionDeadlineEnd(data.newDeadline);
  if (newDeadline <= now || (previousDeadline && newDeadline <= previousDeadline)) throw new Error("Novo prazo deve ser futuro e posterior ao prazo vigente.");
  const extension = await tx.constructionInspectionDeadlineExtension.create({ data: { caseId: record.id, inspectionId: requirement.inspectionId, requestKey: data.requestKey, previousDeadline, newDeadline, reason: data.reason, createdBy: actorId } });
  const metadata = { extensionId: extension.id, inspectionId: requirement.inspectionId, previousDeadline: previousDeadline?.toISOString() || null, newDeadline: newDeadline.toISOString(), reason: data.reason };
  await tx.processEvent.create({ data: { processId: record.processId, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, eventType: "CONSTRUCTION_INSPECTION_DEADLINE_EXTENDED", description: data.reason, metadata: JSON.stringify(metadata) } });
  await tx.constructionMessage.create({ data: { caseId: record.id, requestKey: data.requestKey, employeeId: access.employeeId, content: `Prazo de ajuste da vistoria regularizado até ${data.newDeadline} (fim do dia UTC). Motivo: ${data.reason}`, evidenceSnapshot: metadata } });
  if (record.process.currentDepartmentId) await notifyProtocolDepartment(tx, actorId, record.process.currentDepartmentId, { processId: record.processId, type: "DEADLINE", title: "Prazo de vistoria regularizado", message: data.reason, priority: "NORMAL", dedupeDiscriminator: `inspection-extension:${extension.id}` });
  return extension.id;
}
