import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readDigitalService } from "@/lib/portal-cidadao/catalog";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { ServiceRequestForm } from "@/components/portal-institucional/ServiceRequestForm";

export const dynamic = "force-dynamic";
export default async function RequestServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, account = await getCitizenAccount(`/portal/minha-area/servicos/${slug}`), service = await readDigitalService(prisma, slug);
  if (!service) notFound();
  if (service.provider === "ESPECIALIZADO") redirect(service.definition.targetPath);
  if (service.provider === "INFORMATIVO") redirect(`/portal/servicos/${slug}`);
  const grants = await prisma.taxpayerPortalAccess.findMany({ where: { usuarioId: account.id, accessType: "TITULAR", status: "ATIVO", revokedAt: null } });
  const ids = grants.filter((item) => Array.isArray(item.scopes) && item.scopes.includes(service.definition.taxpayerScope || "PROCESSOS")).map((item) => item.taxpayerId);
  const taxpayers = ids.length ? await prisma.taxpayer.findMany({ where: { id: { in: ids }, status: "Ativo" }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } }) : [];
  const assessments = service.definition.executor === "GUIA" ? await prisma.taxAssessment.findMany({ where: { taxpayerId: { in: taxpayers.map((item) => item.id) }, status: { notIn: ["Pago", "Extinto", "Cancelado", "Suspenso"] } }, select: { id: true, taxpayerId: true, assessmentNumber: true, year: true, tax: { select: { name: true } } } }) : [];
  const properties = service.definition.executor === "ITBI" ? await prisma.realEstate.findMany({ where: { taxpayerId: { in: taxpayers.map((item) => item.id) } }, select: { id: true, taxpayerId: true, municipalInsc: true, streetName: true } }) : [];
  const registryIdentity = await prisma.citizenRegistryIdentity.findFirst({ where: { usuarioId: account.id, revokedAt: null, OR: [{ person: { status: "Ativo" } }, { company: { status: "Ativo" } }] }, select: { id: true } });
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <Link href={`/portal/servicos/${slug}`} className="text-sm font-semibold text-emerald-800 hover:underline">← Requisitos do serviço</Link>
    <header><h1 className="text-3xl font-bold text-slate-950">{service.publicService.name}</h1><p className="mt-3 text-sm leading-6 text-slate-600">A solicitação gera um protocolo central e é encaminhada ao setor responsável. Formulário versão {service.version}.</p></header>
    <ServiceRequestForm serviceId={service.id} version={service.version} provider={service.provider} definition={service.definition} allowsRegistryIdentity={Boolean(registryIdentity)} taxpayers={taxpayers.map((item) => ({ id: item.id, label: item.person?.fullName || item.company?.corporateName || "Contribuinte autorizado" }))} resources={{ assessments: assessments.map((item) => ({ id: item.id, taxpayerId: item.taxpayerId, label: `${item.assessmentNumber || item.tax.name} — ${item.year}` })), properties: properties.map((item) => ({ id: item.id, taxpayerId: item.taxpayerId, label: `${item.municipalInsc || "Imóvel"} — ${item.streetName || "Endereço não informado"}` })) }} />
  </main>;
}
