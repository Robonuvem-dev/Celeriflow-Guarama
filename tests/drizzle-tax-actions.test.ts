import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as projections from "../src/db/schema/tax-actions";
import { taxActionConnection } from "../src/db/repositories/tax-actions/context";
import { actionOriginExists, actionWorkspaceData, insertActionAudit, insertActionRegistryEntries, latestActionRegistryEntry } from "../src/db/repositories/tax-actions/registry";
import { actionIntegrationReplay, actionLatestRedesimEvent, insertActionIntegration, updateActionTaxpayerStatus } from "../src/db/repositories/tax-actions/integrations";
import { actionTaxpayerParties } from "../src/db/repositories/tax-actions/documents";
import { insertActionCertificate, insertActionDebt } from "../src/db/repositories/tax-actions/records";
import { createTaxActionsFixture } from "./helpers/tax-actions-fixture";

test("TaxActions: installed SQL, scoped reads and atomic writes on the real production driver", { timeout: 300_000 }, async t => {
  const fixture = await createTaxActionsFixture();
  const { db, connection } = fixture;
  try {
    await t.test("physical projections, nullable PF/PJ and UG/entity origins", async () => {
      const catalog = (await db.execute<{ table_name: string; column_name: string; type: string; not_null: boolean }>(sql`
        SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
      `)).rows;
      for (const table of Object.values(projections)) for (const column of Object.values(getTableColumns(table))) {
        const label = `${getTableName(table)}.${column.name}`;
        const physical = catalog.find(row => row.table_name === getTableName(table) && row.column_name === column.name);
        assert.ok(physical, label); assert.equal(physical.not_null, column.notNull, label);
        assert.equal(physical.type.replace(/\s+/g, "").replace(/withouttimezone$/, ""), column.getSQLType().replace(/\s+/g, ""), label);
      }
      const resolved = taxActionConnection({ database: db });
      assert.equal(resolved.db, db); assert.equal(resolved.pool, connection.pool);
      assert.equal(await actionOriginExists(db, "actions-entity", "actions-ug"), true);
      assert.equal(await actionOriginExists(db, "actions-other-entity", "actions-ug"), false);
      assert.equal(await actionOriginExists(db, "actions-entity", ""), false);
      assert.deepEqual(await actionTaxpayerParties(db, []), []);
      assert.deepEqual((await actionTaxpayerParties(db, ["actions-pj", "actions-pf", "actions-null"])).sort((a, b) => a.id.localeCompare(b.id)), [
        { id: "actions-null", person: null, company: null },
        { id: "actions-pf", person: { fullName: "Pessoa Fiscal", cpf: "52998224725" }, company: null },
        { id: "actions-pj", person: null, company: { corporateName: "Empresa Fiscal", cnpj: "11222333000181" } },
      ]);
    });

    await t.test("scope is applied before returning records; version and millisecond ordering stay intact", async () => {
      const instant = new Date("2026-10-01T12:34:56.123Z");
      await withDatabaseTransaction(connection, async tx => {
        const [entry] = await insertActionRegistryEntries(tx, [
          { id: "actions-v1", entityType: "TAXPAYER", entityId: "actions-pj", category: "ECONOMIC_PROFILE", title: "Perfil", data: { budgetUnitId: "actions-ug", governmentEntityId: "actions-entity" }, effectiveFrom: instant, version: 1 },
          { id: "actions-v2", entityType: "TAXPAYER", entityId: "actions-pj", category: "ECONOMIC_PROFILE", title: "Perfil", data: { budgetUnitId: "actions-other-ug", governmentEntityId: "actions-other-entity" }, effectiveFrom: new Date(instant.getTime() + 1), version: 2 },
          { id: "actions-public", entityType: "TAXPAYER", entityId: "actions-pj", category: "ANOTACAO", title: "Nota", data: null, effectiveFrom: new Date(instant.getTime() - 1) },
        ]);
        assert.equal(entry.effectiveFrom.toISOString(), instant.toISOString());
        assert.equal((await latestActionRegistryEntry(tx, "TAXPAYER", "actions-pj", "ECONOMIC_PROFILE"))?.id, "actions-v2");
      });
      const ids = async (scope?: string[]) => (await actionWorkspaceData(db, "TAXPAYER", "actions-pj", scope)).entries.map(row => row.id);
      assert.deepEqual(await ids([]), ["actions-public"]);
      assert.deepEqual(await ids(["actions-ug"]), ["actions-v1", "actions-public"]);
      assert.deepEqual(await ids(["actions-other-ug"]), ["actions-v2", "actions-public"]);
      assert.deepEqual(await ids(), ["actions-v2", "actions-v1", "actions-public"]);
      assert.equal((await db.execute<{ json_null: boolean }>(sql`SELECT data='null'::jsonb AS json_null FROM "TaxRegistryEntry" WHERE id='actions-public'`)).rows[0].json_null, true);
    });

    await t.test("JSON null differs from SQL NULL; exact Decimal, dates and durable integration replay survive", async () => {
      const instant = new Date("2026-10-01T12:34:56.789Z");
      await withDatabaseTransaction(connection, async tx => {
        const event = await insertActionIntegration(tx, { id: "actions-event", integrationCode: "REDESIM", eventType: "ALTERACAO", idempotencyKey: "actions-replay", taxpayerId: "actions-pj", payload: null, result: null, status: "PROCESSADO_INTERNO", receivedAt: instant, processedAt: instant });
        assert.equal(event.receivedAt.toISOString(), instant.toISOString());
        assert.equal(event.processedAt?.toISOString(), instant.toISOString());
        assert.equal((await actionIntegrationReplay(tx, "actions-replay"))?.id, event.id);
        await insertActionIntegration(tx, { id: "actions-sql-null", integrationCode: "TEST", eventType: "TEST", idempotencyKey: "actions-sql-null", payload: {}, receivedAt: instant });
        await insertActionIntegration(tx, { id: "actions-other-event", integrationCode: "REDESIM", eventType: "ALTERACAO", idempotencyKey: "actions-other-event", taxpayerId: "actions-pf", payload: {}, receivedAt: new Date(instant.getTime() + 1), status: "PROCESSADO_INTERNO" });
        await insertActionAudit(tx, { id: "actions-null-audit", action: "TEST", entityType: "TEST", entityId: event.id, payload: null, authorUsuarioId: "actions-actor" });
        const debt = await insertActionDebt(tx, { id: "actions-debt", taxpayerId: "actions-pj", originDebtType: "TEST", year: 2026, originalValue: 0.01, updatedValue: 0.02, originalValueDecimal: new Decimal("9999999999999999.99"), updatedValueDecimal: new Decimal("0.02"), createdAt: instant });
        assert.equal(debt.originalValueDecimal?.toFixed(2), "9999999999999999.99");
        assert.equal(debt.updatedValueDecimal?.toFixed(2), "0.02");
        assert.equal(debt.createdAt.toISOString(), instant.toISOString());
      });
      assert.equal((await actionLatestRedesimEvent(db, "actions-pj", null))?.receivedAt.toISOString(), instant.toISOString());
      const nulls = (await db.execute<{ json_null: boolean; sql_null: boolean; audit_null: boolean }>(sql`
        SELECT (SELECT payload='null'::jsonb AND result='null'::jsonb AND result IS NOT NULL FROM "TaxIntegrationEvent" WHERE id='actions-event') AS json_null,
          (SELECT result IS NULL FROM "TaxIntegrationEvent" WHERE id='actions-sql-null') AS sql_null,
          (SELECT payload='null'::jsonb AND payload IS NOT NULL FROM "TaxAuditLog" WHERE id='actions-null-audit') AS audit_null
      `)).rows[0];
      assert.deepEqual(nulls, { json_null: true, sql_null: true, audit_null: true });
      await assert.rejects(withDatabaseTransaction(connection, tx => insertActionIntegration(tx, { integrationCode: "REDESIM", eventType: "ALTERACAO", idempotencyKey: "actions-replay", payload: {} })), error => getPostgresError(error)?.code === "23505");
      assert.equal((await actionIntegrationReplay(db, "actions-replay"))?.id, "actions-event");
    });

    await t.test("failure of the final audit rolls back taxpayer, registry, integration and certificate together", async () => {
      const snapshot = async () => (await db.execute<{ snapshot: unknown }>(sql`
        SELECT jsonb_build_object(
          'taxpayers',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Taxpayer" p),
          'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "TaxRegistryEntry" r),
          'integrations',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "TaxIntegrationEvent" e),
          'certificates',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "TaxCertificate" c),
          'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "TaxAuditLog" a)
        ) AS snapshot
      `)).rows[0].snapshot;
      const before = await snapshot();
      await fixture.database.exec(`CREATE FUNCTION reject_tax_actions_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'tax actions final audit unavailable'; END $$;
        CREATE TRIGGER reject_tax_actions_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_tax_actions_audit()`);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await updateActionTaxpayerStatus(tx, ["actions-pj"], "Inativo");
        await insertActionRegistryEntries(tx, [{ entityType: "TAXPAYER", entityId: "actions-pj", category: "SITUACAO", title: "Rollback", data: { status: "Inativo" } }]);
        const event = await insertActionIntegration(tx, { integrationCode: "TEST", eventType: "ROLLBACK", idempotencyKey: "actions-rollback", payload: {} });
        const certificate = await insertActionCertificate(tx, { taxpayerId: "actions-pj", certificateType: "Positiva", authCode: "ACTIONS-ROLLBACK", validUntil: new Date("2027-01-01T23:59:59.999Z"), status: "Rascunho Interno" });
        assert.equal((await actionIntegrationReplay(tx, "actions-rollback"))?.id, event.id, "participants read uncommitted writes through the same tx");
        await insertActionAudit(tx, { action: "ROLLBACK", entityType: "TaxCertificate", entityId: certificate.id, authorUsuarioId: "actions-actor", payload: {} });
      }, { isolationLevel: "serializable" }), error => {
        const seen = new Set<unknown>();
        while (error instanceof Error && !seen.has(error)) {
          seen.add(error);
          if (getPostgresError(error)?.code === "P0001" && error.message === "tax actions final audit unavailable") return true;
          error = error.cause;
        }
        return false;
      });
      assert.deepEqual(await snapshot(), before);
      assert.equal(await actionIntegrationReplay(db, "actions-rollback"), null);
    });
  } finally { await fixture.close(); }
});
