import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getTenantContextForModule, getTenantContextForModuleOperation, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { questionnaireQuestions } from "@/lib/sst/questionnaire-policy";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstAnamnesisScope, findSstAnamnesisPage } from "@/db/repositories/sst-pages/aso";
import { sstDatabase } from "@/lib/sst/database";
import { QuestionnaireDocument } from "../../questionarios/QuestionnaireDocument";
import { QuestionnairePrint } from "../../questionarios/QuestionnairePrint";

export default async function SstAnamnesisDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const printing = (await searchParams).print === "1";
  const context = printing ? await getTenantContextForModuleOperation("SST", "issueReports") : await getTenantContextForModule("SST");
  const { id } = await params;
  const database = sstDatabase(context);
  const scope = await findSstAnamnesisScope(database, id);
  if (!scope) notFound();
  await assertSstClinicalAccess(context, scope.aso.budgetUnitId);
  const record = await findSstAnamnesisPage(database, id);
  if (!record) notFound();
  const snapshot = z.object({ title: z.string(), code: z.string(), version: z.number(), questions: questionnaireQuestions, personName: z.string(), examinerName: z.string(), examinerCouncil: z.string(), recordedByName: z.string() }).parse(record.snapshot);
  const answers = z.record(z.string(), z.unknown()).parse(record.answers);
  await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: printing ? auditEventTypes.reportIssued : auditEventTypes.pageView, targetType: "SST_ANAMNESIS_CLINICAL", targetId: record.id });
  return <div className="space-y-4 p-4"><nav className="flex gap-4 print:hidden"><Link className="underline" href={`/sst/aso/${record.asoId}/anamnese`}>Voltar ao histórico</Link>{printing ? <QuestionnairePrint/> : canPerformModuleOperation(context.user, "SST", "issueReports") && <Link className="underline" href={`/sst/anamneses/${id}?print=1`}>Emitir preenchido</Link>}</nav><article data-sst-questionnaire className="mx-auto max-w-4xl space-y-5 rounded border bg-white p-6 text-black"><h1 className="text-xl font-bold">Anamnese · {snapshot.personName}</h1><p>{snapshot.title} · {snapshot.code} v{snapshot.version} · Revisão {record.revision}</p><p>Médico do ASO: {snapshot.examinerName} · {snapshot.examinerCouncil}</p><p>Registrado por: {snapshot.recordedByName} · {record.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{record.revisionReason && <p className="whitespace-pre-wrap">Justificativa: {record.revisionReason}</p>}<QuestionnaireDocument questions={snapshot.questions} answers={answers}/></article></div>;
}
