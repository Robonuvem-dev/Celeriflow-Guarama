import type { PermissionUser } from "@/lib/contracts/identity";
import { canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

/** Clinical access is an explicit RH capability, independent of general editing. */
export function canAccessPersonnelClinicalData(user: PermissionUser): boolean {
  if (isSystemAdministrator(user)) return true;
  if (!canViewModule(user, "RH")) return false;
  return [user.permissions, ...(user.additionalProfiles ?? []).map(profile => profile.permissions)].some(value => {
    if (!value) return false;
    try {
      const permission = JSON.parse(value)?.modules?.RH;
      return permission?.blocked === false && permission.clinicalAccess === true;
    } catch { return false; }
  });
}
