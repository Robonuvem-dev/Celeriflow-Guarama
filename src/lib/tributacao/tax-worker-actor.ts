import type { Prisma, PrismaClient } from "@prisma/client";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";

export async function resolveTaxWorkerActor(db: PrismaClient | Prisma.TransactionClient, id: string | undefined) {
  if (!id?.trim()) throw new Error("Configure o usuário do agendamento tributário.");
  const [actor, module] = await Promise.all([
    db.usuario.findUnique({ where: { id: id.trim() }, include: { perfil: true, employee: true, permissoesModulo: { include: { modulo: { select: { codigo: true } } } }, unidadesGestoras: { select: { budgetUnitId: true } } } }),
    db.configuracaoModulo.findUnique({ where: { codigo: "TRIBUTACAO" }, select: { ativo: true } }),
  ]);
  if (!actor?.ativo || !actor.perfil.ativo || !actor.firebaseUid || !module?.ativo) throw new Error("Ator, perfil ou módulo tributário indisponível.");
  const user: AppContext["user"] = { id: actor.id, firebaseUid: actor.firebaseUid, email: actor.email, name: actor.nome, role: actor.perfil.nome, profileCode: actor.perfil.codigo, permissions: actor.perfil.permissoes, modulePermissions: actor.permissoesModulo.map(permission => ({ code: permission.modulo.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: actor.unidadesGestoras.map(unit => unit.budgetUnitId), employeeId: actor.employee?.id ?? null, departmentId: actor.employee?.departmentId ?? null, secretariatId: actor.employee?.secretariatId ?? null };
  if (!canViewModule(user, "TRIBUTACAO") || !canPerformModuleOperation(user, "TRIBUTACAO", "update") || !user.allowedBudgetUnitIds.length) throw new Error("Ator do agendamento exige alteração tributária e UGs explícitas.");
  return { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: user.allowedBudgetUnitIds };
}
