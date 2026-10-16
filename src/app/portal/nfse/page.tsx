import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { authorizedTaxpayerIds } from "@/lib/portal-cidadao/tax-account";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function OwnInvoicesPage({ searchParams }: { searchParams: Promise<{ page?: string; competence?: string }> }) {
  const account = await getCitizenAccount("/portal/nfse"), query = await searchParams, ids = await authorizedTaxpayerIds(prisma, account.id, "NFSE");
  const competence = typeof query.competence === "string" && /^\d{2}\/\d{4}$/.test(query.competence) ? query.competence : "";
  const where = { OR: [{ providerId: { in: ids } }, { takerId: { in: ids } }], ...(competence ? { competence } : {}) };
  const total = await prisma.invoice.count({ where }), page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const rows = await prisma.invoice.findMany({ where, select: { id: true, invoiceNumber: true, verificationCode: true, competence: true, status: true, serviceValueDecimal: true, issValueDecimal: true, issRetained: true }, orderBy: { invoiceNumber: "desc" }, take: 20, skip: (page - 1) * 20 });
  const href = (target: number) => `?${new URLSearchParams({ competence, page: String(target) })}`;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10"><Link href="/portal/minha-area" className="text-sm font-semibold text-emerald-800">← Minha área</Link><h1 className="text-3xl font-bold">Minhas NFS-e</h1><p className="text-sm leading-6 text-slate-600">Notas próprias como prestador ou tomador, com vínculo fiscal e escopo NFSE. Solicitações de emissão, avulsa e ajustes seguem os serviços fiscais publicados.</p><form className="flex gap-3"><input name="competence" defaultValue={competence} placeholder="MM/AAAA" aria-label="Competência" pattern="\d{2}/\d{4}" className="rounded border p-3" /><button className="rounded bg-emerald-700 px-4 text-sm font-semibold text-white">Filtrar</button></form><ul className="space-y-3">{rows.map((item) => <li key={item.id} className="rounded border p-4"><p className="font-semibold">NFS-e {item.invoiceNumber} • {item.competence} • {item.status}</p><p className="mt-2 text-sm">Serviço: {item.serviceValueDecimal?.toFixed(2) || "Valor não conciliado"} • ISS: {item.issValueDecimal?.toFixed(2) || "Valor não conciliado"} • {item.issRetained ? "ISS retido" : "ISS não retido"}</p><Link href={`/portal/nfse/${item.verificationCode}`} className="mt-2 inline-block text-sm text-emerald-800 underline">Consulta de autenticidade</Link></li>)}</ul>{!rows.length && <p className="rounded border border-dashed p-5 text-sm">Nenhuma nota disponível para o período e os vínculos autorizados.</p>}<ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="notas" /><Link href="/portal/minha-area/servicos?audience=CONTRIBUINTE" className="text-sm font-semibold text-emerald-800 underline">Solicitar serviço fiscal</Link></main>;
}
