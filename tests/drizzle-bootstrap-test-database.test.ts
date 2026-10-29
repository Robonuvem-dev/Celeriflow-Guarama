import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { queryRows } from "../scripts/lib/cross-domain-database";
import { resolveBootstrapTestTarget } from "../scripts/lib/cross-domain-bootstrap-test-target";
import { resetBootstrapTestSchema } from "../scripts/lib/cross-domain-bootstrap-test-reset.mjs";
import { bootstrapTestDatabaseMain } from "../scripts/bootstrap-test-database.mjs";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { seedBootstrapTestFixture } from "../prisma/bootstrap-test/seed";

test("bootstrap dedicado exige TEST, rejeita alias operacional e não aceita redirecionamento", () => {
  const production = "postgresql://runtime:secret@ep-main.region.neon.tech/neondb";
  const dedicated = "postgresql://test:secret@ep-test.region.neon.tech/neondb";
  assert.throws(() => resolveBootstrapTestTarget({ DATABASE_URL: production }), /TEST_DATABASE_URL is required/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL_UNPOOLED: dedicated }), /TEST_DATABASE_URL is required/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL: "postgresql://other:password@ep-main-pooler.region.neon.tech/neondb", DATABASE_URL: production }), /must differ/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL: dedicated, TEST_DATABASE_URL_UNPOOLED: production }), /same dedicated test database/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL: `${dedicated}?host=ep-main.region.neon.tech` }), /routing overrides/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL: `${dedicated}?schema=other` }), /only the public schema/);
  assert.throws(() => resolveBootstrapTestTarget({ TEST_DATABASE_URL: dedicated, DATABASE_MIGRATION_URL: dedicated }), /must differ/);
  const unpooled = "postgresql://test:secret@ep-test.region.neon.tech/neondb?sslmode=require";
  assert.deepEqual(resolveBootstrapTestTarget({ TEST_DATABASE_URL: dedicated.replace("ep-test.", "ep-test-pooler."), TEST_DATABASE_URL_UNPOOLED: unpooled, DATABASE_URL: production }), { connectionString: unpooled, databaseName: "neondb" });
});

test("bootstrap TEST real: reset público, replay de 156 históricos e SQLs futuros, fixture Drizzle", { timeout: 300_000 }, async t => {
  const migrations = loadMigrationSet();
  assert.equal(migrations.historical.length, 156);
  const fixture = await createLocalDrizzleDatabase();
  const { db } = fixture.connection;
  const url = fixture.connection.pool.options.connectionString;
  assert.ok(url);
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "test", TEST_DATABASE_URL: url };
  try {
    await fixture.database.exec("CREATE TABLE public.bootstrap_reset_sentinel (id text PRIMARY KEY); INSERT INTO public.bootstrap_reset_sentinel VALUES ('disposable-test-only'); CREATE SCHEMA bootstrap_external; CREATE TABLE bootstrap_external.dependant (id text REFERENCES public.bootstrap_reset_sentinel(id));");
    await t.test("reset não alcança outro schema e reverte a tentativa recusada", async () => {
      const client = await fixture.connection.pool.connect();
      try {
        await assert.rejects(resetBootstrapTestSchema({ query: client.query.bind(client), exec: (text: string) => client.query(text) }, environment), /public-only/);
      } finally { client.release(); }
      assert.equal((await queryRows(db, sql`SELECT id FROM public.bootstrap_reset_sentinel`)).length, 1);
      assert.equal((await queryRows(db, sql`SELECT to_regclass('bootstrap_external.dependant') IS NOT NULL AS present`))[0].present, true);
    });
    await fixture.database.exec("DROP SCHEMA bootstrap_external CASCADE");
    await fixture.database.exec('CREATE ROLE "bootstrap role ""quoted"; GRANT USAGE ON SCHEMA public TO "bootstrap role ""quoted" WITH GRANT OPTION; REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const [ownership] = await queryRows<{ owner: string; roles: string }>(db, sql`SELECT pg_get_userbyid(nspowner) AS owner,(SELECT count(*)::text FROM pg_roles) AS roles FROM pg_namespace WHERE nspname='public'`);
    const permissions = await queryRows(db, sql`SELECT a.grantee,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY a.grantee,a.privilege_type,a.is_grantable`);
    const result = await bootstrapTestDatabaseMain(environment);
    assert.equal(result.result, "PASS");
    assert.equal(result.migrations, migrations.migrations.length);
    assert.equal(result.origin, "replayed");

    await t.test("recibos representam execução real; roles e guards históricos sobrevivem", async () => {
      assert.equal((await queryRows(db, sql`SELECT to_regclass('public.bootstrap_reset_sentinel') IS NULL AS absent`))[0].absent, true);
      assert.equal((await queryRows(db, sql`SELECT to_regclass('public._prisma_migrations') IS NULL AS absent`))[0].absent, true);
      const [receipts] = await queryRows<{ count: number; executed: number }>(db, sql`SELECT count(*)::integer AS count,count(*) FILTER (WHERE origin='executed' AND legacy_row IS NULL)::integer AS executed FROM public._celeriflow_sql_migrations`);
      assert.deepEqual(receipts, { count: migrations.migrations.length, executed: migrations.migrations.length });
      const applied = await queryRows<{ name: string; checksum: string }>(db, sql`SELECT name,checksum FROM public._celeriflow_sql_migrations ORDER BY name`);
      assert.deepEqual(applied, migrations.migrations.map(({ name, checksum }: { name: string; checksum: string }) => ({ name, checksum })));
      const [after] = await queryRows<{ owner: string; roles: string }>(db, sql`SELECT pg_get_userbyid(nspowner) AS owner,(SELECT count(*)::text FROM pg_roles) AS roles FROM pg_namespace WHERE nspname='public'`);
      assert.deepEqual(after, ownership);
      assert.deepEqual(await queryRows(db, sql`SELECT a.grantee,a.privilege_type,a.is_grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' ORDER BY a.grantee,a.privilege_type,a.is_grantable`), permissions);
      const triggers = await queryRows<{ name: string; enabled: string }>(db, sql`SELECT tgname AS name,tgenabled AS enabled FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY(${sql.param(["AuditEvent_append_only", "FinancialAuditLog_append_only", "PersonMergeLedger_append_only", "HrPayrollConfigurationChange_append_only", "DocumentVersion_protect_integrity"])}::text[])`);
      assert.equal(triggers.length, 5);
      assert.ok(triggers.every(trigger => trigger.enabled === "O"));
      await db.execute(sql`INSERT INTO "AuditEvent" (id,"eventType","targetType","targetId","actorUsuarioId") VALUES ('bootstrap-guard-event','BOOTSTRAP_CHECK','TEST','fixture','bootstrap-audit-actor')`);
      await db.execute(sql`INSERT INTO "FinancialAuditLog" (id,action,"entityType","entityId","authorUsuarioId") VALUES ('bootstrap-guard-financial','BOOTSTRAP_CHECK','TEST','fixture','bootstrap-audit-actor')`);
      await assert.rejects(db.execute(sql`UPDATE "AuditEvent" SET "targetId"='tampered' WHERE id='bootstrap-guard-event'`), error => getPostgresError(error)?.code === "P0001");
      await assert.rejects(db.execute(sql`DELETE FROM "FinancialAuditLog" WHERE id='bootstrap-guard-financial'`), error => getPostgresError(error)?.code === "P0001");
    });

    await t.test("fixture preserva vínculos, valores exatos, datas e recorte legado do exercício", async () => {
      const [row] = await queryRows<{ appropriationId: string; initial: string; committed: string; budgetUnitCode: string; sourceCode: string; year: number; governmentEntityId: string | null; endDate: string; creditorId: string; supplierId: string }>(db, sql`SELECT a.id AS "appropriationId",a."initialValueDecimal"::text AS initial,a."committedValueDecimal"::text AS committed,u.code AS "budgetUnitCode",s.code AS "sourceCode",y.year,y."governmentEntityId",y."endDate"::text AS "endDate",c."creditorId",c."supplierId" FROM "BudgetAppropriation" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "ResourceSource" s ON s.id=a."resourceSourceId" JOIN "FinancialYear" y ON y.id=a."financialYearId" JOIN "Commitment" c ON c."appropriationId"=a.id WHERE c.number='EMP-RAP-FIXTURE-01'`);
      assert.equal(row.appropriationId, "appropriation-finance-test-01");
      assert.equal(row.initial, "1000000.00");
      assert.equal(row.committed, "100.00");
      assert.equal(row.budgetUnitCode, "0101");
      assert.equal(row.sourceCode, "15000000");
      assert.equal(row.year, 2026);
      assert.equal(row.governmentEntityId, null);
      assert.match(row.endDate, /^2026-12-31 23:59:59\.999/);
      assert.equal(row.creditorId, "creditor-lagoaseca-01");
      assert.equal(row.supplierId, "supp-lagoaseca-01");
      const [opening] = await queryRows<{ count: number; total: string }>(db, sql`SELECT count(*)::integer AS count,sum("valueDecimal")::text AS total FROM "TreasuryMovement" WHERE "sourceModule"='TEST_FIXTURE'`);
      assert.deepEqual(opening, { count: 3, total: "650000.00" });
      const [retention] = await queryRows<{ rate: string; base: string }>(db, sql`SELECT "ratePercentage"::text AS rate,"calculationBasePercentage"::text AS base FROM "RetentionRule" WHERE code='INSS_11'`);
      assert.deepEqual(retention, { rate: "11.0000", base: "100.0000" });
    });

    await t.test("reseed é idempotente e mantém os campos omitidos das atualizações antigas", async () => {
      await db.execute(sql`UPDATE "Usuario" SET senha='kept-password',"firebaseUid"='fixture-kept-uid',ativo=false,nome='altered' WHERE id='bootstrap-audit-actor'`);
      await db.execute(sql`UPDATE "TreasuryMovement" SET history='kept opening evidence',"sourceModule"='KEPT_MODULE',"valueDecimal"=1 WHERE "idempotencyKey"='test-opening-10001-0-2026'`);
      await db.execute(sql`UPDATE "ResourceSource" SET "referenceYear"=2030 WHERE code='15000000'`);
      await db.execute(sql`UPDATE "ResourceSource" SET id='bootstrap-existing-source' WHERE code='15000000'`);
      await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('bootstrap-scoped-entity','BOOTSTRAP-SCOPED','Ente isolado da fixture','PREFEITURA',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('bootstrap-scoped-year',2026,'bootstrap-scoped-entity','Em Encerramento','2026-01-01','2026-12-31',CURRENT_TIMESTAMP)`);
      const [event] = await queryRows<{ id: string; debitAccountId: string; creditAccountId: string }>(db, sql`SELECT r."eventId" AS id,r."debitAccountId",r."creditAccountId" FROM "AccountingPostingRule" r JOIN "AccountingEventCatalog" e ON e.id=r."eventId" WHERE e.code='EMPENHO_EMITIDO' AND r."isActive"=true LIMIT 1`);
      await db.execute(sql`INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt") VALUES ('bootstrap-extra-credit','BOOTSTRAP.EXTRA','Conta adicional da fixture','Passivo',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId","isActive","updatedAt") VALUES ('bootstrap-extra-rule',${event.id},${event.debitAccountId},'bootstrap-extra-credit',true,CURRENT_TIMESTAMP)`);
      await withDatabaseTransaction(fixture.connection, seedBootstrapTestFixture, { timeoutMs: 120_000 });
      const [user] = await queryRows<{ senha: string; firebaseUid: string; ativo: boolean; nome: string }>(db, sql`SELECT senha,"firebaseUid",ativo,nome FROM "Usuario" WHERE id='bootstrap-audit-actor'`);
      assert.deepEqual(user, { senha: "kept-password", firebaseUid: "fixture-kept-uid", ativo: true, nome: "Bootstrap Audit Actor" });
      const [movement] = await queryRows<{ history: string; sourceModule: string; value: string }>(db, sql`SELECT history,"sourceModule","valueDecimal"::text AS value FROM "TreasuryMovement" WHERE "idempotencyKey"='test-opening-10001-0-2026'`);
      assert.deepEqual(movement, { history: "kept opening evidence", sourceModule: "KEPT_MODULE", value: "300000.00" });
      assert.equal((await queryRows(db, sql`SELECT "referenceYear" FROM "ResourceSource" WHERE code='15000000'`))[0].referenceYear, 2030);
      assert.equal((await queryRows(db, sql`SELECT id FROM "ResourceSource" WHERE code='15000000'`))[0].id, "bootstrap-existing-source");
      assert.equal((await queryRows(db, sql`SELECT "resourceSourceId" FROM "BudgetAppropriation" WHERE id='appropriation-finance-test-01'`))[0].resourceSourceId, "bootstrap-existing-source");
      assert.equal((await queryRows(db, sql`SELECT status FROM "FinancialYear" WHERE id='bootstrap-scoped-year'`))[0].status, "Em Encerramento");
      assert.equal((await queryRows(db, sql`SELECT "isActive" FROM "AccountingPostingRule" WHERE id='bootstrap-extra-rule'`))[0].isActive, false);
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "TreasuryMovement" WHERE "idempotencyKey" LIKE 'test-opening-%-2026'`))[0].count, 3);
    });

    await t.test("falha tardia de FK reverte a carga e mantém o estado anterior", async () => {
      const [before] = await queryRows<{ row: Record<string, unknown> }>(db, sql`SELECT to_jsonb(u) AS row FROM "Usuario" u WHERE id='bootstrap-audit-actor'`);
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.execute(sql`UPDATE "Usuario" SET nome='must roll back' WHERE id='bootstrap-audit-actor'`);
        await tx.execute(sql`DELETE FROM "Commitment" WHERE number='EMP-RAP-FIXTURE-01'`);
        await tx.execute(sql`UPDATE "Creditor" SET id='bootstrap-conflicting-creditor' WHERE id='creditor-lagoaseca-01'`);
        await seedBootstrapTestFixture(tx);
      }, { timeoutMs: 120_000 }), error => getPostgresError(error)?.code === "23503");
      assert.deepEqual((await queryRows<{ row: Record<string, unknown> }>(db, sql`SELECT to_jsonb(u) AS row FROM "Usuario" u WHERE id='bootstrap-audit-actor'`))[0].row, before.row);
      assert.equal((await queryRows(db, sql`SELECT "creditorId" FROM "Commitment" WHERE number='EMP-RAP-FIXTURE-01'`))[0].creditorId, "creditor-lagoaseca-01");
    });
  } finally { await fixture.close(); }
});
