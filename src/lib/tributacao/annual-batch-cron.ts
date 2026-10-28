import type { DatabaseConnection } from "@/db/connection";
import { readAnnualCronActor, readAnnualCronModule } from "@/db/repositories/tax-annual/cron";
import { dueAnnualBatches } from "@/db/repositories/tax-annual/records";
import { canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { TaxError } from "./index";
import { processTaxAnnualBatch } from "./annual-batches";

export async function processTaxAnnualCron(connection: DatabaseConnection, actorId: string | undefined) {
  if (!actorId?.trim()) throw new TaxError("TAX_ANNUAL_ACTOR_USER_ID não configurado.");
  const [actor, module] = await Promise.all([
    readAnnualCronActor(connection.db, actorId.trim()),
    readAnnualCronModule(connection.db),
  ]);
  if (!actor?.ativo || !actor.perfil.ativo || !actor.firebaseUid || !module?.ativo) throw new TaxError("Ator, perfil ou módulo tributário indisponível para o agendamento.");
  const user: AppContext["user"] = { id: actor.id, firebaseUid: actor.firebaseUid, email: actor.email, name: actor.nome, role: actor.perfil.nome, profileCode: actor.perfil.codigo, permissions: actor.perfil.permissoes, modulePermissions: actor.permissions.map(permission => ({ code: permission.code.toUpperCase(), canView: permission.canView, canEdit: permission.canEdit })), allowedBudgetUnitIds: actor.units.map(unit => unit.budgetUnitId), employeeId: actor.employee?.id ?? null, departmentId: actor.employee?.departmentId ?? null, secretariatId: actor.employee?.secretariatId ?? null };
  if (!canViewModule(user, "TRIBUTACAO") || !canPerformModuleOperation(user, "TRIBUTACAO", "create") || !canPerformModuleOperation(user, "TRIBUTACAO", "update") || !user.allowedBudgetUnitIds.length) throw new TaxError("Ator do job exige criação/alteração tributária e UGs explícitas.");
  const batches = await dueAnnualBatches(connection.db, actor.id, user.allowedBudgetUnitIds);
  const results = [];
  for (const batch of batches) {
    try { results.push({ batchId: batch.id, ...(await processTaxAnnualBatch(connection, { usuarioId: actor.id, employeeId: user.employeeId, allowedBudgetUnitIds: user.allowedBudgetUnitIds }, batch.id, 25)) }); }
    catch { results.push({ batchId: batch.id, processed: 0, failures: ["BATCH_SCOPE_OR_CONFIGURATION"] }); }
  }
  return { actorId: actor.id, results };
}
