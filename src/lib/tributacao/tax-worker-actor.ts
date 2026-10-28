import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import type { PermissionUser } from "@/lib/contracts/identity";
import { canPerformModuleOperation, canViewModule } from "@/lib/platform/tenant-context";

export async function resolveTaxWorkerActor(db: DatabaseExecutor, id: string | undefined) {
  if (!id?.trim()) throw new Error("Configure o usuário do agendamento tributário.");
  const [actor, module] = await Promise.all([
    db.select({ id: users.id, ativo: users.ativo, firebaseUid: users.firebaseUid, email: users.email, nome: users.nome, perfil: { ativo: accessProfiles.ativo, nome: accessProfiles.nome, codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes }, employee: { id: employees.id, departmentId: employees.departmentId, secretariatId: employees.secretariatId } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).leftJoin(employees, eq(employees.id, users.employeeId)).where(eq(users.id, id.trim())).limit(1),
    db.select({ ativo: modules.ativo }).from(modules).where(eq(modules.codigo, "TRIBUTACAO")).limit(1),
  ]);
  const record = actor[0];
  if (!record?.ativo || !record.perfil.ativo || !record.firebaseUid || !module[0]?.ativo) throw new Error("Ator, perfil ou módulo tributário indisponível.");
  const [permissions, units] = await Promise.all([
    db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(eq(userModulePermissions.usuarioId, record.id)),
    db.select({ budgetUnitId: userBudgetUnits.budgetUnitId }).from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, record.id)),
  ]);
  const user: PermissionUser = { id: record.id, firebaseUid: record.firebaseUid, email: record.email, name: record.nome, role: record.perfil.nome, profileCode: record.perfil.codigo, permissions: record.perfil.permissoes, modulePermissions: permissions.map(permission => ({ ...permission, code: permission.code.toUpperCase() })), allowedBudgetUnitIds: units.map(unit => unit.budgetUnitId), employeeId: record.employee?.id ?? null, departmentId: record.employee?.departmentId ?? null, secretariatId: record.employee?.secretariatId ?? null };
  if (!canViewModule(user, "TRIBUTACAO") || !canPerformModuleOperation(user, "TRIBUTACAO", "update") || !user.allowedBudgetUnitIds.length) throw new Error("Ator do agendamento exige alteração tributária e UGs explícitas.");
  return { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: user.allowedBudgetUnitIds };
}
