import type { DatabaseExecutor } from "@/db/transaction";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { activePortalEmployee } from "@/db/repositories/portal-servidor/records";
import { AccessError, canViewModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { isSystemAdministratorEmail } from "@/lib/administration/c3-policy";

export async function assertEmployeePortalLogin(db: DatabaseExecutor, user: AppContext["user"]) {
  const moduleConfig = await findModuleActivation(db, "PORTAL_SERVIDOR");
  if (moduleConfig?.ativo === false) throw new AccessError("Portal do Servidor indisponível nesta instância.", 423);

  // O Administrador Geral possui acesso total/onipresente mesmo sem vínculo direto a um servidor
  if (isSystemAdministrator(user) || isSystemAdministratorEmail(user.email)) {
    if (user.employeeId) {
      const employee = await activePortalEmployee(db, user.employeeId);
      if (employee) return { id: employee.id };
    }
    return { id: "SYSTEM_ADMINISTRATOR" };
  }

  if (!canViewModule(user, "PORTAL_SERVIDOR") || !user.employeeId) throw new AccessError("Conta sem autorização funcional. Procure o RH.", 403);
  // Functional eligibility depends only on active status, including vacations,
  // leaves and access outside working hours. Account/module RBAC still applies.
  const employee = await activePortalEmployee(db, user.employeeId);
  if (!employee) throw new AccessError("Cadastro funcional inativo ou indisponível. Procure o RH.", 403);
  return { id: employee.id };
}
