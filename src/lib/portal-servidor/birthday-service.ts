import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { findActivePortalEmployee, listActivePortalPolicyValues, listPublishedBirthdayEmployees } from "@/db/repositories/portal-servidor/identity";

export const birthdayPublicationPolicySchema = z.object({
  origin: z.literal("ANIVERSARIANTES_FUNCIONAIS"),
  viewerEmployeeIds: z.array(z.string().min(1)).min(1),
  publishedEmployeeIds: z.array(z.string().min(1)).min(1),
  legalReference: z.string().trim().min(3).max(2000),
}).strict();

export async function listFunctionalBirthdays(context: AppContext, month: number) {
  const input = z.number().int().min(1).max(12).parse(month);
  const employeeId = context.user.employeeId;
  const database = context.database ?? db;
  if (!employeeId || !await findActivePortalEmployee(database, employeeId)) throw new AccessError("Acesso funcional indisponível.", 403);
  const now = new Date();
  const rules = await listActivePortalPolicyValues(database, now);
  const policies = rules.flatMap(rule => { const policy = birthdayPublicationPolicySchema.safeParse(rule.value); return policy.success && policy.data.viewerEmployeeIds.includes(employeeId) ? [policy.data] : []; });
  if (!policies.length) return { enabled: false as const, rows: [], references: [] };
  const ids = [...new Set(policies.flatMap(policy => policy.publishedEmployeeIds))];
  const employees = await listPublishedBirthdayEmployees(database, ids);
  // Only name and day/month leave this boundary; never year, age or personnel identifiers.
  const rows = employees.flatMap(employee => {
    const date = employee.birthDate;
    return date && date.getUTCMonth() + 1 === input ? [{ name: employee.name, day: date.getUTCDate(), month: input }] : [];
  }).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "pt-BR"));
  return { enabled: true as const, rows, references: [...new Set(policies.map(policy => policy.legalReference))] };
}
