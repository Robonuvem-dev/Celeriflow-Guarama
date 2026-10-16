import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { Prisma } from "@prisma/client";
import { ownReleasedStatementIds } from "@/lib/portal-servidor/payroll-publication";

export const dynamic = "force-dynamic";
export default async function MyStatementsPage({ searchParams }: { searchParams: Promise<{ competence?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access;
  if (!await arePortalPayrollStatementsEnabled(context.prisma)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const params = await searchParams;
  const competence = /^(0[1-9]|1[0-2])\/\d{4}$/.test(params.competence || "") ? params.competence : undefined;
  const where: Prisma.HrPayrollStatementWhereInput = { id: { in: await ownReleasedStatementIds(context.prisma, employee.id, competence) }, contract: { employeeId: employee.id }, releaseAt: { lte: new Date() }, revokedAt: null, run: { mode: "OFICIAL", status: { in: ["FECHADA", "CALCULADA"] }, ...(competence ? { payroll: { competence } } : {}) } };
  const total = await context.prisma.hrPayrollStatement.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.hrPayrollStatement.findMany({ where, include: { contract: true, run: { include: { payroll: true } } }, take: 20, skip: (page - 1) * 20, orderBy: [{ releaseAt: "desc" }, { id: "asc" }] });
  const href = (page: number) => `?${new URLSearchParams({ page: String(page), competence: competence || "" })}`;
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Meus demonstrativos completos" description="Somente versões oficiais liberadas para seus contratos." action={<Link href="/portal-servidor/folha">Lançamentos legados</Link>} />
    <Link href="/portal-servidor/solicitacoes-rh" className="text-xs underline">Solicitações ao RH</Link>
    <Link href="/portal-servidor/margem" className="text-xs underline">Consultar margem consignável</Link>
    <Link href="/portal-servidor/banco-horas" className="text-xs underline">Consultar banco de horas</Link>
    <ErpListFrame toolbar={<form className="flex gap-2"><input name="competence" placeholder="MM/AAAA" defaultValue={competence} className="rounded border px-2 text-xs" /><button className="rounded border px-3 text-xs">Filtrar</button></form>} summary={<p className="text-xs">{total} demonstrativos</p>} pagination={<ErpPagination page={page} total={total} pageSize={20} label="demonstrativos" previousHref={href(page - 1)} nextHref={href(page + 1)} />}>
      <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Competência / matrícula</th><th>Bruto</th><th>Descontos</th><th>Líquido</th><th>Documento</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="h-7 border-t"><td className="px-2">{row.run.payroll.competence} · {row.contract.registration}</td><td>R$ {row.gross.toFixed(2)}</td><td>R$ {row.deductions.toFixed(2)}</td><td>R$ {row.net.toFixed(2)}</td><td><Link target="_blank" href={`/api/portal-servidor/demonstrativos/${row.id}`}>Abrir PDF integral</Link></td></tr>)}</tbody></table>
      {!total && <p className="p-4 text-sm">Nenhum demonstrativo liberado neste filtro.</p>}
    </ErpListFrame>
  </div>;
}
