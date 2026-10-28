import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError, getOptionalTenantContext } from "@/lib/platform/tenant-context";
import { EMPLOYEE_PORTAL_LOGIN, EMPLOYEE_PORTAL_PATH_HEADER, employeePortalDestination, isEmployeePublicRoute } from "@/lib/portal-servidor/routes";
import { EmployeePortalShell } from "@/components/portal-servidor/EmployeePortalShell";
import { getInstitutionalContact } from "@/lib/portal-institucional/public-content";
import { assertEmployeePortalLogin } from "@/lib/portal-servidor/login-policy";
import { db } from "@/db/client";

export default async function PortalServidorLayout({ children }: { children: React.ReactNode }) {
  const requestedPath = (await headers()).get(EMPLOYEE_PORTAL_PATH_HEADER) || "/portal-servidor";
  const pathname = requestedPath.split("?")[0];
  if (isEmployeePublicRoute(pathname)) return <>{children}</>;

  const context = await getOptionalTenantContext();
  if (!context) redirect(`${EMPLOYEE_PORTAL_LOGIN}?${new URLSearchParams({ returnTo: employeePortalDestination(requestedPath) })}`);
  // Recheck the current functional status even when a cookie was issued earlier.
  try {
    await assertEmployeePortalLogin(context.database ?? db, context.user);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    redirect(`${EMPLOYEE_PORTAL_LOGIN}?${new URLSearchParams({ returnTo: employeePortalDestination(requestedPath), access: "unavailable" })}`);
  }
  const institution = await getInstitutionalContact();
  return <EmployeePortalShell institutionName={institution.name} userName={context.user.name}>{children}</EmployeePortalShell>;
}
