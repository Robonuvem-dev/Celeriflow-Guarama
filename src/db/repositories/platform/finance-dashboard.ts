import { and, eq, gte, lte } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { revenues } from "../../schema/finance-revenues";
import { expenses } from "../../schema/finance-expenses";

export async function readFinanceDashboardStats(database: DatabaseExecutor, range?: { from: Date; to: Date }) {
  const [revenueRows, expenseRows] = await Promise.all([
    database.select({ value: revenues.value, valueDecimal: revenues.valueDecimal, classification: revenues.classification })
      .from(revenues).where(and(eq(revenues.stage, "ARRECADADA"), range ? and(gte(revenues.date, range.from), lte(revenues.date, range.to)) : undefined)),
    database.select({ value: expenses.value, valueDecimal: expenses.valueDecimal })
      .from(expenses).where(range ? and(gte(expenses.date, range.from), lte(expenses.date, range.to)) : undefined),
  ]);
  // Preserve this dashboard's numeric presentation, redutora sign and legacy
  // Float fallback. Accounting engines retain their independent exact Decimal.
  const totalReceita = revenueRows.reduce((total, revenue) => total + Number(revenue.valueDecimal ?? revenue.value) * (revenue.classification === "REDUTORA" ? -1 : 1), 0);
  const totalDespesa = expenseRows.reduce((total, expense) => total + Number(expense.valueDecimal ?? expense.value), 0);
  return { totalReceita, totalDespesa, resultadoOperacional: totalReceita - totalDespesa };
}
