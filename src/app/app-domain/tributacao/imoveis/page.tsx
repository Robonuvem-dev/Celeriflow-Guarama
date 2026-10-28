import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ImoveisClient from "./ImoveisClient";
import { db } from "@/db/client";
import { listFiscalEntries, listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listFiscalPropertyCards } from "@/db/repositories/taxation-pages/cadastral-details";

export const dynamic = "force-dynamic";

export default async function ImoveisFiscaisPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const administrator = isSystemAdministrator(user);
  const profiles = administrator ? [] : await listFiscalEntries(database, { entityType: "REAL_ESTATE", categories: ["PROPERTY_PROFILE"] });
  const latest = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  const permittedIds = [...latest.values()].filter(row => user.allowedBudgetUnitIds.includes(String(taxScopeSnapshot(row.data).budgetUnitId))).map(row => row.entityId);
  const [imoveis, rawTaxpayers] = await Promise.all([listFiscalPropertyCards(database, administrator ? undefined : permittedIds), listPageTaxpayers(database, { active: true, order: "updated-desc" })]);

  const taxpayers = rawTaxpayers.map((taxpayer) => ({ id: taxpayer.id, name: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Contribuinte sem nome" }));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ImoveisClient imoveis={imoveis} taxpayers={taxpayers} />
    </div>
  );
}
