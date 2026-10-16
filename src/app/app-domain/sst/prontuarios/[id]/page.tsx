import Link from "next/link";
import { z } from "zod";
import { getTenantContextForModule, getTenantContextForModuleOperation, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { clinicalRecordDocument } from "@/lib/sst/clinical-service";
import { QuestionnaireDocument } from "../../questionarios/QuestionnaireDocument";
import { QuestionnairePrint } from "../../questionarios/QuestionnairePrint";

export default async function SstClinicalDetails({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; report?: string }> }) {
  const search = await searchParams;
  const printing = search.print === "1";
  const context = printing ? await getTenantContextForModuleOperation("SST", "issueReports") : await getTenantContextForModule("SST");
  const { id } = await params;
  const { record, snapshot, questionnaire, requests, discipline, title: report, template, institution, emission } = await clinicalRecordDocument(context, { id, printing, report: search.report || "chart" });
  return <div className="space-y-4 p-4">
    <nav className="flex flex-wrap gap-4 print:hidden">
      <Link className="underline" href={`/sst/prontuarios?discipline=${discipline}&budgetUnitId=${record.budgetUnitId}`}>Voltar à consulta</Link>
      {printing ? <QuestionnairePrint/> : canPerformModuleOperation(context.user, "SST", "issueReports") && <>
        <Link className="underline" href="?print=1">Emitir prontuário</Link>
        <Link className="underline" href="?print=1&report=requests">Emitir solicitações</Link>
        {discipline === "MEDICINE" && <Link className="underline" href="?print=1&report=opinion">Emitir laudo</Link>}
      </>}
    </nav>
    {template && <style>{`@media print { @page { size: A4 ${template.orientation === "LANDSCAPE" ? "landscape" : "portrait"}; } }`}</style>}
    <article data-sst-questionnaire data-report-root className="mx-auto max-w-4xl space-y-4 rounded border bg-white p-6 text-black">
      {institution && <header><p className="font-semibold">{institution.legalName || institution.name}</p><p>{institution.cnpj}</p></header>}
      {template?.header && <p className="whitespace-pre-wrap">{template.header}</p>}
      <h1 className="text-xl font-semibold">{report}</h1>
      <p>Pessoa: {snapshot.personName} · UG: {snapshot.unitName}</p>
      <p>Profissional: {snapshot.professionalName} · {snapshot.council}</p>
      <p>Atendimento: {record.attendedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Registrador: {snapshot.recordedByName}</p>
      <p>Registro: {record.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Identificador: {record.id}</p>
      <p className="whitespace-pre-wrap">Contexto: {record.occupationalContext}</p>
      {search.report !== "requests" && <>
        <h2 className="font-semibold">Atendimento</h2><p className="whitespace-pre-wrap">{record.narrative}</p>
        <h2 className="font-semibold">Parecer</h2><p className="whitespace-pre-wrap">{record.opinion}</p>
        <p className="whitespace-pre-wrap">Diagnóstico: {record.diagnosis || "Não informado"}</p>
        <p>CIDs: {record.cidCodes.join("; ") || "Não informados"}</p>
      </>}
      {requests.map((request,index) => <section key={index} className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">{request.kind} · {request.description}</h2><p className="whitespace-pre-wrap">{request.instructions}</p>
        {request.kind === "MEDICATION" && <p>Quantidade: {request.quantity} · Dias: {request.days}</p>}
      </section>)}
      {questionnaire && search.report !== "requests" && <section>
        <h2 className="font-semibold">{questionnaire.title} v{questionnaire.version}</h2>
        <QuestionnaireDocument questions={questionnaire.questions} answers={z.record(z.string(), z.unknown()).parse(record.answers)}/>
      </section>}
      {printing && <div className="pt-8">________________________________________<p>Assinatura do profissional</p></div>}
      {template?.footer && <footer className="whitespace-pre-wrap">{template.footer}</footer>}
      {template?.includeEmissionMetadata && emission && <p className="text-xs">Emitido em {new Date(emission.issuedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {emission.issuedBy} · Modelo v{template.version}</p>}
    </article>
  </div>;
}
