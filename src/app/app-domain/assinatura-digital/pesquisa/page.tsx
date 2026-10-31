import { GedSectionPage, type GedPageSearch } from "@/components/signatures/ged/GedSectionPage";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: GedPageSearch }) { return <GedSectionPage section="pesquisa" searchParams={searchParams} />; }
