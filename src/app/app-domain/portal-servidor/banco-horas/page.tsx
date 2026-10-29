import Link from "next/link";
import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { db } from "@/db/client";
import { portalCount, portalRequired } from "@/db/repositories/portal-servidor/records";
import { portalRights } from "@/db/repositories/portal-servidor/reports";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export const dynamic = "force-dynamic";
export default async function MyTimeBank({ searchParams }: { searchParams: Promise<{ page?: string; contractId?: string; scope?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access; const params = await searchParams;
  const scope = ["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"].includes(params.scope || "") ? params.scope! : "PRODUCAO";
  const executor = context.database ?? db;
  const where = sql`e.kind='BANCO_HORAS' AND c."employeeId"=${employee.id} AND e.details->>'scope'=${scope} ${params.contractId ? sql`AND e."contractId"=${params.contractId}` : sql``}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "HrRightEntry" e JOIN "HrEmploymentContract" c ON c.id=e."contractId" WHERE ${where}`);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const [rows, totals] = await Promise.all([
    portalRights(executor, where, sql`e."periodStart",e.id LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`),
    portalRequired<{ sum: string | null; credits: string | null; debits: string | null }>(executor, sql`SELECT sum(e.quantity) AS sum,sum(e.quantity) FILTER(WHERE e.quantity>0) AS credits,sum(e.quantity) FILTER(WHERE e.quantity<0) AS debits FROM "HrRightEntry" e JOIN "HrEmploymentContract" c ON c.id=e."contractId" WHERE ${where}`),
  ]);
  const sum = { _sum: { quantity: totals.sum === null ? null : new Decimal(totals.sum) } }, credits = { _sum: { quantity: totals.credits === null ? null : new Decimal(totals.credits) } }, debits = { _sum: { quantity: totals.debits === null ? null : new Decimal(totals.debits) } };
  const toolbar = <OperationalFilters label="Filtros e saldo">
    <form className="flex gap-2 text-xs"><input name="contractId" placeholder="ID contrato (opcional)" defaultValue={params.contractId} className="h-8 rounded border px-2" /><select name="scope" defaultValue={scope} className="rounded border px-2"><option>PRODUCAO</option><option>HOMOLOGACAO</option><option>DEMONSTRACAO</option></select><button className="rounded border px-3">Filtrar vínculo</button></form>
    <p className="rounded border bg-white p-3 text-sm">{scope} · {total} entradas · créditos {credits._sum.quantity?.toString() || "0"}h · débitos {debits._sum.quantity?.abs().toString() || "0"}h · saldo {sum._sum.quantity?.toString() || "0"}h</p>
    <p className="text-xs">Saldo reconhecido não implica conversão em pagamento. Entradas legadas sem escopo exigem conciliação pelo RH e não são presumidas como produção.</p>
  </OperationalFilters>;
  return <PortalOperationalList id="banco-horas" label="Meu banco de horas" page={page} total={total} toolbar={toolbar} actions={<Link href="/portal-servidor/ponto">Meu ponto</Link>} values={{ contractId: params.contractId, scope }} columns={[portalColumn("date", "Data", 130, 100), portalColumn("registration", "Matrícula", 130, 90, "identifier"), portalColumn("hours", "Horas", 100, 70, "text", "right"), portalColumn("scope", "Escopo", 150, 100), portalColumn("operation", "Operação", 150, 100), portalColumn("reason", "Fundamento", 240, 110), portalColumn("source", "Origem", 200, 100)]} rows={rows.map(row => ({ id: row.id, label: row.sourceKey, values: { date: row.periodStart.toISOString().slice(0, 10), registration: row.contract.registration, hours: row.quantity.toString(), scope: (row.details as { scope?: string }).scope || "LEGADO/MANUAL", operation: (row.details as { operation?: string }).operation || "PONTO/AJUSTE", reason: (row.details as { reason?: string }).reason || "—", source: row.sourceKey } }))} />;
}
