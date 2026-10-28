import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { administrativeUnits, departments, employees, roles, secretariats } from "../../schema/administration";
import { resolveEmployeeHierarchy } from "@/lib/administration/c3-policy";

export type EmployeeRelationsInput = {
  secretariatId: string | null;
  departmentId: string | null;
  unitId?: string | null;
};

export async function resolveSecretariatManager(
  db: DatabaseExecutor,
  secretariatId: string,
  managerId: string | null,
): Promise<{ managerId: string | null; managerName: string | null }> {
  if (!managerId) return { managerId: null, managerName: null };
  const [employee] = await db.select({
    id: employees.id, name: employees.name, isActive: employees.isActive, secretariatId: employees.secretariatId,
    departmentId: employees.departmentId, unitId: employees.unitId, role: { isActive: roles.isActive },
  }).from(employees).leftJoin(roles, eq(employees.roleId, roles.id)).where(eq(employees.id, managerId)).limit(1);
  if (!employee?.isActive) throw new Error("Selecione um servidor ativo como responsável.");
  if (!employee.role?.isActive) throw new Error("O responsável deve possuir um cargo ativo cadastrado.");
  if (employee.secretariatId !== secretariatId) {
    if (employee.secretariatId || employee.departmentId || employee.unitId) throw new Error("O responsável deve estar lotado nesta secretaria. Atualize a lotação do servidor antes de vinculá-lo.");
    await db.update(employees).set({ secretariatId }).where(eq(employees.id, employee.id));
  }
  return { managerId: employee.id, managerName: employee.name };
}

export async function assertManagerEmployeeChange(
  db: DatabaseExecutor,
  employeeId: string,
  input: { isActive?: boolean; secretariatId?: string | null; roleId?: string | null },
): Promise<void> {
  const linked = await db.select({ id: secretariats.id }).from(secretariats).where(eq(secretariats.managerId, employeeId));
  if (!linked.length) return;
  if (input.isActive === false) throw new Error("Substitua o responsável nas secretarias antes de inativar este servidor.");
  if (input.secretariatId !== undefined && linked.some(secretariat => secretariat.id !== input.secretariatId)) throw new Error("Substitua o responsável na secretaria antes de alterar a lotação deste servidor.");
  if (input.roleId !== undefined) {
    const [role] = input.roleId ? await db.select({ isActive: roles.isActive }).from(roles).where(eq(roles.id, input.roleId)).limit(1) : [];
    if (!role?.isActive) throw new Error("O responsável por uma secretaria deve manter um cargo ativo.");
  }
}

export async function validateEmployeeRelations(db: DatabaseExecutor, input: EmployeeRelationsInput): Promise<{ secretariatId: string | null }> {
  const [departmentRows, secretariatRows, unitRows] = await Promise.all([
    input.departmentId ? db.select({ id: departments.id, secretariatId: departments.secretariatId, isActive: departments.isActive }).from(departments).where(eq(departments.id, input.departmentId)).limit(1) : Promise.resolve([]),
    input.secretariatId ? db.select({ id: secretariats.id, isActive: secretariats.isActive }).from(secretariats).where(eq(secretariats.id, input.secretariatId)).limit(1) : Promise.resolve([]),
    input.unitId ? db.select({ id: administrativeUnits.id, secretariatId: administrativeUnits.secretariatId, isActive: administrativeUnits.isActive }).from(administrativeUnits).where(eq(administrativeUnits.id, input.unitId)).limit(1) : Promise.resolve([]),
  ]);
  const department = departmentRows[0] ?? null;
  const secretariat = secretariatRows[0] ?? null;
  const unit = unitRows[0] ?? null;
  if (input.departmentId && !department) throw new Error("Departamento não encontrado.");
  if (input.secretariatId && !secretariat) throw new Error("Secretaria não encontrada.");
  if (input.unitId && !unit) throw new Error("Unidade administrativa não encontrada.");
  return resolveEmployeeHierarchy({ requestedSecretariatId: input.secretariatId, department, secretariat, unit });
}
