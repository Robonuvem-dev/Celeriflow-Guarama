import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import { ownReleasedStatementIds } from "@/lib/portal-servidor/payroll-publication";

export const dynamic = "force-dynamic";
export default async function MyStatementsPage({ searchParams }: { searchParams: Promise<{ competence?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access;
  const executor = context.database ?? db;
  if (!await arePortalPayrollStatementsEnabled(executor)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const params = await searchParams;
  const competence = /^(0[1-9]|1[0-2])\/\d{4}$/.test(params.competence || "") ? params.competence : undefined;
  const ids = await ownReleasedStatementIds(executor, employee.id, competence);
  const where = sql`s.id=ANY(${sql.param(ids)}::text[]) AND c."employeeId"=${employee.id} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL AND r.mode='OFICIAL' AND r.status IN ('FECHADA','CALCULADA') ${competence ? sql`AND p.competence=${competence}` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE ${where}`);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await portalStatements(executor, where, sql`s."releaseAt" DESC,s.id ASC LIMIT 20 OFFSET ${(page - 1) * 20}`);
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
