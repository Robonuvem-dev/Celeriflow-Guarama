import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { hrIntegrationEvents } from "../../schema/personnel-workforce";
import type { JsonValue } from "../../json";

export const personnelJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export function stablePersonnelJson(value: unknown): string {
  const normalize = (item: JsonValue): JsonValue => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : item;
  return JSON.stringify(normalize(personnelJson(value)));
}
export async function lockPersonnel(tx: DatabaseExecutor, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:${key}`}))`);
}
export async function findHrIntegrationEvent(database: DatabaseExecutor, sourceKey: string) {
  const [event] = await database.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.sourceKey, sourceKey)).limit(1);
  return event ?? null;
}
export async function requireHrIntegrationEvent(database: DatabaseExecutor, sourceKey: string) {
  const event = await findHrIntegrationEvent(database, sourceKey);
  if (!event) throw new Error("Origem da integração não encontrada.");
  return event;
}
/** The caller supplies its transaction; no connection or nested transaction is opened here. */
export async function enqueueHrIntegration(tx: DatabaseExecutor, input: { sourceKey: string; domain: string; environment: string; eventType: string; payload: unknown }) {
  const payload = personnelJson(input.payload);
  const payloadHash = createHash("sha256").update(stablePersonnelJson(payload)).digest("hex");
  await lockPersonnel(tx, `event:${input.sourceKey}`);
  const previous = await findHrIntegrationEvent(tx, input.sourceKey);
  if (previous) {
    if (previous.payloadHash !== payloadHash || previous.domain !== input.domain || previous.environment !== input.environment || previous.eventType !== input.eventType) throw new Error("Origem da integração repetida com conteúdo diferente.");
    return previous;
  }
  const [event] = await tx.insert(hrIntegrationEvents).values({ ...input, payload, payloadHash }).returning();
  return event;
}
