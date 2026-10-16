import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getPrevention, electionResults, preventionLinks, extinguisherValidity } from "@/lib/sst/prevention-service";
import { preventionKinds } from "@/lib/sst/prevention-policy";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { PreventionDocument } from "../PreventionDocument";
import { SstForm } from "../../SstForm";
import { postponeMeeting, closeMeeting } from "../actions";
export const dynamic = "force-dynamic";
export default async function PreventionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params, context = await getTenantContextForModule("SST");
  const row = await getPrevention(context, id);
  const links = await preventionLinks(context, id, Number((await searchParams).page || 1));
  const original = row.history[0]?.artifact, latest = row.history.at(-1)?.artifact;
  const names = original && "names" in original ? original.names : {};
  const meeting = latest && "participants" in latest ? latest : undefined;
  const results = row.kind === "ELECTION" ? await electionResults(context, id) : null;
  const validity = row.kind === "EXTINGUISHER" ? await extinguisherValidity(context, id) : null;
  return <main className="space-y-5 p-4"><header className="flex flex-wrap gap-4"><Link className="underline" href="/sst/prevencao">Voltar à lista</Link><Link className="underline" href={`/sst/prevencao/${id}/imprimir`}>Relatório / imprimir programação</Link></header>{row.clinical && <p className="font-semibold">Informação clínica — acesso médico ocupacional restrito.</p>}<PreventionDocument title={row.title} payload={row.payload} names={names} meeting={meeting} />
    {"attachments" in row.payload && row.payload.attachments.length > 0 && <section><h2 className="font-semibold">Anexos protegidos</h2>{row.payload.attachments.map((a, index) => <p key={index}><a className="underline" href={`/sst/prevencao/${id}/anexos/${index}`}>{a.name}</a></p>)}</section>}
    {results && <section className="rounded border p-4"><h2 className="font-semibold">Participação e apuração</h2><p>{results.turnout} votantes / {results.eligible} eleitores — {results.percent === null ? "Indisponível" : `${results.percent}%`}</p><p>{results.closed ? results.valid ? "Quórum mínimo atingido" : "Quórum mínimo não atingido" : "Apuração disponível após o encerramento."}</p>{results.tally.map(t => <p key={t.candidateId || "blank"}>{t.name}: {t.votes} votos</p>)}</section>}
    {validity && <section className="rounded border p-4"><h2 className="font-semibold">Validade técnica atual</h2><p>Recarga / validade inicial: {new Date(validity.recharge).toLocaleDateString("pt-BR")} — {new Date(validity.recharge) < new Date() ? "Vencida" : "Dentro da validade"}</p><p>Teste hidrostático: {validity.hydrostatic ? `${new Date(validity.hydrostatic).toLocaleDateString("pt-BR")} — ${new Date(validity.hydrostatic) < new Date() ? "Vencido" : "Dentro da validade"}` : "Nenhum teste registrado"}</p></section>}
    {meeting && !meeting.minutes && <div className="grid gap-5 lg:grid-cols-2"><SstForm action={postponeMeeting} label="Registrar adiamento"><h2 className="font-semibold">Adiar reunião</h2><input type="hidden" name="id" value={id}/><label>Nova data e hora<input className="block rounded border p-2" type="datetime-local" name="at" required/></label><label>Justificativa<textarea className="block w-full rounded border p-2" name="reason" required minLength={2}/></label></SstForm><SstForm action={closeMeeting} label="Encerrar com ata e presenças"><h2 className="font-semibold">Ata e presenças</h2><input type="hidden" name="id" value={id}/>{meeting.participants.map(p => <label key={p.employeeId} className="flex items-center gap-2"><input name="participant" type="hidden" value={p.employeeId}/><input type="checkbox" name={`present.${p.employeeId}`}/>{p.name} — presente</label>)}<label>Ata<textarea className="block w-full rounded border p-2" name="minutes" rows={6} minLength={2} required/></label></SstForm></div>}
    {links.total > 0 && <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Registros vinculados / atas / manutenções</h2>{links.rows.map(r => <p key={r.id}><Link className="underline" href={`/sst/prevencao/${r.id}`}>{preventionKinds[r.kind]} — {r.title}</Link></p>)}<ErpPagination page={links.page} total={links.total} pageSize={20} previousHref={`/sst/prevencao/${id}?page=${links.page - 1}`} nextHref={`/sst/prevencao/${id}?page=${links.page + 1}`} jumpTo={{ pathname: `/sst/prevencao/${id}` }}/></section>}
    <section className="rounded border p-4"><h2 className="font-semibold">Histórico auditável</h2><p>Cadastro em {row.createdAt.toLocaleString("pt-BR")} por {row.createdById}. UG: {row.budgetUnitId}.</p>{row.history.map(h => <p key={h.version}>Versão {h.version} — {h.createdAt.toLocaleString("pt-BR")} — autor {h.actorId}</p>)}</section>
  </main>;
}
