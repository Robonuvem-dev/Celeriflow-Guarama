import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";

export async function readAnnualCronActor(db: DatabaseExecutor, actorId: string) {
  const [actor] = await db.select({
    id: users.id, ativo: users.ativo, firebaseUid: users.firebaseUid, email: users.email, nome: users.nome,
    perfil: { ativo: accessProfiles.ativo, nome: accessProfiles.nome, codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes },
    employee: { id: employees.id, departmentId: employees.departmentId, secretariatId: employees.secretariatId },
  }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).leftJoin(employees, eq(employees.id, users.employeeId)).where(eq(users.id, actorId)).limit(1);
  if (!actor) return null;
  const [permissions, units] = await Promise.all([
    db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(eq(userModulePermissions.usuarioId, actor.id)),
    db.select({ budgetUnitId: userBudgetUnits.budgetUnitId }).from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, actor.id)),
  ]);
  return { ...actor, permissions, units };
}

export async function readAnnualCronModule(db: DatabaseExecutor) {
  return (await db.select({ ativo: modules.ativo }).from(modules).where(eq(modules.codigo, "TRIBUTACAO")).limit(1))[0] ?? null;
}
