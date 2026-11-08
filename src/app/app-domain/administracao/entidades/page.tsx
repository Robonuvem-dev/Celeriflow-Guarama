import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { governmentEntities } from "@/db/schema/master-data";
import { asc } from "drizzle-orm";
import EntidadesClient from "./EntidadesClient";

export const dynamic = "force-dynamic";

export default async function AdministracaoEntidadesPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const entities = await (context.database ?? db)
    .select()
    .from(governmentEntities)
    .orderBy(asc(governmentEntities.code));

  return (
    <EntidadesClient
      initialEntities={entities.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name,
        type: e.type,
        cnpj: e.cnpj ?? "",
        status: e.status,
      }))}
    />
  );
}
