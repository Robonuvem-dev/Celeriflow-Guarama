import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { postHealthStockReceipt, dispatchHealthStockTransfer, receiveHealthStockTransfer, writeOffHealthStock } from "../src/lib/saude/health-stock-service";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const key = "aurora-pharmacy-catalogs-2026-v1";
const rollback = new Error("ROLLBACK_PHARMACY_REHEARSAL");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let evidence: unknown, failure: unknown;
  const counts = async () => ({ receipts: await prisma.healthStockReceipt.count(), transfers: await prisma.healthStockTransfer.count(), stocks: await prisma.materialStock.count(), movements: await prisma.materialMovement.count(), dispensations: await prisma.medicineDispensation.count() });
  try {
    const before = await counts();
    try {
      await prisma.$transaction(async tx => {
        const db = new Proxy(tx, { get(target, property) {
          if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
          return Reflect.get(target, property);
        } }) as unknown as PrismaClient;
        const user = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true, employee: true, unidadesGestoras: true, permissoesModulo: { include: { modulo: true } } } });
        assert.ok(user.ativo && user.firebaseUid && user.perfil.codigo === "SYSTEM_ADMINISTRATOR");
        const context: AppContext = { prisma: db, user: { id: user.id, firebaseUid: user.firebaseUid, email: user.email, name: user.nome, role: user.perfil.codigo, profileCode: user.perfil.codigo,
          permissions: user.perfil.permissoes, employeeId: user.employeeId, departmentId: user.employee?.departmentId ?? null, secretariatId: user.employee?.secretariatId ?? null,
          allowedBudgetUnitIds: user.unidadesGestoras.map(item => item.budgetUnitId), modulePermissions: user.permissoesModulo.map(item => ({ code: item.modulo.codigo, canView: item.canView, canEdit: item.canEdit })) } };
        const warehouseId = `${key}:warehouse:central`, destinationWarehouseId = `${key}:warehouse:dispensing`, materialId = `${key}:material:AUR-FAR-001`, batchNumber = "REHEARSAL-LOT-001";
        const receiptInput = { warehouseId, entryType: "Recebimento assistencial", invoiceNumber: "REHEARSAL-NF-FARMACIA", idempotencyKey: "REHEARSAL-PHARMACY-RECEIPT",
          items: [{ materialId, batchNumber, quantity: 100, unitCost: 0.15, productionDate: new Date("2026-01-01"), expirationDate: new Date("2027-12-31") }] };
        const receipt = await postHealthStockReceipt(context, receiptInput);
        assert.equal(receipt.status, "POSTED");
        assert.equal((await postHealthStockReceipt(context, receiptInput)).id, receipt.id);
        const transferInput = { originWarehouseId: warehouseId, destinationWarehouseId, idempotencyKey: "REHEARSAL-PHARMACY-TRANSFER", items: [{ materialId, batchNumber, quantity: 10 }] };
        await assert.rejects(dispatchHealthStockTransfer(context, { ...transferInput, destinationWarehouseId: warehouseId }), /devem ser diferentes/);
        const transfer = await dispatchHealthStockTransfer(context, transferInput);
        assert.equal(transfer.status, "IN_TRANSIT");
        assert.equal(await tx.materialStock.count({ where: { warehouseId: destinationWarehouseId, materialId, batchNumber } }), 0);
        assert.equal((await dispatchHealthStockTransfer(context, transferInput)).id, transfer.id);
        assert.equal((await receiveHealthStockTransfer(context, transfer.id)).status, "RECEIVED");
        assert.equal((await receiveHealthStockTransfer(context, transfer.id)).status, "RECEIVED");
        const origin = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId, materialId, batchNumber } } });
        const destination = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId: destinationWarehouseId, materialId, batchNumber } } });
        assert.equal(origin.quantity, 90);
        assert.equal(destination.quantity, 10);
        assert.equal(destination.expirationDate!.toISOString(), receiptInput.items[0].expirationDate.toISOString());
        await assert.rejects(writeOffHealthStock(context, { stockId: destination.id, quantity: 11, reason: "Baixa por avaria" }), /insuficiente/);
        assert.equal((await tx.materialStock.findUniqueOrThrow({ where: { id: destination.id } })).quantity, 10);
        await writeOffHealthStock(context, { stockId: destination.id, quantity: 1, reason: "Avaria identificada na conferência física" });
        assert.equal((await tx.materialStock.findUniqueOrThrow({ where: { id: destination.id } })).quantity, 9);
        evidence = { receiptPosted: true, receiptReplay: true, transferInTransit: true, destinationUnavailableBeforeAcceptance: true, transferReplay: true, acceptanceReplay: true, sameWarehouseTransferRejected: true, insufficientStockRejected: true,
          originQuantity: 90, destinationAfterAcceptance: 10, destinationAfterWriteOff: 9, expirationPreserved: true, limit: "Physical receipt/transfer/write-off; no prescription, dispensation, official pharmaceutical identifier or financial valuation established." };
        throw rollback;
      }, { timeout: 120000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ evidence, rollbackVerified: true, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência da farmácia."); process.exitCode = 1; });
