import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { functionalPublicationSchema, publicationPayloadSchema } from "./publication-contract";
export { functionalDocumentKinds, functionalPublicationSchema, publicationPayloadSchema } from "./publication-contract";

export async function publishFunctionalDocument(context: AppContext, raw: unknown) {
  const input = functionalPublicationSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Sem autorização para disponibilizar documentos funcionais.", 403);
  if (input.kind === "PPP" && !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("PPP exige autorização de emissão SST.", 403);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } });
    if (!employee.personId || employee.secretariatId !== unit.secretariatId) throw new Error("Unidade gestora incompatível com o vínculo de origem.");
    if (input.contractId && !await tx.hrEmploymentContract.findFirst({ where: { id: input.contractId, employeeId: employee.id } })) throw new Error("Contrato não pertence ao titular.");
    if (input.kind === "IRRF_ANUAL" && !input.year) throw new Error("Informe o ano de pagamento do comprovante de rendimentos.");
    const version = await tx.documentVersion.findFirst({ where: { id: input.documentVersionId, status: input.kind === "PPP" ? "SIGNED" : { in: ["FINAL", "SIGNED"] }, document: { personId: employee.personId, status: { in: ["Válido", "Assinado"] } } }, include: { document: true } });
    if (!version) throw new Error("Selecione uma versão documental válida vinculada à pessoa do servidor; PPP exige assinatura.");
    const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:PUBLICACAO:${input.kind}:${employee.id}:${version.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO", payload: { ...input, title: version.document.title, publisherId: context.user.id, hashSha256: version.hashSha256, fileUrl: version.fileUrl, documentId: version.documentId } });
    if (event.status === "REVOGADO") throw new Error("Publicação revogada exige uma nova versão documental.");
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_DOCUMENT_PUBLICATION", targetId: event.id });
    return event.id;
  });
}

export async function revokeFunctionalDocument(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(2000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Sem autorização para revogar documentos funcionais.", 403);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrIntegrationEvent" WHERE id=${input.id} FOR UPDATE`;
    const publication = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { id: input.id } });
    if (publication.domain !== "PORTAL" || publication.eventType !== "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO") throw new Error("Publicação incompatível.");
    const payload = publicationPayloadSchema.parse(publication.payload);
    assertBudgetUnitAccess(context.user, payload.budgetUnitId);
    await tx.hrIntegrationEvent.update({ where: { id: publication.id }, data: { status: "REVOGADO", result: { reason: input.reason, actorId: context.user.id, revokedAt: new Date().toISOString() } } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_DOCUMENT_REVOCATION", targetId: publication.id });
  });
}

export async function listOwnPublishedDocuments(context: AppContext) {
  const events = await context.prisma.hrIntegrationEvent.findMany({ where: { domain: "PORTAL", eventType: "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO", status: "PROCESSADO", payload: { path: ["employeeId"], equals: context.user.employeeId || "__SEM_VINCULO__" } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const now = new Date();
  const parsed = events.map(event => ({ id: event.id, payload: publicationPayloadSchema.parse(event.payload) })).filter(event => new Date(event.payload.releaseAt) <= now);
   const versions = await context.prisma.documentVersion.findMany({ where: { id: { in: parsed.map(event => event.payload.documentVersionId) }, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] }, person: { employee: { id: context.user.employeeId || "__SEM_VINCULO__", isActive: true } } } }, select: { id: true, hashSha256: true, status: true } });
  return parsed.filter(event => versions.some(version => version.id === event.payload.documentVersionId && version.hashSha256 === event.payload.hashSha256 && (event.payload.kind !== "PPP" || version.status === "SIGNED")));
}
