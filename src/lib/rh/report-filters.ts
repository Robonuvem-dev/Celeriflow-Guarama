import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import { referenceRecordsObservedAt } from "./reference-timeline-query";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

const text = z.string().trim().max(200).optional();
const list = z.string().max(20000).optional();
const competence = z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/).optional();
export const advancedHrReportFields = {
  registrationFrom: text, registrationUntil: text, regimeIds: list, roleIds: list, departmentIds: list,
  locationFrom: text, locationUntil: text, appropriationFrom: text, appropriationUntil: text, classifications: list, functionalClassifications: list,
  competenceFrom: competence, competenceUntil: competence, payrollTypes: list,
  yearFrom: z.coerce.number().int().min(1900).max(2200).optional(), yearUntil: z.coerce.number().int().min(1900).max(2200).optional(),
  order: z.enum(["NOME", "MATRICULA"]).optional(),
};
export type AdvancedHrReportFilters = z.infer<z.ZodObject<typeof advancedHrReportFields>> & { authorizedDepartmentIds?: readonly string[]; authorizedRubricCodes?: readonly string[] };
const parts = (value?: string) => [...new Set((value ?? "").split(",").map(value => value.trim()).filter(Boolean))];
const month = (value: string) => `${value.slice(3)}-${value.slice(0, 2)}-01`;

export function validateAdvancedReportFilters(input: AdvancedHrReportFilters) {
  for (const [from, until, label] of [[input.registrationFrom, input.registrationUntil, "matrícula"], [input.locationFrom, input.locationUntil, "local"], [input.appropriationFrom, input.appropriationUntil, "dotação"]]) {
    if (from && until && from.localeCompare(until, "pt-BR", { numeric: true }) > 0) throw new Error(`Intervalo de ${label} invertido.`);
  }
  if (input.competenceFrom && input.competenceUntil && month(input.competenceFrom) > month(input.competenceUntil)) throw new Error("Intervalo de competências invertido.");
  if (input.yearFrom !== undefined && input.yearUntil !== undefined && input.yearFrom > input.yearUntil) throw new Error("Intervalo de exercícios invertido.");
}

/** Values and classification are resolved from the supplied immutable contract state. */
export function reportContractPredicate(input: AdvancedHrReportFilters, state: SQLWrapper, reference: SQLWrapper, allocations?: SQLWrapper): SQL {
  const clauses: SQL[] = [sql`true`];
  if (input.authorizedDepartmentIds !== undefined) clauses.push(sql`${state}->>'departmentId'=ANY(${sql.param(input.authorizedDepartmentIds)}::text[])`);
  const bound = (expression: SQL, lower?: string, upper?: string) => {
    // Numeric registrations/codes compare numerically, preserving meaningful alphanumeric codes.
    if (lower) clauses.push(sql`CASE WHEN ${expression} ~ '^[0-9]+$' AND ${lower} ~ '^[0-9]+$' THEN (${expression})::numeric>=${lower}::numeric ELSE lower(${expression})>=lower(${lower}) END`);
    if (upper) clauses.push(sql`CASE WHEN ${expression} ~ '^[0-9]+$' AND ${upper} ~ '^[0-9]+$' THEN (${expression})::numeric<=${upper}::numeric ELSE lower(${expression})<=lower(${upper}) END`);
  };
  bound(sql`${state}->>'registration'`, input.registrationFrom, input.registrationUntil);
  bound(sql`${state}->>'workLocation'`, input.locationFrom, input.locationUntil);
  for (const [field, selected] of [["regimeId", parts(input.regimeIds)], ["roleId", parts(input.roleIds)], ["departmentId", parts(input.departmentIds)]] as const) {
    if (selected.length) clauses.push(sql`${state}->>${field}=ANY(${sql.param(selected)}::text[])`);
  }
  const classifications = parts(input.classifications);
  if (input.appropriationFrom || input.appropriationUntil || parts(input.functionalClassifications).length) clauses.push(allocations ? sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${allocations}) allocation WHERE allocation->'details'->>'contractId'=${state}->>'id' AND allocation->'details'->>'from'<=to_char(${reference}::date,'YYYY-MM-DD') AND allocation->'details'->>'until'>=to_char(${reference}::date,'YYYY-MM-DD') AND ${reportAppropriationPredicate(input, sql`allocation->>'appropriation'`)} ${parts(input.functionalClassifications).length ? sql`AND allocation->'details'->>'functionalClassification'=ANY(${sql.param(parts(input.functionalClassifications))}::text[])` : sql``})` : sql`EXISTS (
    SELECT 1 FROM ${referenceRecordsObservedAt(reference)} allocation JOIN "BudgetAppropriation" appropriation ON appropriation.id=allocation.details->>'appropriationId'
    WHERE ((allocation.kind='RATEIO_FOLHA' AND allocation.details->>'contractId'=${state}->>'id') OR (allocation.kind='LOTACAO_ORCAMENTARIA' AND allocation.details->>'employeeId'=${state}->>'employeeId'))
      AND coalesce(allocation.details->>'from','0001-01-01')<=to_char(${reference}::date,'YYYY-MM-DD') AND coalesce(allocation.details->>'until','9999-12-31')>=to_char(${reference}::date,'YYYY-MM-DD')
      AND ${reportAppropriationPredicate(input, sql`appropriation.code`)} ${parts(input.functionalClassifications).length ? sql`AND allocation.details->>'functionalClassification'=ANY(${sql.param(parts(input.functionalClassifications))}::text[])` : sql``})`);
  if (classifications.length) clauses.push(sql`EXISTS (
    SELECT 1 FROM jsonb_array_elements(${state}->'details'->'positionPlan'->'definition'->'periods') period
    CROSS JOIN LATERAL jsonb_array_elements(period->'roles') role
    WHERE period->>'startsAt'<=to_char(${reference}::date,'YYYY-MM-DD') AND (period->>'endsAt' IS NULL OR period->>'endsAt'>=to_char(${reference}::date,'YYYY-MM-DD'))
      AND role->>'roleId'=${state}->>'roleId' AND role->>'classification'=ANY(${sql.param(classifications)}::text[]))`);
  return sql`(${sql.join(clauses, sql` AND `)})`;
}

export function reportEmployeePredicate(input: AdvancedHrReportFilters & { departmentId?: string }, employeeId: SQLWrapper, reference: SQLWrapper): SQL {
  if (input.authorizedDepartmentIds === undefined && ![input.departmentId, input.registrationFrom, input.registrationUntil, input.regimeIds, input.roleIds, input.departmentIds, input.locationFrom, input.locationUntil, input.classifications, input.functionalClassifications, input.appropriationFrom, input.appropriationUntil].some(Boolean)) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM "HrEmploymentContract" filtered_contract
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=filtered_contract.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) filtered_revision ON true
    WHERE filtered_contract."employeeId"=${employeeId} AND ${reportContractPredicate(input, sql`filtered_revision.snapshot`, reference)} ${input.departmentId ? sql`AND filtered_revision.snapshot->>'departmentId'=${input.departmentId}` : sql``})`;
}

/** General rules remain visible for the selected holders only when their targets
 * intersect an authorized contract at the reference; blank targets apply broadly. */
export function reportFunctionalRulePredicate(input: AdvancedHrReportFilters & { employeeId?: string; departmentId?: string }, data: SQLWrapper, reference: SQLWrapper, budgetUnitIds?: readonly string[]): SQL {
  if (budgetUnitIds === undefined && input.authorizedDepartmentIds === undefined && ![input.employeeId, input.departmentId, input.registrationFrom, input.registrationUntil, input.regimeIds, input.roleIds, input.departmentIds, input.locationFrom, input.locationUntil, input.classifications, input.functionalClassifications, input.appropriationFrom, input.appropriationUntil].some(Boolean)) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM "HrEmploymentContract" rule_contract
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=rule_contract.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) rule_revision ON true
    WHERE ${reportContractPredicate(input, sql`rule_revision.snapshot`, reference)}
      AND ${personnelBudgetEmployeeWhere(sql`rule_contract."employeeId"`, budgetUnitIds)}
      AND (coalesce(${data}->>'regimeId','')='' OR ${data}->>'regimeId'=rule_revision.snapshot->>'regimeId')
      AND (coalesce(${data}->>'roleId','')='' OR ${data}->>'roleId'=rule_revision.snapshot->>'roleId')
      AND (coalesce(${data}->>'departmentId','')='' OR ${data}->>'departmentId'=rule_revision.snapshot->>'departmentId')
      ${input.employeeId ? sql`AND rule_contract."employeeId"=${input.employeeId}` : sql``}
      ${input.departmentId ? sql`AND rule_revision.snapshot->>'departmentId'=${input.departmentId}` : sql``})`;
}

export function reportPayrollAllocationSource(runId: SQLWrapper, snapshot: SQLWrapper): SQL {
  return sql`coalesce(nullif(${snapshot}->'accountingAllocations','null'::jsonb),(SELECT evidence.snapshot->'allocations' FROM "HrPayrollAccountingEvidence" evidence WHERE evidence."runId"=${runId}))`;
}

export function reportPayrollPredicate(input: AdvancedHrReportFilters, competence: SQLWrapper, type: SQLWrapper): SQL {
  return sql`true ${input.competenceFrom ? sql`AND to_date(${competence},'MM/YYYY')>=${month(input.competenceFrom)}::date` : sql``}
    ${input.yearFrom !== undefined ? sql`AND extract(year FROM to_date(${competence},'MM/YYYY'))>=${input.yearFrom}` : sql``}
    ${input.yearUntil !== undefined ? sql`AND extract(year FROM to_date(${competence},'MM/YYYY'))<=${input.yearUntil}` : sql``}
    ${input.competenceUntil ? sql`AND to_date(${competence},'MM/YYYY')<=${month(input.competenceUntil)}::date` : sql``}
    ${parts(input.payrollTypes).length ? sql`AND ${type}=ANY(${sql.param(parts(input.payrollTypes))}::text[])` : sql``}`;
}

/** Complete-holder calculations cannot silently include service from unauthorized historical departments. */
export function reportCompleteHistoryPredicate(input: AdvancedHrReportFilters, employeeId: SQLWrapper, reference: SQLWrapper): SQL {
  if (input.authorizedDepartmentIds === undefined) return sql`true`;
  return sql`NOT EXISTS (SELECT 1 FROM "HrEmploymentContract" history_contract JOIN "HrEmploymentRevision" history_revision ON history_revision."contractId"=history_contract.id
    WHERE history_contract."employeeId"=${employeeId} AND history_revision."effectiveFrom"::date<=${reference}::date
      AND NOT coalesce(history_revision.snapshot->>'departmentId'=ANY(${sql.param(input.authorizedDepartmentIds)}::text[]),false))`;
}

export function reportAppropriationPredicate(input: AdvancedHrReportFilters, code: SQLWrapper): SQL {
  return sql`true ${input.appropriationFrom ? sql`AND ${code}>=${input.appropriationFrom}` : sql``} ${input.appropriationUntil ? sql`AND ${code}<=${input.appropriationUntil}` : sql``}`;
}

export function reportRubricPredicate(input: AdvancedHrReportFilters & { rubricCodes?: string }, code: SQLWrapper): SQL {
  return sql`true ${input.authorizedRubricCodes !== undefined ? sql`AND ${code}=ANY(${sql.param(input.authorizedRubricCodes)}::text[])` : sql``}
    ${parts(input.rubricCodes).length ? sql`AND ${code}=ANY(${sql.param(parts(input.rubricCodes))}::text[])` : sql``}`;
}

export function orderPersonnelReport<T extends { headers: string[]; rows: string[][] }>(report: T, input: AdvancedHrReportFilters): T {
  if (!input.order) return report;
  const index = report.headers.findIndex(label => input.order === "MATRICULA" ? /^(Matrícula|Matrícula contratual)$/i.test(label) : /^(Servidor|Nome|Titular)$/i.test(label));
  if (index < 0) return report;
  return { ...report, rows: report.rows.map((row, position) => ({ row, position })).sort((a, b) => (a.row[index] ?? "").localeCompare(b.row[index] ?? "", "pt-BR", { numeric: input.order === "MATRICULA", sensitivity: "base" }) || a.position - b.position).map(entry => entry.row) };
}

export function matchesReportContract(input: AdvancedHrReportFilters, state: { registration: string; regimeId: string; roleId: string; departmentId: string | null; workLocation: string; details?: unknown }, reference: string): boolean {
  if (input.authorizedDepartmentIds !== undefined && (!state.departmentId || !input.authorizedDepartmentIds.includes(state.departmentId))) return false;
  const compare = (value: string, limit: string) => /^[0-9]+$/.test(value) && /^[0-9]+$/.test(limit) ? BigInt(value) < BigInt(limit) ? -1 : BigInt(value) > BigInt(limit) ? 1 : 0 : value.toLocaleLowerCase("pt-BR").localeCompare(limit.toLocaleLowerCase("pt-BR"), "pt-BR");
  if (input.registrationFrom && compare(state.registration, input.registrationFrom) < 0 || input.registrationUntil && compare(state.registration, input.registrationUntil) > 0 || input.locationFrom && compare(state.workLocation, input.locationFrom) < 0 || input.locationUntil && compare(state.workLocation, input.locationUntil) > 0) return false;
  if (parts(input.regimeIds).length && !parts(input.regimeIds).includes(state.regimeId) || parts(input.roleIds).length && !parts(input.roleIds).includes(state.roleId) || parts(input.departmentIds).length && !parts(input.departmentIds).includes(state.departmentId ?? "")) return false;
  if (parts(input.classifications).length) {
    const details = z.object({ positionPlan: z.object({ definition: z.object({ periods: z.array(z.object({ startsAt: z.string(), endsAt: z.string().nullable(), roles: z.array(z.object({ roleId: z.string(), classification: z.string() })) })) }) }) }).safeParse(state.details);
    if (!details.success || !details.data.positionPlan.definition.periods.some(period => period.startsAt <= reference && (!period.endsAt || period.endsAt >= reference) && period.roles.some(role => role.roleId === state.roleId && parts(input.classifications).includes(role.classification)))) return false;
  }
  return true;
}
