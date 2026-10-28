import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { dteCategories, dteMailboxes, dteMessages, dteMessageEvents } from "@/db/schema/taxation-dte";
import { catalogAccessGrants, catalogPowers, catalogPowerEvents } from "@/db/schema/tax-catalog-rules";
import { catalogRequired } from "./records";

export async function ensureDteDefaults(tx: DatabaseTransaction) {
  await tx.insert(dteCategories).values([
    { code: "INTIMACAO", name: "Intimação fiscal", retentionRequired: true, defaultDeadlineDays: 5 },
    { code: "AVISO", name: "Aviso informativo", retentionRequired: false, defaultDeadlineDays: 5 },
    { code: "DOCUMENTO", name: "Documento fiscal", retentionRequired: true, defaultDeadlineDays: 5 },
  ]).onConflictDoNothing({ target: dteCategories.code });
}
export async function findDteMailbox(db: DatabaseExecutor, taxpayerId: string, cnpj: string | null) {
  return (await db.select().from(dteMailboxes).where(and(eq(dteMailboxes.taxpayerId, taxpayerId), cnpj === null ? isNull(dteMailboxes.establishmentCnpj) : eq(dteMailboxes.establishmentCnpj, cnpj))).limit(1))[0] ?? null;
}
export async function readDteMailbox(db: DatabaseExecutor, id: string) {
  return (await db.select().from(dteMailboxes).where(eq(dteMailboxes.id, id)).limit(1))[0] ?? null;
}
export async function findDteConfirmation(db: DatabaseExecutor, tokenHash: string) {
  return (await db.select().from(dteMailboxes).where(eq(dteMailboxes.confirmationTokenHash, tokenHash)).limit(1))[0] ?? null;
}
export async function insertDteMailbox(tx: DatabaseTransaction, input: typeof dteMailboxes.$inferInsert) {
  return catalogRequired((await tx.insert(dteMailboxes).values(input).returning())[0]);
}
export async function updateDteMailbox(tx: DatabaseTransaction, id: string, input: Partial<typeof dteMailboxes.$inferInsert>) {
  return catalogRequired((await tx.update(dteMailboxes).set(input).where(eq(dteMailboxes.id, id)).returning())[0]);
}
export async function insertDteGrant(tx: DatabaseTransaction, input: typeof catalogAccessGrants.$inferInsert) {
  return catalogRequired((await tx.insert(catalogAccessGrants).values(input).returning())[0]);
}
export async function findDteGrant(db: DatabaseExecutor, codeHash: string, taxpayerId: string) {
  return (await db.select({ ...getTableColumns(catalogAccessGrants), mailbox: getTableColumns(dteMailboxes) }).from(catalogAccessGrants).innerJoin(dteMailboxes, eq(dteMailboxes.id, catalogAccessGrants.mailboxId)).where(and(eq(catalogAccessGrants.codeHash, codeHash), eq(catalogAccessGrants.authorizedTaxpayerId, taxpayerId))).limit(1))[0] ?? null;
}
export async function readDteGrant(db: DatabaseExecutor, id: string) {
  return (await db.select().from(catalogAccessGrants).where(eq(catalogAccessGrants.id, id)).limit(1))[0] ?? null;
}
export async function revokeDteGrant(tx: DatabaseTransaction, id: string) {
  return catalogRequired((await tx.update(catalogAccessGrants).set({ status: "REVOGADO", revokedAt: new Date() }).where(eq(catalogAccessGrants.id, id)).returning())[0]);
}
export async function readDteCategory(db: DatabaseExecutor, id: string) {
  return (await db.select().from(dteCategories).where(and(eq(dteCategories.id, id), eq(dteCategories.isActive, true))).limit(1))[0] ?? null;
}
export async function listActiveDteMailboxes(db: DatabaseExecutor, ids: string[]) {
  return db.select().from(dteMailboxes).where(and(inArray(dteMailboxes.id, ids), eq(dteMailboxes.status, "ATIVA")));
}
export async function findDteMessage(db: DatabaseExecutor, key: string) {
  return (await db.select().from(dteMessages).where(eq(dteMessages.idempotencyKey, key)).limit(1))[0] ?? null;
}
export async function readDteMessage(db: DatabaseExecutor, id: string) {
  return (await db.select().from(dteMessages).where(eq(dteMessages.id, id)).limit(1))[0] ?? null;
}
export async function readDteMessageCategory(db: DatabaseExecutor, id: string) {
  return (await db.select({ ...getTableColumns(dteMessages), category: getTableColumns(dteCategories) }).from(dteMessages).innerJoin(dteCategories, eq(dteCategories.id, dteMessages.categoryId)).where(eq(dteMessages.id, id)).limit(1))[0] ?? null;
}
export async function insertDteMessage(tx: DatabaseTransaction, input: typeof dteMessages.$inferInsert, events: Omit<typeof dteMessageEvents.$inferInsert, "messageId">[]) {
  const message = catalogRequired((await tx.insert(dteMessages).values(input).returning())[0]);
  if (events.length) await tx.insert(dteMessageEvents).values(events.map(event => ({ ...event, messageId: message.id })));
  return message;
}
export async function updateDteMessage(tx: DatabaseTransaction, id: string, input: Partial<typeof dteMessages.$inferInsert>, event: Omit<typeof dteMessageEvents.$inferInsert, "messageId">) {
  const message = catalogRequired((await tx.update(dteMessages).set(input).where(eq(dteMessages.id, id)).returning())[0]);
  await tx.insert(dteMessageEvents).values({ ...event, messageId: id });
  return message;
}
export async function readDtePower(db: DatabaseExecutor, id: string) {
  return (await db.select().from(catalogPowers).where(eq(catalogPowers.id, id)).limit(1))[0] ?? null;
}
export async function insertDtePower(tx: DatabaseTransaction, input: typeof catalogPowers.$inferInsert, event: Omit<typeof catalogPowerEvents.$inferInsert, "powerOfAttorneyId">) {
  const power = catalogRequired((await tx.insert(catalogPowers).values(input).returning())[0]);
  await tx.insert(catalogPowerEvents).values({ ...event, powerOfAttorneyId: power.id });
  return power;
}
export async function updateDtePower(tx: DatabaseTransaction, id: string, input: Partial<typeof catalogPowers.$inferInsert>, event: Omit<typeof catalogPowerEvents.$inferInsert, "powerOfAttorneyId">) {
  const power = catalogRequired((await tx.update(catalogPowers).set(input).where(eq(catalogPowers.id, id)).returning())[0]);
  await tx.insert(catalogPowerEvents).values({ ...event, powerOfAttorneyId: id });
  return power;
}
