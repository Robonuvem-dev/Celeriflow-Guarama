import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CatalogoClient from "./CatalogoClient"

export default async function CatalogoPage({ searchParams }: { searchParams?: Promise<{ kind?: string; new?: string }> }) {
  const params = await searchParams;
  const { prisma } = await getTenantContextForModule("COMPRAS");
  const items = await prisma.catalogItem.findMany({
    orderBy: { createdAt: 'desc' }
  }).catch(() => [])

  return <CatalogoClient items={items} initialKind={params?.kind === "SERVICO" ? "SERVICO" : params?.kind === "PATRIMONIO" ? "PATRIMONIO" : "MATERIAL"} openNew={params?.new === "1"} />
}
