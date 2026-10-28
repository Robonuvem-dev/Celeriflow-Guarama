import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalRows } from "@/db/repositories/portal-servidor/records";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnFunctionalRequest } from "@/lib/portal-servidor/functional-requests";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ComplementForm } from "./ComplementForm";

export const dynamic = "force-dynamic";
export default async function MyFunctionalProtocol({ params }: { params: Promise<{ id: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const { id } = await params;
  const executor = access.context.database ?? db;
  const result = await readOwnFunctionalRequest(executor, access.employee.id, id).catch(error => { if (error instanceof AccessError && error.status === 404) notFound(); throw error; });
  const { request, payload, process } = result;
  const events = await portalRows<{ id: string; createdAt: Date; description: string | null }>(executor, sql`SELECT id,"createdAt",description FROM "ProcessEvent" WHERE "processId"=${process.id} AND "eventType" IN ('OPENED','FUNCTIONAL_REQUEST_OPENED','FUNCTIONAL_COMPLEMENT_REQUESTED','FUNCTIONAL_COMPLEMENT','FUNCTIONAL_DECISION','FUNCTIONAL_EXECUTION') ORDER BY "createdAt",id`);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title={process.protocolNumber} description={payload.serviceName} action={<Link href="/portal-servidor/protocolos">Meus protocolos</Link>} />
    <section className="grid gap-2 rounded border border-slate-300 bg-white p-4 text-xs md:grid-cols-3"><p><strong>Solicitante:</strong> {access.employee.name}</p><p><strong>Finalidade:</strong> Interno da Entidade</p><p><strong>Abertura:</strong> {process.createdAt.toLocaleString("pt-BR")}</p><p><strong>Tramitação:</strong> {process.status}</p><p><strong>Setor:</strong> {process.currentDepartment?.name || "Não informado"}</p><p><strong>Prazo:</strong> {process.expectedCompletionAt?.toLocaleDateString("pt-BR") || "Conforme roteiro"}</p><p><strong>Decisão:</strong> {request.status}</p><p><strong>Execução:</strong> {payload.execution}</p><p><strong>Formulário:</strong> versão {payload.configuration.version}</p></section>
    <section className="rounded border border-slate-300 bg-white p-4 text-sm"><h2 className="font-semibold">Requerimento</h2><p className="mt-2 whitespace-pre-wrap">{payload.description}</p><dl className="mt-3 grid gap-2 text-xs">{payload.configuration.fields.map(field => <div key={field.code}><dt className="font-semibold">{field.label}</dt><dd className="whitespace-pre-wrap">{payload.values[field.code] || "Não informado"}</dd></div>)}</dl></section>
    {request.decision && <section className="rounded border border-slate-300 bg-white p-4"><h2 className="text-sm font-semibold">Decisão administrativa</h2><p className="mt-2 whitespace-pre-wrap text-sm">{request.decision}</p></section>}
    {payload.resultPublicationId && <section className="rounded border border-slate-300 bg-white p-4"><h2 className="text-sm font-semibold">Resultado da providência</h2><a href={`/api/portal-servidor/emissoes/${payload.resultPublicationId}`} className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline">Emitir documento de resultado</a></section>}
    <section className="rounded border border-slate-300 bg-white p-4"><h2 className="text-sm font-semibold">Documentos do requerimento</h2>{payload.attachments.map(document => <p key={document.documentId} className="mt-2 text-xs"><a href={`/api/portal-servidor/protocolos/${request.id}/documentos/${document.documentId}`} className="font-semibold text-emerald-800 underline">{payload.configuration.requiredDocuments.find(item => item.code === document.code)?.label || document.code}</a></p>)}</section>
    <a href={`/api/portal-servidor/protocolos/${request.id}/comprovante`} className="w-fit text-xs font-semibold text-emerald-800 underline">Emitir comprovante do protocolo</a>
    {payload.awaitingComplement && <ComplementForm requestId={request.id} requestKey={randomUUID()} documents={payload.configuration.requiredDocuments} requiredCodes={payload.complementDocumentCodes} />}
    <section className="rounded border border-slate-300 bg-white p-4"><h2 className="text-sm font-semibold">Histórico do requerimento</h2><ol className="mt-3 space-y-3">{events.map(event => <li key={event.id} className="border-l-2 border-emerald-600 pl-3 text-xs"><time className="text-slate-500">{event.createdAt.toLocaleString("pt-BR")}</time><p className="whitespace-pre-wrap">{event.description}</p></li>)}</ol></section>
  </div>;
}
