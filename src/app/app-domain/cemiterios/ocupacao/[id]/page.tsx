import { StructureDetailPage, type StructureSearch } from "@/components/cemeteries/StructurePages";
import { CemeteryAttachments } from "@/components/cemeteries/CemeteryAttachments";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<StructureSearch> }) {
  const { id } = await params;
  const search = await searchParams;
  const detail = await StructureDetailPage({ id, search, occupancy: true });
  return <>{detail}{id !== "novo" && <div className="p-4"><CemeteryAttachments targetType={search.tipo === "SEPULTURA" ? "SEPULTURA" : "LOTE"} targetId={id} /></div>}</>;
}
