import Link from "next/link";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listBenefitBeneficiaries } from "@/lib/sst/benefit-query";

export default async function HealthBenefitsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const result = await listBenefitBeneficiaries(context, params);
  const pageHref = (page: number) => `/sst/planos?${new URLSearchParams({ q: params.q ?? "", page: String(page) })}`;
  return <div className="space-y-4 p-4">
    <h1 className="text-xl font-semibold">Planos de saúde — titulares e dependentes</h1>
    <p className="text-sm">Extensão dos benefícios de RH. Demonstrativos contratuais por competência e candidatos auditáveis para conciliação com a folha.</p>
    <Link href="/sst/planos/cadastro" className="inline-block rounded border p-2">Configurar plano / registrar adesão</Link>
    <form className="flex gap-2"><label className="flex-1">Servidor ou plano<input name="q" defaultValue={params.q} className="block w-full rounded border p-2" /></label><button className="self-end rounded border p-2">Pesquisar</button></form>
    {!result.rows.length && <p>Nenhuma adesão encontrada neste escopo.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{result.rows.map((row) => <article className="min-w-0 rounded border p-3" key={row.id}>
      <h2 className="break-words font-semibold">{row.plan.benefitConfig.name}</h2>
      <p className="break-words">{row.payrollBenefit.employee.name} · {row.payrollBenefit.employee.registration || "Sem matrícula"}</p>
      <p className="break-words">{row.dependent ? `Dependente: ${row.dependent.name}` : "Titular"}</p>
      <p>{row.startsAt.toISOString().slice(0, 10)} — {row.endsAt.toISOString().slice(0, 10)} · R$ {row.monthlyAmount.toFixed(2)}</p>
      <Link className="inline-block underline" href={`/sst/planos/${row.id}`}>Ficha e demonstrativo</Link>
    </article>)}</div>
    <ErpPagination page={result.page} pageSize={20} total={result.total} previousHref={pageHref(Math.max(1, result.page - 1))} nextHref={pageHref(Math.min(Math.max(1, Math.ceil(result.total / 20)), result.page + 1))} jumpTo={{ pathname: "/sst/planos", values: { q: params.q } }} />
  </div>;
}
