import type { Prisma } from "@prisma/client";
export { secretariatInputSchema } from "./secretariat-input";

export async function resolveSecretariatManager(tx: Prisma.TransactionClient, secretariatId: string, managerId: string | null) {
  if (!managerId) return { managerId: null, managerName: null };
  const employee = await tx.employee.findUnique({ where: { id: managerId }, select: { id: true, name: true, isActive: true, secretariatId: true, departmentId: true, unitId: true, role: { select: { isActive: true } } } });
  if (!employee?.isActive) throw new Error("Selecione um servidor ativo como responsável.");
  if (!employee.role?.isActive) throw new Error("O responsável deve possuir um cargo ativo cadastrado.");
  if (employee.secretariatId !== secretariatId) {
    if (employee.secretariatId || employee.departmentId || employee.unitId) throw new Error("O responsável deve estar lotado nesta secretaria. Atualize a lotação do servidor antes de vinculá-lo.");
    await tx.employee.update({ where: { id: employee.id }, data: { secretariatId } });
  }
  return { managerId: employee.id, managerName: employee.name };
}

export async function assertManagerEmployeeChange(tx: Prisma.TransactionClient, employeeId: string, input: { isActive?: boolean; secretariatId?: string | null; roleId?: string | null }) {
  const secretariats = await tx.secretariat.findMany({ where: { managerId: employeeId }, select: { id: true } });
  if (!secretariats.length) return;
  if (input.isActive === false) throw new Error("Substitua o responsável nas secretarias antes de inativar este servidor.");
  if (input.secretariatId !== undefined && secretariats.some(s => s.id !== input.secretariatId)) throw new Error("Substitua o responsável na secretaria antes de alterar a lotação deste servidor.");
  if (input.roleId !== undefined) {
    const role = input.roleId ? await tx.role.findUnique({ where: { id: input.roleId }, select: { isActive: true } }) : null;
    if (!role?.isActive) throw new Error("O responsável por uma secretaria deve manter um cargo ativo.");
  }
}
