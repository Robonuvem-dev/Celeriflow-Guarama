import { and, eq, gte, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { planningBankAccounts, planningCashMovements, planningRevenueReversals } from "@/db/schema/planning-financial-sources";
import { revenues } from "@/db/schema/finance-revenues";
import type { RclReference, ReadExecutor } from "@/lib/contracts/planning-execution-operations";

export async function readRclTreasuryFacts(db: ReadExecutor, references: RclReference[], from: Date, until: Date) {
  const reversedRevenue = alias(revenues, "rcl_reversed_revenue");
  const reversalBank = alias(planningBankAccounts, "rcl_reversal_bank");
  const direct = references.flatMap(reference => reference.revenueNature ? [and(eq(revenues.revenueNatureId, reference.revenueNature.id), eq(revenues.resourceSourceId, reference.resourceSourceId), eq(planningBankAccounts.budgetUnitId, reference.budgetUnitId))] : []);
  const reversed = references.flatMap(reference => reference.revenueNature ? [and(eq(reversedRevenue.revenueNatureId, reference.revenueNature.id), eq(reversedRevenue.resourceSourceId, reference.resourceSourceId), eq(reversalBank.budgetUnitId, reference.budgetUnitId))] : []);
  if (!direct.length) throw new Error("Configure as receitas e exclusões da RCL.");
  // One row per treasury movement; the reverse link is physically unique.
  // Keep both classifications: original precedence prefers a direct revenue.
  const rows = await db.select({
    id: planningCashMovements.id, date: planningCashMovements.date, type: planningCashMovements.type, valueDecimal: planningCashMovements.valueDecimal,
    revenue: { classification: revenues.classification }, reversedRevenue: { classification: reversedRevenue.classification },
  }).from(planningCashMovements)
    .leftJoin(revenues, eq(revenues.id, planningCashMovements.revenueId))
    .leftJoin(planningBankAccounts, eq(planningBankAccounts.id, revenues.bankAccountId))
    .leftJoin(planningRevenueReversals, eq(planningRevenueReversals.treasuryMovementId, planningCashMovements.id))
    .leftJoin(reversedRevenue, eq(reversedRevenue.id, planningRevenueReversals.revenueId))
    .leftJoin(reversalBank, eq(reversalBank.id, reversedRevenue.bankAccountId))
    .where(and(eq(planningCashMovements.status, "Confirmado"), gte(planningCashMovements.date, from), lte(planningCashMovements.date, until), or(...direct, ...reversed)));
  return rows.map(({ reversedRevenue, ...row }) => ({ ...row, revenueReversal: reversedRevenue ? { revenue: reversedRevenue } : null }));
}
