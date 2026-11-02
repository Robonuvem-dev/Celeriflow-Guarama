import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { buildHrReport, renderHrReport } from "../src/lib/rh/report-service";
test("cadastro geral inclui inativos sem contrato e relatórios locais preservam vários locais", async () => {
 const pg = new PGlite();
 try {
  await pg.exec(`CREATE TABLE "Employee" (id text,name text,cpf text,registration text,email text,phone text,"isActive" boolean,"departmentId" text,"roleId" text);
  CREATE TABLE "Department" (id text,name text); CREATE TABLE "Role" (id text,name text);
   CREATE TABLE "HrEmploymentContract" (id text,"employeeId" text,status text,"workLocation" text);
   CREATE TABLE "HrEmploymentRevision" (id text,"contractId" text,"effectiveFrom" timestamp,version int,snapshot jsonb);
   CREATE TABLE "HrReferenceRecord" (id text,kind text,code text,details jsonb); CREATE TABLE "BudgetAppropriation" (id text,code text);
  INSERT INTO "Department" VALUES ('d','Educação'); INSERT INTO "Role" VALUES ('r','Docente');
  INSERT INTO "Employee" VALUES ('a','Ana','123','001',NULL,NULL,true,'d','r'),('b','Bia','456','002',NULL,NULL,false,NULL,NULL);
   INSERT INTO "HrEmploymentContract" VALUES ('c1','a','ATIVO','Escola A'),('c2','a','ATIVO','Escola B');
   INSERT INTO "HrEmploymentRevision" VALUES ('v1','c1','2026-01-01',1,'{"registration":"001-A","roleId":"r","departmentId":"d","workLocation":"Escola A","salary":"1000.00","monthlyHours":100,"status":"ATIVO"}'),
     ('v2','c2','2026-01-01',1,'{"registration":"001-B","roleId":"r","departmentId":"d","workLocation":"Escola B","salary":"1500.00","monthlyHours":100,"status":"ATIVO"}'),
     ('v3','c1','2026-11-01',2,'{"registration":"001-A","roleId":"r","departmentId":"d","workLocation":"Escola Nova","salary":"2000.00","monthlyHours":150,"status":"ATIVO"}');`);
  const db = drizzle(pg) as unknown as DatabaseExecutor;
  const general = await buildHrReport(db,{kind:"CADASTRO_GERAL",format:"CSV",q:""});
   assert.equal(general.rows.length,2); assert.match(general.rows[1][general.headers.indexOf("Situação contratual")],/INATIVO/);
   const local = await buildHrReport(db,{kind:"CADASTRO_LOCAL",format:"CSV",q:"Ana",referenceDate:"2026-10-31"});
   assert.equal(local.rows.length,2); assert.deepEqual(local.rows.map(r=>r[local.headers.indexOf("Local histórico")]),["Escola A","Escola B"]);
   assert.equal(local.rows[0][local.headers.indexOf("Salário-base BRL")],"1000.00");
   const november = await buildHrReport(db,{kind:"CADASTRO_LOCAL",format:"CSV",q:"Ana",referenceDate:"2026-11-02"});
   assert.ok(november.rows.some(row => row[november.headers.indexOf("Local histórico")] === "Escola Nova" && row[november.headers.indexOf("Salário-base BRL")] === "2000.00"));
   await pg.exec(`INSERT INTO "BudgetAppropriation" VALUES ('dotacao','2026.001'); INSERT INTO "HrReferenceRecord" VALUES ('vinculo','LOTACAO_ORCAMENTARIA','LEGADO','{"employeeId":"a","appropriationId":"dotacao"}');`);
  const byBudget = await buildHrReport(db,{kind:"CADASTRO_DOTACAO",format:"CSV",q:"Ana"});
   assert.equal(byBudget.rows[0][byBudget.headers.indexOf("Dotação explicitamente vinculada")],"2026.001");
   const historicalBudget = await buildHrReport(db,{kind:"CADASTRO_DOTACAO",format:"CSV",q:"Ana",referenceDate:"2026-10-31"});
   assert.equal(historicalBudget.rows[0][historicalBudget.headers.indexOf("Dotação explicitamente vinculada")],"", "vínculo legado sem data não pode retroagir");
  const csv = await renderHrReport(local,"CSV"); assert.ok(csv.bytes.length>0);
   await assert.rejects(buildHrReport(db,{kind:"CADASTRO_LOCAL",format:"CSV",q:"",competence:"01/2026"}),/data de referência/);
 } finally {await pg.close();}
});

test("análise consignada conserva memória parametrizada e não duplica limite entre vínculos", async () => {
 const margin = { policy: { origin: "MARGEM_CONSIGNAVEL", remunerationRubricCodes: ["SAL"], compulsoryDeductionRubricCodes: [], consignmentRubricCodes: ["EMP"], legalReference: "Lei local" }, rate: "30", remuneration: "1000.00", compulsoryDeductions: "0.00", base: "1000.00", limit: "300.00", used: "100.00", available: "200.00", excess: "0.00", contractIds: ["c1","c2"], memory: [{contractId:"c1",rubricCode:"SAL",purpose:"REMUNERACAO",value:"1000.00"}] };
 const rows = ["c1","c2"].map(contractId => ({ statement: {id:contractId,contractId,runId:"run",snapshot:{consignmentMargin:margin}},registration:contractId,employeeName:"Ana",payroll:{competence:"01/2026",type:"Mensal"},scope:"DEMONSTRACAO" }));
 const chain = { from:()=>chain, innerJoin:()=>chain, where:()=>chain, orderBy:async()=>rows };
 const db = {select:()=>chain} as unknown as DatabaseExecutor;
 const report = await buildHrReport(db,{kind:"MARGEM_CONSIGNAVEL",format:"CSV",q:""});
 assert.equal(report.rows.length,1); assert.equal(report.rows[0][10],"200.00"); assert.match(report.rows[0][13],/SAL\/REMUNERACAO/);
});
