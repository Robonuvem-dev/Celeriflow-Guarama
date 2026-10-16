import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ValuationClient from "./ValuationClient";

export const dynamic = "force-dynamic";

export default async function ValuationPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const unrestricted = isSystemAdministrator(user);
  const [taxes, rules, properties, valuations, memories] = await Promise.all([
    prisma.tax.findMany({ where: { isActive: true, name: { in: ["IPTU", "ITBI"], mode: "insensitive" } }, include: { financialMapping: { include: { defaultBankAccount: true } } } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "TAX", category: "PROPERTY_VALUATION_RULE" }, orderBy: { version: "desc" } }),
    prisma.realEstate.findMany({ orderBy: { municipalInsc: "asc" }, select: { id: true, municipalInsc: true, landArea: true, builtArea: true }, take: 1000 }),
    prisma.propertyValuation.findMany({ orderBy: { year: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { category: { in: ["CONFIGURED_VALUATION_IPTU", "CONFIGURED_VALUATION_ITBI"] } }, orderBy: { createdAt: "desc" }, take: 300 }),
  ]);
  const authorized = (data: unknown) => { const scope = taxScopeSnapshot(data as Parameters<typeof taxScopeSnapshot>[0]); return unrestricted || typeof scope.budgetUnitId === "string" && user.allowedBudgetUnitIds.includes(scope.budgetUnitId); };
  const latest = new Map<string, typeof rules[number]>();
  for (const rule of rules) if (authorized(rule.data) && !latest.has(rule.title)) latest.set(rule.title, rule);
  return <ValuationClient taxes={taxes.filter(tax => unrestricted || user.allowedBudgetUnitIds.includes(tax.financialMapping?.defaultBankAccount.budgetUnitId ?? "")).map(tax => ({ id: tax.id, name: tax.name }))} rules={[...latest.values()].map(rule => ({ id: rule.id, taxId: rule.entityId, version: rule.version, data: taxScopeSnapshot(rule.data) }))} properties={properties.map(property => ({ id: property.id, label: property.municipalInsc ?? property.id, landArea: property.landArea, builtArea: property.builtArea }))} valuations={valuations.map(valuation => ({ propertyId: valuation.realEstateId, year: valuation.year, updatedAt: valuation.updatedAt.toISOString() }))} memories={memories.filter(memory => authorized(memory.data)).map(memory => ({ id: memory.id, propertyId: memory.entityId, category: memory.category, date: memory.createdAt.toISOString(), version: memory.version, data: taxScopeSnapshot(memory.data) }))} />;
}
