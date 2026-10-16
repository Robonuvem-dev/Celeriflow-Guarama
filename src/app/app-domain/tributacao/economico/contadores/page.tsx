import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import AccountantsClient from "./AccountantsClient";

export const dynamic = "force-dynamic";
export default async function AccountantsPage() {
  const { prisma } = await getTenantContextForModule("TRIBUTACAO");
  const [taxpayers, entries] = await Promise.all([
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "TAXPAYER", category: "ACCOUNTANT" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }] }),
  ]);
  return <AccountantsClient taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} entries={entries.map(entry => ({ id: entry.id, taxpayerId: entry.entityId, version: entry.version, crc: String(taxScopeSnapshot(entry.data).crc ?? ""), reason: String(taxScopeSnapshot(entry.data).reason ?? "Cadastro inicial"), date: entry.createdAt.toISOString(), actorId: entry.actorUsuarioId }))}/>;
}
