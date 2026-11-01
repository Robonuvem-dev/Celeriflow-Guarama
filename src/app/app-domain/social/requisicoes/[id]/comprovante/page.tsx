import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import PrintSocialDocumentButton from "./PrintSocialDocumentButton";
import { db } from "@/db/client";
import { findSocialInstitution, listSocialBenefitRequests } from "@/db/repositories/social/queries";
import { socialRequestDetails } from "@/db/schema/social-workflows";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { eq, inArray } from "drizzle-orm";

const labels: Record<string, string> = { PENDING: "Pendente de avaliação", APPROVED: "Autorizado", DENIED: "Negado", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
export default async function BenefitReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  const access = await resolveSocialAccess(context);
  const database = context.database ?? db;
  const [request] = await listSocialBenefitRequests(database, access, id);
  if (!request) notFound();
  assertSocialUnitAccess(access, request.unitId);
  const items = request.items.filter((item) => access.administrator || !item.approvalRequired || item.authorizerEmployeeId === access.employeeId || request.createdBy === context.user.id);
  if (!items.length) notFound();
  const institution = await findSocialInstitution(database);
  const [details] = await database.select({ request: socialRequestDetails, professional: employees.name }).from(socialRequestDetails).innerJoin(employees, eq(employees.id, socialRequestDetails.professionalId)).where(eq(socialRequestDetails.requestId, id));
  const parties = details ? await database.select({ id: people.id, name: people.fullName }).from(people).where(inArray(people.id, [details.request.applicantId, details.request.recipientId, request.personId || ""])) : [];
  const partyName = (id: string) => parties.find(p => p.id === id)?.name || id;
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SocialBenefitRequest", targetId: request.id });
  return <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-slate-900"><PrintSocialDocumentButton />
    <header className="border-b-2 border-slate-800 pb-3 text-center"><h1 className="text-lg font-bold">{institution?.name || institution?.legalName || "Administração Municipal"}</h1><p className="text-sm">Assistência Social — {[institution?.city,institution?.state].filter(Boolean).join("/")}</p><h2 className="mt-3 text-base font-bold">Requisição, avaliação e entrega de benefícios</h2><p className="text-[10px]">Modelo CelerFlow • informações extraídas dos registros do sistema</p></header>
    <section className="grid gap-2 text-xs sm:grid-cols-2"><p><strong>Protocolo:</strong> {request.id}</p><p><strong>Data:</strong> {request.createdAt.toLocaleString("pt-BR")}</p><p><strong>Família / responsável:</strong> {request.family.representative.socialName || request.family.representative.fullName}</p><p><strong>CPF:</strong> {request.family.representative.cpf}</p><p><strong>Equipamento:</strong> {request.unit.name}</p><p><strong>Código familiar:</strong> {request.family.familyCode || "—"}</p></section>
    <p className="whitespace-pre-wrap text-xs"><strong>Solicitação:</strong> {request.reason}</p>
    {details && <section className="grid gap-2 text-xs sm:grid-cols-2"><p>Data da demanda: {details.request.requestedAt.split("-").reverse().join("/")}</p><p>Profissional do atendimento: {details.professional}</p><p>Solicitante: {partyName(details.request.applicantId)}</p><p>Usufrutuário: {partyName(details.request.recipientId)}</p><p>Destinação: {request.personId ? `Indivíduo — ${partyName(request.personId)}` : "Família"}</p><p>Modalidade de entrega: {details.request.deliveryType}</p></section>}
    {request.cancelledAt && <p className="text-xs"><strong>Cancelada em {request.cancelledAt.toLocaleString("pt-BR")}:</strong> {request.cancellationReason}</p>}
    {items.map((item) => <section key={item.id} className="break-inside-avoid space-y-2 rounded border p-3 text-xs"><h3 className="font-semibold">{item.benefit.name}</h3><p>Quantidade: {item.quantity}{item.value ? ` • Valor: ${socialCentsDisplay(socialAmountCents(item.value.toString()))}` : ""} • Situação: {labels[item.status]}</p><p className="whitespace-pre-wrap"><strong>Avaliação:</strong> {item.assessment || (item.approvalRequired ? "Ainda não avaliado" : "Autorização prévia não exigida pela configuração")}</p>{item.evaluatedAt && <p>Data da avaliação: {item.evaluatedAt.toLocaleString("pt-BR")} • Responsável: {item.evaluatedBy}</p>}<p className="whitespace-pre-wrap"><strong>Entrega:</strong> {item.deliveredAt ? `${item.deliveredAt.toLocaleString("pt-BR")} — ${item.deliveryReason}` : "Não registrada"}</p>{item.deliveredBy && <p>Responsável pela entrega: {item.deliveredBy}</p>}</section>)}
    <footer className="grid gap-8 pt-8 text-center text-xs sm:grid-cols-2"><div className="border-t pt-2">Pessoa / responsável familiar</div><div className="border-t pt-2">Profissional responsável</div></footer>
  </main>;
}
