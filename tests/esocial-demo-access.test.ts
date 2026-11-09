import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { assertEsocialAccess } from "../src/lib/rh/esocial/service";
import type { AppContext } from "../src/lib/platform/tenant-context";
test('permissão explícita de envio, unidade e instância são verificadas no servidor',async()=>{
 const fixture=await createLocalDrizzleDatabase();const prior=process.env.CELERIFLOW_INSTANCE_ID;process.env.CELERIFLOW_INSTANCE_ID='test-aurora';
 try{
 await fixture.database.exec(`CREATE TABLE "HrEsocialDemoEnvironment"("tenantId" text,"employerId" text,mode text,enabled boolean);CREATE TABLE "HrEsocialDemoGrant"("tenantId" text,"employerId" text,"userId" text,permission text);INSERT INTO "HrEsocialDemoEnvironment" VALUES('test-aurora','unit','DEMO',true);INSERT INTO "HrEsocialDemoGrant" VALUES('test-aurora','unit','viewer','ESOCIAL_VIEW');`);
 const context:AppContext={database:fixture.connection.db,user:{id:'viewer',firebaseUid:'viewer',email:'viewer@example.test',name:'Auditor',role:'Auditor',profileCode:'AUDITOR',permissions:JSON.stringify({modules:{RH:{blocked:false,showDashboardCard:true,create:false,update:false,delete:false,issueReports:true}}}),modulePermissions:[{code:'RH',canView:true,canEdit:false}],allowedBudgetUnitIds:['unit'],employeeId:null,departmentId:null,secretariatId:null}};
 assert.equal(await assertEsocialAccess(context,'unit','ESOCIAL_VIEW'),'test-aurora');
  await assert.rejects(()=>assertEsocialAccess(context,'unit','ESOCIAL_SEND'),/somente leitura/);
 await assert.rejects(()=>assertEsocialAccess(context,'another','ESOCIAL_VIEW'),/Acesso negado/);
 process.env.CELERIFLOW_INSTANCE_ID='other-tenant';await assert.rejects(()=>assertEsocialAccess(context,'unit','ESOCIAL_VIEW'),/não habilitada/);
  process.env.CELERIFLOW_INSTANCE_ID='test-aurora';await fixture.connection.db.execute(sql`INSERT INTO "HrEsocialDemoGrant" VALUES('test-aurora','unit','viewer','ESOCIAL_SEND')`);
  await assert.rejects(()=>assertEsocialAccess(context,'unit','ESOCIAL_SEND'),/somente leitura/);
  context.user.permissions=JSON.stringify({modules:{RH:{blocked:false,showDashboardCard:true,create:true,update:true,delete:false,issueReports:true}}});context.user.modulePermissions[0].canEdit=true;
  assert.equal(await assertEsocialAccess(context,'unit','ESOCIAL_SEND'),'test-aurora');
 }finally{if(prior===undefined)delete process.env.CELERIFLOW_INSTANCE_ID;else process.env.CELERIFLOW_INSTANCE_ID=prior;await fixture.close();}
});
