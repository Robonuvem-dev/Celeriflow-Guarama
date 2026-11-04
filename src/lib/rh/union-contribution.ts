import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { requireValidCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { stablePersonnelJson } from "@/db/repositories/personnel/integration";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate, reportPayrollAllocationSource, reportPayrollPredicate, reportRubricPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

const statementSchema = z.object({
  contract: z.object({ id: z.string(), employeeId: z.string(), registration: z.string(), employee: z.object({ name: z.string().min(1) }) }),
  items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })),
});

/** Documentary paid receipts cannot exceed the actual closed deduction. */
export function assertUnionRemittanceBalance(snapshot: unknown, rubricCode: string, amount: string, existingAmounts: string[]) {
  const source = statementSchema.parse(snapshot);
  const deduction = source.items.filter(item => item.type === "DESCONTO" && item.code === rubricCode).reduce((sum, item) => sum.plus(item.value), new Decimal(0));
  const requested = new Decimal(amount), total = existingAmounts.reduce((sum, value) => sum.plus(value), requested);
  if (!requested.isFinite() || !requested.gt(0) || !requested.eq(requested.toDecimalPlaces(2)) || !deduction.gt(0) || total.gt(deduction)) throw new Error("Recolhimentos certificados não podem superar o desconto da rubrica no demonstrativo fechado.");
  return source;
}

export async function validateUnionRemittance(db: DatabaseExecutor, context: AppContext, input: { contractId: string; startsAt: string; endsAt?: string; status: string; data: Record<string, string> }, previous?: { id: string; data: Record<string, string>; startsAt: Date; endsAt: Date | null }) {
  const data = input.data;
  requireValidCnpj(data.unionCnpj);
  if (input.startsAt !== data.remittedAt || input.endsAt !== data.remittedAt) throw new Error("Informe início e fim da vigência iguais à data do recolhimento comprovado.");
  if (data.remittedAt > new Date().toISOString().slice(0, 10)) throw new Error("Recolhimento efetivo não pode ter data futura.");
  if (previous && (stablePersonnelJson(previous.data) !== stablePersonnelJson(data) || previous.startsAt.toISOString().slice(0, 10) !== input.startsAt || previous.endsAt?.toISOString().slice(0, 10) !== input.endsAt)) throw new Error("A comprovação original é preservada. Cancele o registro e cadastre a retificação com sua fonte documental.");
  const result = await db.execute<{ snapshot: unknown; payrollId: string; contractId: string; competence: string }>(sql`
    SELECT s.snapshot,r."payrollId",s."contractId",p.competence FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId"
    WHERE s.id=${data.statementId} AND r.mode='OFICIAL' AND r.status='FECHADA'`);
  const statement = result.rows[0];
  if (!statement || statement.contractId !== input.contractId) throw new Error("Selecione demonstrativo oficial fechado do contrato informado.");
  await assertPayrollBudgetScope({ ...context, database: db }, statement.payrollId);
  const first = `${statement.competence.slice(3)}-${statement.competence.slice(0, 2)}-01`;
  if (data.remittedAt < first) throw new Error("Recolhimento anterior à competência do desconto.");
  const receipts = await db.execute<{ id: string; data: Record<string, string> }>(sql`SELECT id,data FROM "HrFunctionalRecord" WHERE kind='RECOLHIMENTO_SINDICAL' AND status<>'CANCELADO' AND data->>'statementId'=${data.statementId} AND data->>'rubricCode'=${data.rubricCode} ${previous ? sql`AND id<>${previous.id}` : sql``}`);
  if (input.status !== "CANCELADO" && receipts.rows.some(row => row.data.receiptReference === data.receiptReference)) throw new Error("Este comprovante já foi certificado para a rubrica e demonstrativo.");
  assertUnionRemittanceBalance(statement.snapshot, data.rubricCode, data.amount, input.status === "CANCELADO" ? [] : receipts.rows.map(row => row.data.amount));
}

type Contribution = { data: Record<string, string>; statementId: string; snapshot: unknown; competence: string; gross: string; id: string; actor: string; remunerationPermitted: boolean };
export function unionContributionReport(entries: Contribution[]): PersonnelReport {
  const grouped = new Map<string, { labels: string[]; amount: Decimal; gross: Decimal; receipts: string[]; sources: string[] }>();
  for (const row of entries) {
    const state = statementSchema.parse(row.snapshot), d = row.data;
    if (!row.remunerationPermitted) throw new Error("A remuneração mensal integral alcança folha fora do seu escopo de acesso.");
    const labels = [d.unionName, d.unionCnpj, row.competence, state.contract.registration, state.contract.employee.name, d.pisPasep, d.occupation];
    const key = JSON.stringify([...labels, state.contract.employeeId]);
    const group = grouped.get(key) ?? { labels, amount: new Decimal(0), gross: new Decimal(row.gross), receipts: [], sources: [] };
    if (!group.gross.eq(row.gross)) throw new Error("Remuneração mensal inconsistente entre comprovantes da mesma competência.");
    group.amount = group.amount.plus(d.amount);
    group.receipts.push(`${d.remittedAt}: ${d.receiptReference} — ${d.amount}; rubrica ${d.rubricCode}`);
    group.sources.push(`${row.id}; demonstrativo ${row.statementId}; ${d.source}; ${d.legalReference}; autor ${row.actor}`);
    grouped.set(key, group);
  }
  return { title: "Contribuição sindical — NT/SRT/MTE 202/2009 — recolhimentos comprovados", headers: ["Entidade sindical", "CNPJ da entidade", "Competência do desconto", "Matrícula", "Nome completo", "PIS", "Função exercida", "Remuneração no mês BRL", "Valor recolhido BRL", "Recolhimentos e comprovantes", "Fontes documentais"], rows: [...grouped.values()].sort((a, b) => a.labels.join("|").localeCompare(b.labels.join("|"), "pt-BR")).map(group => [...group.labels, group.gross.toFixed(2), group.amount.toFixed(2), group.receipts.join(" | "), group.sources.join(" | ")]) };
}

export async function buildUnionContributionReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]) {
  const year = input.year ?? new Date().getUTCFullYear(), from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${year}-01-01`), until = input.until ?? `${input.competence?.slice(3) ?? year}-12-31`;
  if (from > until) throw new Error("Período inválido.");
  const result = await db.execute<Contribution>(sql`
    SELECT f.data,s.id "statementId",s.snapshot,"Payroll".competence,monthly.gross,f.id,f."actorId" actor,monthly.permitted "remunerationPermitted"
    FROM "HrFunctionalRecord" f JOIN "HrPayrollStatement" s ON s.id=f.data->>'statementId' AND s."contractId"=f."contractId"
    JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" JOIN "HrEmploymentContract" c ON c.id=s."contractId"
    CROSS JOIN LATERAL (
      SELECT sum(monthly_statement.gross)::text gross,bool_and(${payrollScope ?? sql`true`}) permitted
      FROM "Payroll" JOIN "HrPayrollRun" monthly_run ON monthly_run."payrollId"="Payroll".id
      JOIN "HrPayrollStatement" monthly_statement ON monthly_statement."runId"=monthly_run.id
      WHERE monthly_run.mode='OFICIAL' AND monthly_run.status='FECHADA' AND monthly_statement."contractId"=s."contractId"
        AND "Payroll".competence=(SELECT month_origin.competence FROM "Payroll" month_origin WHERE month_origin.id=r."payrollId")
    ) monthly
    WHERE f.kind='RECOLHIMENTO_SINDICAL' AND f.status<>'CANCELADO' AND r.mode='OFICIAL' AND r.status='FECHADA'
      AND ${payrollScope ?? sql`true`} AND ${personnelBudgetEmployeeWhere(sql`c."employeeId"`, budgetUnitIds)}
      AND ${reportContractPredicate(input, sql`s.snapshot->'contract'`, sql`to_date("Payroll".competence,'MM/YYYY')`, reportPayrollAllocationSource(sql`r.id`, sql`r.snapshot`))}
      AND ${reportPayrollPredicate(input, sql`"Payroll".competence`, sql`"Payroll".type`)} AND ${reportRubricPredicate(input, sql`f.data->>'rubricCode'`)}
      AND to_date("Payroll".competence,'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date
      ${input.competence ? sql`AND "Payroll".competence=${input.competence}` : sql``} ${input.payrollId ? sql`AND "Payroll".id=${input.payrollId}` : sql``}
      ${input.employeeId ? sql`AND c."employeeId"=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND s.snapshot->'contract'->>'departmentId'=${input.departmentId}` : sql``}
      AND (${input.q}='' OR strpos(lower(concat_ws(' ',s.snapshot#>>'{contract,employee,name}',s.snapshot#>>'{contract,registration}',f.data->>'unionName',f.data->>'unionCnpj')),lower(${input.q}))>0)
    ORDER BY "Payroll".competence,f."startsAt",f.id`);
  return unionContributionReport(result.rows);
}
