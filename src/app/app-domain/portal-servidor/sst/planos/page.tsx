import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listBenefitBeneficiaries } from "@/lib/sst/benefit-query";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function PortalHealthPlansPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Planos indisponíveis: não há vínculo funcional ativo associado à sessão.</p>;
  const params = await searchParams;
  const result = await listBenefitBeneficiaries(access.context, params, true);
  const pageHref = (page: number) => `/portal-servidor/sst/planos?${new URLSearchParams({ q: params.q ?? "", page: String(page) })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Meus planos de saúde</h1><p>Consulta exclusiva do seu vínculo e de seus dependentes canônicos.</p><form className="flex gap-2"><input name="q" defaultValue={params.q} placeholder="Plano" className="w-full rounded border p-2"/><button className="rounded border p-2">Pesquisar</button></form>
    {!result.rows.length && <p>Nenhuma cobertura registrada.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{result.rows.map((row) => <article key={row.id} className="min-w-0 rounded border p-3"><h2 className="break-words font-semibold">{row.plan.benefitConfig.name}</h2><p className="break-words">{row.dependent?.name ?? "Titular"} · carteirinha {row.cardNumber}</p><p>{row.startsAt.toISOString().slice(0, 10)} — {row.endsAt.toISOString().slice(0, 10)}</p><Link className="underline" href={`/portal-servidor/sst/planos/${row.id}`}>Demonstrativo de despesas e devoluções</Link></article>)}</div>
    <ErpPagination page={result.page} pageSize={20} total={result.total} previousHref={pageHref(Math.max(1, result.page - 1))} nextHref={pageHref(Math.min(Math.max(1, Math.ceil(result.total / 20)), result.page + 1))} jumpTo={{ pathname: "/portal-servidor/sst/planos", values: { q: params.q } }}/>
  </div>;
}
