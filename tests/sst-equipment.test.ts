import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
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
  const db=new PGlite();
  await db.exec(`CREATE TABLE "BudgetUnit" (id text primary key); CREATE TABLE "Material" (id text primary key,name text,code text,"isActive" boolean); CREATE TABLE "Supplier" (id text primary key); CREATE TABLE "Employee" (id text primary key); CREATE TABLE "Person" (id text primary key); CREATE TABLE "SstProgramExposureGroup" (id text primary key);
    CREATE TABLE "MaterialMovement" (id text primary key,"idempotencyKey" text unique,quantity float8);
    CREATE TABLE "MaterialStock" (id text primary key,"warehouseId" text,"materialId" text,"batchNumber" text,quantity float8,"blockedAt" timestamp,"expirationDate" timestamp,"unitCost" float8);
    INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Material" VALUES ('mat','Luva','001',true); INSERT INTO "Employee" VALUES ('a'),('b'); INSERT INTO "Person" VALUES ('p');
    INSERT INTO "MaterialStock" VALUES ('stock','w','mat','L',3,NULL,NULL,2);`);
  await db.exec(readFileSync("prisma/migrations-ibema/20261011020000_add_sst_equipment/migration.sql","utf8"));
  await db.exec(`INSERT INTO "SstEquipment" (id,"budgetUnitId","materialId",kind,ca,"validityDays","reviewDays","createdById","submissionKey","requestHash") VALUES ('eq','ug','mat','EPI','CA123',90,30,'user','catalog-key','hash');
    INSERT INTO "SstEquipmentPolicy" ("budgetUnitId","integrateStock","updatedById") VALUES ('ug',true,'user');`);
  const state={blockedInventory:false,ambiguousUnit:false,wrongWarehouse:false};
  const user:AppContext["user"]={id:"user",firebaseUid:"user",email:"test@example.invalid",name:"SST",role:"SST",profileCode:"OPERATOR",modulePermissions:[],allowedBudgetUnitIds:["ug"],employeeId:null,departmentId:null,secretariatId:null,permissions:JSON.stringify({modules:{SST:{blocked:false,create:true},PATRIMONIO:{blocked:false,create:true}}})};
  const context={user,prisma:{
    budgetUnit:{findMany:async()=>[{id:"ug",name:"UG",secretariatId:"s"}]},
    $queryRaw:async(strings:TemplateStringsArray|Prisma.Sql,...values:unknown[])=>{const s=Array.isArray(strings)?Prisma.sql(strings as TemplateStringsArray,...values):strings as Prisma.Sql;return (await db.query(s.text,s.values)).rows;},
    $transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>db.transaction(async pg=>{
    function sql(strings:TemplateStringsArray|Prisma.Sql,values:unknown[]) { return Array.isArray(strings)?Prisma.sql(strings as TemplateStringsArray,...values):strings as Prisma.Sql; }
    const tx={
      $executeRaw:async(strings:TemplateStringsArray|Prisma.Sql,...values:unknown[])=>{const s=sql(strings,values); await pg.query(s.text,s.values); return 1;},
      $queryRaw:async(strings:TemplateStringsArray|Prisma.Sql,...values:unknown[])=>{const s=sql(strings,values); return (await pg.query(s.text,s.values)).rows;},
      budgetUnit:{findUniqueOrThrow:async()=>({id:"ug",secretariatId:"s"}),count:async()=>state.ambiguousUnit?2:1},
      configuracaoModulo:{findUnique:async()=>({ativo:true})},
      warehouse:{findUnique:async()=>({id:"w",isActive:true,costCenter:{isActive:true,secretariatId:state.wrongWarehouse?"other":"s",name:"Oficina"}}),findFirst:async()=>({id:"w"})},
      material:{findUnique:async()=>({id:"mat",isActive:true})},
      inventorySession:{findFirst:async()=>state.blockedInventory?{id:"inv"}:null},
      employee:{findMany:async({where}:{where:{id:{in:string[]};secretariatId:string}})=>["a","b"].filter(id=>where.id.in.includes(id)&&where.secretariatId==="s").map(id=>({id,name:id,registration:id,secretariatId:"s",departmentId:"dep",roleId:"role",role:{name:"Técnico"},department:{name:"Oficina"}}))},
      sstExposureGroup:{findMany:async()=>[{code:"GHE1",departmentIds:["dep"],roleIds:["role"]}]},
      person:{findUnique:async()=>({id:"p"})},
      materialStock:{findUnique:async()=>({id:"stock",unitCost:2}),updateMany:async({data,where}:{data:{quantity:{decrement:number}};where:{quantity:{gte:number}}})=>{const result=await pg.query(`UPDATE "MaterialStock" SET quantity=quantity-$1 WHERE id='stock' AND quantity >= $2 RETURNING id`,[data.quantity.decrement,where.quantity.gte]);return {count:result.rows.length};}},
      materialMovement:{create:async({data}:{data:{quantity:number;idempotencyKey:string}})=>{const id=randomUUID();await pg.query(`INSERT INTO "MaterialMovement" VALUES ($1,$2,$3)`,[id,data.idempotencyKey,data.quantity]);return {id};}},
      auditEvent:{create:async()=>({})},
    };
    return callback(tx);
  })}} as unknown as AppContext;
  const raw={budgetUnitId:"ug",equipmentId:"eq",employeeIds:["a","b"],quantity:1,deliveredAt:"2020-01-01T12:00:00Z",warehouseId:"w",batchNumber:"L",submissionKey:randomUUID()};
  return {db,state,context,raw};
}

test("collective delivery is atomic, idempotent, permission-scoped and rolls stock back on partial shortage",async()=>{
  const f=await fixture();
  try {
    await assert.rejects(registerEquipmentDelivery(f.context,{...f.raw,quantity:2}),/insuficiente/);
    assert.deepEqual((await f.db.query('SELECT quantity FROM "MaterialStock"')).rows,[{quantity:3}]);
    assert.equal((await f.db.query('SELECT id FROM "SstEquipmentDelivery"')).rows.length,0);
    assert.equal((await f.db.query('SELECT id FROM "MaterialMovement"')).rows.length,0);
    f.state.blockedInventory=true; await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/inventário/); f.state.blockedInventory=false;
    f.state.wrongWarehouse=true; await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/Depósito/); f.state.wrongWarehouse=false;
    f.state.ambiguousUnit=true; await assert.rejects(registerEquipmentDelivery(f.context,f.raw),/múltiplas UGs/); f.state.ambiguousUnit=false;
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
  } finally {await f.db.close();}
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
  }finally{await f.db.close();}
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
  }finally{await f.db.close();}
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
    await f.db.exec(`ALTER TABLE "BudgetUnit" ADD "secretariatId" text; UPDATE "BudgetUnit" SET "secretariatId"='s';
      ALTER TABLE "Employee" ADD "secretariatId" text; ALTER TABLE "Employee" ADD name text; ALTER TABLE "Employee" ADD "isActive" boolean; ALTER TABLE "Employee" ADD "departmentId" text; ALTER TABLE "Employee" ADD "roleId" text;
      UPDATE "Employee" SET "secretariatId"='s',name=id,"isActive"=true,"departmentId"='dep',"roleId"='role';
      CREATE TABLE "SstOccupationalProgram" (id text primary key,"budgetUnitId" text,kind text,code text,version int,"startsAt" timestamp,"endsAt" timestamp);
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
  } finally {await f.db.close();}
});
