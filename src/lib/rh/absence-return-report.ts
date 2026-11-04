import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export async function buildAbsenceReturnReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10), from = input.from ?? `${input.year ?? reference.slice(0, 4)}-01-01`, until = input.until ?? `${input.year ?? reference.slice(0, 4)}-12-31`;
  const result = await db.execute<{ employee: string; registration: string; kind: string; reason: string; start: string; end: string; returnDate: string; department: string | null; source: string; legal: string }>(sql`
    WITH absences AS (
      SELECT l."employeeId",null::text "contractId",'LICENCA' kind,l.type reason,l."startDate"::date start,l."endDate"::date "end",'Leave:'||l.id source,'' legal FROM "Leave" l WHERE l.status NOT IN ('Cancelada','Cancelado','Indeferida')
      UNION ALL SELECT f."employeeId",f."contractId",f.kind,f.name,f."startsAt"::date,f."endsAt"::date,'HrFunctionalRecord:'||f.id,f.data->>'legalReference' FROM "HrFunctionalRecord" f WHERE f.kind IN ('AFASTAMENTO','CESSAO') AND f.status<>'CANCELADO' AND f."endsAt" IS NOT NULL
    ) SELECT e.name employee,v.snapshot->>'registration' registration,a.kind,a.reason,a.start::text,a."end"::text,(a."end"+1)::text "returnDate",v.snapshot->>'departmentId' department,a.source,a.legal
    FROM absences a JOIN "Employee" e ON e.id=a."employeeId" JOIN "HrEmploymentContract" c ON c."employeeId"=e.id AND (a."contractId" IS NULL OR a."contractId"=c.id)
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=a."end" ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
    WHERE a."end"+1 BETWEEN ${from}::date AND ${until}::date AND (v.snapshot->>'admittedAt')::date<=a."end" AND (v.snapshot->>'endsAt' IS NULL OR (v.snapshot->>'endsAt')::date>=a.start)
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`a."end"`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND (${input.q}='' OR strpos(lower(concat_ws(' ',e.name,v.snapshot->>'registration',a.reason,a.kind)),lower(${input.q}))>0)
    ORDER BY a."end",e.name,c.id,a.source`);
  return { title: 'Previsão de retorno de licenças, afastamentos e cessões — posição contratual na referência', headers: ['Servidor', 'Matrícula', 'Modalidade', 'Motivo', 'Início', 'Fim', 'Retorno previsto (dia civil)', 'Lotação histórica ID', 'Origem', 'Fundamento'], rows: result.rows.map(row => [row.employee, row.registration, row.kind, row.reason, row.start, row.end, row.returnDate, row.department ?? '', row.source, row.legal ?? '']) };
}
