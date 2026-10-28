import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getProtocolContext, getProtocolContextForOperation, protocolScopeCondition } from "@/lib/protocols/access";
import { judicialCaseInput, recordProcessJudicialCase } from "@/lib/protocols/judicial-cases";
import { db } from "@/db/client";
import { readProcessJudicialRegistration, readJudicialRegistrationOptions } from "@/db/repositories/processes/judicial";

export default async function ProcessJudicialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getProtocolContext();
  const process = await readProcessJudicialRegistration(db, id, protocolScopeCondition(context));
  if (!process) notFound();
  const { units, documents } = await readJudicialRegistrationOptions(db, id, process.currentDepartment?.secretariatId ?? "__no_department__", context.protocolAccess.isAdmin ? undefined : context.user.allowedBudgetUnitIds);
  const current = process.judicialCase;
  const canOperate = context.protocolAccess.canUpdate && !["Arquivado", "Concluído", "Aguardando Recebimento"].includes(process.status) && (context.protocolAccess.isAdmin || context.user.departmentId === process.currentDepartmentId);
  async function save(form: FormData): Promise<void> {
    "use server";
    const operational = await getProtocolContextForOperation("update");
    const input = judicialCaseInput.parse({ processId: id, budgetUnitId: form.get("budgetUnitId"), caseNumber: form.get("caseNumber"), court: form.get("court"), openedAt: form.get("openedAt"), status: form.get("status"), effectiveAt: form.get("effectiveAt"), expectedVersion: Number(form.get("expectedVersion")), reason: form.get("reason"), documentVersionId: form.get("documentVersionId"), idempotencyKey: form.get("idempotencyKey"), municipalDefendantConfirmed: form.get("municipalDefendantConfirmed") === "on" });
    await recordProcessJudicialCase(operational, input);
    revalidatePath(`/protocolos/processos/${id}/judicial`); revalidatePath("/controle-interno/consultas/judicial");
  }
  const style = "block w-full rounded border p-2";
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Registro judicial — {process.protocolNumber}</h1><Link href={`/protocolos/processos/${id}`} className="underline">Voltar ao processo</Link><p>Classificação explícita de ação contra a entidade, apoiada em documento judicial recebido e anexado ao processo. Não registra consulta/retorno de tribunal ou integração externa. Identificação e vínculo institucional permanecem no histórico; reclassificação retira registro incorreto da consulta de ações abertas.</p><form action={save} className="grid gap-3 md:grid-cols-2"><input type="hidden" name="expectedVersion" value={current?.version ?? 0} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
    <label>Entidade/UG{current ? <><input type="hidden" name="budgetUnitId" value={current.budgetUnitId} /><p>{current.governmentEntityId} · {current.budgetUnitId}</p></> : <select required name="budgetUnitId" className={style}><option value="">Selecione UG do setor</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.planningEntityUnit?.governmentEntity.name} · {unit.name}</option>)}</select>}</label>
    <label>Número judicial<input required name="caseNumber" readOnly={Boolean(current)} defaultValue={current?.caseNumber} className={style} /></label>
    <label>Tribunal/órgão judicial<input required name="court" readOnly={Boolean(current)} defaultValue={current?.court} className={style} /></label>
    <label>Data de abertura judicial<input required type="date" name="openedAt" readOnly={Boolean(current)} defaultValue={current?.openedAt.toISOString().slice(0, 10)} className={style} /></label>
    <label>Situação<select name="status" defaultValue={current?.status ?? "OPEN"} className={style}><option value="OPEN">Aberto</option><option value="SUSPENDED">Suspenso</option><option value="CLOSED">Encerrado</option><option value="RECLASSIFIED">Reclassificado — vínculo incorreto</option></select></label>
    <label>Data da posição/andamento<input required type="date" name="effectiveAt" className={style} /></label>
    <label className="md:col-span-2">Evidência do andamento<select required name="documentVersionId" className={style}><option value="">Selecione versão final anexada ao processo</option>{documents.map(document => <option key={document.id} value={document.id}>{document.document.title} · v{document.versionNumber} · {document.hashSha256}</option>)}</select></label>
    <label className="md:col-span-2">Fundamento/andamento documentado<textarea required name="reason" minLength={10} className={style} /></label><label className="md:col-span-2"><input name="municipalDefendantConfirmed" type="checkbox" /> Documento identifica a entidade vinculada como demandada; registro não é execução fiscal contra contribuinte. Confirmação obrigatória exceto ao reclassificar vínculo incorreto.</label><button disabled={!canOperate} className={style}>Registrar posição judicial fundamentada</button>
  </form>{current?.events.map(event => <details key={event.id} className="rounded border p-3"><summary>Versão {event.version} · {event.status} · {event.effectiveAt.toISOString().slice(0, 10)}</summary><p>{event.reason}</p><p className="break-all">GED {event.documentVersionId} · SHA-256 {event.documentHash} · {event.actorUsuarioId}</p></details>)}</section>;
}
