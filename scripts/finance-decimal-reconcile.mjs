import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection.ts";
import { Decimal } from "../src/db/decimal.ts";

config({ path: ".env.local" });
config();

const backfill = process.argv.includes("--backfill");

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nao configurada.`);
  return value;
}

// Fields are deliberately explicit so this audit remains tied to the Phase 0 schema.
const fields = [
  ["budgetAppropriation", "BudgetAppropriation", "initialValue", "initialValueDecimal"],
  ["budgetAppropriation", "BudgetAppropriation", "updatedValue", "updatedValueDecimal"],
  ["budgetAppropriation", "BudgetAppropriation", "committedValue", "committedValueDecimal"],
  ["revenue", "Revenue", "value", "valueDecimal"],
  ["expense", "Expense", "value", "valueDecimal"],
  ["budgetReservation", "BudgetReservation", "value", "valueDecimal"],
  ["commitment", "Commitment", "value", "valueDecimal"],
  ["settlement", "Settlement", "value", "valueDecimal"],
  ["payment", "Payment", "value", "valueDecimal"],
  ["bankAccount", "BankAccount", "currentBalance", "currentBalanceDecimal"],
  ["bankReconciliation", "BankReconciliation", "systemBalance", "systemBalanceDecimal"],
  ["bankReconciliation", "BankReconciliation", "bankBalance", "bankBalanceDecimal"],
  ["accountingEntry", "AccountingEntry", "value", "valueDecimal"],
  ["taxAssessment", "TaxAssessment", "originalValue", "originalValueDecimal"],
  ["taxGuide", "TaxGuide", "totalValue", "totalValueDecimal"],
  ["taxPayment", "TaxPayment", "amountPaid", "amountPaidDecimal"],
  ["debtInstallment", "DebtInstallment", "totalValue", "totalValueDecimal"],
  ["debtInstallment", "DebtInstallment", "downPayment", "downPaymentDecimal"],
  ["activeDebt", "ActiveDebt", "originalValue", "originalValueDecimal"],
  ["activeDebt", "ActiveDebt", "updatedValue", "updatedValueDecimal"],
  ["infraction", "Infraction", "penaltyValue", "penaltyValueDecimal"],
  ["invoice", "Invoice", "serviceValue", "serviceValueDecimal"],
  ["invoice", "Invoice", "deductions", "deductionsDecimal"],
  ["invoice", "Invoice", "issValue", "issValueDecimal"],
];

function normalizedDecimal(value) {
  return new Decimal(String(value)).toDecimalPlaces(2);
}

async function reconcileField(db, modelName, table, floatField, decimalField) {
  // Only the explicit physical table/column tuples above reach this SQL.
  // Numeric is projected as text; it never passes through a JS number.
  const records = (await db.execute(sql`SELECT id,${sql.identifier(floatField)} AS "floatValue",${sql.identifier(decimalField)}::text AS "decimalValue" FROM ${sql.identifier(table)}`)).rows;
  const report = { modelName, floatField, decimalField, total: records.length, backfilled: 0, missing: 0, mismatched: 0, rounded: 0 };

  for (const record of records) {
    const { floatValue, decimalValue } = record;
    if (floatValue === null) continue;

    const normalized = normalizedDecimal(floatValue);
    if (!normalized.equals(new Decimal(String(floatValue)))) report.rounded += 1;

    if (decimalValue === null) {
      report.missing += 1;
      if (backfill) {
        const result = await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(decimalField)}=${normalized.toString()},"updatedAt"=${new Date()} WHERE id=${record.id} AND ${sql.identifier(decimalField)} IS NULL RETURNING id`);
        if (result.rows.length === 1) {
          report.backfilled += 1;
          report.missing -= 1;
        }
      }
      continue;
    }

    if (!new Decimal(decimalValue).equals(normalized)) report.mismatched += 1;
  }

  return report;
}

async function main() {
  const connection = createDatabaseConnection(requiredEnvironment("DATABASE_URL"));

  try {
    const reports = [];
    for (const [modelName, table, floatField, decimalField] of fields) {
      reports.push(await reconcileField(connection.db, modelName, table, floatField, decimalField));
    }

    console.table(reports);
    const totals = reports.reduce(
      (sum, report) => ({
        records: sum.records + report.total,
        backfilled: sum.backfilled + report.backfilled,
        missing: sum.missing + report.missing,
        mismatched: sum.mismatched + report.mismatched,
        rounded: sum.rounded + report.rounded,
      }),
      { records: 0, backfilled: 0, missing: 0, mismatched: 0, rounded: 0 },
    );
    console.log(JSON.stringify({ mode: backfill ? "backfill" : "read-only", ...totals }, null, 2));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
