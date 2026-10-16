import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyConsignments({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access;
  if (!await arePortalPayrollStatementsEnabled(context.prisma)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const params = await searchParams; const q = (params.q || "").trim();
  const where: Prisma.HrConsignmentAgreementWhereInput = { contract: { employeeId: employee.id }, number: { contains: q, mode: "insensitive" }, sourceRun: { mode: "OFICIAL", status: "FECHADA", statements: { some: { contract: { employeeId: employee.id }, releaseAt: { lte: new Date() }, revokedAt: null } } } };
  const total = await context.prisma.hrConsignmentAgreement.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.hrConsignmentAgreement.findMany({ where, select: { id: true, number: true, scope: true, rubricCode: true, supplierId: true, contract: { select: { registration: true } }, installments: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true, competenceAt: true, amount: true, entries: { select: { kind: true, reason: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), q })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Minhas consignações" description="Contratos registrados pelo RH, reservas e parcelas por competência." action={<Link href="/portal-servidor/margem">Margem calculada</Link>} />
    <Link href="/portal-servidor/credito" className="text-xs underline">Solicitar crédito consignado</Link>
    <form className="flex gap-2 text-xs"><input name="q" placeholder="Número do contrato" defaultValue={q} className="h-8 rounded border px-2" /><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} contratos · parcela lançada na folha não comprova repasse à consignatária.</p>
    {rows.map(row => <section key={row.id} className="rounded border bg-white p-3 text-xs"><strong>{row.number} · matrícula {row.contract.registration} · {row.scope}</strong><p>Consignatária {row.supplierId} · rubrica {row.rubricCode}</p><details><summary>{row.installments.length} parcelas</summary><table className="w-full text-left"><thead><tr><th>Parcela</th><th>Competência</th><th>Valor BRL</th><th>Situação</th></tr></thead><tbody>{row.installments.map(item => <tr key={item.id} className="h-7 border-t"><td>{item.sequence}</td><td>{String(item.competenceAt.getUTCMonth() + 1).padStart(2, "0")}/{item.competenceAt.getUTCFullYear()}</td><td>{item.amount.toFixed(2)}</td><td>{item.entries.some(entry => entry.kind === "CANCELAMENTO") ? "Cancelada" : item.entries.some(entry => entry.kind === "LANCAMENTO") ? "Lançada na folha" : "Reservada"}</td></tr>)}</tbody></table></details></section>)}
    {!total && <p className="text-sm">Nenhum contrato disponível neste filtro.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="contratos" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
