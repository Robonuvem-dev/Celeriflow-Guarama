import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { persistPlanningReport } from "../src/lib/planejamento/reports";
import { listPlanningPublications, publishPlanningReport, readPlanningArchivedFile, withdrawPlanningPublication, type PlanningPublicationStorage } from "../src/lib/planejamento/publication";
import { publicPlanningPublicationResponse } from "../src/lib/planejamento/publication-response";
import { addProgramPPA } from "../src/lib/financeiro/planejamento";
import { addApprovedPlanningLine } from "../src/lib/planejamento/service";
import { randomUUID } from "node:crypto";

function storageFixture() {
  const files = new Map<string, Uint8Array>(); let calls = 0;
  const storage: PlanningPublicationStorage = { put: async (filename, bytes) => { calls++; const url = `isolated://planning/${filename}`; files.set(url, new Uint8Array(bytes)); return url; }, get: async (url) => files.get(url) ?? null };
  return { storage, files, calls: () => calls };
}

test("S8: arquivo PDF idêntico no download privado e HTTP público, replay e retirada preservada", async () => {
  const f = await createPlanningAccountingFixture(); const stored = storageFixture();
  try {
    const snapshot = await persistPlanningReport(f.context, { instrumentIds: f.loa, type: "LAW4320_1", asOf: "2026-09-30" });
    const input = { snapshotId: snapshot.id, format: "PDF", reason: "Conferência pública do documento orçamentário" };
    const publication = await publishPlanningReport(f.context, input, stored.storage);
    const replay = await publishPlanningReport(f.context, input, stored.storage);
    assert.equal(replay.publicUrl, publication.publicUrl); assert.equal(stored.calls(), 1);
    const archived = await readPlanningArchivedFile(f.context, snapshot.id, "PDF", stored.storage); assert.ok(archived);
    assert.ok(Buffer.from(archived.bytes).toString("ascii", 0, 5).startsWith("%PDF-"));
    const key = publication.publicUrl.split("/").pop()!;
    const server = createServer(async (_request, response) => {
      const result = await publicPlanningPublicationResponse(f.db, key, stored.storage);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const result = await fetch(`http://127.0.0.1:${address.port}/api/transparencia/planejamento/${key}`);
      const bytes = new Uint8Array(await result.arrayBuffer()); assert.equal(result.status, 200);
      assert.deepEqual(bytes, archived.bytes); assert.equal(result.headers.get("x-report-file-sha256"), createHash("sha256").update(bytes).digest("hex"));
      assert.equal(result.headers.get("x-planning-completeness"), "REVIEW_COPY_NOT_STATUTORY");
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    const listed = await listPlanningPublications(f.db, { year: 2026, entity: "Araucárias" }); assert.equal(listed.total, 1);
    assert.ok(!JSON.stringify(listed.records).includes(snapshot.id), "projeção pública não expõe ID interno do snapshot");
    await withdrawPlanningPublication(f.context, { publicationId: publication.id, reason: "Substituição após conferência" });
    assert.equal((await publicPlanningPublicationResponse(f.db, key, stored.storage)).status, 404);
    await assert.rejects(publishPlanningReport(f.context, input, stored.storage), /retirado/);
    await assert.rejects(f.pg.query('UPDATE "PlanningReportPublication" SET "fileHash"=$1 WHERE id=$2', ["0".repeat(64), publication.id]), /immutable/);
    await assert.rejects(f.pg.query('DELETE FROM "PlanningPublicationEvent" WHERE "publicationId"=$1', [publication.id]), /immutable/);
  } finally { await f.close(); }
});

test("S8: falha de storage/sondagem não publica; retry reaproveita identidade e arquivo verificado", async () => {
  const f = await createPlanningAccountingFixture(); const stored = storageFixture();
  try {
    const snapshot = await persistPlanningReport(f.context, { instrumentIds: f.loa, type: "REVENUE", asOf: "2026-09-30" });
    const input = { snapshotId: snapshot.id, format: "CSV", reason: "Publicação após conferência" };
    const failing = { ...stored.storage, get: async () => new Uint8Array([1, 2, 3]) };
    await assert.rejects(publishPlanningReport(f.context, input, failing), /hash divergente/);
    const failed = await f.db.planningReportPublication.findFirstOrThrow(); assert.equal(failed.status, "FAILED");
    assert.equal((await listPlanningPublications(f.db, {})).total, 0);
    assert.equal((await publicPlanningPublicationResponse(f.db, failed.publicKey, stored.storage)).status, 404);
    const completed = await publishPlanningReport(f.context, input, stored.storage);
    assert.equal(completed.id, failed.id); assert.equal(stored.calls(), 1); assert.equal(completed.status, "PUBLISHED");
    assert.equal((await f.db.planningReportPublication.findUniqueOrThrow({ where: { id: failed.id } })).attempts, 2);
    assert.equal(await f.db.planningPublicationEvent.count({ where: { publicationId: failed.id, type: "FAILED" } }), 1);
  } finally { await f.close(); }
});

test("S8: lease impede uploads concorrentes e a transição não permite editor Financeiro em peça adotada", async () => {
  const f = await createPlanningAccountingFixture(); const stored = storageFixture();
  try {
    const snapshot = await persistPlanningReport(f.context, { instrumentIds: f.loa, type: "EXPENSE", asOf: "2026-09-30" });
    let ready!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; }); const released = new Promise<void>((resolve) => { release = resolve; });
    const delayed: PlanningPublicationStorage = { ...stored.storage, put: async (...args) => { ready(); await released; return stored.storage.put(...args); } };
    const input = { snapshotId: snapshot.id, format: "CSV", reason: "Conferência administrativa" };
    const first = publishPlanningReport(f.context, input, delayed); await started;
    try { await assert.rejects(publishPlanningReport(f.context, input, stored.storage), /processamento/); } finally { release(); }
    await first; assert.equal(stored.calls(), 1);
    const ppa = await f.db.planningInstrument.findUniqueOrThrow({ where: { id: f.ppa } });
    await assert.rejects(addProgramPPA(f.db, { usuarioId: "ana", employeeId: "servidora-ana" }, { multiYearPlanId: ppa.multiYearPlanId!, code: "9999", name: "Programa pelo caminho antigo" }), /adotada/);
  } finally { await f.close(); }
});

test("S8: permissão/escopo e peça não publicada recusam exposição pública", async () => {
  const f = await createPlanningAccountingFixture(); const stored = storageFixture();
  try {
    const snapshot = await persistPlanningReport(f.context, { instrumentIds: f.loa, type: "REVENUE", asOf: "2026-09-30" });
    const limited = { ...f.context, user: { ...f.context.user, profileCode: "BUDGET_ANALYST", permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, update: true, issueReports: true, legalApproval: true }, TRANSPARENCIA: { blocked: true } } }) } };
    await assert.rejects(publishPlanningReport(limited, { snapshotId: snapshot.id, reason: "Tentativa sem autorização" }, stored.storage), /Transparência/);
    await addApprovedPlanningLine(f.context, { ...f.expenseInput, code: "OUTRA-UG", description: "Dotação de outra unidade", budgetUnitId: "ug-restrita", originalValue: "0.00", effectiveAt: "2026-03-01", legalActNumber: "Lei 3/2026", legalText: "Nova classificação", reason: "Nova unidade", submissionKey: randomUUID() });
    const partial = { ...limited, user: { ...limited.user, permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, update: true, issueReports: true, legalApproval: true }, TRANSPARENCIA: { blocked: false, create: true } } }) } };
    await assert.rejects(publishPlanningReport(partial, { snapshotId: snapshot.id, reason: "Tentativa com escopo parcial" }, stored.storage), /todas as unidades/);
    await f.db.annualBudgetLaw.updateMany({ data: { status: "SANCTIONED" } });
    await assert.rejects(publishPlanningReport(f.context, { snapshotId: snapshot.id, reason: "Tentativa antes da publicação legal" }, stored.storage), /fluxo legal/);
    assert.equal(stored.calls(), 0);
  } finally { await f.close(); }
});
