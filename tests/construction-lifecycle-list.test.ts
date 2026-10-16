import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma, PrismaClient } from "@prisma/client";
import { lifecycleListHref, lifecyclePage, listConstructionPropertyUpdates } from "../src/lib/obras/construction-lifecycle-list";

test("independent history pages clamp bounds and preserve the other section's filters", () => {
  assert.equal(lifecyclePage("999", 41), 3);
  assert.equal(lifecyclePage("-10", 41), 1);
  assert.equal(lifecyclePage("bad", 0), 1);
  const link = new URL(lifecycleListHref({ inspectionPage: "2", inspectionStatus: "FAILED", completionPage: "3", completionQ: "CONC 2026" }, "inspectionPage", 3), "https://example.test");
  assert.equal(link.searchParams.get("inspectionPage"), "3");
  assert.equal(link.searchParams.get("completionPage"), "3");
  assert.equal(link.searchParams.get("completionQ"), "CONC 2026");
  assert.equal(link.searchParams.get("inspectionStatus"), "FAILED");
});

test("PostgreSQL: cadastral list scopes before count/pagination, uses 20 rows, filters and literal search", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Process" ("id" TEXT PRIMARY KEY, "currentDepartmentId" TEXT, "protocolNumber" TEXT);
      CREATE TABLE "ConstructionCompletion" ("id" TEXT PRIMARY KEY, "number" TEXT);
      CREATE TABLE "ConstructionPropertyUpdate" ("id" TEXT PRIMARY KEY, "processId" TEXT, "completionId" TEXT, "status" TEXT, "createdAt" TIMESTAMP);
      INSERT INTO "Process" VALUES ('local','sector','PROC-LOCAL'),('foreign','other','PROC-FOREIGN');
      INSERT INTO "ConstructionCompletion" VALUES ('completion','CONC-2026-001'),('literal','CONC-100%');
      INSERT INTO "ConstructionPropertyUpdate" SELECT 'local-'||LPAD(i::text,3,'0'),'local','completion',CASE WHEN i <= 21 THEN 'PENDING' ELSE 'APPLIED' END,'2026-10-10'::timestamp + i * INTERVAL '1 minute' FROM generate_series(1,41) i;
      INSERT INTO "ConstructionPropertyUpdate" VALUES ('foreign-update','foreign','completion','PENDING','2026-10-11'),('literal-update','local','literal','APPLIED','2026-10-12');`);
    const fetched: number[] = [];
    // Execute production SQL against real PostgreSQL; bridge only the bounded ORM hydration.
    const client = {
      $queryRaw: async (query: Prisma.Sql) => (await db.query(query.text, query.values)).rows,
      constructionPropertyUpdate: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        fetched.push(where.id.in.length);
        return (await db.query<{ id: string; processId: string }>('SELECT "id","processId" FROM "ConstructionPropertyUpdate" WHERE "id"=ANY($1::text[])', [where.id.in])).rows;
      } },
      process: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => (await db.query('SELECT "id","protocolNumber" FROM "Process" WHERE "id"=ANY($1::text[])', [where.id.in])).rows },
    } as unknown as PrismaClient;
    const access = { administrator: false, employeeId: "staff", departmentId: "sector", roles: [] };
    const first = await listConstructionPropertyUpdates(client, access, {});
    assert.equal(first.total, 42);
    assert.equal(first.updates.length, 20);
    assert.ok(first.updates.every((update) => update.processId === "local"));
    const last = await listConstructionPropertyUpdates(client, access, { page: "999" });
    assert.equal(last.page, 3);
    assert.equal(last.updates.length, 2);
    const pending = await listConstructionPropertyUpdates(client, access, { status: "PENDING", page: "2" });
    assert.equal(pending.total, 21);
    assert.equal(pending.updates.length, 1);
    const literal = await listConstructionPropertyUpdates(client, access, { q: "100%" });
    assert.equal(literal.total, 1);
    assert.equal(literal.updates[0].id, "literal-update");
    assert.equal((await listConstructionPropertyUpdates(client, { ...access, departmentId: null }, {})).total, 0);
    assert.equal((await listConstructionPropertyUpdates(client, { ...access, administrator: true }, {})).total, 43);
    assert.ok(fetched.every((count) => count <= 20));
  } finally { await db.close(); }
});
