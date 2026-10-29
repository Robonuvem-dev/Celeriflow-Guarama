import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
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
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const rows = await portalStatements(executor, where, sql`s."releaseAt" DESC,s.id ASC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <ErpPageTitle title="Meus demonstrativos completos" description="Somente versões oficiais liberadas para seus contratos." action={<Link href="/portal-servidor/folha">Lançamentos legados</Link>} />
    <OperationalHeaderActions><Link href="/portal-servidor/solicitacoes-rh" className="text-xs underline">Solicitações ao RH</Link>
    <Link href="/portal-servidor/margem" className="text-xs underline">Consultar margem consignável</Link>
    <Link href="/portal-servidor/banco-horas" className="text-xs underline">Consultar banco de horas</Link></OperationalHeaderActions>
    <PortalOperationalList id="demonstrativos" label="Demonstrativos completos" page={page} total={total} values={{ competence }} toolbar={<form className="flex gap-2"><input aria-label="Competência" name="competence" placeholder="MM/AAAA" defaultValue={competence} className="h-7 rounded border px-2 text-xs" /><button>Filtrar</button></form>} columns={[portalColumn("competence", "Competência", 140, 100), portalColumn("registration", "Matrícula", 130, 90, "identifier"), portalColumn("gross", "Bruto", 150, 100, "text", "right"), portalColumn("deductions", "Descontos", 150, 100, "text", "right"), portalColumn("net", "Líquido", 150, 100, "text", "right"), portalColumn("actions", "Documento", 140, 125, "actions", "right", 160)]} rows={rows.map(row => ({ id: row.id, label: row.run.payroll.competence, values: { competence: row.run.payroll.competence, registration: row.contract.registration, gross: `R$ ${row.gross.toFixed(2)}`, deductions: `R$ ${row.deductions.toFixed(2)}`, net: `R$ ${row.net.toFixed(2)}` }, actions: <Link target="_blank" href={`/api/portal-servidor/demonstrativos/${row.id}`}>Abrir PDF integral</Link> }))} />
  </div>;
}
