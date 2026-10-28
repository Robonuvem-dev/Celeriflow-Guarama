import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../src/db/transaction";
import { accountingEntries, accountingTransactions } from "../../src/db/schema/finance-accounting";
import { municipalCostMovements, municipalCostSources } from "../../src/db/schema/finance-costs";

/** Unwrap a native select/returning without weakening required-row checks. */
export async function requiredPersonnelRow<T>(query: PromiseLike<T[]>): Promise<T> {
  const [row] = await query;
  if (!row) throw new Error("Registro obrigatório da regressão financeira de pessoal não encontrado.");
  return row;
}

export async function personnelAccountingTransaction(database: DatabaseExecutor, predicate: SQL) {
  const transaction = await requiredPersonnelRow(database.select().from(accountingTransactions).where(predicate).limit(1));
  const entries = await database.select().from(accountingEntries).where(eq(accountingEntries.transactionId, transaction.id));
  return { ...transaction, entries };
}

export async function personnelPayrollCostSources(database: DatabaseExecutor, transactionId?: string) {
  const sources = await database.select().from(municipalCostSources).where(and(
    eq(municipalCostSources.sourceType, "PAYROLL"),
    transactionId === undefined ? undefined : sql`${municipalCostSources.snapshot} #>> '{evidence,transactionId}' = ${transactionId}`,
  ));
  const movements = sources.length
    ? await database.select().from(municipalCostMovements).where(inArray(municipalCostMovements.sourceId, sources.map(source => source.id)))
    : [];
  return sources.map(source => ({ ...source, movements: movements.filter(movement => movement.sourceId === source.id) }));
}
