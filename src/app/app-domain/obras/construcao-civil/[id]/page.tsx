import Link from "next/link";
import { notFound } from "next/navigation";
import { HardHat } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule, canViewModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { areaKeys, areaLabels } from "@/lib/obras/construction-policy";
import { db } from "@/db/client";
import { findPageCaseDetail, listPageAnalysts, listPageProcessDocuments, loadPageEvaluations, loadPageMessages, loadPageReplacements, loadPageReviews, pageProcessScope } from "@/db/repositories/works-pages/cases";
import { latestPageDefinition, listPageCatalogNames } from "@/db/repositories/works-pages/settings";
import { pageEmployeeNames } from "@/db/repositories/works-pages/shared";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import ConstructionViabilityClient from "./ConstructionViabilityClient";
import ConstructionReviewClient from "./ConstructionReviewClient";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionAssignmentClient from "./ConstructionAssignmentClient";
import ConstructionConversation from "@/components/construction/ConstructionConversation";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";

export default async function ConstructionCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; reviewPage?: string; assignmentPage?: string; messagePage?: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const database = context.database ?? db;
  const item = await findPageCaseDetail(database, access, id);
  if (!item) notFound();
  const query = await searchParams;
  const { total, page, evaluations } = await loadPageEvaluations(database, item.id, query.page);
  const { reviewTotal, reviewPage, reviews } = await loadPageReviews(database, item.id, query.reviewPage);
  const [checklist, documents, inspectionTypes] = await Promise.all([
    latestPageDefinition(database, "PERMIT"),
    listPageProcessDocuments(database, item.process.id, true, true),
    listPageCatalogNames(database, "INSPECTION_TYPE"),
  ]);
  const processScope = await pageProcessScope(database, item.process.id);
  const canAssign = access.administrator || access.roles.includes("MANAGER");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const { assignmentTotal, assignmentPage, replacements } = await loadPageReplacements(database, item.id, query.assignmentPage);
  const employees = canAssign ? await listPageAnalysts(database, processScope.currentDepartmentId || "", today) : [];
  const staffIds = [...new Set([item.firstAnalystId, item.assignedEmployeeId, ...replacements.flatMap((replacement) => [replacement.previousAnalystId, replacement.replacementEmployeeId])].filter((value): value is string => Boolean(value)))];
  const staffNames = new Map((await pageEmployeeNames(database, staffIds)).map((employee) => [employee.id, employee.name]));
  const { messageTotal, messagePage, conversation } = await loadPageMessages(database, item.id, query.messagePage);
  return <PageFrame className="space-y-3 p-3"><PageHeader title={`Construção Civil — ${item.process.protocolNumber}`} icon={<HardHat className="size-4" />} />
    <div className="flex flex-wrap gap-3 text-xs"><Link href="/obras/construcao-civil" className="text-blue-700 underline">Voltar às solicitações</Link>{canViewModule(context.user, "PROCESSOS") && <Link href={`/protocolos/processos/${item.process.id}`} className="text-blue-700 underline">Abrir protocolo vinculado</Link>}<Link href={`/obras/construcao-civil/${item.id}/documentos`} className="text-blue-700 underline">Emissão e anotação PDF</Link><Link href={`/obras/construcao-civil/${item.id}/ciclo`} className="text-blue-700 underline">Início, vistorias e conclusão</Link><Link href={`/obras/construcao-civil/${item.id}/pranchas`} className="text-blue-700 underline">Extração de pranchas</Link></div>
    <section className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2"><p><strong>Requerente:</strong> {item.process.person?.fullName || item.process.company?.corporateName}</p><p><strong>Setor responsável:</strong> {item.process.currentDepartment?.name || "—"}</p><p><strong>Situação do protocolo:</strong> {item.process.status}</p><p><strong>Categoria:</strong> {item.category === "BUILDING" ? "Obra" : "Parcelamento do solo"} — {item.locationType === "URBAN" ? "Urbana" : "Rural"}</p><p><strong>Modalidade:</strong> {item.regularization ? "Regularização" : "Normal"}</p><p><strong>Configuração preservada:</strong> v{item.configuration.version}</p><p className="whitespace-pre-wrap sm:col-span-2"><strong>Descrição:</strong> {item.process.description}</p></section>
    <section className="space-y-2 rounded-lg border p-3 text-xs"><h2 className="font-semibold">Áreas e memória de cálculo</h2><div className="grid gap-2 sm:grid-cols-5">{areaKeys.map((key) => <p key={key}><strong>{areaLabels[key]}:</strong> {item[key].toString()} m²</p>)}</div><p><strong>Total:</strong> {item.totalArea.toString()} m²</p><pre className="whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(item.calculationSnapshot, null, 2)}</pre></section>
    <section className="space-y-2 rounded-lg border p-3 text-xs"><h2 className="font-semibold">Classificações preservadas na abertura</h2><pre className="whitespace-pre-wrap break-words">{JSON.stringify(item.catalogSnapshot, null, 2)}</pre></section>
    <section className="space-y-2 rounded-lg border p-3 text-xs"><h2 className="font-semibold">Campos adicionais preservados</h2><pre className="whitespace-pre-wrap break-words">{JSON.stringify(item.additionalValues, null, 2)}</pre></section>
    <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Comunicação profissional</h2><ConstructionConversation caseId={item.id} external={false} />{conversation.map((message) => <article key={message.id} className="rounded border p-2"><p className="text-xs text-slate-500">{message.identityId ? "Profissional" : "Setor municipal"} — {message.createdAt.toLocaleString("pt-BR")}</p><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>{message.documentId && canViewModule(context.user, "PROCESSOS") && <Link href={`/protocolos/processos/${item.process.id}`} className="text-xs text-blue-700 underline">Consultar anexo no protocolo</Link>}</article>)}<ErpPagination page={messagePage} total={messageTotal} pageSize={20} previousHref={`?page=${page}&reviewPage=${reviewPage}&assignmentPage=${assignmentPage}&messagePage=${messagePage - 1}`} nextHref={`?page=${page}&reviewPage=${reviewPage}&assignmentPage=${assignmentPage}&messagePage=${messagePage + 1}`} label="mensagens" /></section>
    <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Responsabilidade da análise</h2><p className="text-xs">Responsável atual: {item.assignedEmployeeId ? staffNames.get(item.assignedEmployeeId) || item.assignedEmployeeId : "Distribuído ao setor"} — Retorno de readequações: {item.firstAnalystId ? staffNames.get(item.firstAnalystId) || item.firstAnalystId : "Definido no primeiro parecer"}</p>{canAssign && ["SUBMITTED", "RESUBMITTED", "CORRECTION_REQUIRED"].includes(item.reviewStatus) && <ConstructionAssignmentClient key={`${item.firstAnalystId}:${item.assignedEmployeeId}`} caseId={item.id} firstAnalystId={item.firstAnalystId} assignedEmployeeId={item.assignedEmployeeId} employees={employees} />}
      <OperationalTablePanel title="Histórico de substituições" description={`Responsabilidade da análise · ${item.process.protocolNumber}`}>
        <OperationalListFrame pagination={<OperationalLinkPagination page={assignmentPage} total={assignmentTotal} pathname={`/obras/construcao-civil/${item.id}`} pageParam="assignmentPage" values={{ page, reviewPage, messagePage }} />}>
          <OperationalTable preferenceId="obras-substituicoes" caption="Histórico de substituições" emptyMessage="Nenhuma substituição registrada." columns={operationalColumns([
            ["date", "Data", 130, 90], ["previous", "Anterior", 260, 110], ["replacement", "Substituto", 260, 110], ["reason", "Motivo", 450, 150],
          ])} rows={replacements.map(replacement => ({ id: replacement.id, label: item.process.protocolNumber, values: { date: replacement.createdAt.toLocaleDateString("pt-BR"), previous: replacement.previousAnalystId ? staffNames.get(replacement.previousAnalystId) || replacement.previousAnalystId : "Setor", replacement: staffNames.get(replacement.replacementEmployeeId) || replacement.replacementEmployeeId, reason: replacement.reason } }))} />
        </OperationalListFrame>
      </OperationalTablePanel>
    </section>
    <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Análise e readequações</h2><p className="text-xs">Situação: {item.reviewStatus} — Revisão {item.revisionCount} — Franquia: {item.configuration.freeRevisions}{item.correctionDeadline ? ` — Prazo: ${item.correctionDeadline.toLocaleDateString("pt-BR")}` : ""}</p><ConstructionReviewClient key={`${item.revisionCount}:${item.reviewStatus}:${checklist?.version || 0}`} caseId={item.id} revision={item.revisionCount} status={item.reviewStatus} definitionVersion={checklist?.version || 0} definition={definitionSchema.parse(checklist?.definition || { fields: [], checks: [], documents: [] })} documents={documents} inspectionTypes={inspectionTypes} canReview={access.administrator || access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))} />{reviews.map((review) => <details key={review.id} className="rounded border p-2 text-xs"><summary className="cursor-pointer">{review.createdAt.toLocaleString("pt-BR")} — Revisão {review.revision} — {review.reviewType} — {review.decision}</summary><p className="mt-2 whitespace-pre-wrap">{review.notes}</p><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({ checklist: review.definitionSnapshot, evidencias: review.evidenceSnapshot }, null, 2)}</pre></details>)}{!reviewTotal && <p className="text-xs text-slate-500">Nenhum parecer registrado.</p>}<ErpPagination page={reviewPage} total={reviewTotal} pageSize={20} previousHref={`?page=${page}&reviewPage=${reviewPage - 1}`} nextHref={`?page=${page}&reviewPage=${reviewPage + 1}`} label="pareceres" /></section>
    <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Avaliações de parâmetros urbanísticos</h2><ConstructionViabilityClient caseId={item.id} canEvaluate={access.administrator || access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))} />{evaluations.map((evaluation) => <details key={evaluation.id} className="rounded border p-2 text-xs"><summary className="cursor-pointer">{evaluation.createdAt.toLocaleString("pt-BR")} — {evaluation.outcome === "APPROVED" ? "Parâmetros compatíveis" : evaluation.outcome === "DENIED" ? "Parâmetros incompatíveis" : "Análise técnica necessária"}</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(evaluation.calculationSnapshot, null, 2)}</pre></details>)}{!total && <p className="text-xs text-slate-500">Nenhuma avaliação registrada.</p>}<ErpPagination page={page} total={total} pageSize={20} previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} label="avaliações" /></section>
    <section className="space-y-2 rounded-lg border p-3 text-xs"><h2 className="font-semibold">Imóveis — snapshot cadastral na abertura</h2>{item.properties.map((property) => <details key={property.id} className="rounded border p-2"><summary className="cursor-pointer">{property.realEstateId}</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(property.cadastralSnapshot, null, 2)}</pre></details>)}</section>
  </PageFrame>;
}
