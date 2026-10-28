import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { getPayrollStatement } from "@/lib/rh/statement-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { db } from "@/db/client";
import { readPersonnelStatementSource } from "@/db/repositories/personnel-pages/workforce";

export const dynamic = "force-dynamic";
export default async function StatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"); const { id } = await params;
  const executor = context.database ?? db;
   const source = await readPersonnelStatementSource(executor, id);
  if (!source) throw new Error("Demonstrativo indisponível.");
  await assertPayrollBudgetScope(context, source.run.payrollId);
  const statement = await getPayrollStatement(executor, id);
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title={`${statement.contract.employee.name} · ${statement.competence}`} description={`${statement.payrollType} · matrícula ${statement.contract.registration} · ${statement.mode} · ${statement.scope}`} action={<Link href={`/rh/operacoes/calculos/${source.run.id}`}>Voltar ao cálculo</Link>} />
    <p className="rounded border bg-white p-3 text-sm">Bruto R$ {statement.gross} · descontos R$ {statement.deductions} · líquido R$ {statement.net} · encargos R$ {statement.employer}</p>
    <p className="text-xs">Local: {statement.contract.workLocation} · salário de referência R$ {statement.contract.salary} · {statement.days} dias</p>
    <Link href={`/api/rh/demonstrativos/${id}`} target="_blank" className="text-xs underline">PDF integral</Link>
    {statement.messages.length > 0 && <section className="rounded border bg-white p-3 text-xs"><strong>Mensagens desta versão</strong>{statement.messages.map(message => <p key={message.id} className="whitespace-pre-wrap">{message.text}</p>)}</section>}
    <table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Rubrica</th><th>Tipo</th><th>Valor BRL</th><th>Memória de cálculo</th></tr></thead><tbody>{statement.items.map(item => <tr key={item.code} className="border-t"><td className="p-2">{item.code} · {item.name}</td><td>{item.type}</td><td>{item.value}</td><td className="p-2"><p>Método: {item.method}</p><p>Fórmula: {item.formula || "—"}</p><p>Base: {item.base || "—"} · percentual: {item.rate || "—"} · movimento: {item.movement}</p></td></tr>)}</tbody></table>
    <section className="rounded border bg-white p-3 text-xs"><strong>Bases efetivamente calculadas</strong>{Object.entries(statement.bases).map(([code, value]) => <p key={code}>{code}: R$ {value}</p>)}</section>
    {statement.incomeTax && <section className="rounded border bg-white p-3 text-xs"><strong>IRRF agregado por pessoa física</strong><p>Renda tributável R$ {statement.incomeTax.income} · dedução {statement.incomeTax.deductionMethod}: R$ {statement.incomeTax.deduction} · base R$ {statement.incomeTax.base}</p><p>Imposto preliminar R$ {statement.incomeTax.preliminary} · redução R$ {statement.incomeTax.reduction} · imposto R$ {statement.incomeTax.tax} · referência {statement.incomeTax.referenceDate}</p>{statement.incomeTax.rraMonths && <p>RRA: tabela multiplicada por {statement.incomeTax.rraMonths} meses; sem redução mensal.</p>}</section>}
    {statement.specialPayroll && <details className="rounded border bg-white p-3 text-xs"><summary>Premissas e fórmulas da folha especial POC</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(statement.specialPayroll, null, 2)}</pre></details>}
    {statement.proration && <details className="rounded border bg-white p-3 text-xs"><summary>Rateio por vigência salarial, jornada e lotação</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(statement.proration, null, 2)}</pre></details>}
    {statement.pensions.length > 0 && <section className="rounded border bg-white p-3 text-xs"><strong>Pensões e beneficiários</strong>{statement.pensions.map(pension => <p key={pension.id}>{pension.beneficiary.fullName} · {pension.courtReference} · base {pension.basis} R$ {pension.base} · desconto R$ {pension.amount} · dedução fiscal: {pension.deductFromIncomeTax ? "sim" : "não"}</p>)}</section>}
    {statement.familyWage && <section className="rounded border bg-white p-3 text-xs"><strong>Salário-família agregado por pessoa física</strong><p>Renda R$ {statement.familyWage.income} · limite R$ {statement.familyWage.policy.incomeLimit} · {statement.familyWage.eligibleCount} elegíveis · quota R$ {statement.familyWage.policy.quota} · fator {statement.familyWage.factor} · total R$ {statement.familyWage.amount}</p><p>{statement.familyWage.policy.eligibility.legalReference}</p><details><summary>Elegibilidade e evidências</summary>{statement.familyWage.memory.map(item => <p key={item.dependentId}>{item.dependentId} · {item.relationship} · idade {item.age ?? "ausente"} · {item.eligible ? "Elegível" : item.reasons.join(" · ")} · documentos {item.documentIds.join(", ") || "nenhum requerido/validado"}</p>)}</details></section>}
    {statement.irrfDependents && <section className="rounded border bg-white p-3 text-xs"><strong>Dependentes de IRRF: {statement.irrfDependents.eligibleCount} elegíveis</strong><p>{statement.irrfDependents.policy.legalReference}</p>{statement.irrfDependents.memory.map(item => <p key={item.dependentId}>{item.dependentId} · {item.eligible ? "Elegível" : item.reasons.join(" · ")}</p>)}</section>}
    {statement.consignmentMargin && <section className="rounded border bg-white p-3 text-xs"><strong>Margem consignável compartilhada entre os vínculos</strong><p>Base R$ {statement.consignmentMargin.base} · limite {statement.consignmentMargin.rate}%: R$ {statement.consignmentMargin.limit} · utilizado R$ {statement.consignmentMargin.used} · disponível R$ {statement.consignmentMargin.available}</p><p>{statement.consignmentMargin.policy.legalReference}</p><details><summary>Memória por vínculo e rubrica</summary>{statement.consignmentMargin.memory.map(item => <p key={`${item.contractId}:${item.rubricCode}`}>{item.contractId} · {item.rubricCode} · {item.purpose}: R$ {item.value}</p>)}</details></section>}
    <p className="text-xs text-slate-500">Versão {statement.id} · cálculo em {statement.createdAt.toISOString()}. Dados provenientes do snapshot; a consulta não comprova pagamento.</p>
  </div>;
}
