import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "../../src/db/connection";
import type { JsonValue } from "../../src/db/json";
import { JsonNull } from "../../src/db/json";
import { withDatabaseTransaction } from "../../src/db/transaction";
import { readFollowupBinding } from "../../src/db/repositories/health-followup/exchange";
import { healthFollowupBatches, healthFollowupBatchItems } from "../../src/db/schema/health-followup";
import { followupContractNameSchema, followupEnvelopeSchema, followupHash } from "../../src/lib/saude/followup-contract";

export type FollowupEvidenceItem = { originType: string; originId: string; sourceVersion: string; idempotencyKey: string; payload: unknown };
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

/** Creates new independent evidence; never modifies immutable historical rows.
 * Explicit corruption options exercise integrity failures without disabling DDL. */
export async function storeFollowupEvidence(connection: DatabaseConnection, bindingId: string, items: FollowupEvidenceItem[], options: { hashSha256?: string; ordinalOffset?: number } = {}) {
  return withDatabaseTransaction(connection, async tx => {
    const binding = await readFollowupBinding(tx, bindingId), batchId = randomUUID();
    const contract = followupContractNameSchema.parse(binding.contractName);
    const envelope = followupEnvelopeSchema.parse({ contract, schemaVersion: "1.0.0", batchId, sender: { connectionId: binding.connectionId, code: binding.connection.code, unitId: binding.unitId }, receiver: { id: binding.receiverId, code: binding.receiver.code, name: binding.receiver.name }, fromDate: "2026-10-19", toDate: "2026-10-19", generatedAt: new Date().toISOString(), reprocessOfId: null, records: items.map(item => item.payload) });
    await tx.insert(healthFollowupBatches).values({ id: batchId, bindingId, idempotencyKey: randomUUID(), fromDate: new Date("2026-10-19T00:00:00Z"), toDate: new Date("2026-10-19T00:00:00Z"), contractName: contract, schemaVersion: "1.0.0", hashSha256: options.hashSha256 ?? followupHash(envelope), payload: json(envelope), createdByUsuarioId: "followup-actor" });
    await tx.insert(healthFollowupBatchItems).values(items.map((item, index) => ({ batchId, ordinal: index + 1 + (options.ordinalOffset ?? 0), originType: item.originType, originId: item.originId, sourceVersion: item.sourceVersion, idempotencyKey: item.idempotencyKey, payload: item.payload === null ? JsonNull : json(item.payload) })));
    return batchId;
  });
}
