import assert from "node:assert/strict";
import { config } from "dotenv";
import { and, count, eq } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { readFleetOperator } from "../src/db/repositories/fleet/operators";
import { materialStocks, materialMovements } from "../src/db/schema/assets-stock";
import { healthStockReceipts, healthStockTransfers } from "../src/db/schema/health-stock";
import { medicineDispensations } from "../src/db/schema/health-pharmacy";
import type { HealthPharmacyContext } from "../src/lib/contracts/health-pharmacy";
import { postHealthStockReceipt, dispatchHealthStockTransfer, receiveHealthStockTransfer, writeOffHealthStock } from "../src/lib/saude/health-stock-service";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const key = "aurora-pharmacy-catalogs-2026-v1";
const rollback = new Error("ROLLBACK_PHARMACY_REHEARSAL");

async function main() {
  const { db, databaseConnection: connection } = await import("../src/db/client");
  let evidence: unknown, failure: unknown;
  const counts = async () => ({
    receipts: (await db.select({ total: count() }).from(healthStockReceipts))[0].total,
    transfers: (await db.select({ total: count() }).from(healthStockTransfers))[0].total,
    stocks: (await db.select({ total: count() }).from(materialStocks))[0].total,
    movements: (await db.select({ total: count() }).from(materialMovements))[0].total,
    dispensations: (await db.select({ total: count() }).from(medicineDispensations))[0].total,
  });
  try {
    const before = await counts();
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        const operator = await readFleetOperator(tx, "admin@email.com");
        const user = operator.context.user;
        assert.ok(operator.active && user.firebaseUid && user.profileCode === "SYSTEM_ADMINISTRATOR");
        const context: HealthPharmacyContext = { database: tx, user: { ...user, role: user.profileCode } };
        const warehouseId = `${key}:warehouse:central`, destinationWarehouseId = `${key}:warehouse:dispensing`, materialId = `${key}:material:AUR-FAR-001`, batchNumber = "REHEARSAL-LOT-001";
        const receiptInput = { warehouseId, entryType: "Recebimento assistencial", invoiceNumber: "REHEARSAL-NF-FARMACIA", idempotencyKey: "REHEARSAL-PHARMACY-RECEIPT",
          items: [{ materialId, batchNumber, quantity: 100, unitCost: 0.15, productionDate: new Date("2026-01-01"), expirationDate: new Date("2027-12-31") }] };
        const receipt = await postHealthStockReceipt(context, receiptInput, connection);
        assert.equal(receipt.status, "POSTED");
        assert.equal((await postHealthStockReceipt(context, receiptInput, connection)).id, receipt.id);
        const transferInput = { originWarehouseId: warehouseId, destinationWarehouseId, idempotencyKey: "REHEARSAL-PHARMACY-TRANSFER", items: [{ materialId, batchNumber, quantity: 10 }] };
        await assert.rejects(dispatchHealthStockTransfer(context, { ...transferInput, destinationWarehouseId: warehouseId }, connection), /devem ser diferentes/);
        const transfer = await dispatchHealthStockTransfer(context, transferInput, connection);
        assert.equal(transfer.status, "IN_TRANSIT");
        const [{ total: beforeAcceptance }] = await tx.select({ total: count() }).from(materialStocks).where(and(eq(materialStocks.warehouseId, destinationWarehouseId), eq(materialStocks.materialId, materialId), eq(materialStocks.batchNumber, batchNumber)));
        assert.equal(beforeAcceptance, 0);
        assert.equal((await dispatchHealthStockTransfer(context, transferInput, connection)).id, transfer.id);
        assert.equal((await receiveHealthStockTransfer(context, transfer.id, connection)).status, "RECEIVED");
        assert.equal((await receiveHealthStockTransfer(context, transfer.id, connection)).status, "RECEIVED");
        const [origin] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, warehouseId), eq(materialStocks.materialId, materialId), eq(materialStocks.batchNumber, batchNumber))).limit(1);
        const [destination] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, destinationWarehouseId), eq(materialStocks.materialId, materialId), eq(materialStocks.batchNumber, batchNumber))).limit(1);
        assert.ok(origin && destination);
        assert.equal(origin.quantity, 90);
        assert.equal(destination.quantity, 10);
        assert.ok(destination.expirationDate);
        assert.equal(destination.expirationDate.toISOString(), receiptInput.items[0].expirationDate.toISOString());
        await assert.rejects(writeOffHealthStock(context, { stockId: destination.id, quantity: 11, reason: "Baixa por avaria" }, connection), /insuficiente/);
        assert.equal((await tx.select({ quantity: materialStocks.quantity }).from(materialStocks).where(eq(materialStocks.id, destination.id)))[0].quantity, 10);
        await writeOffHealthStock(context, { stockId: destination.id, quantity: 1, reason: "Avaria identificada na conferência física" }, connection);
        assert.equal((await tx.select({ quantity: materialStocks.quantity }).from(materialStocks).where(eq(materialStocks.id, destination.id)))[0].quantity, 9);
        evidence = { receiptPosted: true, receiptReplay: true, transferInTransit: true, destinationUnavailableBeforeAcceptance: true, transferReplay: true, acceptanceReplay: true, sameWarehouseTransferRejected: true, insufficientStockRejected: true,
          originQuantity: 90, destinationAfterAcceptance: 10, destinationAfterWriteOff: 9, expirationPreserved: true, limit: "Physical receipt/transfer/write-off; no prescription, dispensation, official pharmaceutical identifier or financial valuation established." };
        throw rollback;
      }), { timeoutMs: 120_000, isolationLevel: "serializable" });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ evidence, rollbackVerified: true, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência da farmácia."); process.exitCode = 1; });
