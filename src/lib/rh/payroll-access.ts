import { assertBudgetUnitAccess, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";

export function accessiblePayrollWhere(user: AppContext["user"]): Prisma.PayrollWhereInput {
  if (isSystemAdministrator(user)) return {};
  return { OR: [{ sstBenefitScope: { is: null } }, { sstBenefitScope: { is: { budgetUnitId: { in: user.allowedBudgetUnitIds } } } }] };
}

export async function assertPayrollBudgetScope(context: AppContext, payrollId: string) {
  const scope = await context.prisma.sstBenefitPayrollScope.findUnique({ where: { payrollId } });
  if (scope) assertBudgetUnitAccess(context.user, scope.budgetUnitId);
}
