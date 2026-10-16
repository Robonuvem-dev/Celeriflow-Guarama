import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listAccidents } from "@/lib/sst/accident-service";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { RepeatableSstForm as SstForm } from "../../../sst/acidentes/RepeatableSstForm";
import { AccidentFields } from "../../../sst/acidentes/AccidentFields";
import { reportOwnAccident } from "./actions";
import { ownAccidentStates } from "@/lib/portal-servidor/own-accident";
export const dynamic = "force-dynamic";
export default async function OwnCatPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Seu usuário não está vinculado a um servidor ativo.</p>;
  const { rows, page, total } = await listAccidents(access.context, Number((await searchParams).page || 1), "", access.employee.id);
  const states = await ownAccidentStates(access.context, rows.map(row => row.id));
  const href = (p: number) => `/portal-servidor/sst/cat?page=${p}`;
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">Comunicar acidente de trabalho</h1><p>Servidor: {access.employee.name}. Comunicação interna para análise SST; não equivale ao envio ao INSS.</p>
    <SstForm action={reportOwnAccident} label="Comunicar CAT"><AccidentFields portal /></SstForm>
    <h2 className="font-semibold">Minhas comunicações</h2>{rows.map(r => <article className="rounded border p-3" key={r.id}><p>Comunicação {r.id} · {r.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p><p>{String(r.data.description)}</p><p className="mt-2 text-xs font-semibold">{states.find(state => state.id === r.id)?.status || "COMUNICADA"}</p><a href={`/api/portal-servidor/sst/cat/${r.id}`} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">Emitir comprovante de comunicação</a></article>)}
    {!rows.length && <p>Nenhuma comunicação registrada.</p>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/portal-servidor/sst/cat" }} />
  </main>;
}
