import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listServiceRightLedger } from "@/lib/rh/service-right-query";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";
export default async function MyServiceRights({ searchParams }: { searchParams: Promise<{ scope?: string; contractId?: string; periodStart?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const params = await searchParams;
  const scope = ["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"].includes(params.scope || "") ? params.scope! : "PRODUCAO";
  const result = await listServiceRightLedger(access.context.database ?? db, access.employee.id, { scope, contractId: params.contractId || undefined, periodStart: params.periodStart || undefined, page: Math.max(1, Number.parseInt(params.page || "1") || 1) });
  const toolbar = <OperationalFilters label="Filtros e saldo">
    <form className="flex flex-wrap gap-2 text-xs"><input name="contractId" placeholder="Contrato (opcional)" defaultValue={params.contractId} className="rounded border px-2" /><label>Início aquisitivo <input name="periodStart" type="date" defaultValue={params.periodStart} className="rounded border px-2" /></label><select name="scope" defaultValue={scope} className="rounded border px-2"><option>PRODUCAO</option><option>HOMOLOGACAO</option><option>DEMONSTRACAO</option></select><button className="rounded border px-3">Filtrar</button></form>
    <p className="rounded border bg-white p-3 text-sm">{scope} · {result.total} entradas · saldo disponível do filtro: {result.balanceDays} dias</p>
    <p className="text-xs">Reservas de pecúnia representam saldo separado para providência financeira; não comprovam pagamento. Para conferência por aquisitivo, preencha seu início no filtro.</p>
  </OperationalFilters>;
  return <PortalOperationalList id="licenca-premio" label="Minha licença-prêmio" page={result.page} total={result.total} toolbar={toolbar} actions={<Link href="/portal-servidor">Portal</Link>} values={{ scope, contractId: params.contractId, periodStart: params.periodStart }} columns={[portalColumn("registration", "Matrícula", 130, 90, "identifier"), portalColumn("start", "Início aquisitivo", 150, 115), portalColumn("end", "Fim aquisitivo", 140, 110), portalColumn("days", "Dias", 80, 60, "text", "right"), portalColumn("operation", "Operação", 150, 90), portalColumn("kind", "Tipo", 130, 80), portalColumn("input", "Início solicitado", 150, 115), portalColumn("reason", "Fundamento", 250, 120)]} rows={result.rows.map(row => { const memory = row.details as { operation?: string; kind?: string; reason?: string; input?: { start?: string }; policy?: { legalReference?: string } }; return { id: row.id, label: row.contract.registration, values: { registration: row.contract.registration, start: row.periodStart.toISOString().slice(0, 10), end: row.periodEnd.toISOString().slice(0, 10), days: row.quantity.toString(), operation: memory.operation || "—", kind: memory.kind || "—", input: memory.input?.start || "—", reason: memory.reason || memory.policy?.legalReference || "—" } }; })} />;
}
