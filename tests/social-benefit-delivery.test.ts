import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { count, eq } from "drizzle-orm";
import { deliverBenefitInTransaction } from "../src/lib/social/benefit-delivery";
import { socialBenefitQuotas, socialBenefitRequestItems, socialBenefitStocks, socialBenefitStockMovements } from "../src/db/schema/social";

test("dispensação exige autorização e não consome estoque/cota duas vezes", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.database;
  try {
    await db.exec(`CREATE TABLE "SocialBenefit" (id TEXT PRIMARY KEY, "isActive" BOOLEAN DEFAULT true); CREATE TABLE "SocialUnit" (id TEXT PRIMARY KEY, "isActive" BOOLEAN DEFAULT true); CREATE TABLE "SocialFamily" (id TEXT PRIMARY KEY);`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010090000_social_benefit_workflow/migration.sql", "utf8"));
    await db.exec(`
      INSERT INTO "SocialBenefit" (id) VALUES ('benefit'); INSERT INTO "SocialUnit" (id) VALUES ('unit'); INSERT INTO "SocialFamily" VALUES ('family');
      INSERT INTO "SocialBenefitRequest" (id,"familyId","unitId",reason,"createdBy") VALUES ('request','family','unit','Solicitação teste','actor');
      INSERT INTO "SocialBenefitQuota" (id,"benefitId","unitId","startsAt","endsAt",total) VALUES ('quota','benefit','unit','2026-01-01','2026-12-31',5);
      INSERT INTO "SocialBenefitStock" (id,"benefitId","unitId",quantity,"updatedAt") VALUES ('stock','benefit','unit',0,CURRENT_TIMESTAMP);
      INSERT INTO "SocialBenefitRequestItem" (id,"requestId","benefitId",quantity,status,"approvalRequired","dispensingMode","quotaControlled","evaluatedAt") VALUES
        ('one','request','benefit',1,'APPROVED',true,'QUANTITY',true,CURRENT_TIMESTAMP),
        ('two','request','benefit',1,'APPROVED',true,'QUANTITY',true,CURRENT_TIMESTAMP),
        ('three','request','benefit',1,'APPROVED',true,'QUANTITY',true,CURRENT_TIMESTAMP),
        ('pending','request','benefit',1,'PENDING',true,'QUANTITY',true,NULL);
    `);
    const database = fixture.connection.db;
    const access = { administrator: false, employeeId: "professional", links: [{ unitId: "unit", individualScope: "UNIT", familyScope: "UNIT" }] };
    const deliver = (itemId: string) => database.transaction(tx => deliverBenefitInTransaction(tx, access, { itemId, actorId: "actor", reason: "Entrega demonstrativa", today: new Date("2026-10-10T00:00:00Z") }));
    await assert.rejects(deliver("pending"), /Somente item autorizado/);
    await assert.rejects(deliver("one"), /Estoque insuficiente/);
    assert.equal((await database.select().from(socialBenefitQuotas).where(eq(socialBenefitQuotas.id, "quota")))[0].consumed, 0);
    assert.equal((await database.select().from(socialBenefitRequestItems).where(eq(socialBenefitRequestItems.id, "one")))[0].status, "APPROVED");
    await database.update(socialBenefitStocks).set({ quantity: 2 }).where(eq(socialBenefitStocks.id, "stock"));
    const results = await Promise.allSettled([deliver("one"), deliver("two"), deliver("three")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal((await database.select().from(socialBenefitStocks).where(eq(socialBenefitStocks.id, "stock")))[0].quantity, 0);
    assert.equal((await database.select().from(socialBenefitQuotas).where(eq(socialBenefitQuotas.id, "quota")))[0].consumed, 2);
    assert.equal((await database.select({ total: count() }).from(socialBenefitStockMovements))[0].total, 2);
    const [delivered] = await database.select().from(socialBenefitRequestItems).where(eq(socialBenefitRequestItems.status, "DELIVERED")).limit(1);
    await assert.rejects(deliver(delivered.id), /Somente item autorizado/);
    const [remaining] = await database.select().from(socialBenefitRequestItems).where(eq(socialBenefitRequestItems.status, "APPROVED")).limit(1);
    await database.update(socialBenefitStocks).set({ quantity: 1 }).where(eq(socialBenefitStocks.id, "stock"));
    await assert.rejects(database.transaction(tx => deliverBenefitInTransaction(tx, { ...access, links: [] }, { itemId: remaining.id, actorId: "actor", reason: "Entrega fora do vínculo", today: new Date("2026-10-10T00:00:00Z") })), /vínculo vigente/);
    await assert.rejects(database.transaction(async tx => {
      await deliverBenefitInTransaction(tx, access, { itemId: remaining.id, actorId: "actor", reason: "Entrega revertida", today: new Date("2026-10-10T00:00:00Z") });
      throw new Error("Falha da auditoria transacional");
    }), /Falha da auditoria/);
    assert.equal((await database.select().from(socialBenefitStocks).where(eq(socialBenefitStocks.id, "stock")))[0].quantity, 1);
    assert.equal((await database.select().from(socialBenefitQuotas).where(eq(socialBenefitQuotas.id, "quota")))[0].consumed, 2);
    assert.equal((await database.select().from(socialBenefitRequestItems).where(eq(socialBenefitRequestItems.id, remaining.id)))[0].status, "APPROVED");
    assert.equal((await database.select({ total: count() }).from(socialBenefitStockMovements))[0].total, 2);
    await database.update(socialBenefitQuotas).set({ total: 2 }).where(eq(socialBenefitQuotas.id, "quota"));
    await assert.rejects(deliver(remaining.id), /Cota vigente inexistente ou insuficiente/);
    assert.equal((await database.select().from(socialBenefitStocks).where(eq(socialBenefitStocks.id, "stock")))[0].quantity, 1);
  } finally {
    await fixture.close();
  }
});
