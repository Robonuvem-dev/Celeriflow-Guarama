import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyProfileSchema, propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyProfileClient from "./PropertyProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const dynamic = "force-dynamic";
export default async function PropertyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const property = await prisma.realEstate.findUnique({ where: { id } }); if (!property) notFound();
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const scope = allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {};
  const [entry, units, policies, taxpayers, properties, processes, documents] = await Promise.all([
    prisma.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } }),
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", category: "PROPERTY_REGISTRATION_POLICY", ...scope }, orderBy: { version: "desc" } }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } }, take: 1000 }),
    prisma.realEstate.findMany({ where: { id: { not: id } }, select: { id: true, municipalInsc: true, propertyType: true }, take: 1000 }),
    prisma.process.findMany({ select: { id: true, protocolNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.document.findMany({ where: { status: "Válido" }, select: { id: true, title: true }, take: 200 }),
  ]);
  const profile = entry ? propertyProfileSchema.parse(entry.data) : null;
  if (profile && allowed && !allowed.includes(profile.budgetUnitId)) notFound();
  if (profile) {
    const ownership = await prisma.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: id, category: "FISCAL_OWNERSHIP", status: "ATIVO" }, orderBy: { version: "desc" } });
    const data = taxScopeSnapshot(ownership?.data);
    if (Array.isArray(data.owners)) profile.owners = propertyProfileSchema.shape.owners.parse(data.owners.map(owner => { const value = taxScopeSnapshot(owner); return { taxpayerId: value.taxpayerId, sharePercent: value.sharePercent, primary: value.taxpayerId === property.taxpayerId }; }));
  }
  const latest = new Map<string,typeof policies[number]>(); for (const policy of policies) if (!latest.has(policy.entityId)) latest.set(policy.entityId,policy);
  return <PropertyProfileClient property={{ id, inscription: property.municipalInsc ?? "", updatedAt: property.updatedAt.toISOString(), taxpayerId: property.taxpayerId }} version={entry?.version ?? 0} profile={profile} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} policies={[...latest.values()].map(policy => propertyRegistrationPolicySchema.parse(policy.data))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(item => ({ id: item.id, label: `${item.municipalInsc ?? item.id} · ${item.propertyType ?? "Tipo não informado"}` }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} documents={documents.map(document => ({ id: document.id, label: document.title }))}/>;
}
