import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listFunctionalBirthdays } from "@/lib/portal-servidor/birthday-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function FunctionalBirthdaysPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams, requestedMonth = Number(params.month);
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : new Date().getUTCMonth() + 1;
  const result = await listFunctionalBirthdays(access.context, month);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(result.rows.length / 20)));
  const href = (value: number) => `?month=${month}&page=${value}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 p-3"><ErpPageTitle title="Aniversariantes" description="Relação mínima de nomes e dia/mês publicada pelo RH para o público autorizado." />
    {!result.enabled ? <p className="rounded border bg-white p-4 text-sm">O RH ainda não disponibilizou uma relação de aniversariantes para seu acesso.</p> : <>
      <ErpListFrame toolbar={<form className="flex gap-2 text-xs"><select name="month" aria-label="Mês de aniversário" defaultValue={month} className="h-8 rounded border px-2">{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><button className="rounded border px-3">Filtrar</button><a href={`/api/portal-servidor/aniversariantes?month=${month}`} className="rounded border px-3 py-2 font-semibold text-emerald-800">Emitir relatório</a></form>} summary={<p className="text-xs">{result.rows.length} aniversariantes publicados em {months[month - 1]}</p>} pagination={<ErpPagination page={page} total={result.rows.length} pageSize={20} label="aniversariantes" previousHref={href(page - 1)} nextHref={href(page + 1)} />}>
        <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Nome</th><th>Dia / mês</th></tr></thead><tbody>{result.rows.slice((page - 1) * 20, page * 20).map((row, index) => <tr key={`${page}:${index}`} className="border-t"><td className="p-2">{row.name}</td><td>{String(row.day).padStart(2, "0")}/{String(row.month).padStart(2, "0")}</td></tr>)}</tbody></table>{!result.rows.length && <p className="p-4 text-sm">Nenhum aniversariante publicado neste mês.</p>}
      </ErpListFrame>
      <p className="text-xs text-slate-600">Fundamento da publicação: {result.references.join(" · ")}</p>
    </>}
  </div>;
}
