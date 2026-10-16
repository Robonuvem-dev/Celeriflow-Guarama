export const EMPLOYEE_PORTAL_ROOT = "/portal-servidor";
export const EMPLOYEE_PORTAL_LOGIN = `${EMPLOYEE_PORTAL_ROOT}/entrar`;
export const EMPLOYEE_PORTAL_RECOVERY = `${EMPLOYEE_PORTAL_ROOT}/recuperar-senha`;
export const EMPLOYEE_PORTAL_PATH_HEADER = "x-celeriflow-employee-path";

export function isEmployeePublicRoute(pathname: string) {
  return pathname === EMPLOYEE_PORTAL_LOGIN || pathname === EMPLOYEE_PORTAL_RECOVERY;
}

/** Only local functional destinations can be used after authentication. */
export function employeePortalDestination(value: string | undefined | null) {
  if (!value || (!value.startsWith(`${EMPLOYEE_PORTAL_ROOT}/`) && !value.startsWith(`${EMPLOYEE_PORTAL_ROOT}?`) && value !== EMPLOYEE_PORTAL_ROOT)) return EMPLOYEE_PORTAL_ROOT;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return EMPLOYEE_PORTAL_ROOT;
  try {
    const url = new URL(value, "https://portal.local");
    if (url.origin !== "https://portal.local" || url.pathname !== EMPLOYEE_PORTAL_ROOT && !url.pathname.startsWith(`${EMPLOYEE_PORTAL_ROOT}/`)) return EMPLOYEE_PORTAL_ROOT;
    if (isEmployeePublicRoute(url.pathname) || url.pathname.includes("%")) return EMPLOYEE_PORTAL_ROOT;
    return url.pathname + url.search;
  } catch {
    return EMPLOYEE_PORTAL_ROOT;
  }
}
