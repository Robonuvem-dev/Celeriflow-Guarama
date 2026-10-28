import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { asoKinds, asoResults, asoSnapshot, asoExamSnapshot, formatSstCivilDate } from "@/lib/sst/aso-policy";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstAsoScope } from "@/db/repositories/sst-pages/aso";
import { readSstAso } from "@/db/repositories/sst/clinical";
import { sstDatabase } from "@/lib/sst/database";
import { readAsoFollowUp } from "@/lib/sst/aso-flow-service";
import { SstForm } from "../../SstForm";
import { saveSstAsoCorrection, saveSstAsoDocument } from "../actions";

export default async function SstAsoDetails({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST");
  const { id } = await params;
  const database = sstDatabase(context);
  const scope = await findSstAsoScope(database, id);
  if (!scope) notFound();
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const record = await readSstAso(database, id);
  const snapshot = asoSnapshot.parse(record.snapshot);
  const flow = await readAsoFollowUp(context, id);
  await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_ASO_CLINICAL", targetId: record.id });
  return <div className="space-y-4 p-4"><header className="space-y-2"><h1 className="text-xl font-semibold">ASO · {snapshot.personName}</h1><Link href="/sst/aso" className="mr-4 underline">Voltar à consulta</Link>{canPerformModuleOperation(context.user, "SST", "issueReports") && <Link href={`/sst/aso/${id}/imprimir`} className="underline">Emitir documento para impressão</Link>}</header>
    <Link className="inline-block rounded border px-3 py-2" href={`/sst/aso/${id}/anamnese`}>Anamnese e histórico de revisões</Link>
    {flow.corrections.map((c) => <section className="rounded border p-4" key={c.id}><h2 className="font-semibold">{c.kind === "ANNULMENT" ? "ASO anulado" : "ASO retificado"}</h2><p>{c.reason}</p>{c.replacementAsoId && <Link className="underline" href={`/sst/aso/${c.replacementAsoId}`}>Abrir versão sucessora</Link>}<p>O original permanece preservado.</p></section>)}
    {!!flow.slots.length && <section className="rounded border p-4"><h2 className="font-semibold">Sugestões de novo atendimento</h2>{flow.slots.map((s) => <p key={`${s.availabilityId}:${s.startsAt}`}><Link className="underline" href={`/sst/agenda?availabilityId=${s.availabilityId}`}>{s.unitName} · {new Date(s.startsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</Link></p>)}<p>Disponibilidades consultadas agora; confirme a reserva na agenda.</p></section>}
    {flow.vacationWarning && <p role="status" className="rounded border p-4">Segundo período aquisitivo de férias em aberto: prazo concessivo RH {formatSstCivilDate(flow.vacationWarning.expiresAt)} ({flow.vacationWarning.daysUntilExpiry} dias). <Link href="/rh/ferias" className="underline">Conferir no RH</Link></p>}
    {flow.vacationSourceMissing && <p role="status">Prazo concessivo indisponível: RH deve registrar a fonte canônica dos períodos em aberto.</p>}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Documentos GED restritos</h2>{flow.documents.map((d) => <p key={d.id}><a className="underline" href={`/api/download?url=${encodeURIComponent(d.fileUrl)}`}>{d.kind === "GENERATED" ? "ASO original gerado" : "Laudo de origem"}</a></p>)}
      {canPerformModuleOperation(context.user, "SST", "issueReports") && <SstForm action={saveSstAsoDocument} label="Gerar e arquivar ASO PDF no GED"><input type="hidden" name="asoId" value={id}/><input type="hidden" name="kind" value="GENERATED"/></SstForm>}
      {canPerformModuleOperation(context.user, "SST", "update") && <SstForm action={saveSstAsoDocument} label="Anexar laudo de origem"><input type="hidden" name="asoId" value={id}/><input type="hidden" name="kind" value="ORIGIN"/><select name="examId" required className="rounded border p-2">{record.exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select><input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required/></SstForm>}
    </section>
    {!flow.corrections.length && canPerformModuleOperation(context.user, "SST", "update") && <details className="rounded border p-4"><summary>Retificar ou anular preservando o original</summary><SstForm action={saveSstAsoCorrection} label="Registrar correção"><input type="hidden" name="asoId" value={id}/><select name="kind" className="rounded border p-2"><option value="ANNULMENT">Anular</option><option value="RECTIFICATION">Retificar por novo ASO</option></select><input name="replacementAsoId" placeholder="ID de novo ASO emitido (retificação)" className="rounded border p-2"/><textarea name="reason" required minLength={10} maxLength={2000} placeholder="Justificativa" className="rounded border p-2"/></SstForm></details>}
    <section className="grid gap-2 rounded border p-4 sm:grid-cols-2"><p>UG: {snapshot.unitName}</p><p>CPF: {snapshot.cpf}</p><p>Matrícula: {snapshot.registration || "Candidato sem vínculo"}</p><p>Referência do candidato: {record.candidateReference || "Não aplicável"}</p><p>Cargo: {snapshot.role || "Não informado"}</p><p>Local: {snapshot.department || "Não informado"}</p><p>Tipo: {asoKinds[record.kind as keyof typeof asoKinds]}</p><p>Conclusão: {asoResults[record.result as keyof typeof asoResults]}</p><p>Realização: {formatSstCivilDate(record.performedAt)}</p><p>Vencimento: {formatSstCivilDate(record.validUntil)}</p><p>Médico: {snapshot.examinerName} · {record.examinerCouncil}</p><p>PCMSO: {snapshot.programCode} v{snapshot.programVersion} · GHE {snapshot.group.code} {snapshot.group.name}</p></section>
    {record.recommendations && <section className="rounded border p-4"><h2 className="font-semibold">Restrições e recomendações</h2><p className="whitespace-pre-wrap">{record.recommendations}</p></section>}
    {snapshot.functional && <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Vínculo canônico de RH na emissão</h2><p>Contrato: {snapshot.functional.contractReference} · Entidade: {snapshot.functional.governmentEntityId}</p><p>Período funcional: {snapshot.functional.id} · Regime: {snapshot.functional.employmentRegimeId}</p><p>Local: {snapshot.functional.localId} · Centro de custo: {snapshot.functional.costCenterId}</p></section>}
    <h2 className="text-lg font-semibold">Exames associados</h2>{record.exams.map((exam) => { const details = asoExamSnapshot.parse(exam.snapshot); return <section key={exam.id} className="space-y-2 rounded border p-4"><h3 className="font-semibold">{exam.name} · {exam.kind}</h3><p>Origem: {exam.source === "APRESENTADO" ? "Apresentado pelo paciente" : "Realizado"}</p><p>Realização: {formatSstCivilDate(exam.performedAt)} · Validade: {formatSstCivilDate(exam.validUntil)}</p><p>Profissional: {details.professionalName} · {exam.professionalCouncil}</p><p>Laboratório: {details.laboratoryName || "Não informado"} · Laudo: {exam.reportNumber || "Não informado"}</p><p className="whitespace-pre-wrap">{exam.result}</p></section>; })}
  </div>;
}
