import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { postBenefitEntry, postBenefitPayrollBatch, cancelBenefitCharge } from "../src/lib/sst/benefit-posting";

// Runs the production Prisma SQL statements and migration functions against a
// real isolated PostgreSQL engine; canonical payroll records are never mocked.
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "BudgetUnit"(id TEXT PRIMARY KEY);
    CREATE TABLE "GovernmentEntity"(id TEXT PRIMARY KEY); CREATE TABLE "HrBudgetUnitEntityMapping"("budgetUnitId" TEXT,"governmentEntityId" TEXT);
    CREATE TABLE "Company"(id TEXT PRIMARY KEY); CREATE TABLE "Supplier"(id TEXT PRIMARY KEY,"companyId" TEXT);
    CREATE TABLE "BenefitConfig"(id TEXT PRIMARY KEY,"supplierId" TEXT);
    CREATE TABLE "PayrollBenefit"(id TEXT PRIMARY KEY,"employeeId" TEXT,"benefitConfigId" TEXT);
    CREATE TABLE "Dependent"(id TEXT PRIMARY KEY,"employeeId" TEXT);
    CREATE TABLE "HrPayrollRuleSet"(id TEXT PRIMARY KEY,status TEXT,scope TEXT,"isDemo" BOOLEAN,"approvedAt" TIMESTAMP,"effectiveFrom" TIMESTAMP,"effectiveUntil" TIMESTAMP);
    CREATE TABLE "HrPayrollRubric"(id TEXT PRIMARY KEY,code TEXT,name TEXT,type TEXT,"isActive" BOOLEAN,"calculationMethod" TEXT,"ruleSetId" TEXT REFERENCES "HrPayrollRuleSet"(id));
    CREATE TABLE "HrEmploymentRegime"(id TEXT PRIMARY KEY,"ruleSetId" TEXT,"isActive" BOOLEAN);
    CREATE TABLE "HrCalculationPolicy"(id TEXT PRIMARY KEY,"ruleSetId" TEXT,currency TEXT,"roundingScale" INTEGER,"negativeNetPayPolicy" TEXT);
    CREATE TABLE "HrEmployeeFunctionalPeriod"(id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,"employmentRegimeId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,voided BOOLEAN,"supersedesId" TEXT);
    CREATE TABLE "ConfiguracaoModulo"(codigo TEXT PRIMARY KEY,ativo BOOLEAN);
    CREATE TABLE "Payroll"(id TEXT PRIMARY KEY,competence TEXT,type TEXT,status TEXT,"totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE "PayrollEvent"(id TEXT PRIMARY KEY,code TEXT UNIQUE,name TEXT,type TEXT,formula TEXT,"isActive" BOOLEAN);
    CREATE TABLE "PayrollItem"(id TEXT PRIMARY KEY,"payrollId" TEXT REFERENCES "Payroll"(id) ON DELETE CASCADE,"employeeId" TEXT,"eventId" TEXT REFERENCES "PayrollEvent"(id),value DOUBLE PRECISION NOT NULL,reference TEXT,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP);
    CREATE TABLE "AuditEvent"(id TEXT PRIMARY KEY,"actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO "BudgetUnit" VALUES('ug'); INSERT INTO "Company" VALUES('company'); INSERT INTO "Supplier" VALUES('supplier','company'); INSERT INTO "BenefitConfig" VALUES('config','supplier');
    INSERT INTO "GovernmentEntity" VALUES('entity'); INSERT INTO "HrBudgetUnitEntityMapping" VALUES('ug','entity');
    INSERT INTO "PayrollBenefit" VALUES('pb','employee','config'); INSERT INTO "Dependent" VALUES('dependent','employee');
    INSERT INTO "HrPayrollRuleSet" VALUES('rules','ATIVA','PRODUCAO',false,'2026-01-01','2026-01-01','2027-12-31');
    INSERT INTO "HrPayrollRubric" VALUES('monthly','M','Mensalidade','DESCONTO',true,'MANUAL','rules'),('extra','E','Extraordinária','DESCONTO',true,'MANUAL','rules'),('refund','R','Devolução','PROVENTO',true,'MANUAL','rules');
    INSERT INTO "HrEmploymentRegime" VALUES('regime','rules',true); INSERT INTO "HrCalculationPolicy" VALUES('policy','rules','BRL',2,'BLOQUEAR');
    INSERT INTO "HrEmployeeFunctionalPeriod" VALUES('history','employee','ug','entity','regime','2026-01-01','2028-01-01',false,NULL);
    INSERT INTO "ConfiguracaoModulo" VALUES('RH',true);
    INSERT INTO "PayrollEvent" VALUES('monthly-event','M','Saúde','Desconto',NULL,true),('extra-event','E','Coparticipação','Desconto',NULL,true),('refund-event','R','Crédito','Vencimento',NULL,true),('salary-event','S','Salário','Vencimento',NULL,true);
    INSERT INTO "Payroll"(id,competence,type,status) VALUES('pay','10/2026','Mensal','Aberta'),('next','11/2026','Mensal','Aberta'),('other','10/2026','Mensal','Aberta');
    INSERT INTO "PayrollItem"(id,"payrollId","employeeId","eventId",value) VALUES('salary','pay','employee','salary-event',1000.00),('next-salary','next','employee','salary-event',1000.00);`);
  await db.exec(readFileSync("prisma/migrations-ibema/20261011050000_add_sst_health_benefits/migration.sql", "utf8"));
  await db.exec(readFileSync("prisma/migrations-ibema/20261011090000_add_sst_payroll_origins/migration.sql", "utf8"));
  await db.exec(`INSERT INTO "SstBenefitPayrollScope"("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES('pay','ug','entity','10/2026','user'),('next','ug','entity','11/2026','user');`);
  await db.exec(`INSERT INTO "SstHealthPlan"(id,"budgetUnitId","benefitConfigId","supplierId","operatorCompanyId","ansPlanNumber","ansOperatorNumber","monthlyRubricId","extraordinaryRubricId","monthlyEventId","extraordinaryEventId","contractReference",snapshot,"createdById") VALUES('plan','ug','config','supplier','company','123456789','123456','monthly','extra','monthly-event','extra-event','Contrato','{}','user');
    INSERT INTO "SstBenefitBeneficiary"(id,"planId","payrollBenefitId","dependentId","beneficiaryKey","admissionDate","startsAt","endsAt","cardNumber","monthlyAmount","contractReference",snapshot,"createdById") VALUES('titular','plan','pb',NULL,'TITULAR','2026-01-01','2026-01-01','2027-12-31','card',100.10,'Termo','{}','user'),('dep','plan','pb','dependent','dependent','2026-01-01','2026-01-01','2027-12-31','dep-card',50.20,'Termo','{}','user');
    INSERT INTO "SstBenefitEntry"(id,"beneficiaryId",competence,kind,amount,"sourceReference",reason,"requestHash","candidateSnapshot","createdById") VALUES('charge','titular','10/2026','MONTHLY',100.10,'MONTHLY:10/2026','Mensalidade','hash','{"category":"MONTHLY"}','user'),('dep-charge','dep','10/2026','MONTHLY',50.20,'MONTHLY:10/2026','Mensalidade','hash','{"category":"MONTHLY"}','user'),('expense','dep','10/2026','EXTRAORDINARY',0.30,'expense','Despesa','hash','{"category":"EXTRAORDINARY"}','user');`);
  const sql = (query: Prisma.Sql | TemplateStringsArray, values: unknown[]) => Array.isArray(query) ? Prisma.sql(query as TemplateStringsArray, ...values) : query as Prisma.Sql;
  const raw = async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => { const statement = sql(query, values); return (await db.query(statement.text, statement.values)).rows; };
  const tx = { $queryRaw: raw, $executeRaw: raw, auditEvent: { create: async ({ data }: { data: { actorUsuarioId: string; eventType: string; targetType: string; targetId: string } }) => db.query(`INSERT INTO "AuditEvent"(id,"actorUsuarioId","eventType","targetType","targetId") VALUES($1,$2,$3,$4,$5)`, [randomUUID(), data.actorUsuarioId, data.eventType, data.targetType, data.targetId]) } };
  const prisma = { ...tx, $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => { await db.exec("BEGIN"); try { const result = await operation(tx); await db.exec("COMMIT"); return result; } catch (error) { await db.exec("ROLLBACK"); throw error; } } };
  const context = { user: { id: "user", profileCode: "TEST", permissions: JSON.stringify({ modules: { RH: { update: true } } }), modulePermissions: [], allowedBudgetUnitIds: ["ug"] }, prisma } as unknown as AppContext;
  return { db, context };
}
async function mappings(db: PGlite) {
  await db.exec(`INSERT INTO "SstBenefitPayrollMapping"(id,"planId","startsAt","endsAt","monthlyRubricId","monthlyEventId","extraordinaryRubricId","extraordinaryEventId","refundRubricId","refundEventId","contractReference","createdById") VALUES('map','plan','2026-01-01','2027-12-31','monthly','monthly-event','extra','extra-event','refund','refund-event','Aditivo','user')`);
}
test("configured canonical sources actually post exact PayrollItems, audit, totals and individual origins once", async () => {
  const { db, context } = await fixture();
  try {
    const batch = await postBenefitPayrollBatch(context, "pay"); assert.equal(batch.status, "POSTED");
    const total = await db.query<{ total: string }>(`SELECT "totalValueDecimal"::text AS total FROM "Payroll" WHERE id='pay'`); assert.equal(total.rows[0].total, "849.40");
    const items = await db.query<{ amount: string; employeeId: string; entryId: string }>(`SELECT i."valueDecimal"::text AS amount,i."employeeId",o."entryId" FROM "PayrollItem" i JOIN "SstBenefitPayrollOrigin" o ON o."payrollItemId"=i.id ORDER BY o."entryId"`);
    assert.deepEqual(items.rows.map((row) => [row.entryId,row.amount]), [["charge","100.10"],["dep-charge","50.20"],["expense","0.30"]]);
    assert.ok(items.rows.every((row) => row.employeeId === "employee"));
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "AuditEvent" WHERE "targetType"='SST_BENEFIT_PAYROLL_ORIGIN'`)).rows[0].n, 3);
    assert.equal((await postBenefitEntry(context, "charge", "pay")).status, "ALREADY_POSTED");
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "PayrollItem" WHERE "payrollId"='pay'`)).rows[0].n, 4);
    assert.deepEqual((await postBenefitEntry(context,"charge","other")).blockers, ["ENTRY_ALREADY_POSTED_TO_OTHER_PAYROLL"]);
  } finally { await db.close(); }
});
test("missing mapping, policy, regime/history and closed competence block with no financial mutations", async () => {
  const { db, context } = await fixture();
  try {
    await db.exec(`UPDATE "PayrollEvent" SET "isActive"=false WHERE id='extra-event'`);
    assert.equal((await postBenefitPayrollBatch(context, "pay")).status, "BLOCKED");
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstBenefitPayrollOrigin"`)).rows[0].n, 0); // earlier charges rolled back, too
    await db.exec(`UPDATE "PayrollEvent" SET "isActive"=true WHERE id='extra-event'; UPDATE "HrPayrollRuleSet" SET "isDemo"=true WHERE id='rules'`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers, ["APPROVED_PRODUCTION_REGIME_RULE_SET_REQUIRED"]);
    await db.exec(`UPDATE "HrPayrollRuleSet" SET "isDemo"=false; UPDATE "HrEmployeeFunctionalPeriod" SET "budgetUnitId"='foreign'`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers, ["FULL_COMPETENCE_FUNCTIONAL_HISTORY_REQUIRED"]);
    await db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "budgetUnitId"='ug'; DELETE FROM "HrCalculationPolicy"`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers, ["CANONICAL_CALCULATION_POLICY_REQUIRED"]);
    await db.exec(`INSERT INTO "HrCalculationPolicy" VALUES('policy','rules','BRL',2,'BLOQUEAR'); UPDATE "Payroll" SET status='Fechada' WHERE id='other'`);
    assert.deepEqual((await postBenefitEntry(context,"charge","other")).blockers, ["PAYROLL_CLOSED"]);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "AuditEvent"`)).rows[0].n, 0);
  } finally { await db.close(); }
});
test("refund requires an explicitly mapped credit and never mutates closed charge/payments", async () => {
  const { db, context } = await fixture();
  try {
    await postBenefitPayrollBatch(context,"pay");
    await db.exec(`UPDATE "Payroll" SET status='Fechada' WHERE id='pay'; UPDATE "Payroll" SET status='Paga' WHERE id='pay'`);
    await assert.rejects(db.exec(`UPDATE "Payroll" SET status='Aberta' WHERE id='pay'`), /compensatory open competence/);
    await assert.rejects(db.exec(`DELETE FROM "PayrollItem" WHERE reference='SST:charge'`), /PAYROLL_CLOSED/);
    await assert.rejects(db.exec(`UPDATE "PayrollEvent" SET type='Vencimento' WHERE id='monthly-event'`), /code\/type immutable/);
    const input = { entryId: "charge", payrollId: "next", competence: "11/2026", reason: "Cancelamento contratual justificado" };
    assert.deepEqual((await cancelBenefitCharge(context,input)).blockers, ["EXPLICIT_RUBRIC_EVENT_MAPPING_REQUIRED"]);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstBenefitEntry" WHERE kind='REFUND'`)).rows[0].n, 0);
    await mappings(db);
    const result = await cancelBenefitCharge(context,input); assert.equal(result.status,"POSTED");
    assert.equal((await cancelBenefitCharge(context,input)).status,"ALREADY_POSTED");
    const compensation = await db.query<{ amount: string; type: string; value: string }>(`SELECT e.amount::text AS amount,ev.type,i."valueDecimal"::text AS value FROM "SstBenefitCancellation" c JOIN "SstBenefitEntry" e ON e.id=c."compensationEntryId" JOIN "SstBenefitPayrollOrigin" o ON o."entryId"=e.id JOIN "PayrollItem" i ON i.id=o."payrollItemId" JOIN "PayrollEvent" ev ON ev.id=i."eventId"`);
    assert.deepEqual(compensation.rows[0], { amount: "-100.10", type: "Vencimento", value: "100.10" });
    const totals = await db.query<{ id: string; total: string }>(`SELECT id,"totalValueDecimal"::text AS total FROM "Payroll" WHERE id IN('pay','next') ORDER BY id`);
    assert.deepEqual(totals.rows,[{ id:"next", total:"1100.10" },{ id:"pay",total:"849.40" }]);
    await assert.rejects(db.exec(`UPDATE "SstBenefitEntry" SET amount=0 WHERE id='charge'`), /immutable/);
  } finally { await db.close(); }
});
test("canonical net-pay policy and precision errors prevent posting; posted open items are immutable", async () => {
  const { db, context } = await fixture();
  try {
    await db.exec(`UPDATE "PayrollItem" SET value=0 WHERE id='salary'`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers, ["NEGATIVE_NET_PAY_BLOCKED_BY_CANONICAL_POLICY"]);
    await db.exec(`UPDATE "PayrollItem" SET value=1000.001 WHERE id='salary'`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers, ["LEGACY_FLOAT_PRECISION_UNSUPPORTED"]);
    await db.exec(`UPDATE "PayrollItem" SET value=1000 WHERE id='salary'`);
    await postBenefitEntry(context,"charge","pay");
    await assert.rejects(db.exec(`UPDATE "PayrollItem" SET value=1,"valueDecimal"=1 WHERE reference='SST:charge'`), /immutable/);
    await assert.rejects(db.exec(`UPDATE "Payroll" SET "totalValueDecimal"=123,"totalValue"=123 WHERE id='pay'`), /total does not match/);
  } finally { await db.close(); }
});
test("legacy discounts cannot be duplicated and financial ACL applies before SQL writes", async () => {
  const { db, context } = await fixture();
  try {
    const denied = { ...context, user: { ...context.user, allowedBudgetUnitIds: ["other"] } };
    await assert.rejects(postBenefitEntry(denied,"charge","pay"), /Acesso negado/);
    const readOnly = { ...context, user: { ...context.user, permissions: JSON.stringify({ modules: { RH: { update: false } } }) } };
    await assert.rejects(postBenefitEntry(readOnly,"charge","pay"), /permissão de alteração RH/);
    await db.exec(`INSERT INTO "PayrollItem"(id,"payrollId","employeeId","eventId",value,reference) VALUES('old-benefit','pay','employee','monthly-event',100.10,'Benefício')`);
    assert.deepEqual((await postBenefitEntry(context,"charge","pay")).blockers,["UNLINKED_LEGACY_BENEFIT_ITEMS_REQUIRE_RECONCILIATION"]);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstBenefitPayrollOrigin"`)).rows[0].n,0);
  } finally { await db.close(); }
});
test("verified payroll scope and unreconciled sources prevent unsafe closure or cross-entity posting", async () => {
  const { db, context } = await fixture();
  try {
    assert.deepEqual((await postBenefitEntry(context,"charge","other")).blockers,["EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED"]);
    await assert.rejects(db.exec(`UPDATE "Payroll" SET status='Fechada' WHERE id='pay'`), /UNPOSTED_CANONICAL_BENEFITS/);
    await assert.rejects(db.exec(`INSERT INTO "PayrollItem"(id,"payrollId","employeeId","eventId",value) VALUES('foreign','pay','foreign-employee','salary-event',100)`), /outside verified functional scope/);
    await assert.rejects(db.exec(`UPDATE "Payroll" SET competence='12/2026' WHERE id='pay'`), /scope competence immutable/);
    assert.equal((await db.query<{ n: number }>(`SELECT count(*)::int n FROM "SstBenefitPayrollOrigin"`)).rows[0].n,0);
  } finally { await db.close(); }
});
test("partial refund must reconcile first; cancellation posts only the exact unpaid balance", async () => {
  const { db, context } = await fixture();
  try {
    await postBenefitEntry(context,"charge","pay"); await mappings(db);
    await db.exec(`INSERT INTO "SstBenefitEntry"(id,"beneficiaryId",competence,kind,amount,"sourceReference",reason,"refundOfId","requestHash","candidateSnapshot","createdById") VALUES('partial-refund','titular','11/2026','REFUND',-40.10,'partial','Devolução parcial','charge','hash','{"category":"MONTHLY"}','user')`);
    const input = { entryId:"charge",payrollId:"next",competence:"11/2026",reason:"Cancelamento do saldo contratual" };
    assert.deepEqual((await cancelBenefitCharge(context,input)).blockers,["UNPOSTED_REFUNDS_REQUIRE_RECONCILIATION"]);
    assert.equal((await postBenefitEntry(context,"partial-refund","next")).status,"POSTED");
    assert.equal((await cancelBenefitCharge(context,input)).status,"POSTED");
    const [row] = (await db.query<{ amount: string }>(`SELECT e.amount::text AS amount FROM "SstBenefitCancellation" c JOIN "SstBenefitEntry" e ON e.id=c."compensationEntryId"`)).rows;
    assert.equal(row.amount,"-60.00");
    assert.equal((await db.query<{ total: string }>(`SELECT "totalValueDecimal"::text AS total FROM "Payroll" WHERE id='next'`)).rows[0].total,"1100.10");
  } finally { await db.close(); }
});
