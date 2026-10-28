import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseTransaction } from "../src/db/transaction";
import { proposePersonMergeInTransaction } from "../src/db/repositories/registry/person-merge";

test("Elegibilidade SQL: cada relação protegida impede mesclagem na categoria legada", async () => {
  const pg = new PGlite();
  const relations = [
    ["Taxpayer", "personId", "FISCAL"], ["Supplier", "personId", "FINANCIAL"], ["Creditor", "personId", "FINANCIAL"],
    ["Employee", "personId", "RH"], ["Dependent", "personId", "RH"], ["Patient", "personId", "HEALTH"],
    ["Student", "personId", "EDUCATION"], ["EducationalGuardian", "personId", "EDUCATION"],
    ["SocialFamily", "representativeId", "SOCIAL"], ["SocialFamilyMember", "personId", "SOCIAL"], ["SocialAttendance", "personId", "SOCIAL"], ["SocialBenefitConcession", "personId", "SOCIAL"],
    ["Process", "personId", "PROCESS"], ["Ticket", "personId", "ATTENDANCE"], ["Ombudsman", "personId", "ATTENDANCE"], ["OmbudsmanIdentity", "personId", "ATTENDANCE"],
  ];
  try {
    await pg.exec(`CREATE TABLE "Person" (id TEXT PRIMARY KEY,status TEXT,"updatedAt" TIMESTAMP);
      INSERT INTO "Person" VALUES ('source','Ativo','2026-10-28');
      CREATE TABLE "Document" (id TEXT PRIMARY KEY,"personId" TEXT);
      CREATE TABLE "DocumentVersion" ("documentId" TEXT,"lockedAt" TIMESTAMP);
      CREATE TABLE "DocumentSignature" ("documentId" TEXT,status TEXT);`);
    for (const [table, field] of relations) await pg.exec(`CREATE TABLE "${table}" ("${field}" TEXT)`);
    const db = drizzle(pg);
    const propose = () => db.transaction(tx => proposePersonMergeInTransaction(tx as unknown as DatabaseTransaction, { id: "actor" }, "source", "absent-target"));
    await assert.rejects(propose(), /destino inválida/);
    for (const [table, field, category] of relations) {
      await pg.query(`INSERT INTO "${table}" ("${field}") VALUES ($1)`, ["source"]);
      await assert.rejects(propose(), new RegExp(`não elegível para mesclagem: ${category}\\.`), table);
      await pg.exec(`TRUNCATE "${table}"`);
    }
    await pg.exec(`INSERT INTO "Document" VALUES ('doc','source'); INSERT INTO "DocumentSignature" VALUES ('doc','SIGNED')`);
    await assert.rejects(propose(), /SIGNEDDOCUMENT/);
    await pg.exec(`UPDATE "DocumentSignature" SET status='PENDING'`);
    await assert.rejects(propose(), /destino inválida/);
    await pg.exec(`UPDATE "Person" SET status='Arquivado por mesclagem' WHERE id='source'`);
    await assert.rejects(propose(), /já está arquivada/);
  } finally { await pg.close(); }
});
