import Link from "next/link";
import { db } from "@/db/client";
import { portalTaxpayerGrants, portalTaxpayerOptions } from "@/db/repositories/portal-content/taxpayer";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { readTaxpayerAccount } from "@/lib/portal-cidadao/tax-account";
import { PublicOperationalList } from "../PublicOperationalList";

export const dynamic = "force-dynamic";
const money = (value: string | null | undefined) => value === null || value === undefined ? "Valor não conciliado" : `R$ ${value.replace(".", ",")}`;

export default async function TaxpayerPortalPage({ searchParams }: { searchParams: Promise<{ taxpayerId?: string; year?: string }> }) {
  const account = await getCitizenAccount("/portal/tributario"), query = await searchParams;
  const grants = await portalTaxpayerGrants(db, account.id);
  const taxpayers = await portalTaxpayerOptions(db, grants.map((item) => item.taxpayerId));
  const selected = taxpayers.find((item) => item.id === query.taxpayerId) || taxpayers[0];
  const year = Number(query.year), validYear = Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : undefined;
  if (!selected) return <main className="mx-auto max-w-4xl space-y-5 px-4 py-10"><h1 className="text-3xl font-bold">Área do contribuinte</h1><p className="text-sm leading-6">Sua conta ainda não possui vínculo fiscal ativo. Solicite a conferência no atendimento municipal.</p><Link href="/portal/cadastrar" className="text-emerald-800 underline">Solicitar acesso / consultar solicitação</Link><Link href="/portal/minha-area" className="ml-4 text-emerald-800 underline">Minha área</Link></main>;
  const data = await readTaxpayerAccount(db, account.id, selected.id, validYear);
  return <main className="mx-auto max-w-6xl space-y-2 px-4 py-3">
    <Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800">← Minha área</Link><header><h1 className="text-xl font-bold">Área do contribuinte</h1><p className="text-sm text-slate-600">{data.taxpayer.person?.fullName || data.taxpayer.company?.corporateName} • Inscrição: {data.taxpayer.municipalInsc || "Não informada"}</p></header>
    <nav className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/portal/minha-area/servicos?audience=CONTRIBUINTE" className="text-emerald-800 underline">Solicitar serviço fiscal</Link><Link href="/portal/minha-area/solicitacoes" className="text-emerald-800 underline">Pedidos e respostas</Link><Link href="/portal/nfse" className="text-emerald-800 underline">Minhas NFS-e</Link></nav>
    <PublicOperationalList key={`${selected.id}:${validYear || "todos"}`} id="tributario-extrato" caption="Extrato e guias do contribuinte autorizado"
      toolbar={<form className="flex w-full min-w-0 gap-2"><select name="taxpayerId" defaultValue={selected.id} aria-label="Contribuinte autorizado" className="h-7 min-w-0 flex-1 rounded border px-2">{taxpayers.map((item) => <option key={item.id} value={item.id}>{item.person?.fullName || item.company?.corporateName}</option>)}</select><input name="year" type="number" min={1900} max={2200} defaultValue={validYear} placeholder="Exercício (todos)" aria-label="Exercício" className="h-7 w-36 rounded border px-2" /><button className="rounded bg-emerald-700 px-3 text-sm text-white">Consultar</button></form>}
      columns={[["number", "Lançamento", 150, 110, "identifier"], ["tax", "Tributo", 170, 110], ["year", "Exercício", 100, 80], ["status", "Situação", 120, 90, "status"], ["value", "Valor", 130, 100, "text", "right"], ["paid", "Pago confirmado", 160, 130, "text", "right"], ["balance", "Saldo", 130, 100, "text", "right"], ["guides", "Guias", 260, 130]]}
      rows={data.statement.map((item) => ({ id: item.id, label: item.assessmentNumber || "Sem número", values: { number: item.assessmentNumber || "Sem número", tax: item.tax.name, year: String(item.year), status: item.status, value: money(item.total), paid: money(item.paid), balance: money(item.remaining), guides: item.guides.map((guide) => `${guide.guideNumber} • ${guide.status} • vencimento ${guide.dueDate.toLocaleDateString("pt-BR")} • ${money(guide.totalValueDecimal?.toFixed(2))}`).join("\n") || "Nenhuma guia" } }))} />
    <p className="text-xs text-slate-500">Valores conciliados na origem tributária. Consulta não confirma pagamento nem cria novo protocolo. PIX e cartão dependem dos convênios operacionais.</p>
    {data.properties.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Imóveis próprios</h2><ul className="mt-3 space-y-3 text-sm">{data.properties.map((item) => <li key={item.id}>{item.municipalInsc} • {item.street}, {item.number} • {item.district} • terreno {item.landArea} m² / construção {item.buildingArea} m²</li>)}</ul></section>}
    {data.companies.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Inscrições econômicas</h2><ul className="mt-3 space-y-2 text-sm">{data.companies.map((item) => <li key={item.id}>{item.municipalInsc} • {item.status} • CNAE {item.primaryCnae || "Não informado"} • {item.taxRegime}</li>)}</ul></section>}
    {data.certificates.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Certidões</h2><ul className="mt-3 space-y-2 text-sm">{data.certificates.map((item) => <li key={item.id}>{item.certificateType} • {item.status} • validade {item.validUntil.toLocaleDateString("pt-BR")}{item.documentId && item.status === "Emitida" && item.validUntil > new Date() && <Link href={`/api/portal/tributos/documentos/${item.documentId}`} className="ml-3 text-emerald-800 underline">Documento próprio</Link>}</li>)}</ul></section>}
    {data.licenses.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Alvarás e licenças</h2><ul className="mt-3 space-y-2 text-sm">{data.licenses.map((item) => <li key={item.id}>{item.licenseType} • {item.status} • validade {item.validUntil?.toLocaleDateString("pt-BR") || "Não definida"}</li>)}</ul></section>}
    {data.debts.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Dívida ativa</h2><ul className="mt-3 space-y-2 text-sm">{data.debts.map((item) => <li key={item.id}>{item.cdaNumber || "Sem CDA emitida"} • {item.year} • {item.status} • {money(item.updatedValueDecimal?.toFixed(2))}</li>)}</ul></section>}
    {data.installments.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Parcelamentos</h2><ul className="mt-3 space-y-2 text-sm">{data.installments.map((item) => <li key={item.id}>{item.status} • {item.installmentsCount} parcelas • {money(item.totalValueDecimal?.toFixed(2))}</li>)}</ul></section>}
  </main>;
}
