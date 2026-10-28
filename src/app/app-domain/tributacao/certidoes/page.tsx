import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CertidoesClient from "./CertidoesClient";
import { db } from "@/db/client";
import { listCertificatePageRows } from "@/db/repositories/taxation-pages/overview";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";

export default async function CertidoesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const certificates = await listCertificatePageRows(database);
  const rawTaxpayers = await listPageTaxpayers(database);

  const taxpayers = rawTaxpayers.map(tp => ({
    id: tp.id,
    name: tp.company?.corporateName || tp.person?.fullName || "Contribuinte sem nome"
  }));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <CertidoesClient certificates={certificates} taxpayers={taxpayers} />
    </div>
  );
}
