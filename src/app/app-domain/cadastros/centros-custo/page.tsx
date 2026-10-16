import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "costCenters", title: "Centros de Custo", pathname: "/cadastros/centros-custo", searchParams }); }
