import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicProfileSchema } from "@/lib/tributacao/economic-profile";
import EconomicProfileClient from "./EconomicProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { db } from "@/db/client";
import { listFiscalRegistrations, listFiscalPlanningUnits, listFiscalProperties, listFiscalDocumentOptions, listFiscalProcessOptions } from "@/db/repositories/taxation-pages/lookups";
import { listPageTaxpayers, listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";

export default async function EconomicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const row = (await listFiscalRegistrations(database, { ids: [id], limit: 1 }))[0]; if (!row) notFound();
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [profile, units, taxpayers, properties, documents, processes, catalogs] = await Promise.all([
    listFiscalEntries(database, { entityType: "ECONOMIC_REGISTRATION", entityIds: [id], categories: ["ECONOMIC_PROFILE"], limit: 1 }).then(rows => rows[0]),
    listFiscalPlanningUnits(database, allowed),
    listPageTaxpayers(database, { active: true, limit: 1000 }),
    listFiscalProperties(database, { limit: 1000 }),
    listFiscalDocumentOptions(database),
    listFiscalProcessOptions(database),
    listFiscalEntries(database, { entityType: "FISCAL_CATALOG", categories: ["TYPED_FISCAL_CATALOG"], allowedBudgetUnitIds: allowed }),
  ]);
  const data = profile ? economicProfileSchema.parse(profile.data) : null;
  if (data && allowed && !allowed.includes(data.budgetUnitId)) notFound();
  if (data) data.primaryCnae = row.primaryCnae ?? "";
  const latest = new Map<string, typeof catalogs[number]>();
  for (const catalog of catalogs) if (!latest.has(catalog.entityId)) latest.set(catalog.entityId, catalog);
  const types = [...latest.values()].filter(catalog => catalog.status === "ATIVO").map(catalog => ({ name: catalog.title, kind: String(taxScopeSnapshot(catalog.data).kind), budgetUnitId: String(taxScopeSnapshot(catalog.data).budgetUnitId) })).filter(type => ["TIPO_EMPRESA", "TIPO_SOCIO"].includes(type.kind));
  return <EconomicProfileClient id={id} inscription={row.municipalInsc} primaryCnae={row.primaryCnae ?? ""} profile={data} version={profile?.version ?? 0} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(property => ({ id: property.id, label: `${property.municipalInsc ?? property.id} · ${property.streetName ?? ""}` }))} documents={documents.map(document => ({ id: document.id, label: document.title }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} types={types}/>;
}
