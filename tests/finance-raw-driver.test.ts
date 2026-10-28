import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { listPreparedProgramPayments } from "../src/db/repositories/finance/accounting-pending";
import { readAccountingPaymentBasis } from "../src/db/repositories/finance/accounting";
import { listBankSourceRedistributions } from "../src/db/repositories/finance/bank-sources";
import { findCommitmentContract, findCommitmentCovenant, findCommitmentPublicityCampaign } from "../src/db/repositories/finance/commitment-origins";
import { listPayableActivePayments } from "../src/db/repositories/finance/payables";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

// Unlike finance-raw-scalars.test.ts, these inputs cross actual PostgreSQL
// timestamp/numeric columns and the production Neon/Drizzle transport.
test("finance raw readers decode PostgreSQL dates, nulls and numeric cents without losing query filters", async () => {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`
      CREATE TABLE "BudgetAppropriation" (id text PRIMARY KEY, "financialYearId" text NOT NULL);
      CREATE TABLE "Commitment" (id text PRIMARY KEY, "appropriationId" text NOT NULL REFERENCES "BudgetAppropriation");
      CREATE TABLE "BankAccount" (id text PRIMARY KEY, "accountingPlanId" text);
      CREATE TABLE "PayableCarryForward" (id text PRIMARY KEY, type text NOT NULL);
      CREATE TABLE "Payment" (
        id text PRIMARY KEY, status text NOT NULL, date timestamp(3) NOT NULL, "bankStatus" text,
        "bankTransactionId" text, "bankProcessedAt" timestamp(3), "valueDecimal" numeric(18,2), "netValueDecimal" numeric(18,2),
        "settlementId" text, "bankAccountId" text NOT NULL REFERENCES "BankAccount", "executionFinancialYearId" text,
        "payableCarryForwardId" text REFERENCES "PayableCarryForward", "paymentOrderExternalId" text, "integrationEventId" text,
        "commitmentId" text NOT NULL REFERENCES "Commitment"
      );
      CREATE TABLE "Revenue" (id text PRIMARY KEY, "bankAccountId" text NOT NULL REFERENCES "BankAccount");
      CREATE TABLE "RevenueResourceRedistribution" (
        id text PRIMARY KEY, "revenueId" text NOT NULL REFERENCES "Revenue", date timestamp(3) NOT NULL,
        "sourceResourceSourceId" text NOT NULL, "destinationResourceSourceId" text NOT NULL, "valueDecimal" numeric(18,2) NOT NULL
      );
      CREATE TABLE "Contract" (
        id text PRIMARY KEY, "supplierId" text NOT NULL, "processId" text, status text NOT NULL,
        "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL, "updatedValue" double precision NOT NULL
      );
      CREATE TABLE "Covenant" (id text PRIMARY KEY, number text NOT NULL, status text NOT NULL, "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL);
      CREATE TABLE "PublicityCampaign" (id text PRIMARY KEY, name text NOT NULL, status text NOT NULL, "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL);
      INSERT INTO "BudgetAppropriation" VALUES ('appropriation','year');
      INSERT INTO "Commitment" VALUES ('commitment','appropriation');
      INSERT INTO "BankAccount" VALUES ('bank','cash');
      INSERT INTO "PayableCarryForward" VALUES ('payable','PROCESSADO'),('other-payable','PROCESSADO');
      INSERT INTO "Revenue" VALUES ('revenue','bank');
    `);
    const amount = "9007199254740993.01";
    const net = "9007199254740992.99";
    const date = new Date("2026-12-31T23:59:59.123Z");
    const start = new Date("2026-01-01T00:00:00.000Z");
    await withDatabaseTransaction(fixture.connection, async tx => {
      // Raw Date parameters and raw timestamp results must both remain UTC,
      // including when the test process and PostgreSQL session use other zones.
      await tx.execute(sql`SET LOCAL TIME ZONE 'Asia/Tokyo'`);
      await tx.execute(sql`INSERT INTO "Payment" (id,status,date,"bankProcessedAt","valueDecimal","netValueDecimal","bankAccountId","payableCarryForwardId","commitmentId") VALUES
        ('emitted','Emitida',${date},${date},${amount}::numeric,${net}::numeric,'bank','payable','commitment'),
        ('null-values','Emitida',${date},NULL,NULL,NULL,'bank','payable','commitment'),
        ('paid','Paga',${date},NULL,0.01,0.01,'bank','payable','commitment'),
        ('reversed','Estornada',${date},NULL,0.02,0.02,'bank','payable','commitment'),
        ('other-payable','Emitida',${date},NULL,0.03,0.03,'bank','other-payable','commitment')`);
      const prepared = await listPreparedProgramPayments(tx, ["emitted", "null-values", "paid", "reversed"]);
      assert.deepEqual(prepared.map(row => row.id).sort(), ["emitted", "null-values"]);
      const emitted = prepared.find(row => row.id === "emitted")!;
      assert.equal(emitted.date.toISOString(), date.toISOString());
      assert.equal(emitted.bankProcessedAt?.toISOString(), date.toISOString());
      assert.equal(emitted.valueDecimal?.toFixed(2), amount);
      assert.equal(emitted.netValueDecimal?.toFixed(2), net);
      const empty = prepared.find(row => row.id === "null-values")!;
      assert.equal(empty.bankProcessedAt, null);
      assert.equal(empty.valueDecimal, null);
      assert.equal(empty.netValueDecimal, null);
      assert.deepEqual(await listPreparedProgramPayments(tx, []), []);

      const active = await listPayableActivePayments(tx, "payable");
      assert.deepEqual(active.map(row => row.id).sort(), ["emitted", "null-values", "paid"]);
      assert.equal(active.find(row => row.id === "emitted")?.valueDecimal?.toFixed(2), amount);
      assert.equal(active.find(row => row.id === "paid")?.date.toISOString(), date.toISOString());
      assert.equal(active.find(row => row.id === "null-values")?.valueDecimal, null);
      const basis = await readAccountingPaymentBasis(tx, "emitted");
      assert.equal(basis?.date.toISOString(), date.toISOString());
      assert.equal(basis?.valueDecimal?.toFixed(2), amount);
      assert.equal(basis?.netValueDecimal?.toFixed(2), net);
      assert.equal(basis?.payableType, "PROCESSADO");
      assert.equal(basis?.financialYearId, "year");
      assert.equal(await readAccountingPaymentBasis(tx, "missing"), null);

      await tx.execute(sql`INSERT INTO "RevenueResourceRedistribution" VALUES ('redistribution','revenue',${date},'source','destination',${amount}::numeric)`);
      const [redistribution] = await listBankSourceRedistributions(tx, "bank", "destination", { after: start, through: date });
      assert.equal(redistribution.date.toISOString(), date.toISOString());
      assert.equal(redistribution.valueDecimal.toFixed(2), amount);
      assert.equal(redistribution.sourceResourceSourceId, "source");
      assert.deepEqual(await listBankSourceRedistributions(tx, "bank", "other"), []);
      assert.deepEqual(await listBankSourceRedistributions(tx, "bank", "source", { through: new Date(date.getTime() - 1) }), []);

      await tx.execute(sql`INSERT INTO "Contract" VALUES ('origin','supplier',NULL,'Vigente',${start},${date},1)`);
      await tx.execute(sql`INSERT INTO "Covenant" VALUES ('origin','001','Vigente',${start},${date})`);
      await tx.execute(sql`INSERT INTO "PublicityCampaign" VALUES ('origin','Campanha','Vigente',${start},${date})`);
      for (const read of [findCommitmentContract, findCommitmentCovenant, findCommitmentPublicityCampaign]) {
        const origin = await read(tx, "origin");
        assert.equal(origin?.startDate.toISOString(), start.toISOString());
        assert.equal(origin?.endDate.toISOString(), date.toISOString());
        assert.ok(origin && date <= origin.endDate);
        assert.equal(await read(tx, "missing"), null);
      }
    });
  } finally { await fixture.close(); }
});
