import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { functionalRecordsObservedAt } from "./functional-timeline-query";
import { reportContractPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { payrollPeriod } from "./calculation-engine";

/** Daily contractual positions reconcile legacy leaves and structured absences. */
export async function buildAbsenceDaysReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const period = input.competence ? payrollPeriod(input.competence) : null;
  const from = input.from ?? period?.start.toISOString().slice(0, 10) ?? `${input.year ?? reference.slice(0, 4)}-01-01`, until = input.until ?? period?.end.toISOString().slice(0, 10) ?? `${input.year ?? reference.slice(0, 4)}-12-31`;
  if (from > until) throw new Error("Fim do período anterior ao início.");
  const causes = input.kind === "CAUSAS_AFASTAMENTO";
  const result = await db.execute<Record<string, string>>(sql`
    WITH absences AS (
      SELECT l."employeeId",NULL::text "contractId",l.type cause,l."startDate"::date start,l."endDate"::date finish,'Leave:'||l.id source
      FROM "Leave" l WHERE l.status NOT IN ('Cancelada','Cancelado','Indeferida')
      UNION ALL SELECT f."employeeId",f."contractId",f.name,f."startsAt"::date,coalesce(f."endsAt"::date,${until}::date),'HrFunctionalRecord:'||f.id
      FROM ${functionalRecordsObservedAt(sql`${reference}`)} f WHERE f.kind='AFASTAMENTO' AND f.status<>'CANCELADO'
    ), days AS (
      SELECT e.id employee,c.id contract,e.name,v.snapshot->>'registration' registration,v.snapshot->>'departmentId' department,a.cause,a.source,day::date date
      FROM absences a JOIN "Employee" e ON e.id=a."employeeId"
      JOIN "HrEmploymentContract" c ON c."employeeId"=e.id AND (a."contractId" IS NULL OR a."contractId"=c.id)
      CROSS JOIN LATERAL generate_series(greatest(a.start,${from}::date),least(a.finish,${until}::date),interval '1 day') day
      JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=day::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
      WHERE (v.snapshot->>'admittedAt')::date<=day::date AND (v.snapshot->>'endsAt' IS NULL OR (v.snapshot->>'endsAt')::date>=day::date)
        AND ${reportContractPredicate(input, sql`v.snapshot`, sql`day::date`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
        ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',e.name,v.snapshot->>'registration',a.cause)),lower(${input.q}))>0)
    ) ${causes ? sql`SELECT cause,count(DISTINCT source)::text records,count(DISTINCT employee)::text holders,count(DISTINCT (employee,date))::text days FROM days GROUP BY cause ORDER BY cause`
      : sql`SELECT name,registration,department,cause,count(DISTINCT date)::text days,string_agg(DISTINCT source,'; ' ORDER BY source) sources FROM days GROUP BY employee,contract,name,registration,department,cause ORDER BY name,registration,cause`}`);
  return causes
    ? { title: "Causas de afastamento — fontes legadas e estruturadas; dias por titular não aditivos entre causas", headers: ["Causa", "Registros", "Servidores distintos", "Dias civis por titular"], rows: result.rows.map(row => [row.cause, row.records, row.holders, row.days]) }
    : { title: "Dias de afastamento — união diária por vínculo, causa e lotação histórica", headers: ["Servidor (nome atual)", "Matrícula", "Lotação histórica ID", "Causa", "Dias civis afastados", "Origens"], rows: result.rows.map(row => [row.name, row.registration ?? "", row.department ?? "", row.cause, row.days, row.sources]) };
}
