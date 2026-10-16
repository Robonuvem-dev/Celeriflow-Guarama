import { StructureDetailPage, type StructureSearch } from "@/components/cemeteries/StructurePages";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<StructureSearch> }) { return <StructureDetailPage id={(await params).id} search={await searchParams} />; }
