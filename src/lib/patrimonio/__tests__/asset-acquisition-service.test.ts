import assert from "node:assert/strict";
import { test } from "node:test";
import { AssetAcquisitionError, acquireAssetFromPurchaseReceipt, normalizeAssetAcquisitionInput } from "../asset-acquisition-service";
import { materialMovements, materialStocks } from "@/db/schema/assets-stock";
import { assets } from "@/db/schema/assets";
import { createAssetsFixture } from "./drizzle-fixture";

test("C5 requires and normalizes receipt/category references before tombamento", () => {
  assert.throws(() => normalizeAssetAcquisitionInput({ purchaseReceiptItemId: "", categoryId: "" }), AssetAcquisitionError);
  assert.deepEqual(normalizeAssetAcquisitionInput({ purchaseReceiptItemId: " receipt-item ", categoryId: " category ", departmentId: " department ", responsibleId: " responsible " }),
    { purchaseReceiptItemId: "receipt-item", categoryId: "category", departmentId: "department", responsibleId: "responsible" });
});

async function fixture() {
  const f = await createAssetsFixture();
  await f.pg.exec(`UPDATE "Material" SET type='PATRIMONIO', name='Notebook administrativo', description='Notebook para atendimento';
    INSERT INTO "Contract" VALUES ('contract-1','supplier-1');
    INSERT INTO "PurchaseReceipt" (id,number,"receivedAt",status,"contractId") VALUES ('receipt-1','NF-DEMO-0052','2026-09-10 12:00:00','APPROVED','contract-1');
    INSERT INTO "PurchaseReceiptItem" (id,"purchaseReceiptId","materialId","warehouseId",quantity,"unitCost","batchNumber",brand,model,"serialNumber","updatedAt") VALUES ('receipt-item-1','receipt-1','material-1','warehouse-1',1,4800,'LOTE-1','Dell','Latitude','SN-001',CURRENT_TIMESTAMP);
    INSERT INTO "MaterialStock" (id,"warehouseId","materialId",quantity,"batchNumber","unitCost","updatedAt") VALUES ('stock-1','warehouse-1','material-1',1,'LOTE-1',4800,CURRENT_TIMESTAMP);`);
  return f;
}

const actor = { usuarioId: "user-1", employeeId: "employee-1" };
const input = { purchaseReceiptItemId: "receipt-item-1", categoryId: "asset-category" };

test("Drizzle tombamento reserves one receipt unit, removes free stock and preserves IDs/money/document history", async () => {
  const f = await fixture();
  try {
    const asset = await acquireAssetFromPurchaseReceipt(f.connection, actor, input);
    const [movement] = await f.connection.db.select().from(materialMovements);
    assert.equal(movement.type, "Saída");
    assert.equal(movement.quantity, 1);
    assert.match(movement.reason!, /PAT00001/);
    assert.equal(asset.stockMovementId, movement.id);
    assert.equal(asset.purchaseReceiptItemId, input.purchaseReceiptItemId);
    assert.equal(asset.name, "Notebook administrativo");
    assert.equal(asset.brand, "Dell");
    assert.equal(asset.serialNumber, "SN-001");
    assert.equal(asset.code, "EQP000001");
    assert.equal(asset.acquisitionValueDecimal?.toFixed(2), "4800.00");
    assert.equal(asset.acquisitionDate.toISOString(), "2026-09-10T12:00:00.000Z");
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 0);
    assert.equal((await f.pg.query<{ quantityIncorporated: number }>('SELECT "quantityIncorporated" FROM "PurchaseReceiptItem"')).rows[0].quantityIncorporated, 1);
    await assert.rejects(acquireAssetFromPurchaseReceipt(f.connection, actor, input), /já foram tombados/);
    assert.equal((await f.connection.db.select().from(assets)).length, 1);
  } finally { await f.close(); }
});

test("Drizzle lost compare-and-swap reservation aborts before stock movement and rolls back sequence", async () => {
  const f = await fixture();
  try {
    await f.pg.exec(`CREATE FUNCTION suppress_receipt_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER suppress_receipt_claim BEFORE UPDATE ON "PurchaseReceiptItem" FOR EACH ROW EXECUTE FUNCTION suppress_receipt_claim();`);
    await assert.rejects(acquireAssetFromPurchaseReceipt(f.connection, actor, input), /disponibilidade do recebimento foi alterada/);
    assert.equal((await f.connection.db.select().from(materialStocks))[0].quantity, 1);
    assert.equal((await f.connection.db.select().from(materialMovements)).length, 0);
    assert.equal((await f.pg.query('SELECT * FROM "SequenceCounter"')).rows.length, 0);
  } finally { await f.close(); }
});
