import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export const bankPreparationReportKinds = ["BANCARIO_ORDEM_DEMO", "BANCARIO_CREDITO_DEMO"] as const;
export async function buildBankPreparationReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL): Promise<PersonnelReport> {
  const from = input.from ?? `${input.year ?? new Date().getUTCFullYear()}-01-01`, until = input.until ?? `${input.year ?? new Date().getUTCFullYear()}-12-31`;
  if (from > until) throw new Error("Fim anterior ao início.");
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT "Payroll".competence,"Payroll".type,r.scope,s.snapshot#>>'{contract,registration}' registration,
      s.snapshot#>>'{contract,employee,name}' employee,s.snapshot#>>'{contract,employee,person,cpf}' cpf,s.net::text net,s.id statement,
      CASE WHEN a.total=1 THEN a.bank END bank,CASE WHEN a.total=1 THEN a.agency END agency,CASE WHEN a.total=1 THEN a.account END account,
      CASE WHEN a.total=1 THEN a.convention END convention,CASE WHEN a.total=1 THEN a.authorization END authorization,
      CASE WHEN a.total=1 THEN 'PREPARADO — dados bancários cadastrados; aguardando envio' WHEN a.total>1 THEN 'PENDENTE — múltiplas contas/convênios vigentes; escolher destino' ELSE 'PENDENTE — sem conta de crédito vigente' END status
    FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" JOIN "HrEmploymentContract" c ON c.id=s."contractId"
    LEFT JOIN LATERAL (
      SELECT count(*)::int total,min(b.compe) bank,min(a.details->>'agency') agency,min(a.details->>'account') account,min(v.name) convention,min(a.details->>'authorization') authorization
      FROM "HrReferenceRecord" a JOIN "HrReferenceRecord" v ON v.id=a.details->>'conventionId' AND v.kind='CONVENIO_BANCARIO' JOIN "Bank" b ON b.id=v.details->>'bankId'
      WHERE a.kind='CONTA_CONVENIO' AND a.details->>'employeeId'=c."employeeId" AND v.details->>'direction'='CREDITO'
        AND (a.details->>'from')::date<=to_date("Payroll".competence,'MM/YYYY') AND (a.details->>'until')::date>= (to_date("Payroll".competence,'MM/YYYY')+interval '1 month - 1 day')::date
        AND (v.details->>'from')::date<=to_date("Payroll".competence,'MM/YYYY') AND (v.details->>'until')::date>= (to_date("Payroll".competence,'MM/YYYY')+interval '1 month - 1 day')::date
    ) a ON true
    WHERE r.status='FECHADA' AND r.mode='OFICIAL' AND r.scope='DEMONSTRACAO' AND ${payrollScope ?? sql`true`}
      AND to_date("Payroll".competence,'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date
      ${input.competence ? sql`AND "Payroll".competence=${input.competence}` : sql``} ${input.payrollId ? sql`AND "Payroll".id=${input.payrollId}` : sql``}
      ${input.employeeId ? sql`AND c."employeeId"=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND s.snapshot#>>'{contract,departmentId}'=${input.departmentId}` : sql``}
      AND (${input.q}='' OR strpos(lower(coalesce(s.snapshot#>>'{contract,employee,name}','')),lower(${input.q}))>0 OR strpos(coalesce(s.snapshot#>>'{contract,registration}',''),${input.q})>0)
    ORDER BY to_date("Payroll".competence,'MM/YYYY'),a.bank,a.convention,s.id`);
  const order = input.kind === "BANCARIO_ORDEM_DEMO";
  const columns = [["competence", "Competência"], ["type", "Tipo de folha"], ["scope", "Escopo"], ["registration", "Matrícula contratual"], ["employee", "Favorecido histórico"], ["cpf", "CPF histórico"], ["bank", "Banco"], ["agency", "Agência"], ["account", "Conta"], ["convention", "Convênio cadastrado"], ["authorization", "Origem da autorização"], ["net", "Líquido do demonstrativo BRL"], ["statement", "Demonstrativo de origem"], ["status", "Situação da preparação"]];
  const rows = result.rows.map(row => [...(order ? [`MODELO:${String(row.statement)}`] : []), ...columns.map(([key]) => row[key] == null ? "" : String(row[key]))]);
  if (!order) {
    const totals = new Map<string, { source: Record<string, unknown>; amount: Decimal; quantity: number }>();
    for (const row of result.rows) {
      const key = JSON.stringify([row.competence, row.type, row.bank, row.convention]);
      const group = totals.get(key) ?? { source: row, amount: new Decimal(0), quantity: 0 };
      group.amount = group.amount.plus(String(row.net)); group.quantity++; totals.set(key, group);
    }
    for (const { source, amount, quantity } of totals.values()) {
      const total: Record<string, unknown> = { competence: source.competence, type: source.type, scope: source.scope, bank: source.bank, convention: source.convention, net: amount.toFixed(2), status: `SUBTOTAL_NAO_ADITIVO — ${quantity} demonstrativo(s); não somar novamente aos registros` };
      rows.push(columns.map(([key]) => total[key] == null ? "" : String(total[key])));
    }
  }
  return {
    title: order ? "Ordem de pagamento — preparação para envio" : "Folha de crédito por convênio — preparação para envio",
    headers: [...(order ? ["Referência do modelo (não é número bancário)"] : []), ...columns.map(([, label]) => label)],
    rows,
  };
}
