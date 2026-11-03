import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { findIdentityByFirebaseUid, findModuleActivation } from "@/db/repositories/platform/identity";
import { enqueueHrIntegration, findHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { processAutomaticRights } from "./automatic-rights-processing";
import { personnelDepartmentWhere, personnelEmployeeWhere } from "./personnel-scope";

export async function runAutomaticRightsSchedule(connection: DatabaseConnection, actorId: string | undefined, now = new Date()) {
  if (!actorId) throw new Error("Configure RH_RIGHTS_ACTOR_USER_ID para o agendamento funcional.");
  const [actor] = (await connection.db.execute<{ firebaseUid: string | null }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id=${actorId}`)).rows;
  const identity = actor?.firebaseUid ? await findIdentityByFirebaseUid(connection.db, actor.firebaseUid) : null;
  if (!identity?.ativo || !identity.perfil.ativo || !(await findModuleActivation(connection.db, "RH"))?.ativo) throw new Error("Ator, perfil ou módulo RH indisponível.");
  const user: AppContext["user"] = {
    id: identity.id, firebaseUid: actor!.firebaseUid!, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo,
    permissions: identity.perfil.permissoes, additionalProfiles: identity.additionalProfiles?.map(profile => ({ id: profile.id, code: profile.codigo, name: profile.nome, permissions: profile.permissoes })),
    modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null,
  };
  if (!canViewModule(user, "RH") || !canPerformModuleOperation(user, "RH", "update") || !user.allowedBudgetUnitIds.length) throw new Error("Ator deve possuir alteração de RH e unidades gestoras explícitas.");
  const referenceDate = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const selected = await connection.db.execute<{ id: string }>(sql`SELECT c.id FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId"
    WHERE c.status='ATIVO' AND e."isActive" AND c."admittedAt"<=${referenceDate}::date AND (c."endsAt" IS NULL OR c."endsAt">=${referenceDate}::date)
      AND ${personnelEmployeeWhere(user, sql`e."departmentId"`, sql`e.id`)}
      AND ${personnelDepartmentWhere(user, sql`c."departmentId"`)} AND ${personnelDepartmentWhere(user, sql`e."departmentId"`)}
      AND NOT EXISTS(SELECT 1 FROM "HrIntegrationEvent" a WHERE a."sourceKey"='DIREITOS:AGENDA:'||${referenceDate}||':'||c.id)
    ORDER BY EXISTS(SELECT 1 FROM "HrIntegrationEvent" a WHERE a."sourceKey"='DIREITOS:AGENDA_FALHA:'||${referenceDate}||':'||c.id),c.id LIMIT 20`);
  const results: Array<{ contractId: string; processed: boolean; error?: string }> = [];
  for (const contract of selected.rows) {
    try {
      const result = await processAutomaticRights(connection, { user, database: connection.db }, { contractIds: [contract.id], referenceDate, mode: "APLICAR" });
      await enqueueHrIntegration(connection.db, { sourceKey: `DIREITOS:AGENDA:${referenceDate}:${contract.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "DIREITOS_PROCESSADOS_AGENDAMENTO", payload: { contractId: contract.id, referenceDate, actorId: user.id, rows: result.rows } });
      results.push({ contractId: contract.id, processed: true });
    } catch (error) {
      // A failed contract stays due; successes remain idempotent on the next bounded batch.
      const sourceKey = `DIREITOS:AGENDA_FALHA:${referenceDate}:${contract.id}`;
      if (!await findHrIntegrationEvent(connection.db, sourceKey)) await enqueueHrIntegration(connection.db, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "DIREITOS_AGENDAMENTO_PENDENTE", payload: { contractId: contract.id, referenceDate, actorId: user.id, reason: error instanceof Error ? error.message : "Falha no processamento funcional." } });
      results.push({ contractId: contract.id, processed: false, error: error instanceof Error ? error.message : "Falha no processamento funcional." });
    }
  }
  return { actorId: user.id, referenceDate, results };
}
