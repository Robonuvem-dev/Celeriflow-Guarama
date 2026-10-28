import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import EconomicProfileClient from "../[id]/perfil/EconomicProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalProperties, listFiscalDocumentOptions, listFiscalProcessOptions } from "@/db/repositories/taxation-pages/lookups";
import { listPageTaxpayers, listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function NewEconomicRegistrationPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, taxpayers, properties, documents, processes, catalogs] = await Promise.all([
    listFiscalPlanningUnits(database, allowed),
    listPageTaxpayers(database, { active: true, limit: 1000 }),
    listFiscalProperties(database, { limit: 1000 }),
    listFiscalDocumentOptions(database),
    listFiscalProcessOptions(database),
    listFiscalEntries(database, { entityType: "FISCAL_CATALOG", categories: ["TYPED_FISCAL_CATALOG"], allowedBudgetUnitIds: allowed }),
  ]);
  const latest = new Map<string, typeof catalogs[number]>();
  for (const catalog of catalogs) if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  const types = [...latest.values()].filter(catalog => catalog.status === "ATIVO").map(catalog => ({ name: catalog.title, kind: String(taxScopeSnapshot(catalog.data).kind), budgetUnitId: String(taxScopeSnapshot(catalog.data).budgetUnitId) })).filter(type => ["TIPO_EMPRESA", "TIPO_SOCIO"].includes(type.kind));
  return <EconomicProfileClient creating id="NEW" inscription="" primaryCnae="" profile={null} version={0} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(property => ({ id: property.id, label: `${property.municipalInsc ?? property.id} · ${property.streetName ?? ""}` }))} documents={documents.map(document => ({ id: document.id, label: document.title }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} types={types}/>;
}
