import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, employees } from "@/db/schema/administration";
import { AccessError, canEditModule, canPerformModuleOperation, getTenantContextForModule, getTenantContextForModuleEdit, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";

export type AttendanceContext = AppContext & {
  attendanceAccess: {
    isAdmin: boolean;
    isManager: boolean;
    isOmbudsman: boolean;
    canView: boolean;
    canEdit: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    authorizationModule: "ATENDIMENTO" | "PROCESSOS";
  };
};

function withAttendanceAccess(context: AppContext, permissionModule: "ATENDIMENTO" | "PROCESSOS"): AttendanceContext {
  const role = context.user.role.toLowerCase();
  const isAdmin = isSystemAdministrator(context.user);
  const isManager = isAdmin || role.includes("gestor");
  const isOmbudsman = isAdmin || role.includes("ouvid");

  return {
    ...context,
    attendanceAccess: {
      isAdmin,
      isManager,
      isOmbudsman,
      canView: true,
      canEdit: canEditModule(context.user, permissionModule),
      canCreate: canPerformModuleOperation(context.user, permissionModule, "create"),
      canUpdate: canPerformModuleOperation(context.user, permissionModule, "update"),
      canDelete: canPerformModuleOperation(context.user, permissionModule, "delete"),
      authorizationModule: permissionModule,
    },
  };
}

export async function getAttendanceContext(required: "view" | "edit" = "view"): Promise<AttendanceContext> {
  const context = required === "edit"
    ? await getTenantContextForModuleEdit("ATENDIMENTO")
    : await getTenantContextForModule("ATENDIMENTO");
  return withAttendanceAccess(context, "ATENDIMENTO");
}

// Ouvidoria is being consolidated under Protocols and Processes. The data model remains
// the same, while access is authorized by the receiving module during the transition.
export async function getOmbudsmanContextForProtocols(): Promise<AttendanceContext> {
  const context = await getTenantContextForModule("PROCESSOS");
  return withAttendanceAccess(context, "PROCESSOS");
}

// Legacy Atendimento pages remain available during the transition. Only a
// verified authorization denial may fall back; infrastructure and session
// failures must remain visible to the caller.
export async function getOmbudsmanReadContext(): Promise<AttendanceContext> {
  try {
    return await getOmbudsmanContextForProtocols();
  } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 403) throw error;
    return getAttendanceContext();
  }
}

export async function getAttendanceOperationalContext() {
  const context = await getAttendanceContext("edit");
  return getOperationalContext(context);
}

export async function getAttendanceOperationalContextForOperation(operation: ModuleOperation) {
  const context = await getTenantContextForModuleOperation("ATENDIMENTO", operation);
  return getOperationalContext(withAttendanceAccess(context, "ATENDIMENTO"));
}

export async function getOmbudsmanOperationalContextForOperation(operation: ModuleOperation) {
  try {
    const context = await getTenantContextForModuleOperation("PROCESSOS", operation);
    return getOperationalContext(withAttendanceAccess(context, "PROCESSOS"));
  } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 403) throw error;
    const context = await getTenantContextForModuleOperation("ATENDIMENTO", operation);
    return getOperationalContext(withAttendanceAccess(context, "ATENDIMENTO"));
  }
}

async function getOperationalContext(context: AttendanceContext) {
  if (!context.user.employeeId) {
    throw new Error("Seu usuario precisa estar vinculado a um servidor para realizar esta operacao.");
  }
  const [row] = await db.select({ employee: employees, department: departments }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId)).where(eq(employees.id, context.user.employeeId)).limit(1);
  const employee = row ? { ...row.employee, department: row.department } : null;
  if (!employee?.isActive || !employee.departmentId || !employee.department?.isActive) {
    throw new Error("Seu vinculo operacional nao esta ativo ou nao possui departamento.");
  }
  return { ...context, employee, departmentId: employee.departmentId };
}

export function canViewOmbudsmanIdentity(context: AttendanceContext, isConfidential: boolean, hasIdentityGrant = false) {
  return !isConfidential || context.attendanceAccess.isAdmin || context.attendanceAccess.isOmbudsman || hasIdentityGrant;
}
