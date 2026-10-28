import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CatalogoClient from "./CatalogoClient"
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogItems } from "@/db/schema/master-data";

export default async function CatalogoPage({ searchParams }: { searchParams?: Promise<{ kind?: string; new?: string }> }) {
  const params = await searchParams;
  const context = await getTenantContextForModule("COMPRAS");
  const items = await (context.database ?? db).select().from(catalogItems).orderBy(desc(catalogItems.createdAt)).catch(() => [])

  return <CatalogoClient items={items} initialKind={params?.kind === "SERVICO" ? "SERVICO" : params?.kind === "PATRIMONIO" ? "PATRIMONIO" : "MATERIAL"} openNew={params?.new === "1"} />
}
