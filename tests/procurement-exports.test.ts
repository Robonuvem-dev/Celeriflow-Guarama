import assert from "node:assert/strict";
import test from "node:test";
import { getProcurementExportDownload, listProcurementExportBoard, queueProcurementExport, recordProcurementExportOutcome } from "../src/lib/integrations/procurement-exports.ts";
import { createProcurementDrizzleFixture } from "./helpers/procurement-drizzle-fixture";

test("queued procurement packages are downloadable, audited, and manually confirmed without a network dispatch", async () => {
  const f = await createProcurementDrizzleFixture({ resultReady: true });
  try {
    const input = { packageCode: "PNCP_PROCUREMENT" as const, targetId: "bidding-1", actorUsuarioId: "buyer-1" };
    const queued = await queueProcurementExport(f.connection, input);
    assert.equal(queued.status, "QUEUED");
    assert.equal((await queueProcurementExport(f.connection, input)).runId, queued.runId);
    assert.equal((await f.runs()).length, 1);
    const [run] = await f.runs();
    assert.equal(run.payload.state, "QUEUED");
    assert.deepEqual((run.payload.exportPackage as { delivery: unknown }).delivery, {
      state: "QUEUED", mode: "MANUAL_EXTERNAL_HANDOFF",
      note: "Pacote POC preparado para o operador. Nenhuma transmissao de rede ou confirmacao externa foi executada por este fluxo.",
    });
    const board = await listProcurementExportBoard(f.connection.db);
    assert.equal(board.find(row => row.packageCode === "PNCP_PROCUREMENT")?.runId, queued.runId);
    const download = await getProcurementExportDownload(f.connection.db, queued.runId, "buyer-1");
    assert.equal(download.filename, `pncp_procurement-LIC-2026-001-${queued.runId}.json`);
    assert.match(download.content, /MANUAL_EXTERNAL_HANDOFF/);
    const outcomeInput = { runId: queued.runId, status: "CONFIRMED" as const, externalReference: "PROTOCOLO-2026-001", actorUsuarioId: "buyer-1" };
    const confirmed = await recordProcurementExportOutcome(f.connection, outcomeInput);
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal((await recordProcurementExportOutcome(f.connection, outcomeInput)).reused, true);
    await assert.rejects(recordProcurementExportOutcome(f.connection, { ...outcomeInput, status: "REJECTED" }), /terminal/);
    const payload = (await f.runs())[0].payload;
    assert.equal(payload.state, "CONFIRMED");
    const outcome = payload.outcome as { reference: string; recordedAt: string; source: string };
    assert.equal(outcome.reference, "PROTOCOLO-2026-001");
    assert.equal(outcome.source, "EXTERNAL_OPERATOR_RECORD");
    assert.match(outcome.recordedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal((await f.audits()).length, 3);
  } finally { await f.close(); }
});

test("configuration and source validation persist explicit pending and rejected package states", async () => {
  const f = await createProcurementDrizzleFixture({ connectionStatus: "CONFIGURANDO" });
  try {
    const input = { packageCode: "PNCP_PROCUREMENT" as const, targetId: "bidding-1", actorUsuarioId: "buyer-1" };
    const pending = await queueProcurementExport(f.connection, input);
    assert.equal(pending.status, "PENDING_CONFIGURATION");
    assert.equal((await f.runs())[0].payload.exportPackage, undefined);
    await f.pg.exec(`UPDATE "IntegrationConnection" SET status='ATIVA'`);
    assert.equal((await queueProcurementExport(f.connection, input)).status, "QUEUED");
    assert.equal((await f.runs()).length, 2);
    const rejected = await queueProcurementExport(f.connection, { ...input, packageCode: "PNCP_PROCEDURE_RESULT" });
    assert.equal(rejected.status, "REJECTED");
    const run = (await f.runs()).find(row => row.id === rejected.runId)!;
    assert.equal(run.payload.exportPackage, undefined);
    assert.deepEqual(run.payload.validation, {
      code: "CURRENT_RESULT_REQUIRED", message: "O pacote de procedimento e resultado exige resultado atual para todos os lotes da licitacao.",
    });
  } finally { await f.close(); }
});

test("procurement package and outcome roll back together with their audit evidence", async () => {
  const f = await createProcurementDrizzleFixture();
  try {
    const input = { packageCode: "PNCP_PROCUREMENT" as const, targetId: "bidding-1", actorUsuarioId: "buyer-1" };
    await f.pg.exec(`CREATE FUNCTION fail_export_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'export audit rollback'; END $$; CREATE TRIGGER fail_export_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_export_audit()`);
    await assert.rejects(queueProcurementExport(f.connection, input), error => error instanceof Error && error.cause instanceof Error && /export audit rollback/.test(error.cause.message));
    assert.equal((await f.runs()).length, 0);
    await f.pg.exec('DROP TRIGGER fail_export_audit ON "AuditEvent"');
    const queued = await queueProcurementExport(f.connection, input);
    await f.pg.exec('CREATE TRIGGER fail_export_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fail_export_audit()');
    await assert.rejects(recordProcurementExportOutcome(f.connection, { runId: queued.runId, status: "CONFIRMED", externalReference: "EXTERNAL-1", actorUsuarioId: "buyer-1" }), error => error instanceof Error && error.cause instanceof Error && /export audit rollback/.test(error.cause.message));
    assert.equal((await f.runs())[0].payload.state, "QUEUED");
    assert.equal((await f.audits()).length, 1);
  } finally { await f.close(); }
});
