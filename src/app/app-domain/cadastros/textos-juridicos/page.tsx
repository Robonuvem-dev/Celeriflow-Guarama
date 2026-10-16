import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "legalTexts", title: "Textos Jurídicos", pathname: "/cadastros/textos-juridicos", searchParams }); }
