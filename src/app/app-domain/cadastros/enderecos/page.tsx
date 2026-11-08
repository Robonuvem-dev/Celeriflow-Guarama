import { renderMasterDataPage, type MasterDataSearchParams } from "../master-data-page";

export const dynamic = "force-dynamic";

export default function EnderecosPage({ searchParams }: { searchParams: MasterDataSearchParams }) {
  return renderMasterDataPage({
    catalog: "streets",
    title: "Cadastro de Endereços",
    pathname: "/cadastros/enderecos",
    searchParams,
    tabs: [
      { value: "logradouros", label: "Logradouros", catalog: "streets" },
      { value: "bairros", label: "Bairros", catalog: "neighborhoods" },
      { value: "cidades", label: "Cidades", catalog: "cities" },
    ],
  });
}
