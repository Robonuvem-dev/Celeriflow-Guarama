import { eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { dteCategories, dteMessages, dteMessageEvents } from "@/db/schema/taxation-dte";

export function collectionJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function collectionRow<T>(rows: T[], message = "Registro tributário não encontrado."): T {
  const row = rows[0];
  if (row === undefined) throw new Error(message);
  return row;
}

export async function lockCollectionOperation(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}

/** Caller owns the transaction and mailbox authorization. Replays never replace
 * the original message, deadline, GED evidence or availability event. */
export async function publishCollectionMessage(tx: DatabaseTransaction, input: {
  mailboxId: string; categoryCode: string; categoryName: string; deadlineDays: number;
  subject: string; body: string; key: string; actorUsuarioId: string;
  description: string; documentId?: string | null; processId?: string | null;
}) {
  await lockCollectionOperation(tx, `COLLECTION-DTE:${input.key}`);
  let category = (await tx.select().from(dteCategories).where(eq(dteCategories.code, input.categoryCode)).limit(1))[0];
  if (!category) {
    await tx.insert(dteCategories).values({ code: input.categoryCode, name: input.categoryName, retentionRequired: true, defaultDeadlineDays: input.deadlineDays }).onConflictDoNothing({ target: dteCategories.code });
    category = collectionRow(await tx.select().from(dteCategories).where(eq(dteCategories.code, input.categoryCode)).limit(1));
  }
  const existing = (await tx.select().from(dteMessages).where(eq(dteMessages.idempotencyKey, input.key)).limit(1))[0];
  if (existing) return existing;
  const message = collectionRow(await tx.insert(dteMessages).values({ mailboxId: input.mailboxId, categoryId: category.id, subject: input.subject, body: input.body, idempotencyKey: input.key, deadlineAt: new Date(Date.now() + category.defaultDeadlineDays * 86400000), documentId: input.documentId, processId: input.processId, createdByUsuarioId: input.actorUsuarioId }).returning());
  await tx.insert(dteMessageEvents).values({ messageId: message.id, eventType: "DISPONIBILIZADA", description: input.description, actorUsuarioId: input.actorUsuarioId });
  return message;
}
