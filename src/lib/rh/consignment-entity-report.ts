import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate, reportRubricPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export async function buildConsignmentEntityReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10), from = input.from ?? `${input.year ?? reference.slice(0, 4)}-01-01`, until = input.until ?? reference;
  const result = await db.execute<{ supplier: string; creditor: string; employee: string; registration: string; number: string; rubric: string; competence: string; sequence: number; total: number; amount: string; balance: string; scope: string; status: string }>(sql`
    SELECT a."supplierId" supplier,coalesce(p."fullName",company."corporateName",a."supplierId") creditor,e.name employee,v.snapshot->>'registration' registration,a.number,a."rubricCode" rubric,to_char(i."competenceAt",'MM/YYYY') competence,i.sequence,
      (SELECT count(*) FROM "HrConsignmentInstallment" all_i WHERE all_i."agreementId"=a.id)::int total,i.amount::text,coalesce(sum(l.amount),0)::text balance,a.scope,
      CASE WHEN bool_or(l.kind='CANCELAMENTO') THEN 'Cancelada' WHEN bool_or(l.kind='LANCAMENTO') THEN 'Lançada em movimento; não comprova desconto ou repasse' ELSE 'Reservada' END status
    FROM "HrConsignmentAgreement" a JOIN "HrConsignmentInstallment" i ON i."agreementId"=a.id JOIN "HrEmploymentContract" c ON c.id=a."contractId" JOIN "Employee" e ON e.id=c."employeeId"
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<=i."competenceAt" ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
    JOIN "HrPayrollRun" r ON r.id=a."sourceRunId" JOIN "Payroll" ON "Payroll".id=r."payrollId"
    LEFT JOIN "Supplier" supplier ON supplier.id=a."supplierId" LEFT JOIN "Person" p ON p.id=supplier."personId" LEFT JOIN "Company" company ON company.id=supplier."companyId"
    LEFT JOIN "HrConsignmentEntry" l ON l."installmentId"=i.id
    WHERE i."competenceAt"::date BETWEEN date_trunc('month',${from}::date) AND ${until}::date AND ${payrollScope ?? sql`true`}
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`i."competenceAt"`)} AND ${reportRubricPredicate(input, sql`a."rubricCode"`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND (${input.q}='' OR strpos(lower(concat_ws(' ',e.name,v.snapshot->>'registration',a.number,a."supplierId",p."fullName",company."corporateName")),lower(${input.q}))>0)
    GROUP BY a.id,e.id,i.id,v.snapshot,p."fullName",company."corporateName" ORDER BY creditor,a."supplierId",i."competenceAt",e.name,a.number,i.sequence`);
  const totals = new Map<string, { row: typeof result.rows[number]; scheduled: Decimal; balance: Decimal }>();
  const rows = result.rows.map(row => {
    const key = JSON.stringify([row.supplier, row.competence, row.scope]), total = totals.get(key) ?? { row, scheduled: new Decimal(0), balance: new Decimal(0) };
    if (row.status !== 'Cancelada') total.scheduled = total.scheduled.add(row.amount);
    total.balance = total.balance.add(row.balance); totals.set(key, total);
    return ['PARCELA', row.supplier, row.creditor, row.employee, row.registration, row.number, row.rubric, row.competence, `${row.sequence}/${row.total}`, row.scope, row.amount, row.balance, row.status];
  });
  for (const total of totals.values()) rows.push(['TOTAL_NAO_ADITIVO', total.row.supplier, total.row.creditor, '', '', '', 'Todas as rubricas do filtro', total.row.competence, '', total.row.scope, total.scheduled.toFixed(2), total.balance.toFixed(2), 'Somente parcelas não canceladas; não comprova repasse']);
  return { title: 'Consignações por entidade e múltiplas verbas — cronograma e reservas; totais não aditivos', headers: ['Tipo da linha', 'Consignatária ID', 'Credor', 'Servidor', 'Matrícula', 'Contrato consignado', 'Rubrica', 'Competência', 'Parcela atual / total', 'Escopo', 'Valor programado BRL', 'Saldo da reserva BRL', 'Situação / fonte'], rows };
}
