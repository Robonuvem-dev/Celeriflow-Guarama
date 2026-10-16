import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { allocateRevenue, instrumentInput, lineInput, planningBasePath, projectedValue } from "../src/lib/planejamento/policy";
import { assertPlanningOperation, planningEntityWhere, planningLineWhere, type PlanningContext } from "../src/lib/planejamento/access";
import { addPlanningLine, createPlanningInstrument, listPlanningInstruments } from "../src/lib/planejamento/service";

function context(overrides: Record<string, unknown> = {}) {
  return { jurisdiction: "EXECUTIVE", user: { id: "ana", employeeId: null, profileCode: "BUDGET_ANALYST", modulePermissions: [], allowedBudgetUnitIds: ["saude"], permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, create: true, update: true }, CAMARA: { blocked: true } } }) }, ...overrides } as unknown as PlanningContext;
}

test("rateio conserva centavos, independe da ordem e rejeita percentuais incompletos/duplicados", () => {
  const sources = [{ id: "b", percentage: "33.333333" }, { id: "a", percentage: "33.333334" }, { id: "c", percentage: "33.333333" }];
  assert.deepEqual(allocateRevenue("0.02", sources), [{ id: "b", value: "0.01" }, { id: "a", value: "0.01" }, { id: "c", value: "0.00" }]);
  assert.deepEqual([...allocateRevenue("0.02", [...sources].reverse())].sort((a, b) => a.id.localeCompare(b.id)), [...allocateRevenue("0.02", sources)].sort((a, b) => a.id.localeCompare(b.id)));
  assert.throws(() => allocateRevenue("10.00", [{ id: "a", percentage: "60" }, { id: "b", percentage: "41" }]), /100%/);
  assert.throws(() => allocateRevenue("10.00", [{ id: "a", percentage: "50" }, { id: "a", percentage: "50" }]), /distintas/);
  assert.equal(projectedValue("100.05", "10").toFixed(2), "110.06");
  assert.equal(projectedValue("999999999999.99", "0").toFixed(2), "999999999999.99");
});

test("peças exigem cadeia e quatro anos de PPA; despesa não aceita classificação incompleta", () => {
  const input = { governmentEntityId: "prefeitura", kind: "PPA", code: "2026-2029", title: "Desenvolvimento municipal", startYear: 2026, endYear: 2029, revenueDegree: 6, expenseLevel: "ELEMENT_SOURCE" };
  assert.equal(instrumentInput.safeParse(input).success, true);
  assert.equal(instrumentInput.safeParse({ ...input, endYear: 2030 }).success, false);
  assert.equal(instrumentInput.safeParse({ ...input, kind: "LDO", endYear: 2026 }).success, false);
  assert.equal(lineInput.safeParse({ instrumentId: "ppa", kind: "EXPENSE", code: "saude", description: "Atenção básica", year: 2026, budgetUnitId: "saude", resourceSourceId: "livre", originalValue: "100.00" }).success, false);
});

test("rota legislativa exige Câmara e Planejamento; escopo inclui jurisdição e unidades autorizadas", () => {
  const ctx = context();
  assertPlanningOperation(ctx, "create");
  assert.throws(() => assertPlanningOperation({ ...ctx, jurisdiction: "LEGISLATIVE" }, "create"), /Câmara/);
  assert.equal(planningBasePath("LEGISLATIVE"), "/camara/planejamento");
  const where = planningEntityWhere(ctx);
  assert.deepEqual(where.planningScope, { is: { jurisdiction: "EXECUTIVE", isActive: true } });
  assert.deepEqual(where.planningUnits, { some: { budgetUnitId: { in: ["saude"] } } });
  assert.ok(planningLineWhere(ctx).budgetUnit);
});

test("criação recusa entidade fora do escopo antes de persistir peça canônica", async () => {
  let writes = 0;
  const tx = { governmentEntity: { findFirst: async () => null }, multiYearPlan: { create: async () => { writes++; } } };
  const ctx = context({ prisma: { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } });
  await assert.rejects(createPlanningInstrument(ctx, { governmentEntityId: "camara", kind: "PPA", code: "2026-2029", title: "Legislativo", startYear: 2026, endYear: 2029, revenueDegree: 6, expenseLevel: "SOURCE" }), /Entidade não autorizada/);
  assert.equal(writes, 0);
});

test("gravação recusa unidade estrangeira e usa lock da peça antes de alterar valores", async () => {
  const locks: string[] = [];
  let writes = 0;
  const record = { id: "ppa", kind: "PPA", governmentEntityId: "prefeitura", multiYearPlanId: "canonical-ppa", startYear: 2026, endYear: 2029, multiYearPlan: { status: "DRAFT" } };
  const tx = {
    planningInstrument: { findFirst: async () => record, findFirstOrThrow: async () => record },
    $queryRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("")); return []; },
    budgetUnit: { findFirst: async () => null }, planningBudgetLine: { create: async () => { writes++; } },
  };
  const ctx = context({ prisma: { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } });
  await assert.rejects(addPlanningLine(ctx, { instrumentId: "ppa", kind: "REVENUE", code: "IPTU", description: "Imposto predial e territorial urbano", year: 2026, budgetUnitId: "camara", resourceSourceId: "livre", revenueNatureId: "iptu", originalValue: "150000.00" }), /Unidade não autorizada/);
  assert.equal(writes, 0);
  assert.match(locks[0], /FOR UPDATE/);
});

test("paginação aplica mesmo escopo antes do count e da consulta e limita página pelo total", async () => {
  const queries: { count?: unknown; list?: { where: unknown; skip: number; take: number } } = {};
  const ctx = context({ prisma: { planningInstrument: {
    count: async ({ where }: { where: unknown }) => { queries.count = where; return 21; },
    findMany: async (input: { where: unknown; skip: number; take: number }) => { queries.list = input; return []; },
  } } });
  const result = await listPlanningInstruments(ctx, { page: "999999999", kind: "PPA" });
  assert.equal(result.page, 2);
  assert.deepEqual(queries.count, queries.list?.where);
  assert.equal(queries.list?.take, 20);
  assert.equal(queries.list?.skip, 20);
});

test("migração aditiva executa em PostgreSQL isolado e recusa peças/linhas estruturalmente inválidas", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "GovernmentEntity" (id TEXT PRIMARY KEY); CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY);
      CREATE TABLE "MultiYearPlan" (id TEXT PRIMARY KEY); CREATE TABLE "BudgetGuideline" (id TEXT PRIMARY KEY);
      CREATE TABLE "AnnualBudgetLaw" (id TEXT PRIMARY KEY); CREATE TABLE "ProgramPPA" (id TEXT PRIMARY KEY);
      CREATE TABLE "ActionPPA" (id TEXT PRIMARY KEY); CREATE TABLE "ResourceSource" (id TEXT PRIMARY KEY);
      CREATE TABLE "RevenueNature" (id TEXT PRIMARY KEY); CREATE TABLE "ExpenseNature" (id TEXT PRIMARY KEY);
      CREATE TABLE "CamVereador" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY);
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY); CREATE TABLE "CamGabinete" (id TEXT PRIMARY KEY);`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011150000_add_planning_scoped_instruments/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "GovernmentEntity" VALUES ('prefeitura'); INSERT INTO "MultiYearPlan" VALUES ('ppa');`);
    const insert = `INSERT INTO "PlanningInstrument" (id, "governmentEntityId", kind, code, title, "startYear", "endYear", "multiYearPlanId", "createdById", "updatedAt") VALUES ('instrument', 'prefeitura', 'PPA', '2026-2029', 'Desenvolvimento municipal', 2026, $1, 'ppa', 'ana', NOW())`;
    await assert.rejects(db.query(insert, [2028]), /planning_instrument_years/);
    await db.query(insert, [2029]);
    await assert.rejects(db.exec(`UPDATE "PlanningInstrument" SET "expenseLevel" = 'INVALID' WHERE id = 'instrument'`), /planning_instrument_level/);
    await db.exec(`INSERT INTO "BudgetUnit" VALUES ('saude'); INSERT INTO "ResourceSource" VALUES ('livre'); INSERT INTO "PlanningEntityUnit" VALUES ('saude','prefeitura');`);
    await assert.rejects(db.exec(`INSERT INTO "PlanningBudgetLine" (id,"instrumentId",kind,code,description,year,"budgetUnitId","resourceSourceId","originalValue") VALUES ('line','instrument','EXPENSE','saude','Atenção básica',2026,'saude','livre',100)`), /planning_line_nature/);
  } finally { await db.close(); }
});
