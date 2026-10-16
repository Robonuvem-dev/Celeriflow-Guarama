import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicProfileSchema } from "@/lib/tributacao/economic-profile";
import EconomicProfileClient from "./EconomicProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const dynamic = "force-dynamic";

export default async function EconomicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const row = await prisma.economicRegistration.findUnique({ where: { id } }); if (!row) notFound();
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [profile, units, taxpayers, properties, documents, processes, catalogs] = await Promise.all([
    prisma.taxRegistryEntry.findFirst({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: id, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } }),
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, include: { person: true, company: true }, take: 1000 }),
    prisma.realEstate.findMany({ select: { id: true, municipalInsc: true, streetName: true }, take: 1000 }),
    prisma.document.findMany({ where: { status: "Válido" }, select: { id: true, title: true }, take: 200 }),
    prisma.process.findMany({ select: { id: true, protocolNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { version: "desc" } }),
  ]);
  const data = profile ? economicProfileSchema.parse(profile.data) : null;
  if (data && allowed && !allowed.includes(data.budgetUnitId)) notFound();
  if (data) data.primaryCnae = row.primaryCnae ?? "";
  const latest = new Map<string, typeof catalogs[number]>();
  for (const catalog of catalogs) if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  const types = [...latest.values()].filter(catalog => catalog.status === "ATIVO").map(catalog => ({ name: catalog.title, kind: String(taxScopeSnapshot(catalog.data).kind), budgetUnitId: String(taxScopeSnapshot(catalog.data).budgetUnitId) })).filter(type => ["TIPO_EMPRESA", "TIPO_SOCIO"].includes(type.kind));
  return <EconomicProfileClient id={id} inscription={row.municipalInsc} primaryCnae={row.primaryCnae ?? ""} profile={data} version={profile?.version ?? 0} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(property => ({ id: property.id, label: `${property.municipalInsc ?? property.id} · ${property.streetName ?? ""}` }))} documents={documents.map(document => ({ id: document.id, label: document.title }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} types={types}/>;
}
