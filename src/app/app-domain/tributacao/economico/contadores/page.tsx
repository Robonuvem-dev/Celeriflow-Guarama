import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { taxRegistrySnapshot as taxScopeSnapshot } from "@/lib/tributacao/registry-data";
import { db } from "@/db/client";
import { readAccountantDirectory } from "@/db/repositories/taxation/accountants";
import AccountantsClient from "./AccountantsClient";

export const dynamic = "force-dynamic";
export default async function AccountantsPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { taxpayers, entries } = await readAccountantDirectory(context.database ?? db);
  return <AccountantsClient taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} entries={entries.map(entry => ({ id: entry.id, taxpayerId: entry.entityId, version: entry.version, crc: String(taxScopeSnapshot(entry.data).crc ?? ""), reason: String(taxScopeSnapshot(entry.data).reason ?? "Cadastro inicial"), date: entry.createdAt.toISOString(), actorId: entry.actorUsuarioId }))}/>;
}
