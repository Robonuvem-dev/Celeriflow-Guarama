import "./load-local-environment";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getCeleriFlowInstanceId } from "../src/lib/platform/instance";
import { populationContext } from "./lib/population-context";
import { permissions } from "../src/lib/rh/esocial/contract";

async function main(){
 const context=await populationContext(),db=databaseConnection.db,tenant=getCeleriFlowInstanceId();
 const [unit]=(await db.execute<{id:string;name:string}>(sql`SELECT id,name FROM "BudgetUnit" WHERE id='aurora-system-v1:budget-unit:000'`)).rows;assert.ok(unit);
 const matches=(await db.execute(sql`SELECT id,name,registration FROM "Employee" WHERE registration IN ('VA-0001','VA-0002','VA-0003','VA-0004')`)).rows;
 if(!process.argv.includes('--apply')){const tables=(await db.execute(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'HrEsocialDemo%' ORDER BY table_name,ordinal_position`)).rows;console.log(JSON.stringify({mode:'PREVIEW',tenant,unit,existingSources:matches,actorId:context.user.id,tables},null,2));return;}
 await withDatabaseTransaction(databaseConnection,async tx=>{
  await tx.execute(sql`INSERT INTO "HrEsocialDemoEnvironment"("tenantId","employerId",mode,enabled,"createdById") VALUES(${tenant},${unit.id},'DEMO',true,${context.user.id}) ON CONFLICT DO NOTHING`);
  for(const permission of permissions)await tx.execute(sql`INSERT INTO "HrEsocialDemoGrant"("tenantId","employerId","userId",permission,"grantedById") VALUES(${tenant},${unit.id},${context.user.id},${permission},${context.user.id}) ON CONFLICT DO NOTHING`);
 });
 console.log(JSON.stringify({result:'PASS',tenant,employerId:unit.id,adminId:context.user.id,mode:'DEMO',officialTransport:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>databaseConnection.pool.end());
