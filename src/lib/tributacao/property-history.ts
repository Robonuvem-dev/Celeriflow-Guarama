import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { insertProperty, mutateProperty } from "@/db/repositories/tax-property/records";
import type { PropertyCreateInput, PropertyMutation, PropertyRecord } from "@/db/repositories/tax-property/contracts";

/** Transaction-local attribution used by the database history trigger. */
export async function attributePropertyHistory(tx: DatabaseTransaction, actorId: string): Promise<void> {
  if (!actorId.trim()) throw new Error("Identifique o usuário da alteração imobiliária.");
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true)`);
}

/** Apply native protocol/supervisor guards to a mutation of cadastral relationships. */
export async function touchPropertyMetadata(tx: DatabaseTransaction, actorId: string, propertyId: string, processId: string | null): Promise<void> {
  await attributePropertyHistory(tx, actorId);
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`);
  await mutateProperty(tx, propertyId, { updatedAt: new Date() });
}

export async function createPropertyWithHistory(connection: DatabaseConnection, actorId: string, data: PropertyCreateInput): Promise<PropertyRecord> {
  return withDatabaseTransaction(connection, async tx => {
    await attributePropertyHistory(tx, actorId);
    return insertProperty(tx, data);
  });
}

export async function updatePropertyWithHistory(connection: DatabaseConnection, actorId: string, id: string, data: PropertyMutation): Promise<PropertyRecord> {
  return withDatabaseTransaction(connection, async tx => {
    await attributePropertyHistory(tx, actorId);
    return mutateProperty(tx, id, data);
  });
}
