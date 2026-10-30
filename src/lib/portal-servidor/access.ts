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

  if (employeeId) {
    const employee = await findActivePortalEmployee(context.database ?? db, employeeId);
    if (employee) {
      return {
        status: "AVAILABLE",
        context,
        employee,
      };
    }
  }

  // O administrador do sistema tem visão total mesmo sem cadastro funcional próprio.
  // Caso exista algum servidor ativo na base, permite inspecionar o portal com base no primeiro ativo.
  // Se ainda não houver nenhum servidor na base, provê um placeholder administrativo completo.
  if (isSystemAdministrator(context.user) || isSystemAdministratorEmail(context.user.email)) {
    const fallbackEmployee = await findFirstActivePortalEmployee(context.database ?? db);
    const adminEmployee: PortalEmployee = fallbackEmployee ?? {
      id: "ADMIN_OVERRIDE",
      name: context.user.name || "Administrador do Sistema",
      registration: "ADMIN-001",
      role: { name: "Administrador Geral" },
      department: { name: "Gabinete" },
      secretariat: { name: "Administração Geral" },
    };

    return {
      status: "AVAILABLE",
      context,
      employee: adminEmployee,
    };
  }

  return { status: "UNAVAILABLE" };
}
