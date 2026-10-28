import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { withDatabaseTransaction } from "../src/db/transaction";
import { pharmacyPageReceiptDetails, pharmacyPageReceiptItemDetails } from "../src/db/schema/health-pharmacy-pages";
import { readPharmacyStockPage, readPharmacyInvoicesPage } from "../src/db/repositories/health-pharmacy-pages/stock";
import { readPharmacyCatalogPage } from "../src/db/repositories/health-pharmacy-pages/catalog";
import { readPharmacyCallsPage } from "../src/db/repositories/health-pharmacy-pages/calls";
import { readPharmacyInventoryPage } from "../src/db/repositories/health-pharmacy-pages/inventory";
import { readPharmacyDispensationsPage } from "../src/db/repositories/health-pharmacy-pages/dispensations";
import { readPharmacyJudicialPage } from "../src/db/repositories/health-pharmacy-pages/judicial";
import { readPharmacyKitsPage } from "../src/db/repositories/health-pharmacy-pages/kits";
import { readPharmacyRequestsPage } from "../src/db/repositories/health-pharmacy-pages/requests";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { openMigrationConnection } from "../scripts/database-migrate-driver.mjs";
import { runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";

/** Own database and dataset. Only the generic Neon socket transport is shared:
 * PGlite server max=10, real production pool max=5. No owner health fixture,
 * generated DDL, mocks, private catalog or implementation-derived seed. */
async function fixture() {
  const f = await createLocalDrizzleDatabase();
  let authority: Awaited<ReturnType<typeof openMigrationConnection>> | undefined;
  try {
    const set = loadMigrationSet();
    assert.equal(set.historical.length, 156);
    const url = f.connection.pool.options.connectionString; assert.ok(url);
    authority = await openMigrationConnection(url);
    const replay = await runDatabaseMigrations(authority, set, { command: "replay" });
    assert.equal(replay.result, "PASS");
    await authority.close(); authority = undefined;
    // Nominal statements follow original SQL, independently of runtime mappings.
    await f.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('hpp-role','HPP','Farmácia','{}',now());
      INSERT INTO "Usuario" (id,nome,email,"firebaseUid","perfilId","updatedAt") VALUES ('hpp-user','Farmacêutico','hpp@example.invalid','hpp-auth','hpp-role',now()),('hpp-approver','Aprovador','hpp-approver@example.invalid','hpp-auth2','hpp-role',now());
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('hpp-secretariat','Saúde',now());
      INSERT INTO "Employee" (id,name,"secretariatId","updatedAt") VALUES ('hpp-employee','Profissional ativo','hpp-secretariat',now()),('hpp-inactive-employee','Profissional inativo','hpp-secretariat',now());
      UPDATE "Employee" SET "isActive"=false WHERE id='hpp-inactive-employee';
      INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('hpp-u1','Unidade A','UBS',now()),('hpp-u2','Unidade B','UBS',now());
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","updatedAt") VALUES ('hpp-professional','hpp-employee','hpp-u1',now()),('hpp-inactive-professional','hpp-inactive-employee','hpp-u2',now());
      INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('hpp-person1','Ana Farmácia',now()),('hpp-person2','Beatriz Farmácia',now()),('hpp-lawyer-person','Advogada Farmácia',now()),('hpp-receiver','Retirante Farmácia',now());
      INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") VALUES ('hpp-p1','hpp-person1','hpp-u1',now()),('hpp-p2','hpp-person2','hpp-u2',now());
      INSERT INTO "Warehouse" (id,name,"healthUnitId","updatedAt") VALUES ('hpp-w1','Estoque A','hpp-u1',now()),('hpp-w2','Estoque B','hpp-u2',now()),('hpp-w-inactive','Estoque inativo','hpp-u1',now()),('hpp-w-generic','Estoque geral',NULL,now());
      UPDATE "Warehouse" SET "isActive"=false WHERE id='hpp-w-inactive';
      INSERT INTO "MaterialCategory" (id,name,code,"updatedAt") VALUES ('hpp-category','Medicamentos','HPP',now());
      INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('hpp-m1','HPP1','Medicamento A','hpp-category',now()),('hpp-m2','HPP2','Correlato B','hpp-category',now()),('hpp-m-inactive','HPP3','Medicamento inativo','hpp-category',now()),('hpp-m-no-profile','HPP4','Sem perfil','hpp-category',now());
      UPDATE "Material" SET "isActive"=false WHERE id='hpp-m-inactive';
      INSERT INTO "HealthDcbSubstance" (id,code,name,"casNumber",version,"sourceReference","createdByUsuarioId") VALUES ('hpp-dcb','DCB-HPP','Substância A','123-45-6','2026','Fonte nominal','hpp-user');
      INSERT INTO "HealthMaterialProfile" (id,"materialId","productKind","dcbSubstanceId","catmatCode","renameMember","remumeMember","stockUnitsPerSupply","updatedAt") VALUES ('hpp-profile1','hpp-m1','MEDICINE','hpp-dcb','CATMAT-HPP',true,false,2.125,now()),('hpp-profile2','hpp-m2','CORRELATE',NULL,NULL,false,true,1,now()),('hpp-profile3','hpp-m-inactive','MEDICINE',NULL,NULL,false,false,1,now());
      INSERT INTO "HealthCatmatUnitMapping" (id,"profileId","localUnitCode","officialUnitCode","localUnitsPerOfficial",reference,"updatedAt") VALUES ('hpp-mapping','hpp-profile1','UN','CX',2.125,'Fonte CATMAT',now());
      INSERT INTO "Medicine" (id,name,"materialId","updatedAt") VALUES ('hpp-medicine','Medicamento A','hpp-m1',now());
      INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","expirationDate","createdAt","updatedAt") VALUES
        ('hpp-stock-null','hpp-w1','hpp-m1','SEM-VALIDADE',5.125,2.125,NULL,'2026-01-02',now()),
        ('hpp-stock-future','hpp-w1','hpp-m1','FUTURO',8.25,3.125,'2099-01-31 12:34:56.789','2026-01-01',now()),
        ('hpp-stock-other','hpp-w2','hpp-m1','OUTRA-UNIDADE',7,2,NULL,'2026-01-03',now()),
        ('hpp-stock-expired','hpp-w1','hpp-m1','VENCIDO',3,2,'2000-01-01','2026-01-04',now()),
        ('hpp-stock-blocked','hpp-w1','hpp-m1','BLOQUEADO',3,2,NULL,'2026-01-05',now()),
        ('hpp-stock-zero','hpp-w1','hpp-m1','ZERO',0,2,NULL,'2026-01-06',now()),
        ('hpp-stock-inactive','hpp-w-inactive','hpp-m1','INATIVO',4,2,NULL,'2026-01-07',now()),
        ('hpp-stock-generic','hpp-w-generic','hpp-m1','GERAL',4,2,NULL,'2026-01-08',now()),
        ('hpp-stock-correlate','hpp-w1','hpp-m2','CORRELATO',4,2,NULL,'2026-01-09',now()),
        ('hpp-stock-inactive-material','hpp-w1','hpp-m-inactive','MATERIAL-INATIVO',4,2,NULL,'2026-01-10',now()),
        ('hpp-stock-no-profile','hpp-w1','hpp-m-no-profile','SEM-PERFIL',4,2,NULL,'2026-01-11',now());
      UPDATE "MaterialStock" SET "blockedAt"='2026-01-01',"blockReason"='Bloqueio nominal' WHERE id='hpp-stock-blocked';
      INSERT INTO "HealthPrescription" (id,barcode,content,"patientId","professionalId","unitId",date,"updatedAt") VALUES ('hpp-rx1','Receita_%','Receita titular','hpp-p1','hpp-professional','hpp-u1','2026-01-31 12:34:56.789',now()),('hpp-rx2','Outra-receita','Receita outra unidade','hpp-p2','hpp-professional','hpp-u2','2026-02-01',now());
      INSERT INTO "HealthPrescriptionItem" (id,"prescriptionId","medicineId","medicineName",dose,route,frequency,quantity) VALUES ('hpp-rxi1','hpp-rx1','hpp-medicine','Medicamento A','1','Oral','Diária',9.125),('hpp-rxi2','hpp-rx2','hpp-medicine','Medicamento A','1','Oral','Diária',8);
      INSERT INTO "MedicineDispensation" (id,date,quantity,"medicineId","patientId","unitId","stockId","prescriptionItemId","updatedAt") VALUES ('hpp-d1','2026-01-31 12:34:56.789',1.125,'hpp-medicine','hpp-p1','hpp-u1','hpp-stock-future','hpp-rxi1',now()),('hpp-d2','2026-02-01',2,'hpp-medicine','hpp-p2','hpp-u2','hpp-stock-other','hpp-rxi2',now()),('hpp-cancelled','2026-01-31 12:34:56.789',3,'hpp-medicine','hpp-p1','hpp-u1',NULL,'hpp-rxi1',now());
      UPDATE "MedicineDispensation" SET status='CANCELLED',"cancelledAt"='2026-02-02',"cancellationReason"='Correção nominal' WHERE id='hpp-cancelled';
      INSERT INTO "HealthDispensationEvent" (id,"dispensationId",kind,reason,snapshot,"actorUsuarioId","createdAt") VALUES ('hpp-de1','hpp-d1','CORRECTED','Última correção','{"n":null}','hpp-user','2026-02-02'),('hpp-de0','hpp-d1','CREATED','Primeira versão','{}','hpp-user','2026-01-31');
      INSERT INTO "HealthStockReceipt" (id,"warehouseId","entryType",status,"idempotencyKey","createdByUsuarioId","donorName","updatedAt") VALUES ('hpp-receipt','hpp-w1','Doação','PENDING_APPROVAL','hpp-receipt','hpp-user','Doadora nominal',now());
      INSERT INTO "HealthStockReceiptItem" (id,"receiptId","materialId","batchNumber",quantity,"unitCost","expirationDate","manufacturerName") VALUES ('hpp-receipt-item','hpp-receipt','hpp-m1','DOADO',1.125,2.125,'2099-01-31 12:34:56.789','Fabricante nominal');
      INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES ('hpp-instance','Município fixture','Município','PR',now());
      INSERT INTO "ConfiguracaoParametroInstancia" (id,"configuracaoInstanciaId",chave,valor,"updatedAt") VALUES ('hpp-policy','hpp-instance','HEALTH_STOCK_RECEIPT_APPROVAL:hpp-w1','{"approvalRequired":true}',now()),('hpp-not-policy','hpp-instance','health_stock_receipt_approval:hpp-w2','{}',now());
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('hpp-company','Fornecedor nominal','11222333000181',now());
      INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('hpp-supplier','hpp-company',now());
      INSERT INTO "HealthStockTransfer" (id,"originWarehouseId","destinationWarehouseId",status,"idempotencyKey","createdByUsuarioId","updatedAt") VALUES ('hpp-transfer','hpp-w2','hpp-w1','IN_TRANSIT','hpp-transfer','hpp-user',now());
      INSERT INTO "InventorySession" (id,"warehouseId","createdByUsuarioId","updatedAt") VALUES ('hpp-inventory','hpp-w1','hpp-user',now());
      INSERT INTO "InventorySessionItem" (id,"sessionId","stockId","expectedQuantity","countedQuantity","updatedAt") VALUES ('hpp-inventory-item','hpp-inventory','hpp-stock-future',8.25,NULL,now());
      INSERT INTO "PharmacyRequest" (id,"patientId","destinationWarehouseId","createdByUsuarioId",notes,"updatedAt") VALUES ('hpp-request','hpp-p1','hpp-w1','hpp-user','Demanda nominal',now()),('hpp-warehouse-request',NULL,'hpp-w1','hpp-user','Transferência nominal',now()),('hpp-other-request','hpp-p2','hpp-w2','hpp-user','Outra unidade',now()),('hpp-generic-request','hpp-p1','hpp-w-generic','hpp-user','Estoque geral',now());
      INSERT INTO "PharmacyRequestItem" (id,"requestId","materialId","requestedQuantity","fulfilledQuantity") VALUES ('hpp-request-item','hpp-request','hpp-m1',5.125,1.125),('hpp-warehouse-item','hpp-warehouse-request','hpp-m1',8,0);
      INSERT INTO "HealthStockTransferItem" (id,"transferId","materialId","batchNumber",quantity,"pharmacyRequestItemId") VALUES ('hpp-transfer-item','hpp-transfer','hpp-m1','OUTRA-UNIDADE',2.125,'hpp-warehouse-item');
      INSERT INTO "MaterialMovement" (id,type,quantity,"warehouseId","materialId","stockId","quantityDecimal","unitValueDecimal","totalValueDecimal","updatedAt") VALUES ('hpp-movement','Saída',1.125,'hpp-w1','hpp-m1','hpp-stock-future',1.125,999999999999.123456,1124999999999.01,now());
      INSERT INTO "PharmacyRequestFulfillment" (id,"requestItemId",quantity,"movementId",reason,"actorUsuarioId") VALUES ('hpp-fulfillment','hpp-request-item',1.125,'hpp-movement','Entrega nominal','hpp-user');
      INSERT INTO "PharmacyRequestEvent" (id,"requestId",status,reason,"actorUsuarioId") VALUES ('hpp-request-event','hpp-request','OPEN','Abertura nominal','hpp-user');
      INSERT INTO "HealthCallPanel" (id,"unitId",sector,title,"callMessage",news,"updatedAt") VALUES ('hpp-panel1','hpp-u1','FARMACIA','Farmácia A','Retire o medicamento','Notícia',now()),('hpp-panel2','hpp-u2','FARMACIA','Farmácia B','Aguarde','Notícia',now());
      INSERT INTO "HealthPanelCall" (id,"panelId","patientId","pharmacyRequestId",message,"actorUsuarioId") VALUES ('hpp-call1','hpp-panel1','hpp-p1','hpp-request','Chamada nominal','hpp-user'),('hpp-call2','hpp-panel2','hpp-p2','hpp-other-request','Outra chamada','hpp-user');
      INSERT INTO "HealthPharmacyLawyer" (id,"personId",registration,"registrationState") VALUES ('hpp-lawyer','hpp-lawyer-person','12345','PR');
      INSERT INTO "HealthPharmacyJudicialCase" (id,"caseNumber","patientId","unitId","lawyerId","openedAt","validUntil",reason,"createdByUsuarioId") VALUES ('hpp-case','HPP-2026','hpp-p1','hpp-u1','hpp-lawyer','2026-01-31 12:34:56.789','2099-01-31','Razão nominal','hpp-user'),('hpp-other-case','HPP-OUTRA','hpp-p2','hpp-u2','hpp-lawyer','2026-01-31','2099-01-31','Outra unidade','hpp-user');
      INSERT INTO "HealthPharmacyJudicialItem" (id,"caseId","medicineId",quantity,dosage,"prescriptionItemId") VALUES ('hpp-case-item','hpp-case','hpp-medicine',5.125,'Posologia nominal','hpp-rxi1');
      INSERT INTO "HealthPharmacyJudicialEvent" (id,"caseId","toStatus",reason,"actorUsuarioId") VALUES ('hpp-case-event','hpp-case','OPEN','Abertura','hpp-user');
      INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('hpp-document','Documento judicial','Judicial','https://example.invalid/nominal',now());
      INSERT INTO "HealthPharmacyJudicialDocument" (id,"caseId","documentId","actorUsuarioId") VALUES ('hpp-document-link','hpp-case','hpp-document','hpp-user');
      UPDATE "MedicineDispensation" SET "judicialCaseItemId"='hpp-case-item' WHERE id IN ('hpp-d1','hpp-cancelled');
      INSERT INTO "HealthPharmacyKit" (id,code,name) VALUES ('hpp-kit','HPP','Kit nominal');
      INSERT INTO "HealthPharmacyKitItem" (id,"kitId","materialId",quantity) VALUES ('hpp-kit-item','hpp-kit','hpp-m1',1.125);
      INSERT INTO "HealthPharmacyKitDelivery" (id,"kitId","kitVersion","patientId","warehouseId",criteria,"sourceSnapshot","generatedByUsuarioId","idempotencyKey") VALUES ('hpp-kit-delivery','hpp-kit',1,'hpp-p1','hpp-w1','{"nullable":null,"dose":"1.125"}','{"original":[null,"001.00",true]}','hpp-user','hpp-kit-delivery'),('hpp-other-delivery','hpp-kit',1,'hpp-p2','hpp-w2','{}','{}','hpp-user','hpp-other-delivery'),('hpp-generic-delivery','hpp-kit',1,'hpp-p1','hpp-w-generic','{}','{}','hpp-user','hpp-generic-delivery');
      INSERT INTO "HealthPharmacyKitDeliveryItem" (id,"deliveryId","materialId",quantity,"stockId") VALUES ('hpp-delivery-item','hpp-kit-delivery','hpp-m1',1.125,'hpp-stock-future');
      INSERT INTO "HealthPharmacyKitEvent" (id,"deliveryId",status,reason,"actorUsuarioId") VALUES ('hpp-kit-event','hpp-kit-delivery','GENERATED','Geração nominal','hpp-user');
      INSERT INTO "HealthCareProgram" (id,code,name) VALUES ('hpp-program','HPP','Ação nominal');
      INSERT INTO "HealthCareProgramEnrollment" (id,"programId","patientId","unitId","startsAt",reason,"createdByUsuarioId") VALUES ('hpp-enrollment','hpp-program','hpp-p1','hpp-u1','2026-01-31 12:34:56.789','Vínculo nominal','hpp-user');
    `);
    return f;
  } catch (error) { try { await authority?.close(); } finally { await f.close(); } throw error; }
}

test("Pharmacy pages: full historical replay, independent SQL oracles and real Neon/Drizzle DTOs", async suite => {
  const f = await fixture(), db = f.connection.db;
  const stock = (units: readonly string[] | undefined, q = "", filter = "", requestedPage = 1) => readPharmacyStockPage(db, units, { q, filter, requestedPage });
  try {
    await suite.test("exclusive missing-column projections match replayed physical types/nullability", async () => {
      const physical = await db.execute<{ table_name: string; name: string; type: string; not_null: boolean }>(sql`SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('HealthStockReceipt','HealthStockReceiptItem') AND a.attnum>0 AND NOT a.attisdropped`);
      for (const table of [pharmacyPageReceiptDetails, pharmacyPageReceiptItemDetails]) {
        const config = getTableConfig(table);
        for (const column of config.columns) {
          const original = physical.rows.find(row => row.table_name === config.name && row.name === column.name); assert.ok(original);
          assert.equal(column.notNull, original.not_null);
          assert.equal(column.getSQLType().replaceAll(" ", ""), original.type.replace(" without time zone", "").replaceAll(" ", ""));
        }
      }
    });
    await suite.test("stock scope/count/order NULLS LAST, active-profile-only rule, receipt evidence and case-sensitive policy prefix", async () => {
      const page = await stock(["hpp-u1"]);
      // Oracle is a literal SQL statement against original historical names;
      // it imports no schema, predicate, builder or selection from the reader.
      const oracle = await db.execute<{ id: string }>(sql`SELECT s.id FROM "MaterialStock" s JOIN "Material" m ON m.id=s."materialId" JOIN "HealthMaterialProfile" p ON p."materialId"=m.id JOIN "Warehouse" w ON w.id=s."warehouseId" WHERE p."isActive" AND w."healthUnitId"='hpp-u1' ORDER BY s."expirationDate" ASC NULLS LAST,s."createdAt" DESC LIMIT 20`);
      assert.deepEqual(page.stocks.map(row => row.id), oracle.rows.map(row => row.id));
      assert.equal(page.total, oracle.rows.length);
      assert.ok(page.stocks.some(row => row.id === "hpp-stock-inactive-material"));
      assert.ok(page.stocks.some(row => row.id === "hpp-stock-inactive"));
      assert.equal(page.stocks.find(row => row.id === "hpp-stock-future")?.expirationDate?.toISOString(), "2099-01-31T12:34:56.789Z");
      assert.equal(page.stocks.find(row => row.id === "hpp-stock-null")?.quantity, 5.125);
      assert.equal(page.transfers[0].originWarehouse.name, "Estoque B");
      assert.equal(page.transfers[0].destinationWarehouse.name, "Estoque A");
      assert.equal(page.receipts[0].donorName, "Doadora nominal");
      assert.equal(page.receipts[0].items[0].manufacturerName, "Fabricante nominal");
      assert.equal(page.receipts[0].items[0].expirationDate?.toISOString(), "2099-01-31T12:34:56.789Z");
      assert.deepEqual(page.approvalPolicies, [{ chave: "HEALTH_STOCK_RECEIPT_APPROVAL:hpp-w1", valor: { approvalRequired: true } }]);
      assert.equal((await stock([])).total, 0);
      assert.ok((await stock(undefined)).stocks.some(row => row.id === "hpp-stock-other"));
      assert.ok(!(await stock(undefined)).stocks.some(row => row.id === "hpp-stock-generic"));
      assert.deepEqual((await stock(["hpp-u1"], "futuro", "Estoque A")).stocks.map(row => row.id), ["hpp-stock-future"]);
      assert.equal((await stock(["hpp-u1"], "' OR true --")).total, 0);
    });
    await suite.test("catalog and invoice client DTOs retain classifications, active materials, conversion floats and supplier identity", async () => {
      const catalog = await readPharmacyCatalogPage(db, { q: "catmat-hpp", list: "RENAME" });
      assert.equal(catalog.total, 1); assert.equal(catalog.page, 1);
      assert.equal(catalog.products[0].id, "hpp-m1");
      assert.equal(catalog.products[0].healthProfile.stockUnitsPerSupply, 2.125);
      assert.equal(catalog.products[0].healthProfile.dcbSubstance?.casNumber, "123-45-6");
      assert.equal(catalog.products[0].healthProfile.catmatUnitMappings[0].localUnitsPerOfficial, 2.125);
      assert.deepEqual((await readPharmacyCatalogPage(db, { q: "", list: "REMUME" })).products.map(row => row.id), ["hpp-m2"]);
      const invoice = await readPharmacyInvoicesPage(db, ["hpp-u1"]);
      assert.deepEqual(invoice.warehouses, [{ id: "hpp-w1", name: "Estoque A" }]);
      assert.deepEqual(invoice.products.map(row => ({ id: row.id, name: row.name, unit: row.unitOfMeasure })), [{ id: "hpp-m2", name: "Correlato B", unit: "UN" }, { id: "hpp-m1", name: "Medicamento A", unit: "UN" }]);
      assert.equal(invoice.suppliers[0].company?.cnpj, "11222333000181");
    });
    await suite.test("dispensations insensitive barcode without added wildcards, active sums, -03 bounds, history dates and receiver search", async () => {
      const page = await readPharmacyDispensationsPage(db, ["hpp-u1"], { barcode: " receita_% ", status: "ALL", receiverQ: " Retirante " }, { from: new Date("2026-01-31T00:00:00-03:00"), to: new Date("2026-02-01T00:00:00-03:00") });
      assert.equal(page.patientId, "hpp-p1"); assert.equal(page.prescriptions[0].date.toISOString(), "2026-01-31T12:34:56.789Z");
      assert.deepEqual(page.prescriptions[0].items[0].dispensations, [{ quantity: 1.125 }]);
      assert.equal(page.total, 2); assert.deepEqual(page.dispensations.map(row => row.id), ["hpp-d1", "hpp-cancelled"]);
      assert.equal(page.dispensations[0].date.toISOString(), "2026-01-31T12:34:56.789Z");
      assert.equal(page.dispensations[0].receiverPerson, null); assert.equal(page.dispensations[0].kitDeliveryItem, null);
      assert.deepEqual(page.dispensations[0].events.map(row => row.id), ["hpp-de1", "hpp-de0"]);
      assert.equal(page.dispensations[1].cancelledAt?.toISOString(), "2026-02-02T00:00:00.000Z");
      assert.deepEqual(page.people, [{ id: "hpp-receiver", fullName: "Retirante Farmácia" }]);
      const oracle = await db.execute<{ id: string }>(sql`SELECT s.id FROM "MaterialStock" s JOIN "Warehouse" w ON w.id=s."warehouseId" JOIN "Material" m ON m.id=s."materialId" WHERE s.quantity>0 AND s."blockedAt" IS NULL AND (s."expirationDate" IS NULL OR s."expirationDate">=CURRENT_TIMESTAMP) AND w."isActive" AND w."healthUnitId"='hpp-u1' AND EXISTS (SELECT 1 FROM "Medicine" md WHERE md."materialId"=m.id AND md."isActive") ORDER BY m.name ASC,s."expirationDate" ASC NULLS LAST LIMIT 1000`);
      assert.deepEqual(page.stocks.map(row => row.id), oracle.rows.map(row => row.id));
      assert.equal((await readPharmacyDispensationsPage(db, [], {}, {})).total, 0);
      assert.equal((await readPharmacyDispensationsPage(db, ["hpp-u1"], { barcode: "receita_" }, {})).prescriptions.length, 0);
      assert.equal((await readPharmacyDispensationsPage(db, ["hpp-u1"], { barcode: "receita%" }, {})).prescriptions[0]?.id, "hpp-rx1");
      assert.equal((await readPharmacyDispensationsPage(db, ["hpp-u1"], { receiverQ: "   " }, {})).people.length, 4);
    });
    await suite.test("judicial units, active-only delivered totals, independent lawyer/person and document DTOs", async () => {
      const page = await readPharmacyJudicialPage(db, ["hpp-u1"], { q: "HPP-2026", person: "Advogada" });
      assert.equal(page.total, 1); const current = page.cases[0];
      assert.equal(current.patient.person.fullName, "Ana Farmácia"); assert.equal(current.lawyer.person.fullName, "Advogada Farmácia");
      assert.equal(current.openedAt.toISOString(), "2026-01-31T12:34:56.789Z");
      assert.deepEqual(current.items[0].dispensations, [{ quantity: 1.125 }]);
      assert.equal(current.documents[0].document.title, "Documento judicial");
      assert.equal(current.process, null); assert.equal(current.purchaseRequest, null);
      assert.deepEqual(page.professionals.map(row => row.id), ["hpp-professional"]);
      assert.equal((await readPharmacyJudicialPage(db, [], {})).total, 0);
      assert.equal((await readPharmacyJudicialPage(db, undefined, {})).total, 2);
    });
    await suite.test("kit composition/client contract, untouched JSON, nullable stock/dispensation and original inactive-warehouse eligibility", async () => {
      const page = await readPharmacyKitsPage(db, ["hpp-u1"], { deliveryId: "hpp-kit-delivery", receiver: "Retirante" });
      assert.equal(page.total, 1); assert.equal(page.kits[0].items[0].quantity, 1.125);
      const delivery = page.deliveries[0]; assert.deepEqual(delivery.criteria, { nullable: null, dose: "1.125" });
      assert.deepEqual(delivery.sourceSnapshot, { original: [null, "001.00", true] });
      assert.equal(delivery.items[0].stock?.batchNumber, "FUTURO"); assert.equal(delivery.items[0].dispensation, null);
      assert.equal(page.enrollments[0].startsAt.toISOString(), "2026-01-31T12:34:56.789Z"); assert.equal(page.enrollments[0].endsAt, null);
      assert.ok(page.stocks.some(row => row.id === "hpp-stock-inactive"));
      assert.ok(!page.stocks.some(row => row.id === "hpp-stock-expired"));
      assert.equal((await readPharmacyKitsPage(db, [], {})).total, 0);
      assert.equal((await readPharmacyKitsPage(db, undefined, {})).total, 3);
    });
    await suite.test("requests relation EXISTS filters, same material transfer linkage, fulfillment Decimal/Float and original professional access", async () => {
      const page = await readPharmacyRequestsPage(db, ["hpp-u1"], { q: "medicamento", materialId: "hpp-m1" });
      assert.equal(page.total, 2);
      const request = page.requests.find(row => row.id === "hpp-request"); assert.ok(request);
      const item = request.items[0]; assert.equal(item.material.medicine?.id, "hpp-medicine");
      assert.equal(item.fulfillments[0].movement.stock?.batchNumber, "FUTURO");
      assert.equal(item.fulfillments[0].movement.unitValueDecimal?.toFixed(6), "999999999999.123456");
      assert.equal(item.fulfillments[0].movement.totalValueDecimal?.toFixed(2), "1124999999999.01");
      assert.equal(item.requestedQuantity, 5.125); assert.equal(item.fulfilledQuantity, 1.125);
      const warehouse = page.requests.find(row => row.id === "hpp-warehouse-request"); assert.ok(warehouse);
      assert.equal(warehouse.patient, null); assert.equal(warehouse.items[0].transfers[0].quantity, 2.125);
      assert.equal(warehouse.items[0].transfers[0].transfer.originWarehouse.name, "Estoque B");
      assert.ok(page.professionals.some(row => row.id === "hpp-inactive-professional"));
      assert.equal((await readPharmacyRequestsPage(db, [], {})).total, 0);
      assert.equal((await readPharmacyRequestsPage(db, ["hpp-u1"], { type: "WAREHOUSE" })).total, 1);
      assert.equal((await readPharmacyRequestsPage(db, ["hpp-u1"], { type: "PATIENT" })).total, 1);
    });
    await suite.test("inventory counts, uncounted NULL and creator/approver identities; panels preserve original unit OR unrestricted access", async () => {
      const inventory = await readPharmacyInventoryPage(db, ["hpp-u1"], {});
      assert.equal(inventory.total, 1); assert.equal(inventory.sessions[0].createdByUsuario.nome, "Farmacêutico"); assert.equal(inventory.sessions[0].approvedByUsuario, null);
      assert.equal(inventory.sessions[0].items[0].expectedQuantity, 8.25); assert.equal(inventory.sessions[0].items[0].countedQuantity, null);
      assert.equal(inventory.sessions[0].items[0].adjustmentMovement, null);
      assert.equal((await readPharmacyInventoryPage(db, [], {})).total, 0);
      const calls = await readPharmacyCallsPage(db, ["hpp-u1"], "ana");
      assert.deepEqual(calls.panels.map(row => row.id), ["hpp-panel1"]);
      assert.deepEqual(calls.calls.map(row => row.id), ["hpp-call1"]);
      assert.deepEqual(calls.requests.map(row => row.id), ["hpp-request"]);
      assert.equal((await readPharmacyCallsPage(db, [], "")).panels.length, 0);
      assert.equal((await readPharmacyCallsPage(db, undefined, "")).panels.length, 2);
      assert.ok((await readPharmacyCallsPage(db, undefined, "")).requests.some(row => row.id === "hpp-generic-request"));
    });
    await suite.test("every page accepts original read-only tx executor, sees uncommitted data and never opens another connection", async () => {
      const sentinel = new Error("hpp rollback proof");
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await tx.execute(sql`INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"updatedAt") VALUES ('hpp-uncommitted','hpp-w1','hpp-m1','TX-ONLY',1,CURRENT_TIMESTAMP)`);
        const page = await readPharmacyStockPage(tx, ["hpp-u1"], { q: "TX-ONLY", filter: "", requestedPage: 1 });
        assert.equal(page.total, 1); throw sentinel;
      }), error => error === sentinel);
      assert.equal((await stock(["hpp-u1"], "TX-ONLY")).total, 0);
      await withDatabaseTransaction(f.connection, async tx => {
        await readPharmacyStockPage(tx, [], { q: "", filter: "", requestedPage: 1 }); await readPharmacyCatalogPage(tx, { q: "", list: "" });
        await readPharmacyInvoicesPage(tx, []); await readPharmacyCallsPage(tx, [], ""); await readPharmacyInventoryPage(tx, [], {});
        await readPharmacyDispensationsPage(tx, [], {}, {}); await readPharmacyJudicialPage(tx, [], {}); await readPharmacyKitsPage(tx, [], {}); await readPharmacyRequestsPage(tx, [], {});
      }, { accessMode: "read only" });
    });
    await suite.test("pagination clamps by filtered count and preserves 20/500/1000/200/50 caps", async () => {
      await db.execute(sql`INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"updatedAt") SELECT 'hpp-cap-'||g,'hpp-w1','hpp-m1','CAP-'||g,1,CURRENT_TIMESTAMP FROM generate_series(1,1050) g`);
      await db.execute(sql`INSERT INTO "Person" (id,"fullName","updatedAt") SELECT 'hpp-cap-person-'||g,'Cap Patient '||lpad(g::text,4,'0'),CURRENT_TIMESTAMP FROM generate_series(1,550) g`);
      await db.execute(sql`INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") SELECT 'hpp-cap-patient-'||g,'hpp-cap-person-'||g,'hpp-u1',CURRENT_TIMESTAMP FROM generate_series(1,550) g`);
      const page = await stock(["hpp-u1"], "CAP-", "", 999999);
      assert.equal(page.total, 1050); assert.equal(page.page, 53); assert.equal(page.stocks.length, 10);
      assert.equal(page.stockOptions.length, 500); assert.equal(page.patients.length, 500);
      const history = await readPharmacyDispensationsPage(db, ["hpp-u1"], { receiverQ: "Cap Patient" }, {});
      assert.equal(history.stocks.length, 1000); assert.equal(history.patients.length, 200); assert.equal(history.people.length, 50);
      const empty = await stock(["hpp-u1"], "nothing", "", 999); assert.equal(empty.page, 1); assert.equal(empty.total, 0);
    });
  } finally { await f.close(); }
});
