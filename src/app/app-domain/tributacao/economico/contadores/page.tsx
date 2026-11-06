import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { taxRegistrySnapshot as taxScopeSnapshot } from "@/lib/tributacao/registry-data";
import { db } from "@/db/client";
import { readAccountantDirectory } from "@/db/repositories/taxation/accountants";
import AccountantsClient from "./AccountantsClient";

export const dynamic = "force-dynamic";

export default async function AccountantsPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { taxpayers, entries, companiesList } = await readAccountantDirectory(context.database ?? db);

  return (
    <AccountantsClient
      taxpayers={taxpayers.map(taxpayer => {
        const person = taxpayer.person;
        const company = taxpayer.company;
        const label = company?.corporateName ?? person?.fullName ?? taxpayer.id;
        const cpf = person?.cpf ?? "";
        const phone = company?.phone ?? person?.phone ?? "";
        const email = company?.email ?? person?.email ?? "";
        return {
          id: taxpayer.id,
          label,
          cpf,
          phone,
          email
        };
      })}
      companiesList={companiesList ?? []}
      entries={entries.map(entry => {
        const data = taxScopeSnapshot(entry.data);
        return {
          id: entry.id,
          taxpayerId: entry.entityId,
          version: entry.version,
          crc: String(data.crc ?? ""),
          cpf: String(data.cpf ?? ""),
          phone: String(data.phone ?? ""),
          email: String(data.email ?? ""),
          associatedCompanies: Array.isArray(data.associatedCompanies) ? (data.associatedCompanies as string[]) : [],
          reason: String(data.reason ?? "Cadastro inicial"),
          date: entry.createdAt.toISOString(),
          actorId: entry.actorUsuarioId
        };
      })}
    />
  );
}
