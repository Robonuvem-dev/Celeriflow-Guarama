import { ExactDecimal, competenceInterval } from "./benefit-policy";

export type BenefitCandidate = {
  version: 1; employeeId: string; dependentId: string | null; payrollBenefitId: string;
  competence: string; rubricId: string; eventId: string | null; signedAmount: string;
  category: "MONTHLY" | "EXTRAORDINARY"; direction: "CHARGE" | "REFUND";
  status: "CANDIDATE_ONLY"; blockers: string[];
  configuration: {
    rubricCode: string | null; ruleSetId: string | null; rubricType: string; rubricActive: boolean;
    ruleSetStatus: string; ruleSetScope: string; isDemo: boolean;
    approvedAt: string | null; effectiveFrom: string; effectiveUntil: string | null;
  };
};
type RubricConfiguration = {
  id: string; code?: string; ruleSetId?: string; isActive: boolean; type: string;
  ruleSet: { status: string; scope: string; isDemo: boolean; approvedAt: Date | null; effectiveFrom: Date; effectiveUntil: Date | null };
};
export function buildBenefitCandidate(input: {
  employeeId: string; dependentId: string | null; payrollBenefitId: string; competence: string;
  kind: "MONTHLY" | "EXTRAORDINARY" | "REFUND"; chargeKind?: string;
  amount: string; rubric: RubricConfiguration; eventId: string | null;
}): BenefitCandidate {
  const { start, end } = competenceInterval(input.competence);
  const ruleSet = input.rubric.ruleSet;
  const blockers = ["POSTING_REQUIRES_VALIDATED_FUNCTIONAL_HISTORY"];
  if (!input.eventId) blockers.push("PAYROLL_EVENT_MAPPING_MISSING");
  if (!input.rubric.isActive || input.rubric.type !== "DESCONTO") blockers.push("RUBRIC_INACTIVE_OR_NOT_DISCOUNT");
  if (ruleSet.status !== "ATIVA" || ruleSet.scope !== "PRODUCAO" || ruleSet.isDemo || !ruleSet.approvedAt) blockers.push("PRODUCTION_RULE_SET_NOT_APPROVED");
  if (ruleSet.effectiveFrom > start || (ruleSet.effectiveUntil && ruleSet.effectiveUntil < end)) blockers.push("RULE_SET_OUTSIDE_COMPETENCE");
  if (input.kind === "REFUND") blockers.push("REFUND_POSTING_MAPPING_REQUIRED");
  return {
    version: 1, employeeId: input.employeeId, dependentId: input.dependentId, payrollBenefitId: input.payrollBenefitId,
    competence: input.competence, rubricId: input.rubric.id, eventId: input.eventId,
    signedAmount: new ExactDecimal(input.amount).toFixed(2),
    category: input.kind === "MONTHLY" || input.chargeKind === "MONTHLY" ? "MONTHLY" : "EXTRAORDINARY",
    direction: input.kind === "REFUND" ? "REFUND" : "CHARGE", status: "CANDIDATE_ONLY", blockers,
    configuration: { rubricCode: input.rubric.code ?? null, ruleSetId: input.rubric.ruleSetId ?? null, rubricType: input.rubric.type, rubricActive: input.rubric.isActive,
      ruleSetStatus: ruleSet.status, ruleSetScope: ruleSet.scope, isDemo: ruleSet.isDemo, approvedAt: ruleSet.approvedAt?.toISOString() ?? null,
      effectiveFrom: ruleSet.effectiveFrom.toISOString(), effectiveUntil: ruleSet.effectiveUntil?.toISOString() ?? null },
  };
}

// Observed legacy Float items are comparison evidence, never proof of allocation
// to a beneficiary or of an actual payment date (both are absent in Payroll).
export function reconcileBenefitAmounts(expected: string, observed: { id: string; value: number; payrollStatus: string }[], ambiguousMapping: boolean) {
  const issues = ["BENEFICIARY_ALLOCATION_UNAVAILABLE", "PAYMENT_DATE_UNAVAILABLE"];
  let total = new ExactDecimal(0);
  for (const row of observed) {
    if (row.payrollStatus !== "Paga") issues.push("PAYROLL_NOT_PAID");
    if (row.payrollStatus !== "Aberta") issues.push("CLOSED_COMPETENCE_NO_POSTING");
    if (!Number.isFinite(row.value) || !/^-?\d+(\.\d{1,2})?$/.test(String(row.value))) { issues.push("LEGACY_FLOAT_PRECISION_UNSUPPORTED"); continue; }
    total = total.plus(String(row.value));
  }
  if (ambiguousMapping) issues.push("EVENT_MAPPING_AMBIGUOUS");
  if (!observed.length) issues.push("NO_PAYROLL_ITEMS");
  const difference = new ExactDecimal(expected).minus(total);
  if (!difference.isZero()) issues.push("AMOUNT_MISMATCH");
  return { expected, observed: total.toFixed(2), difference: difference.toFixed(2), itemIds: observed.map((row) => row.id), issues: [...new Set(issues)], status: "UNCONFIRMED" as const };
}
