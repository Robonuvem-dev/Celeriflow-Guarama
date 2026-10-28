import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { config } from "dotenv";
import type { Prisma } from "@prisma/client";
import { createDatabaseConnection } from "../src/db/connection";
import { countUnreadInternalNotifications, listInternalNotifications, listVisibleNotificationProcessTargets } from "../src/db/repositories/platform/notifications";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL), connection = createDatabaseConnection(process.env.DATABASE_URL);
  const source = execFileSync("git", ["show", "3f05dcd:src/lib/protocols/access.ts"], { encoding: "utf8" });
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helpers = {} as { protocolScope: (context: { protocolAccess: { isAdmin: boolean }; user: { departmentId: string | null } }) => Prisma.ProcessWhereInput };
  new Function("exports", "require", code)(helpers, (id: string) => { assert.equal(id, "@/lib/platform/tenant-context"); return {}; });
  let comparisons = 0;
  try {
    const users = await legacy.usuario.findMany({ select: { id: true }, take: 25 });
    for (const user of [...users, { id: "missing-drizzle-notification-recipient" }]) {
      for (const options of [{}, { sourceModule: "PROCESSOS" }, { sourceModule: "SOCIAL", take: 10 }, { sourceModule: "ABSENT", take: 20 }]) {
        assert.deepEqual(await listInternalNotifications(connection.db, user.id, options), await legacy.protocolNotification.findMany({ where: { userId: user.id, ...(options.sourceModule ? { sourceModule: options.sourceModule } : {}) }, orderBy: { createdAt: "desc" }, take: options.take ?? 50 })); comparisons++;
      }
      assert.equal(await countUnreadInternalNotifications(connection.db, user.id), await legacy.protocolNotification.count({ where: { userId: user.id, readAt: null } })); comparisons++;
    }
    const processIds = (await legacy.process.findMany({ select: { id: true }, take: 50 })).map(row => row.id);
    const departments = await legacy.department.findMany({ select: { id: true }, take: 5 });
    for (const administrator of [true, false]) for (const departmentId of [null, "absent-drizzle-sector", ...departments.map(row => row.id)]) {
      const expected = await legacy.process.findMany({ where: { id: { in: processIds }, ...helpers.protocolScope({ protocolAccess: { isAdmin: administrator }, user: { departmentId } }) }, select: { id: true, protocolNumber: true } });
      const actual = await listVisibleNotificationProcessTargets(connection.db, processIds, { administrator, departmentId });
      assert.deepEqual(actual.sort((a, b) => a.id.localeCompare(b.id)), expected.sort((a, b) => a.id.localeCompare(b.id))); comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "Recipient history/filter/unread DTOs and target authorization using current/historical process departments" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
