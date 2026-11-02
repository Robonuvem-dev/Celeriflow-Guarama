import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { portalRequired } from "@/db/repositories/portal-servidor/records";
import { assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { personnelJson } from "@/db/repositories/personnel/integration";

export const portalContentSchema = z.object({ kind: z.enum(["LOCAL", "DOCUMENTO", "NORMA", "MANUAL"]), title: z.string().trim().min(3).max(200), budgetUnitId: z.string().min(1), address: z.string().trim().max(500).default(""), hours: z.string().trim().max(500).default(""), contact: z.string().trim().max(250).default(""), fileUrl: z.string().optional(), fileName: z.string().optional(), contentType: z.string().optional(), fileHash: z.string().optional() });
export type PortalContent = z.infer<typeof portalContentSchema>;
export const portalContentEventType = "CONTEUDO_PORTAL_SERVIDOR";
export async function listPortalContents(database: DatabaseExecutor = db) {
  const rows = await database.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.eventType, portalContentEventType));
  return rows.flatMap(row => { const parsed = portalContentSchema.safeParse(row.payload); return parsed.success ? [{ id: row.id, active: row.status === "PROCESSADO", createdAt: row.createdAt, data: parsed.data }] : []; }).sort((a, b) => a.data.title.localeCompare(b.data.title, "pt-BR"));
}
export async function savePortalContent(context: AppContext, input: PortalContent) {
  const data = portalContentSchema.parse(input);
  if (!canPerformModuleOperation(context.user, "RH", "create")) throw new Error("Sem autorização para cadastrar conteúdo funcional.");
  assertBudgetUnitAccess(context.user, data.budgetUnitId);
  if (data.kind === "LOCAL" && (!data.address || !data.hours)) throw new Error("Informe endereço e horário do local.");
  if (data.kind !== "LOCAL" && (!data.fileUrl || !data.fileHash || !data.contentType || !data.fileName)) throw new Error("Arquivo obrigatório.");
  const id = randomUUID();
  await withDatabaseTransaction(databaseConnection, async tx => {
    await portalRequired(tx, sql`SELECT id FROM "BudgetUnit" WHERE id=${data.budgetUnitId}`);
    await tx.insert(hrIntegrationEvents).values({ id, sourceKey: `PORTAL:CONTEUDO:${id}`, domain: "PORTAL", environment: "INTERNO", eventType: portalContentEventType, status: "PROCESSADO", payload: personnelJson(data), payloadHash: createHash("sha256").update(JSON.stringify(data)).digest("hex") });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_CONTENT", targetId: id });
  });
  return id;
}
export async function setPortalContentActive(context: AppContext, id: string, active: boolean) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new Error("Sem autorização para alterar conteúdo funcional.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    const row = await portalRequired<{ payload: unknown }>(tx, sql`SELECT payload FROM "HrIntegrationEvent" WHERE id=${id} AND "eventType"=${portalContentEventType} FOR UPDATE`);
    assertBudgetUnitAccess(context.user, portalContentSchema.parse(row.payload).budgetUnitId);
    await tx.update(hrIntegrationEvents).set({ status: active ? "PROCESSADO" : "REVOGADO", updatedAt: new Date() }).where(eq(hrIntegrationEvents.id, id));
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_CONTENT", targetId: id });
  });
}
export async function ownPortalContents(database: DatabaseExecutor, employeeId: string) {
  const units = await database.execute<{ id: string }>(sql`SELECT u.id FROM "BudgetUnit" u JOIN "Employee" e ON e."secretariatId"=u."secretariatId" WHERE e.id=${employeeId} AND e."isActive"`);
  const allowed = new Set(units.rows.map(row => row.id));
  return (await listPortalContents(database)).filter(row => row.active && allowed.has(row.data.budgetUnitId));
}
