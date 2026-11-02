import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql } from "drizzle-orm";
import { createRecyclingReportFixture } from "./helpers/recycling-report-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { loadRecyclingReport } from "../src/db/repositories/environment/recycling-reports";
import { readRecyclingReport } from "../src/lib/environment/recycling-report-service";
import { parseRecyclingReportFilters, recyclingChartPercent } from "../src/lib/environment/recycling-reports";
import { recyclingReportDataset } from "../src/lib/environment/recycling-report-delivery";
import { saveRecyclingCatalogEntry } from "../src/db/repositories/environment/recycling-catalog";
import { createDefaultReportTemplate } from "../src/lib/reports/report-template";
import { renderTabularCsv, renderTabularPrintHtml, renderTabularXlsx } from "../src/lib/reports/tabular-renderers";
import ExcelJS from "exceljs";

let fixture: Awaited<ReturnType<typeof createRecyclingReportFixture>>;
const now = new Date("2026-11-02T15:00:00Z");
before(async () => { fixture = await createRecyclingReportFixture(); });
after(async () => { await fixture?.close(); });
function filters(raw: Record<string, string | undefined> = {}) { return parseRecyclingReportFilters({ from: "2026-01-01", to: "2026-03-31", ...raw }, now); }
function report(raw: Record<string, string> = {}, instanceId = "one", page?: string, all = false) {
  return withDatabaseTransaction(fixture.connection, tx => loadRecyclingReport(tx, instanceId, filters(raw), page, all), { isolationLevel: "repeatable read", accessMode: "read only" });
}
test("filtros validam datas/códigos, preservam o calendário municipal e percentuais não alteram valores", () => {
  assert.equal(parseRecyclingReportFilters({}, new Date("2026-11-02T01:00:00Z")).to, "2026-11-01");
  assert.equal(parseRecyclingReportFilters({ to: "2025-05-01" }, now).from, "2025-01-01");
  for (const raw of [{ from: "2026-02-30" }, { from: "0000-01-01" }, { to: "2025-12-31" }, { materialCode: "../inválido" }, { order: "name;DROP TABLE" }]) assert.throws(() => filters(raw));
  assert.equal(recyclingChartPercent("9007199254740993.01", "9007199254740993.01"), "100.0000");
  assert.equal(recyclingChartPercent("0", "0"), "0");
});
test("10.1/10.12: saldo inicial + entradas - saídas fecha na data final, sem usar o saldo de hoje", async () => {
  const data = await report({ to: "2026-01-31" });
  const material = data.rows.find(row => row.code === "M1")!;
  assert.equal(material.opening, "10.125"); assert.equal(material.incoming, "6.000"); assert.equal(material.outgoing, "3.025"); assert.equal(material.balance, "13.100");
  assert.equal(material.revenue, "0.10"); assert.equal(data.revenue, "0.10");
  assert.equal(data.rows.find(row => row.code === "M2")!.unit, "litro");
  assert.equal(data.rows.find(row => row.code === "M2")!.balance, "100.500");
});
test("10.13: depósito, tipo, material e datas combinam sem duplicação ou mistura de instâncias", async () => {
  const data = await report({ view: "depots", typeCode: "t1", materialCode: "m1", depotCode: "d1", from: "2026-02-01" });
  assert.equal(data.total, 1); assert.equal(data.rows[0].depotCode, "D1"); assert.equal(data.rows[0].balance, "11.100"); assert.equal(data.rows[0].revenue, "0.00");
  assert.doesNotMatch(JSON.stringify(data), /PRIVADO/);
  assert.equal((await report({ depotCode: "D0" })).total, 0);
  assert.equal((await report({ materialCode: "M1", typeCode: "T2" })).total, 0);
  const other = await report({ materialCode: "M1" }, "two");
  assert.equal(other.rows[0].balance, "998.000"); assert.equal(other.revenue, "100.00");
});
test("10.2/10.3: vendas por classe e meses conciliam centavos exatos acima de 2^53", async () => {
  const general = await report(); const sales = await report({ view: "sales" }); const monthly = await report({ view: "monthly" });
  assert.equal(general.revenue, "9007199254740993.31"); assert.equal(sales.revenue, general.revenue); assert.equal(monthly.revenue, general.revenue);
  assert.equal(sales.rows.find(row => row.code === "T1")!.revenue, "0.30");
  assert.equal(sales.rows.find(row => row.code === "T2")!.revenue, "9007199254740993.01");
  assert.deepEqual(monthly.rows.map(row => [row.code, row.revenue]), [["2026-01", "0.10"], ["2026-02", "0.00"], ["2026-03", "9007199254740993.21"]]);
  assert.equal((await report({ view: "monthly", depotCode: "D2" })).revenue, "0.20");
  assert.equal((await report({ view: "sales", materialCode: "M2" })).total, 1);
});
test("ordenação por código/descrição e meses vazios respeitam limites inclusivos", async () => {
  assert.deepEqual((await report()).rows.map(row => row.code), ["M1", "M2"]);
  assert.deepEqual((await report({ order: "description" })).rows.map(row => row.code), ["M2", "M1"]);
  const empty = await report({ view: "monthly", from: "2026-04-01", to: "2026-06-30" });
  assert.equal(empty.rows.length, 3); assert(empty.rows.every(row => row.revenue === "0.00" && row.movements === "0"));
  const lastDay = await report({ view: "sales", from: "2026-03-31", to: "2026-03-31" }); assert.equal(lastDay.revenue, "9007199254740993.01");
});
test("paginação 20/1 e exportação completa não descartam registros", async () => {
  await withDatabaseTransaction(fixture.connection, async tx => {
    for (let i = 1; i <= 21; i++) await saveRecyclingCatalogEntry(tx, { instanceId: "paging", actorUsuarioId: "actor", mode: "create", entry: { kind: "materials", code: `P${String(i).padStart(2, "0")}`, name: `Material ${22 - i}`, active: true, address: "", description: "" } });
  });
  for (let i = 1; i <= 21; i++) await fixture.movement({ materialCode: `P${String(i).padStart(2, "0")}` }, "paging");
  const first = await report({}, "paging"), last = await report({}, "paging", "2"), all = await report({}, "paging", "1", true);
  assert.equal(first.total, 21); assert.equal(first.rows.length, 20); assert.equal(last.rows.length, 1); assert.equal(all.rows.length, 21);
  assert.equal((await report({}, "paging", "999")).page, 2);
  const months = await report({ view: "monthly", from: "2024-01-01", to: "2026-03-31" }, "one", "2"); assert.equal(months.total, 27); assert.equal(months.rows.length, 7);
});
test("emissão reutiliza contexto transacional, agrupa depósitos e não grava dados de estoque", async () => {
  const before = await fixture.connection.db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "AuditEvent"`);
  const result = await readRecyclingReport(fixture.connection, filters({ view: "depots" }), undefined, true);
  assert.equal(result.instanceId, "one"); assert.equal(result.institution.name, "Prefeitura fixture");
  const dataset = recyclingReportDataset(result.data);
  assert(dataset.sections.some(section => section.title === "D1 — Central")); assert(dataset.sections.some(section => section.title === "D2 — Norte"));
  assert.equal((await fixture.connection.db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "AuditEvent"`)).rows[0].total, before.rows[0].total);
});
test("CSV, Excel e impressão preservam os valores e neutralizam fórmulas/HTML", async () => {
  const data = await report(); data.rows[0] = { ...data.rows[0], name: '=HYPERLINK("x")<script>fixture</script>' };
  const dataset = recyclingReportDataset(data), presentation = { institution: null, template: createDefaultReportTemplate(), emission: null };
  const csv = renderTabularCsv(dataset, presentation); assert.match(csv, /9007199254740993\.31/); assert.match(csv, /'=HYPERLINK/);
  const html = renderTabularPrintHtml(dataset, presentation); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  const xlsx = await renderTabularXlsx(dataset, presentation); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx as never);
  const totals = workbook.worksheets.find(sheet => sheet.name.startsWith("Totais"))!; assert.equal(totals.getRow(2).getCell(2).value, "9007199254740993.31");
});
