import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { changePortalEvent, portalFirst, portalRequired, portalRows, portalEvents } from "@/db/repositories/portal-servidor/records";
import type { PortalIntegrationEvent } from "@/lib/contracts/employee-portal";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { functionalPublicationSchema, publicationPayloadSchema } from "./publication-contract";
export { functionalDocumentKinds, functionalPublicationSchema, publicationPayloadSchema } from "./publication-contract";

export async function publishFunctionalDocument(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = functionalPublicationSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Sem autorização para disponibilizar documentos funcionais.", 403);
  if (input.kind === "PPP" && !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("PPP exige autorização de emissão SST.", 403);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async tx => {
    const employee = await portalRequired<{ id: string; personId: string | null; secretariatId: string | null }>(tx, sql`SELECT id,"personId","secretariatId" FROM "Employee" WHERE id=${input.employeeId}`);
    const unit = await portalRequired<{ secretariatId: string | null }>(tx, sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${input.budgetUnitId}`);
    if (!employee.personId || employee.secretariatId !== unit.secretariatId) throw new Error("Unidade gestora incompatível com o vínculo de origem.");
    if (input.contractId && !await portalFirst<{ id: string }>(tx, sql`SELECT id FROM "HrEmploymentContract" WHERE id=${input.contractId} AND "employeeId"=${employee.id} LIMIT 1`)) throw new Error("Contrato não pertence ao titular.");
    if (input.kind === "IRRF_ANUAL" && !input.year) throw new Error("Informe o ano de pagamento do comprovante de rendimentos.");
    const version = await portalFirst<{ id: string; title: string; hashSha256: string; fileUrl: string; documentId: string }>(tx, sql`SELECT v.id,d.title,v."hashSha256",v."fileUrl",v."documentId" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${input.documentVersionId} AND ${input.kind === "PPP" ? sql`v.status='SIGNED'` : sql`v.status IN ('FINAL','SIGNED')`} AND d."personId"=${employee.personId} AND d.status IN ('Válido','Assinado') LIMIT 1`);
    if (!version) throw new Error("Selecione uma versão documental válida vinculada à pessoa do servidor; PPP exige assinatura.");
    const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:PUBLICACAO:${input.kind}:${employee.id}:${version.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO", payload: { ...input, title: version.title, publisherId: context.user.id, hashSha256: version.hashSha256, fileUrl: version.fileUrl, documentId: version.documentId } });
    if (event.status === "REVOGADO") throw new Error("Publicação revogada exige uma nova versão documental.");
    await changePortalEvent(tx, event.id, { status: "PROCESSADO" });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_DOCUMENT_PUBLICATION", targetId: event.id });
    return event.id;
  });
}

export async function revokeFunctionalDocument(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(2000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Sem autorização para revogar documentos funcionais.", 403);
  return withDatabaseTransaction(connection, async tx => {
    const publication = await portalRequired<PortalIntegrationEvent>(tx, sql`SELECT * FROM "HrIntegrationEvent" WHERE id=${input.id} FOR UPDATE`);
    if (publication.domain !== "PORTAL" || publication.eventType !== "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO") throw new Error("Publicação incompatível.");
    const payload = publicationPayloadSchema.parse(publication.payload);
    assertBudgetUnitAccess(context.user, payload.budgetUnitId);
    await changePortalEvent(tx, publication.id, { status: "REVOGADO", result: { reason: input.reason, actorId: context.user.id, revokedAt: new Date().toISOString() } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_DOCUMENT_REVOCATION", targetId: publication.id });
  });
}

export async function listOwnPublishedDocuments(context: AppContext) {
  const executor = context.database ?? db;
  const events = await portalEvents(executor, sql`domain='PORTAL' AND "eventType"='DOCUMENTO_FUNCIONAL_DISPONIBILIZADO' AND status='PROCESSADO' AND payload->>'employeeId'=${context.user.employeeId || "__SEM_VINCULO__"}`);
  const now = new Date();
  const parsed = events.map(event => ({ id: event.id, payload: publicationPayloadSchema.parse(event.payload) })).filter(event => new Date(event.payload.releaseAt) <= now);
  const versions = await portalRows<{ id: string; hashSha256: string; status: string }>(executor, sql`SELECT v.id,v."hashSha256",v.status FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" JOIN "Person" p ON p.id=d."personId" JOIN "Employee" e ON e."personId"=p.id WHERE v.id=ANY(${sql.param(parsed.map(event => event.payload.documentVersionId))}::text[]) AND v.status IN ('FINAL','SIGNED') AND d.status IN ('Válido','Assinado') AND e.id=${context.user.employeeId || "__SEM_VINCULO__"} AND e."isActive"`);
  return parsed.filter(event => versions.some(version => version.id === event.payload.documentVersionId && version.hashSha256 === event.payload.hashSha256 && (event.payload.kind !== "PPP" || version.status === "SIGNED")));
}
