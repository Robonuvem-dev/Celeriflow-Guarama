import { z } from "zod";

export const vacationEntitlementPolicySchema = z.object({
  origin: z.literal("FALTAS_FERIAS_POC"), estimated: z.literal(true), legalReference: z.string().min(3),
  attendanceStatuses: z.array(z.string().min(1)).min(1),
  bands: z.array(z.object({ minimumAbsences: z.number().int().nonnegative(), maximumAbsences: z.number().int().nonnegative().nullable(), days: z.number().int().min(0).max(90) }).strict()).min(1),
}).strict().superRefine((policy, ctx) => {
  let next = 0;
  for (const [i, band] of policy.bands.entries()) {
    if (band.minimumAbsences !== next || (band.maximumAbsences !== null && band.maximumAbsences < band.minimumAbsences) || (band.maximumAbsences === null && i !== policy.bands.length - 1)) ctx.addIssue({ code: "custom", message: "Faixas de faltas devem ser contínuas e ordenadas." });
    next = (band.maximumAbsences ?? next) + 1;
  }
  if (policy.bands.at(-1)?.maximumAbsences !== null) ctx.addIssue({ code: "custom", message: "A última faixa deve cobrir todas as faltas restantes." });
});

export function vacationDaysForAbsences(rawPolicy: unknown, count: number) {
  const policy = vacationEntitlementPolicySchema.parse(rawPolicy);
  if (!Number.isInteger(count) || count < 0) throw new Error("Quantidade de faltas inválida.");
  return policy.bands.find(band => count >= band.minimumAbsences && (band.maximumAbsences === null || count <= band.maximumAbsences))!.days;
}

/** Municipal special entitlements keep their extra days; absence bands subtract
 * the same number of days as in the ordinary scale. A zero band loses the right. */
export function vacationDaysForConfiguredEntitlement(rawPolicy: unknown, count: number, entitlement: number) {
  const policy = vacationEntitlementPolicySchema.parse(rawPolicy);
  if (!Number.isInteger(entitlement) || entitlement < 0 || entitlement > 90) throw new Error("Direito nominal de férias inválido.");
  const bandDays = vacationDaysForAbsences(policy, count);
  const ordinary = policy.bands[0].days;
  if (!bandDays) return 0;
  return Math.max(0, Math.min(entitlement, entitlement - Math.max(0, ordinary - bandDays)));
}
