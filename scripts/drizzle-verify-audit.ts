import assert from "node:assert/strict";
import { config } from "dotenv";
import { loadAuditEventPage, loadAuditEventSummary, loadAuditUsageSummary } from "../src/db/repositories/platform/audit-queries";
import { parseAuditEventQuery, type AuditEventFilters, type AuditEventQuery } from "../src/lib/platform/audit-query";
import { openReadOnlySqlOracle, sqlOracleUrl, type SqlOracle } from "./sql-oracle";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

function auditPredicate(filters: AuditEventFilters) {
  const clauses: string[] = [], values: unknown[] = [];
  for (const [column, value] of [["actorUsuarioId", filters.actorUsuarioId], ["eventType", filters.eventType], ["targetType", filters.targetType], ["targetId", filters.targetId]]) {
    if (value) { values.push(value); clauses.push(`a."${column}"=$${values.length}`); }
  }
  if (filters.from) { values.push(`${filters.from}T00:00:00.000Z`); clauses.push(`a."createdAt">=$${values.length}::timestamp`); }
  if (filters.to) { values.push(`${filters.to}T23:59:59.999Z`); clauses.push(`a."createdAt"<=$${values.length}::timestamp`); }
  return { where: clauses.length ? clauses.join(" AND ") : "TRUE", values };
}

async function expectedPage(oracle: SqlOracle, query: AuditEventQuery) {
  const predicate = auditPredicate(query.filters), values = [...predicate.values];
  let where = predicate.where;
  if (query.cursor) {
    values.push(query.cursor.createdAt.toISOString(), query.cursor.id);
    const comparison = query.direction === "previous" ? ">" : "<";
    where += ` AND (a."createdAt",a.id) ${comparison} ($${values.length - 1}::timestamp,$${values.length}::text)`;
  }
  const order = query.direction === "previous" ? "ASC" : "DESC";
  const records = await oracle.rows<{ id: string; createdAt: Date; actorUsuarioId: string; eventType: string; targetType: string; targetId: string; actorUsuario: { nome: string; email: string; perfil: { nome: string } } }>(`SELECT a.id,a."actorUsuarioId",a."eventType",a."targetType",a."targetId",a."createdAt",json_build_object('nome',u.nome,'email',u.email,'perfil',json_build_object('nome',p.nome)) AS "actorUsuario" FROM "AuditEvent" a JOIN "Usuario" u ON u.id=a."actorUsuarioId" JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE ${where} ORDER BY a."createdAt" ${order},a.id ${order} LIMIT 21`, values);
  // Captured page contract: one lookahead, reverse only a backwards page, and
  // encode the visible endpoints rather than the lookahead row.
  const events = records.slice(0, 20);
  if (query.direction === "previous") events.reverse();
  const encode = (row: { id: string; createdAt: Date } | undefined) => row ? `${row.createdAt.toISOString()}|${row.id}` : undefined;
  const previous = query.direction === "previous" ? records.length > 20 : Boolean(query.cursor);
  const next = query.direction === "previous" ? Boolean(query.cursor) : records.length > 20;
  return { events, previousCursor: previous ? encode(events[0]) : undefined, nextCursor: next ? encode(events.at(-1)) : undefined };
}

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  let comparisons = 0;
  try {
    const actor = await connection.first<{ id: string }>('SELECT id FROM "Usuario" LIMIT 1');
    const last24Hours = new Date(Date.now() - 86_400_000);
    const scenarios = [{}, { actorUsuarioId: actor?.id }, { targetType: "DOCUMENT" }, { eventType: "PAGE_VIEW" }, { targetId: "' OR 1=1 --" }, { from: "2026-10-01", to: "2026-10-28" }, { from: "2024-01-01", to: "2024-01-02" }];
    for (const search of scenarios) {
      let query = parseAuditEventQuery(search);
      for (let page = 0; page < 3; page++) {
        const expected = await expectedPage(connection, query);
        const actual = await loadAuditEventPage(connection.db, query);
        assert.deepEqual(actual, expected); comparisons++;
        if (!actual.nextCursor) break;
        query = parseAuditEventQuery({ ...search, cursor: actual.nextCursor });
        const next = await loadAuditEventPage(connection.db, query);
        if (next.previousCursor) {
          const backwards = parseAuditEventQuery({ ...search, cursor: next.previousCursor, direction: "previous" });
          assert.deepEqual(await loadAuditEventPage(connection.db, backwards), await expectedPage(connection, backwards)); comparisons++;
        }
      }
      const { where, values } = auditPredicate(query.filters);
      const expectedSummary = {
        total: await connection.count(`SELECT count(*)::int AS count FROM "AuditEvent" a WHERE ${where}`, values),
        recent: await connection.count(`SELECT count(*)::int AS count FROM "AuditEvent" a WHERE ${where} AND a."createdAt">=$${values.length + 1}::timestamp`, [...values, last24Hours.toISOString()]),
        eventGroups: await connection.rows(`SELECT a."eventType",json_build_object('_all',count(*)::int) AS "_count" FROM "AuditEvent" a WHERE ${where} GROUP BY a."eventType"`, values),
        targetGroups: await connection.rows(`SELECT a."targetType",json_build_object('_all',count(*)::int) AS "_count" FROM "AuditEvent" a WHERE ${where} GROUP BY a."targetType"`, values),
      };
      assert.deepEqual(await loadAuditEventSummary(connection.db, query.filters, last24Hours), expectedSummary); comparisons++;
    }
    assert.deepEqual(await loadAuditUsageSummary(connection.db, last24Hours), { totalEvents: await connection.count('SELECT count(*)::int AS count FROM "AuditEvent"'), eventsLast24Hours: await connection.count('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "createdAt">=$1::timestamp', [last24Hours.toISOString()]), activeUsers: await connection.rows('SELECT "actorUsuarioId" FROM "AuditEvent" WHERE "createdAt">=$1::timestamp GROUP BY "actorUsuarioId"', [last24Hours.toISOString()]) }); comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "Audit page DTOs, bidirectional keyset pagination, inclusive dates, filtered distributions and usage summary" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
