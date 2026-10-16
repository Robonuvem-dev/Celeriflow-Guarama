import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import PrintSocialDocumentButton from "../../../requisicoes/[id]/comprovante/PrintSocialDocumentButton";

export default async function ReferralReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  const access = await resolveSocialAccess(context);
  const referral = await context.prisma.socialReferral.findFirst({
    where: { id, ...(access.administrator ? {} : { unitId: { in: access.links.map((link) => link.unitId) } }) },
    include: { unit: { select: { name: true } }, destinationOrganization: { select: { name: true, address: true, phone: true } } },
  });
  if (!referral) notFound();
  const [institution, person, family, reason, priority] = await Promise.all([
    context.prisma.institution.findFirst({ select: { name: true, legalName: true, city: true, state: true } }),
    referral.personId ? context.prisma.person.findUnique({ where: { id: referral.personId }, select: { fullName: true, socialName: true, cpf: true } }) : null,
    referral.familyId ? context.prisma.socialFamily.findUnique({ where: { id: referral.familyId }, select: { familyCode: true, representative: { select: { fullName: true, socialName: true, cpf: true } } } }) : null,
    context.prisma.socialCatalogEntry.findUnique({ where: { id: referral.reasonId }, select: { name: true } }),
    referral.priorityTypeId ? context.prisma.socialCatalogEntry.findUnique({ where: { id: referral.priorityTypeId }, select: { name: true } }) : null,
  ]);
  const subject = person || family?.representative;
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SocialReferral", targetId: referral.id });
  return <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-slate-900">
    <PrintSocialDocumentButton />
    <header className="border-b-2 border-slate-800 pb-3 text-center"><h1 className="text-lg font-bold">{institution?.name || institution?.legalName || "Prefeitura Municipal de Ibema"}</h1><p className="text-sm">Assistência Social — {institution?.city || "Ibema"}/{institution?.state || "PR"}</p><h2 className="mt-3 text-base font-bold">Encaminhamento e contrarreferência socioassistencial</h2><p className="text-[10px]">Modelo local POC-1.0 • dados registrados no sistema</p></header>
    <section className="grid gap-2 text-xs sm:grid-cols-2"><p><strong>Protocolo:</strong> {referral.id}</p><p><strong>Data:</strong> {referral.referredAt.toISOString().slice(0, 10).split("-").reverse().join("/")}</p><p><strong>Pessoa / responsável familiar:</strong> {subject?.socialName || subject?.fullName || "Não localizado"}</p><p><strong>CPF:</strong> {subject?.cpf || "—"}</p><p><strong>Origem:</strong> {referral.unit.name}</p><p><strong>Destino:</strong> {referral.destinationOrganization.name}</p><p><strong>Endereço do destino:</strong> {referral.destinationOrganization.address || "—"}</p><p><strong>Contato:</strong> {referral.destinationOrganization.phone || "—"}</p><p><strong>Motivo:</strong> {reason?.name || "—"}</p><p><strong>Público prioritário:</strong> {priority?.name || "Não informado"}</p></section>
    <section className="space-y-2 text-xs"><p><strong>Profissional de referência no destino:</strong> {referral.referenceProfessional || "Não informado"}</p><p className="whitespace-pre-wrap"><strong>Objetivo / dificuldades identificadas:</strong> {referral.objective}</p><p className="whitespace-pre-wrap"><strong>Observações:</strong> {referral.observations || "—"}</p></section>
    <section className="break-inside-avoid space-y-2 border-t pt-3 text-xs"><h3 className="font-bold">Contrarreferência</h3>{referral.counterReferenceAt ? <><p><strong>Data do atendimento:</strong> {referral.counterReferenceAt.toISOString().slice(0, 10).split("-").reverse().join("/")}</p><p><strong>Profissional:</strong> {referral.counterReferenceProfessional}</p><p className="whitespace-pre-wrap">{referral.counterReferenceDescription}</p></> : <p>Retorno ainda não registrado.</p>}</section>
    <footer className="grid gap-8 pt-8 text-center text-xs sm:grid-cols-2"><div className="border-t pt-2">Profissional responsável pelo encaminhamento</div><div className="border-t pt-2">Profissional responsável pelo atendimento no destino</div></footer>
  </main>;
}
