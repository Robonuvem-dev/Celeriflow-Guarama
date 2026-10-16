import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "cities", title: "Localidades", pathname: "/cadastros/localidades", searchParams, tabs: [{ value: "cidades", label: "Cidades", catalog: "cities" }, { value: "bairros", label: "Bairros", catalog: "neighborhoods" }, { value: "logradouros", label: "Logradouros", catalog: "streets" }] }); }
