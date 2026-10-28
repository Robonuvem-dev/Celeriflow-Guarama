import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readControlFinalReport } from "@/lib/c7/circumstantiated-report";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { isPublicationPublic } from "@/lib/transparencia/publication-policy";
import type { JsonObject } from "@/db/json";
import { db } from "@/db/client";
import { listControlPlans } from "@/db/repositories/internal-control/records";
import { digitalCertificates } from "@/db/schema/document-workflow";
import { transparencyPublications } from "@/db/schema/transparency";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { ControlFinalReportsClient } from "./ControlFinalReportsClient";

export default async function ControlFinalReportsPage() {
  const { user } = await getTenantContextForModule("ADMINISTRACAO");
  const plans = (await listControlPlans(db, { ownerId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds, descending: true })).filter(plan => plan.budgetUnitId !== null);
  const certificates = isSystemAdministrator(user) ? await db.select({ id: digitalCertificates.id, alias: digitalCertificates.alias, purposes: digitalCertificates.purposes }).from(digitalCertificates).where(and(eq(digitalCertificates.status, "ACTIVE"), lte(digitalCertificates.validFrom, new Date()), gte(digitalCertificates.validTo, new Date()))) : [];
  const settings = await getTransparencySettings(db);
  const entities = settings.entities.filter(entity => entity.nativeIds.some(id => plans.some(plan => plan.budgetUnit?.planningEntityUnit?.governmentEntityId === id))).map(entity => entity.key);
  const publications = await db.select().from(transparencyPublications).where(and(inArray(transparencyPublications.entity, entities), eq(transparencyPublications.status, "PUBLISHED"))).orderBy(asc(transparencyPublications.title));
  const editions = plans.flatMap(plan => plan.events.flatMap(event => {
    if (event.eventType !== "CONTROL_REPORT_EDITED") return [];
    const edition = readControlFinalReport(event.snapshot);
    if (!edition) return [];
    const final = plan.events.find(item => item.eventType === "CONTROL_REPORT_FINALIZED" && (item.snapshot as JsonObject).reportId === edition.reportId);
    const publication = plan.events.find(item => item.eventType === "CONTROL_REPORT_PUBLISHED" && (item.snapshot as JsonObject).finalId === final?.id);
    const signed = plan.events.some(item => item.eventType === "CONTROL_REPORT_SIGNED" && (item.snapshot as JsonObject).finalId === final?.id);
    return [{ ...edition, id: event.id, planId: plan.id, finalId: final?.id ?? null, publicKey: publication ? String((publication.snapshot as JsonObject).publicKey) : null, signed }];
  }));
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Relatórios circunstanciados de Controle Interno</h1><Link href="/controle-interno" className="underline">Voltar ao Controle</Link><ControlFinalReportsClient plans={plans.filter(plan => plan.status === "ABERTO").map(plan => ({ id: plan.id, title: plan.title }))} editions={editions} attachments={publications.filter(publication => isPublicationPublic(publication, settings) && publication.fileUrl && publication.sha256).map(publication => ({ publicKey: publication.publicKey, title: publication.title, entity: publication.entity }))} certificates={certificates.filter(certificate => Array.isArray(certificate.purposes) && certificate.purposes.includes("CONTROLE_INTERNO")).map(certificate => ({ id: certificate.id, name: certificate.alias }))} /></section>;
}
