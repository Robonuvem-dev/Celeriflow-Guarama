import Link from "next/link";
import { db } from "@/db/client";
import { readConsignmentsPage } from "@/db/repositories/personnel-pages/workforce";
import { randomUUID } from "node:crypto";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../operacoes/OperationForm";

export const dynamic = "force-dynamic";
export default async function ConsignmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"); const params = await searchParams; const q = (params.q || "").trim();
  const { total, page, rows } = await readConsignmentsPage(context.database ?? db, context.user, q, params.page);
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), q })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Contratos e parcelas de consignação" description="Reserva por competência, lançamentos únicos e histórico compensatório." action={<Link href="/rh/operacoes">Operações</Link>} />
    <OperationForm command="consignacao-reservar" title="Cadastrar contrato e reservar cronograma" fields={[
      { name: "sourceKey", label: "Chave estável do cadastro", value: randomUUID(), required: true },
      { name: "contractId", label: "Contrato funcional", type: "lookup:contract", required: true },
      { name: "supplierId", label: "Consignatária (ID fornecedor/credor)", required: true },
      { name: "sourceRunId", label: "Cálculo mensal oficial de referência", required: true },
      { name: "ruleId", label: "Política JSON de contratos consignados", type: "lookup:rule", required: true },
      { name: "number", label: "Número do contrato / autorização", required: true },
      { name: "rubricCode", label: "Rubrica de desconto", required: true },
      { name: "firstCompetence", label: "Primeira competência MM/AAAA", required: true },
      { name: "count", label: "Quantidade de parcelas", type: "number", value: "1", required: true },
      { name: "amount", label: "Valor de cada parcela (decimal com ponto)", required: true },
      { name: "reason", label: "Autorização / fundamento", type: "textarea", required: true },
    ]} />
    <OperationForm command="consignacao-lancar" title="Gerar movimento de parcela na competência" fields={[{ name: "installmentId", label: "ID parcela", required: true }, { name: "payrollId", label: "Folha mensal da competência", type: "lookup:payroll", required: true }]} />
    <OperationForm command="consignacao-cancelar" title="Cancelar parcela ainda não lançada e liberar reserva" fields={[{ name: "installmentId", label: "ID parcela", required: true }, { name: "reason", label: "Fundamento do cancelamento", type: "textarea", required: true }]} />
    <form className="flex gap-2 text-xs"><input name="q" defaultValue={q} placeholder="Servidor, matrícula ou contrato" className="h-8 rounded border px-2" /><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} contratos no filtro</p>
    {rows.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs"><strong>{row.contract.employee.name} · {row.contract.registration} · contrato {row.number}</strong><p>{row.scope} · consignatária {row.supplierId} · {row.rubricCode} · {row.id}</p><details><summary>{row.installments.length} parcelas / trilha de reserva</summary><table className="w-full text-left"><thead><tr><th>Parcela</th><th>Competência</th><th>Valor</th><th>Situação / ID</th></tr></thead><tbody>{row.installments.map(item => <tr key={item.id} className="h-7 border-t"><td>{item.sequence}</td><td>{String(item.competenceAt.getUTCMonth() + 1).padStart(2, "0")}/{item.competenceAt.getUTCFullYear()}</td><td>R$ {item.amount.toFixed(2)}</td><td>{item.entries.some(entry => entry.kind === "CANCELAMENTO") ? "Cancelada" : item.entries.some(entry => entry.kind === "LANCAMENTO") ? "Lançada" : "Reservada"} · {item.id}<details><summary>Histórico</summary>{item.entries.map(entry => <p key={entry.id}>{entry.kind} · R$ {entry.amount.toFixed(2)} · {entry.reason} · {entry.movementId || "sem movimento"}</p>)}</details></td></tr>)}</tbody></table></details></section>)}
    {!total && <p className="text-sm">Nenhum contrato neste filtro.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="contratos" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
