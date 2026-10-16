import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readControlFinalReport } from "@/lib/c7/circumstantiated-report";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { isPublicationPublic } from "@/lib/transparencia/publication-policy";
import type { Prisma } from "@prisma/client";
import { ControlFinalReportsClient } from "./ControlFinalReportsClient";

export default async function ControlFinalReportsPage() {
  const { prisma, user } = await getTenantContextForModule("ADMINISTRACAO");
  const plans = await prisma.internalControlPlan.findMany({ where: { ownerId: user.id, budgetUnitId: { not: null, ...(isSystemAdministrator(user) ? {} : { in: user.allowedBudgetUnitIds }) } }, include: { events: { where: { eventType: { in: ["CONTROL_REPORT_EDITED", "CONTROL_REPORT_FINALIZED", "CONTROL_REPORT_PUBLISHED", "CONTROL_REPORT_SIGNED"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }, budgetUnit: { select: { planningEntityUnit: { select: { governmentEntityId: true } } } } }, orderBy: { createdAt: "desc" } });
  const certificates = isSystemAdministrator(user) ? await prisma.digitalCertificate.findMany({ where: { status: "ACTIVE", validFrom: { lte: new Date() }, validTo: { gte: new Date() } }, select: { id: true, alias: true, purposes: true } }) : [];
  const settings = await getTransparencySettings(prisma);
  const entities = settings.entities.filter(entity => entity.nativeIds.some(id => plans.some(plan => plan.budgetUnit?.planningEntityUnit?.governmentEntityId === id))).map(entity => entity.key);
  const publications = await prisma.transparencyPublication.findMany({ where: { entity: { in: entities }, status: "PUBLISHED" }, orderBy: { title: "asc" } });
  const editions = plans.flatMap(plan => plan.events.flatMap(event => {
    if (event.eventType !== "CONTROL_REPORT_EDITED") return [];
    const edition = readControlFinalReport(event.snapshot);
    if (!edition) return [];
    const final = plan.events.find(item => item.eventType === "CONTROL_REPORT_FINALIZED" && (item.snapshot as Prisma.JsonObject).reportId === edition.reportId);
    const publication = plan.events.find(item => item.eventType === "CONTROL_REPORT_PUBLISHED" && (item.snapshot as Prisma.JsonObject).finalId === final?.id);
    const signed = plan.events.some(item => item.eventType === "CONTROL_REPORT_SIGNED" && (item.snapshot as Prisma.JsonObject).finalId === final?.id);
    return [{ ...edition, id: event.id, planId: plan.id, finalId: final?.id ?? null, publicKey: publication ? String((publication.snapshot as Prisma.JsonObject).publicKey) : null, signed }];
  }));
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Relatórios circunstanciados de Controle Interno</h1><Link href="/controle-interno" className="underline">Voltar ao Controle</Link><ControlFinalReportsClient plans={plans.filter(plan => plan.status === "ABERTO").map(plan => ({ id: plan.id, title: plan.title }))} editions={editions} attachments={publications.filter(publication => isPublicationPublic(publication, settings) && publication.fileUrl && publication.sha256).map(publication => ({ publicKey: publication.publicKey, title: publication.title, entity: publication.entity }))} certificates={certificates.filter(certificate => Array.isArray(certificate.purposes) && certificate.purposes.includes("CONTROLE_INTERNO")).map(certificate => ({ id: certificate.id, name: certificate.alias }))} /></section>;
}
