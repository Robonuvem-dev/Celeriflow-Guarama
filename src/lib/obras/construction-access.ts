import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { ConstructionAccess } from "./construction-policy";
import { db } from "@/db/client";
import { listActiveConstructionRoles } from "@/db/repositories/registry/construction-updates";

export async function resolveConstructionAccess(context: AppContext): Promise<ConstructionAccess> {
  const administrator = isSystemAdministrator(context.user);
  const { employeeId, departmentId } = context.user;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const roles = employeeId && departmentId ? await listActiveConstructionRoles(context.database ?? db, employeeId, departmentId, today) : [];
  return { administrator, employeeId, departmentId, roles };
}
