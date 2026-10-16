import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfigurableCadastresClient from "./ConfigurableCadastresClient";

export const dynamic = "force-dynamic";

export default async function FiscalCatalogPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const scopeFilter = allowed ? { OR: allowed.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {};
  const [units, catalogs, records, properties, registrations, declarations, neighborhoods, streets, processes, documents] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { budgetUnit: true, governmentEntity: true } }),
    prisma.taxRegistryEntry.findMany({ where: { category: "TYPED_FISCAL_CATALOG", ...scopeFilter }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { category: "TYPED_FISCAL_RECORD", ...scopeFilter }, orderBy: { version: "desc" } }),
    prisma.realEstate.findMany({ orderBy: { municipalInsc: "asc" }, select: { id: true, municipalInsc: true }, take: 1000 }),
    prisma.economicRegistration.findMany({ orderBy: { municipalInsc: "asc" }, select: { id: true, municipalInsc: true }, take: 1000 }),
    prisma.itbiDeclaration.findMany({ where: allowed ? { OR: allowed.map(budgetUnitId => ({ calculationSnapshot: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}, select: { id: true, declarationNumber: true }, take: 1000 }),
    prisma.neighborhood.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.street.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.process.findMany({ select: { id: true, protocolNumber: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.document.findMany({ where: { status: "Válido" }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const latest = new Map<string, typeof catalogs[number]>();
  for (const catalog of catalogs) if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  const latestRecords = new Map<string, typeof records[number]>();
  for (const record of records) { const key = `${record.entityType}:${record.entityId}:${record.title}`; if (!latestRecords.has(key)) latestRecords.set(key, record); }
  return <ConfigurableCadastresClient units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code} · ${unit.budgetUnit.name}` }))} catalogs={[...latest.values()].map(entry => ({ id: entry.entityId, version: entry.version, data: fiscalCatalogSchema.parse(entry.data) }))} records={[...latestRecords.values()].map(entry => ({ id: entry.id, catalogId: String(taxScopeSnapshot(entry.data).catalogId ?? entry.title), entityId: entry.entityId, entityType: entry.entityType, version: entry.version, active: entry.status === "ATIVO", values: taxScopeSnapshot(taxScopeSnapshot(entry.data).values), frontage: String(taxScopeSnapshot(entry.data).frontage ?? ""), date: entry.createdAt.toISOString() }))} targets={[...properties.map(item => ({ id: item.id, type: "REAL_ESTATE", label: `Imóvel ${item.municipalInsc ?? item.id}` })), ...registrations.map(item => ({ id: item.id, type: "ECONOMIC_REGISTRATION", label: `Empresa ${item.municipalInsc}` })), ...declarations.map(item => ({ id: item.id, type: "ITBI_DECLARATION", label: item.declarationNumber }))]} neighborhoods={neighborhoods.map(item => ({ id: item.id, label: item.name }))} streets={streets.map(item => ({ id: item.id, label: item.name }))} processes={processes.map(item => ({ id: item.id, label: item.protocolNumber }))} documents={documents.map(item => ({ id: item.id, label: item.title }))} />;
}
