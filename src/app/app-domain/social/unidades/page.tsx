import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import UnidadesClient from "./UnidadesClient";
import { db } from "@/db/client";
import { listSocialUnits, listSocialRealEstates, listSocialEmployees } from "@/db/repositories/social/queries";

export default async function UnidadesSociaisPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const database = context.database ?? db;
  const unidades = await listSocialUnits(database);
  const realEstates = await listSocialRealEstates(database);
  const employees = await listSocialEmployees(database);

  return (
    <UnidadesClient 
      unidadesInicial={unidades} 
      realEstates={realEstates} 
      employees={employees} 
    />
  );
}
