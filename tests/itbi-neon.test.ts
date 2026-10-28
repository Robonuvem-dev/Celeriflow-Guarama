import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { itbiDeclarations, itbiDocumentSequences, itbiEvents, itbiParties, itbiTransactionTypes } from "../src/db/schema/tax-itbi";
import { itbiRegistryPosition, readActiveItbiUser, readConfirmedItbiPayments, readItbiMunicipalUnit, readItbiProcessDocuments, readItbiProcessGrant, readItbiRegistryEntries, readItbiTaxpayers, readItbiUsers, readValidItbiDocuments } from "../src/db/repositories/tax-itbi/records";

test("ITBI: physical Neon columns and repository projections in a read-only snapshot", { skip: !process.env.ITBI_NEON_URL }, async () => {
  const connection = createDatabaseConnection(process.env.ITBI_NEON_URL!);
  const absent = "__itbi_drizzle_readonly_smoke_absent__";
  try {
    await withDatabaseTransaction(connection, async tx => {
      assert.deepEqual(await tx.select().from(itbiDeclarations).where(eq(itbiDeclarations.id, absent)), []);
      assert.deepEqual(await tx.select().from(itbiTransactionTypes).where(eq(itbiTransactionTypes.id, absent)), []);
      assert.deepEqual(await tx.select().from(itbiParties).where(eq(itbiParties.id, absent)), []);
      assert.deepEqual(await tx.select().from(itbiEvents).where(eq(itbiEvents.id, absent)), []);
      assert.deepEqual(await tx.select().from(itbiDocumentSequences).where(eq(itbiDocumentSequences.id, absent)), []);
      assert.deepEqual(await readItbiRegistryEntries(tx, itbiRegistryPosition("ITBI_DECLARATION", absent, "ITBI_FIELD_HISTORY")), []);
      assert.equal(await readItbiMunicipalUnit(tx, { budgetUnitId: absent, governmentEntityId: absent }), null);
      assert.equal(await readActiveItbiUser(tx, absent), null);
      assert.equal(await readItbiProcessGrant(tx, absent, absent, new Date()), null);
      assert.deepEqual(await readItbiUsers(tx, [absent]), []);
      assert.deepEqual(await readItbiTaxpayers(tx, [absent]), []);
      assert.deepEqual(await readItbiProcessDocuments(tx, absent, [absent]), []);
      assert.deepEqual(await readValidItbiDocuments(tx, [absent]), []);
      assert.deepEqual(await readConfirmedItbiPayments(tx, absent, "asc"), []);
    }, { isolationLevel: "repeatable read", accessMode: "read only", timeoutMs: 60000 });
  } finally { await connection.pool.end(); }
});
