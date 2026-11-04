import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

/** Ledger balances include reservations, indemnities and compensations, as observed at the reference. */
export async function buildRightsPlanningReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const result = await db.execute<Record<string, unknown>>(sql`
    WITH entries AS (
      SELECT r.*,coalesce(r.details->>'scope',(SELECT a.details->>'scope' FROM "HrRightEntry" a WHERE a."contractId"=r."contractId" AND a.kind=r.kind AND a."periodStart"=r."periodStart" AND a."periodEnd"=r."periodEnd" AND a.quantity>0 AND a.details->>'scope' IS NOT NULL ORDER BY a."createdAt",a.id LIMIT 1),'SEM_ESCOPO_DOCUMENTADO') scope
      FROM "HrRightEntry" r WHERE r.kind IN ('FERIAS','LICENCA_PREMIO') AND r."createdAt"<${reference}::date+interval '1 day'
    ), periods AS (
      SELECT "contractId",kind,"periodStart","periodEnd",scope,sum(quantity) balance,
        sum(quantity) FILTER (WHERE quantity>0 AND coalesce(details->>'operation','') NOT LIKE '%CANCEL%' AND NOT (details ? 'cancelsId')) granted,
        min(CASE WHEN quantity>0 THEN (details->>'concessionEndsAt')::date END) deadline,
        max(CASE WHEN quantity>0 THEN coalesce(details->'specialRule'->'data'->>'useWithinMonths',details->'policy'->>'concessionMonths')::int END) concession_months,
        string_agg(DISTINCT coalesce(details->'specialRule'->'data'->>'legalReference',details->'policy'->>'legalReference'),' ; ') legal
      FROM entries GROUP BY "contractId",kind,"periodStart","periodEnd",scope
    ) SELECT e.name,v.snapshot->>'registration' registration,p.kind,p.scope,p."periodStart"::date::text start,p."periodEnd"::date::text "end",p.granted::text,p.balance::text,
      coalesce((p.deadline-1)::text,CASE WHEN p.concession_months IS NOT NULL THEN (p."periodEnd"+interval '1 day'+make_interval(months=>p.concession_months)-interval '1 day')::date::text END,'Sem prazo parametrizado') deadline,
      coalesce(d.name,'Sem lotação histórica') department,
      (SELECT max(v."enjoymentStart")::date::text FROM "Vacation" v WHERE v."employeeId"=e.id AND v.status IN ('Em gozo','Concluída','Concluida') AND v."enjoymentStart"<=${reference}::date AND p.kind='FERIAS') last_enjoyment,
      (SELECT string_agg(coalesce(r.details->>'start',r.details->'input'->>'start')||' ('||abs(r.quantity)::text||' dias)', '; ' ORDER BY r."createdAt",r.id) FROM entries r
        WHERE r."contractId"=c.id AND r.kind=p.kind AND r.scope=p.scope AND r."periodStart"=p."periodStart" AND r."periodEnd"=p."periodEnd" AND r.quantity<0 AND coalesce(r.details->>'kind',r.details->'input'->>'kind')='GOZO'
          AND NOT EXISTS(SELECT 1 FROM entries cancel WHERE cancel.details->>'cancelsId'=r.id)) planned,p.legal
      FROM periods p JOIN "HrEmploymentContract" c ON c.id=p."contractId" JOIN "Employee" e ON e.id=c."employeeId"
      JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
      LEFT JOIN "Department" d ON d.id=v.snapshot->>'departmentId'
       WHERE ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)}
         AND (${input.q}='' OR strpos(lower(e.name||' '||(v.snapshot->>'registration')),lower(${input.q}))>0)
         ${input.from ? sql`AND p."periodEnd"::date>=${input.from}::date` : sql``}
         ${input.until ? sql`AND p."periodStart"::date<=${input.until}::date` : sql``}
        ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
        AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
      ORDER BY d.name,e.name,c.registration,p.kind,p."periodStart"`);
  const columns = [["name", "Servidor"], ["registration", "Matrícula"], ["department", "Lotação na referência"], ["kind", "Direito"], ["scope", "Escopo"], ["start", "Início aquisitivo"], ["end", "Fim aquisitivo"], ["granted", "Dias adquiridos"], ["balance", "Saldo disponível em dias"], ["deadline", "Data-limite de utilização"], ["last_enjoyment", "Início das últimas férias gozadas"], ["planned", "Mapa de gozos / reservas"], ["legal", "Fundamento"]];
  return { title: `Planejamento de férias e licença-prêmio — posição ${reference}`, headers: columns.map(([, label]) => label), rows: result.rows.map(row => columns.map(([key]) => row[key] == null ? "" : String(row[key]))) };
}
