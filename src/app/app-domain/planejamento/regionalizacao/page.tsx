import { and, asc, eq, inArray } from "drizzle-orm";
import { planningActions, planningPrograms } from "@/db/schema/planning-legal";
import { planningInstruments } from "@/db/schema/planning-budget";
import { planningRegionalActions } from "@/db/schema/planning-regional-actions";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { getPlanningContext } from "@/lib/planejamento/access";
import { planningDatabase } from "@/lib/planejamento/database";
import { saveRegionalAction } from "./actions";
export const dynamic = "force-dynamic";
const field = "m-2 rounded border p-2";
export default async function RegionalActionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getPlanningContext("EXECUTIVE");
  const query = await searchParams;
  const database = planningDatabase(context);
  const actions = await database.selectDistinct({ id: planningActions.id, code: planningActions.code, name: planningActions.name }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).innerJoin(planningInstruments, eq(planningInstruments.multiYearPlanId, planningPrograms.multiYearPlanId)).where(planningInstrumentScope(context)).orderBy(asc(planningActions.code));
  const ids = actions.map(action => action.id);
  const rows = (ids.length ? await database.select().from(planningRegionalActions).where(and(inArray(planningRegionalActions.actionId, ids))).orderBy(asc(planningRegionalActions.region), asc(planningRegionalActions.subactionCode)) : []).filter(row => `${row.region} ${row.name} ${row.subactionCode}`.toLocaleLowerCase("pt-BR").includes((query.q ?? "").toLocaleLowerCase("pt-BR")));
  const names = new Map(actions.map(action => [action.id, `${action.code} · ${action.name}`]));
  const entryForm = (row?: typeof rows[number]) => <form action={saveRegionalAction}><input type="hidden" name="id" value={row?.id ?? ""} /><label>Ação PPA<select className={field} name="actionId" required defaultValue={row?.actionId}>{(row ? actions.filter(action => action.id === row.actionId) : actions).map(action => <option key={action.id} value={action.id}>{names.get(action.id)}</option>)}</select></label><label>Região ou bairro<input className={field} name="region" required minLength={2} maxLength={160} defaultValue={row?.region} /></label><label>Código da subação (vazio para regionalizar a ação)<input className={field} name="subactionCode" maxLength={40} defaultValue={row?.subactionCode} /></label><label>Descrição regional<input className={field} name="name" required minLength={2} maxLength={200} defaultValue={row?.name} /></label><label><input type="checkbox" name="active" defaultChecked={row?.active ?? true} /> Ativa</label><button className={field}>Salvar cadastro</button></form>;
  return <main className="space-y-4 p-5"><h1 className="text-xl font-semibold">Ações e subações regionalizadas</h1><p>Vincule a ação cadastrada no PPA às regiões atendidas e detalhe suas subações. Este cadastro não altera valores aprovados da peça orçamentária.</p><details><summary>Regionalizar ação ou cadastrar subação</summary>{entryForm()}</details><form><input className={field} aria-label="Buscar região ou subação" name="q" defaultValue={query.q} /><button className={field}>Buscar</button></form>{rows.map(row => <article className="rounded border p-3" key={row.id}><h2>{row.region} · {names.get(row.actionId)} · {row.subactionCode ? `Subação ${row.subactionCode}` : "Ação regionalizada"}</h2><p>{row.name} · {row.active ? "Ativa" : "Inativa"}</p><details><summary>Editar</summary>{entryForm(row)}</details></article>)}{!rows.length && <p>Nenhuma ação regionalizada no filtro.</p>}</main>;
}
