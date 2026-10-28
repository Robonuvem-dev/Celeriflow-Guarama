import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { people } from "../src/db/schema/people";
import { companies, suppliers, taxpayers } from "../src/db/schema/registry";
import { creditors, financialAuditLogs } from "../src/db/schema/finance-identity";
import { users } from "../src/db/schema/identity";
import { reconcileCanonicalIdentityInTransaction } from "../src/db/repositories/registry/reconciliation";
import { requireValidCnpj, requireValidCpf } from "../src/lib/identifiers/brazilian-identifiers";
import { syntheticCnpj, syntheticCpf } from "../src/lib/poc/fixture-catalog";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

test("Reconciliação: vínculos PF/PJ, idempotência e preservação dos históricos", { skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 90_000 }, async t => {
  assert.ok(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const fixture = createId();
  const rollback = new Error("expected reconciliation rollback");
  let commandId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const [actor] = await tx.select({ id: users.id }).from(users).limit(1); assert.ok(actor);
      const cpfRows = await tx.select({ cpf: people.cpf }).from(people);
      let cpf = "";
      for (let seed = 8_300_000; seed < 8_300_100; seed++) {
        const candidate = requireValidCpf(syntheticCpf(seed));
        if (!cpfRows.some(row => row.cpf?.replace(/\D/g, "") === candidate)) { cpf = candidate; break; }
      }
      assert.ok(cpf);
      const [person, invalidPerson] = await tx.insert(people).values([{ fullName: fixture, cpf }, { fullName: `${fixture} invalid` }]).returning();
      const cnpjRows = await tx.select({ cnpj: companies.cnpj }).from(companies);
      let cnpj = "";
      for (let seed = 8_400_000; seed < 8_400_100; seed++) {
        const candidate = requireValidCnpj(syntheticCnpj(seed));
        if (!cnpjRows.some(row => row.cnpj.replace(/\D/g, "") === candidate)) { cnpj = candidate; break; }
      }
      assert.ok(cnpj);
      const [company] = await tx.insert(companies).values({ corporateName: fixture, cnpj }).returning();
      const [taxpayer] = await tx.insert(taxpayers).values({ taxpayerType: "PF", fiscalNotes: fixture }).returning();
      const [supplier] = await tx.insert(suppliers).values({ notes: fixture }).returning();
      const [creditor] = await tx.insert(creditors).values({ name: fixture, document: cpf }).returning();
      const input = { identityType: "PF" as const, identityId: person.id, taxpayerId: taxpayer.id, supplierId: supplier.id, creditorId: creditor.id, reason: fixture, idempotencyKey: fixture };
      await t.test("liga os três papéis, mantém IDs/dados e grava antes/depois auditáveis", async () => {
        commandId = await reconcileCanonicalIdentityInTransaction(tx, actor.id, input);
        const [savedTaxpayer] = await tx.select().from(taxpayers).where(eq(taxpayers.id, taxpayer.id));
        const [savedSupplier] = await tx.select().from(suppliers).where(eq(suppliers.id, supplier.id));
        const [savedCreditor] = await tx.select().from(creditors).where(eq(creditors.id, creditor.id));
        assert.deepEqual(savedTaxpayer, { ...taxpayer, personId: person.id, updatedAt: savedTaxpayer.updatedAt });
        assert.deepEqual(savedSupplier, { ...supplier, personId: person.id, updatedAt: savedSupplier.updatedAt });
        assert.deepEqual(savedCreditor, { ...creditor, personId: person.id, supplierId: supplier.id, updatedAt: savedCreditor.updatedAt });
        const [audit] = await tx.select().from(financialAuditLogs).where(eq(financialAuditLogs.entityId, commandId));
        assert.equal(audit.authorUsuarioId, actor.id);
        const payload = audit.payload as { before: { taxpayer: { personId: string | null }; supplier: { personId: string | null }; creditor: { supplierId: string | null } }; reason: string };
        assert.equal(payload.reason, fixture);
        assert.equal(payload.before.taxpayer.personId, null);
        assert.equal(payload.before.supplier.personId, null);
        assert.equal(payload.before.creditor.supplierId, null);
        assert.equal(JSON.stringify(audit.payload).includes(cpf), false);
      });
      await t.test("replay devolve mesmo comando sem alterar timestamp nem duplicar auditoria", async () => {
        const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, supplier.id));
        assert.equal(await reconcileCanonicalIdentityInTransaction(tx, actor.id, input), commandId);
        assert.deepEqual((await tx.select().from(suppliers).where(eq(suppliers.id, supplier.id)))[0], before);
        assert.equal((await tx.select().from(financialAuditLogs).where(eq(financialAuditLogs.entityId, commandId))).length, 1);
        await assert.rejects(reconcileCanonicalIdentityInTransaction(tx, actor.id, { ...input, reason: `${fixture} changed` }), /Chave de reconciliação/);
      });
      await t.test("conflitos de identidade, tipo e papel preservam registros", async () => {
        const [unlinked] = await tx.insert(suppliers).values({ notes: `${fixture} duplicate` }).returning();
        await assert.rejects(reconcileCanonicalIdentityInTransaction(tx, actor.id, { identityType: "PF", identityId: person.id, supplierId: unlinked.id, reason: fixture, idempotencyKey: `${fixture}duplicate` }), /mesmo papel/);
        assert.deepEqual((await tx.select().from(suppliers).where(eq(suppliers.id, unlinked.id)))[0], unlinked);
        await assert.rejects(reconcileCanonicalIdentityInTransaction(tx, actor.id, { ...input, identityType: "PJ", identityId: company.id, idempotencyKey: `${fixture}conflict` }), /outra identidade/);
        const [wrongType] = await tx.insert(taxpayers).values({ taxpayerType: "PF" }).returning();
        await assert.rejects(reconcileCanonicalIdentityInTransaction(tx, actor.id, { identityType: "PJ", identityId: company.id, taxpayerId: wrongType.id, reason: fixture, idempotencyKey: `${fixture}type` }), /Tipo PF\/PJ/);
        await assert.rejects(reconcileCanonicalIdentityInTransaction(tx, actor.id, { ...input, identityId: invalidPerson.id, idempotencyKey: `${fixture}invalid` }), /inválido/);
      });
      await t.test("falha da auditoria reverte todos os vínculos e PJ funciona com histórico íntegro", async () => {
        const [pjTaxpayer] = await tx.insert(taxpayers).values({ taxpayerType: "PJ" }).returning();
        const [pjSupplier] = await tx.insert(suppliers).values({ notes: `${fixture} PJ` }).returning();
        const [pjCreditor] = await tx.insert(creditors).values({ name: `${fixture} PJ`, document: cnpj }).returning();
        const pjInput = { identityType: "PJ" as const, identityId: company.id, taxpayerId: pjTaxpayer.id, supplierId: pjSupplier.id, creditorId: pjCreditor.id, reason: fixture, idempotencyKey: `${fixture}pj` };
        await assert.rejects(tx.transaction(nested => reconcileCanonicalIdentityInTransaction(nested, "missing-drizzle-audit-actor", pjInput)), error => getPostgresError(error)?.code === "23503");
        assert.deepEqual((await tx.select().from(taxpayers).where(eq(taxpayers.id, pjTaxpayer.id)))[0], pjTaxpayer);
        assert.deepEqual((await tx.select().from(suppliers).where(eq(suppliers.id, pjSupplier.id)))[0], pjSupplier);
        assert.deepEqual((await tx.select().from(creditors).where(eq(creditors.id, pjCreditor.id)))[0], pjCreditor);
        await reconcileCanonicalIdentityInTransaction(tx, actor.id, pjInput);
        const [saved] = await tx.select().from(creditors).where(eq(creditors.id, pjCreditor.id));
        assert.equal(saved.companyId, company.id); assert.equal(saved.personId, null); assert.equal(saved.supplierId, pjSupplier.id);
      });
      throw rollback;
    }, { timeoutMs: 75_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, commandId), eq(financialAuditLogs.action, "CANONICAL_IDENTITY_RECONCILIATION"))), []);
    assert.deepEqual(await connection.db.select({ id: people.id }).from(people).where(eq(people.fullName, fixture)), []);
    assert.deepEqual(await connection.db.select({ id: creditors.id }).from(creditors).where(eq(creditors.name, fixture)), []);
  } finally { await connection.pool.end(); }
});
