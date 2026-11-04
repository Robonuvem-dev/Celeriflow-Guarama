import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { withDatabaseTransaction } from '../src/db/transaction';
import { buildHrReport, hrReportInputSchema, renderHrReport } from '../src/lib/rh/report-service';
import { hrReportCatalog } from '../src/lib/rh/report-catalog';

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const evidence = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const [preserved] = (await tx.execute<{ holders: number; runs: number; statements: number }>(sql`SELECT count(DISTINCT c."employeeId")::int holders,count(DISTINCT r.id)::int runs,count(s.id)::int statements FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" JOIN "HrEmploymentContract" c ON c.id=s."contractId" WHERE starts_with(p.id,'RH_HISTORICO_2025_2026_V1:') OR starts_with(p.id,'RH_PORTAL_2026_V1:')`)).rows;
      assert.deepEqual(preserved, { holders: 198, runs: 19, statements: 3414 });
      const [original] = (await tx.execute<{ count: number; fingerprint: string }>(sql`SELECT count(*)::int count,md5(string_agg(s.id||':'||md5(s.snapshot::text)||':'||s.gross::text||':'||s.net::text,'|' ORDER BY s.id)) fingerprint FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,'RH_PORTAL_2026_V1:')`)).rows;
      const baseline = JSON.parse(await readFile('docs/RH_HISTORICO_BASELINE_ORIGINAL_2026.json','utf8')) as { count: number; fingerprint: string };
      assert.equal(original.count, baseline.count); assert.equal(original.fingerprint, baseline.fingerprint);
      assert.equal(hrReportCatalog.length, 131); assert.equal(new Set(hrReportCatalog.map(row => row.id)).size, 131);
      const input = hrReportInputSchema.parse({ kind: 'CONTRIBUICAO_SINDICAL_NT202', format: 'CSV', year: 2026 });
      const report = await buildHrReport(tx, input, sql`true`, undefined, { clinicalRead: false });
      assert.ok(report.headers.includes('PIS')); assert.ok(report.headers.includes('Valor recolhido BRL'));
      const exports: Record<string, number> = {};
      for (const format of ['CSV','PDF','XLSX'] as const) { const output = await renderHrReport(report, format); assert.ok(output.bytes.length); exports[format] = output.bytes.length; }
      return { checkedAt: new Date().toISOString(), result: 'PASS', layer: 'READ_ONLY_DATABASE_AND_REPORT_EXPORTS_NOT_VISUAL_OR_BANK_HOMOLOGATION', preserved, original, catalogReports: 131, unionReportRows: report.rows.length, unionExportsBytes: exports, newPayments: 0, newPortalAccounts: 0, schemaMigrations: 0 };
    }, { timeoutMs: 120000 });
    await writeFile('docs/RH_E5_VERIFICACAO_2026.json', JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
