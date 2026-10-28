import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { listActiveConstructionRoles } from "../src/db/repositories/registry/construction-updates";
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
      CREATE TABLE "ConstructionCompletion" ("id" TEXT PRIMARY KEY, "number" TEXT, "kind" TEXT DEFAULT 'TOTAL');
      CREATE TABLE "ConstructionPropertyUpdate" ("id" TEXT PRIMARY KEY, "processId" TEXT, "completionId" TEXT, "status" TEXT, "createdAt" TIMESTAMP,
        "requestKey" TEXT DEFAULT 'fixture', "proposedSnapshot" JSONB DEFAULT '{}', "beforeSnapshot" JSONB, "afterSnapshot" JSONB, "createdBy" TEXT DEFAULT 'actor', "appliedBy" TEXT, "appliedAt" TIMESTAMP);
      INSERT INTO "Process" VALUES ('local','sector','PROC-LOCAL'),('foreign','other','PROC-FOREIGN');
      INSERT INTO "ConstructionCompletion" (id,number) VALUES ('completion','CONC-2026-001'),('literal','CONC-100%');
      INSERT INTO "ConstructionPropertyUpdate" (id,"processId","completionId",status,"createdAt") SELECT 'local-'||LPAD(i::text,3,'0'),'local','completion',CASE WHEN i <= 21 THEN 'PENDING' ELSE 'APPLIED' END,'2026-10-10'::timestamp + i * INTERVAL '1 minute' FROM generate_series(1,41) i;
      INSERT INTO "ConstructionPropertyUpdate" (id,"processId","completionId",status,"createdAt") VALUES ('foreign-update','foreign','completion','PENDING','2026-10-11'),('literal-update','local','literal','APPLIED','2026-10-12');`);
    const queries: string[] = [];
    // Same Drizzle SQL/select mapping as production. Only the test driver differs;
    // result metadata is not consumed by these repositories.
    const client = drizzle(db, { logger: { logQuery(query) { queries.push(query); } } }) as unknown as DatabaseExecutor;
    const access = { administrator: false, employeeId: "staff", departmentId: "sector", roles: [] };
    const first = await listConstructionPropertyUpdates(client, access, {});
    assert.equal(first.total, 42);
    assert.equal(first.updates.length, 20);
    assert.ok(first.updates.every((update) => update.processId === "local"));
    assert.deepEqual(first.updates[0].completion, { number: "CONC-100%", kind: "TOTAL" });
    assert.deepEqual(first.updates[0].proposedSnapshot, {});
    assert.ok(first.updates[0].createdAt instanceof Date);
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
    const hydrationQueries = queries.filter(query => query.startsWith('select "id", "completionId"'));
    assert.ok(hydrationQueries.length > 0);
    assert.ok(hydrationQueries.every(query => /limit \$\d+/.test(query)));
  } finally { await db.close(); }
});

test("Construction role access requires active employee/department and inclusive effective dates", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "Employee" (id TEXT PRIMARY KEY,"isActive" BOOLEAN,"departmentId" TEXT);
      CREATE TABLE "Department" (id TEXT PRIMARY KEY,"isActive" BOOLEAN);
      CREATE TABLE "ConstructionStaffRole" ("employeeId" TEXT,"departmentId" TEXT,role TEXT,"isActive" BOOLEAN,"startsAt" DATE,"endsAt" DATE);
      INSERT INTO "Employee" VALUES ('active',true,'sector'),('inactive',false,'sector'),('moved',true,'other');
      INSERT INTO "Department" VALUES ('sector',true),('other',false);
      INSERT INTO "ConstructionStaffRole" VALUES ('active','sector','ANALYST',true,'2026-10-28','2026-10-28'),('active','sector','MANAGER',true,'2026-10-01',NULL),('active','sector','FUTURE',true,'2026-10-29',NULL),('active','sector','EXPIRED',true,'2026-10-01','2026-10-27'),('active','sector','INACTIVE',false,'2026-10-01',NULL),('inactive','sector','ANALYST',true,'2026-10-01',NULL),('moved','sector','ANALYST',true,'2026-10-01',NULL);`);
    const db = drizzle(pg) as unknown as DatabaseExecutor;
    const today = new Date("2026-10-28T00:00:00Z");
    assert.deepEqual(await listActiveConstructionRoles(db, "active", "sector", today), ["ANALYST", "MANAGER"]);
    assert.deepEqual(await listActiveConstructionRoles(db, "inactive", "sector", today), []);
    assert.deepEqual(await listActiveConstructionRoles(db, "moved", "sector", today), []);
    await pg.exec(`UPDATE "Department" SET "isActive"=false WHERE id='sector'`);
    assert.deepEqual(await listActiveConstructionRoles(db, "active", "sector", today), []);
  } finally { await pg.close(); }
});
