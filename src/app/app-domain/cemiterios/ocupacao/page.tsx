import { StructureListPage, type StructureSearch } from "@/components/cemeteries/StructurePages";
export default async function Page({ searchParams }: { searchParams: Promise<StructureSearch> }) { return <StructureListPage search={await searchParams} occupancy />; }
