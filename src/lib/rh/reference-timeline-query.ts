import { sql, type SQLWrapper } from "drizzle-orm";

/** Observed history is distinct from a configuration's declared validity. Missing opening evidence stays missing. */
export function referenceRecordsObservedAt(reference: SQLWrapper) {
  return sql`(SELECT state->>'id' id,state->>'kind' kind,state->>'code' code,state->>'name' name,state->'details' details FROM (
    SELECT DISTINCT ON ("referenceId") "afterValue" state FROM "HrReferenceRevision"
    WHERE kind NOT IN ('HR_FUNCTIONAL_RECORD','HR_PAYROLL_RULE_SET','HR_PAYROLL_RULE','HR_VACATION_POLICY','HR_PAYROLL_RUBRIC','HR_SOCIAL_SECURITY_SCHEME','HR_SOCIAL_SECURITY_BAND')
      AND "createdAt"<${reference}::date+interval '1 day' ORDER BY "referenceId","createdAt" DESC,sequence DESC
  ) reference_observations WHERE state IS NOT NULL)`;
}
