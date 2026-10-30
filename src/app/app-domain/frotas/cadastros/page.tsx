import { CatalogPage, type CatalogSearch } from "../../patrimonio/cadastros/CatalogPage";
export default function Page({ searchParams }: { searchParams: CatalogSearch }) { return <CatalogPage module="FROTAS" searchParams={searchParams} />; }
