import Link from "next/link";
import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyConsignments({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access;
  const executor = context.database ?? db;
  if (!await arePortalPayrollStatementsEnabled(executor)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const params = await searchParams; const q = (params.q || "").trim();
  const where = sql`c."employeeId"=${employee.id} AND strpos(lower(a.number),lower(${q}))>0 AND r.mode='OFICIAL' AND r.status='FECHADA' AND EXISTS(SELECT 1 FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" sc ON sc.id=s."contractId" WHERE s."runId"=r.id AND sc."employeeId"=${employee.id} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL)`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "HrConsignmentAgreement" a JOIN "HrEmploymentContract" c ON c.id=a."contractId" JOIN "HrPayrollRun" r ON r.id=a."sourceRunId" WHERE ${where}`);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const agreements = await portalRows<{ id: string; number: string; scope: string; rubricCode: string; supplierId: string; registration: string }>(executor, sql`SELECT a.id,a.number,a.scope,a."rubricCode",a."supplierId",c.registration FROM "HrConsignmentAgreement" a JOIN "HrEmploymentContract" c ON c.id=a."contractId" JOIN "HrPayrollRun" r ON r.id=a."sourceRunId" WHERE ${where} ORDER BY a."createdAt" DESC,a.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const installments = await portalRows<{ id: string; agreementId: string; sequence: number; competenceAt: Date; amount: string }>(executor, sql`SELECT * FROM "HrConsignmentInstallment" WHERE "agreementId"=ANY(${sql.param(agreements.map(row => row.id))}::text[]) ORDER BY sequence`);
  const entries = await portalRows<{ installmentId: string; kind: string; reason: string }>(executor, sql`SELECT "installmentId",kind,reason FROM "HrConsignmentEntry" WHERE "installmentId"=ANY(${sql.param(installments.map(row => row.id))}::text[])`);
  const rows = agreements.map(({ registration, ...row }) => ({ ...row, contract: { registration }, installments: installments.filter(item => item.agreementId === row.id).map(item => ({ ...item, amount: new Decimal(item.amount), entries: entries.filter(entry => entry.installmentId === item.id).map(({ kind, reason }) => ({ kind, reason })) })) }));
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
