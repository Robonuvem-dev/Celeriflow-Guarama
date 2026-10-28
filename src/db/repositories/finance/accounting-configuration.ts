import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import type { DatabaseTransaction } from "../../transaction";
import { accountingComponents, accountingEvents, accountingRules } from "../../schema/finance-accounting";

export async function upsertAccountingEvent(tx: DatabaseTransaction, input: { code: string; name: string; description?: string }) {
  const [event] = await tx.insert(accountingEvents).values(input).onConflictDoUpdate({ target: accountingEvents.code, set: { name: input.name, description: input.description, isActive: true, updatedAt: new Date() } }).returning();
  return event;
}
export async function replaceAccountingRule(tx: DatabaseTransaction, input: { eventId: string; debitAccountId: string; creditAccountId: string; description?: string; isReference: boolean }) {
  const replaced = await tx.select({ id: accountingRules.id }).from(accountingRules).where(and(eq(accountingRules.eventId, input.eventId), eq(accountingRules.isActive, true), or(ne(accountingRules.debitAccountId, input.debitAccountId), ne(accountingRules.creditAccountId, input.creditAccountId))));
  if (replaced.length) await tx.update(accountingRules).set({ isActive: false }).where(inArray(accountingRules.id, replaced.map(rule => rule.id)));
  const [rule] = await tx.insert(accountingRules).values(input).onConflictDoUpdate({ target: [accountingRules.eventId, accountingRules.debitAccountId, accountingRules.creditAccountId], set: { isActive: true, description: input.description, isReference: input.isReference, updatedAt: new Date() } }).returning();
  return { rule, replaced };
}
export async function listAccountingRuleComponents(tx: DatabaseTransaction, ruleId: string) {
  return tx.select().from(accountingComponents).where(eq(accountingComponents.ruleId, ruleId)).orderBy(asc(accountingComponents.sequence));
}
export async function replaceAccountingRuleComponents(tx: DatabaseTransaction, ruleId: string, components: { debitAccountId: string; creditAccountId: string; valueBasis: string; creditFromOriginBank?: boolean }[]): Promise<void> {
  await tx.delete(accountingComponents).where(eq(accountingComponents.ruleId, ruleId));
  if (components.length) await tx.insert(accountingComponents).values(components.map((component, index) => ({ ...component, ruleId, sequence: index + 1 })));
}
