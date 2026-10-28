import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import { controlPlans } from "@/db/schema/internal-control";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { runControlAgendaAlerts } from "./control-agenda";
import { C7OperationError } from "./operations-service";

export async function controlAgendaCronScope(db: DatabaseExecutor, actorId: string | undefined) {
  if (!actorId?.trim()) throw new C7OperationError("CONTROL_AGENDA_ACTOR_USER_ID não configurado.");
  const [actors, activated, permissions, budgetUnits] = await Promise.all([
    db.select({ user: users, profile: accessProfiles, employee: { id: employees.id, departmentId: employees.departmentId, secretariatId: employees.secretariatId } }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).leftJoin(employees, eq(users.employeeId, employees.id)).where(eq(users.id, actorId.trim())),
    db.select({ ativo: modules.ativo }).from(modules).where(eq(modules.codigo, "ADMINISTRACAO")),
    db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(userModulePermissions.moduloId, modules.id)).where(eq(userModulePermissions.usuarioId, actorId.trim())),
    db.select({ budgetUnitId: userBudgetUnits.budgetUnitId }).from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, actorId.trim())),
  ]);
  const actor = actors[0];
  if (!actor?.user.ativo || !actor.profile.ativo || !actor.user.firebaseUid || !activated[0]?.ativo) throw new C7OperationError("Ator, perfil ou módulo de Controle indisponível para o agendamento.");
  const user: AppContext["user"] = { id: actor.user.id, firebaseUid: actor.user.firebaseUid, email: actor.user.email, name: actor.user.nome, role: actor.profile.nome, profileCode: actor.profile.codigo, permissions: actor.profile.permissoes, modulePermissions: permissions.map(permission => ({ ...permission, code: permission.code.toUpperCase() })), allowedBudgetUnitIds: budgetUnits.map(unit => unit.budgetUnitId), employeeId: actor.employee?.id ?? null, departmentId: actor.employee?.departmentId ?? null, secretariatId: actor.employee?.secretariatId ?? null };
  if (!canViewModule(user, "ADMINISTRACAO") || !canPerformModuleOperation(user, "ADMINISTRACAO", "update") || !user.allowedBudgetUnitIds.length) throw new C7OperationError("Ator do agendamento exige operação de Controle e UGs explicitamente autorizadas.");
  return { usuarioId: user.id, allowedBudgetUnitIds: user.allowedBudgetUnitIds };
}

export async function processControlAgendaCron(db: DatabaseConnection, actorId: string | undefined) {
  const actor = await controlAgendaCronScope(db.db, actorId);
  let cursor: string | undefined;
  let checked = 0, created = 0;
  const failedPlanIds: string[] = [];
  for (;;) {
    const plans = await db.db.select({ id: controlPlans.id }).from(controlPlans).where(and(eq(controlPlans.ownerId, actor.usuarioId), eq(controlPlans.status, "ABERTO"), inArray(controlPlans.budgetUnitId, actor.allowedBudgetUnitIds), cursor ? gt(controlPlans.id, cursor) : undefined)).orderBy(asc(controlPlans.id)).limit(100);
    if (!plans.length) break;
    for (const plan of plans) {
      try { created += (await runControlAgendaAlerts(db, actor, plan.id)).length; }
      catch { failedPlanIds.push(plan.id); }
      checked++;
    }
    cursor = plans[plans.length - 1].id;
  }
  return { checked, created, failedPlanIds, actorId: actor.usuarioId };
}
