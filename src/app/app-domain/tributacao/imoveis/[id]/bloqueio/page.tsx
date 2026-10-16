import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import PropertyEditControls from "./PropertyEditControls";

export const dynamic = "force-dynamic";
export default async function PropertyEditRestrictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const { id } = await params;
  if (!isSystemAdministrator(user)) return <p className="p-4">Solicite ao supervisor administrativo a liberação pontual da edição deste imóvel.</p>;
  const property = await prisma.realEstate.findUnique({ where: { id } }); if (!property) notFound();
  const [restriction, approvals, units, operators] = await Promise.all([
    prisma.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_EDIT_RESTRICTION" }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_EDIT_APPROVAL" }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.planningEntityUnit.findMany({ include: { governmentEntity: true, budgetUnit: true } }),
    prisma.usuario.findMany({ where: { ativo: true, perfil: { ativo: true } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const data = taxScopeSnapshot(restriction?.data);
  const effective = await prisma.$queryRaw<{ id: string; governmentEntityId: string; budgetUnitId: string }[]>`SELECT * FROM property_effective_edit_restriction(${id})`;
  return <PropertyEditControls propertyId={id} inscription={property.municipalInsc ?? id} updatedAt={property.updatedAt.toISOString()} version={restriction?.version ?? 0} enabled={effective.length > 0} budgetUnitId={String(data.budgetUnitId ?? effective[0]?.budgetUnitId ?? "")} reason={String(data.reason ?? (effective.length ? "Restrição coletiva de área de risco/APP" : ""))} units={units.map(unit => ({ id: unit.budgetUnitId, entityId: unit.governmentEntityId, label: `${unit.governmentEntity.name} · ${unit.budgetUnit.code}` }))} operators={operators.map(operator => ({ id: operator.id, label: operator.nome }))} approvals={approvals.map(approval => ({ id: approval.id, status: approval.status, actor: approval.actorUsuarioId, date: approval.createdAt.toISOString(), data: taxScopeSnapshot(approval.data) }))}/>;
}
