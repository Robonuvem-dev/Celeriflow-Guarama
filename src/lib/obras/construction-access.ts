import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { ConstructionAccess } from "./construction-policy";

export async function resolveConstructionAccess(context: AppContext): Promise<ConstructionAccess> {
  const administrator = isSystemAdministrator(context.user);
  const { employeeId, departmentId } = context.user;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const roles = employeeId && departmentId ? await context.prisma.constructionStaffRole.findMany({ where: { employeeId, departmentId, isActive: true, employee: { isActive: true, departmentId }, department: { isActive: true }, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] }, select: { role: true } }) : [];
  return { administrator, employeeId, departmentId, roles: roles.map((item) => item.role) };
}
