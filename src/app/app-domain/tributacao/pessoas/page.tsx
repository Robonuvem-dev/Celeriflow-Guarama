import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { BulkTaxpayerUpdate } from "./BulkTaxpayerUpdate";
import { db } from "@/db/client";
import { readFiscalPeoplePage } from "@/db/repositories/taxation-pages/cadastral-details";
import { TaxOperationalTable } from "../TaxOperationalTable";

export const dynamic = "force-dynamic";

export default async function PessoasFiscaisPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const requested = Number(params.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { total, taxpayers } = await readFiscalPeoplePage(context.database ?? db, q, page);
  return <TaxOperationalTable id="pessoas" emptyMessage="Nenhum contribuinte encontrado."
    columns={[["name", "Pessoa", 150, 230], ["type", "Tipo", 100, 120], ["addresses", "Endereços", 80, 90], ["document", "Documento", 130, 150, "identifier"], ["inscription", "Inscrição", 100, 130, "identifier"], ["companies", "Empresas", 75, 85], ["properties", "Imóveis", 65, 75], ["status", "Situação", 85, 100, "status"], ["actions", "Ação", 85, 85, "actions"]]}
    toolbar={<form className="flex min-w-0 flex-1 items-center gap-2"><input aria-label="Buscar pessoas fiscais" name="q" defaultValue={q} placeholder="Nome, CPF, CNPJ ou inscrição" className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]" /><button className="h-7 rounded border px-2 text-xs">Buscar</button></form>}
    actions={<div className="flex items-center gap-2"><BulkTaxpayerUpdate query={q} total={total} /><Link href={`/tributacao/pessoas/relatorio?q=${encodeURIComponent(q)}`} className="h-7 rounded bg-emerald-700 px-2 text-xs text-white">Exportar CSV</Link></div>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/tributacao/pessoas" values={{ q }} />}
    rows={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Cadastro sem nome", values: { name: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Cadastro sem nome", type: taxpayer.taxpayerType === "PJ" ? "Pessoa jurídica" : "Pessoa física", addresses: String(taxpayer.company?.addresses.length ?? taxpayer.person?.addresses.length ?? 0), document: taxpayer.company?.cnpj ?? taxpayer.person?.cpf ?? "—", inscription: taxpayer.municipalInsc ?? "Não informada", companies: String(taxpayer._count.economicRegistrations), properties: String(taxpayer._count.realEstates), status: taxpayer.status }, actions: <Link href={`/tributacao/pessoas/${taxpayer.id}`} className="text-emerald-700 underline">Abrir ficha</Link> }))} />;
}
