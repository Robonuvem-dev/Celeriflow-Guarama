import type { DatabaseExecutor } from "@/db/transaction";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { activePortalEmployee } from "@/db/repositories/portal-servidor/records";
import { AccessError, canViewModule, type AppContext } from "@/lib/platform/tenant-context";

export async function assertEmployeePortalLogin(db: DatabaseExecutor, user: AppContext["user"]) {
  const moduleConfig = await findModuleActivation(db, "PORTAL_SERVIDOR");
  if (moduleConfig?.ativo === false) throw new AccessError("Portal do Servidor indisponível nesta instância.", 423);
  if (!canViewModule(user, "PORTAL_SERVIDOR") || !user.employeeId) throw new AccessError("Conta sem autorização funcional. Procure o RH.", 403);
  // Functional eligibility depends only on active status, including vacations,
  // leaves and access outside working hours. Account/module RBAC still applies.
  const employee = await activePortalEmployee(db, user.employeeId);
  if (!employee) throw new AccessError("Cadastro funcional inativo ou indisponível. Procure o RH.", 403);
  return { id: employee.id };
}
