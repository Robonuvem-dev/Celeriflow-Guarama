import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "signers", title: "Assinantes Legais", pathname: "/cadastros/assinantes-legais", searchParams }); }
