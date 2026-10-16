import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";

export const birthdayPublicationPolicySchema = z.object({
  origin: z.literal("ANIVERSARIANTES_FUNCIONAIS"),
  viewerEmployeeIds: z.array(z.string().min(1)).min(1),
  publishedEmployeeIds: z.array(z.string().min(1)).min(1),
  legalReference: z.string().trim().min(3).max(2000),
}).strict();

export async function listFunctionalBirthdays(context: AppContext, month: number) {
  const input = z.number().int().min(1).max(12).parse(month);
  const employeeId = context.user.employeeId;
  if (!employeeId || !await context.prisma.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } })) throw new AccessError("Acesso funcional indisponível.", 403);
  const now = new Date();
  const rules = await context.prisma.hrPayrollRule.findMany({
    where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } },
    select: { value: true },
  });
  const policies = rules.flatMap(rule => { const policy = birthdayPublicationPolicySchema.safeParse(rule.value); return policy.success && policy.data.viewerEmployeeIds.includes(employeeId) ? [policy.data] : []; });
  if (!policies.length) return { enabled: false as const, rows: [], references: [] };
  const ids = [...new Set(policies.flatMap(policy => policy.publishedEmployeeIds))];
  const employees = await context.prisma.employee.findMany({
    where: { id: { in: ids }, isActive: true, person: { is: { status: "Ativo", birthDate: { not: null } } } },
    select: { name: true, person: { select: { birthDate: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  // Only name and day/month leave this boundary; never year, age or personnel identifiers.
  const rows = employees.flatMap(employee => {
    const date = employee.person?.birthDate;
    return date && date.getUTCMonth() + 1 === input ? [{ name: employee.name, day: date.getUTCDate(), month: input }] : [];
  }).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "pt-BR"));
  return { enabled: true as const, rows, references: [...new Set(policies.map(policy => policy.legalReference))] };
}
