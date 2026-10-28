import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import { loadAuditEventPage, loadAuditEventSummary, loadAuditUsageSummary } from "../src/db/repositories/platform/audit-queries";
import { parseAuditEventQuery, type AuditEventFilters, type AuditEventQuery } from "../src/lib/platform/audit-query";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { z } from "zod";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

type LegacyHelpers = {
  buildAuditEventWhere: (filters: AuditEventFilters) => import("@prisma/client").Prisma.AuditEventWhereInput;
  buildAuditEventPageQuery: (query: AuditEventQuery) => import("@prisma/client").Prisma.AuditEventFindManyArgs;
  createAuditEventPage: <T extends { id: string; createdAt: Date }>(records: T[], query: AuditEventQuery) => { events: T[]; nextCursor?: string; previousCursor?: string };
};

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL), connection = createDatabaseConnection(process.env.DATABASE_URL);
  const source = execFileSync("git", ["show", "3f05dcd:src/lib/platform/audit-query.ts"], { encoding: "utf8" });
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helpers = {} as LegacyHelpers;
  new Function("exports", "require", code)(helpers, (id: string) => {
    if (id === "zod") return { z };
    assert.equal(id, "./audit-evidence"); return { auditEventTypes };
  });
  let comparisons = 0;
  try {
    const [actor] = await legacy.usuario.findMany({ select: { id: true }, take: 1 });
    const last24Hours = new Date(Date.now() - 86_400_000);
    const scenarios = [{}, { actorUsuarioId: actor?.id }, { targetType: "DOCUMENT" }, { eventType: "PAGE_VIEW" }, { targetId: "' OR 1=1 --" }, { from: "2026-10-01", to: "2026-10-28" }, { from: "2024-01-01", to: "2024-01-02" }];
    for (const search of scenarios) {
      let query = parseAuditEventQuery(search);
      for (let page = 0; page < 3; page++) {
        const expected = helpers.createAuditEventPage(await legacy.auditEvent.findMany({ ...helpers.buildAuditEventPageQuery(query), include: { actorUsuario: { select: { nome: true, email: true, perfil: { select: { nome: true } } } } } }), query);
        const actual = await loadAuditEventPage(connection.db, query);
        assert.deepEqual(actual, expected); comparisons++;
        if (!actual.nextCursor) break;
        query = parseAuditEventQuery({ ...search, cursor: actual.nextCursor });
        const next = await loadAuditEventPage(connection.db, query);
        if (next.previousCursor) {
          const backwards = parseAuditEventQuery({ ...search, cursor: next.previousCursor, direction: "previous" });
          assert.deepEqual(await loadAuditEventPage(connection.db, backwards), helpers.createAuditEventPage(await legacy.auditEvent.findMany({ ...helpers.buildAuditEventPageQuery(backwards), include: { actorUsuario: { select: { nome: true, email: true, perfil: { select: { nome: true } } } } } }), backwards)); comparisons++;
        }
      }
      const where = helpers.buildAuditEventWhere(query.filters);
      const expectedSummary = { total: await legacy.auditEvent.count({ where }), recent: await legacy.auditEvent.count({ where: { AND: [where, { createdAt: { gte: last24Hours } }] } }), eventGroups: await legacy.auditEvent.groupBy({ by: ["eventType"], where, _count: { _all: true } }), targetGroups: await legacy.auditEvent.groupBy({ by: ["targetType"], where, _count: { _all: true } }) };
      assert.deepEqual(await loadAuditEventSummary(connection.db, query.filters, last24Hours), expectedSummary); comparisons++;
    }
    assert.deepEqual(await loadAuditUsageSummary(connection.db, last24Hours), { totalEvents: await legacy.auditEvent.count(), eventsLast24Hours: await legacy.auditEvent.count({ where: { createdAt: { gte: last24Hours } } }), activeUsers: await legacy.auditEvent.groupBy({ by: ["actorUsuarioId"], where: { createdAt: { gte: last24Hours } } }) }); comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "Audit page DTOs, bidirectional keyset pagination, filtered distributions and usage summary" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
