import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams: MasterDataSearchParams }) { return renderMasterDataPage({ catalog: "banks", title: "Bancos e Agências", pathname: "/cadastros/bancos-agencias", searchParams, tabs: [{ value: "bancos", label: "Bancos", catalog: "banks" }, { value: "agencias", label: "Agências", catalog: "branches" }] }); }
