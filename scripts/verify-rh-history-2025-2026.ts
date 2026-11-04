import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { buildPocAnnualIncomeReport } from "../src/lib/rh/poc-payment";
import { getPayrollStatement, renderPayrollStatementPdf } from "../src/lib/rh/statement-service";
import { buildOwnPersonalReport } from "../src/lib/portal-servidor/personal-reports";
import { renderHrReport } from "../src/lib/rh/report-service";
import { personnelReportPresentation } from "../src/lib/rh/personnel-presentation";
import type { AppContext } from "../src/lib/platform/tenant-context";

const packageId = "RH_HISTORICO_2025_2026_V1";
const visibleMarkers = /\bPOC\b|_POC|POC_|DEMONSTRA[CÇ][AÃ]O|fict[íi]ci[oa]|marcações sintéticas|\bDEMO\b/i;
async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const { rows: runs } = await tx.execute<{ id: string; competence: string; type: string; statements: number; released: number; holders: number; balanced: boolean; net: string }>(sql`
        SELECT r.id,p.competence,p.type,count(s.id)::int statements,count(s.id) FILTER(WHERE s."releaseAt"<=now() AND s."revokedAt" IS NULL)::int released,count(DISTINCT c."employeeId")::int holders,
          bool_and(s.gross-s.deductions=s.net AND r.mode='OFICIAL' AND r.status='FECHADA') balanced,sum(s.net)::text net
        FROM "Payroll" p JOIN "HrPayrollRun" r ON r."payrollId"=p.id JOIN "HrPayrollStatement" s ON s."runId"=r.id JOIN "HrEmploymentContract" c ON c.id=s."contractId"
        WHERE starts_with(p.id,${packageId + ":"}) OR starts_with(p.id,'RH_PORTAL_2026_V1:') GROUP BY r.id,p.competence,p.type ORDER BY right(p.competence,4),left(p.competence,2),p.type`);
      assert.equal(runs.length, 19);
      const monthly = runs.filter(row => row.type === "Mensal");
      assert.equal(monthly.length, 13);
      assert.equal(new Set(monthly.filter(row => row.competence.endsWith("/2026")).map(row => row.competence)).size, 12);
      for (const run of runs) { assert.ok(run.balanced); assert.equal(run.statements, run.released); assert.equal(run.statements, run.holders); if (run.type !== "Férias") assert.equal(run.statements, 198); }
      assert.equal(runs.reduce((total, run) => total + run.statements, 0), 3414);
      const { rows: [reconciliation] } = await tx.execute<{ invalid: number }>(sql`
        SELECT count(*)::int invalid FROM "HrPayrollRun" r JOIN "Payroll" p ON p.id=r."payrollId"
        WHERE (starts_with(p.id,${packageId + ":"}) OR starts_with(p.id,'RH_PORTAL_2026_V1:')) AND (
          r.gross IS DISTINCT FROM (SELECT sum(s.gross) FROM "HrPayrollStatement" s WHERE s."runId"=r.id)
          OR r.net IS DISTINCT FROM (SELECT sum(s.net) FROM "HrPayrollStatement" s WHERE s."runId"=r.id)
          OR r.net IS DISTINCT FROM p."totalValueDecimal"
          OR r.net IS DISTINCT FROM (SELECT sum(CASE WHEN e.type='Vencimento' THEN i."valueDecimal" WHEN e.type='Desconto' THEN -i."valueDecimal" ELSE 0 END) FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=p.id))`);
      assert.equal(reconciliation.invalid, 0);
      const { rows: [attendance] } = await tx.execute<{ count: number; future: number; invalidFuture: number; months: number }>(sql`
        SELECT count(*)::int count,count(*) FILTER(WHERE date::date>=current_date)::int future,
          count(*) FILTER(WHERE date::date>=current_date AND (status NOT IN ('Previsto','Férias') OR "entryTime" IS NOT NULL OR "exitTime" IS NOT NULL OR "hoursWorked"<>0 OR "extraHours"<>0 OR "bankHours"<>0))::int "invalidFuture",
          count(DISTINCT to_char(date,'YYYY-MM'))::int months FROM "AttendanceRecord" WHERE starts_with(id,${packageId + ":"}) OR starts_with(id,'RH_PORTAL_2026_V1:')`);
      assert.equal(attendance.invalidFuture, 0); assert.ok(attendance.future > 0); assert.equal(attendance.months, 13);
      const { rows: [vacationReconciliation] } = await tx.execute<{ invalid: number; contracts: number }>(sql`
        SELECT count(*)::int contracts,count(*) FILTER(WHERE abs(monthly.gross+vac.gross-(monthly.snapshot#>>'{contract,salary}')::numeric*4/3)>0.01)::int invalid
        FROM "HrPayrollStatement" monthly JOIN "HrPayrollRun" mr ON mr.id=monthly."runId" JOIN "Payroll" mp ON mp.id=mr."payrollId"
        JOIN "HrPayrollStatement" vac ON vac."contractId"=monthly."contractId" JOIN "HrPayrollRun" vr ON vr.id=vac."runId" JOIN "Payroll" vp ON vp.id=vr."payrollId"
        WHERE mp.id=${packageId + ":2025:12:MENSAL"} AND vp.id=${packageId + ":2025:12:FERIAS"}`);
      assert.equal(vacationReconciliation.contracts, 18); assert.equal(vacationReconciliation.invalid, 0);
      const { rows: [thirteenth] } = await tx.execute<{ invalid: number; statements: number }>(sql`
        SELECT count(*)::int statements,count(*) FILTER(WHERE abs(s.gross-(s.snapshot#>>'{contract,salary}')::numeric)>0.01 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.snapshot->'items') i WHERE i->>'code'='POC_ABATIMENTO' AND (i->>'value')::numeric=round((s.snapshot#>>'{contract,salary}')::numeric/2,2)))::int invalid
        FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,${packageId + ":"}) AND p.type='13º'`);
      assert.equal(thirteenth.statements, 396); assert.equal(thirteenth.invalid, 0);
      const annual = await buildPocAnnualIncomeReport(tx, 2025);
      assert.equal(annual.rows.length, 198);
      for (const row of annual.rows) {
        assert.equal(row[16], "12");
        assert.ok(new Decimal(row[3]).add(row[4]).add(row[5]).sub(row[6]).sub(row[7]).eq(row[9]));
        assert.ok(new Decimal(row[4]).sub(row[11]).sub(row[12]).eq(row[13]));
      }
      assert.equal((await buildPocAnnualIncomeReport(tx, 2025, sql`false`)).rows.length, 0);
      const display = personnelReportPresentation(annual);
      assert.equal(visibleMarkers.test(JSON.stringify(display)), false);
      const { rows: samples } = await tx.execute<{ id: string; employeeId: string; type: string }>(sql`
        SELECT DISTINCT ON(p.type) s.id,c."employeeId",p.type FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,${packageId + ":2025:"}) ORDER BY p.type,s.id`);
      const pdfSamples: { type: string; bytes: number; pages: number }[] = [];
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      async function verifyPdf(bytes: Buffer, type: string) {
        assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
        const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
        const pdf = await loading.promise;
        let text = "";
        for (let page = 1; page <= pdf.numPages; page++) { const contents = await (await pdf.getPage(page)).getTextContent(); text += contents.items.map(item => "str" in item ? item.str : "").join(" "); }
        assert.match(text, /Vereda das Auroras/); assert.equal(visibleMarkers.test(text), false, `${type}: textos de apresentação`);
        pdfSamples.push({ type, bytes: bytes.length, pages: pdf.numPages }); await loading.destroy();
      }
      for (const sample of samples) {
        const statement = await getPayrollStatement(tx, sample.id, sample.employeeId);
        await verifyPdf(await renderPayrollStatementPdf(statement), sample.type);
        await assert.rejects(getPayrollStatement(tx, sample.id, "UNRELATED_EMPLOYEE"), /indisponível/);
      }
      const sample = samples[0];
      // Service ownership only: this context is not an authenticated browser session.
      const context: AppContext = { database: tx, user: { id: "HISTORY_VERIFICATION", firebaseUid: "", email: "", name: "History verification", role: "", profileCode: "", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: sample.employeeId, departmentId: null, secretariatId: null } };
      const certificate = await buildOwnPersonalReport(context, { kind: "INFORME_RENDIMENTOS", from: "2025-01-01", until: "2025-12-31" });
      const ownAnnual = await buildPocAnnualIncomeReport(tx, 2025, undefined, sample.employeeId);
      assert.equal(ownAnnual.rows.length, 1);
      assert.equal(certificate.rows.find(row => row[0] === "CPF")?.[1], ownAnnual.rows[0][1]);
      await verifyPdf((await renderHrReport(certificate, "PDF")).bytes, "Comprovante anual 2025");
      await assert.rejects(buildOwnPersonalReport(context, { kind: "INFORME_RENDIMENTOS", from: "2025-02-01", until: "2025-12-31" }), /ano-calendário completo/);
      await assert.rejects(buildOwnPersonalReport({ ...context, user: { ...context.user, employeeId: null } }, { kind: "INFORME_RENDIMENTOS", from: "2025-01-01", until: "2025-12-31" }), /indisponível/);
      const { rows: [storage] } = await tx.execute<{ databaseBytes: string; personnelBytes: string; size: string }>(sql`SELECT pg_database_size(current_database())::text "databaseBytes", (SELECT sum(pg_total_relation_size(quote_ident(tablename)))::text FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'Hr%' OR tablename IN ('Payroll','PayrollItem','PayrollEvent','AttendanceRecord','Vacation','Employee'))) "personnelBytes", pg_size_pretty(pg_database_size(current_database())) size`);
      const { rows: [original] } = await tx.execute<{ count: number; fingerprint: string }>(sql`SELECT count(*)::int count,md5(string_agg(s.id||':'||md5(s.snapshot::text)||':'||s.gross::text||':'||s.net::text,'|' ORDER BY s.id)) fingerprint FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,'RH_PORTAL_2026_V1:')`);
      assert.equal(original.count, 594);
      const baseline = JSON.parse(await readFile("docs/RH_HISTORICO_BASELINE_ORIGINAL_2026.json", "utf8")) as { count: number; fingerprint: string };
      assert.equal(original.count, baseline.count); assert.equal(original.fingerprint, baseline.fingerprint);
      return { checkedAt: new Date().toISOString(), result: "PASS", validationLayer: "READ_ONLY_DATABASE_AND_SERVICES_PDF_TEXT_NOT_AUTHENTICATED_BROWSER", packageId, employees: 198, statements: 3414, runs, reconciliation, attendance, vacationReconciliation, thirteenth, annual2025: { holders: annual.rows.length, months: 12, totals: Object.fromEntries([3, 4, 6, 7, 9].map(index => [annual.headers[index], annual.rows.reduce((total, row) => total.add(row[index]), new Decimal(0)).toFixed(2)])) }, pdfSamples, original, storage, realPayments: false, uploads: 0 };
    }, { timeoutMs: 600000 });
    await writeFile("docs/RH_HISTORICO_VERIFICACAO_2025_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
