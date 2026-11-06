import { AccessError, getTenantContextForModule, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { isSystemAdministratorEmail } from "@/lib/administration/c3-policy";
import { db } from "@/db/client";
import { findActivePortalEmployee, findFirstActivePortalEmployee } from "@/db/repositories/portal-servidor/identity";
import type { PortalEmployee } from "@/lib/contracts/personnel";
export type { PortalEmployee } from "@/lib/contracts/personnel";

export type EmployeePortalAccess =
  | {
      status: "AVAILABLE";
      context: AppContext;
      employee: PortalEmployee;
    }
  | {
      status: "UNAVAILABLE";
    };

/**
 * Resolves the portal identity exclusively from the authenticated session.
 *
 * This boundary deliberately accepts no employee identifier from the browser.
 * Module authorization and a linked active employee are required before
 * any personal data is returned.
 *
 * Para o Administrador Geral ou contas com perfil de administrador do sistema que ainda não
 * tenham servidor diretamente vinculado ao usuário, um fallback seguro seleciona o primeiro
 * servidor ativo da base para fins de visualização, gestão e testes no ambiente.
 */
export async function getEmployeePortalAccess(): Promise<EmployeePortalAccess> {
  let context: AppContext;
  try {
    context = await getTenantContextForModule("PORTAL_SERVIDOR");
  } catch (error) {
    if (error instanceof AccessError) return { status: "UNAVAILABLE" };
    throw error;
  }
  const employeeId = context.user.employeeId;
  const database = context.database ?? db;

  if (employeeId) {
    const employee = await findActivePortalEmployee(database, employeeId);
    if (employee) {
      return {
        status: "AVAILABLE",
        context,
        employee,
      };
    }
  }

  // Fallback para administradores do sistema sem vínculo direto com servidor
  if (isSystemAdministrator(context.user) || isSystemAdministratorEmail(context.user.email)) {
    const fallbackEmployee = await findFirstActivePortalEmployee(database);
    if (fallbackEmployee) {
      return {
        status: "AVAILABLE",
        context,
        employee: fallbackEmployee,
      };
    }
  }

  return { status: "UNAVAILABLE" };
}
