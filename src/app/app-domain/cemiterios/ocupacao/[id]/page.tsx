import { StructureDetailPage, type StructureSearch } from "@/components/cemeteries/StructurePages";
import { CemeteryAttachments } from "@/components/cemeteries/CemeteryAttachments";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<StructureSearch> }) {
  const { id } = await params;
  const search = await searchParams;
  return <StructureDetailPage id={id} search={search} occupancy contextContent={id !== "novo" && <CemeteryAttachments targetType={search.tipo === "SEPULTURA" ? "SEPULTURA" : "LOTE"} targetId={id} />} />;
}
