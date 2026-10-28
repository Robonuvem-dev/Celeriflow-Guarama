import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { publishAccountantInTransaction } from "@/db/repositories/taxation/accountants";
import type { TaxRegistryEntryRecord } from "@/lib/contracts/taxation-registry";
import { z } from "zod";
import type { TaxActor } from "./index";

const accountantSchema = z.object({ taxpayerId: z.string().min(1), crc: z.string().trim().min(1).max(80), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(4000) });

export async function publishAccountant(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof accountantSchema>): Promise<TaxRegistryEntryRecord> {
  const input = accountantSchema.parse(raw);
  return withDatabaseTransaction(connection, tx => publishAccountantInTransaction(tx, actor, input));
}
