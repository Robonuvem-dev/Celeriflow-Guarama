import assert from "node:assert/strict";
import { test } from "node:test";
import { listInfrastructureServiceDetails } from "@/db/repositories/infrastructure/services";
import * as infrastructure from "@/db/schema/infrastructure";
import { assets } from "@/db/schema/assets";
import { materialStocks, materialMovements } from "@/db/schema/assets-stock";
import { documents, realEstates } from "@/db/schema/registry";
import { createAssetsFixture } from "@/lib/patrimonio/__tests__/drizzle-fixture";

test("Drizzle lighting projection preserves nullable links, exact dates, resources and material history", async () => {
  const f = await createAssetsFixture([realEstates, documents, ...Object.values(infrastructure)]);
  try {
    await f.pg.exec(`ALTER TABLE "Employee" ADD COLUMN name TEXT, ADD COLUMN registration TEXT;
      ALTER TABLE "BudgetAppropriation" ADD COLUMN code TEXT, ADD COLUMN "initialValue" DOUBLE PRECISION, ADD COLUMN "updatedValue" DOUBLE PRECISION, ADD COLUMN "committedValue" DOUBLE PRECISION;
      ALTER TABLE "Commitment" ADD COLUMN number TEXT, ADD COLUMN value DOUBLE PRECISION, ADD COLUMN status TEXT, ADD COLUMN history TEXT;
      CREATE TABLE "PurchaseRequest" (id TEXT PRIMARY KEY, number TEXT, object TEXT, status TEXT, "estimatedValue" DOUBLE PRECISION);
      CREATE TABLE "PurchaseProcess" (id TEXT PRIMARY KEY, number TEXT, object TEXT, status TEXT, "estimatedValue" DOUBLE PRECISION);
      INSERT INTO "Department" (id,name) VALUES ('department-1','Iluminação');
      INSERT INTO "Employee" (id,name,registration) VALUES ('employee-1','Servidor','001');
      INSERT INTO "BudgetAppropriation" (id,code,"initialValue","updatedValue","committedValue") VALUES ('budget-1','001',1000.01,1100.02,500.03);
      INSERT INTO "Commitment" (id,number,value,status,history) VALUES ('commitment-1','EMP-1',500.03,'Empenhado','Troca de luminárias');
      INSERT INTO "PurchaseRequest" VALUES ('request-1','REQ-1','Luminárias','Aprovada',250.45);`);
    assert.deepEqual(await listInfrastructureServiceDetails(f.connection.db), []);
    await f.connection.db.insert(realEstates).values({ id: "property-1", municipalInsc: "IM-1", propertyType: null, streetName: null });
    await f.connection.db.insert(assets).values({ id: "asset-1", patrimonyNumber: "PAT00001", name: "Poste", categoryId: "asset-category", realEstateId: "property-1", status: "Ativo", acquisitionDate: new Date("2026-01-01T12:00:00Z"), acquisitionValue: 100.01, currentValue: 100.01 });
    await f.connection.db.insert(documents).values({ id: "document-1", title: "Comprovante", documentType: "Laudo", fileUrl: "https://example.test/laudo.pdf", status: "Válido" });
    const scheduledFor = new Date("2026-09-10T12:34:56.789Z");
    await f.connection.db.insert(infrastructure.infrastructureServices).values([
      { id: "lighting-1", protocolo: "OS-1", tipo: "Iluminação", descricao: "Trocar luminária", local: "Praça", scheduledFor, departmentId: "department-1", targetAssetId: "asset-1", budgetAppropriationId: "budget-1", commitmentId: "commitment-1" },
      { id: "other-1", protocolo: "OS-2", tipo: "Limpeza", descricao: "Limpeza", local: "Rua" },
    ]);
    await f.connection.db.insert(infrastructure.infrastructureTeams).values({ id: "team-1", code: "EQ-1", name: "Equipe" });
    await f.connection.db.insert(infrastructure.infrastructureServiceEmployees).values({ obrasServicoId: "lighting-1", employeeId: "employee-1", role: "Executor", releasedAt: scheduledFor });
    await f.connection.db.insert(infrastructure.infrastructureServiceTeams).values({ obrasServicoId: "lighting-1", equipeId: "team-1" });
    await f.connection.db.insert(infrastructure.infrastructureServiceEquipment).values({ obrasServicoId: "lighting-1", assetId: "asset-1", operatingHours: 1.25 });
    await f.connection.db.insert(materialStocks).values({ id: "stock-1", materialId: "material-1", warehouseId: "warehouse-1", quantity: 5, unitCost: 12.34, batchNumber: "LOTE-1" });
    await f.connection.db.insert(infrastructure.infrastructureServiceMaterials).values({ obrasServicoId: "lighting-1", materialId: "material-1", stockId: "stock-1", quantityPlanned: 2, quantityIssued: 1, unitCost: 12.34 });
    await f.connection.db.insert(infrastructure.infrastructureServiceDocuments).values({ obrasServicoId: "lighting-1", documentId: "document-1" });
    await f.connection.db.insert(infrastructure.infrastructureServicePurchases).values({ obrasServicoId: "lighting-1", purchaseRequestId: "request-1" });
    await f.connection.db.insert(materialMovements).values({ type: "Saída", quantity: 1, obrasServicoId: "lighting-1", materialId: "material-1", warehouseId: "warehouse-1", stockId: "stock-1" });
    const rows = await listInfrastructureServiceDetails(f.connection.db, "Iluminação");
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.scheduledFor?.toISOString(), scheduledFor.toISOString());
    assert.equal(row.completedAt, null);
    assert.equal(row.targetAsset?.realEstate?.municipalInsc, "IM-1");
    assert.equal(row.targetAsset?.realEstate?.propertyType, null);
    assert.equal(row.commitment?.value, 500.03);
    assert.equal(row.budgetAppropriation?.updatedValue, 1100.02);
    assert.equal(row.employees[0].releasedAt?.toISOString(), scheduledFor.toISOString());
    assert.equal(row.employees[0].employee.registration, "001");
    assert.equal(row.teams[0].equipe.code, "EQ-1");
    assert.equal(row.equipment[0].operatingHours, 1.25);
    assert.equal(row.materials[0].stock?.batchNumber, "LOTE-1");
    assert.equal(row.materials[0].unitCost, 12.34);
    assert.equal(row.documents[0].document.status, "Válido");
    assert.equal(row.purchases[0].purchaseRequest?.estimatedValue, 250.45);
    assert.equal(row.purchases[0].purchaseProcess, null);
    assert.equal(row.materialMoves[0].quantity, 1);
    const other = (await listInfrastructureServiceDetails(f.connection.db)).find(item => item.id === "other-1")!;
    assert.equal(other.targetAsset, null);
    assert.equal(other.budgetAppropriation, null);
    assert.equal(other.commitment, null);
    assert.deepEqual(other.employees, []);
    assert.deepEqual(other.materialMoves, []);
  } finally { await f.close(); }
});
