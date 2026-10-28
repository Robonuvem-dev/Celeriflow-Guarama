import "server-only";
import type { Prisma } from "@prisma/client";
import { AccessError, canPerformModuleOperation, canViewModule, getTenantContextForModule, isSystemAdministrator, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";
import { jurisdictionSchema, type PlanningJurisdiction } from "./policy";

export type PlanningContext = AppContext & { jurisdiction: PlanningJurisdiction; connection?: import("@/db/connection").DatabaseConnection };

export async function getPlanningContext(jurisdiction: PlanningJurisdiction): Promise<PlanningContext> {
  jurisdictionSchema.parse(jurisdiction);
  const context = await getTenantContextForModule("PLANEJAMENTO");
  if (jurisdiction === "LEGISLATIVE") {
    const moduleConfig = await context.prisma.configuracaoModulo.findUnique({ where: { codigo: "CAMARA" }, select: { ativo: true } });
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

export function planningEntityWhere(context: PlanningContext): Prisma.GovernmentEntityWhereInput {
  return {
    status: "ATIVA", planningScope: { is: { jurisdiction: context.jurisdiction, isActive: true } },
    ...(isSystemAdministrator(context.user) ? {} : { planningUnits: { some: { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } } }),
  };
}

export function planningInstrumentWhere(context: PlanningContext): Prisma.PlanningInstrumentWhereInput {
  return { governmentEntity: planningEntityWhere(context) };
}

export function planningUnitWhere(context: PlanningContext): Prisma.BudgetUnitWhereInput {
  return {
    planningEntityUnit: { is: { governmentEntity: planningEntityWhere(context) } },
    ...(isSystemAdministrator(context.user) ? {} : { id: { in: context.user.allowedBudgetUnitIds } }),
  };
}

export function planningLineWhere(context: PlanningContext): Prisma.PlanningBudgetLineWhereInput {
  return { instrument: planningInstrumentWhere(context), budgetUnit: planningUnitWhere(context) };
}
