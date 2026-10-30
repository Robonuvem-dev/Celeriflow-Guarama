import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { financeCheckbooks, financeCheques } from "@/db/schema/finance-cheques";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export const checkbookSchema = z.object({ bankAccountId: z.string().min(1), label: z.string().trim().min(2).max(120), firstNumber: z.coerce.number().int().positive().max(2147483647), lastNumber: z.coerce.number().int().positive().max(2147483647) }).refine(v => v.lastNumber >= v.firstNumber && v.lastNumber - v.firstNumber < 10000, "Intervalo de talão inválido (máximo 10.000 folhas).");
export const chequeIssueSchema = z.object({ checkbookId: z.string().min(1), number: z.coerce.number().int().positive(), payee: z.string().trim().min(2).max(200), amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/).refine(v => new Decimal(v).gt(0), "Valor deve ser positivo."), issuedAt: z.iso.date() });
async function accountFor(db: DatabaseExecutor, actor: Actor, id: string) {
  const [account] = await db.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, id));
  if (!account?.isActive || !account.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(account.budgetUnitId)) throw new Error("Conta fora das unidades autorizadas ou inativa.");
  return account;
}
function civilDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed > new Date()) throw new Error("Data inválida ou futura.");
  return parsed;
}
export async function createCheckbook(connection: DatabaseConnection, actor: Actor, input: unknown) {
  const data = checkbookSchema.parse(input);
  return withDatabaseTransaction(connection, async tx => {
    await accountFor(tx, actor, data.bankAccountId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"chequebook:" + data.bankAccountId}))`);
    const overlaps = await tx.select({ id: financeCheckbooks.id }).from(financeCheckbooks).where(and(eq(financeCheckbooks.bankAccountId, data.bankAccountId), lte(financeCheckbooks.firstNumber, data.lastNumber), gte(financeCheckbooks.lastNumber, data.firstNumber)));
    if (overlaps.length) throw new Error("Numeração sobreposta a outro talão desta conta.");
    const [book] = await tx.insert(financeCheckbooks).values({ ...data, createdByUsuarioId: actor.usuarioId }).returning();
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "FinanceCheckbook", targetId: book.id });
    return book;
  });
}
export async function issueCheque(connection: DatabaseConnection, actor: Actor, input: unknown) {
  const data = chequeIssueSchema.parse(input);
  const issuedAt = civilDate(data.issuedAt);
  return withDatabaseTransaction(connection, async tx => {
    const [book] = await tx.select().from(financeCheckbooks).where(eq(financeCheckbooks.id, data.checkbookId));
    if (!book || data.number < book.firstNumber || data.number > book.lastNumber) throw new Error("Folha fora do talão informado.");
    await accountFor(tx, actor, book.bankAccountId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"cheque:" + book.bankAccountId + ":" + data.number}))`);
    if ((await tx.select({ id: financeCheques.id }).from(financeCheques).where(and(eq(financeCheques.bankAccountId, book.bankAccountId), eq(financeCheques.number, data.number)))).length) throw new Error("Folha já emitida; números cancelados não podem ser reutilizados.");
    const [cheque] = await tx.insert(financeCheques).values({ checkbookId: book.id, bankAccountId: book.bankAccountId, number: data.number, payee: data.payee, amount: new Decimal(data.amount), issuedAt, createdByUsuarioId: actor.usuarioId }).returning();
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "FinanceCheque", targetId: cheque.id });
    return cheque;
  });
}
export async function changeChequeState(connection: DatabaseConnection, actor: Actor, input: { id: string; status: "CANCELADO" | "COMPENSADO"; reason?: string; clearedAt?: string }) {
  if (!["CANCELADO", "COMPENSADO"].includes(input.status)) throw new Error("Situação inválida.");
  const reason = input.reason?.trim();
  if (input.status === "CANCELADO" && (!reason || reason.length < 5 || reason.length > 1000)) throw new Error("Informe o motivo do cancelamento (5 a 1.000 caracteres).");
  const clearedAt = input.status === "COMPENSADO" ? civilDate(input.clearedAt ?? "") : null;
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`select "id" from "FinanceCheque" where "id"=${input.id} for update`);
    const [cheque] = await tx.select().from(financeCheques).where(eq(financeCheques.id, input.id));
    if (!cheque) throw new Error("Cheque não encontrado.");
    await accountFor(tx, actor, cheque.bankAccountId);
    if (cheque.status !== "EMITIDO") throw new Error("Somente cheques emitidos podem ser compensados ou cancelados.");
    if (clearedAt && clearedAt < cheque.issuedAt) throw new Error("Compensação anterior à emissão.");
    const [updated] = await tx.update(financeCheques).set({ status: input.status, clearedAt, cancellationReason: input.status === "CANCELADO" ? reason : null }).where(eq(financeCheques.id, cheque.id)).returning();
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "FinanceCheque", targetId: cheque.id });
    return updated;
  });
}
