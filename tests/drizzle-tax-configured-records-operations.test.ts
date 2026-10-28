import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { getPostgresError } from "../src/db/errors";
import { JsonNull } from "../src/db/json";
import { databaseTimestamp } from "../src/db/temporal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import * as projections from "../src/db/schema/tax-configured-records-operations";
import { insertConfiguredFiscalAudit, insertConfiguredFiscalEntry, readLatestConfiguredFiscalEntry, readValidConfiguredFiscalDocuments } from "../src/db/repositories/tax-configured-records-operations/records";
import { fiscalCatalogSchema, fiscalFieldSchema, publishFiscalCatalog, publishFiscalCatalogInTransaction, saveConfiguredFiscalRecord, saveConfiguredFiscalRecordInTransaction, validateFiscalFields } from "../src/lib/tributacao/configurable-cadastres";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { createConfiguredFiscalOperationsFixture } from "./helpers/tax-configured-records-operations-fixture";

type CatalogInput = Parameters<typeof publishFiscalCatalog>[2];
type RecordInput = Parameters<typeof saveConfiguredFiscalRecord>[2];
const catalog = (code: string, patch: Partial<CatalogInput> = {}): CatalogInput => ({
  governmentEntityId: "configured-entity", budgetUnitId: "configured-ug", expectedVersion: 0,
  kind: "ZONEAMENTO", code, name: code, active: true, fields: [], neighborhoodId: null, streetId: null,
  landUnitValue: null, legalBasis: "Lei municipal 2026; ato e vigência preservados", ...patch,
});
const record = (catalogId: string, patch: Partial<RecordInput> = {}): RecordInput => ({
  catalogId, entityType: "REAL_ESTATE", entityId: "configured-property", expectedVersion: 0,
  active: true, values: {}, processId: "configured-process", documentIds: [], frontage: null, ...patch,
});
function postgresError(code: string, message: RegExp) {
  return (error: unknown): boolean => {
    const visited = new Set<unknown>();
    while (error instanceof Error && !visited.has(error)) {
      visited.add(error);
      if ("code" in error && error.code === code && message.test(error.message)) return true;
      error = error.cause;
    }
    return false;
  };
}

test("Configured fiscal operations: full historical SQL and one-origin Neon/Drizzle transactions", { timeout: 300_000 }, async t => {
  const fixture = await createConfiguredFiscalOperationsFixture();
  const { db, connection, actor } = fixture;
  const snapshot = async () => (await db.execute<{ snapshot: unknown }>(sql`
    SELECT jsonb_build_object(
      'properties',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RealEstate" p),
      'economic',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "EconomicRegistration" e),
      'itbi',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "ItbiDeclaration" i),
      'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "TaxRegistryEntry" r),
      'audits',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "TaxAuditLog" a),
      'documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "Document" d),
      'processDocuments',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "ProcessDocument" d)
    ) AS snapshot
  `)).rows[0].snapshot;
  try {
    await t.test("156 migrations, exact physical projections and timestamp/JSON boundaries", async () => {
      assert.equal(fixture.migrationCount, 156);
      const physical = (await db.execute<{ table_name: string; column_name: string; type: string; not_null: boolean }>(sql`
        SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
      `)).rows;
      for (const table of Object.values(projections)) for (const column of Object.values(getTableColumns(table))) {
        const label = `${getTableName(table)}.${column.name}`;
        const installed = physical.find(row => row.table_name === getTableName(table) && row.column_name === column.name);
        assert.ok(installed, label);
        assert.equal(installed.not_null, column.notNull, label);
        assert.equal(installed.type.replace(/\s+/g, "").replace(/withouttimezone$/, ""), column.getSQLType().replace(/\s+/g, ""), label);
      }
      const instant = new Date("2026-10-28T12:34:56.789Z");
      await db.insert(taxRegistryEntries).values({ id: "configured-time", entityType: "TEST", entityId: "configured-time", category: "CONFIGURED_BOUNDARY", title: "Timestamp", data: JsonNull, effectiveFrom: instant, createdAt: instant, updatedAt: instant });
      const row = await readLatestConfiguredFiscalEntry(db, "TEST", "configured-time", "CONFIGURED_BOUNDARY");
      assert.ok(row);
      assert.equal(row.effectiveFrom.toISOString(), instant.toISOString());
      assert.equal(row.createdAt.toISOString(), instant.toISOString());
      assert.equal(row.updatedAt.toISOString(), instant.toISOString());
      assert.equal(row.effectiveUntil, null); assert.equal(row.reviewedAt, null); assert.equal(row.data, null);
      const raw = (await db.execute<{ createdAt: string; json_null: boolean; sql_null: boolean }>(sql`SELECT "createdAt",data='null'::jsonb AS json_null,"processId" IS NULL AS sql_null FROM "TaxRegistryEntry" WHERE id='configured-time'`)).rows[0];
      assert.equal(databaseTimestamp(raw.createdAt).getTime(), row.createdAt.getTime());
      assert.equal(raw.json_null, true); assert.equal(raw.sql_null, true);
      assert.deepEqual(await readValidConfiguredFiscalDocuments(db, []), []);
      const literal = "configured-doc'); DROP TABLE \"Document\"; --";
      assert.deepEqual(await readValidConfiguredFiscalDocuments(db, [literal, literal]), [{ id: literal }]);
    });

    await t.test("typed fields, nullable values, catalog versions and UG/entity segregation", async () => {
      const fields = [
        fiscalFieldSchema.parse({ key: "amount", label: "Valor", type: "NUMBER", required: true }),
        fiscalFieldSchema.parse({ key: "date", label: "Data", type: "DATE", required: true }),
        fiscalFieldSchema.parse({ key: "allowed", label: "Permitido", type: "BOOLEAN", required: true }),
        fiscalFieldSchema.parse({ key: "choice", label: "Opção", type: "LIST", required: true, options: ["A", "B"] }),
        fiscalFieldSchema.parse({ key: "note", label: "Nota", type: "TEXT", required: false }),
      ];
      const values = { amount: "9999999999999999.990000", date: "2026-02-28", allowed: false, choice: "A", note: null };
      assert.deepEqual(validateFiscalFields(fields, values), { ...values, amount: "9999999999999999.99" });
      for (const [patch, message] of [
        [{ amount: "NaN" }, /finito/], [{ amount: "invalido" }, /numérico/], [{ date: "2026-02-30" }, /data válida/],
        [{ allowed: "false" }, /verdadeiro ou falso/], [{ choice: "C" }, /lista configurada/], [{ amount: "" }, /obrigatório/], [{ extra: "x" }, /não configurados/],
      ] satisfies [Record<string, unknown>, RegExp][]) assert.throws(() => validateFiscalFields(fields, { ...values, ...patch }), message);
      assert.equal(fiscalCatalogSchema.safeParse(catalog("RESERVED", { fields: [{ key: "frontage", label: "Testada", type: "TEXT", required: false }] })).success, false);
      const input = catalog("FIELDS", { fields, catalogValues: values });
      const first = await publishFiscalCatalog(connection, actor, input);
      const stored = fiscalCatalogSchema.parse(first.data);
      assert.equal(stored.catalogValues?.amount, "9999999999999999.99");
      assert.equal(stored.catalogValues?.allowed, false); assert.equal(stored.catalogValues?.note, null);
      assert.equal(first.version, 1); assert.equal(first.source, "INTERNO"); assert.equal(first.processId, null);
      await assert.rejects(publishFiscalCatalog(connection, actor, input), /Já existe esse código/);
      await assert.rejects(publishFiscalCatalog(connection, { ...actor, allowedBudgetUnitIds: [] }, catalog("DENIED")), /autorizado/);
      await assert.rejects(publishFiscalCatalog(connection, actor, catalog("WRONG-ENTITY", { governmentEntityId: "configured-other-entity" })), /não pertence/);
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...input, catalogId: first.entityId, expectedVersion: 0 }), /alterado/);
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...input, catalogId: first.entityId, expectedVersion: 1, code: "CHANGED" }), /imutáveis/);
      const second = await publishFiscalCatalog(connection, actor, { ...input, catalogId: first.entityId, expectedVersion: 1, active: false });
      assert.equal(second.version, 2); assert.equal(second.status, "INATIVO");
      assert.equal((await readLatestConfiguredFiscalEntry(db, "FISCAL_CATALOG", first.entityId, "TYPED_FISCAL_CATALOG"))?.id, second.id);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(first.entityId, { values })), /desativado/);
      const other = await publishFiscalCatalog(connection, { ...actor, allowedBudgetUnitIds: ["configured-other-ug"] }, catalog("FIELDS", { governmentEntityId: "configured-other-entity", budgetUnitId: "configured-other-ug" }));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(other.entityId)), /autorizado/);
    });

    await t.test("zoning freezes active unambiguous latest CNAE definitions in the same origin", async () => {
      const activity = { cnae: "1234567", name: "Atividade municipal", active: true, governmentEntityId: "configured-entity", budgetUnitId: "configured-ug", risk: "BAIXO", serviceActivityIds: [], cboCodes: [], legalBasis: "Lei municipal" };
      const rules = [{ cnae: "1234567", treatment: "PERMISSIVEL", condition: "Exige ato municipal" }] satisfies NonNullable<CatalogInput["zoningActivities"]>;
      await assert.rejects(publishFiscalCatalog(connection, actor, catalog("MISSING-CNAE", { zoningActivities: rules })), /mesma origem municipal/);
      const definition = await withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: "ECONOMIC_ACTIVITY", entityId: "configured-activity", category: "ECONOMIC_ACTIVITY_DEFINITION", title: activity.name, version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: activity }));
      await withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: "ECONOMIC_ACTIVITY", entityId: "configured-foreign-activity", category: "ECONOMIC_ACTIVITY_DEFINITION", title: activity.name, version: 5, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: { ...activity, governmentEntityId: "configured-other-entity", budgetUnitId: "configured-other-ug" } }));
      const zone = await publishFiscalCatalog(connection, actor, catalog("CNAE", { zoningActivities: rules }));
      assert.deepEqual(taxScopeSnapshot(zone.data).zoningActivitySnapshots, [{ cnae: "1234567", activityId: "configured-activity", definitionId: definition.id, version: 1, name: activity.name }]);
      await withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: "ECONOMIC_ACTIVITY", entityId: "configured-activity", category: "ECONOMIC_ACTIVITY_DEFINITION", title: activity.name, version: 2, status: "INATIVO", actorUsuarioId: actor.usuarioId, data: { ...activity, active: false } }));
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...catalog("CNAE", { zoningActivities: rules }), catalogId: zone.entityId, expectedVersion: 1 }), /atividade ativa/);
      assert.deepEqual(taxScopeSnapshot((await readLatestConfiguredFiscalEntry(db, "FISCAL_CATALOG", zone.entityId, "TYPED_FISCAL_CATALOG"))?.data).zoningActivitySnapshots, taxScopeSnapshot(zone.data).zoningActivitySnapshots);
      await withDatabaseTransaction(connection, async tx => {
        // Adversarial historical definitions have distinct persisted titles, so
        // the physical (title, version) index remains enabled and satisfied.
        for (const entityId of ["configured-ambiguous-1", "configured-ambiguous-2"]) await insertConfiguredFiscalEntry(tx, { entityType: "ECONOMIC_ACTIVITY", entityId, category: "ECONOMIC_ACTIVITY_DEFINITION", title: entityId, version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: activity });
      });
      await assert.rejects(publishFiscalCatalog(connection, actor, catalog("AMBIGUOUS-CNAE", { zoningActivities: rules })), /inequívoca/);
    });

    await t.test("PGV/frontage and record snapshots preserve Decimal strings, native Float and provenance", async () => {
      const input = catalog("PGV", { kind: "PGV", neighborhoodId: "configured-neighborhood", streetId: "configured-street", landUnitValue: "9999999999999999.99" });
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...input, neighborhoodId: null }), /PGV exige/);
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...input, streetId: "missing" }), /Logradouro/);
      await assert.rejects(publishFiscalCatalog(connection, actor, { ...input, landUnitValue: "-0.01" }), /m² inválido/);
      const pgv = await publishFiscalCatalog(connection, actor, input);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(pgv.entityId)), /testada/);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(pgv.entityId, { frontage: "0" })), /positiva/);
      const first = await saveConfiguredFiscalRecord(connection, actor, record(pgv.entityId, { frontage: "10.000001", documentIds: ["configured-doc", "configured-doc"] }));
      const frozen = taxScopeSnapshot(first.data);
      assert.equal(frozen.landUnitValue, "9999999999999999.99"); assert.equal(frozen.frontage, "10.000001");
      assert.equal(frozen.catalogVersion, 1); assert.equal(frozen.definitionId, pgv.id); assert.equal(frozen.previousId, null);
      assert.deepEqual(frozen.documentIds, ["configured-doc", "configured-doc"]);
      assert.equal(first.processId, "configured-process"); assert.equal(first.documentId, "configured-doc"); assert.equal(first.actorUsuarioId, actor.usuarioId);
      await publishFiscalCatalog(connection, actor, { ...input, catalogId: pgv.entityId, expectedVersion: 1, landUnitValue: "0.000001" });
      const second = await saveConfiguredFiscalRecord(connection, actor, record(pgv.entityId, { expectedVersion: 1, active: false, frontage: null }));
      assert.equal(second.status, "INATIVO"); assert.equal(taxScopeSnapshot(second.data).previousId, first.id);
      assert.equal(taxScopeSnapshot(second.data).catalogVersion, 2);
      assert.equal(taxScopeSnapshot(first.data).landUnitValue, "9999999999999999.99");
      const native = (await db.execute<{ landArea: number; builtArea: number }>(sql`SELECT "landArea","builtArea" FROM "RealEstate" WHERE id='configured-property'`)).rows[0];
      assert.deepEqual(native, { landArea: 123.456789, builtArea: 0.125 });
      await assert.rejects(db.execute(sql`UPDATE "TaxRegistryEntry" SET title='mutação' WHERE id=${first.id}`), postgresError("P0001", /fiscal imutável/));
      await assert.rejects(db.execute(sql`DELETE FROM "TaxRegistryEntry" WHERE id=${pgv.id}`), postgresError("P0001", /fiscal imutável/));
      await assert.rejects(withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: first.entityType, entityId: first.entityId, category: first.category, title: first.title, version: first.version, status: first.status, actorUsuarioId: first.actorUsuarioId, data: first.data })), error => getPostgresError(error)?.code === "23505" && getPostgresError(error)?.constraint === "TaxRegistryEntry_typed_record_version_key");
    });

    await t.test("row/catalog locks serialize replay; independent inspection occurrences keep their own versions", async () => {
      const form = await publishFiscalCatalog(connection, actor, catalog("REPLAY"));
      const outcomes = await Promise.allSettled([saveConfiguredFiscalRecord(connection, actor, record(form.entityId)), saveConfiguredFiscalRecord(connection, actor, record(form.entityId))]);
      assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
      const failed = outcomes.find(outcome => outcome.status === "rejected");
      assert.ok(failed && failed.status === "rejected"); assert.match(String(failed.reason), /alterado/);
      const inspection = await publishFiscalCatalog(connection, actor, catalog("INSPECTION", { kind: "TIPO_VISTORIA_IMOVEL" }));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(inspection.entityId)), /ocorrência/);
      const occurrenceId = "00000000-0000-4000-8000-000000000001";
      const first = await saveConfiguredFiscalRecord(connection, actor, record(inspection.entityId, { occurrenceId }));
      assert.equal(first.title, `${inspection.entityId}:${occurrenceId}`);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(inspection.entityId, { occurrenceId })), /alterado/);
      const other = await saveConfiguredFiscalRecord(connection, actor, record(inspection.entityId, { occurrenceId: "00000000-0000-4000-8000-000000000002" }));
      assert.equal(other.version, 1);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(form.entityId, { expectedVersion: 1, occurrenceId })), /vistorias/);
    });

    await t.test("native property guards, reconciled BCI kind and author-attributed status history", async () => {
      const bci = await publishFiscalCatalog(connection, actor, catalog("BCI", { kind: "BCI_TERRENO" }));
      await saveConfiguredFiscalRecord(connection, actor, record(bci.entityId));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(bci.entityId, { entityId: "configured-other-property" })), /outro ente\/UG/);
      const unit = await publishFiscalCatalog(connection, actor, catalog("BCI-UNIT", { kind: "BCI_UNIDADE" }));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(unit.entityId)), /tipo conciliado/);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(bci.entityId, { expectedVersion: 1, processId: "missing" })), /Protocolo/);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(bci.entityId, { expectedVersion: 1, documentIds: ["configured-invalid-doc"] })), /documentos válidos/);
      await withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: "BUDGET_UNIT", entityId: "configured-ug", category: "PROPERTY_REGISTRATION_POLICY", title: "Protocolo obrigatório", version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: { requireProcess: true } }));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(bci.entityId, { expectedVersion: 1, processId: null })), postgresError("P0001", /exige protocolo/));
      const situation = await publishFiscalCatalog(connection, actor, catalog("PROPERTY-STATUS", { kind: "SITUACAO_IMOVEL", name: "Em construção" }));
      await saveConfiguredFiscalRecord(connection, actor, record(situation.entityId));
      const history = await readLatestConfiguredFiscalEntry(db, "REAL_ESTATE", "configured-property", "CADASTRAL_HISTORY");
      assert.ok(history); assert.equal(history.actorUsuarioId, actor.usuarioId);
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(history.data).after).status, "Em construção");
      await withDatabaseTransaction(connection, tx => insertConfiguredFiscalEntry(tx, { entityType: "REAL_ESTATE", entityId: "configured-legacy-property", category: "PROPERTY_EDIT_RESTRICTION", title: "Supervisor", version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: { enabled: true, governmentEntityId: "configured-entity", budgetUnitId: "configured-ug" } }));
      const before = await snapshot();
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(situation.entityId, { entityId: "configured-legacy-property" })), postgresError("P0001", /autorização do supervisor/));
      assert.deepEqual(await snapshot(), before);
    });

    await t.test("economic forms retain debt policy and native status/history atomicity", async () => {
      const form = await publishFiscalCatalog(connection, actor, catalog("ECONOMIC-FORM", { kind: "FORMULARIO_EMPRESA", fields: [{ key: "limit", label: "Limite", type: "NUMBER", required: true }] }));
      const input = record(form.entityId, { entityType: "ECONOMIC_REGISTRATION", entityId: "configured-economic", values: { limit: "999999999999.123456" } });
      const saved = await saveConfiguredFiscalRecord(connection, actor, input);
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(saved.data).values).limit, "999999999999.123456");
      const situation = await publishFiscalCatalog(connection, actor, catalog("ECONOMIC-STATUS", { kind: "SITUACAO_EMPRESA", name: "Suspenso" }));
      await saveConfiguredFiscalRecord(connection, actor, record(situation.entityId, { entityType: "ECONOMIC_REGISTRATION", entityId: "configured-economic" }));
      const history = await readLatestConfiguredFiscalEntry(db, "ECONOMIC_REGISTRATION", "configured-economic", "CADASTRAL_HISTORY");
      assert.ok(history); assert.equal(history.actorUsuarioId, actor.usuarioId);
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(history.data).after).status, "Suspenso");
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(history.data).after).startDate, "2026-01-01T00:00:00.123Z");
      await publishFiscalCatalog(connection, actor, catalog("LTDA", { kind: "TIPO_EMPRESA", name: "LTDA", validateCompanyDebt: true }));
      await db.execute(sql`INSERT INTO "ActiveDebt" (id,"originDebtType",year,"originalValue","updatedValue","originalValueDecimal","updatedValueDecimal","taxpayerId","governmentEntityId","budgetUnitId","updatedAt") VALUES ('configured-debt','TEST',2026,0.01,0.01,0.01,0.01,'configured-taxpayer','configured-entity','configured-ug',CURRENT_TIMESTAMP)`);
      const before = await snapshot();
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, { ...input, expectedVersion: 1 }), /débitos impeditivos/);
      assert.deepEqual(await snapshot(), before);
    });

    await t.test("ITBI consumes an uncommitted catalog and shares the caller transaction with audit and GED", async () => {
      await fixture.database.exec(`CREATE FUNCTION assert_configured_tx_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF current_setting('configured.test_origin',true) IS DISTINCT FROM txid_current()::text THEN RAISE EXCEPTION 'configured writer escaped caller transaction'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER assert_configured_registry_origin BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION assert_configured_tx_origin();
        CREATE TRIGGER assert_configured_audit_origin BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION assert_configured_tx_origin();
        CREATE TRIGGER assert_configured_document_origin BEFORE INSERT ON "ProcessDocument" FOR EACH ROW EXECUTE FUNCTION assert_configured_tx_origin()`);
      try {
        await withDatabaseTransaction(connection, async tx => {
          await tx.execute(sql`SELECT set_config('configured.test_origin',txid_current()::text,true)`);
          const form = await publishFiscalCatalogInTransaction(tx, actor, catalog("ITBI-IN-TX", { kind: "FORMULARIO_ITBI", fields: [{ key: "instrument", label: "Ato", type: "TEXT", required: true }] }));
          const input = record(form.entityId, { entityType: "ITBI_DECLARATION", entityId: "configured-itbi", values: { instrument: "  Escritura pública  " }, documentIds: ["configured-doc", "configured-doc"] });
          const saved = await saveConfiguredFiscalRecordInTransaction(tx, actor, input);
          assert.equal(taxScopeSnapshot(taxScopeSnapshot(saved.data).values).instrument, "Escritura pública");
          assert.equal((await readLatestConfiguredFiscalEntry(tx, "ITBI_DECLARATION", "configured-itbi", "TYPED_FISCAL_RECORD", form.entityId))?.id, saved.id);
          assert.equal((await tx.execute<{ count: number }>(sql`SELECT count(*)::integer AS count FROM "ProcessDocument" WHERE "processId"='configured-process' AND "documentId"='configured-doc'`)).rows[0].count, 1);
          assert.equal((await tx.execute<{ count: number }>(sql`SELECT count(*)::integer AS count FROM "TaxRegistryEntry" WHERE category='DOCUMENTO' AND "documentId"='configured-doc'`)).rows[0].count, 1);
        });
      } finally {
        await fixture.database.exec(`DROP TRIGGER assert_configured_registry_origin ON "TaxRegistryEntry"; DROP TRIGGER assert_configured_audit_origin ON "TaxAuditLog"; DROP TRIGGER assert_configured_document_origin ON "ProcessDocument"; DROP FUNCTION assert_configured_tx_origin()`);
      }
      const form = await publishFiscalCatalog(connection, actor, catalog("ITBI-SCOPE", { kind: "FORMULARIO_ITBI" }));
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(form.entityId, { entityType: "ITBI_DECLARATION", entityId: "configured-other-itbi" })), /outro ente\/UG/);
      await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(form.entityId)), /não se aplica/);
      const decimal = (await db.execute<{ amount: string; fraction: string; year: number }>(sql`SELECT "declaredPropertyValue"::text AS amount,"transmittedFraction"::text AS fraction,("calculationSnapshot"->>'year')::integer AS year FROM "ItbiDeclaration" WHERE id='configured-itbi'`)).rows[0];
      assert.deepEqual(decimal, { amount: "9999999999999999.99", fraction: "1.000000", year: 2026 });
    });

    await t.test("publication/save audit failure rolls back each service-owned transaction", async () => {
      const situation = await publishFiscalCatalog(connection, actor, catalog("PROPERTY-AUDIT-FAIL", { kind: "SITUACAO_IMOVEL", name: "Regular" }));
      const before = await snapshot();
      await fixture.database.exec(`CREATE FUNCTION reject_configured_service_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'configured service audit unavailable'; END $$;
        CREATE TRIGGER reject_configured_service_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_configured_service_audit()`);
      try {
        await assert.rejects(publishFiscalCatalog(connection, actor, catalog("CATALOG-AUDIT-FAIL")), postgresError("P0001", /^configured service audit unavailable$/));
        assert.deepEqual(await snapshot(), before);
        await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(situation.entityId)), postgresError("P0001", /^configured service audit unavailable$/));
        assert.deepEqual(await snapshot(), before);
      } finally { await fixture.database.exec(`DROP TRIGGER reject_configured_service_audit ON "TaxAuditLog"; DROP FUNCTION reject_configured_service_audit()`); }
    });

    await t.test("a failed GED participant rolls back the record and its already-written audit", async () => {
      const form = await publishFiscalCatalog(connection, actor, catalog("ITBI-GED-FAIL", { kind: "FORMULARIO_ITBI" }));
      const before = await snapshot();
      await fixture.database.exec(`CREATE FUNCTION reject_configured_ged() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'configured GED unavailable'; END $$;
        CREATE TRIGGER reject_configured_ged BEFORE INSERT ON "ProcessDocument" FOR EACH ROW EXECUTE FUNCTION reject_configured_ged()`);
      try {
        await assert.rejects(saveConfiguredFiscalRecord(connection, actor, record(form.entityId, { entityType: "ITBI_DECLARATION", entityId: "configured-itbi", documentIds: ["configured-doc-2"] })), postgresError("P0001", /^configured GED unavailable$/));
        assert.deepEqual(await snapshot(), before);
      } finally { await fixture.database.exec(`DROP TRIGGER reject_configured_ged ON "ProcessDocument"; DROP FUNCTION reject_configured_ged()`); }
    });

    await t.test("the last audit rolls back catalogs, native statuses, histories, snapshots and GED together", async () => {
      const before = await snapshot();
      await fixture.database.exec(`CREATE FUNCTION reject_configured_final_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action='CONFIGURED_FINAL_FAILURE' THEN RAISE EXCEPTION 'configured final audit unavailable'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_configured_final_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_configured_final_audit()`);
      try {
        await assert.rejects(withDatabaseTransaction(connection, async tx => {
          const property = await publishFiscalCatalogInTransaction(tx, actor, catalog("PROPERTY-ROLLBACK", { kind: "SITUACAO_IMOVEL", name: "Regular" }));
          const economic = await publishFiscalCatalogInTransaction(tx, actor, catalog("ECONOMIC-ROLLBACK", { kind: "SITUACAO_EMPRESA", name: "Baixado" }));
          const itbi = await publishFiscalCatalogInTransaction(tx, actor, catalog("ITBI-ROLLBACK", { kind: "FORMULARIO_ITBI" }));
          await saveConfiguredFiscalRecordInTransaction(tx, actor, record(property.entityId));
          await saveConfiguredFiscalRecordInTransaction(tx, actor, record(economic.entityId, { entityType: "ECONOMIC_REGISTRATION", entityId: "configured-economic" }));
          const saved = await saveConfiguredFiscalRecordInTransaction(tx, actor, record(itbi.entityId, { entityType: "ITBI_DECLARATION", entityId: "configured-itbi", documentIds: ["configured-doc-2"] }));
          assert.equal((await readLatestConfiguredFiscalEntry(tx, "ITBI_DECLARATION", "configured-itbi", "TYPED_FISCAL_RECORD", itbi.entityId))?.id, saved.id);
          assert.equal((await tx.execute<{ count: number }>(sql`SELECT count(*)::integer AS count FROM "ProcessDocument" WHERE "documentId"='configured-doc-2'`)).rows[0].count, 1);
          await insertConfiguredFiscalAudit(tx, { action: "CONFIGURED_FINAL_FAILURE", entityType: "TaxRegistryEntry", entityId: saved.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { afterId: saved.id } });
        }, { isolationLevel: "serializable" }), postgresError("P0001", /^configured final audit unavailable$/));
        assert.deepEqual(await snapshot(), before);
      } finally { await fixture.database.exec(`DROP TRIGGER reject_configured_final_audit ON "TaxAuditLog"; DROP FUNCTION reject_configured_final_audit()`); }
    });
  } finally { await fixture.close(); }
});
