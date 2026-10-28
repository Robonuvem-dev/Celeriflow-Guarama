import "server-only";
import { eq } from "drizzle-orm";
import { modules as moduleConfigurations } from "@/db/schema/identity";
import { planningDatabase, type PlanningDatabaseContext } from "./database";
import { AccessError, canPerformModuleOperation, canViewModule, getTenantContextForModule, isSystemAdministrator, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";
import { jurisdictionSchema, type PlanningJurisdiction } from "./policy";

export type PlanningContext = Omit<AppContext, "database"> & PlanningDatabaseContext & { jurisdiction: PlanningJurisdiction };

export async function getPlanningContext(jurisdiction: PlanningJurisdiction): Promise<PlanningContext> {
  jurisdictionSchema.parse(jurisdiction);
  const context = await getTenantContextForModule("PLANEJAMENTO");
  if (jurisdiction === "LEGISLATIVE") {
    const [moduleConfig] = await planningDatabase(context).select({ ativo: moduleConfigurations.ativo }).from(moduleConfigurations).where(eq(moduleConfigurations.codigo, "CAMARA")).limit(1);
    if (moduleConfig?.ativo === false || !canViewModule(context.user, "CAMARA")) throw new AccessError("Acesso negado ao Planejamento da Câmara.", 403);
  }
  return { ...context, jurisdiction };
}

export function assertPlanningOperation(context: PlanningContext, operation: ModuleOperation) {
  if (!canViewModule(context.user, "PLANEJAMENTO") || !canPerformModuleOperation(context.user, "PLANEJAMENTO", operation)) {
    throw new AccessError("Operação de Planejamento não autorizada.", 403);
  }
  if (context.jurisdiction === "LEGISLATIVE" && !canViewModule(context.user, "CAMARA")) throw new AccessError("Acesso à Câmara não autorizado.", 403);
}

export function canDecidePlanningLegally(context: PlanningContext) {
  if (!canPerformModuleOperation(context.user, "PLANEJAMENTO", "update")) return false;
  if (isSystemAdministrator(context.user)) return true;
  try {
    const grants = JSON.parse(context.user.permissions ?? "{}") as { modules?: { PLANEJAMENTO?: { legalApproval?: boolean } } };
    return grants.modules?.PLANEJAMENTO?.legalApproval === true;
  } catch { return false; }
}

export function assertPlanningLegalAuthority(context: PlanningContext) {
  assertPlanningOperation(context, "update");
  if (!canDecidePlanningLegally(context)) throw new AccessError("Decisão legal exige autorização específica de aprovação no Planejamento.", 403);
}
