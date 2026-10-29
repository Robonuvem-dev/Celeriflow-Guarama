import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listFunctionalBirthdays } from "@/lib/portal-servidor/birthday-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

export const dynamic = "force-dynamic";
const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function FunctionalBirthdaysPage({ searchParams }: { searchParams: Promise<{ month?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const params = await searchParams, requestedMonth = Number(params.month);
  const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : new Date().getUTCMonth() + 1;
  const result = await listFunctionalBirthdays(access.context, month);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(result.rows.length / OPERATIONAL_PAGE_SIZE)));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col"><ErpPageTitle title="Aniversariantes" description="Relação mínima de nomes e dia/mês publicada pelo RH para o público autorizado." />
    {!result.enabled ? <p className="rounded border bg-white p-4 text-sm">O RH ainda não disponibilizou uma relação de aniversariantes para seu acesso.</p> : <>
      <PortalOperationalList id="aniversariantes" label="Aniversariantes" page={page} total={result.rows.length} values={{ month }} toolbar={<form className="flex gap-2 text-xs"><select name="month" aria-label="Mês de aniversário" defaultValue={month} className="h-7 rounded border px-2">{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><button>Filtrar</button></form>} actions={<a href={`/api/portal-servidor/aniversariantes?month=${month}`}>Emitir relatório</a>} columns={[portalColumn("name", "Nome", 500, 160), portalColumn("birthday", "Dia / mês", 150, 90)]} rows={result.rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map((row, index) => ({ id: `${page}:${index}`, label: row.name, values: { name: row.name, birthday: `${String(row.day).padStart(2, "0")}/${String(row.month).padStart(2, "0")}` } }))} />
      <OperationalHeaderActions><OperationalFilters label="Fundamento da publicação"><p>Fundamento da publicação: {result.references.join(" · ")}</p></OperationalFilters></OperationalHeaderActions>
    </>}
  </div>;
}
