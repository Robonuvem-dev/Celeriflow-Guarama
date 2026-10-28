import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createSstDrizzleFixture } from "./helpers/sst-drizzle-fixture";
import { sstTestContext } from "./helpers/sst-drizzle-context";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { equipmentInput, deliveryInput, equipmentEventInput, equipmentUsageDays, weightedEquipmentAverage, equipmentBiometricIntegration } from "../src/lib/sst/equipment-policy";
import { registerEquipmentDelivery, registerEquipmentEvent } from "../src/lib/sst/equipment-service";
import { listEquipmentDeliveries, equipmentUsageReport, equipmentRequirementsReport } from "../src/lib/sst/equipment-queries";

test("equipment validates CA, duration, duplicate collective recipients and genuine pending biometrics",()=>{
  const equipment={budgetUnitId:"ug",materialId:"mat",kind:"EPI",ca:"",caValidUntil:null,validityDays:90,reviewDays:30,supplierId:null,submissionKey:randomUUID()};
  assert.equal(equipmentInput.safeParse(equipment).success,false);
  assert.equal(equipmentInput.safeParse({...equipment,ca:"123"}).success,true);
  assert.equal(equipmentInput.safeParse({...equipment,kind:"EPC",reviewDays:0}).success,false);
  assert.equal(deliveryInput.safeParse({budgetUnitId:"ug",equipmentId:"eq",employeeIds:["a","a"],quantity:1,deliveredAt:"2020-01-01",warehouseId:null,submissionKey:randomUUID()}).success,false);
  assert.equal(equipmentEventInput.safeParse({itemIds:["i"],kind:"REVIEW",quantity:1,occurredAt:"2020-01-01",nextReviewAt:null,responsiblePersonId:"p",notes:"Revisão",submissionKey:randomUUID()}).success,false);
  assert.equal(equipmentBiometricIntegration.status,"INTEGRATION_PENDING");
  assert.equal(weightedEquipmentAverage([{days:10,quantity:1},{days:40,quantity:3}]),32.5);
  assert.equal(weightedEquipmentAverage([]),null);
  assert.throws(()=>equipmentUsageDays(new Date("2020-02-01"),new Date("2020-01-01")),/anterior/);
});

async function fixture() {
  const local=await createSstDrizzleFixture(["BudgetUnit","Material","Supplier","Employee","Person","Role","Department","Warehouse","CostCenter","MaterialStock","MaterialMovement","InventorySession","ConfiguracaoModulo","AuditEvent","AccountingPlan","Usuario"]),db=local.database;
  try {
    await db.exec(`CREATE TABLE "SstProgramExposureGroup" (id text primary key); CREATE TABLE "GovernmentEntity" (id text primary key);
    ALTER TABLE "Warehouse" ADD "cityId" TEXT, ADD "neighborhoodId" TEXT, ADD "streetId" TEXT;
    ALTER TABLE "CostCenter" ADD "governmentEntityId" TEXT, ADD "parentId" TEXT, ADD "secretariatId" TEXT, ADD "departmentId" TEXT, ADD "administrativeUnitId" TEXT;
    ALTER TABLE "MaterialMovement" ADD "quantityDecimal" numeric(18,6), ADD "unitValueDecimal" numeric(18,6), ADD "totalValueDecimal" numeric(18,2);
    INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','UG','s',now());
    INSERT INTO "Material" (id,name,code,"categoryId","updatedAt") VALUES ('mat','Luva','001','category',now());
    INSERT INTO "Role" (id,name,"updatedAt") VALUES ('role','Técnico',now());
    INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('dep','Oficina','s',now());
    INSERT INTO "Employee" (id,name,registration,"secretariatId","departmentId","roleId","updatedAt") VALUES ('a','a','a','s','dep','role',now()),('b','b','b','s','dep','role',now());
    INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('p','Responsável',now());
    INSERT INTO "CostCenter" (id,code,name,"secretariatId","updatedAt") VALUES ('center','CENTER','Oficina','s',now());
    INSERT INTO "Warehouse" (id,name,"costCenterId","updatedAt") VALUES ('w','Depósito','center',now());
    INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","updatedAt") VALUES ('stock','w','mat','L',3,2,now());`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010120000_add_stock_return_reversal/migration.sql","utf8"));
    await db.exec(readFileSync("prisma/migrations-ibema/20261014160000_stock_valuation/migration.sql","utf8"));
    await db.exec(readFileSync("prisma/migrations-ibema/20261010170000_add_sst_exposure_groups/migration.sql","utf8"));
    await db.exec(`INSERT INTO "SstExposureGroup" (id,"budgetUnitId",code,name,"departmentIds","roleIds","startsAt","createdById","updatedAt") VALUES ('g','ug','GHE1','Grupo',ARRAY['dep'],ARRAY['role'],'2000-01-01','user',now())`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011020000_add_sst_equipment/migration.sql","utf8"));
    await db.exec(`INSERT INTO "SstEquipment" (id,"budgetUnitId","materialId",kind,ca,"validityDays","reviewDays","createdById","submissionKey","requestHash") VALUES ('eq','ug','mat','EPI','CA123',90,30,'user','catalog-key','hash');
    INSERT INTO "SstEquipmentPolicy" ("budgetUnitId","integrateStock","updatedById") VALUES ('ug',true,'user');`);
    const user:AppContext["user"]={id:"user",firebaseUid:"user",email:"test@example.invalid",name:"SST",role:"SST",profileCode:"OPERATOR",modulePermissions:[],allowedBudgetUnitIds:["ug"],employeeId:null,departmentId:null,secretariatId:null,permissions:JSON.stringify({modules:{SST:{blocked:false,create:true},PATRIMONIO:{blocked:false,create:true}}})};
    const context=sstTestContext(local.connection.db,user);
    const raw={budgetUnitId:"ug",equipmentId:"eq",employeeIds:["a","b"],quantity:1,deliveredAt:"2020-01-01T12:00:00Z",warehouseId:"w",batchNumber:"L",submissionKey:randomUUID()};
    return {db,context,raw,close:local.close};
  } catch (error) { await local.close(); throw error; }
}

test("collective delivery is atomic, idempotent, permission-scoped and rolls stock back on partial shortage",async()=>{
  const f=await fixture();
  try {
    await assert.rejects(registerEquipmentDelivery(f.context,{...f.raw,quantity:2}),/insuficiente/);
    assert.deepEqual((await f.db.query('SELECT quantity FROM "MaterialStock"')).rows,[{quantity:3}]);
    assert.equal((await f.db.query('SELECT id FROM "SstEquipmentDelivery"')).rows.length,0);
    assert.equal((await f.db.query('SELECT id FROM "MaterialMovement"')).rows.length,0);
    await f.db.exec(`INSERT INTO "InventorySession" (id,"warehouseId","createdByUsuarioId","updatedAt") VALUES ('inv','w','user',now())`); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/inventário/); await f.db.exec('DELETE FROM "InventorySession"');
    await f.db.exec(`UPDATE "CostCenter" SET "secretariatId"='other'`); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/Depósito/); await f.db.exec(`UPDATE "CostCenter" SET "secretariatId"='s'`);
    await f.db.exec(`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ambiguous','AMB','Outra UG','s',now())`); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/múltiplas UGs/); await f.db.exec(`DELETE FROM "BudgetUnit" WHERE id='ambiguous'`);
    await f.db.exec(`UPDATE "MaterialStock" SET "blockedAt"=CURRENT_TIMESTAMP`); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/bloqueado/); await f.db.exec(`UPDATE "MaterialStock" SET "blockedAt"=NULL`);
    await f.db.exec(`UPDATE "MaterialStock" SET "expirationDate"='2000-01-01'`); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/vencido/); await f.db.exec(`UPDATE "MaterialStock" SET "expirationDate"=NULL`);
    f.context.user.permissions=JSON.stringify({modules:{SST:{blocked:false,create:true},PATRIMONIO:{blocked:false,create:false}}}); await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/PATRIMONIO/);
    f.context.user.permissions=JSON.stringify({modules:{SST:{blocked:false,create:true},PATRIMONIO:{blocked:false,create:true}}});
    const id=await registerEquipmentDelivery(f.context,f.raw); assert.equal(await registerEquipmentDelivery(f.context,f.raw),id);
    assert.deepEqual((await f.db.query('SELECT quantity FROM "MaterialStock"')).rows,[{quantity:1}]);
    assert.equal((await f.db.query('SELECT id FROM "MaterialMovement"')).rows.length,2);
    await assert.rejects(registerEquipmentDelivery(f.context,{...f.raw,quantity:3}),/outros dados/);
    await assert.rejects(registerEquipmentDelivery(f.context,{...f.raw,budgetUnitId:"other"}),/Unidade Gestora/);
    await assert.rejects(f.db.exec(`UPDATE "SstEquipmentDelivery" SET "biometricStatus"='ACCEPTED'`),/immutable/);
  } finally {await f.close();}
});

test("collective reviews and partial usage write-offs are idempotent, bounded and never return stock",async()=>{
  const f=await fixture();
  try {
    await registerEquipmentDelivery(f.context,f.raw);
    const items=(await f.db.query<{id:string}>(`SELECT id FROM "SstEquipmentDeliveryItem" ORDER BY id`)).rows.map(r=>r.id);
    const review={itemIds:items,kind:"REVIEW",quantity:1,occurredAt:"2020-02-01",nextReviewAt:"2020-03-01",responsiblePersonId:"p",notes:"Revisão de equipamentos",submissionKey:randomUUID()};
    await registerEquipmentEvent(f.context,review); await registerEquipmentEvent(f.context,review);
    assert.equal((await f.db.query('SELECT id FROM "SstEquipmentEvent"')).rows.length,2);
    const writeOff={...review,kind:"WRITE_OFF",quantity:0.5,nextReviewAt:null,occurredAt:"2020-02-02",submissionKey:randomUUID()};
    await registerEquipmentEvent(f.context,writeOff); await registerEquipmentEvent(f.context,writeOff);
    assert.deepEqual((await f.db.query('SELECT "writtenOffQuantity" FROM "SstEquipmentDeliveryItem"')).rows,[{writtenOffQuantity:0.5},{writtenOffQuantity:0.5}]);
    await assert.rejects(registerEquipmentEvent(f.context,{...writeOff,quantity:1,occurredAt:"2020-02-03",submissionKey:randomUUID()}),/saldo em uso/);
    await assert.rejects(registerEquipmentEvent(f.context,{...writeOff,occurredAt:"2019-01-01",submissionKey:randomUUID()}),/anterior/);
    assert.deepEqual((await f.db.query('SELECT quantity FROM "MaterialStock"')).rows,[{quantity:1}]);
    assert.equal((await f.db.query('SELECT id FROM "MaterialMovement"')).rows.length,2);
    await assert.rejects(f.db.exec(`UPDATE "SstEquipmentDeliveryItem" SET snapshot='{}'`),/immutable/);
    await assert.rejects(f.db.exec(`DELETE FROM "SstEquipmentEvent"`),/immutable/);
    await assert.rejects(f.db.exec(`DELETE FROM "Material" WHERE id='mat'`),/foreign key/);
  }finally{await f.close();}
});

test("individual delivery honors the disabled stock policy without claiming an inventory movement",async()=>{
  const f=await fixture();
  try {
    await f.db.exec(`UPDATE "SstEquipmentPolicy" SET "integrateStock"=false`);
    f.context.user.permissions=JSON.stringify({modules:{SST:{blocked:false,create:true},PATRIMONIO:{blocked:false,create:false}}});
    const raw={...f.raw,employeeIds:["a"],warehouseId:null};
    const id=await registerEquipmentDelivery(f.context,raw); assert.equal(await registerEquipmentDelivery(f.context,raw),id);
    assert.equal((await f.db.query('SELECT id FROM "SstEquipmentDeliveryItem"')).rows.length,1);
    assert.deepEqual((await f.db.query('SELECT quantity FROM "MaterialStock"')).rows,[{quantity:3}]);
    assert.equal((await f.db.query('SELECT id FROM "MaterialMovement"')).rows.length,0);
    await assert.rejects(registerEquipmentDelivery(f.context,{...raw,employeeIds:["outside"],submissionKey:randomUUID()}),/outra secretaria/);
  }finally{await f.close();}
});

test("server reports page 20 stable rows, calculate weighted durations and match PGR by canonical equipment",async()=>{
  const f=await fixture();
  try {
    await registerEquipmentDelivery(f.context,f.raw);
    const items=(await f.db.query<{id:string}>(`SELECT id FROM "SstEquipmentDeliveryItem" ORDER BY id`)).rows.map(r=>r.id);
    await registerEquipmentEvent(f.context,{itemIds:items,kind:"WRITE_OFF",quantity:0.5,occurredAt:"2020-01-11T12:00:00Z",nextReviewAt:null,responsiblePersonId:"p",notes:"Desgaste",submissionKey:randomUUID()});
    const report=await equipmentUsageReport(f.context,{});
    assert.equal(report.records.length,2); assert.equal(report.summary.length,1); assert.equal(report.summary[0].quantity,1);
    assert.equal(report.records[0].writeOffs[0].quantity,0.5); assert.match(report.records[0].writeOffs[0].date,/2020-01-11/);
    assert.ok(Math.abs(report.summary[0].averageDays!-10)<0.01);
    await f.db.exec(`CREATE TABLE "SstOccupationalProgram" (id text primary key,"budgetUnitId" text,kind text,code text,version int,"startsAt" timestamp,"endsAt" timestamp);
      ALTER TABLE "SstProgramExposureGroup" ADD "programId" text; ALTER TABLE "SstProgramExposureGroup" ADD "groupSnapshot" jsonb; ALTER TABLE "SstProgramExposureGroup" ADD risks jsonb;
      INSERT INTO "SstOccupationalProgram" VALUES ('pgr','ug','PGR','PGR',1,'2000-01-01','2099-01-01');
      INSERT INTO "SstProgramExposureGroup" VALUES ('pg','pgr','{"name":"Oficina","departmentIds":["dep"],"roleIds":["role"]}','[{"epiApplicable":true,"epis":["Luva"]}]');
      INSERT INTO "SstEquipmentRequirement" (id,"programGroupId",recommendation,"equipmentId",quantity,"createdById") VALUES ('req','pg','Luva','eq',2,'user');
      INSERT INTO "SstEquipmentDelivery" (id,"budgetUnitId","deliveredAt","integratedStock",location,notes,"createdById","submissionKey","requestHash") SELECT 'extra-'||n,'ug','2020-01-01',false,'','','user','key-'||n,'hash' FROM generate_series(1,43) n;
      INSERT INTO "SstEquipmentDeliveryItem" (id,"deliveryId","equipmentId","employeeId",quantity,"expiresAt","nextReviewAt",snapshot) SELECT 'extra-item-'||n,'extra-'||n,'eq','a',1,'2099-01-01','2099-01-01','{"employee":"a","equipment":"Luva","role":"Técnico","department":"Oficina","costCenter":"Oficina","ghe":["GHE1"]}' FROM generate_series(1,43) n;`);
    const first=await listEquipmentDeliveries(f.context,{page:"1"}); const second=await listEquipmentDeliveries(f.context,{page:"2"}); const last=await listEquipmentDeliveries(f.context,{page:"999"});
    assert.equal(first.total,45); assert.equal(first.records.length,20); assert.equal(second.records.length,20); assert.equal(last.page,3); assert.equal(last.records.length,5);
    assert.equal(new Set([...first.records,...second.records,...last.records].map(r=>r.id)).size,45);
    const needs=await equipmentRequirementsReport(f.context,{});
    assert.equal(needs.total,2); assert.equal(needs.records.find(r=>r.employee==="a")?.inUse,43); assert.equal(needs.records.find(r=>r.employee==="a")?.pending,0);
    assert.equal(needs.records.find(r=>r.employee==="b")?.pending,2);
    await f.db.exec(`UPDATE "SstProgramExposureGroup" SET risks='[{"epiApplicable":true,"epis":["Luva parecida"]}]'`);
    const unmapped=await equipmentRequirementsReport(f.context,{}); assert.equal(unmapped.records[0].required,null); assert.equal(unmapped.records[0].pending,null); assert.equal(unmapped.records[0].inUse,0);
    await assert.rejects(listEquipmentDeliveries(f.context,{budgetUnitId:"other"}),/Unidade Gestora/);
  } finally {await f.close();}
});
