import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import type { ReadExecutor } from "@/lib/contracts/planning-execution-operations";

export function readActivityRelationOverlap(db: ReadExecutor, input: { governmentEntityId: string; relationType: string; leftCanonicalId: string; rightCanonicalId: string; from: Date; until: Date }) {
  return db.select().from(taxRegistryEntries).where(and(
    eq(taxRegistryEntries.category, "MUNICIPAL_ACTIVITY_RELATION"), eq(taxRegistryEntries.entityType, "GOVERNMENT_ENTITY"), eq(taxRegistryEntries.entityId, input.governmentEntityId), eq(taxRegistryEntries.status, "ATIVO"),
    lte(taxRegistryEntries.effectiveFrom, input.until), or(isNull(taxRegistryEntries.effectiveUntil), gte(taxRegistryEntries.effectiveUntil, input.from)),
    sql`${taxRegistryEntries.data}->'relationType' = ${JSON.stringify(input.relationType)}::jsonb`,
    sql`${taxRegistryEntries.data}->'leftCanonicalId' = ${JSON.stringify(input.leftCanonicalId)}::jsonb`,
    sql`${taxRegistryEntries.data}->'rightCanonicalId' = ${JSON.stringify(input.rightCanonicalId)}::jsonb`,
  ));
}

export function readServiceActivityRelations(db: ReadExecutor, input: { governmentEntityId: string; activityId: string; date: Date }) {
  return db.select({ id: taxRegistryEntries.id, data: taxRegistryEntries.data, effectiveFrom: taxRegistryEntries.effectiveFrom, effectiveUntil: taxRegistryEntries.effectiveUntil }).from(taxRegistryEntries).where(and(
    eq(taxRegistryEntries.category, "MUNICIPAL_ACTIVITY_RELATION"), eq(taxRegistryEntries.entityType, "GOVERNMENT_ENTITY"), eq(taxRegistryEntries.entityId, input.governmentEntityId), eq(taxRegistryEntries.status, "ATIVO"),
    lte(taxRegistryEntries.effectiveFrom, input.date), gte(taxRegistryEntries.effectiveUntil, input.date),
    sql`${taxRegistryEntries.data}->'rightCanonicalId' = ${JSON.stringify(input.activityId)}::jsonb`,
  )).orderBy(asc(taxRegistryEntries.id));
}
