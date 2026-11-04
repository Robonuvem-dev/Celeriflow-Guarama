import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { hrReportCatalog } from "../src/lib/rh/report-catalog";
import { buildHrReport, hrReportInputSchema, renderHrReport } from "../src/lib/rh/report-service";
import { operationalReportKinds } from "../src/lib/rh/operational-reports";
import { Decimal } from "../src/db/decimal";

async function main() {
  if (!process.argv.includes("--run-final")) {
    console.log(JSON.stringify({ mode: "DEFERRED_F7", ids: hrReportCatalog.map(item => item.id), requires: "--run-final", layer: "database-and-emission; not visual, external or legal acceptance" }));
    return;
  }
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const evidence: Array<{ id: number; kind?: string; status: string; rows?: number; bytes?: number; error?: string; limitation?: string }> = [];
  try {
    assert.deepEqual(hrReportCatalog.map(item => item.id), Array.from({ length: 74 }, (_, index) => index + 1));
    for (const item of hrReportCatalog) {
      if (!item.kind) { evidence.push({ id: item.id, status: "NOT_IMPLEMENTED", limitation: item.limitation }); continue; }
      try {
        const extended = (operationalReportKinds as readonly string[]).includes(item.kind);
        const input = hrReportInputSchema.parse({ kind: item.kind, format: "CSV", q: "", ...(extended ? { referenceDate: "2026-11-02" } : item.kind === "INFORME_ANUAL_POC" ? { year: 2026 } : ["PENSOES", "MARGEM_CONSIGNAVEL"].includes(item.kind) ? { competence: "10/2026" } : {}) });
        const report = await buildHrReport(connection.db, input, sql`true`);
        assert.ok(report.headers.length > 0);
        for (const row of report.rows) { assert.equal(row.length, report.headers.length, "Cabeçalho e registros devem ter os mesmos campos."); assert.ok(row.every(value => typeof value === "string")); }
        const csv = await renderHrReport(report, "CSV");
        assert.ok(csv.bytes.length > 3);
        if (report.print?.kind === "matrix132") {
          const text = await renderHrReport(report, "TXT");
          assert.ok(text.bytes.toString("ascii").trimEnd().length > 0);
          for (const line of text.bytes.toString("ascii").split("\r\n").slice(0, -1)) assert.equal(line.length, 132);
        }
        evidence.push({ id: item.id, kind: item.kind, status: "SERVICE_AND_CSV_PASS", rows: report.rows.length, bytes: csv.bytes.length, limitation: item.limitation });
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        evidence.push({ id: item.id, kind: item.kind, status: "FAIL", error: cause instanceof Error ? cause.message : "Falha na emissão" });
      }
    }
    const checks: string[] = [];
    const expected = await connection.db.execute<{ gross: string; deductions: string; net: string; employer: string }>(sql`SELECT sum(s.gross)::text gross,sum(s.deductions)::text deductions,sum(s.net)::text net,sum(s.employer)::text employer FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" WHERE r.status='FECHADA' AND r.mode='OFICIAL' AND r.scope='DEMONSTRACAO' AND "Payroll".competence IN ('08/2026','09/2026','10/2026')`);
    for (const item of hrReportCatalog.filter(item => item.id >= 65 && item.id <= 72)) {
      const report = await buildHrReport(connection.db, hrReportInputSchema.parse({ kind: item.kind, format: "CSV", from: "2026-08-01", until: "2026-10-31" }));
      const line = report.headers.indexOf("Tipo da linha"), rubric = report.headers.indexOf("Rubrica / totalizador");
      for (const [code, key] of [["BRUTO", "gross"], ["DESCONTOS", "deductions"], ["LIQUIDO", "net"], ["ENCARGOS", "employer"]] as const) {
        const total = report.rows.filter(row => row[line] === "TOTAL_NAO_ADITIVO" && row[rubric] === code).reduce((sum, row) => sum.plus(row.at(-1)!), new Decimal(0));
        assert.ok(total.eq(expected.rows[0][key]), `Visão ${item.id}/${code} deve conciliar com os demonstrativos originais.`);
      }
      const denied = await buildHrReport(connection.db, hrReportInputSchema.parse({ kind: item.kind, format: "CSV" }), sql`false`, []);
      assert.equal(denied.rows.length, 0, `Visão ${item.id} deve respeitar escopo vazio.`);
    }
    checks.push("oito visões contábeis conciliadas ao bruto/descontos/líquido/encargos originais; escopo negado vazio");
    const [employee] = (await connection.db.execute<{ id: string; departmentId: string }>(sql`SELECT id,"departmentId" FROM "Employee" WHERE "isActive" ORDER BY id LIMIT 1`)).rows;
    for (const kind of ["CADASTRO_GERAL", "CADASTRO_DOTACAO", "CADASTRO_LOTACAO", "CADASTRO_LOCAL"]) {
      const input = hrReportInputSchema.parse({ kind, format: "CSV", employeeId: employee.id, referenceDate: "2026-10-31" });
      const report = await buildHrReport(connection.db, input);
      assert.ok(report.rows.length > 0 && report.rows.every(row => row[report.headers.indexOf("Servidor ID")] === employee.id));
      const before = report.rows.map(row => row[report.headers.indexOf("Salário-base BRL")]);
      const after = await buildHrReport(connection.db, { ...input, referenceDate: "2026-11-02" });
      assert.notDeepEqual(before, after.rows.map(row => row[after.headers.indexOf("Salário-base BRL")]));
    }
    checks.push("filtros cadastrais por titular e salários históricos de outubro distintos de novembro");
    for (const kind of ["ETIQUETAS_SERVIDORES", "ETIQUETAS_CARTAO_PONTO", "CARTAO_PONTO_132", "ATS_COLETIVO", "HISTORICO_FUNCIONAL"]) {
      const report = await buildHrReport(connection.db, hrReportInputSchema.parse({ kind, format: "PDF", employeeId: employee.id, referenceDate: "2026-11-02" }));
      const pdf = await renderHrReport(report, "PDF");
      assert.equal(pdf.bytes.subarray(0, 4).toString(), "%PDF");
      const xlsx = await renderHrReport(report, "XLSX");
      assert.equal(xlsx.bytes.subarray(0, 2).toString(), "PK");
    }
    checks.push("PDF e XLSX emitidos para amostras por titular de etiquetas/cartão/ATS/histórico");
    const result = { recordedAt: new Date().toISOString(), layer: "database-and-service-not-browser", result: evidence.every(item => item.status === "SERVICE_AND_CSV_PASS") ? "PASS" : "FAIL", acceptance: "This does not certify POC completeness, PDF/XLSX geometry, external integration or municipal rules.", checks, evidence };
    await writeFile("docs/RH_POC_RELATORIOS_VERIFICACAO_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    if (result.result !== "PASS") process.exitCode = 1;
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
