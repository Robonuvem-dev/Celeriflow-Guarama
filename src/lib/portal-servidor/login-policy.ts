import type { PrismaClient } from "@prisma/client";
import { AccessError, canViewModule, type AppContext } from "@/lib/platform/tenant-context";

export async function assertEmployeePortalLogin(db: PrismaClient, user: AppContext["user"]) {
  const moduleConfig = await db.configuracaoModulo.findUnique({ where: { codigo: "PORTAL_SERVIDOR" }, select: { ativo: true } });
  if (moduleConfig?.ativo === false) throw new AccessError("Portal do Servidor indisponível nesta instância.", 423);
  if (!canViewModule(user, "PORTAL_SERVIDOR") || !user.employeeId) throw new AccessError("Conta sem autorização funcional. Procure o RH.", 403);
  // Functional eligibility depends only on active status, including vacations,
  // leaves and access outside working hours. Account/module RBAC still applies.
  const employee = await db.employee.findFirst({ where: { id: user.employeeId, isActive: true }, select: { id: true } });
  if (!employee) throw new AccessError("Cadastro funcional inativo ou indisponível. Procure o RH.", 403);
  return employee;
}
