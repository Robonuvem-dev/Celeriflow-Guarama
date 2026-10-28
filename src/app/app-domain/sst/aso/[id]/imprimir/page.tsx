import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { asoKinds, asoResults, asoSnapshot, formatSstCivilDate } from "@/lib/sst/aso-policy";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstAsoScope, findSstAsoCorrection } from "@/db/repositories/sst-pages/aso";
import { readSstAso } from "@/db/repositories/sst/clinical";
import { sstDatabase } from "@/lib/sst/database";
import { PrintAso } from "./PrintAso";

export default async function SstAsoPrint({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  const { id } = await params;
  const database = sstDatabase(context);
  const scope = await findSstAsoScope(database, id);
  if (!scope) notFound();
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const record = await readSstAso(database, id);
  const snapshot = asoSnapshot.parse(record.snapshot);
  const correction = await findSstAsoCorrection(database, id);
  await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_ASO_PRINT", targetId: record.id });
  return <div className="space-y-4 p-4"><div className="flex gap-4 print:hidden"><Link className="underline" href={`/sst/aso/${id}`}>Voltar ao ASO</Link><PrintAso/></div>
    <article data-sst-aso className="mx-auto max-w-4xl space-y-5 rounded border bg-white p-6 text-black print:border-0"><header><h1 className="text-center text-xl font-bold">ATESTADO DE SAÚDE OCUPACIONAL — ASO</h1><p className="text-center">{snapshot.unitName}</p></header>
      <p className="break-all text-sm">Identificador: {record.id}</p><p>Nome: {snapshot.personName} · CPF: {snapshot.cpf}</p><p>Matrícula: {snapshot.registration || "Candidato sem vínculo"}{record.candidateReference ? ` · Concurso/processo: ${record.candidateReference}` : ""}</p><p>Cargo: {snapshot.role || "Não informado"} · Local: {snapshot.department || "Não informado"}</p>
      {correction && <p className="border p-3 font-bold">CÓPIA HISTÓRICA — {correction.kind === "ANNULMENT" ? "ANULADO" : `RETIFICADO: sucessor ${correction.replacementAsoId}`}</p>}
      {snapshot.functional && <p>Contrato: {snapshot.functional.contractReference} · Entidade: {snapshot.functional.governmentEntityId} · Vínculo: {snapshot.functional.id}</p>}
      <section><h2 className="font-bold">Riscos ocupacionais da versão PCMSO</h2><p className="break-words text-sm">{JSON.stringify((record.snapshot as Record<string, unknown>).risks || [])}</p></section>
      <p>Tipo: {asoKinds[record.kind as keyof typeof asoKinds]} · Realização: {formatSstCivilDate(record.performedAt)} · Validade: {formatSstCivilDate(record.validUntil)}</p><p>PCMSO: {snapshot.programCode} v{snapshot.programVersion} · GHE {snapshot.group.code} — {snapshot.group.name}</p>
      <section><h2 className="font-bold">Exames realizados/apresentados</h2><ul className="space-y-1">{record.exams.map((exam) => <li key={exam.id}>{exam.name} — {formatSstCivilDate(exam.performedAt)} · Validade: {formatSstCivilDate(exam.validUntil)} · {exam.source === "APRESENTADO" ? "Apresentado" : "Realizado"}</li>)}</ul></section>
      <p className="text-lg font-bold">Conclusão: {asoResults[record.result as keyof typeof asoResults]}</p>{record.recommendations && <p className="whitespace-pre-wrap">{record.recommendations}</p>}
      <p>Médico examinador: {snapshot.examinerName} · {record.examinerCouncil}</p><div className="pt-10"><p>__________________________________________________</p><p>Assinatura do médico examinador</p></div>
      <p className="text-xs">Documento para conferência e assinatura. Esta impressão não comprova assinatura digital nem envio/aceitação pelo eSocial.</p>
    </article>
  </div>;
}
