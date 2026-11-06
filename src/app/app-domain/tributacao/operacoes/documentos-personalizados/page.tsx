import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listFiscalDocumentOptions } from "@/db/repositories/taxation-pages/lookups";
import DocumentosPersonalizadosClient from "./DocumentosPersonalizadosClient";

export const dynamic = "force-dynamic";

export default async function DocumentosPersonalizadosPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;

  const [taxpayers, documents] = await Promise.all([
    listPageTaxpayers(database, { active: true, order: "created-desc", limit: 200 }),
    listFiscalDocumentOptions(database, 100, true),
  ]);

  const name = (t: (typeof taxpayers)[number]) =>
    t.company?.corporateName ?? t.person?.fullName ?? "Contribuinte";

  return (
    <DocumentosPersonalizadosClient
      taxpayers={taxpayers.map((t) => ({
        id: t.id,
        name: name(t),
        document: t.company?.cnpj ?? t.person?.cpf ?? "",
        inscription: t.municipalInsc ?? "",
      }))}
      documentTemplates={documents.map((d) => ({
        id: d.id,
        title: d.title,
      }))}
      currentUser={{
        id: context.user.id,
        name: context.user.name,
      }}
    />
  );
}
