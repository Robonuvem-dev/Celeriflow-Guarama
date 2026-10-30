import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
import { PrintCatalogReport } from "../../PrintCatalogReport";
import { listPriceResearchSuppliers } from "@/db/repositories/procurement/price-research";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ inicio?: string; fim?: string }> }) {
  const context = await getTenantContextForModuleOperation("COMPRAS", "issueReports");
  const { inicio = "", fim = "" } = await searchParams;
  const valid = [inicio, fim].every(date => !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)))) && (!inicio || !fim || inicio <= fim);
  const rows = valid ? (await listProcurementAuxiliaryRecords(context.database ?? db, "crc")).filter(row => (!inicio || row.fields.cadastro >= inicio) && (!fim || row.fields.cadastro <= fim)) : [];
  const suppliers = await listPriceResearchSuppliers(context.database ?? db);
  return <main className="space-y-4 p-4"><Link className="print:hidden" href="/compras/cadastros/crc">Cadastro de CRC</Link><h1 className="text-xl font-semibold">Totalização de CRC por período</h1><form className="flex gap-3 print:hidden"><label>Cadastro de<input className="block border p-2" type="date" name="inicio" defaultValue={inicio} /></label><label>Até<input className="block border p-2" type="date" name="fim" defaultValue={fim} /></label><button>Consultar</button></form>{!valid && <p role="alert">Informe um período válido.</p>}<p>Período: {inicio || "início"} a {fim || "fim"} · Total de CRC: {rows.length}</p><PrintCatalogReport /><table className="w-full text-left"><thead><tr><th>CRC</th><th>Descrição</th><th>Fornecedor</th><th>Data de cadastro</th><th>Validade</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{(() => { const supplier = suppliers.find(supplier => supplier.id === row.fields.fornecedorId); return supplier?.person?.fullName || supplier?.company?.tradeName || supplier?.company?.corporateName || "Fornecedor indisponível"; })()}</td><td>{row.fields.cadastro}</td><td>{row.fields.validade}</td></tr>)}</tbody></table></main>;
}
