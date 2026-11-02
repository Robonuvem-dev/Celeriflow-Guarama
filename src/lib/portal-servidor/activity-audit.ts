import { createHash, randomUUID } from "node:crypto";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

export type EmployeePortalActivity = "LOGIN" | "LOGOUT" | "PASSWORD_CHANGE" | "LOGIN_FAILURE" | "PAYSLIP_PRINT" | "FINANCIAL_STATEMENT_PRINT" | "INCOME_STATEMENT_PRINT";
export function employeePortalRequestMetadata(request: Request) {
  return { ip: (request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown").slice(0, 120), host: (request.headers.get("host") || new URL(request.url).host).slice(0, 255) };
}

/** Only trusted server authentication/report handlers supply the actor and action. */
export async function recordEmployeePortalActivity(database: DatabaseExecutor, input: { action: EmployeePortalActivity; userId?: string; employeeId?: string; targetId?: string; ip?: string; host?: string }) {
  const id = randomUUID();
  const payload = { action: input.action, actorId: input.userId || null, employeeId: input.employeeId || null, targetId: input.targetId || null, ip: (input.ip || "unknown").slice(0, 120), host: (input.host || "unknown").slice(0, 255), occurredAt: new Date().toISOString() };
  await database.insert(hrIntegrationEvents).values({ id, sourceKey: `PORTAL:ATIVIDADE:${id}`, domain: "PORTAL", environment: "INTERNO", eventType: "ATIVIDADE_PORTAL_SERVIDOR", status: "PROCESSADO", payload, payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") });
  if (input.userId) await insertAuditEvent(database, { actorUsuarioId: input.userId, eventType: input.action === "LOGIN" ? auditEventTypes.sessionLogin : input.action === "LOGOUT" ? auditEventTypes.sessionLogout : input.action.endsWith("PRINT") ? auditEventTypes.reportIssued : auditEventTypes.administrativeMutation, targetType: `EMPLOYEE_PORTAL_${input.action}`, targetId: input.targetId || input.employeeId || id });
}
