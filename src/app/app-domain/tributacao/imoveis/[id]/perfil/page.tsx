import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyProfileSchema, propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyProfileClient from "./PropertyProfileClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalProperties, listFiscalProcessOptions, listFiscalDocumentOptions } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries, listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";
export default async function PropertyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const property = (await listFiscalProperties(database, { ids: [id], limit: 1 }))[0]; if (!property) notFound();
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [entry, units, policies, taxpayers, properties, processes, documents] = await Promise.all([
    listFiscalEntries(database, { entityType: "REAL_ESTATE", entityIds: [id], categories: ["PROPERTY_PROFILE"], limit: 1 }).then(rows => rows[0]),
    listFiscalPlanningUnits(database, allowed),
    listFiscalEntries(database, { entityType: "BUDGET_UNIT", categories: ["PROPERTY_REGISTRATION_POLICY"], allowedBudgetUnitIds: allowed }),
    listPageTaxpayers(database, { active: true, limit: 1000 }),
    listFiscalProperties(database, { excludeId: id, limit: 1000 }),
    listFiscalProcessOptions(database),
    listFiscalDocumentOptions(database),
  ]);
  const profile = entry ? propertyProfileSchema.parse(entry.data) : null;
  if (profile && allowed && !allowed.includes(profile.budgetUnitId)) notFound();
  if (profile) {
    const ownership = (await listFiscalEntries(database, { entityType: "REAL_ESTATE", entityIds: [id], categories: ["FISCAL_OWNERSHIP"], status: "ATIVO", limit: 1 }))[0];
    const data = taxScopeSnapshot(ownership?.data);
    if (Array.isArray(data.owners)) profile.owners = propertyProfileSchema.shape.owners.parse(data.owners.map(owner => { const value = taxScopeSnapshot(owner); return { taxpayerId: value.taxpayerId, sharePercent: value.sharePercent, primary: value.taxpayerId === property.taxpayerId }; }));
  }
  const latest = new Map<string,typeof policies[number]>(); for (const policy of policies) if (!latest.has(policy.entityId)) latest.set(policy.entityId,policy);
  return <PropertyProfileClient property={{ id, inscription: property.municipalInsc ?? "", updatedAt: property.updatedAt.toISOString(), taxpayerId: property.taxpayerId }} version={entry?.version ?? 0} profile={profile} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} policies={[...latest.values()].map(policy => propertyRegistrationPolicySchema.parse(policy.data))} taxpayers={taxpayers.map(taxpayer => ({ id: taxpayer.id, label: taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id }))} properties={properties.map(item => ({ id: item.id, label: `${item.municipalInsc ?? item.id} · ${item.propertyType ?? "Tipo não informado"}` }))} processes={processes.map(process => ({ id: process.id, label: process.protocolNumber }))} documents={documents.map(document => ({ id: document.id, label: document.title }))}/>;
}
