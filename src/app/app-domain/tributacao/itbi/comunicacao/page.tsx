import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readInternalItbiChannel } from "@/lib/tributacao/itbi-process-channel";
import ItbiChannelClient from "./ItbiChannelClient";
import ItbiCorrespondenceClient from "./ItbiCorrespondenceClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { propertyAddressSchema } from "@/lib/tributacao/property-profile-schema";
import ItbiFieldHistory from "./ItbiFieldHistory";
import { db } from "@/db/client";
import { listFiscalActiveUsers } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries, listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listPageItbiDeclarations, readPageItbiBuyers, readPageItbiGrants } from "@/db/repositories/taxation-pages/itbi";

export const dynamic = "force-dynamic";
export default async function ItbiCommunicationPage({ searchParams }: { searchParams: Promise<{ id?: string; status?: string }> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const declarations = await listPageItbiDeclarations(database, { allowedBudgetUnitIds, status: params.status, order: "created-id" });
  const selected = declarations.find(row => row.id === params.id);
  const channel = selected ? await readInternalItbiChannel(database, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds }, selected.id) : null;
  const [users, grants] = selected ? await Promise.all([listFiscalActiveUsers(database), readPageItbiGrants(database, selected.processId ?? "")]) : [[], []];
  const buyers = selected ? await readPageItbiBuyers(database, selected.id) : [];
  const buyerNames = await listPageTaxpayers(database, { ids: buyers.map(row => row.taxpayerId) });
  const correspondence = selected ? (await listFiscalEntries(database, { entityType: "ITBI_DECLARATION", entityIds: [selected.id], categories: ["ITBI_CORRESPONDENCE"], limit: 1 }))[0] : null;
  const correspondenceData = taxScopeSnapshot(correspondence?.data); const address = propertyAddressSchema.safeParse(correspondenceData.address);
  const fieldHistory = selected ? <ItbiFieldHistory database={database} actor={{ usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds }} id={selected.id}/> : null;
  return <div className="h-full space-y-3 overflow-auto p-4">
    <h1 className="text-lg font-bold">Fila, comunicação e acesso externo do ITBI</h1>
    <form className="flex flex-wrap gap-3 rounded border bg-white p-3 text-xs"><label>Situação<select name="status" defaultValue={params.status ?? ""} className="ml-2 rounded border p-2"><option value="">Todas</option>{["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "IMPUGNADA", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO", "INDEFERIDA"].map(status => <option key={status}>{status}</option>)}</select></label><label>Processo, por ordem de entrada<select name="id" defaultValue={selected?.id ?? ""} className="ml-2 rounded border p-2"><option value="">Selecione</option>{declarations.map(row => <option key={row.id} value={row.id}>{row.createdAt.toLocaleDateString("pt-BR")} · {row.declarationNumber} · {row.protocolNumber} · {row.status}</option>)}</select></label><button className="rounded border p-2">Abrir processo</button></form>
    {channel && <><ItbiChannelClient {...channel} external={false} users={users.map(row => ({ id: row.id, label: `${row.nome} · ${row.email}` }))} grants={grants.map(row => ({ id: row.id, user: row.usuario.nome, status: row.revokedAt ? "Revogado" : row.expiresAt && row.expiresAt <= new Date() ? "Vencido" : "Ativo", expiresAt: row.expiresAt?.toISOString() ?? null }))}/><ItbiCorrespondenceClient key={`${channel.declaration.id}:${channel.declaration.updatedAt}`} declarationId={channel.declaration.id} updatedAt={channel.declaration.updatedAt} buyers={buyerNames.map(row => ({ id: row.id, name: row.company?.corporateName ?? row.person?.fullName ?? row.id }))} initial={{ enabled: correspondenceData.updateAddress === true, buyerId: String(correspondenceData.buyerTaxpayerId ?? ""), address: address.success ? address.data : null }}/></>}
    {fieldHistory}
  </div>;
}
