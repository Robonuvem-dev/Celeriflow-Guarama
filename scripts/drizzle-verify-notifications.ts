import assert from "node:assert/strict";
import { config } from "dotenv";
import { countUnreadInternalNotifications, listInternalNotifications, listVisibleNotificationProcessTargets } from "../src/db/repositories/platform/notifications";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  let comparisons = 0;
  try {
    const users = await connection.rows<{ id: string }>('SELECT id FROM "Usuario" LIMIT 25');
    for (const user of [...users, { id: "missing-drizzle-notification-recipient" }]) {
      for (const options of [{}, { sourceModule: "PROCESSOS" }, { sourceModule: "SOCIAL", take: 10 }, { sourceModule: "ABSENT", take: 20 }]) {
        assert.deepEqual(await listInternalNotifications(connection.db, user.id, options), await connection.rows('SELECT * FROM "ProtocolNotification" WHERE "userId"=$1 AND ($2::text IS NULL OR "sourceModule"=$2) ORDER BY "createdAt" DESC LIMIT $3', [user.id, options.sourceModule || null, options.take ?? 50])); comparisons++;
      }
      assert.equal(await countUnreadInternalNotifications(connection.db, user.id), await connection.count('SELECT count(*)::int AS count FROM "ProtocolNotification" WHERE "userId"=$1 AND "readAt" IS NULL', [user.id])); comparisons++;
    }
    const processIds = (await connection.rows<{ id: string }>('SELECT id FROM "Process" LIMIT 50')).map(row => row.id);
    const departments = await connection.rows<{ id: string }>('SELECT id FROM "Department" LIMIT 5');
    for (const administrator of [true, false]) for (const departmentId of [null, "absent-drizzle-sector", ...departments.map(row => row.id)]) {
      // Captured authorization rule: current sector OR any formal sent/received
      // movement. No-sector access uses the original impossible-id sentinel.
      const expected = await connection.rows<{ id: string; protocolNumber: string }>(`SELECT p.id,p."protocolNumber" FROM "Process" p WHERE p.id=ANY($1::text[]) AND ($2::boolean OR ($3::text IS NULL AND p.id=$4) OR ($3::text IS NOT NULL AND (p."currentDepartmentId"=$3 OR EXISTS(SELECT 1 FROM "ProcessMovement" m WHERE m."processId"=p.id AND (m."fromDepartmentId"=$3 OR m."toDepartmentId"=$3)))))`, [processIds, administrator, departmentId, "__sem-departamento__"]);
      const actual = await listVisibleNotificationProcessTargets(connection.db, processIds, { administrator, departmentId });
      assert.deepEqual(actual.sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id))); comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "Recipient history/filter/unread DTOs and target authorization using current/historical process departments" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
