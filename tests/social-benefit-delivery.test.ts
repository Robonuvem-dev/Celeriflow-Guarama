import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { deliverBenefitInTransaction } from "../src/lib/social/benefit-delivery";

test("dispensação exige autorização e não consome estoque/cota duas vezes", async () => {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
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
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const access = { administrator: false, employeeId: "professional", links: [{ unitId: "unit", individualScope: "UNIT", familyScope: "UNIT" }] };
    const deliver = (itemId: string) => prisma!.$transaction((tx) => deliverBenefitInTransaction(tx, access, { itemId, actorId: "actor", reason: "Entrega demonstrativa", today: new Date("2026-10-10T00:00:00Z") }));
    await assert.rejects(deliver("pending"), /Somente item autorizado/);
    await assert.rejects(deliver("one"), /Estoque insuficiente/);
    assert.equal((await prisma.socialBenefitQuota.findUniqueOrThrow({ where: { id: "quota" } })).consumed, 0);
    assert.equal((await prisma.socialBenefitRequestItem.findUniqueOrThrow({ where: { id: "one" } })).status, "APPROVED");
    await prisma.socialBenefitStock.update({ where: { id: "stock" }, data: { quantity: 2 } });
    const results = await Promise.allSettled([deliver("one"), deliver("two"), deliver("three")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal((await prisma.socialBenefitStock.findUniqueOrThrow({ where: { id: "stock" } })).quantity, 0);
    assert.equal((await prisma.socialBenefitQuota.findUniqueOrThrow({ where: { id: "quota" } })).consumed, 2);
    assert.equal(await prisma.socialBenefitStockMovement.count(), 2);
    const delivered = await prisma.socialBenefitRequestItem.findFirstOrThrow({ where: { status: "DELIVERED" } });
    await assert.rejects(deliver(delivered.id), /Somente item autorizado/);
  } finally {
    await prisma?.$disconnect(); await server.stop(); await db.close();
  }
});
