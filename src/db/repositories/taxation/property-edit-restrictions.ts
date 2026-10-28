import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { realEstates } from "../../schema/registry";
import { users, accessProfiles } from "../../schema/identity";
import { taxRegistryEntries } from "../../schema/taxation-registry";
import { taxAuditLogs } from "../../schema/taxation-audit";
import { insertAuditEvent } from "../platform/audit";
import type { TaxActor } from "@/lib/tributacao";
import { taxRegistrySnapshot } from "@/lib/tributacao/registry-data";
import type { EffectivePropertyEditRestriction, PropertyEditApprovalInput, PropertyEditControlData, PropertyEditRestrictionInput, TaxRegistryEntryRecord } from "@/lib/contracts/taxation-registry";

async function assertScope(tx: DatabaseTransaction, actor: TaxActor, governmentEntityId: string, budgetUnitId: string): Promise<void> {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  const binding = await tx.execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "PlanningEntityUnit" WHERE "governmentEntityId"=${governmentEntityId} AND "budgetUnitId"=${budgetUnitId} LIMIT 1`);
  if (!binding.rows[0]) throw new Error("Ente/UG não conciliados.");
}

export async function publishPropertyEditRestrictionInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: PropertyEditRestrictionInput): Promise<TaxRegistryEntryRecord> {
  await assertScope(tx, actor, input.governmentEntityId, input.budgetUnitId);
  const [property] = await tx.select({ id: realEstates.id }).from(realEstates).where(eq(realEstates.id, input.propertyId)).limit(1).for("update");
  if (!property) throw new Error("Imóvel não encontrado.");
  const [previous] = await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, input.propertyId), eq(taxRegistryEntries.category, "PROPERTY_EDIT_RESTRICTION"))).orderBy(desc(taxRegistryEntries.version)).limit(1);
  if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Restrição alterada. Recarregue antes de publicar.");
  if (previous) {
    const data = taxRegistrySnapshot(previous.data);
    if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Origem da restrição diverge; concilie com o supervisor da UG.");
  }
  const [entry] = await tx.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_EDIT_RESTRICTION", title: "Bloqueio de edição imobiliária", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: input }).returning();
  await tx.insert(taxAuditLogs).values({ action: "PUBLISH_PROPERTY_EDIT_RESTRICTION", entityType: "RealEstate", entityId: input.propertyId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...input, previousId: previous?.id ?? null, restrictionId: entry.id } });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: "ADMINISTRATIVE_MUTATION", targetType: "TaxRegistryEntry", targetId: entry.id });
  return entry;
}

export async function approvePropertyEditInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: PropertyEditApprovalInput): Promise<TaxRegistryEntryRecord> {
  const [property] = await tx.select().from(realEstates).where(eq(realEstates.id, input.propertyId)).limit(1).for("update");
  if (!property) throw new Error("Imóvel não encontrado.");
  if (property.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Imóvel alterado. Recarregue antes de autorizar.");
  const restrictions = await tx.execute<EffectivePropertyEditRestriction>(sql`SELECT * FROM property_effective_edit_restriction(${property.id})`);
  const restriction = restrictions.rows[0];
  if (!restriction || typeof restriction.governmentEntityId !== "string" || typeof restriction.budgetUnitId !== "string") throw new Error("O imóvel não possui bloqueio ativo conciliado.");
  await assertScope(tx, actor, restriction.governmentEntityId, restriction.budgetUnitId);
  const [operator] = await tx.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.id, input.operatorId), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1);
  if (!operator) throw new Error("Operador ativo não encontrado.");
  const expiresAt = new Date(Date.now() + input.validMinutes * 60000).toISOString();
  const [approval] = await tx.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_EDIT_APPROVAL", title: "Liberação pontual pelo supervisor", status: "DISPONIVEL", actorUsuarioId: actor.usuarioId, data: { ...input, restrictionId: restriction.id, expiresAt, governmentEntityId: restriction.governmentEntityId, budgetUnitId: restriction.budgetUnitId } }).returning();
  await tx.insert(taxAuditLogs).values({ action: "APPROVE_PROPERTY_EDIT", entityType: "RealEstate", entityId: property.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { approvalId: approval.id, ...input, expiresAt } });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: "ADMINISTRATIVE_MUTATION", targetType: "TaxRegistryEntry", targetId: approval.id });
  return approval;
}

export async function readPropertyEditControlData(db: DatabaseExecutor, propertyId: string): Promise<PropertyEditControlData | null> {
  const [property] = await db.select().from(realEstates).where(eq(realEstates.id, propertyId)).limit(1);
  if (!property) return null;
  const [restrictions, approvals, unitRows, operators, effective] = await Promise.all([
    db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), eq(taxRegistryEntries.category, "PROPERTY_EDIT_RESTRICTION"))).orderBy(desc(taxRegistryEntries.version)).limit(1),
    db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, propertyId), eq(taxRegistryEntries.category, "PROPERTY_EDIT_APPROVAL"))).orderBy(desc(taxRegistryEntries.createdAt)).limit(30),
    db.execute<{ budgetUnitId: string; governmentEntityId: string; entityName: string; unitCode: string }>(sql`SELECT u."budgetUnitId",u."governmentEntityId",e.name AS "entityName",b.code AS "unitCode" FROM "PlanningEntityUnit" u JOIN "GovernmentEntity" e ON e.id=u."governmentEntityId" JOIN "BudgetUnit" b ON b.id=u."budgetUnitId"`),
    db.select({ id: users.id, nome: users.nome }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.ativo, true))).orderBy(asc(users.nome)),
    db.execute<EffectivePropertyEditRestriction>(sql`SELECT * FROM property_effective_edit_restriction(${propertyId})`),
  ]);
  return { property, restriction: restrictions[0] ?? null, approvals, units: unitRows.rows.map(row => ({ budgetUnitId: row.budgetUnitId, governmentEntityId: row.governmentEntityId, governmentEntity: { name: row.entityName }, budgetUnit: { code: row.unitCode } })), operators, effective: effective.rows };
}
