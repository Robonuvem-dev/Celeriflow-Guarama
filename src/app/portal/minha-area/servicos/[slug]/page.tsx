import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { citizenTaxpayerAccesses } from "@/db/schema/citizen-access";
import { taxpayers as taxpayerTable, companies, realEstates } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { portalTaxAssessments, portalTaxes } from "@/db/schema/portal-fiscal";
import { readPortalRegistryIdentity } from "@/db/repositories/portal-content/services";
import { readDigitalService } from "@/lib/portal-cidadao/catalog";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { ServiceRequestForm } from "@/components/portal-institucional/ServiceRequestForm";

export const dynamic = "force-dynamic";
export default async function RequestServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, account = await getCitizenAccount(`/portal/minha-area/servicos/${slug}`), service = await readDigitalService(db, slug);
  if (!service) notFound();
  if (service.provider === "ESPECIALIZADO") redirect(service.definition.targetPath);
  if (service.provider === "INFORMATIVO") redirect(`/portal/servicos/${slug}`);
  const grants = await db.select().from(citizenTaxpayerAccesses).where(and(eq(citizenTaxpayerAccesses.usuarioId, account.id), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt)));
  const ids = grants.filter((item) => Array.isArray(item.scopes) && item.scopes.includes(service.definition.taxpayerScope || "PROCESSOS")).map((item) => item.taxpayerId);
  const taxpayers = ids.length ? await db.select({ id: taxpayerTable.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayerTable).leftJoin(people, eq(people.id, taxpayerTable.personId)).leftJoin(companies, eq(companies.id, taxpayerTable.companyId)).where(and(inArray(taxpayerTable.id, ids), eq(taxpayerTable.status, "Ativo"))) : [];
  const assessments = service.definition.executor === "GUIA" ? await db.select({ id: portalTaxAssessments.id, taxpayerId: portalTaxAssessments.taxpayerId, assessmentNumber: portalTaxAssessments.assessmentNumber, year: portalTaxAssessments.year, tax: { name: portalTaxes.name } }).from(portalTaxAssessments).innerJoin(portalTaxes, eq(portalTaxes.id, portalTaxAssessments.taxId)).where(and(inArray(portalTaxAssessments.taxpayerId, taxpayers.map(item => item.id)), notInArray(portalTaxAssessments.status, ["Pago", "Extinto", "Cancelado", "Suspenso"]))) : [];
  const properties = service.definition.executor === "ITBI" ? await db.select({ id: realEstates.id, taxpayerId: realEstates.taxpayerId, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName }).from(realEstates).where(inArray(realEstates.taxpayerId, taxpayers.map(item => item.id))) : [];
  const registryIdentity = await readPortalRegistryIdentity(db, account.id, true);
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <Link href={`/portal/servicos/${slug}`} className="text-sm font-semibold text-emerald-800 hover:underline">← Requisitos do serviço</Link>
    <header><h1 className="text-3xl font-bold text-slate-950">{service.publicService.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">A solicitação gera um protocolo central e é encaminhada ao setor responsável. Formulário versão {service.version}.</p></header>
    <ServiceRequestForm serviceId={service.id} version={service.version} provider={service.provider} definition={service.definition} allowsRegistryIdentity={Boolean(registryIdentity)} taxpayers={taxpayers.map((item) => ({ id: item.id, label: item.person?.fullName || item.company?.corporateName || "Contribuinte autorizado" }))} resources={{ assessments: assessments.map((item) => ({ id: item.id, taxpayerId: item.taxpayerId, label: `${item.assessmentNumber || item.tax.name} — ${item.year}` })), properties: properties.map((item) => ({ id: item.id, taxpayerId: item.taxpayerId, label: `${item.municipalInsc || "Imóvel"} — ${item.streetName || "Endereço não informado"}` })) }} />
  </main>;
}
