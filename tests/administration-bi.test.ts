import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { administrationExportDatasets, datasetCsv, exportAdministrationBi } from "../src/lib/administration/bi-export";
import { isCompletedDemand, summarizeAdministration, summarizeAdministrationData, type AdministrationBiData } from "../src/lib/administration/bi-model";

const data: AdministrationBiData = {
  institution: "Prefeitura Municipal de Aurora das Veredas", capturedAt: "2026-10-27T12:00:00Z", selection: "educacao",
  options: [{ id: "educacao", name: "Educação", active: true }, { id: "saude", name: "Saúde", active: true }],
  rows: [{ id: "educacao", name: "Educação", acronym: "SEMED", active: true, managerName: "Antônio Nunes", managerRole: "Secretário Municipal de Educação", managerValid: true, employees: 20, inactiveEmployees: 2, departments: 4, units: 3, demands: 5, openDemands: 3, completedDemands: 2, overdueDemands: 1 }],
  departments: [{ id: "ensino", name: "Ensino Fundamental", employees: 20 }], roles: [{ name: "Professor", employees: 19 }, { name: "Secretário Municipal de Educação", employees: 1 }], timeline: [{ month: "2026-10", label: "out.", demands: 5 }], unassignedEmployees: 0, unassignedDemands: 0, unassignedOpenDemands: 0, unassignedCompletedDemands: 0, unassignedOverdueDemands: 0,
};

test("indicadores resumem a seleção sem confundir ausência de dados com percentuais", () => {
  const summary = summarizeAdministration(data.rows);
  assert.equal(summary.employees, 20);
  assert.equal(summary.managers, 1);
  assert.equal(summary.openDemands + summary.completedDemands, summary.demands);
  assert.equal(summarizeAdministration([]).secretariats, 0);
  assert.equal(isCompletedDemand(" CONCLUÍDA "), true);
  assert.equal(isCompletedDemand("Cancelada"), true);
  assert.equal(isCompletedDemand("Em andamento"), false);
  const consolidated = summarizeAdministrationData({ ...data, selection: "", unassignedEmployees: 2, unassignedDemands: 3, unassignedOpenDemands: 2, unassignedCompletedDemands: 1, unassignedOverdueDemands: 1 });
  assert.equal(consolidated.employees, 22);
  assert.equal(consolidated.openDemands + consolidated.completedDemands, consolidated.demands);
  assert.equal(consolidated.overdueDemands, 2);
});

test("Excel, CSV e Power BI preservam somente a secretaria selecionada e os tipos numéricos", async () => {
  const datasets = administrationExportDatasets(data);
  assert.equal(datasets[1].rows.length, 1);
  assert.equal(datasets[1].rows[0][0], "educacao");
  const csv = await exportAdministrationBi(data, "csv");
  const text = new TextDecoder().decode(csv.body);
  assert.match(text, /Antônio Nunes/);
  assert.doesNotMatch(text, /Saúde/);
  assert.match(datasetCsv({ name: "Safety", columns: ["nome"], rows: [["=HYPERLINK(\"https://invalid.example\")"]] }), /'=HYPERLINK/);
  const excel = await exportAdministrationBi(data, "xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(excel.body));
  assert.equal(workbook.getWorksheet("Secretarias")?.rowCount, 2);
  assert.equal(workbook.getWorksheet("Secretarias")?.getCell("H2").value, 20);
  const powerbi = await exportAdministrationBi(data, "powerbi");
  const zip = await JSZip.loadAsync(powerbi.body);
  assert.ok(zip.file("Importar_Secretarias.pq"));
  assert.ok(zip.file("LEIA-ME.txt"));
  assert.equal(await zip.file("Secretarias.csv")!.async("string"), datasetCsv(datasets[1]));
});
