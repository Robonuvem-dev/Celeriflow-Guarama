import assert from "node:assert/strict";
import test from "node:test";
import { administrationSuppliesPayload, validateAdministrationSupplies, type AdministrationSupplyDraft } from "./administration-supplies";

const materialIds = new Set(["material-1", "material-2"]);
const warehouseIds = new Set(["warehouse-1", "warehouse-2"]);
function drafts(count = 21): AdministrationSupplyDraft[] {
  return Array.from({ length: count }, (_, index) => ({ id: `draft-${index}`, materialId: index % 2 ? "material-2" : "material-1", warehouseId: index % 2 ? "warehouse-2" : "warehouse-1", batchNumber: `LOTE-${index}`, quantity: index === 0 ? "0.000001" : "1.25" }));
}

test("serializes the complete clinical supply set, decimals and order without client IDs", () => {
  const supplies = drafts(41);
  assert.equal(validateAdministrationSupplies(supplies, materialIds, warehouseIds), null);
  const payload = JSON.parse(JSON.stringify(administrationSuppliesPayload(supplies)));
  assert.equal(payload.length, 41);
  assert.deepEqual(payload[0], { materialId: "material-1", warehouseId: "warehouse-1", batchNumber: "LOTE-0", quantity: 0.000001 });
  assert.deepEqual(payload[20], { materialId: "material-1", warehouseId: "warehouse-1", batchNumber: "LOTE-20", quantity: 1.25 });
  assert.deepEqual(payload[40], { materialId: "material-1", warehouseId: "warehouse-1", batchNumber: "LOTE-40", quantity: 1.25 });
  assert(payload.every((item: object) => Object.keys(item).sort().join(",") === "batchNumber,materialId,quantity,warehouseId"));
  assert.equal(supplies[0].quantity, "0.000001", "Serialization must not mutate the string draft");
});

test("off-page quantities are validated, including finite and minimum-value constraints", () => {
  for (const quantity of ["", " ", "0", "-1", "0.0000001", "Infinity", "1e309", "NaN", "1,25"]) {
    const supplies = drafts();
    supplies[20].quantity = quantity;
    const issue = validateAdministrationSupplies(supplies, materialIds, warehouseIds);
    assert.equal(issue?.index, 20, `Invalid off-page quantity: ${JSON.stringify(quantity)}`);
    assert.equal(issue?.id, "draft-20");
    assert.equal(issue?.field, "quantity");
    assert.match(issue?.message || "", /Material 21/);
  }
});

test("off-page selection must belong to the current product and stock options", () => {
  const supplies = drafts();
  supplies[20].materialId = "unavailable-product";
  assert.equal(validateAdministrationSupplies(supplies, materialIds, warehouseIds)?.field, "materialId");
  supplies[20].materialId = "material-1";
  supplies[20].warehouseId = "unavailable-stock";
  assert.equal(validateAdministrationSupplies(supplies, materialIds, warehouseIds)?.field, "warehouseId");
  supplies[20].warehouseId = "warehouse-1";
  supplies[20].batchNumber = "  ";
  assert.equal(validateAdministrationSupplies(supplies, materialIds, warehouseIds)?.field, "batchNumber");
});

test("removing a row preserves the complete payload of the remaining IDs and original values", () => {
  const supplies = drafts();
  supplies[20].quantity = "3.75";
  const remaining = supplies.filter(item => item.id !== "draft-0");
  assert.equal(validateAdministrationSupplies(remaining, materialIds, warehouseIds), null);
  const payload = administrationSuppliesPayload(remaining);
  assert.equal(payload.length, 20);
  assert.equal(payload[19].batchNumber, "LOTE-20");
  assert.equal(payload[19].quantity, 3.75);
  assert.equal(remaining[19].id, "draft-20");
});

test("an administration may have no auxiliary supplies", () => {
  assert.equal(validateAdministrationSupplies([], materialIds, warehouseIds), null);
  assert.deepEqual(administrationSuppliesPayload([]), []);
});
