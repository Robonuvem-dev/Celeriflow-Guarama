import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { loadPriceResearchDetail, listPriceResearchSuppliers } from "@/db/repositories/procurement/price-research";
import { isSubmittedPriceQuote } from "@/lib/compras/price-research";
import { PrintCatalogReport } from "../../../cadastros/PrintCatalogReport";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
export const dynamic = "force-dynamic";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("COMPRAS", "issueReports");
  const { id } = await params;
  const database = context.database ?? db;
  const research = await loadPriceResearchDetail(database, id);
  if (!research) notFound();
  const quotes = research.quotes.filter(quote => isSubmittedPriceQuote(quote.status));
  const unitQuotes = (await listProcurementAuxiliaryRecords(database, "cotacoes-itens")).filter(row => row.fields.pesquisaId === id);
  const suppliers = await listPriceResearchSuppliers(database);
  return <main className="space-y-4 p-4">
    <Link className="print:hidden" href={`/compras/pesquisas-precos/${id}`}>Voltar à pesquisa</Link>
    <h1 className="text-xl font-semibold">Relatório de pesquisa de preços por SD</h1>
    <p>SD: {research.process.purchaseRequest?.number || "Não vinculada"} · Processo: {research.process.number}</p><p>{research.process.object}</p><PrintCatalogReport />
    <h2>Itens pesquisados</h2>
    <table className="w-full text-left"><thead><tr><th>Descrição</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>{research.process.items.map(item => <tr key={item.id}><td>{item.catalogItem?.name || item.material?.name || item.customName}</td><td>{item.quantity}</td><td>{item.catalogItem?.unit || item.material?.unitOfMeasure || "UN"}</td></tr>)}</tbody></table>
    <h2>Cotações discriminadas por item</h2>
    <Link className="underline print:hidden" href="/compras/cadastros/cotacoes-itens">Registrar cotação unitária</Link>
    <table className="w-full text-left"><thead><tr><th>Item</th><th>Fornecedor</th><th>Data</th><th>Quantidade</th><th>Preço unitário</th><th>Total</th></tr></thead><tbody>{unitQuotes.map(quote => {
      const item = research.process.items.find(item => item.id === quote.fields.itemProcessoId);
      const supplier = suppliers.find(supplier => supplier.id === quote.fields.fornecedorId);
      const unit = Number(quote.fields.valorUnitario.replace(",", "."));
      return <tr key={quote.id}><td>{item?.catalogItem?.name || item?.material?.name || item?.customName || "Item indisponível"}</td><td>{supplier?.person?.fullName || supplier?.company?.tradeName || supplier?.company?.corporateName || "Fornecedor indisponível"}</td><td>{quote.fields.data}</td><td>{item?.quantity ?? "—"}</td><td>{money.format(unit)}</td><td>{item ? money.format(unit * item.quantity) : "—"}</td></tr>;
    })}</tbody></table>
    {!unitQuotes.length && <p>Não há cotações unitárias registradas nesta pesquisa.</p>}
    <h2>Propostas globais apresentadas pelo portal</h2>
    <table className="w-full text-left"><thead><tr><th>Fornecedor</th><th>Apresentação</th><th>Valor global</th></tr></thead><tbody>{quotes.map(quote => <tr key={quote.id}><td>{quote.supplier.person?.fullName || quote.supplier.company?.tradeName || quote.supplier.company?.corporateName}</td><td>{quote.date.toLocaleDateString("pt-BR")}</td><td>{money.format(quote.value)}</td></tr>)}</tbody></table>
    {!quotes.length && <p>Sem propostas globais apresentadas.</p>}
  </main>;
}
