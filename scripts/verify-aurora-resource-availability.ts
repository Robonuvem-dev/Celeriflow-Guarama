import assert from "node:assert/strict";
import { config } from "dotenv";
import { Decimal } from "../src/db/decimal";
import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { setupBankAccounts } from "../src/db/schema/finance-setup-tools";
import { openFinanceSetupConnection, readSetupBankAccount, readSetupYear } from "./lib/finance-setup-tools";
import { getBankAccountBalance } from "../src/lib/financeiro";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function verifyResourceAvailability(connection: DatabaseConnection) {
    const db = connection.db;
    const evidence = [];
    for (const suffix of ["exe", "leg"]) {
      const governmentEntityId = `p0-current-${suffix}`;
      const budgetUnitId = `${governmentEntityId}-ug-1`;
      const bankAccountId = `aurora-finance-control-2026-v1:bank:${suffix}`;
      const year = await readSetupYear(db, governmentEntityId);
      const account = await readSetupBankAccount(db, bankAccountId);
      const resourceSourceIds = account.permittedSources.map(permission => permission.resourceSourceId);
      assert.deepEqual([...resourceSourceIds].sort(), ["aurora-source-1500", "aurora-source-1501"]);
      const report = await readResourceAvailability(connection, { allowedBudgetUnitIds: [budgetUnitId] }, { financialYearId: year.id, governmentEntityId, resourceSourceIds });
      assert.equal(report.governmentEntityId, governmentEntityId);
      assert.deepEqual(report.budgetUnitIds, [budgetUnitId]);
      assert.equal(report.rows.length, 2);
      const combined = report.rows.reduce((sum, row) => sum.plus(row.availableBalance), new Decimal(0));
      const accounts = await db.select({ id: setupBankAccounts.id }).from(setupBankAccounts).where(eq(setupBankAccounts.budgetUnitId, budgetUnitId));
      const bankBalances = await Promise.all(accounts.map(bank => getBankAccountBalance(db, bank.id)));
      assert.ok(combined.eq(bankBalances.reduce((sum, balance) => sum.plus(balance), new Decimal(0))));
      for (const row of report.rows) assert.ok(new Decimal(row.deficitSurplus).eq(new Decimal(row.availableBalance).minus(row.commitmentsPayable).minus(row.carryForwardsPayable).minus(row.extraPayables)));
      await assert.rejects(readResourceAvailability(connection, { allowedBudgetUnitIds: [] }, { financialYearId: year.id, governmentEntityId, resourceSourceIds }), /autorizada/);
      evidence.push({ governmentEntityId, budgetUnitId, bankAccountId, rows: report.rows, cashReconciled: true, unauthorizedReportRejected: true, fullEntity: report.fullEntity });
    }
    return { mode: "READ_ONLY", evidence };
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await verifyResourceAvailability(connection), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
