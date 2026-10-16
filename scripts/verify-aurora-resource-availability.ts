import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { getBankAccountBalance } from "../src/lib/financeiro";
import { readResourceAvailability } from "../src/lib/financeiro/resource-availability";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const evidence = [];
    for (const suffix of ["exe", "leg"]) {
      const governmentEntityId = `p0-current-${suffix}`;
      const budgetUnitId = `${governmentEntityId}-ug-1`;
      const bankAccountId = `aurora-finance-control-2026-v1:bank:${suffix}`;
      const year = await prisma.financialYear.findUniqueOrThrow({ where: { governmentEntityId_year: { governmentEntityId, year: 2026 } } });
      const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId }, include: { permittedSources: { where: { isActive: true } } } });
      const resourceSourceIds = account.permittedSources.map(permission => permission.resourceSourceId);
      assert.deepEqual([...resourceSourceIds].sort(), ["aurora-source-1500", "aurora-source-1501"]);
      const report = await readResourceAvailability(prisma, { allowedBudgetUnitIds: [budgetUnitId] }, { financialYearId: year.id, governmentEntityId, resourceSourceIds });
      assert.equal(report.governmentEntityId, governmentEntityId);
      assert.deepEqual(report.budgetUnitIds, [budgetUnitId]);
      assert.equal(report.rows.length, 2);
      const combined = report.rows.reduce((sum, row) => sum.plus(row.availableBalance), new Prisma.Decimal(0));
      const accounts = await prisma.bankAccount.findMany({ where: { budgetUnitId }, select: { id: true } });
      const bankBalances = await Promise.all(accounts.map(bank => getBankAccountBalance(prisma, bank.id)));
      assert.ok(combined.eq(bankBalances.reduce((sum, balance) => sum.plus(balance), new Prisma.Decimal(0))));
      for (const row of report.rows) assert.ok(new Prisma.Decimal(row.deficitSurplus).eq(new Prisma.Decimal(row.availableBalance).minus(row.commitmentsPayable).minus(row.carryForwardsPayable).minus(row.extraPayables)));
      await assert.rejects(readResourceAvailability(prisma, { allowedBudgetUnitIds: [] }, { financialYearId: year.id, governmentEntityId, resourceSourceIds }), /autorizada/);
      evidence.push({ governmentEntityId, budgetUnitId, bankAccountId, rows: report.rows, cashReconciled: true, unauthorizedReportRejected: true, fullEntity: report.fullEntity });
    }
    console.log(JSON.stringify({ mode: "READ_ONLY", evidence }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
