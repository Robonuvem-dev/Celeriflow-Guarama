import assert from "node:assert/strict";
import test from "node:test";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { readCitizenDeclarations } from "../src/db/repositories/portal-content/declarations";

test("declarações: titularidade, escopo, revogação, filtros e paginação", async () => {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`
      CREATE TABLE "TaxRegistryEntry" (id text PRIMARY KEY,"entityType" text,"entityId" text,category text,data jsonb,version int,"createdAt" timestamp);
      CREATE TABLE "Person" (id text PRIMARY KEY, status text);
      CREATE TABLE "Company" (id text PRIMARY KEY, status text);
      CREATE TABLE "Taxpayer" (id text PRIMARY KEY, "personId" text, "companyId" text, status text);
      CREATE TABLE "TaxpayerPortalAccess" ("usuarioId" text, "taxpayerId" text, "accessType" text, status text, scopes jsonb, "revokedAt" timestamp, "grantedAt" timestamp);
      CREATE TABLE "NfseDmsDeclaration" (id text PRIMARY KEY, protocol text, "taxpayerId" text, competence text, direction text, channel text, status text, "noMovement" boolean, "serviceValueDecimal" numeric(18,2), "ownIssDecimal" numeric(18,2), "retainedIssDecimal" numeric(18,2), "createdAt" timestamp);
      CREATE TABLE "DesifFinancialInstitution" (id text PRIMARY KEY, "taxpayerId" text);
      CREATE TABLE "DesifImportBatch" (id text PRIMARY KEY, "institutionId" text, "receiptNumber" text, competence text, "moduleType" text, "originMode" text, status text, "createdAt" timestamp);
      INSERT INTO "Person" VALUES ('p','Ativo');
      INSERT INTO "Taxpayer" VALUES ('own','p',NULL,'Ativo'),('other','p',NULL,'Ativo');
      INSERT INTO "TaxpayerPortalAccess" VALUES ('actor','own','TITULAR','ATIVO','["NFSE"]',NULL,'2020-01-01'),('other-actor','other','TITULAR','ATIVO','["NFSE"]',NULL,'2020-01-01'),('revoked','own','TITULAR','ATIVO','["NFSE"]','2020-02-01','2020-01-01'),('wrong-scope','own','TITULAR','ATIVO','["CADASTRO"]',NULL,'2020-01-01');
      INSERT INTO "NfseDmsDeclaration" SELECT 'd'||n,'PROTO-'||n,'own','10/2026','TOMADOS','MANUAL','PROTOCOLADA',false,100,0,5,'2026-10-01' FROM generate_series(1,25) n;
      INSERT INTO "NfseDmsDeclaration" VALUES ('secret','SECRET','other','10/2026','TOMADOS','MANUAL','PROTOCOLADA',false,999,0,0,'2026-10-01');
      INSERT INTO "DesifFinancialInstitution" VALUES ('bank','own'),('bank2','other');
      INSERT INTO "DesifImportBatch" VALUES ('b1','bank','RECIBO','10/2026','APURACAO','INTERNO','VALIDADO','2026-10-01'),('b2','bank2','PRIVADO','10/2026','APURACAO','INTERNO','VALIDADO','2026-10-01');
      INSERT INTO "TaxpayerPortalAccess" VALUES ('bank-user','own','TITULAR','ATIVO','["DESIF"]',NULL,'2020-01-01');
    `);
    const first = await readCitizenDeclarations(fixture.connection.db, "actor", {});
    assert.equal(first.total, 25); assert.equal(first.rows.length, 20);
    assert.ok(first.rows.every(row => row.protocol !== "SECRET"));
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { page: 2 })).rows.length, 5);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { protocol: "SECRET" })).total, 0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { direction: "PRESTADOS" })).total, 0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { competence: "09/2026" })).total, 0);
    for (const actor of ["revoked", "wrong-scope", "missing"]) assert.equal((await readCitizenDeclarations(fixture.connection.db, actor, {})).total, 0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { protocol: "%" })).total, 0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "actor", { kind: "BANCOS" })).total, 0);
    const bank = await readCitizenDeclarations(fixture.connection.db, "bank-user", { kind: "BANCOS" });
    assert.equal(bank.total, 1); assert.equal(bank.rows[0].protocol, "RECIBO");
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "bank-user", {})).total, 0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db, "bank-user", { kind: "BANCOS", status: "INVALIDO" })).total, 0);

    const base={type:"CARTORIO",taxpayerId:"own",competence:"2026-10",protocol:"CART-01",status:"REGISTRADA",amount:"90.25",documentRef:"ato",description:"Cartório",governmentEntityId:"ente",budgetUnitId:"ug"};
    await fixture.database.query(`INSERT INTO "TaxRegistryEntry" VALUES ($1,'DECLARACAO_COMPLEMENTAR',$2,'DECLARACAO_COMPLEMENTAR',$3,1,'2026-10-01')`,["comp1","comp1",JSON.stringify(base)]);
    await fixture.database.query(`INSERT INTO "TaxRegistryEntry" VALUES ($1,'DECLARACAO_COMPLEMENTAR',$2,'DECLARACAO_COMPLEMENTAR',$3,1,'2026-10-01')`,["comp2","comp2",JSON.stringify({...base,taxpayerId:"other",protocol:"SECRET"})]);
    await fixture.database.exec(`INSERT INTO "TaxpayerPortalAccess" VALUES ('cart-user','own','TITULAR','ATIVO','["DECLARACOES_CARTORIO"]',NULL,'2020-01-01')`);
    const cart=await readCitizenDeclarations(fixture.connection.db,"cart-user",{kind:"CARTORIO",competence:"10/2026"});
    assert.equal(cart.total,1);assert.equal(cart.rows[0].protocol,"CART-01");assert.equal(cart.rows[0].serviceValue?.toFixed(2),"90.25");
    assert.equal((await readCitizenDeclarations(fixture.connection.db,"actor",{kind:"CARTORIO"})).total,0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db,"cart-user",{kind:"DIVERSOS"})).total,0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db,"cart-user",{kind:"CARTORIO",protocol:"SECRET"})).total,0);
    await fixture.database.query(`INSERT INTO "TaxRegistryEntry" VALUES ($1,'DECLARACAO_COMPLEMENTAR',$2,'DECLARACAO_COMPLEMENTAR',$3,2,'2026-10-02')`,["comp1-v2","comp1",JSON.stringify({...base,status:"CANCELADA"})]);
    assert.equal((await readCitizenDeclarations(fixture.connection.db,"cart-user",{kind:"CARTORIO",status:"REGISTRADA"})).total,0);
    assert.equal((await readCitizenDeclarations(fixture.connection.db,"cart-user",{kind:"CARTORIO",status:"CANCELADA"})).total,1);
  } finally { await fixture.close(); }
});
