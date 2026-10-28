import { AccessError, getTenantContextForModule, type AppContext } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { findActivePortalEmployee } from "@/db/repositories/portal-servidor/identity";
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

  if (!employeeId) return { status: "UNAVAILABLE" };

  const employee = await findActivePortalEmployee(context.database ?? db, employeeId);

  if (!employee) return { status: "UNAVAILABLE" };

  return {
    status: "AVAILABLE",
    context,
    employee,
  };
}
