import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { list } from "@vercel/blob";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPayrollStatement, renderPayrollStatementPdf } from "../src/lib/rh/statement-service";
import { buildOwnPersonalReport } from "../src/lib/portal-servidor/personal-reports";
import { buildHrReport, hrReportInputSchema, renderHrReport } from "../src/lib/rh/report-service";
import type { AppContext } from "../src/lib/platform/tenant-context";

// SELECT-only database transaction; Blob LIST only. PDFs stay in memory.
// Evidence contains aggregates, never names, identifiers, URLs or credentials.
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const packageId = "RH_PORTAL_2026_V1";
const coreNames = new Set(["Employee", "Role", "AttendanceRecord", "Dependent", "Leave", "Vacation", "PersonnelAct", "Payroll", "PayrollEvent", "PayrollItem", "PayrollBenefit", "BenefitConfig"]);
const summarize = (values: number[]) => ({ samples: values.length, minBytes: values.length ? Math.min(...values) : 0, meanBytes: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, maxBytes: values.length ? Math.max(...values) : 0, sumBytes: values.reduce((a, b) => a + b, 0) });

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const references = new Set<string>();
  try {
    const database = await withDatabaseTransaction(connection, async tx => {
      const query = async <T extends Record<string, unknown>>(text: string) => (await tx.execute<T>(sql.raw(text))).rows;
      const [capacity] = await query(`SELECT pg_database_size(current_database())::float8 AS "databaseBytes", current_setting('transaction_read_only') AS "readOnly"`);
      const relations = await query<{ table: string; heapBytes: number; tableIncludingToastBytes: number; indexBytes: number; totalBytes: number }>(`SELECT c.relname AS "table", pg_relation_size(c.oid)::float8 AS "heapBytes", pg_table_size(c.oid)::float8 AS "tableIncludingToastBytes", pg_indexes_size(c.oid)::float8 AS "indexBytes", pg_total_relation_size(c.oid)::float8 AS "totalBytes" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY pg_total_relation_size(c.oid) DESC`);
      const selected = relations.filter(row => row.table.startsWith("Hr") || row.table.startsWith("Sst") || coreNames.has(row.table));
      const counts = await query<{ table: string; count: number; rowRepresentationBytes: number }>(selected.map(row => `SELECT '${row.table}' AS "table", count(*)::int AS count, coalesce(sum(pg_column_size(t)),0)::float8 AS "rowRepresentationBytes" FROM ${identifier(row.table)} t`).join(" UNION ALL "));
      const tables = selected.map(row => ({ ...row, ...counts.find(count => count.table === row.table)!, scope: row.table.startsWith("Sst") ? "SST_ADJACENT" : "RH_CORE" }));
      const cohortSpecs = [
        { table: "AttendanceRecord", alias: "a", joins: "", period: `to_char(a.date,'YYYY-MM')`, where: `starts_with(a.id,'${packageId}:')` },
        { table: "Payroll", alias: "p", joins: "", period: `p.competence`, where: `starts_with(p.id,'${packageId}:')` },
        { table: "HrPayrollRun", alias: "r", joins: `JOIN "Payroll" p ON p.id=r."payrollId"`, period: `p.competence`, where: `starts_with(p.id,'${packageId}:')` },
        { table: "HrPayrollStatement", alias: "s", joins: `JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId"`, period: `p.competence`, where: `starts_with(p.id,'${packageId}:')` },
        { table: "PayrollItem", alias: "i", joins: `JOIN "Payroll" p ON p.id=i."payrollId"`, period: `p.competence`, where: `starts_with(p.id,'${packageId}:')` },
        { table: "HrPayrollItemOrigin", alias: "o", joins: `JOIN "HrPayrollRun" r ON r.id=o."runId" JOIN "Payroll" p ON p.id=r."payrollId"`, period: `p.competence`, where: `starts_with(p.id,'${packageId}:')` },
      ];
      const cohorts = await query<{ table: string; period: string; count: number; rowRepresentationBytes: number }>(cohortSpecs.map(c => `SELECT '${c.table}' AS "table", ${c.period} AS period,count(*)::int AS count,coalesce(sum(pg_column_size(${c.alias})),0)::float8 AS "rowRepresentationBytes" FROM ${identifier(c.table)} ${c.alias} ${c.joins} WHERE ${c.where} GROUP BY ${c.period}`).join(" UNION ALL "));
      const allocatedCohorts = cohorts.map(row => {
        const table = tables.find(table => table.table === row.table)!;
        return { ...row, estimatedPhysicalBytes: table.rowRepresentationBytes ? table.totalBytes * row.rowRepresentationBytes / table.rowRepresentationBytes : 0 };
      });
      const snapshots = await query(`SELECT p.competence,count(*)::int AS count, sum(pg_column_size(s.snapshot))::float8 AS "storedSnapshotBytes",sum(octet_length(s.snapshot::text))::float8 AS "snapshotJsonTextBytes" FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,'${packageId}:') GROUP BY p.competence ORDER BY p.competence`);
      const integration = await query(`SELECT "eventType",count(*)::int AS count,coalesce(sum(pg_column_size(e)),0)::float8 AS "rowRepresentationBytes" FROM "HrIntegrationEvent" e WHERE strpos("sourceKey",'${packageId}')>0 OR strpos(payload::text,'${packageId}')>0 GROUP BY "eventType" ORDER BY "eventType"`);
      const portalArtifacts = await query(`SELECT "eventType",status,count(*)::int AS count,coalesce(sum(pg_column_size(e)),0)::float8 AS "rowRepresentationBytes" FROM "HrIntegrationEvent" e WHERE domain='PORTAL' GROUP BY "eventType",status ORDER BY 1,2`);
      const fileReferences = await query<{ url: string }>(`SELECT payload->>'fileUrl' AS url FROM "HrIntegrationEvent" WHERE payload->>'fileUrl' IS NOT NULL UNION SELECT "documentUrl" FROM "PersonnelAct" WHERE "documentUrl" IS NOT NULL UNION SELECT d."fileUrl" FROM "Document" d WHERE d."personId" IN (SELECT "personId" FROM "Employee") UNION SELECT v."fileUrl" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE d."personId" IN (SELECT "personId" FROM "Employee")`);
      fileReferences.forEach(row => { if (row.url) references.add(row.url); });
      const samples = await query<{ id: string; employeeId: string; competence: string }>(`WITH ranked AS (SELECT s.id,c."employeeId",p.competence,row_number() OVER (PARTITION BY p.competence ORDER BY pg_column_size(s.snapshot),s.id) AS n,count(*) OVER (PARTITION BY p.competence) AS total FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE starts_with(p.id,'${packageId}:')) SELECT id,"employeeId",competence FROM ranked WHERE n IN (1,40,80,120,160,total) ORDER BY competence,n`);
      const receipts: number[] = [], attendance: number[] = [];
      for (const sample of samples) {
        const statement = await getPayrollStatement(tx, sample.id);
        receipts.push((await renderPayrollStatementPdf(statement, "00000000-0000-4000-8000-000000000000")).length);
        const [month, year] = sample.competence.split("/").map(Number);
        const from = `${year}-${String(month).padStart(2, "0")}-01`, until = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        // Service-level sizing context, not an authenticated Portal session.
        const context: AppContext = { database: tx, user: { id: "STORAGE_MEASUREMENT", firebaseUid: "", email: "", name: "Storage measurement", role: "", profileCode: "", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: sample.employeeId, departmentId: null, secretariatId: null } };
        const mirror = await buildOwnPersonalReport(context, { kind: "PONTO", from, until, format: "PDF" });
        attendance.push((await renderHrReport(mirror, "PDF")).bytes.length);
      }
      const reports = [];
      for (const parameters of [
        { kind: "FOLHA", competence: "10/2026" },
        { kind: "CADASTRO_GERAL", referenceDate: "2026-11-02" },
        { kind: "CARTAO_PONTO_132", from: "2026-10-01", until: "2026-10-31" },
        { kind: "HISTORICO_FUNCIONAL", referenceDate: "2026-11-02" },
      ]) {
        const report = await buildHrReport(tx, hrReportInputSchema.parse({ ...parameters, format: "CSV" }));
        const sizes: Record<string, number> = {};
        for (const format of ["CSV", "PDF", "XLSX"] as const) sizes[format] = (await renderHrReport(report, format)).bytes.length;
        reports.push({ ...parameters, rows: report.rows.length, bytes: sizes });
      }
      const [employees] = await query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE "isActive")::int AS active FROM "Employee"`);
      return { capacity, employees, publicRelationsBytes: relations.reduce((sum, row) => sum + row.totalBytes, 0), tables, cohorts: allocatedCohorts, snapshots, integration, portalArtifacts, receiptPdf: summarize(receipts), monthlyAttendancePdf: summarize(attendance), reportSamples: reports, topPublicRelations: relations.slice(0, 12) };
    }, { accessMode: "read only", isolationLevel: "repeatable read", timeoutMs: 180000 });
    let cursor: string | undefined;
    let listCalls = 0, count = 0, bytes = 0, instanceCount = 0, instanceBytes = 0, referencedCount = 0, referencedBytes = 0;
    const groups: Record<string, { count: number; bytes: number }> = {};
    const prefix = `instances/${process.env.CELERIFLOW_INSTANCE_ID}/documents/`;
    do {
      const page = await list({ token: process.env.BLOB_READ_WRITE_TOKEN, limit: 1000, cursor });
      listCalls++;
      for (const blob of page.blobs) {
        count++; bytes += blob.size;
        if (references.has(blob.url)) { referencedCount++; referencedBytes += blob.size; }
        if (blob.pathname.startsWith(prefix)) {
          instanceCount++; instanceBytes += blob.size;
          const relative = blob.pathname.slice(prefix.length), group = relative.includes("/") ? relative.split("/")[0] : "ROOT";
          const total = groups[group] ??= { count: 0, bytes: 0 };
          total.count++; total.bytes += blob.size;
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const coreBytes = database.tables.filter(row => row.scope === "RH_CORE").reduce((sum, row) => sum + row.totalBytes, 0);
    const integrationTable = database.tables.find(row => row.table === "HrIntegrationEvent")!;
    const integrationBytes = database.integration.filter(row => row.eventType !== "PARAMETROS_POC_INSTALADOS").reduce((sum, row) => sum + Number(row.rowRepresentationBytes), 0) / integrationTable.rowRepresentationBytes * integrationTable.totalBytes;
    // All current movements are conservatively amortized as recurring monthly cost.
    const recurringThreeBytes = database.cohorts.reduce((sum, row) => sum + row.estimatedPhysicalBytes, 0) + integrationBytes + database.tables.find(row => row.table === "HrMovement")!.totalBytes;
    const fixedBytes = coreBytes - recurringThreeBytes;
    const active = Number(database.employees.active);
    const projections = [3, 12, 24].map(months => {
      const statements = active * months;
      const incrementalBytes = recurringThreeBytes * (months / 3 - 1);
      return { months, statements, attendanceRowsAt21DaysPerMonth: active * 21 * months, rhCoreBytes: fixedBytes + recurringThreeBytes * months / 3, incrementalDatabaseBytes: incrementalBytes, entireDatabaseBytes: Number(database.capacity.databaseBytes) + incrementalBytes, receiptBlobBytesAt100PercentAccess: database.receiptPdf.meanBytes * statements, attendanceBlobBytesOnlyIfExplicitlyArchived: database.monthlyAttendancePdf.meanBytes * statements, receiptEventDatabaseReserveBytesAt100PercentAccess: statements * 2000, entireDatabasePlanningBytes: Number(database.capacity.databaseBytes) + incrementalBytes * 1.5 + statements * 2000 };
    });
    const result = { checkedAt: new Date().toISOString(), mode: "READ_ONLY_DATABASE_AND_BLOB_LIST", units: "bytes; MB = 1,000,000 bytes", packageId, database, blob: { storeCount: count, storeBytes: bytes, instanceCount, instanceBytes, listCalls, groups, rhAndIntegrationReferencedCount: referencedCount, rhAndIntegrationReferencedBytes: referencedBytes, referenceScope: "All integration fileUrl values plus personnel acts and documents linked to employee persons; not a complete RH attachment inventory" }, projectionModel: { coreBytes, recurringThreeBytes, fixedBytes, assumptions: ["198 employees, one monthly payroll, 21 attendance days per month", "Existing configuration and registrations counted once", "All current movements and historical package integration events amortized over three months", "Planning adds 50% of incremental database growth plus 2000 bytes per cached receipt event; reserve is an assumption, not measured receipt-event cost", "No additional payroll types, mass scanned attachments, official postings or activity-dependent audit growth modeled"], projections }, limitations: ["pg_database_size is current database size, not account/project billing, WAL, history or other branches", "Physical cohort attribution is estimated proportionally to pg_column_size; only whole-table physical sizes are exact", "PDF sample is deterministic and stratified by stored snapshot size (18); no artifact uploaded", "Blob list is the store accessible by the configured token; no account billing/operations history available", "SST is shown separately and canonical Person/Document shared tables are not wholly attributed to RH"] };
    await writeFile("docs/RH_ARMAZENAMENTO_MEDICAO_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na medição"); process.exitCode = 1; });
