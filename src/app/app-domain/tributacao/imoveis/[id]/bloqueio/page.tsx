import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxRegistrySnapshot as taxScopeSnapshot } from "@/lib/tributacao/registry-data";
import { db } from "@/db/client";
import { readPropertyEditControlData } from "@/db/repositories/taxation/property-edit-restrictions";
import PropertyEditControls from "./PropertyEditControls";

export const dynamic = "force-dynamic";
export default async function PropertyEditRestrictionPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const { id } = await params;
  if (!isSystemAdministrator(user)) return <p className="p-4">Solicite ao supervisor administrativo a liberação pontual da edição deste imóvel.</p>;
  const controls = await readPropertyEditControlData(context.database ?? db, id); if (!controls) notFound();
  const { property, restriction, approvals, units, operators, effective } = controls;
  const data = taxScopeSnapshot(restriction?.data);
  return <PropertyEditControls propertyId={id} inscription={property.municipalInsc ?? id} updatedAt={property.updatedAt.toISOString()} version={restriction?.version ?? 0} enabled={effective.length > 0} budgetUnitId={String(data.budgetUnitId ?? effective[0]?.budgetUnitId ?? "")} reason={String(data.reason ?? (effective.length ? "Restrição coletiva de área de risco/APP" : ""))} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} operators={operators.map(operator => ({ id: operator.id, label: operator.nome }))} approvals={approvals.map(approval => ({ id: approval.id, status: approval.status, actor: approval.actorUsuarioId, date: approval.createdAt.toISOString(), data: taxScopeSnapshot(approval.data) }))}/>;
}
