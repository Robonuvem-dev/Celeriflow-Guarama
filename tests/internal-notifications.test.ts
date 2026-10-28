import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import {
  assertInternalNotificationPriority,
  buildInternalNotificationDedupeKey,
} from "../src/lib/notifications/notification-policy";
import { countUnreadInternalNotifications, insertInternalNotifications as createInternalNotifications, listInternalNotifications, listVisibleNotificationProcessTargets, markInternalNotificationRead } from "../src/db/repositories/platform/notifications";

async function databaseFixture() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE "Usuario" (id TEXT PRIMARY KEY);
    INSERT INTO "Usuario" VALUES ('author-1'),('recipient-1'),('recipient-2');
    CREATE TABLE "Process" (id TEXT PRIMARY KEY,"protocolNumber" TEXT,"currentDepartmentId" TEXT);
    INSERT INTO "Process" VALUES ('process-1','PROC-1','sector');
    CREATE TABLE "ProcessMovement" ("processId" TEXT,"fromDepartmentId" TEXT,"toDepartmentId" TEXT);
    CREATE TABLE "ProtocolNotification" (id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "Usuario"(id),"processId" TEXT REFERENCES "Process"(id),
      "sourceModule" TEXT NOT NULL DEFAULT 'PROCESSOS',"entityType" TEXT NOT NULL DEFAULT 'PROCESS',"entityId" TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('BAIXA','NORMAL','ALTA','URGENTE')),"dedupeKey" TEXT,"readAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX "ProtocolNotification_userId_dedupeKey_unique" ON "ProtocolNotification"("userId","dedupeKey") WHERE "dedupeKey" IS NOT NULL;
    CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY,"actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id),"eventType" TEXT NOT NULL,"targetType" TEXT NOT NULL,"targetId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const db = drizzle(pg);
  return { pg, db, executor: db as unknown as DatabaseExecutor };
}

const notification = {
  actorUsuarioId: "author-1",
  recipientUserIds: ["recipient-1", "recipient-2", "recipient-1"],
  sourceModule: "PROCESSOS",
  entityType: "PROCESS",
  entityId: "process-1",
  processId: "process-1",
  type: "FORWARDED",
  title: "Processo encaminhado",
  message: "Há uma nova etapa.",
  priority: "ALTA" as const,
  dedupeDiscriminator: "movement-1",
};

test("accepts only the approved internal notification priorities", () => {
  assert.doesNotThrow(() => assertInternalNotificationPriority("BAIXA"));
  assert.doesNotThrow(() => assertInternalNotificationPriority("NORMAL"));
  assert.doesNotThrow(() => assertInternalNotificationPriority("ALTA"));
  assert.doesNotThrow(() => assertInternalNotificationPriority("URGENTE"));
  assert.throws(() => assertInternalNotificationPriority("Normal"), /Prioridade/);
});

test("builds stable dedupe keys from the typed source and entity", () => {
  assert.equal(buildInternalNotificationDedupeKey(notification), "PROCESSOS:PROCESS:process-1:FORWARDED:movement-1");
  assert.equal(buildInternalNotificationDedupeKey(notification), buildInternalNotificationDedupeKey({ ...notification }));
});

test("creates one notification per recipient and keeps recipient histories isolated", async () => {
  const f = await databaseFixture();
  try {
    await f.db.transaction(async transaction => {
      const tx = transaction as unknown as DatabaseTransaction;
      const result = await createInternalNotifications(tx, notification);
      const repeated = await createInternalNotifications(tx, notification);
      assert.equal(result.created, 2); assert.equal(repeated.created, 0);
      assert.equal((await listInternalNotifications(tx, "recipient-1")).length, 1);
      assert.equal((await listInternalNotifications(tx, "recipient-2")).length, 1);
      assert.equal((await transaction.execute(sql`SELECT * FROM "ProtocolNotification"`)).rows.length, 2);
      assert.equal((await transaction.execute(sql`SELECT * FROM "AuditEvent"`)).rows.length, 2);
    });
  } finally { await f.pg.close(); }
});

test("allows only the notification owner to acknowledge a read and audits it", async () => {
  const f = await databaseFixture();
  try {
    await f.db.transaction(async transaction => {
      const tx = transaction as unknown as DatabaseTransaction;
      await createInternalNotifications(tx, notification);
      const [row] = await listInternalNotifications(tx, "recipient-1");
      assert.equal(await markInternalNotificationRead(tx, row.id, "recipient-2"), false);
      assert.equal(await markInternalNotificationRead(tx, row.id, "recipient-1"), true);
      assert.equal(await markInternalNotificationRead(tx, row.id, "recipient-1"), false);
      assert.equal(await countUnreadInternalNotifications(tx, "recipient-1"), 0);
      assert.equal((await transaction.execute(sql`SELECT * FROM "AuditEvent" WHERE "eventType"='INTERNAL_NOTIFICATION_READ'`)).rows.length, 1);
    });
  } finally { await f.pg.close(); }
});

test("requires typed entities and preserves a nullable process compatibility relation", async () => {
  const f = await databaseFixture();
  try {
    await f.db.transaction(async transaction => {
      const tx = transaction as unknown as DatabaseTransaction;
      await createInternalNotifications(tx, { ...notification, sourceModule: "ATENDIMENTO", entityType: "TICKET", entityId: "ticket-1", processId: null, dedupeDiscriminator: "ticket-event" });
      assert.equal((await listInternalNotifications(tx, "recipient-1", { sourceModule: "ATENDIMENTO", take: 1 }))[0].processId, null);
      assert.equal((await listInternalNotifications(tx, "recipient-1", { sourceModule: "PROCESSOS" })).length, 0);
      await assert.rejects(createInternalNotifications(tx, { ...notification, sourceModule: "processos" }), /Origem ou entidade/);
      await assert.rejects(createInternalNotifications(tx, { ...notification, processId: "other-process" }), /Relacao de processo/);
    });
  } finally { await f.pg.close(); }
});

test("notification audit failure rolls back delivery and process links require current or historical sector access", async () => {
  const f = await databaseFixture();
  try {
    await assert.rejects(f.db.transaction(tx => createInternalNotifications(tx as unknown as DatabaseTransaction, { ...notification, actorUsuarioId: "absent-actor" })), error => getPostgresError(error)?.code === "23503");
    assert.deepEqual(await listInternalNotifications(f.executor, "recipient-1"), []);
    await f.pg.exec(`INSERT INTO "Process" VALUES ('sent','PROC-SENT','other'),('received','PROC-RECEIVED','other'),('foreign','PROC-FOREIGN','other');
      INSERT INTO "ProcessMovement" VALUES ('sent','sector','other'),('received','other','sector');`);
    const ids = ["process-1", "sent", "received", "foreign"];
    const local = await listVisibleNotificationProcessTargets(f.executor, ids, { administrator: false, departmentId: "sector" });
    assert.deepEqual(local.map(row => row.id).sort(), ["process-1", "received", "sent"]);
    assert.equal((await listVisibleNotificationProcessTargets(f.executor, ids, { administrator: true, departmentId: null })).length, 4);
    assert.deepEqual(await listVisibleNotificationProcessTargets(f.executor, ids, { administrator: false, departmentId: null }), []);
    assert.deepEqual(await listVisibleNotificationProcessTargets(f.executor, [], { administrator: true, departmentId: null }), []);
  } finally { await f.pg.close(); }
});

test("migration backfills protocol entities and enforces per-recipient dedupe", async () => {
  const migration = await readFile(new URL("../prisma/migrations/20260816110000_add_internal_notification_center/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /ALTER COLUMN "processId" DROP NOT NULL/);
  assert.match(migration, /SET "entityId" = "processId"/);
  assert.match(migration, /"priority" IN \('BAIXA', 'NORMAL', 'ALTA', 'URGENTE'\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "ProtocolNotification_userId_dedupeKey_unique"/);
  assert.match(migration, /WHERE "dedupeKey" IS NOT NULL/);
});
