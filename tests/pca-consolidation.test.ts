import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPcaManagerialReportCsv,
  consolidatePca,
  identifyCollectivePurchaseOpportunities,
  summarizeInternalPhaseMonitoring,
  summarizePcaBudget,
} from "../src/lib/compras/pca-consolidation";

test("PCA filters by year and unit, deduplicates and sums exact amounts", () => {
  const demand = { id: "a", year: 2026, unitId: "u", unitName: "Compras", description: "Papel", estimatedValue: "0.10" };
  const demands = [
    demand, demand,
    { ...demand, id: "b", estimatedValue: "0.20" },
    { ...demand, id: "c", year: 2027 },
    { ...demand, id: "d", unitId: null, unitName: null },
  ];
  const [group] = consolidatePca(demands, 2026, "u");
  assert.equal(group.total.toFixed(2), "0.30");
  assert.deepEqual(group.demands.map(item => item.id), ["a", "b"]);
  assert.deepEqual(consolidatePca(demands, 2026, "").map(item => item.name), ["Sem unidade identificada"]);
  assert.equal(consolidatePca(demands, 2027).length, 1);
  assert.deepEqual(consolidatePca(demands, 2028), []);
});

test("PCA identifies absent, partial and complete request allocations across appropriations", () => {
  const item = { itemId: "item", quantity: 2, estimatedUnitValue: 50 };
  const first = { ...item, allocationId: "a", appropriationId: "one", code: "01", allocatedQuantity: 1, allocatedValue: "50.00" };
  const second = { ...first, allocationId: "b", appropriationId: "two", code: "02" };
  const absent = { ...item, allocationId: null, appropriationId: null, code: null, allocatedQuantity: null, allocatedValue: null };
  assert.equal(summarizePcaBudget([absent]).status, "Ausente");
  assert.equal(summarizePcaBudget([first]).status, "Parcial ou divergente");
  assert.equal(summarizePcaBudget([first, second, { ...absent, itemId: "other" }]).status, "Parcial ou divergente");
  const result = summarizePcaBudget([first, first, second]);
  assert.equal(result.status, "Completa");
  assert.deepEqual(result.appropriations.map(row => [row.code, row.amount.toFixed(2)]), [["01", "50.00"], ["02", "50.00"]]);
});

test("PCA filters objectives together with year and unit while preserving unlinked demands", () => {
  const base = { year: 2026, unitId: "u", unitName: "Compras", description: "Papel", estimatedValue: "10" };
  const rows = [
    { ...base, id: "a", objectiveId: "obj" },
    { ...base, id: "b", objectiveId: null },
    { ...base, id: "c", objectiveId: "obj", year: 2027 },
    { ...base, id: "d", objectiveId: "obj", unitId: "other" },
  ];
  assert.deepEqual(consolidatePca(rows, 2026, "u", "obj")[0].demands.map(row => row.id), ["a"]);
  assert.equal(consolidatePca(rows, 2026, "u")[0].total.toFixed(2), "20.00");
  assert.deepEqual(consolidatePca(rows, 2026, "u", "missing"), []);
});

test("PCA objective migration preserves legacy records and rejects invalid links", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE "PurchasePlanning" (id TEXT PRIMARY KEY);
      CREATE TABLE "ObjectivePPA" (id TEXT PRIMARY KEY);
      INSERT INTO "PurchasePlanning" VALUES ('plan');
      INSERT INTO "ObjectivePPA" VALUES ('objective');
    `);
    await pg.exec(await readFile("db/migrations/20261104150000_cf30_pca_objectives/migration.sql", "utf8"));
    await assert.rejects(pg.exec(`UPDATE "PurchasePlanning" SET "objectiveId"='unknown'`), /foreign key/);
    await pg.exec(`UPDATE "PurchasePlanning" SET "objectiveId"='objective'`);
    assert.deepEqual((await pg.query(`SELECT "objectiveId" FROM "PurchasePlanning"`)).rows, [{ objectiveId: "objective" }]);
    await pg.exec(`DELETE FROM "ObjectivePPA"`);
    assert.deepEqual((await pg.query(`SELECT "objectiveId" FROM "PurchasePlanning"`)).rows, [{ objectiveId: null }]);
  } finally {
    await pg.close();
  }
});

test("CF30 30.4 & 30.10 identifies collective purchase opportunities, summarizes deadlines and exports CSV", () => {
  const demands = [
    {
      id: "d1",
      year: 2026,
      unitId: "u-adm",
      unitName: "Secretaria de Administração",
      catalogItemId: "cat-papel",
      unit: "resma",
      quantity: 100,
      status: "Planejado",
      description: "Papel A4 Alcalino",
      estimatedValue: "2500.00",
    },
    {
      id: "d2",
      year: 2026,
      unitId: "u-edu",
      unitName: "Secretaria de Educação",
      catalogItemId: "cat-papel",
      unit: "resma",
      quantity: 300,
      status: "Planejado",
      description: "Papel A4 Alcalino",
      estimatedValue: "7500.00",
    },
    {
      id: "d3",
      year: 2026,
      unitId: "u-saude",
      unitName: "Secretaria de Saúde",
      catalogItemId: null,
      unit: "un",
      quantity: 1,
      status: "Planejado",
      description: "Equipamento exclusivo único",
      estimatedValue: "12000.00",
    },
    {
      id: "d4-canceled",
      year: 2026,
      unitId: "u-obras",
      unitName: "Secretaria de Obras",
      catalogItemId: "cat-papel",
      unit: "resma",
      quantity: 50,
      status: "Cancelado",
      description: "Papel A4 Alcalino",
      estimatedValue: "1250.00",
    },
  ];

  const opportunities = identifyCollectivePurchaseOpportunities(demands, 2026);
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].unitCount, 2);
  assert.equal(opportunities[0].totalQuantity.toNumber(), 400);
  assert.equal(opportunities[0].totalEstimatedValue.toFixed(2), "10000.00");
  assert.deepEqual(opportunities[0].demandIds, ["d1", "d2"]);

  const groups = consolidatePca(demands, 2026);
  const csv = buildPcaManagerialReportCsv(2026, groups, opportunities);
  assert.match(csv, /"Papel A4 Alcalino"/);
  assert.match(csv, /"SIM"/);
  assert.match(csv, /"NAO"/);

  const monitoring = summarizeInternalPhaseMonitoring(
    [
      {
        planningId: "d1",
        description: "Papel A4 Alcalino",
        unitName: "Administração",
        status: "Planejado",
        expectedPeriodStart: "2026-10-01",
        expectedPeriodEnd: "2026-12-31",
        estimatedValue: "2500.00",
        hasDfd: true,
        dfdApproved: true,
        pcaStatus: "APROVADO",
        etpStatus: "EM_ANALISE",
        trStatus: null,
        gedLinkedCount: 2,
        coherent: true,
      },
      {
        planningId: "d2",
        description: "Serviço de TI",
        unitName: "Educação",
        status: "Planejado",
        expectedPeriodStart: "2026-11-15",
        expectedPeriodEnd: "2026-12-31",
        estimatedValue: "7500.00",
        hasDfd: true,
        dfdApproved: true,
        pcaStatus: "APROVADO",
        etpStatus: "APROVADO",
        trStatus: "RASCUNHO",
        gedLinkedCount: 3,
        coherent: false,
      },
    ],
    new Date("2026-11-01T12:00:00.000Z"),
  );

  assert.equal(monitoring.totalDemands, 2);
  assert.equal(monitoring.totalEstimatedValue.toFixed(2), "10000.00");
  assert.equal(monitoring.documentsProgress.gedLinkedTotal, 5);
  assert.equal(monitoring.documentsProgress.coherentCount, 1);
  assert.equal(monitoring.documentsProgress.inconsistentCount, 1);
  assert.equal(monitoring.deadlines.overdueCount, 1);
  assert.equal(monitoring.deadlines.dueSoonCount, 1);
});
