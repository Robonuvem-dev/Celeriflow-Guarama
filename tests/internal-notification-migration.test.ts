import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { insertInternalNotifications } from "../src/db/repositories/platform/notifications";
import { accessProfiles, users } from "../src/db/schema/identity";
import { getPostgresError } from "../src/db/errors";

test("active SQL history gains recipient dedupe without changing history, existing rows or notification/audit atomicity", { timeout: 180_000 }, async () => {
  const fixture = await createLocalDrizzleDatabase();
  const { db } = fixture.connection;
  try {
    for (const entry of (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await fixture.database.exec(await readFile(`prisma/migrations-ibema/${entry.name}/migration.sql`, "utf8"));
    }
    const [profile] = await db.insert(accessProfiles).values({ codigo: "NOTIFICATION_MIGRATION_TEST", nome: "Fixture", permissoes: "{}" }).returning();
    const [actor] = await db.insert(users).values({ nome: "Ator local", email: "notification-migration@example.invalid", perfilId: profile.id }).returning();
    const input = { actorUsuarioId: actor.id, recipientUserIds: [actor.id], sourceModule: "CONTROLE", entityType: "TEST_EVENT", entityId: "kept", type: "SOURCE_EVENT", title: "Evento local", message: "Mensagem local", dedupeDiscriminator: "source-1" };
    const first = await withDatabaseTransaction(fixture.connection, async tx => {
      assert.equal((await insertInternalNotifications(tx, input)).created, 1);
      assert.equal((await insertInternalNotifications(tx, input)).created, 0, "Replay lookup works against the unchanged historical non-unique index.");
      return (await tx.execute(sql`SELECT row_to_json(n)::text AS document FROM "ProtocolNotification" n ORDER BY id`)).rows;
    });
    const beforeIndex = await db.execute<{ indexdef: string }>(sql`SELECT indexdef FROM pg_indexes WHERE tablename='ProtocolNotification' AND indexname='ProtocolNotification_userId_dedupeKey_idx'`);
    assert.match(beforeIndex.rows[0].indexdef, /^CREATE INDEX /);
    await fixture.database.exec(await readFile("db/migrations/20261028193100_notification_recipient_dedupe/migration.sql", "utf8"));
    const after = await db.execute(sql`SELECT row_to_json(n)::text AS document FROM "ProtocolNotification" n ORDER BY id`);
    assert.deepEqual(after.rows, first);
    const uniqueIndex = await db.execute<{ indexdef: string }>(sql`SELECT indexdef FROM pg_indexes WHERE tablename='ProtocolNotification' AND indexname='ProtocolNotification_userId_dedupeKey_unique'`);
    assert.match(uniqueIndex.rows[0].indexdef, /^CREATE UNIQUE INDEX /);
    assert.match(uniqueIndex.rows[0].indexdef, /WHERE \("dedupeKey" IS NOT NULL\)/);
    await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.execute(sql`INSERT INTO "ProtocolNotification" (id,"userId","processId",type,title,message,"readAt","createdAt","sourceModule","entityType","entityId",priority,"dedupeKey") SELECT 'duplicate',"userId","processId","type","title","message","readAt","createdAt","sourceModule","entityType","entityId","priority","dedupeKey" FROM "ProtocolNotification" LIMIT 1`)), error => getPostgresError(error)?.code === "23505");
    const concurrent = await Promise.all([1, 2].map(() => withDatabaseTransaction(fixture.connection, tx => insertInternalNotifications(tx, { ...input, entityId: "race" }))));
    assert.deepEqual(concurrent.map(result => result.created).sort(), [0, 1]);
    await assert.rejects(withDatabaseTransaction(fixture.connection, tx => insertInternalNotifications(tx, { ...input, actorUsuarioId: "missing", entityId: "rollback" })), error => getPostgresError(error)?.code === "23503");
    const counts = await db.execute<{ notifications: number; audits: number }>(sql`SELECT (SELECT count(*)::int FROM "ProtocolNotification") AS notifications,(SELECT count(*)::int FROM "AuditEvent" WHERE "eventType"='INTERNAL_NOTIFICATION_CREATED') AS audits`);
    assert.deepEqual(counts.rows, [{ notifications: 2, audits: 2 }]);
  } finally { await fixture.close(); }
});
