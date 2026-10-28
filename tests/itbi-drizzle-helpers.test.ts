import assert from "node:assert/strict";
import test from "node:test";
import { and, desc, eq, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { JsonNull } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { itbiDeclarations, itbiParties } from "../src/db/schema/tax-itbi";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { accessProfiles } from "../src/db/schema/identity";
import { documents, realEstates } from "../src/db/schema/registry";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import { auditItbi, insertItbiRegistryEntry, itbiRegistryPosition, latestItbiRegistryEntry, nextItbiDocumentSequence, readItbiDeclaration, readItbiRegistryEntries, requireItbiRecord } from "../src/db/repositories/tax-itbi/records";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { grantItbiProcessAccess, assertPortalItbiAccess, sendInternalItbiMessage, sendPortalItbiMessage, assertNoPendingItbiAdjustments, readPortalItbiChannel } from "../src/lib/tributacao/itbi-process-channel";
import { publishItbiEntryPolicy, evaluateItbiEntryPolicy } from "../src/lib/tributacao/itbi-entry-policy";
import { decideItbiFiscalTreatment } from "../src/lib/tributacao/itbi-fiscal-treatment";
import { configureItbiCorrespondence } from "../src/lib/tributacao/itbi-correspondence";
import { transferItbiManually, reversePaidItbiInTransaction } from "../src/lib/tributacao/itbi-ownership";
import { rectifyTransferredItbi } from "../src/lib/tributacao/itbi-rectification";
import { renderItbiDamPdf } from "../src/lib/tributacao/itbi-dam-pdf";
import { renderItbiProcessPdf } from "../src/lib/tributacao/itbi-process-pdf";
import { createItbiDrizzleFixture, seedItbiDeclaration } from "./helpers/itbi-drizzle-fixture";

test("ITBI helpers: physical SQL, scope, JSON null, dates, same-transaction audit, channel and cadastral reversal", async t => {
  const f = await createItbiDrizzleFixture();
  try {
    await f.database.exec(`INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","updatedAt") VALUES ('process','ITBI-HELPERS','process-type','subject',CURRENT_TIMESTAMP);`);

    await t.test("Date/Decimal/JSON-null decoding and sequence/audit rollback use the caller transaction", async () => {
      const instant = new Date("2026-01-31T12:34:56.789Z");
      const declaration = await seedItbiDeclaration(f, "scalars", { taxAmount: new Decimal("9999999999999999.99"), analyzedAt: instant, calculationSnapshot: { nested: { nil: null, numeric: "001.00", date: "not-a-date" } } });
      assert.equal(declaration.analyzedAt?.toISOString(), instant.toISOString());
      assert.equal(declaration.cadastralUpdatedAt, null);
      assert.equal(declaration.taxAmount.toFixed(2), "9999999999999999.99");
      assert.deepEqual(declaration.calculationSnapshot, { nested: { nil: null, numeric: "001.00", date: "not-a-date" } });
      await withDatabaseTransaction(f.connection, async tx => {
        const entry = await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "TEST_JSON_NULL", title: "JSON null", data: null });
        assert.equal(entry.data, null);
        const result = await tx.execute<{ jsonNull: boolean; sqlNull: boolean }>(sql`SELECT data='null'::jsonb AS "jsonNull", data IS NULL AS "sqlNull" FROM "TaxRegistryEntry" WHERE id=${entry.id}`);
        assert.deepEqual(result.rows[0], { jsonNull: true, sqlNull: false });
      });
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await nextItbiDocumentSequence(tx, 2026, "TEST_ROLLBACK");
        await auditItbi(tx, { action: "TEST_ROLLBACK", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: f.actor.usuarioId, payload: { nil: null } });
        throw new Error("atomic rollback");
      }), /atomic rollback/);
      await withDatabaseTransaction(f.connection, async tx => assert.equal((await nextItbiDocumentSequence(tx, 2026, "TEST_ROLLBACK")).currentValue, 1));
      const audit = await f.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM "TaxAuditLog" WHERE action='TEST_ROLLBACK'`);
      assert.equal(audit.rows[0].n, "0");
      await f.db.update(itbiDeclarations).set({ calculationSnapshot: JsonNull }).where(eq(itbiDeclarations.id, declaration.id));
      assert.equal((await readItbiDeclaration(f.db, declaration.id)).calculationSnapshot, null);
    });

    await t.test("latest entry-policy version retains warning order and blocking behavior", async () => {
      await publishItbiEntryPolicy(f.connection, f.actor, { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, active: true, legalBasis: "Política municipal", rules: [{ code: "DEBT", condition: "TAX_DEBT", action: "WARN", message: "Conferir dívida", transactionTypeIds: [] }, { code: "PARTIAL", condition: "PARTIAL_TRANSFER", action: "BLOCK", message: "Fração impedida", transactionTypeIds: [] }] });
      const input = { transactionTypeId: "type", propertyStatus: "Ativo", profile: null, declaredValue: new Decimal(1000), valuation: new Decimal(1000), taxDebt: new Decimal(1), nonTaxDebt: new Decimal(0), fraction: new Decimal(100), leasehold: false };
      const result = await withDatabaseTransaction(f.connection, tx => evaluateItbiEntryPolicy(tx, { governmentEntityId: "ente", budgetUnitId: "ug" }, input));
      assert.deepEqual(result.warnings, [{ code: "DEBT", message: "Conferir dívida" }]);
      await assert.rejects(withDatabaseTransaction(f.connection, tx => evaluateItbiEntryPolicy(tx, { governmentEntityId: "ente", budgetUnitId: "ug" }, { ...input, fraction: new Decimal(50) })), /Fração impedida/);
      await assert.rejects(publishItbiEntryPolicy(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 1, active: false, legalBasis: "Revogação", rules: [] }), /autorizado/);
      await publishItbiEntryPolicy(f.connection, f.actor, { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 1, active: false, legalBasis: "Revogação", rules: [] });
    });

    await t.test("explicit active access and accepted external adjustment preserve the frozen record and channel", async () => {
      const declaration = await seedItbiDeclaration(f, "channel", { processId: "process", status: "PROTOCOLADA" });
      await f.db.insert(itbiParties).values({ declarationId: declaration.id, taxpayerId: "buyer", role: "ADQUIRENTE", participationPercent: new Decimal(100) });
      await assert.rejects(assertPortalItbiAccess(f.db, "citizen", declaration.id), /explícito/);
      await grantItbiProcessAccess(f.connection, f.actor, { declarationId: declaration.id, usuarioId: "citizen", reason: "Interessado comprovado", expiresAt: "2027-01-01T00:00:00.000Z", revoke: false });
      const base = { declarationId: declaration.id, expectedUpdatedAt: declaration.updatedAt.toISOString(), text: "Confira os dados", requestId: null, responseId: null, documentIds: [] };
      const request = await sendInternalItbiMessage(f.connection, f.actor, { ...base, kind: "REQUEST_ADJUSTMENT" });
      await assert.rejects(assertNoPendingItbiAdjustments(f.db, declaration.id), /pendente/);
      const current = await readItbiDeclaration(f.db, declaration.id);
      const response = await sendPortalItbiMessage(f.connection, "citizen", { ...base, expectedUpdatedAt: current.updatedAt.toISOString(), requestId: request.id, kind: "EXTERNAL_RESPONSE", dataAdjustment: { declaredPropertyValue: "2000.01", transmittedFraction: "50", registryOffice: "Cartório conferido" } });
      const beforeAccept = await readItbiDeclaration(f.db, declaration.id);
      await sendInternalItbiMessage(f.connection, f.actor, { ...base, expectedUpdatedAt: beforeAccept.updatedAt.toISOString(), requestId: request.id, responseId: response.id, kind: "ACCEPT_ADJUSTMENT" });
      await assertNoPendingItbiAdjustments(f.db, declaration.id);
      const adjusted = await readItbiDeclaration(f.db, declaration.id);
      assert.equal(adjusted.declaredPropertyValue.toFixed(2), "2000.01");
      assert.equal(adjusted.transmittedFraction.toString(), "50");
      const channel = await readPortalItbiChannel(f.db, "citizen", declaration.id);
      assert.deepEqual(channel.messages.map(row => row.kind), ["REQUEST_ADJUSTMENT", "EXTERNAL_RESPONSE", "ACCEPT_ADJUSTMENT"]);
      await f.db.update(accessProfiles).set({ ativo: false }).where(eq(accessProfiles.id, "itbi-profile"));
      await assert.rejects(assertPortalItbiAccess(f.db, "citizen", declaration.id), /Conta indisponível/);
      await f.db.update(accessProfiles).set({ ativo: true }).where(eq(accessProfiles.id, "itbi-profile"));
      await grantItbiProcessAccess(f.connection, f.actor, { declarationId: declaration.id, usuarioId: "citizen", reason: "Revogação comprovada", expiresAt: null, revoke: true });
      await assert.rejects(assertPortalItbiAccess(f.db, "citizen", declaration.id), /explícito/);
    });

    await t.test("non-taxable decision retains theoretical tax, GED provenance and audit", async () => {
      const declaration = await seedItbiDeclaration(f, "exempt", { processId: "process", status: "PROTOCOLADA" });
      await f.database.exec(`INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('treatment-proof','Comprovação','LAUDO','fixture://proof','Válido',CURRENT_TIMESTAMP); INSERT INTO "ProcessDocument" (id,"processId","documentId",purpose) VALUES ('treatment-link','process','treatment-proof','Decisão');`);
      const result = await decideItbiFiscalTreatment(f.connection, f.actor, { declarationId: declaration.id, expectedUpdatedAt: declaration.updatedAt.toISOString(), treatment: "IMUNIDADE", legalBasis: "Fundamento municipal conferido", reason: "Decisão fundamentada", documentIds: ["treatment-proof"] });
      const decided = await readItbiDeclaration(f.db, declaration.id);
      assert.equal(decided.status, "NAO_TRIBUTAVEL"); assert.equal(decided.taxAmount.toFixed(2), "20.00"); assert.equal(decided.documentId, result.documentId);
      const entry = requireItbiRecord(await latestItbiRegistryEntry(f.db, "ITBI_DECLARATION", declaration.id, "ITBI_FISCAL_TREATMENT"));
      assert.equal(taxScopeSnapshot(entry.data).payableTax, "0.00");
      await assert.rejects(async () => { await f.db.update(taxRegistryEntries).set({ title: "Mudança" }).where(eq(taxRegistryEntries.id, entry.id)); }, /imutável/);
    });

    await t.test("partial ownership, correspondence, rectification chain and reversal remain one atomic cadastral history", async () => {
      await f.database.exec(`INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","updatedAt") VALUES ('ownership-process','ITBI-OWNERSHIP','process-type','subject',CURRENT_TIMESTAMP);`);
      const declaration = await seedItbiDeclaration(f, "ownership", { processId: "ownership-process", status: "APROVADA", transmittedFraction: new Decimal(50), taxableBase: new Decimal(500), taxAmount: new Decimal(10), cadastralUpdateMode: "MANUAL" });
      await f.db.insert(itbiParties).values([{ declarationId: declaration.id, taxpayerId: "seller", role: "TRANSMITENTE", participationPercent: new Decimal(100), sortOrder: 0 }, { declarationId: declaration.id, taxpayerId: "buyer", role: "ADQUIRENTE", participationPercent: new Decimal(100), sortOrder: 1 }]);
      const address = { street: "Rua municipal", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" };
      await f.db.insert(taxRegistryEntries).values({ entityType: "REAL_ESTATE", entityId: "property", category: "PROPERTY_PROFILE", title: "Perfil conferido", data: { propertyId: "property", expectedVersion: 0, expectedUpdatedAt: new Date().toISOString(), governmentEntityId: "ente", budgetUnitId: "ug", kind: "Terreno", parentId: null, unitMode: null, owners: [{ taxpayerId: "seller", sharePercent: "100", primary: true }], inscriptionParts: {}, correspondenceAddress: address, latitude: null, longitude: null, floors: 0, frontSetback: "0", sideSetback: "0", riskArea: false, environmentalProtection: false, documentIds: [], processId: "ownership-process", reason: "Origem conferida" } });
      const [assessment] = await f.db.insert(taxAssessments).values({ id: "ownership-assessment", year: 2026, taxId: "ITBI", taxpayerId: "buyer", originalValue: 10, originalValueDecimal: new Decimal(10), taxableBaseDecimal: new Decimal(500), finalValueDecimal: new Decimal(10), status: "Pago", calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug", itbiDeclarationId: declaration.id } }).returning();
      const [guide] = await f.db.insert(taxGuides).values({ assessmentId: assessment.id, totalValue: 10, totalValueDecimal: new Decimal(10), dueDate: new Date("2026-12-01T23:59:59.999Z"), status: "Paga" }).returning();
      const [payment] = await f.db.insert(taxPayments).values({ guideId: guide.id, amountPaid: 10, amountPaidDecimal: new Decimal(10), paymentDate: new Date("2026-01-01T12:34:56.789Z"), paymentMethod: "Manual", status: "Confirmado" }).returning();
      await f.db.update(itbiDeclarations).set({ assessmentId: assessment.id, guideId: guide.id }).where(eq(itbiDeclarations.id, declaration.id));
      const before = await readItbiDeclaration(f.db, declaration.id);
      await configureItbiCorrespondence(f.connection, f.actor, { declarationId: declaration.id, expectedUpdatedAt: before.updatedAt.toISOString(), updateAddress: true, buyerTaxpayerId: "buyer", address: { ...address, number: "99" }, reason: "Endereço do adquirente conferido" });
      await transferItbiManually(f.connection, f.actor, { declarationId: declaration.id, reason: "Transferência conferida" });
      const transferred = await transferItbiManually(f.connection, f.actor, { declarationId: declaration.id, reason: "Transferência conferida" });
      const position = requireItbiRecord(await latestItbiRegistryEntry(f.db, "REAL_ESTATE", "property", "FISCAL_OWNERSHIP"));
      assert.deepEqual(taxScopeSnapshot(position.data).owners, [{ taxpayerId: "buyer", sharePercent: "50" }, { taxpayerId: "seller", sharePercent: "50" }]);
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(requireItbiRecord(await latestItbiRegistryEntry(f.db, "REAL_ESTATE", "property", "PROPERTY_PROFILE")).data).correspondenceAddress).number, "99");
      await f.db.insert(documents).values({ id: "rectification-proof", title: "Retificação", documentType: "LAUDO", fileUrl: "fixture://rectification", status: "Válido" });
      await f.database.exec(`INSERT INTO "ProcessDocument" (id,"processId","documentId",purpose) VALUES ('rectification-link','ownership-process','rectification-proof','Retificação');`);
      const rectified = await rectifyTransferredItbi(f.connection, f.actor, { declarationId: declaration.id, expectedUpdatedAt: transferred.updatedAt.toISOString(), declaredValue: "1000", assessedPropertyValue: "2000", registryOffice: "Cartório conferido", dueDate: "2026-12-01", reason: "Retificação fundamentada", legalBasis: "Decisão municipal", documentIds: ["rectification-proof"] });
      assert.equal((await readItbiDeclaration(f.db, declaration.id)).status, "RETIFICADA");
      assert.ok((await renderItbiDamPdf(f.connection, { actor: f.actor }, rectified.declarationId)).byteLength > 100);
      assert.ok((await renderItbiProcessPdf(f.connection, { actor: f.actor }, rectified.declarationId, "PROCESS")).byteLength > 100);
      await withDatabaseTransaction(f.connection, async tx => {
        await tx.update(taxPayments).set({ status: "Estornado" }).where(eq(taxPayments.id, payment.id));
        await reversePaidItbiInTransaction(tx, f.actor, payment.id, new Date());
      });
      assert.equal((await readItbiDeclaration(f.db, rectified.declarationId)).cadastralUpdatedAt, null);
      assert.equal(requireItbiRecord((await f.db.select().from(realEstates).where(eq(realEstates.id, "property")))[0]).taxpayerId, "seller");
      const restored = requireItbiRecord(await latestItbiRegistryEntry(f.db, "REAL_ESTATE", "property", "FISCAL_OWNERSHIP"));
      assert.deepEqual(taxScopeSnapshot(restored.data).owners, [{ taxpayerId: "seller", sharePercent: "100" }]);
      const history = await readItbiRegistryEntries(f.db, and(itbiRegistryPosition("ITBI_DECLARATION", rectified.declarationId, "ITBI_FIELD_HISTORY"))!, [desc(taxRegistryEntries.version)]);
      assert.ok(history.length > 0);
    });
  } finally { await f.close(); }
});
