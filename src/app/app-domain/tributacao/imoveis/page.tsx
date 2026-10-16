import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ImoveisClient from "./ImoveisClient";

export const dynamic = "force-dynamic";

export default async function ImoveisFiscaisPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const administrator = isSystemAdministrator(user);
  const profiles = administrator ? [] : await prisma.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  const permittedIds = [...latest.values()].filter(row => user.allowedBudgetUnitIds.includes(String(taxScopeSnapshot(row.data).budgetUnitId))).map(row => row.entityId);
  const [imoveis, rawTaxpayers] = await Promise.all([prisma.realEstate.findMany({
    where: administrator ? {} : { id: { in: permittedIds } },
    include: {
      taxpayer: {
        include: { person: true, company: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  }), prisma.taxpayer.findMany({ where: { status: "Ativo" }, include: { person: true, company: true }, orderBy: { updatedAt: "desc" } })]);

  const taxpayers = rawTaxpayers.map((taxpayer) => ({ id: taxpayer.id, name: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Contribuinte sem nome" }));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ImoveisClient imoveis={imoveis} taxpayers={taxpayers} />
    </div>
  );
}
