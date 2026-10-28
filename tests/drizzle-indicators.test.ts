import assert from "node:assert/strict";
import test from "node:test";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { countIndicatorControlPlans, countIndicatorEnvironmentalLicenses, countIndicatorPendingFindings, countIndicatorSocialBenefits, sumIndicatorPayments } from "../src/db/repositories/administration/indicators";

test("cross-domain indicators preserve unit scope, inclusive dates, exact sums and independent queries", { timeout: 60_000 }, async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  const start = new Date("2026-10-01T00:00:00.000Z"), end = new Date("2026-10-31T23:59:59.999Z");
  try {
    // Only the columns read by these cross-domain aggregates are necessary;
    // domain suites separately validate their complete historical table DDL.
    await fixture.database.exec(`
      CREATE TABLE "InternalControlPlan" (id text PRIMARY KEY, "budgetUnitId" text, "createdAt" timestamp(3));
      CREATE TABLE "InternalControlFinding" (id text PRIMARY KEY, "planId" text, status text);
      CREATE TABLE "BudgetAppropriation" (id text PRIMARY KEY, "budgetUnitId" text);
      CREATE TABLE "Commitment" (id text PRIMARY KEY, "appropriationId" text);
      CREATE TABLE "Payment" (id text PRIMARY KEY, "commitmentId" text, date timestamp(3), status text, "valueDecimal" numeric(18,2));
      CREATE TABLE "SocialBenefitConcession" (id text PRIMARY KEY, "createdAt" timestamp(3));
      CREATE TABLE "EnvironmentalLicense" (id text PRIMARY KEY, "createdAt" timestamp(3));
      INSERT INTO "InternalControlPlan" VALUES
        ('inside-a','ug-a','2026-10-01'), ('inside-b','ug-b','2026-10-31 23:59:59.999'),
        ('old','ug-a','2026-09-30 23:59:59.999'), ('unassigned',NULL,'2026-10-15');
      INSERT INTO "InternalControlFinding" VALUES ('a','inside-a','PENDENTE'), ('b','inside-b','PENDENTE'), ('old-pending','old','PENDENTE'), ('resolved','inside-a','RESOLVIDO');
      INSERT INTO "BudgetAppropriation" VALUES ('app-a','ug-a'),('app-b','ug-b');
      INSERT INTO "Commitment" VALUES ('commit-a','app-a'),('commit-b','app-b');
      INSERT INTO "Payment" VALUES
        ('p1','commit-a','2026-10-01','Emitida',90071992547409.91),
        ('p2','commit-a','2026-10-31 23:59:59.999','Paga',0.10),
        ('status-original','commit-a','2026-10-15','Pago',9.99),
        ('cancelled','commit-a','2026-10-15','Cancelada',11.00),
        ('other-unit','commit-b','2026-10-15','Paga',2.00),
        ('after-end','commit-a','2026-11-01','Emitida',3.00),
        ('null-amount','commit-a','2026-10-15','Paga',NULL);
      INSERT INTO "SocialBenefitConcession" VALUES ('start','2026-10-01'),('end','2026-10-31 23:59:59.999'),('before','2026-09-30 23:59:59.999');
      INSERT INTO "EnvironmentalLicense" VALUES ('start','2026-10-01'),('after','2026-11-01');
    `);
    assert.equal(await countIndicatorControlPlans(db, start, end), 3);
    assert.equal(await countIndicatorControlPlans(db, start, end, ["ug-a"]), 1);
    assert.equal(await countIndicatorControlPlans(db, start, end, []), 0);
    assert.equal(await countIndicatorControlPlans(db, start, end, ["ug-a') OR TRUE --"]), 0);
    // Pending findings retain their original current-position semantics,
    // independent of when the associated plan was created.
    assert.equal(await countIndicatorPendingFindings(db, ["ug-a"]), 2);
    assert.equal(await countIndicatorPendingFindings(db), 3);
    assert.equal(await countIndicatorPendingFindings(db, []), 0);
    assert.equal((await sumIndicatorPayments(db, start, end, ["ug-a"]))._sum.valueDecimal?.toFixed(2), "90071992547410.01");
    assert.equal((await sumIndicatorPayments(db, start, end))._sum.valueDecimal?.toFixed(2), "90071992547412.01");
    assert.equal((await sumIndicatorPayments(db, start, end, []))._sum.valueDecimal, null);
    assert.equal((await sumIndicatorPayments(db, new Date("2099-01-01"), new Date("2099-12-31")))._sum.valueDecimal, null);
    assert.equal(await countIndicatorSocialBenefits(db, start, end), 2);
    assert.equal(await countIndicatorEnvironmentalLicenses(db, start, end), 1);
    await fixture.database.exec('DROP TABLE "Payment"');
    await assert.rejects(sumIndicatorPayments(db, start, end));
    assert.equal(await countIndicatorSocialBenefits(db, start, end), 2);
  } finally { await fixture.close(); }
});
