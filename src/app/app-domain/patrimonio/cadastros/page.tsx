import { CatalogPage, type CatalogSearch } from "./CatalogPage";
export default function Page({ searchParams }: { searchParams: CatalogSearch }) { return <CatalogPage module="PATRIMONIO" searchParams={searchParams} />; }
