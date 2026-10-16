import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "cbos", title: "Classificação Brasileira de Ocupações", pathname: "/cadastros/cbo", searchParams }); }
