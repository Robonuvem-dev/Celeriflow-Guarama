import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { ConsignmentList } from "./ConsignmentList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

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
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const agreements = await portalRows<{ id: string; number: string; scope: string; rubricCode: string; supplierId: string; registration: string }>(executor, sql`SELECT a.id,a.number,a.scope,a."rubricCode",a."supplierId",c.registration FROM "HrConsignmentAgreement" a JOIN "HrEmploymentContract" c ON c.id=a."contractId" JOIN "HrPayrollRun" r ON r.id=a."sourceRunId" WHERE ${where} ORDER BY a."createdAt" DESC,a.id LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const installments = await portalRows<{ id: string; agreementId: string; sequence: number; competenceAt: Date; amount: string }>(executor, sql`SELECT * FROM "HrConsignmentInstallment" WHERE "agreementId"=ANY(${sql.param(agreements.map(row => row.id))}::text[]) ORDER BY sequence`);
  const entries = await portalRows<{ installmentId: string; kind: string; reason: string }>(executor, sql`SELECT "installmentId",kind,reason FROM "HrConsignmentEntry" WHERE "installmentId"=ANY(${sql.param(installments.map(row => row.id))}::text[])`);
  const rows = agreements.map(({ registration, ...row }) => ({ ...row, contract: { registration }, installments: installments.filter(item => item.agreementId === row.id).map(item => ({ ...item, amount: new Decimal(item.amount), entries: entries.filter(entry => entry.installmentId === item.id).map(({ kind, reason }) => ({ kind, reason })) })) }));
  return <ConsignmentList page={page} total={total} query={q} contracts={rows.map(row => ({ id: row.id, number: row.number, registration: row.contract.registration, scope: row.scope, supplier: row.supplierId, rubric: row.rubricCode, installments: row.installments.map(item => ({ id: item.id, sequence: item.sequence, competence: `${String(item.competenceAt.getUTCMonth() + 1).padStart(2, "0")}/${item.competenceAt.getUTCFullYear()}`, amount: item.amount.toFixed(2), status: item.entries.some(entry => entry.kind === "CANCELAMENTO") ? "Cancelada" : item.entries.some(entry => entry.kind === "LANCAMENTO") ? "Lançada na folha" : "Reservada" })) }))} />;
}
