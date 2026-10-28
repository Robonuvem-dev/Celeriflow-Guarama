import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { and, asc, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { people } from "../src/db/schema/people";
import { addresses, documents, taxpayers } from "../src/db/schema/registry";
import { accessProfiles, users } from "../src/db/schema/identity";
import { personMergeLedger, personMergeRequests } from "../src/db/schema/person-merge";
import { auditEvents } from "../src/db/schema/audit";
import { approveAndExecutePersonMergeInTransaction, proposePersonMergeInTransaction, reversePersonMergeInTransaction } from "../src/db/repositories/registry/person-merge";
import type { PersonMergeManifest } from "../src/lib/cadastros/person-merge-policy";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

test("Mesclagem PF: dupla aprovação, transferência limitada, manifesto e reversão protegida", { skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000 }, async t => {
  assert.ok(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const fixture = createId(), rollback = new Error("expected merge rollback");
  let requestId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const [profile] = await tx.select({ id: accessProfiles.id }).from(accessProfiles).where(eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR")); assert.ok(profile);
      const [proposer, approver] = await tx.insert(users).values([{ nome: fixture, email: `${fixture}-a@example.test`, perfilId: profile.id }, { nome: fixture, email: `${fixture}-b@example.test`, perfilId: profile.id }]).returning({ id: users.id });
      const [source, target] = await tx.insert(people).values([{ fullName: fixture }, { fullName: `${fixture}target` }]).returning();
      const [address] = await tx.insert(addresses).values({ personId: source.id, streetName: fixture }).returning();
      const [movable, locked] = await tx.insert(documents).values([{ personId: source.id, title: fixture, documentType: "TEST", fileUrl: "https://example.test/movable" }, { personId: source.id, title: `${fixture}locked`, documentType: "TEST", fileUrl: "https://example.test/locked" }]).returning();
      await tx.execute(sql`INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256","lockedAt") VALUES (${createId()},${locked.id},1,${locked.fileUrl},${"a".repeat(64)},${new Date().toISOString()}::timestamp)`);
      await t.test("proposta registra evidência e proponente não pode aprovar", async () => {
        await assert.rejects(proposePersonMergeInTransaction(tx, proposer, source.id, source.id), /diferentes/);
        requestId = await proposePersonMergeInTransaction(tx, proposer, source.id, target.id);
        await assert.rejects(approveAndExecutePersonMergeInTransaction(tx, proposer, requestId), /diferente do proponente/);
        const [request] = await tx.select().from(personMergeRequests).where(eq(personMergeRequests.id, requestId));
        assert.equal(request.status, "PROPOSED");
        assert.deepEqual((await tx.select().from(addresses).where(eq(addresses.id, address.id)))[0], address);
        assert.equal((await tx.select().from(personMergeLedger).where(eq(personMergeLedger.requestId, requestId))).length, 1);
      });
      await t.test("execução serializável move endereço/documento livre e preserva documento bloqueado", async () => {
        assert.equal(await approveAndExecutePersonMergeInTransaction(tx, approver, requestId), requestId);
        const [movedAddress] = await tx.select().from(addresses).where(eq(addresses.id, address.id));
        const [movedDocument] = await tx.select().from(documents).where(eq(documents.id, movable.id));
        const [preservedDocument] = await tx.select().from(documents).where(eq(documents.id, locked.id));
        assert.equal(movedAddress.personId, target.id); assert.equal(movedDocument.personId, target.id);
        assert.deepEqual(preservedDocument, locked);
        const [ledger] = await tx.select().from(personMergeLedger).where(and(eq(personMergeLedger.requestId, requestId), eq(personMergeLedger.eventType, "EXECUTED")));
        const manifest = ledger.manifest as PersonMergeManifest;
        assert.deepEqual(manifest.addressIds, [address.id]); assert.deepEqual(manifest.documentIds, [movable.id]);
        assert.equal(movedAddress.updatedAt.toISOString(), manifest.executedAt);
        assert.equal(movedDocument.updatedAt.toISOString(), manifest.executedAt);
        assert.equal((await tx.select().from(people).where(eq(people.id, source.id)))[0].status, "Arquivado por mesclagem");
        await assert.rejects(approveAndExecutePersonMergeInTransaction(tx, approver, requestId), /não está pendente/);
        await assert.rejects(tx.transaction(nested => nested.update(personMergeLedger).set({ eventType: "TAMPERED" }).where(eq(personMergeLedger.id, ledger.id))), error => getPostgresError(error)?.code === "P0001" && error instanceof Error && error.cause instanceof Error && /append-only/.test(error.cause.message));
      });
      await t.test("alteração posterior do destino ou bloqueio documental impede reversão", async () => {
        const savepointRollback = new Error("expected guard rollback");
        await assert.rejects(tx.transaction(async nested => {
          await nested.update(people).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(people.id, target.id));
          await assert.rejects(reversePersonMergeInTransaction(nested, approver, requestId), /destino recebeu alterações/);
          throw savepointRollback;
        }), error => error === savepointRollback);
        await assert.rejects(tx.transaction(async nested => {
          await nested.execute(sql`INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256","lockedAt") VALUES (${createId()},${movable.id},1,${movable.fileUrl},${"b".repeat(64)},${new Date(Date.now() + 1000).toISOString()}::timestamp)`);
          await assert.rejects(reversePersonMergeInTransaction(nested, approver, requestId), /bloqueio posterior/);
          throw savepointRollback;
        }), error => error === savepointRollback);
      });
      await t.test("reversão restaura titularidade/situação e conserva cadeia imutável", async () => {
        assert.equal(await reversePersonMergeInTransaction(tx, approver, requestId), requestId);
        assert.equal((await tx.select().from(addresses).where(eq(addresses.id, address.id)))[0].personId, source.id);
        assert.equal((await tx.select().from(documents).where(eq(documents.id, movable.id)))[0].personId, source.id);
        assert.equal((await tx.select().from(people).where(eq(people.id, source.id)))[0].status, source.status);
        const ledger = await tx.select().from(personMergeLedger).where(eq(personMergeLedger.requestId, requestId)).orderBy(asc(personMergeLedger.createdAt), asc(personMergeLedger.id));
        assert.deepEqual(ledger.map(row => row.eventType).sort(), ["EXECUTED", "PROPOSED", "REVERSED"]);
        const audits = await tx.select().from(auditEvents).where(eq(auditEvents.targetId, requestId));
        assert.equal(audits.length, 3);
        await assert.rejects(reversePersonMergeInTransaction(tx, approver, requestId), /não pode ser revertida/);
      });
      await t.test("papel fiscal bloqueia mesclagem sem gravar proposta nem mover histórico", async () => {
        await tx.insert(taxpayers).values({ taxpayerType: "PF", personId: source.id });
        await assert.rejects(proposePersonMergeInTransaction(tx, proposer, source.id, target.id), /FISCAL/);
        assert.equal((await tx.select().from(personMergeRequests).where(eq(personMergeRequests.sourcePersonId, source.id))).length, 1);
      });
      throw rollback;
    }, { isolationLevel: "serializable", timeoutMs: 100_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: people.id }).from(people).where(eq(people.fullName, fixture)), []);
    assert.deepEqual(await connection.db.select({ id: personMergeLedger.id }).from(personMergeLedger).where(eq(personMergeLedger.requestId, requestId)), []);
    assert.deepEqual(await connection.db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.targetId, requestId)), []);
  } finally { await connection.pool.end(); }
});
