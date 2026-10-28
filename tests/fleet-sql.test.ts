import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { PgDialect, QueryBuilder } from "drizzle-orm/pg-core";
import { fleetUnitAccess, fleetUnitScope } from "../src/db/repositories/fleet/records";
import { fleetAttachments, fleetDocuments, fleetExpenses, fleetOccurrences, fleetPlans, fleetWorkOrders } from "../src/db/schema/fleet";

// Pure SQL compilation: no session, driver, fixture or database connection.
for (const scope of [
  { administrator: true, departmentId: null },
  { administrator: false, departmentId: "department-a" },
  { administrator: false, departmentId: null },
]) {
  test(`Fleet SQL · bounded scope ${JSON.stringify(scope)} preserves outer ID filters`, () => {
    const builder = new QueryBuilder();
    for (const table of [fleetPlans, fleetWorkOrders, fleetDocuments, fleetExpenses, fleetOccurrences, fleetAttachments]) {
      const query = builder.select({ id: table.id }).from(table).where(and(eq(table.id, "selected-record"), inArray(table.unitId, fleetUnitScope(scope)), eq(table.unitId, "selected-unit"))).toSQL();
      assert.doesNotMatch(query.sql, /\bin\s+select\b/i);
      assert.match(query.sql, /in \(select "id" from "FleetUnit" where \(\$2 or "departmentId"=\$3\)\) and/);
      assert.deepEqual(query.params, ["selected-record", scope.administrator, scope.departmentId, "selected-unit"]);
    }
    const access = new PgDialect().sqlToQuery(sql`${fleetUnitAccess(scope, "selected-unit")} and false`);
    assert.match(access.sql, /and \(\$2 or u\."departmentId"=\$3\)\) and false$/);
    assert.deepEqual(access.params, ["selected-unit", scope.administrator, scope.departmentId]);
  });
}
