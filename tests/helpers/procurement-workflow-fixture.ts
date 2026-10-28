import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Explicit local PostgreSQL schema for procurement workflows, using the real Neon driver. */
export async function createProcurementWorkflowFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const f = await createLocalDrizzleDatabase();
  try {
    await f.database.exec(`
      CREATE TABLE "Usuario" (id text PRIMARY KEY, ativo boolean NOT NULL DEFAULT true);
      CREATE TABLE "UsuarioUnidadeGestora" (id text PRIMARY KEY, "usuarioId" text NOT NULL REFERENCES "Usuario", "budgetUnitId" text NOT NULL);
      CREATE TABLE "Secretariat" (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE "Department" (id text PRIMARY KEY, name text NOT NULL, "secretariatId" text REFERENCES "Secretariat", "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "Employee" (id text PRIMARY KEY, name text NOT NULL, cpf text, registration text, email text, phone text, "isActive" boolean NOT NULL DEFAULT true, "salaryBase" float8 NOT NULL DEFAULT 0, "contractedHours" integer NOT NULL DEFAULT 220, "roleId" text, "secretariatId" text REFERENCES "Secretariat", "departmentId" text REFERENCES "Department", "unitId" text, "personId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "FinancialYear" (id text PRIMARY KEY, year integer NOT NULL, "governmentEntityId" text NOT NULL, status text NOT NULL DEFAULT 'Aberto');
      CREATE TABLE "BudgetUnit" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL, "secretariatId" text NOT NULL REFERENCES "Secretariat");
      CREATE TABLE "PlanningEntityUnit" ("budgetUnitId" text PRIMARY KEY REFERENCES "BudgetUnit", "governmentEntityId" text NOT NULL);
      CREATE TABLE "BudgetAppropriation" (id text PRIMARY KEY, "budgetUnitId" text NOT NULL REFERENCES "BudgetUnit", "financialYearId" text NOT NULL REFERENCES "FinancialYear");
      CREATE TABLE "Supplier" (id text PRIMARY KEY, status text NOT NULL DEFAULT 'Ativo');
      CREATE TABLE "Document" (id text PRIMARY KEY, title text NOT NULL, "documentType" text NOT NULL, "fileUrl" text NOT NULL, status text NOT NULL DEFAULT 'Válido');
      CREATE TABLE "CatalogItem" (id text PRIMARY KEY, code text UNIQUE, name text NOT NULL, description text, unit text NOT NULL DEFAULT 'UN', category text, "estimatedValue" float8, "isActive" boolean NOT NULL DEFAULT true, "productKind" text NOT NULL DEFAULT 'MATERIAL', specification text, "externalCode" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "MaterialCategory" (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "Material" (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, description text, type text NOT NULL DEFAULT 'MATERIAL', "unitOfMeasure" text NOT NULL DEFAULT 'UN', "minStock" float8 NOT NULL DEFAULT 0, "maxStock" float8 NOT NULL DEFAULT 0, "isPerishable" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "categoryId" text NOT NULL REFERENCES "MaterialCategory", "subcategoryId" text, "catalogItemId" text REFERENCES "CatalogItem", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "Warehouse" (id text PRIMARY KEY, name text NOT NULL, "isActive" boolean NOT NULL DEFAULT true);
      CREATE TABLE "InventorySession" (id text PRIMARY KEY, "warehouseId" text NOT NULL REFERENCES "Warehouse", status text NOT NULL, "lockMovements" boolean NOT NULL DEFAULT true);
      CREATE TABLE "MaterialStock" (id text PRIMARY KEY, "valuationEnabled" boolean NOT NULL DEFAULT false, quantity float8 NOT NULL DEFAULT 0, "batchNumber" text NOT NULL DEFAULT '', "expirationDate" timestamp, "unitCost" float8, "productionDate" timestamp, "blockedAt" timestamp, "blockReason" text, "warehouseId" text NOT NULL REFERENCES "Warehouse", "materialId" text NOT NULL REFERENCES "Material", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("warehouseId", "materialId", "batchNumber"));
      CREATE TABLE "MaterialMovement" (id text PRIMARY KEY, type text NOT NULL, operation text NOT NULL DEFAULT 'REGULAR', "idempotencyKey" text UNIQUE, quantity float8 NOT NULL, "unitValue" float8, "quantityDecimal" numeric(18,6), "unitValueDecimal" numeric(18,6), "totalValueDecimal" numeric(18,2), date timestamp NOT NULL DEFAULT now(), reason text, "warehouseId" text NOT NULL REFERENCES "Warehouse", "materialId" text NOT NULL REFERENCES "Material", "stockId" text REFERENCES "MaterialStock", "supplierId" text REFERENCES "Supplier", "departmentId" text REFERENCES "Department", "obrasServicoId" text, "settlementId" text, "materialRequestItemId" text, "returnedMovementId" text REFERENCES "MaterialMovement", "reversedMovementId" text UNIQUE REFERENCES "MaterialMovement", "actorUsuarioId" text REFERENCES "Usuario", "actorEmployeeId" text REFERENCES "Employee", "inventorySessionId" text REFERENCES "InventorySession", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseRequest" (id text PRIMARY KEY, number text NOT NULL UNIQUE, object text NOT NULL, justification text NOT NULL, "estimatedValue" float8, status text NOT NULL DEFAULT 'Rascunho', "secretariatId" text NOT NULL REFERENCES "Secretariat", "departmentId" text REFERENCES "Department", "requesterId" text NOT NULL REFERENCES "Employee", "approvedByEmployeeId" text REFERENCES "Employee", "approvedAt" timestamp, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseRequestItem" (id text PRIMARY KEY, "purchaseRequestId" text NOT NULL REFERENCES "PurchaseRequest", "catalogItemId" text REFERENCES "CatalogItem", "customName" text, quantity float8 NOT NULL, "estimatedUnitValue" float8, "materialId" text REFERENCES "Material", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseRequestItemBudgetAllocation" (id text PRIMARY KEY, "purchaseRequestItemId" text NOT NULL REFERENCES "PurchaseRequestItem", "budgetAppropriationId" text NOT NULL REFERENCES "BudgetAppropriation", quantity float8 NOT NULL, "valueDecimal" numeric(18,2) NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("purchaseRequestItemId", "budgetAppropriationId"));
      CREATE TABLE "PurchaseProcess" (id text PRIMARY KEY, number text NOT NULL UNIQUE, object text NOT NULL, type text NOT NULL, modality text, "estimatedValue" float8, status text NOT NULL DEFAULT 'Em Planejamento', "secretariatId" text NOT NULL REFERENCES "Secretariat", "purchaseRequestId" text REFERENCES "PurchaseRequest", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseProcessItem" (id text PRIMARY KEY, "purchaseProcessId" text NOT NULL REFERENCES "PurchaseProcess", "catalogItemId" text REFERENCES "CatalogItem", "customName" text, quantity float8 NOT NULL, "estimatedUnitValue" float8, "materialId" text REFERENCES "Material", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseProcessRequestOrigin" (id text PRIMARY KEY, "purchaseProcessId" text NOT NULL REFERENCES "PurchaseProcess", "purchaseRequestId" text NOT NULL REFERENCES "PurchaseRequest", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("purchaseProcessId", "purchaseRequestId"));
      CREATE TABLE "PurchaseProcessItemOrigin" (id text PRIMARY KEY, "purchaseProcessItemId" text NOT NULL REFERENCES "PurchaseProcessItem", "purchaseRequestItemId" text NOT NULL REFERENCES "PurchaseRequestItem", quantity float8 NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(), UNIQUE ("purchaseProcessItemId", "purchaseRequestItemId"));
      CREATE TABLE "Contract" (id text PRIMARY KEY, number text NOT NULL UNIQUE, object text NOT NULL, "initialValue" float8 NOT NULL, "updatedValue" float8 NOT NULL, "startDate" timestamp NOT NULL, "endDate" timestamp NOT NULL, status text NOT NULL DEFAULT 'Minuta', "processId" text NOT NULL REFERENCES "PurchaseProcess", "supplierId" text NOT NULL REFERENCES "Supplier", "secretariatId" text NOT NULL REFERENCES "Secretariat", "sourceBudgetUnitId" text REFERENCES "BudgetUnit", "managerId" text REFERENCES "Employee", "inspectorId" text REFERENCES "Employee", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseReceipt" (id text PRIMARY KEY, number text NOT NULL UNIQUE, "receivedAt" timestamp NOT NULL, status text NOT NULL DEFAULT 'APPROVED', "contractId" text NOT NULL REFERENCES "Contract", "purchaseProcessId" text NOT NULL REFERENCES "PurchaseProcess", "documentId" text NOT NULL REFERENCES "Document", "receiverId" text NOT NULL REFERENCES "Employee", "attesterId" text NOT NULL REFERENCES "Employee", "idempotencyKey" text NOT NULL UNIQUE, "sourceType" text NOT NULL DEFAULT 'CONTRACT', "sourceId" text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseReceiptItem" (id text PRIMARY KEY, "purchaseReceiptId" text NOT NULL REFERENCES "PurchaseReceipt", "purchaseProcessItemId" text NOT NULL REFERENCES "PurchaseProcessItem", "materialId" text NOT NULL REFERENCES "Material", "warehouseId" text NOT NULL REFERENCES "Warehouse", quantity float8 NOT NULL, "quantityIncorporated" float8 NOT NULL DEFAULT 0, "unitCost" float8 NOT NULL, "batchNumber" text NOT NULL DEFAULT '', "expirationDate" timestamp, brand text, model text, "serialNumber" text, "stockMovementId" text NOT NULL UNIQUE REFERENCES "MaterialMovement", "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "ProcurementLifecycleEvent" (id text PRIMARY KEY, "eventType" text NOT NULL, "entityType" text NOT NULL, "entityId" text NOT NULL, "sourceType" text, "sourceId" text, "actorUsuarioId" text NOT NULL REFERENCES "Usuario", "idempotencyKey" text NOT NULL UNIQUE, "createdAt" timestamp NOT NULL DEFAULT now());
      CREATE TABLE "SequenceCounter" (id text PRIMARY KEY, key text NOT NULL UNIQUE, value integer NOT NULL DEFAULT 0, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
      ALTER TABLE "PurchaseRequest" ADD COLUMN priority text NOT NULL DEFAULT 'Normal';
      INSERT INTO "Usuario" VALUES ('ana'), ('beatriz');
      INSERT INTO "Secretariat" VALUES ('secretaria', 'Administração');
      INSERT INTO "Department" (id, name, "secretariatId") VALUES ('setor', 'Suprimentos', 'secretaria');
      INSERT INTO "Employee" (id, name, "secretariatId", "departmentId") VALUES ('servidora-ana', 'Ana', 'secretaria', 'setor'), ('aprovadora', 'Beatriz', 'secretaria', 'setor'), ('recebedor', 'Carlos', 'secretaria', 'setor');
      INSERT INTO "BudgetUnit" VALUES ('ug', '01', 'Unidade gestora', 'secretaria');
      INSERT INTO "Supplier" VALUES ('fornecedor', 'Ativo');
      INSERT INTO "Document" VALUES ('documento-fiscal', 'Documento fiscal', 'Recebimento', 'https://fixture.invalid/recibo', 'Válido');
      INSERT INTO "Warehouse" VALUES ('central', 'Almoxarifado', true);
    `);
    const governmentEntityId = jurisdiction === "EXECUTIVE" ? "executivo" : "legislativo";
    await f.database.query('INSERT INTO "FinancialYear" (id, year, "governmentEntityId") VALUES ($1, 2026, $2)', ["ano", governmentEntityId]);
    await f.database.query('INSERT INTO "PlanningEntityUnit" VALUES ($1, $2)', ["ug", governmentEntityId]);
    await f.database.exec(`INSERT INTO "BudgetAppropriation" VALUES ('dotacao', 'ug', 'ano');`);
    return { ...f, actor: { usuarioId: "beatriz", employeeId: "aprovadora", allowedBudgetUnitIds: ["ug"] }, appropriationId: "dotacao" };
  } catch (error) { await f.close(); throw error; }
}

/** Historical-schema fixture for the price research and shared catalog flows.
 * Other consumers of the small workflow fixture create their own tables; keep
 * this explicit entry point so the full DDL does not collide with those seeds.
 * Open/close fixtures sequentially: Neon WebSocket configuration is global. */
export async function createHistoricalProcurementWorkflowFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const f = await createLocalDrizzleDatabase();
  try {
    const root = new URL("../../prisma/migrations-ibema/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await f.database.exec(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    await f.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('procurement-workflow-profile','PROCUREMENT_WORKFLOW_TEST','Operador de Compras','{}','2026-10-19');
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('ana','Ana','procurement-ana@example.test','procurement-workflow-profile','2026-10-19'),('beatriz','Beatriz','procurement-beatriz@example.test','procurement-workflow-profile','2026-10-19');
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Administração','2026-10-19');
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('setor','Suprimentos','secretaria','2026-10-19');
      INSERT INTO "Employee" (id,name,"secretariatId","departmentId","updatedAt") VALUES ('servidora-ana','Ana','secretaria','setor','2026-10-19'),('aprovadora','Beatriz','secretaria','setor','2026-10-19'),('recebedor','Carlos','secretaria','setor','2026-10-19');
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','PROCUREMENT-01','Unidade gestora','secretaria','2026-10-19');
      INSERT INTO "Supplier" (id,status,"updatedAt") VALUES ('fornecedor','Ativo','2026-10-19');
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('documento-fiscal','Documento fiscal','Recebimento','https://fixture.invalid/recibo','Válido','2026-10-19');
      INSERT INTO "Warehouse" (id,name,"isActive","updatedAt") VALUES ('central','Almoxarifado',true,'2026-10-19');
      INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('executivo','PROCUREMENT-EXEC','Prefeitura','PREFEITURA','2026-10-19'),('legislativo','PROCUREMENT-LEG','Câmara','CAMARA','2026-10-19');
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('executivo','EXECUTIVE'),('legislativo','LEGISLATIVE');
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('procurement-expense-nature','3.3.90.30','Material de consumo','2026-10-19');
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('procurement-resource-source','PROCUREMENT-500','Recursos de teste','2026-10-19');
    `);
    const governmentEntityId = jurisdiction === "EXECUTIVE" ? "executivo" : "legislativo";
    await f.database.query('INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ($1,2026,$2,\'Aberto\',\'2026-01-01\',\'2026-12-31\',\'2026-10-19\')', ["ano", governmentEntityId]);
    await f.database.query('INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ($1,$2)', ["ug", governmentEntityId]);
    await f.database.exec(`INSERT INTO "BudgetAppropriation" (id,code,"budgetUnitId","financialYearId","expenseNatureId","resourceSourceId","updatedAt") VALUES ('dotacao','PROCUREMENT-DOTACAO','ug','ano','procurement-expense-nature','procurement-resource-source','2026-10-19');`);
    return { ...f, actor: { usuarioId: "beatriz", employeeId: "aprovadora", allowedBudgetUnitIds: ["ug"] }, appropriationId: "dotacao", profileId: "procurement-workflow-profile" };
  } catch (error) { await f.close(); throw error; }
}
