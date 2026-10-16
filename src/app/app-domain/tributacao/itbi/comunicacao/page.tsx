import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readInternalItbiChannel } from "@/lib/tributacao/itbi-process-channel";
import ItbiChannelClient from "./ItbiChannelClient";
import ItbiCorrespondenceClient from "./ItbiCorrespondenceClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { propertyAddressSchema } from "@/lib/tributacao/property-profile-schema";
import ItbiFieldHistory from "./ItbiFieldHistory";

export const dynamic = "force-dynamic";
export default async function ItbiCommunicationPage({ searchParams }: { searchParams: Promise<{ id?: string; status?: string }> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const declarations = await prisma.itbiDeclaration.findMany({ where: { ...(params.status ? { status: params.status } : {}), ...(allowedBudgetUnitIds ? { OR: allowedBudgetUnitIds.map(budgetUnitId => ({ calculationSnapshot: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, select: { id: true, declarationNumber: true, protocolNumber: true, processId: true, status: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const selected = declarations.find(row => row.id === params.id);
  const channel = selected ? await readInternalItbiChannel(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds }, selected.id) : null;
  const [users, grants] = selected ? await Promise.all([prisma.usuario.findMany({ where: { ativo: true, perfil: { ativo: true } }, select: { id: true, nome: true, email: true }, orderBy: { nome: "asc" } }), prisma.processCitizenAccess.findMany({ where: { processId: selected.processId ?? "" }, include: { usuario: { select: { nome: true } } }, orderBy: { grantedAt: "desc" } })]) : [[], []];
  const buyers = selected ? await prisma.itbiParty.findMany({ where: { declarationId: selected.id, role: "ADQUIRENTE" } }) : [];
  const buyerNames = await prisma.taxpayer.findMany({ where: { id: { in: buyers.map(row => row.taxpayerId) } }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } });
  const correspondence = selected ? await prisma.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: selected.id, category: "ITBI_CORRESPONDENCE" }, orderBy: { version: "desc" } }) : null;
  const correspondenceData = taxScopeSnapshot(correspondence?.data); const address = propertyAddressSchema.safeParse(correspondenceData.address);
  const fieldHistory = selected ? <ItbiFieldHistory prisma={prisma} actor={{ usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds }} id={selected.id}/> : null;
  return <div className="h-full space-y-3 overflow-auto p-4">
    <h1 className="text-lg font-bold">Fila, comunicação e acesso externo do ITBI</h1>
    <form className="flex flex-wrap gap-3 rounded border bg-white p-3 text-xs"><label>Situação<select name="status" defaultValue={params.status ?? ""} className="ml-2 rounded border p-2"><option value="">Todas</option>{["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "IMPUGNADA", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO", "INDEFERIDA"].map(status => <option key={status}>{status}</option>)}</select></label><label>Processo, por ordem de entrada<select name="id" defaultValue={selected?.id ?? ""} className="ml-2 rounded border p-2"><option value="">Selecione</option>{declarations.map(row => <option key={row.id} value={row.id}>{row.createdAt.toLocaleDateString("pt-BR")} · {row.declarationNumber} · {row.protocolNumber} · {row.status}</option>)}</select></label><button className="rounded border p-2">Abrir processo</button></form>
    {channel && <><ItbiChannelClient {...channel} external={false} users={users.map(row => ({ id: row.id, label: `${row.nome} · ${row.email}` }))} grants={grants.map(row => ({ id: row.id, user: row.usuario.nome, status: row.revokedAt ? "Revogado" : row.expiresAt && row.expiresAt <= new Date() ? "Vencido" : "Ativo", expiresAt: row.expiresAt?.toISOString() ?? null }))}/><ItbiCorrespondenceClient key={`${channel.declaration.id}:${channel.declaration.updatedAt}`} declarationId={channel.declaration.id} updatedAt={channel.declaration.updatedAt} buyers={buyerNames.map(row => ({ id: row.id, name: row.company?.corporateName ?? row.person?.fullName ?? row.id }))} initial={{ enabled: correspondenceData.updateAddress === true, buyerId: String(correspondenceData.buyerTaxpayerId ?? ""), address: address.success ? address.data : null }}/></>}
    {fieldHistory}
  </div>;
}
