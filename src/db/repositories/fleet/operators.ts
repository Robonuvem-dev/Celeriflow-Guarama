import { and, asc, eq, getTableColumns } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "../../schema/identity";
import { employees } from "../../schema/administration";
import type { FleetContext } from "@/lib/contracts/fleet";
import { requiredFleetRecord } from "./records";

/** Operational scripts resolve the same persisted identity and explicit ACLs. */
export async function readFleetOperator(db: DatabaseExecutor, email?: string, activeAdministrator = false) {
  const record = requiredFleetRecord(await db.select({
    ...getTableColumns(users), profile: getTableColumns(accessProfiles),
    employee: { departmentId: employees.departmentId, secretariatId: employees.secretariatId },
  }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId))
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .where(and(email ? eq(users.email, email) : undefined, activeAdministrator ? and(eq(users.ativo, true), eq(accessProfiles.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR")) : undefined))
    .orderBy(asc(users.createdAt)).limit(1));
  const [modulePermissions, budgetUnits] = await Promise.all([
    db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(eq(userModulePermissions.usuarioId, record.id)),
    db.select({ budgetUnitId: userBudgetUnits.budgetUnitId }).from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, record.id)),
  ]);
  const context: FleetContext = { database: db, user: {
    id: record.id, name: record.nome, email: record.email, firebaseUid: record.firebaseUid || "",
    role: record.profile.nome, profileCode: record.profile.codigo, permissions: record.profile.permissoes,
    employeeId: record.employeeId, departmentId: record.employee?.departmentId ?? null, secretariatId: record.employee?.secretariatId ?? null,
    modulePermissions, allowedBudgetUnitIds: budgetUnits.map(row => row.budgetUnitId),
  } };
  return { context, active: record.ativo, profileActive: record.profile.ativo };
}
