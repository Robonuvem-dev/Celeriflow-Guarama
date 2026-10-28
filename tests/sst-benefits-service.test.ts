import assert from "node:assert/strict";
import test from "node:test";
import { createSstDrizzleFixture } from "./helpers/sst-drizzle-fixture";
import { sstTestContext } from "./helpers/sst-drizzle-context";
import { generateBenefitMonthly, registerBenefitEntry } from "../src/lib/sst/benefit-service";
import { readBenefitStatement, listBenefitBeneficiaries } from "../src/lib/sst/benefit-query";

async function fixture(startsAt = "2026-10-01") {
  const local = await createSstDrizzleFixture(["BudgetUnit", "Employee", "Dependent", "BenefitConfig", "PayrollBenefit", "Supplier", "Company", "HrPayrollRuleSet", "HrPayrollRubric", "PayrollEvent", "AuditEvent"], ["20261011050000_add_sst_health_benefits"]), db = local.database;
  try {
    await db.exec(`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','Unidade','secretariat',now());
    INSERT INTO "Employee" (id,name,"secretariatId","updatedAt") VALUES ('employee','Titular','secretariat',now()),('foreign','Outro titular','secretariat',now());
    INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('company','Operadora','00000000000000',now());
    INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('supplier','company',now());
    INSERT INTO "BenefitConfig" (id,name,type,"supplierId","updatedAt") VALUES ('config','Plano de saúde','Saúde','supplier',now());
    INSERT INTO "PayrollBenefit" (id,"employeeId","benefitConfigId","updatedAt") VALUES ('pb','employee','config',now()),('foreign-pb','foreign','config',now());
    INSERT INTO "Dependent" (id,"employeeId",name,relationship,"updatedAt") VALUES ('d','employee','Dependente','Filho',now());
    INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,status,scope,"isDemo","approvedAt","effectiveFrom","updatedAt") VALUES ('rules','instance','PROD','Produção','ATIVA','PRODUCAO',false,'2026-01-01','2026-01-01',now());
    INSERT INTO "HrPayrollRubric" (id,"ruleSetId",code,name,type,"updatedAt") VALUES ('r','rules','M','Mensalidade','DESCONTO',now()),('extra','rules','E','Extra','DESCONTO',now());
    INSERT INTO "PayrollEvent" (id,code,name,type,"updatedAt") VALUES ('event','M','Mensalidade','Desconto',now());
    INSERT INTO "SstHealthPlan" (id,"budgetUnitId","benefitConfigId","supplierId","operatorCompanyId","ansPlanNumber","ansOperatorNumber","monthlyRubricId","extraordinaryRubricId","monthlyEventId","contractReference",snapshot,"createdById") VALUES ('p','ug','config','supplier','company','123456789','123456','r','extra','event','Contrato','{}','u');`);
    await db.query(`INSERT INTO "SstBenefitBeneficiary" (id,"planId","payrollBenefitId","dependentId","beneficiaryKey","admissionDate","startsAt","endsAt","cardNumber","monthlyAmount","contractReference",snapshot,"createdById") VALUES ('b','p','pb','d','d','2026-10-01',$1,'2026-12-31','card',100.10,'Termo','{}','u')`, [startsAt]);
    const context = sstTestContext(local.connection.db, { id: "u", employeeId: "employee", permissions: JSON.stringify({ modules: { SST: { create: true } } }) });
    const entries = async () => (await db.query<{ id: string; amount: string; candidateSnapshot: { blockers: string[]; dependentId: string } }>('SELECT id,amount::text,"candidateSnapshot" FROM "SstBenefitEntry"')).rows;
    return { db, context, entries, close: local.close };
  } catch (error) { await local.close(); throw error; }
}
test("monthly generation is idempotent, typed, auditable and does not post PayrollItems", async () => {
  const f = await fixture();
  try {
    // No PayrollItem table exists: an accidental financial write fails the test.
    const id = await generateBenefitMonthly(f.context, "b", "10/2026");
    assert.equal(await generateBenefitMonthly(f.context, "b", "10/2026"), id);
    const writes = await f.entries();
    assert.equal(writes.length, 1); assert.equal(writes[0].amount, "100.10");
    assert.deepEqual(writes[0].candidateSnapshot.blockers, ["POSTING_REQUIRES_VALIDATED_FUNCTIONAL_HISTORY"]);
    assert.equal(writes[0].candidateSnapshot.dependentId, "d");
    assert.equal((await f.db.query('SELECT id FROM "AuditEvent"')).rows.length, 1);
    await assert.rejects(registerBenefitEntry(f.context, { beneficiaryId: "b", competence: "10/2026", kind: "MONTHLY", amount: "100.10", sourceReference: "MONTHLY:10/2026", reason: "Changed reason" }), /outros dados/);
  } finally { await f.close(); }
});
test("financial ledger creation denies read-only and cross-UG users before writes", async () => {
  const f = await fixture();
  try {
    f.context.user.permissions = JSON.stringify({ modules: { SST: { create: false } } });
    await assert.rejects(generateBenefitMonthly(f.context, "b", "10/2026"), /perfil não permite/);
    f.context.user.permissions = JSON.stringify({ modules: { SST: { create: true } } });
    f.context.user.allowedBudgetUnitIds = ["other"];
    await assert.rejects(generateBenefitMonthly(f.context, "b", "10/2026"), /Acesso negado/);
    assert.equal((await f.entries()).length, 0);
  } finally { await f.close(); }
  const partial = await fixture("2026-10-15");
  try { await assert.rejects(generateBenefitMonthly(partial.context, "b", "10/2026"), /Cobertura parcial/); }
  finally { await partial.close(); }
});
test("portal detail and paginated list derive ownership exclusively from session", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "SstBenefitBeneficiary" (id,"planId","payrollBenefitId","beneficiaryKey","admissionDate","startsAt","endsAt","cardNumber","monthlyAmount","contractReference",snapshot,"createdById")
      SELECT 'own-'||n,'p','pb','TITULAR',date '2000-01-01',date '2000-01-01'+n*interval '1 month',date '2000-01-01'+(n+1)*interval '1 month'-interval '1 day','card',1,'Termo','{}','u' FROM generate_series(0,43) n;
      INSERT INTO "SstBenefitBeneficiary" (id,"planId","payrollBenefitId","beneficiaryKey","admissionDate","startsAt","endsAt","cardNumber","monthlyAmount","contractReference",snapshot,"createdById") VALUES ('foreign-id','p','foreign-pb','TITULAR','2026-01-01','2026-01-01','2026-12-31','other',1,'Termo','{}','u');`);
    assert.equal(await readBenefitStatement(f.context, "foreign-id", { from: "01/2026", to: "12/2026" }, true), null);
    const result = await listBenefitBeneficiaries(f.context, { page: "999" }, true);
    assert.equal(result.total, 45); assert.equal(result.page, 3); assert.equal(result.rows.length, 5);
    assert.ok(result.rows.every(row => row.payrollBenefit.employeeId === "employee"));
    f.context.user.employeeId = null;
    assert.deepEqual(await listBenefitBeneficiaries(f.context, {}, true), { total: 0, page: 1, rows: [] });
  } finally { await f.close(); }
});
