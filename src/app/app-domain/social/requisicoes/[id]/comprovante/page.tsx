import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import PrintSocialDocumentButton from "./PrintSocialDocumentButton";

const labels: Record<string, string> = { PENDING: "Pendente de avaliação", APPROVED: "Autorizado", DENIED: "Negado", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
export default async function BenefitReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  const access = await resolveSocialAccess(context);
  const request = await context.prisma.socialBenefitRequest.findFirst({ where: { id, ...(access.administrator ? {} : { unitId: { in: access.links.map((link) => link.unitId) } }) }, include: { unit: { select: { name: true, streetAddress: true, municipality: true } }, family: { select: { familyCode: true, representative: { select: { fullName: true, socialName: true, cpf: true } } } }, items: { include: { benefit: { select: { name: true } } } } } });
  if (!request) notFound();
  assertSocialUnitAccess(access, request.unitId);
  const items = request.items.filter((item) => access.administrator || !item.approvalRequired || item.authorizerEmployeeId === access.employeeId || request.createdBy === context.user.id);
  if (!items.length) notFound();
  const institution = await context.prisma.institution.findFirst({ select: { name: true, legalName: true, city: true, state: true } });
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SocialBenefitRequest", targetId: request.id });
  return <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-slate-900"><PrintSocialDocumentButton />
    <header className="border-b-2 border-slate-800 pb-3 text-center"><h1 className="text-lg font-bold">{institution?.name || institution?.legalName || "Prefeitura Municipal de Ibema"}</h1><p className="text-sm">Assistência Social — {institution?.city || "Ibema"}/{institution?.state || "PR"}</p><h2 className="mt-3 text-base font-bold">Requisição, avaliação e entrega de benefícios</h2><p className="text-[10px]">Modelo local POC-1.0 • informações extraídas dos registros do sistema</p></header>
    <section className="grid gap-2 text-xs sm:grid-cols-2"><p><strong>Protocolo:</strong> {request.id}</p><p><strong>Data:</strong> {request.createdAt.toLocaleString("pt-BR")}</p><p><strong>Família / responsável:</strong> {request.family.representative.socialName || request.family.representative.fullName}</p><p><strong>CPF:</strong> {request.family.representative.cpf}</p><p><strong>Equipamento:</strong> {request.unit.name}</p><p><strong>Código familiar:</strong> {request.family.familyCode || "—"}</p></section>
    <p className="whitespace-pre-wrap text-xs"><strong>Solicitação:</strong> {request.reason}</p>
    {request.cancelledAt && <p className="text-xs"><strong>Cancelada em {request.cancelledAt.toLocaleString("pt-BR")}:</strong> {request.cancellationReason}</p>}
    {items.map((item) => <section key={item.id} className="break-inside-avoid space-y-2 rounded border p-3 text-xs"><h3 className="font-semibold">{item.benefit.name}</h3><p>Quantidade: {item.quantity}{item.value ? ` • Valor: ${socialCentsDisplay(socialAmountCents(item.value.toString()))}` : ""} • Situação: {labels[item.status]}</p><p className="whitespace-pre-wrap"><strong>Avaliação:</strong> {item.assessment || (item.approvalRequired ? "Ainda não avaliado" : "Autorização prévia não exigida pela configuração")}</p>{item.evaluatedAt && <p>Data da avaliação: {item.evaluatedAt.toLocaleString("pt-BR")} • Responsável: {item.evaluatedBy}</p>}<p className="whitespace-pre-wrap"><strong>Entrega:</strong> {item.deliveredAt ? `${item.deliveredAt.toLocaleString("pt-BR")} — ${item.deliveryReason}` : "Não registrada"}</p>{item.deliveredBy && <p>Responsável pela entrega: {item.deliveredBy}</p>}</section>)}
    <footer className="grid gap-8 pt-8 text-center text-xs sm:grid-cols-2"><div className="border-t pt-2">Pessoa / responsável familiar</div><div className="border-t pt-2">Profissional responsável</div></footer>
  </main>;
}
