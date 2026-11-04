import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { hrReportCatalog } from "../src/lib/rh/report-catalog";
import { buildHrReport, hrReportInputSchema, renderHrReport } from "../src/lib/rh/report-service";

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const evidence: Array<{ id: number; kind?: string; result: string; rows?: number; bytes?: number; error?: string }> = [];
  try {
    await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const [holder] = (await tx.execute<{ id: string }>(sql`SELECT c."employeeId" id FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" WHERE r."payrollId"='RH_PORTAL_2026_V1:10' ORDER BY c.id LIMIT 1`)).rows;
      assert.ok(holder, "Titular original para verificação não encontrado.");
      assert.equal(hrReportCatalog.length, 131);
      for (const item of hrReportCatalog) {
        try {
          assert.ok(item.kind, `Modalidade ${item.id} sem implementação.`);
          const input = hrReportInputSchema.parse({ kind: item.kind, format: "CSV", q: "", employeeId: holder.id, year: item.kind === "INFORME_ANUAL_POC" ? 2025 : 2026,
            ...(item.kind === "INFORME_ANUAL_POC" ? {} : { referenceDate: new Date().toISOString().slice(0, 10), compareDate: "2026-10-31", ...(item.kind.startsWith("CADASTRO_") ? {} : { competence: "10/2026" }) }) });
          const report = await tx.transaction(scoped => buildHrReport(scoped, input, sql`true`, undefined, { clinicalRead: true }));
          assert.ok(report.headers.length);
          for (const row of report.rows) {
            assert.equal(row.length, report.headers.length, "Número de campos diferente do cabeçalho.");
            assert.ok(row.every(value => typeof value === "string"), "Campo não textual.");
          }
          const output = await renderHrReport(report, "CSV");
          assert.ok(output.bytes.length > 3);
          evidence.push({ id: item.id, kind: item.kind, result: "PASS", rows: report.rows.length, bytes: output.bytes.length });
        } catch (error) {
          const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
          const message = cause instanceof Error ? cause.message : String(cause);
          const missingSource = /não possui fotografia de rateio nem certificação documental|Preencha a identificação trabalhista e registre a fotografia cadastral/.test(message);
          evidence.push({ id: item.id, kind: item.kind, result: missingSource ? "BLOCKED_SOURCE" : "FAIL", error: message });
        }
      }
    }, { timeoutMs: 600000 });
    const result = { checkedAt: new Date().toISOString(), layer: "READ_ONLY_REPORT_SERVICES_AND_CSV_NOT_VISUAL_OR_LEGAL_ACCEPTANCE", clinicalRead: "EXPLICIT_SERVICE_CAPABILITY_NOT_AUTHENTICATED_PROFILE_VALIDATION", passed: evidence.filter(row => row.result === "PASS").length, blocked: evidence.filter(row => row.result === "BLOCKED_SOURCE").length, failed: evidence.filter(row => row.result === "FAIL").length, evidence };
    await writeFile("docs/RH_ETAPAS_RELATORIOS_VERIFICACAO.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    if (result.failed || result.blocked) process.exitCode = 1;
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
