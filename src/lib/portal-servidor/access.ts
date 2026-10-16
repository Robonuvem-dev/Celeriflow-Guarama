import { AccessError, getTenantContextForModule, type AppContext } from "@/lib/platform/tenant-context";

export type PortalEmployee = {
  id: string;
  name: string;
  registration: string | null;
  role: { name: string } | null;
  department: { name: string } | null;
  secretariat: { name: string } | null;
};

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

  const employee = await context.prisma.employee.findFirst({
    where: {
      id: employeeId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      registration: true,
      role: { select: { name: true } },
      department: { select: { name: true } },
      secretariat: { select: { name: true } },
    },
  });

  if (!employee) return { status: "UNAVAILABLE" };

  return {
    status: "AVAILABLE",
    context,
    employee,
  };
}
