import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readDesifPage } from "@/db/repositories/taxation-pages/desif";
import AgenciasClient from "./AgenciasClient";

export const dynamic = "force-dynamic";

export default async function AgenciasPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const [{ institutions }, taxpayers] = await Promise.all([
    readDesifPage(database),
    listPageTaxpayers(database, { active: true, companyOnly: true, order: "created-asc", limit: 100 }),
  ]);

  return (
    <AgenciasClient
      institutions={institutions.map((row) => ({
        id: row.id,
        name: row.name,
        baseCnpj: row.baseCnpj,
        status: row.status,
        taxpayerId: row.taxpayerId,
        agencies: row.agencies.map((agency) => ({
          id: agency.id,
          code: agency.code,
          name: agency.name,
          fullCnpj: agency.fullCnpj,
          registration: agency.municipalRegistration,
          status: agency.status,
        })),
      }))}
      taxpayers={taxpayers.map((row) => ({
        id: row.id,
        name: row.company?.corporateName ?? row.id,
        document: row.company?.cnpj ?? "",
      }))}
    />
  );
}
