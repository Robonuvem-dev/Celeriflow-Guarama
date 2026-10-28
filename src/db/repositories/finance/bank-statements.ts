import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { bankStatementImports, bankStatementItems, automatedBankDownloads } from "../../schema/finance-banking";
import type { AutomatedStatementDownload, ImportedBankStatement, ImportedBankStatementItem, StatementAccountLabel } from "@/lib/contracts/finance-banking";
import type { JsonValue } from "../../json";
import type { OfxTransaction } from "@/lib/financeiro/ofx-parser";

export type StatementImportAccount = StatementAccountLabel & { id: string; isActive: boolean; budgetUnitId: string | null; compe: string | null };

export async function lockStatementImportAccount(tx: DatabaseTransaction, id: string): Promise<StatementImportAccount | null> {
  // Lock only the account, before inspecting historical FITIDs or creating a batch.
  await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id = ${id} FOR UPDATE`);
  const result = await tx.execute<StatementImportAccount>(sql`
    SELECT a.id, a."bankName", a.agency, a."accountNumber", a."isActive", a."budgetUnitId", b.compe
    FROM "BankAccount" a LEFT JOIN "Bank" b ON b.id = a."bankId" WHERE a.id = ${id}`);
  return result.rows[0] ?? null;
}

export async function findImportedStatement(db: DatabaseExecutor, bankAccountId: string, checksum: string): Promise<ImportedBankStatement | null> {
  const rows = await db.select().from(bankStatementImports).where(and(eq(bankStatementImports.bankAccountId, bankAccountId), eq(bankStatementImports.checksum, checksum))).limit(1);
  return rows[0] ?? null;
}

export async function findHistoricalStatementItems(db: DatabaseExecutor, bankAccountId: string, transactionIds: string[]): Promise<ImportedBankStatementItem[]> {
  if (!transactionIds.length) return [];
  return db.select().from(bankStatementItems).where(and(eq(bankStatementItems.bankAccountId, bankAccountId), inArray(bankStatementItems.bankTransactionId, transactionIds)));
}

export async function insertImportedStatement(tx: DatabaseTransaction, input: {
  bankAccountId: string; format: string; fileName: string; checksum: string; originalBytes: Uint8Array;
  originalEncoding: string; processingSnapshot: JsonValue;
}): Promise<ImportedBankStatement> {
  const [record] = await tx.insert(bankStatementImports).values(input).returning();
  return record;
}

export async function insertImportedStatementItems(tx: DatabaseTransaction, bankAccountId: string, statementImportId: string, transactions: OfxTransaction[]): Promise<void> {
  if (!transactions.length) return;
  await tx.insert(bankStatementItems).values(transactions.map(item => ({
    bankAccountId, statementImportId, date: item.date, description: item.description, reference: item.reference,
    direction: item.amount.isNegative() ? "Saída" : "Entrada", sinal: item.amount.isNegative() ? "DEBITO" : "CREDITO",
    valueDecimal: item.amount.abs(), bankTransactionId: item.id, transactionType: item.type,
  })));
}

export async function readImportedStatement(db: DatabaseExecutor, id: string, allowedBudgetUnitIds?: string[]): Promise<(ImportedBankStatement & { bankAccount: StatementAccountLabel; items: ImportedBankStatementItem[] }) | null> {
  const scope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length
    ? sql`a."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(unit => sql`${unit}`), sql`, `)})` : sql`false`;
  const accountResult = await db.execute<StatementAccountLabel>(sql`
    SELECT a."bankName", a.agency, a."accountNumber" FROM "BankStatementImport" s
    JOIN "BankAccount" a ON a.id = s."bankAccountId" WHERE s.id = ${id} AND ${scope}`);
  const bankAccount = accountResult.rows[0];
  if (!bankAccount) return null;
  const [record] = await db.select().from(bankStatementImports).where(eq(bankStatementImports.id, id));
  if (!record) return null;
  const items = await db.select().from(bankStatementItems).where(eq(bankStatementItems.statementImportId, id)).orderBy(asc(bankStatementItems.date), asc(bankStatementItems.id));
  return { ...record, bankAccount, items };
}

export async function readAutomatedStatementDownload(db: DatabaseExecutor, id: string): Promise<AutomatedStatementDownload | null> {
  const [record] = await db.select().from(automatedBankDownloads).where(eq(automatedBankDownloads.id, id)).limit(1);
  return record ?? null;
}

export async function findArchivedStatementAccount(db: DatabaseExecutor, download: StatementAccountLabel): Promise<{ budgetUnitId: string | null } | null> {
  const result = await db.execute<{ budgetUnitId: string | null }>(sql`
    SELECT "budgetUnitId" FROM "BankAccount" WHERE "bankName" = ${download.bankName}
      AND agency = ${download.agency} AND "accountNumber" = ${download.accountNumber} LIMIT 1`);
  return result.rows[0] ?? null;
}
