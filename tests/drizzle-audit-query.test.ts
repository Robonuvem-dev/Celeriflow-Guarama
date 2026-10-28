import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { loadAuditEventPage, loadAuditEventSummary, loadAuditUsageSummary } from "../src/db/repositories/platform/audit-queries";
import { parseAuditEventQuery } from "../src/lib/platform/audit-query";

test("Auditoria SQL: cursor bidirecional estável em empates, filtros exatos e resumos", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "ConfiguracaoPerfil" (id TEXT PRIMARY KEY,nome TEXT);
      CREATE TABLE "Usuario" (id TEXT PRIMARY KEY,nome TEXT,email TEXT,"perfilId" TEXT NOT NULL REFERENCES "ConfiguracaoPerfil"(id));
      CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY,"actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id),"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP(3));
      INSERT INTO "ConfiguracaoPerfil" VALUES ('profile','Administrador');
      INSERT INTO "Usuario" VALUES ('actor-a','Ator A','a@example.test','profile'),('actor-b','Ator B','b@example.test','profile');
      INSERT INTO "AuditEvent" SELECT 'event-'||LPAD(i::text,3,'0'),CASE WHEN i<=21 THEN 'actor-a' ELSE 'actor-b' END,CASE WHEN i<=21 THEN 'DOCUMENT_DOWNLOAD' ELSE 'PAGE_VIEW' END,'DOCUMENT','doc-'||i,'2026-08-02T12:00:00Z'::timestamp FROM generate_series(1,45) i;
      INSERT INTO "AuditEvent" VALUES ('before','actor-a','PAGE_VIEW','PAGE','/before','2026-08-01T23:59:59.999Z'),('after','actor-a','PAGE_VIEW','PAGE','/after','2026-08-03T00:00:00Z'),('at-start','actor-a','PAGE_VIEW','PAGE','/start','2026-08-02T00:00:00Z'),('at-end','actor-a','PAGE_VIEW','PAGE','/end','2026-08-02T23:59:59.999Z');`);
    const db = drizzle(pg) as unknown as DatabaseExecutor;
    const filters = { from: "2026-08-02", to: "2026-08-02" };
    const first = await loadAuditEventPage(db, parseAuditEventQuery(filters));
    assert.equal(first.events.length, 20); assert.equal(first.previousCursor, undefined); assert.ok(first.nextCursor);
    assert.deepEqual(first.events[0].actorUsuario, { nome: "Ator A", email: "a@example.test", perfil: { nome: "Administrador" } });
    assert.ok(first.events[0].createdAt instanceof Date);
    const second = await loadAuditEventPage(db, parseAuditEventQuery({ ...filters, cursor: first.nextCursor }));
    assert.equal(second.events.length, 20); assert.ok(second.previousCursor); assert.ok(second.nextCursor);
    const third = await loadAuditEventPage(db, parseAuditEventQuery({ ...filters, cursor: second.nextCursor }));
    assert.equal(third.events.length, 7); assert.ok(third.previousCursor); assert.equal(third.nextCursor, undefined);
    const ids = [...first.events, ...second.events, ...third.events].map(row => row.id);
    assert.deepEqual(ids, ["at-end", ...Array.from({ length: 45 }, (_, index) => `event-${String(45 - index).padStart(3, "0")}`), "at-start"]);
    const backToFirst = await loadAuditEventPage(db, parseAuditEventQuery({ ...filters, cursor: second.previousCursor, direction: "previous" }));
    assert.deepEqual(backToFirst, first);
    const backToSecond = await loadAuditEventPage(db, parseAuditEventQuery({ ...filters, cursor: third.previousCursor, direction: "previous" }));
    assert.deepEqual(backToSecond, second);
    const matched = await loadAuditEventPage(db, parseAuditEventQuery({ ...filters, actorUsuarioId: "actor-a", eventType: "DOCUMENT_DOWNLOAD", targetType: "DOCUMENT", targetId: "doc-1" }));
    assert.deepEqual(matched.events.map(row => row.id), ["event-001"]);
    const literal = await loadAuditEventPage(db, parseAuditEventQuery({ targetId: "doc-' OR 1=1 --" }));
    assert.deepEqual(literal.events, []);
    const summary = await loadAuditEventSummary(db, filters, new Date("2026-08-02T00:00:00Z"));
    assert.equal(summary.total, 47); assert.equal(summary.recent, 47);
    assert.deepEqual(summary.eventGroups.sort((a, b) => a.eventType.localeCompare(b.eventType)), [{ eventType: "DOCUMENT_DOWNLOAD", _count: { _all: 21 } }, { eventType: "PAGE_VIEW", _count: { _all: 26 } }]);
    assert.deepEqual(summary.targetGroups.sort((a, b) => a.targetType.localeCompare(b.targetType)), [{ targetType: "DOCUMENT", _count: { _all: 45 } }, { targetType: "PAGE", _count: { _all: 2 } }]);
    const usage = await loadAuditUsageSummary(db, new Date("2026-08-02T00:00:00Z"));
    assert.equal(usage.totalEvents, 49); assert.equal(usage.eventsLast24Hours, 48);
    assert.deepEqual(usage.activeUsers.map(row => row.actorUsuarioId).sort(), ["actor-a", "actor-b"]);
  } finally { await pg.close(); }
});
