import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { findIdentityByFirebaseUid } from "@/db/repositories/platform/identity";
import type { FinanceActor } from "@/lib/financeiro";
import { canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { integrationEventWhere } from "./integration-event-scope";

/** Finance hooks cannot inherit RH scope from a budget-unit grant alone. */
export async function assertFinancialPersonnelOriginAccess(db: DatabaseExecutor, actor: FinanceActor, origin: Record<string, unknown>) {
  const [account] = (await db.execute<{ firebaseUid: string | null }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id=${actor.usuarioId}`)).rows;
  const identity = account?.firebaseUid ? await findIdentityByFirebaseUid(db, account.firebaseUid) : null;
  if (!identity?.ativo || !identity.perfil.ativo) throw new Error("Ator financeiro sem identidade ativa para a origem RH.");
  const user: AppContext["user"] = {
    id: identity.id, firebaseUid: account!.firebaseUid!, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo,
    permissions: identity.perfil.permissoes, additionalProfiles: identity.additionalProfiles?.map(profile => ({ id: profile.id, code: profile.codigo, name: profile.nome, permissions: profile.permissoes })),
    modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null,
  };
  if (!canPerformModuleOperation(user, "RH", "update")) throw new Error("Operação financeira de origem RH exige alteração no módulo e acesso às origens.");
  const allowed = await db.execute(sql`SELECT 1 WHERE ${integrationEventWhere(user, sql`${JSON.stringify(origin)}::jsonb`)}`);
  if (!allowed.rows.length) throw new Error("Origem financeira fora do escopo de titulares, lotações ou verbas de RH.");
}
