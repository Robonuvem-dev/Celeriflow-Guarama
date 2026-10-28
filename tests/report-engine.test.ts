import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { auditEvents } from "../src/db/schema/audit";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { createReportExecution, isReportFormat, renderReport, writeReportIssuanceAudit, type AuthorizedReportExecution } from "../src/lib/reports/report-engine.ts";

test("recognizes only the ReportEngine formats", () => {
  assert.equal(isReportFormat("preview"), true);
  assert.equal(isReportFormat("pdf"), true);
  assert.equal(isReportFormat("csv"), true);
  assert.equal(isReportFormat("xlsx"), true);
  assert.equal(isReportFormat("txt"), true);
  assert.equal(isReportFormat("print"), true);
  assert.equal(isReportFormat("PDF"), false);
});

test("builds an execution without changing the authorized dataset", () => {
  const definition = { key: "test.report" };
  const dataset = { title: "Dataset canônico" };

  const execution = createReportExecution(definition, "preview", dataset);

  assert.deepEqual(execution, { key: "test.report", format: "preview", dataset });
  assert.equal(execution.dataset, dataset);
});

test("routes each supported renderer and leaves previews unrendered", async () => {
  const execution = { key: "test.report", format: "xlsx", dataset: { title: "Dataset" }, context: {}, definition: {} } as never as AuthorizedReportExecution<never, { title: string }>;
  const rendered = await renderReport(execution, {
    xlsx: () => "xlsx",
  });

  assert.equal(rendered, "xlsx");
  await assert.rejects(() => renderReport({ ...execution, format: "preview" }, { xlsx: () => "xlsx" }), /Formato de relatório não suportado/);
});

test("audits every non-preview report with the definition identifier", async () => {
  const definition = {
    key: "test.report",
    moduleCode: "TEST",
    createDataset: async () => ({ title: "unused" }),
    auditTarget: () => ({ targetType: "REPORT_DEFINITION", targetId: "test.report" }),
  };
  const fixture = await createLocalDrizzleDatabase();
  try {
    const baseline = readFileSync(new URL("../prisma/migrations-ibema/20261009232000_baseline/migration.sql", import.meta.url), "utf8");
    const table = baseline.match(/CREATE TABLE "AuditEvent" \([\s\S]*?\n\);/)?.[0];
    assert.ok(table);
    await fixture.database.exec(table);
    const context = { user: { id: "user-1" }, database: fixture.connection.db };
    for (const format of ["preview", "pdf", "csv", "xlsx", "txt", "print"] as const) {
      await writeReportIssuanceAudit({ key: "test.report", format, dataset: { title: "Private report data" }, context, definition } as never as AuthorizedReportExecution<never, { title: string }>);
      const rows = await fixture.connection.db.select().from(auditEvents);
      assert.equal(rows.length, format === "preview" ? 0 : ["pdf", "csv", "xlsx", "txt", "print"].indexOf(format) + 1);
    }
    const rows = await fixture.connection.db.select().from(auditEvents);
    assert.equal(new Set(rows.map(row => row.id)).size, 5);
    for (const row of rows) {
      assert.ok(row.createdAt instanceof Date);
      const { id, createdAt, ...evidence } = row;
      assert.ok(id); assert.ok(createdAt);
      assert.deepEqual(evidence, { actorUsuarioId: "user-1", eventType: "REPORT_ISSUED", targetType: "REPORT_DEFINITION", targetId: "test.report" });
    }
    assert.equal(JSON.stringify(rows).includes("Private report data"), false);
  } finally { await fixture.close(); }
});
