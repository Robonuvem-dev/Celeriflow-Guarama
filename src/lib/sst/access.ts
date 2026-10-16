import { AccessError, assertBudgetUnitAccess, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";

export function sstUnitWhere(context: AppContext) {
  return isSystemAdministrator(context.user) ? {} : { id: { in: context.user.allowedBudgetUnitIds } };
}

export async function assertSstClinicalAccess(context: AppContext, budgetUnitId: string, assess = false) {
  assertBudgetUnitAccess(context.user, budgetUnitId);
  if (isSystemAdministrator(context.user)) return;
  const grant = await context.prisma.sstAccessGrant.findUnique({ where: { usuarioId_budgetUnitId: { usuarioId: context.user.id, budgetUnitId } } });
  if (!grant?.isActive || !grant.canReadClinical || (assess && !grant.canAssess)) throw new AccessError("O perfil não possui autorização clínica ocupacional nesta unidade gestora.", 403);
}
