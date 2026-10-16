import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { consignmentMarginSchema } from "@/lib/rh/consignment-margin";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyConsignmentMargin({ searchParams }: { searchParams: Promise<{ competence?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access;
  if (!await arePortalPayrollStatementsEnabled(context.prisma)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const params = await searchParams;
  const competence = /^(0[1-9]|1[0-2])\/\d{4}$/.test(params.competence || "") ? params.competence : undefined;
  const ownStatement: Prisma.HrPayrollStatementWhereInput = { contract: { employeeId: employee.id }, releaseAt: { lte: new Date() }, revokedAt: null };
  const where: Prisma.HrPayrollRunWhereInput = { mode: "OFICIAL", status: "FECHADA", payroll: { type: "Mensal", ...(competence ? { competence } : {}) }, statements: { some: ownStatement } };
  const total = await context.prisma.hrPayrollRun.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.hrPayrollRun.findMany({ where, select: { id: true, scope: true, createdAt: true, payroll: { select: { competence: true } }, statements: { where: ownStatement, take: 1, orderBy: { id: "asc" }, select: { snapshot: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), competence: competence || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Minha margem consignável" description="Memória histórica das folhas oficiais liberadas, com limite compartilhado entre os vínculos." action={<Link href="/portal-servidor/demonstrativos">Demonstrativos</Link>} />
    <form className="flex gap-2 text-xs"><input name="competence" placeholder="MM/AAAA" defaultValue={competence} className="h-8 rounded border px-2" /><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} cálculos · valores históricos não constituem reserva de margem ou autorização de crédito.</p>
    <Link href="/portal-servidor/consignacoes" className="text-xs underline">Consultar contratos e parcelas reservadas</Link>
    {rows.map(row => {
      const margin = z.object({ consignmentMargin: consignmentMarginSchema.nullable().optional() }).parse(row.statements[0].snapshot).consignmentMargin;
      return <section key={row.id} className="rounded border bg-white p-3 text-xs"><strong>{row.payroll.competence} · {row.scope}</strong>{margin ? <><p>Remuneração selecionada R$ {margin.remuneration} · descontos obrigatórios R$ {margin.compulsoryDeductions} · base R$ {margin.base}</p><p>Limite {margin.rate}%: R$ {margin.limit} · utilizado R$ {margin.used} · disponível R$ {margin.available}</p><p>Fundamento: {margin.policy.legalReference}</p><p>{margin.contractIds.length} vínculos no cálculo agregado · versão {row.id}</p></> : <p>Esta versão não contém política e memória de margem consignável. Solicite configuração ao RH para cálculos futuros.</p>}</section>;
    })}
    {!total && <p className="text-sm">Nenhuma folha mensal liberada neste filtro.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="cálculos" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
