import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { approvePropertyEditInTransaction, publishPropertyEditRestrictionInTransaction } from "@/db/repositories/taxation/property-edit-restrictions";
import type { TaxRegistryEntryRecord } from "@/lib/contracts/taxation-registry";
import { z } from "zod";
import type { TaxActor } from "./index";

const restrictionSchema = z.object({ propertyId: z.string().min(1), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), enabled: z.boolean(), reason: z.string().trim().min(1).max(4000) });
const approvalSchema = z.object({ propertyId: z.string().min(1), expectedUpdatedAt: z.string().datetime(), operatorId: z.string().min(1), validMinutes: z.number().int().min(1).max(1440), reason: z.string().trim().min(1).max(4000) });

/** The authenticated action verifies the supervisor profile before calling this service. */
export async function publishPropertyEditRestriction(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof restrictionSchema>): Promise<TaxRegistryEntryRecord> {
  const input = restrictionSchema.parse(raw);
  return withDatabaseTransaction(connection, tx => publishPropertyEditRestrictionInTransaction(tx, actor, input));
}

export async function approvePropertyEdit(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof approvalSchema>): Promise<TaxRegistryEntryRecord> {
  const input = approvalSchema.parse(raw);
  return withDatabaseTransaction(connection, tx => approvePropertyEditInTransaction(tx, actor, input));
}
