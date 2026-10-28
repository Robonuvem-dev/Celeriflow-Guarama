import { sql } from "drizzle-orm";
import { processes } from "@/db/schema/processes";
import { canEditModule, canPerformModuleOperation, getTenantContextForModule, getTenantContextForModuleEdit, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";

export type ProtocolContext = AppContext & {
  protocolAccess: {
    isAdmin: boolean;
    canView: boolean;
    canEdit: boolean;
    canCreate: boolean;
    canUpdate: boolean;
  };
};
export type ProtocolScopeContext = Pick<ProtocolContext, "user" | "protocolAccess">;

function withProtocolAccess(context: AppContext): ProtocolContext {
  const isAdmin = isSystemAdministrator(context.user);
  return {
    ...context,
    protocolAccess: {
      isAdmin,
      canView: true,
      canEdit: canEditModule(context.user, "PROCESSOS"),
      canCreate: canPerformModuleOperation(context.user, "PROCESSOS", "create"),
      canUpdate: canPerformModuleOperation(context.user, "PROCESSOS", "update"),
    },
  };
}

export async function getProtocolContext(required: "view" | "edit" = "view"): Promise<ProtocolContext> {
  const context = required === "edit"
    ? await getTenantContextForModuleEdit("PROCESSOS")
    : await getTenantContextForModule("PROCESSOS");
  return withProtocolAccess(context);
}

export async function getProtocolContextForOperation(
  operation: Extract<ModuleOperation, "create" | "update" | "delete">,
): Promise<ProtocolContext> {
  const context = await getTenantContextForModuleOperation("PROCESSOS", operation);
  return withProtocolAccess(context);
}

/** Historical-sector visibility; callers still guard operational mutations by current sector. */
export function protocolScopeCondition(context: ProtocolScopeContext) {
  if (context.protocolAccess.isAdmin) return sql`TRUE`;
  if (!context.user.departmentId) return sql`${processes.id} = ${"__sem-departamento__"}`;
  const id = context.user.departmentId;
  return sql`(${processes.currentDepartmentId} = ${id} OR EXISTS(SELECT 1 FROM "ProcessMovement" visible_m WHERE visible_m."processId"=${processes.id} AND (visible_m."fromDepartmentId"=${id} OR visible_m."toDepartmentId"=${id})))`;
}
