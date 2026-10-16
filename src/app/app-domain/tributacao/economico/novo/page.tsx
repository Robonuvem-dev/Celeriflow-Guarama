import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import EconomicProfileClient from "../[id]/perfil/EconomicProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const dynamic = "force-dynamic";
export default async function NewEconomicRegistrationPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, taxpayers, properties, documents, processes, catalogs] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, include: { person: true, company: true }, take: 1000 }),
    prisma.realEstate.findMany({ select: { id: true, municipalInsc: true, streetName: true }, take: 1000 }),
    prisma.document.findMany({ where: { status: "Válido" }, select: { id: true, title: true }, take: 200 }),
    prisma.process.findMany({ select: { id: true, protocolNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", ...(allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { version: "desc" } }),
  ]);
  const latest = new Map<string, typeof catalogs[number]>();
  for (const catalog of catalogs) if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  const types = [...latest.values()].filter(catalog => catalog.status === "ATIVO").map(catalog => ({ name: catalog.title, kind: String(taxScopeSnapshot(catalog.data).kind), budgetUnitId: String(taxScopeSnapshot(catalog.data).budgetUnitId) })).filter(type => ["TIPO_EMPRESA", "TIPO_SOCIO"].includes(type.kind));
  return <EconomicProfileClient creating id="NEW" inscription="" primaryCnae="" profile={null} version={0} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(property => ({ id: property.id, label: `${property.municipalInsc ?? property.id} · ${property.streetName ?? ""}` }))} documents={documents.map(document => ({ id: document.id, label: document.title }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} types={types}/>;
}
