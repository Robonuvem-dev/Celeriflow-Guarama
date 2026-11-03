import assert from "node:assert/strict";
import test from "node:test";
import { createProcurementWorkflowFixture } from "./helpers/procurement-workflow-fixture";
import { listSupplierBiddingParticipations, loadSupplierBiddingParticipation } from "../src/db/repositories/procurement/bidding";

test("bidding portal isolates active PF/PJ identities, latest eligibility and participant bids", async () => {
  const f = await createProcurementWorkflowFixture();
  try {
    await f.database.exec(`
      CREATE TABLE "Company" (id text PRIMARY KEY, "corporateName" text NOT NULL, "tradeName" text);
      CREATE TABLE "Person" (id text PRIMARY KEY, "fullName" text NOT NULL);
      ALTER TABLE "Supplier" ADD COLUMN "companyId" text REFERENCES "Company";
      ALTER TABLE "Supplier" ADD COLUMN "personId" text REFERENCES "Person";
      CREATE TABLE "SupplierPortalIdentity" (id text PRIMARY KEY, "supplierId" text NOT NULL REFERENCES "Supplier", "usuarioId" text NOT NULL REFERENCES "Usuario", status text NOT NULL DEFAULT 'Ativo', "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("supplierId", "usuarioId"));
      CREATE TABLE "Bidding" (id text PRIMARY KEY, number text NOT NULL UNIQUE, modality text NOT NULL, status text NOT NULL, "publicationDate" timestamp, "sessionDate" timestamp, "processId" text NOT NULL REFERENCES "PurchaseProcess", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "BiddingParticipant" (id text PRIMARY KEY, "biddingId" text NOT NULL REFERENCES "Bidding", "supplierId" text NOT NULL REFERENCES "Supplier", "displayCode" text, status text NOT NULL DEFAULT 'Inscrito', "registeredAt" timestamp NOT NULL DEFAULT now(), notes text, "preliminaryTechnicalStudyId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "BiddingLot" (id text PRIMARY KEY, "biddingId" text NOT NULL REFERENCES "Bidding", number integer NOT NULL, description text, status text NOT NULL, "estimatedValueDecimal" numeric(18,2), "preliminaryTechnicalStudyId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "BiddingLotItem" (id text PRIMARY KEY, "biddingLotId" text NOT NULL REFERENCES "BiddingLot", "purchaseProcessItemId" text NOT NULL REFERENCES "PurchaseProcessItem", quantity float8 NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "BiddingEligibility" (id text PRIMARY KEY, "biddingLotId" text NOT NULL REFERENCES "BiddingLot", "participantId" text NOT NULL REFERENCES "BiddingParticipant", status text NOT NULL, reason text, "documentId" text, "decidedByUsuarioId" text NOT NULL REFERENCES "Usuario", "decidedAt" timestamp NOT NULL DEFAULT now(), "idempotencyKey" text NOT NULL UNIQUE, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "BiddingBid" (id text PRIMARY KEY, "biddingLotId" text NOT NULL REFERENCES "BiddingLot", "participantId" text NOT NULL REFERENCES "BiddingParticipant", "supplierPortalIdentityId" text NOT NULL REFERENCES "SupplierPortalIdentity", kind text NOT NULL DEFAULT 'Lance', "unitValueDecimal" numeric(18,2), "totalValueDecimal" numeric(18,2) NOT NULL, sequence integer NOT NULL, "submittedAt" timestamp NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'Aceito', "idempotencyKey" text NOT NULL UNIQUE, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      INSERT INTO "Person" VALUES ('pf-person', 'Fornecedor pessoa física');
      INSERT INTO "Company" VALUES ('pj-company', 'Fornecedor pessoa jurídica', 'PJ Comercial');
      INSERT INTO "Supplier" (id, "personId", "companyId") VALUES ('pf', 'pf-person', NULL), ('pj', NULL, 'pj-company');
      INSERT INTO "SupplierPortalIdentity" (id, "supplierId", "usuarioId") VALUES ('pf-identity', 'pf', 'ana'), ('pj-identity', 'pj', 'beatriz');
      INSERT INTO "PurchaseProcess" (id, number, object, type, "secretariatId") VALUES ('proc', 'PROC-1', 'Serviços', 'Comum', 'secretaria');
      INSERT INTO "PurchaseProcessItem" (id, "purchaseProcessId", "customName", quantity) VALUES ('service', 'proc', 'Serviço livre', 1);
      INSERT INTO "Bidding" (id, number, modality, status, "processId", "sessionDate") VALUES ('bidding', 'PE-1', 'Pregão', 'Aberto', 'proc', '2026-10-28 12:34:56.123');
      INSERT INTO "BiddingParticipant" (id, "biddingId", "supplierId") VALUES ('pf-participant', 'bidding', 'pf'), ('pj-participant', 'bidding', 'pj');
      INSERT INTO "BiddingLot" (id, "biddingId", number, status, "estimatedValueDecimal") VALUES ('lot', 'bidding', 1, 'Aberto', 90071992547409.96), ('empty-lot', 'bidding', 2, 'Rascunho', NULL);
      INSERT INTO "BiddingLotItem" (id, "biddingLotId", "purchaseProcessItemId", quantity) VALUES ('lot-item', 'lot', 'service', 1);
      INSERT INTO "BiddingEligibility" (id, "biddingLotId", "participantId", status, "decidedByUsuarioId", "decidedAt", "idempotencyKey") VALUES
        ('old', 'lot', 'pf-participant', 'Inabilitado', 'beatriz', '2026-09-01', 'old'), ('latest', 'lot', 'pf-participant', 'Habilitado', 'beatriz', '2026-09-02', 'latest'), ('other', 'lot', 'pj-participant', 'Inabilitado', 'beatriz', '2026-09-03', 'other');
      INSERT INTO "BiddingBid" (id, "biddingLotId", "participantId", "supplierPortalIdentityId", "totalValueDecimal", sequence, "idempotencyKey") VALUES
        ('pf-bid', 'lot', 'pf-participant', 'pf-identity', 90071992547409.93, 1, 'pf-bid'), ('pj-bid', 'lot', 'pj-participant', 'pj-identity', 1, 2, 'pj-bid');
    `);
    const db = f.connection.db;
    const pfRows = await listSupplierBiddingParticipations(db, "ana");
    assert.equal(pfRows.length, 1);
    assert.equal(pfRows[0].supplier.company, null);
    assert.equal(pfRows[0].supplier.person?.fullName, "Fornecedor pessoa física");
    assert.equal(pfRows[0].bidding._count.biddingLots, 2);
    assert.equal(pfRows[0].bidding.publicationDate, null);
    assert.equal(pfRows[0].bidding.sessionDate?.toISOString(), "2026-10-28T12:34:56.123Z");
    const pjRows = await listSupplierBiddingParticipations(db, "beatriz");
    assert.equal(pjRows[0].supplier.person, null);
    assert.equal(pjRows[0].supplier.company?.tradeName, "PJ Comercial");
    assert.equal(await loadSupplierBiddingParticipation(db, "pj-participant", "ana"), null);
    const pf = await loadSupplierBiddingParticipation(db, "pf-participant", "ana");
    assert.ok(pf);
    assert.deepEqual(pf.bidding.biddingLots.map(lot => lot.number), [1, 2]);
    assert.equal(pf.bidding.biddingLots[0].items[0].purchaseProcessItem.customName, "Serviço livre");
    assert.equal(pf.bidding.biddingLots[0].items[0].purchaseProcessItem.catalogItem, null);
    assert.deepEqual(pf.bidding.biddingLots[0].eligibilityDecisions.map(row => row.id), ["latest"]);
    assert.equal(pf.bidding.biddingLots[0].eligibilityDecisions[0].decidedAt.toISOString(), "2026-09-02T00:00:00.000Z");
    assert.deepEqual(pf.bidding.biddingLots[0].bids.map(row => row.id), ["pf-bid"]);
    assert.equal(pf.bidding.biddingLots[0].bids[0].totalValueDecimal.toFixed(2), "90071992547409.93");
    assert.equal(pf.bidding.biddingLots[1].eligibilityDecisions.length, 0);
    await f.database.exec(`UPDATE "SupplierPortalIdentity" SET status='Inativo' WHERE id='pf-identity'`);
    assert.deepEqual(await listSupplierBiddingParticipations(db, "ana"), []);
    assert.equal(await loadSupplierBiddingParticipation(db, "pf-participant", "ana"), null);
    await f.database.exec(`UPDATE "Supplier" SET status='Suspenso' WHERE id='pj'`);
    assert.deepEqual(await listSupplierBiddingParticipations(db, "beatriz"), []);
  } finally { await f.close(); }
});
