import "./load-local-environment";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { getCeleriFlowInstanceId } from "../src/lib/platform/instance";
import assert from "node:assert/strict";
import { readPublishedPayrollPage } from "../src/db/repositories/personnel-pages/workforce";
import { populationContext } from "./lib/population-context";

async function main() {
  const db = databaseConnection.db;
  if (process.argv.includes('--verify')) {
    const counts = (await db.execute<{total:number;valid:number;distinct_numbers:number;mismatches:number}>(sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE e.registration ~ '^[0-9]{13}$')::int AS valid,count(DISTINCT e.registration)::int AS distinct_numbers,count(*) FILTER(WHERE a.registration IS DISTINCT FROM e.registration OR a.day IS DISTINCT FROM (e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date)::int AS mismatches FROM "Employee" e LEFT JOIN "EmployeeRegistrationAllocation" a ON a."employeeId"=e.id`)).rows[0];
    assert.equal(counts.valid,counts.total);assert.equal(counts.distinct_numbers,counts.total);assert.equal(counts.mismatches,0);
    const context=await populationContext();
    const publication=await readPublishedPayrollPage(db,context.user,'1');
    for(const statement of publication.statements) assert.match(statement.contract.employee.registration || '',/^\d{13}$/);
    const samples=(await db.execute(sql`SELECT e.name,a."previousRegistration",e.registration,to_char(a.day,'DD/MM/YYYY') AS registration_date FROM "Employee" e JOIN "EmployeeRegistrationAllocation" a ON a."employeeId"=e.id WHERE e.name IN ('Paulo Silva','Thiago Morcatty','Bruna Almeida') ORDER BY e.name`)).rows;
    console.log(JSON.stringify({result:'PASS',instance:getCeleriFlowInstanceId(),...counts,publicationRowsVerified:publication.statements.length,publicationTotal:publication.total,samples},null,2));
    return;
  }
  const employees = (await db.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE registration ~ '^[0-9]{13}$')::int AS formatted, count(DISTINCT registration)::int AS distinct_registrations, min("createdAt") AS first_created, max("createdAt") AS last_created FROM "Employee"`)).rows;
  const contracts = (await db.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE c.registration IS DISTINCT FROM e.registration)::int AS different_from_employee FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId"`)).rows;
  const multiple = (await db.execute(sql`SELECT count(*)::int AS employees_with_multiple_contracts FROM (SELECT "employeeId" FROM "HrEmploymentContract" GROUP BY "employeeId" HAVING count(*)>1) x`)).rows;
  const samples = (await db.execute(sql`SELECT e.name,e.registration,e."createdAt",c.registration AS contract_registration FROM "Employee" e LEFT JOIN "HrEmploymentContract" c ON c."employeeId"=e.id WHERE e.name IN ('Paulo Silva','Thiago Morcatty','Bruna Almeida') ORDER BY e.name`)).rows;
  const triggers = (await db.execute(sql`SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition,pg_get_functiondef(t.tgfoid) AS function_definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('Employee','HrEmploymentContract') AND NOT t.tgisinternal`)).rows;
  const references = (await db.execute(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%registration%' OR column_name ILIKE '%matricula%') ORDER BY table_name,column_name`)).rows;
  console.log(JSON.stringify({ instance:getCeleriFlowInstanceId(), employees, contracts, multiple, samples, triggers, references },null,2));
}
main().catch(()=>{console.error('Falha ao inspecionar matrículas.');process.exitCode=1;}).finally(()=>databaseConnection.pool.end());
