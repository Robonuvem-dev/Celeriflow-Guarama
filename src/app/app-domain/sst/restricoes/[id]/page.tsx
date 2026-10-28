import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readRestriction, listRestrictionFollowups } from "@/lib/sst/restriction-service";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { RepeatableSstForm as SstForm } from "../../acidentes/RepeatableSstForm";
import { saveFollowup } from "../actions";
import { readSstRestrictionDetailsOptions } from "@/db/repositories/sst-pages/clinical-options";
import { sstDatabase } from "@/lib/sst/database";
export default async function RestrictionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("SST"), { id } = await params, row = await readRestriction(context, id), history = await listRestrictionFollowups(context, id, Number((await searchParams).page || 1)), followups = history.rows;
  const database = sstDatabase(context);
  const { outbox, doctors } = await readSstRestrictionDetailsOptions(database, id, row.budgetUnitId);
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">Restrição — {String(row.data.employeeName)}</h1><p>Período: {row.startsAt.toISOString()} a {row.endsAt.toISOString()}</p><pre className="whitespace-pre-wrap break-words">{JSON.stringify(row.data, null, 2)}</pre>
    <h2 className="font-semibold">Aviso de vencimento</h2>{outbox.map(o => <p key={o.dueAt.toISOString()}>{o.status} · agendado {o.dueAt.toISOString()} · comprovante {o.providerReceipt || "não disponível"}</p>)}{!outbox.length && <p>Aviso não habilitado.</p>}
    <h2 className="font-semibold">Acompanhamentos datados</h2>{followups.map(f => <article key={f.id} className="border p-3"><p>{f.followedAt.toISOString()}</p><pre className="whitespace-pre-wrap break-words">{JSON.stringify(f.data, null, 2)}</pre></article>)}
    <ErpPagination page={history.page} total={history.total} pageSize={20} previousHref={`/sst/restricoes/${id}?page=${history.page - 1}`} nextHref={`/sst/restricoes/${id}?page=${history.page + 1}`} jumpTo={{ pathname: `/sst/restricoes/${id}` }} />
    <SstForm action={saveFollowup}><input name="restrictionId" value={id} type="hidden" /><label>Data<input name="followedAt" type="datetime-local" required /></label><label>Médico habilitado<select name="professionalRoleId" required>{doctors.map(d => <option key={d.id} value={d.id}>{d.fullName} — {d.council}</option>)}</select></label><label>Parecer<textarea name="notes" required className="block w-full border p-2" /></label><label>Conclusão<select name="outcome"><option value="MAINTAIN">Manter</option><option value="RELEASE">Liberar</option><option value="REASSESS">Reavaliar</option></select></label></SstForm>
  </main>;
}
