import type { PrismaClient } from "@prisma/client";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { runControlAgendaAlerts } from "./control-agenda";
import { C7OperationError } from "./operations-service";

export async function controlAgendaCronScope(db: PrismaClient, actorId: string | undefined) {
  if (!actorId?.trim()) throw new C7OperationError("CONTROL_AGENDA_ACTOR_USER_ID não configurado.");
  const [actor, module] = await Promise.all([
    db.usuario.findUnique({ where: { id: actorId.trim() }, include: { perfil: true, employee: true, permissoesModulo: { include: { modulo: { select: { codigo: true } } } }, unidadesGestoras: { select: { budgetUnitId: true } } } }),
    db.configuracaoModulo.findUnique({ where: { codigo: "ADMINISTRACAO" }, select: { ativo: true } }),
  ]);
  if (!actor?.ativo || !actor.perfil.ativo || !actor.firebaseUid || !module?.ativo) throw new C7OperationError("Ator, perfil ou módulo de Controle indisponível para o agendamento.");
  const user: AppContext["user"] = { id: actor.id, firebaseUid: actor.firebaseUid, email: actor.email, name: actor.nome, role: actor.perfil.nome, profileCode: actor.perfil.codigo, permissions: actor.perfil.permissoes, modulePermissions: actor.permissoesModulo.map(permission => ({ code: permission.modulo.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: actor.unidadesGestoras.map(unit => unit.budgetUnitId), employeeId: actor.employee?.id ?? null, departmentId: actor.employee?.departmentId ?? null, secretariatId: actor.employee?.secretariatId ?? null };
  if (!canViewModule(user, "ADMINISTRACAO") || !canPerformModuleOperation(user, "ADMINISTRACAO", "update") || !user.allowedBudgetUnitIds.length) throw new C7OperationError("Ator do agendamento exige operação de Controle e UGs explicitamente autorizadas.");
  return { usuarioId: user.id, allowedBudgetUnitIds: user.allowedBudgetUnitIds };
}

export async function processControlAgendaCron(db: PrismaClient, actorId: string | undefined) {
  const actor = await controlAgendaCronScope(db, actorId);
  let cursor: string | undefined;
  let checked = 0, created = 0;
  const failedPlanIds: string[] = [];
  for (;;) {
    const plans = await db.internalControlPlan.findMany({ where: { ownerId: actor.usuarioId, status: "ABERTO", budgetUnitId: { in: actor.allowedBudgetUnitIds }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
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
