import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import type { PermissionUser } from "@/lib/contracts/identity";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export const personnelScopeSchema = z.object({
  departments: z.union([z.literal("TODOS"), z.array(z.string().trim().min(1).max(200)).max(2000)]),
  rubricCodes: z.union([z.literal("TODOS"), z.array(z.string().regex(/^[A-Z0-9_]+$/)).max(2000)]),
}).strict();
export type PersonnelScope = z.infer<typeof personnelScopeSchema>;

/** Profiles grant their own scope; budget units remain an independent mandatory intersection. */
export function personnelScope(user: PermissionUser): PersonnelScope {
  if (isSystemAdministrator(user)) return { departments: "TODOS", rubricCodes: "TODOS" };
  const scopes: PersonnelScope[] = [];
  if (![user.permissions, ...(user.additionalProfiles ?? []).map(profile => profile.permissions)].some(Boolean)) return { departments: "TODOS", rubricCodes: "TODOS" };
  for (const value of [user.permissions, ...(user.additionalProfiles ?? []).map(profile => profile.permissions)]) {
    if (!value) continue;
    try {
      const permissions = JSON.parse(value), rhModule = permissions?.modules?.RH;
      if (rhModule?.blocked === true || permissions.modulosBloqueados?.includes("RH")) continue;
      if (rhModule && ![rhModule.create, rhModule.update, rhModule.delete, rhModule.issueReports, rhModule.showDashboardCard].some(flag => flag === true)) continue;
      if (!rhModule && Array.isArray(permissions.modulosPermitidos) && !permissions.modulosPermitidos.includes("RH")) continue;
      const parsed = rhModule?.personnelScope === undefined ? { departments: "TODOS" as const, rubricCodes: "TODOS" as const } : personnelScopeSchema.parse(rhModule.personnelScope);
      scopes.push(parsed);
    } catch { /* Malformed scope grants no access. */ }
  }
  const merge = (key: keyof PersonnelScope) => scopes.some(scope => scope[key] === "TODOS") ? "TODOS" as const : [...new Set(scopes.flatMap(scope => scope[key] === "TODOS" ? [] : scope[key]))];
  return { departments: merge("departments"), rubricCodes: merge("rubricCodes") };
}

export function personnelDepartmentWhere(user: PermissionUser, department: SQLWrapper): SQL {
  const scope = personnelScope(user);
  return scope.departments === "TODOS" ? sql`true` : sql`${department}=ANY(${sql.param(scope.departments)}::text[])`;
}

export function personnelEmployeeWhere(user: PermissionUser, department: SQLWrapper, employeeId: SQLWrapper): SQL {
  return sql`(${personnelDepartmentWhere(user, department)} AND ${personnelBudgetEmployeeWhere(employeeId, isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds)})`;
}

export function personnelRubricWhere(user: PermissionUser, code: SQLWrapper): SQL {
  const scope = personnelScope(user);
  return scope.rubricCodes === "TODOS" ? sql`true` : sql`${code}=ANY(${sql.param(scope.rubricCodes)}::text[])`;
}

export function assertPersonnelDepartment(user: PermissionUser, departmentId?: string | null) {
  const scope = personnelScope(user);
  if (scope.departments !== "TODOS" && (!departmentId || !scope.departments.includes(departmentId))) throw new Error("Lotação fora do escopo de RH do perfil.");
}

export function assertPersonnelRubrics(user: PermissionUser, codes: string[]) {
  const scope = personnelScope(user);
  if (scope.rubricCodes !== "TODOS" && codes.some(code => !scope.rubricCodes.includes(code))) throw new Error("Verba fora do escopo de eventos do perfil de RH.");
}
