import type { PrismaClient } from "@prisma/client";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { TaxError } from "./index";
import { processTaxAnnualBatch } from "./annual-batches";

export async function processTaxAnnualCron(db: PrismaClient, actorId: string | undefined) {
  if (!actorId?.trim()) throw new TaxError("TAX_ANNUAL_ACTOR_USER_ID não configurado.");
  const [actor, module] = await Promise.all([
    db.usuario.findUnique({ where: { id: actorId.trim() }, include: { perfil: true, employee: true, permissoesModulo: { include: { modulo: { select: { codigo: true } } } }, unidadesGestoras: { select: { budgetUnitId: true } } } }),
    db.configuracaoModulo.findUnique({ where: { codigo: "TRIBUTACAO" }, select: { ativo: true } }),
  ]);
  if (!actor?.ativo || !actor.perfil.ativo || !actor.firebaseUid || !module?.ativo) throw new TaxError("Ator, perfil ou módulo tributário indisponível para o agendamento.");
  const user: AppContext["user"] = { id: actor.id, firebaseUid: actor.firebaseUid, email: actor.email, name: actor.nome, role: actor.perfil.nome, profileCode: actor.perfil.codigo, permissions: actor.perfil.permissoes, modulePermissions: actor.permissoesModulo.map(permission => ({ code: permission.modulo.codigo.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: actor.unidadesGestoras.map(unit => unit.budgetUnitId), employeeId: actor.employee?.id ?? null, departmentId: actor.employee?.departmentId ?? null, secretariatId: actor.employee?.secretariatId ?? null };
  if (!canViewModule(user, "TRIBUTACAO") || !canPerformModuleOperation(user, "TRIBUTACAO", "create") || !canPerformModuleOperation(user, "TRIBUTACAO", "update") || !user.allowedBudgetUnitIds.length) throw new TaxError("Ator do job exige criação/alteração tributária e UGs explícitas.");
  const batches = await db.taxAnnualBatch.findMany({ where: { actorUsuarioId: actor.id, budgetUnitId: { in: user.allowedBudgetUnitIds }, status: { in: ["QUEUED", "RUNNING"] }, scheduledAt: { lte: new Date() }, items: { some: { status: "PENDING" } } }, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 10, select: { id: true } });
  const results = [];
  for (const batch of batches) {
    try { results.push({ batchId: batch.id, ...(await processTaxAnnualBatch(db, { usuarioId: actor.id, employeeId: user.employeeId, allowedBudgetUnitIds: user.allowedBudgetUnitIds }, batch.id, 25)) }); }
    catch { results.push({ batchId: batch.id, processed: 0, failures: ["BATCH_SCOPE_OR_CONFIGURATION"] }); }
  }
  return { actorId: actor.id, results };
}
