import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import ts from "typescript";
import { and, asc, eq, sql } from "drizzle-orm";
import type { JsonValue } from "../src/db/json";
import { JsonNull } from "../src/db/json";
import { users } from "../src/db/schema/identity";
import { patients } from "../src/db/schema/health-registration";
import { healthUnits } from "../src/db/schema/health-workforce";
import { healthCbos, catalogItems } from "../src/db/schema/master-data";
import { healthSpecialties } from "../src/db/schema/health-administration";
import { healthSusImportBatches, healthSusImportIssues, healthSusProcedures, healthSusReferences, healthSusProcedureReferences } from "../src/db/schema/health-catalogs";
import { healthMaterialProfiles } from "../src/db/schema/health-pharmacy";
import { healthCatalogStockPolicies } from "../src/db/schema/health-catalog-tools";
import { medicines } from "../src/db/schema/health-prescriptions";
import { materials, materialCategories, warehouses } from "../src/db/schema/assets-stock";
import { planningAppropriations, planningEntityUnits } from "../src/db/schema/planning-budget";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { auditEvents } from "../src/db/schema/audit";
import { importHealthCareCatalogs } from "../scripts/import-health-care-catalogs";
import { loadSigtapBase } from "../scripts/load-sigtap-base";
import { prepareAuroraHealthIdentifiers } from "../scripts/prepare-aurora-health-identifiers";
import { prepareAuroraPharmacyCatalogs } from "../scripts/prepare-aurora-pharmacy-catalogs";

// Captured from each original script's AST before changing persistence.
const LOCAL_CHECKSUM = "57acf4589159887b4c3083c9c06ef896f6c9f9a1bc5514b7fc0ff4227f5cd759";
const CUSTOM_CBO_CHECKSUM = "14180eacafa9c682f47947513eaa25f5bd7e4fcb183b6d538e862e620be899a9";
const PHARMACY_HASH = "7ab6c83707132ff54d32e2ab68990a59175c1980c9821514e48dfe75f7dff9d0";
const PHARMACY_KEY = "aurora-pharmacy-catalogs-2026-v1";
const UNIT_ID = "aurora-shared-catalogs-2026-v1:ubs";
const CNS = ["898000000000118", "898000000000207", "898000000000304"];
const patientId = (index: number) => `aurora-shared-catalogs-2026-v1:patient:p1-poc-person-${index}`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function literal(node: ts.Expression, bindings: Record<string, JsonValue> = {}): JsonValue {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isIdentifier(node) && Object.hasOwn(bindings, node.text)) return bindings[node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => literal(item, bindings));
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property));
    assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
    return [property.name.text, literal(property.initializer, bindings)];
  }));
  throw new Error(`Payload não literal no AST: ${ts.SyntaxKind[node.kind]}`);
}

async function declarations(path: string) {
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
  const values = new Map<string, ts.Expression>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) values.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return (name: string) => { const value = values.get(name); assert.ok(value, `${path}: ${name}`); return value; };
}

test("AST: payloads e hashes históricos dos quatro scripts permanecem equivalentes", async () => {
  const local = await declarations("scripts/load-sigtap-base.ts");
  assert.equal(sha256(JSON.stringify(literal(local("rows"), { cbo225125: "Médico clínico" }))), "8e78e8fa4e79d5d97a986200e0963df2ce93d65e32af3476ea9faf61b3465123");
  assert.equal(sha256(JSON.stringify(literal(local("rows"), { cbo225125: 'Descrição CBO preexistente; com aspas "X"' }))), "38512e8d62eb218dde602c8f4cd0f28dbe1e135264b093cc9e332f8506e4df94");
  const pharmacy = await declarations("scripts/prepare-aurora-pharmacy-catalogs.ts");
  assert.equal(sha256(JSON.stringify(Object.fromEntries(["key", "healthUnitId", "products", "decision"].map(name => [name, literal(pharmacy(name))])))), PHARMACY_HASH);
  const official = await declarations("scripts/import-health-care-catalogs.ts");
  assert.equal(literal(official("CID_URL")), "https://raw.githubusercontent.com/SidneyBissoli/cid10-br-mcp/master/data/CID-10-SUBCATEGORIAS.CSV");
  assert.equal(literal(official("SIGTAP_URL")), "https://raw.githubusercontent.com/RicardoHerrero/SIGTAP-dataSUS/main/tabelas/TabelaUnificada_202310_v2310101444/tb_procedimento.txt");
  const identifiers = await declarations("scripts/prepare-aurora-health-identifiers.ts");
  assert.equal(literal(identifiers("key")), "aurora-health-identifiers-2026-v1");
  assert.equal(literal(identifiers("decision")), "Identificadores CNS sintéticos autorizados para os pacientes fictícios documentados das jornadas; dígito verificador local, sem consulta, inscrição ou confirmação CADSUS. Não são documentos oficiais de pessoas reais.");
  for (const path of ["scripts/import-health-care-catalogs.ts", "scripts/load-sigtap-base.ts", "scripts/prepare-aurora-health-identifiers.ts", "scripts/prepare-aurora-pharmacy-catalogs.ts", "scripts/lib/health-catalog-tools.ts", "src/db/schema/health-catalog-tools.ts"]) {
    const text = await readFile(path, "utf8");
    assert.doesNotMatch(text, /@prisma\/client|lib\/prisma|\bPrisma\b|\bprisma\b|\$transaction|\$queryRaw/);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    function check(node: ts.Node) {
      assert.ok(!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node), `${path}: cast`);
      ts.forEachChild(node, check);
    }
    check(source);
  }
});

test("SQL: catálogos Saúde no transporte Neon/Drizzle e nos 156 SQLs completos", { timeout: 240_000 }, async t => {
  // Dynamically loaded so the AST-only gate never opens PGlite or a pool.
  const { createHealthCatalogToolsFixture, healthCatalogChangedTables, healthCatalogProtectedTables } = await import("./helpers/health-catalog-tools-fixture");
  const fixture = await createHealthCatalogToolsFixture();
  const { db, connection } = fixture;
  async function rejectWithoutEffects(operation: () => Promise<unknown>, message?: RegExp) {
    const before = await fixture.snapshot();
    if (message) await assert.rejects(operation, message);
    else await assert.rejects(operation);
    assert.deepEqual(await fixture.snapshot(), before);
  }
  async function failAudit(table: "AuditEvent" | "FinancialAuditLog", condition: string, operation: () => Promise<void>) {
    await fixture.database.exec(`CREATE FUNCTION hct_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'hct controlled audit failure'; END $$;
      CREATE TRIGGER hct_fail_audit BEFORE INSERT ON "${table}" FOR EACH ROW WHEN (${condition}) EXECUTE FUNCTION hct_fail_audit();`);
    try { await operation(); }
    finally { await fixture.database.exec(`DROP TRIGGER hct_fail_audit ON "${table}"; DROP FUNCTION hct_fail_audit();`); }
  }
  async function withLockEvidence(key: string, operation: () => Promise<void>) {
    // Inspect the auditing session, after the data writes and before COMMIT.
    await fixture.database.exec(`CREATE FUNCTION hct_assert_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted
        AND classid=((hashtextextended('${key}',0)>>32)&4294967295)::oid
        AND objid=(hashtextextended('${key}',0)&4294967295)::oid AND objsubid=1)
        THEN RAISE EXCEPTION 'hct missing transaction lock'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER hct_assert_lock BEFORE INSERT ON "FinancialAuditLog" FOR EACH ROW EXECUTE FUNCTION hct_assert_lock();`);
    try { await operation(); }
    finally { await fixture.database.exec(`DROP TRIGGER hct_assert_lock ON "FinancialAuditLog"; DROP FUNCTION hct_assert_lock();`); }
  }
  try {
    await t.test("projeção física, Date UTC, numeric exato e sentinela de despesa", async () => {
      assert.equal(fixture.migrationCount, 156);
      const physical = await db.execute<{ name: string; type: string; notNull: boolean }>(sql`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS "notNull" FROM pg_attribute a WHERE a.attrelid='"HealthStockPolicy"'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
      assert.deepEqual(physical.rows, [
        { name: "id", type: "text", notNull: true }, { name: "warehouseId", type: "text", notNull: true }, { name: "materialId", type: "text", notNull: true },
        { name: "minQuantity", type: "double precision", notNull: true }, { name: "maxQuantity", type: "double precision", notNull: true }, { name: "isActive", type: "boolean", notNull: true },
        { name: "createdAt", type: "timestamp(3) without time zone", notNull: true }, { name: "updatedAt", type: "timestamp(3) without time zone", notNull: true },
      ]);
      const [user] = await db.select().from(users).where(eq(users.id, "hct-oldest"));
      assert.equal(user.createdAt.toISOString(), "2020-01-01T00:00:00.123Z");
      const [expense] = await db.select().from(planningAppropriations).where(eq(planningAppropriations.id, "hct-appropriation"));
      assert.equal(expense.initialValueDecimal?.toFixed(2), "123456789012345.67");
      assert.equal(expense.committedValue, 0.125);
    });

    await t.test("CID/SIGTAP: bytes, formato fixo, lotes de 1000, origem, sucessão e replay", async () => {
      await fixture.reset();
      await db.insert(healthSusImportBatches).values([
        { id: "hct-old-batch", source: "SIA", competence: "2021-01", origin: "Anterior SIA", fileName: "old.csv", fileFormat: "CSV", contractVersion: "OLD", checksum: "old", actorUsuarioId: "hct-admin" },
        { id: "hct-old-sigtap-batch", source: "SIGTAP", competence: "2021-01", origin: "Anterior SIGTAP", fileName: "old.txt", fileFormat: "TXT", contractVersion: "OLD", checksum: "old", actorUsuarioId: "hct-admin" },
      ]);
      await db.insert(healthSusReferences).values([
        { id: "hct-old-cid", source: "SIA", competence: "2021-01", kind: "CID", code: "A00", description: "CID anterior", sourceBatchId: "hct-old-batch" },
        { id: "hct-keep-service", source: "SIA", competence: "2021-01", kind: "SERVICO", code: "S1", description: "Serviço preservado", sourceBatchId: "hct-old-batch" },
        { id: "hct-keep-other-source", source: "SIGTAP", competence: "2021-01", kind: "CID", code: "A00", description: "Outra origem", sourceBatchId: "hct-old-sigtap-batch" },
      ]);
      await db.insert(healthSusProcedures).values([
        { id: "hct-old-procedure", source: "SIGTAP", competence: "2021-01", code: "0000000001", description: "Procedimento anterior", sourceBatchId: "hct-old-sigtap-batch" },
        { id: "hct-keep-procedure", source: "SIA", competence: "2021-01", code: "0000000001", description: "Outra origem", sourceBatchId: "hct-old-batch" },
      ]);
      const cidBytes = Buffer.from("codigo;classificacao;x;y;descricao\r\n" + Array.from({ length: 1001 }, (_, index) => `${index === 0 ? " a000 " : `A${String(index).padStart(5, "0")}`};${index === 1 ? "" : "Classe"};;;Atenção ${index}`).join("\r\n") + "\r\n;inválido;;;Sem código", "latin1");
      const procedureBytes = Buffer.from(Array.from({ length: 1001 }, (_, index) => `${String(index + 1).padStart(10, "0")}${`Descrição ${index}`.padEnd(250)}${index === 1 ? "9" : "2"}${index === 1 ? " " : "F"}${"".padEnd(50)}${index === 1 ? "  " : "06"}`).join("\n") + "\nlinha curta", "latin1");
      const protectedBefore = await fixture.snapshot(healthCatalogProtectedTables);
      const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request) => new Response(String(input).includes("CID-10") ? cidBytes : procedureBytes));
      try { assert.deepEqual(await importHealthCareCatalogs(connection), { cids: 1001, procedures: 1001 }); }
      finally { fetchMock.mock.restore(); }
      const batches = await db.select().from(healthSusImportBatches).orderBy(asc(healthSusImportBatches.competence));
      const cidBatch = batches.find(row => row.source === "SIA" && row.competence === "2022-01");
      const procedureBatch = batches.find(row => row.source === "SIGTAP" && row.competence === "2023-10");
      assert.ok(cidBatch && procedureBatch);
      assert.equal(cidBatch.checksum, sha256(cidBytes));
      assert.equal(procedureBatch.checksum, sha256(procedureBytes));
      for (const batch of [cidBatch, procedureBatch]) {
        assert.equal(batch.actorUsuarioId, "hct-oldest");
        assert.equal(batch.contractVersion, "F1-C/catalog-v1");
        assert.equal(batch.status, "COMPLETED");
        assert.equal(batch.processedCount, 1001);
        assert.equal(batch.insertedCount, 1001);
        assert.ok(batch.completedAt instanceof Date);
      }
      assert.equal(cidBatch.fileName, "CID-10-SUBCATEGORIAS.CSV");
      assert.match(cidBatch.origin, /^Ministério da Saúde\/DATASUS CID-10 · https:/);
      assert.equal(procedureBatch.fileFormat, "TXT");
      assert.match(procedureBatch.origin, /^Ministério da Saúde\/DATASUS SIGTAP · https:/);
      const [cid] = await db.select().from(healthSusReferences).where(and(eq(healthSusReferences.sourceBatchId, cidBatch.id), eq(healthSusReferences.code, "A00.0")));
      assert.equal(cid.description, "Atenção 0");
      assert.equal(cid.classification, "Classe");
      const [procedure] = await db.select().from(healthSusProcedures).where(and(eq(healthSusProcedures.sourceBatchId, procedureBatch.id), eq(healthSusProcedures.code, "0000000001")));
      assert.deepEqual([procedure.description, procedure.complexity, procedure.allowedSex, procedure.groupCode, procedure.subgroupCode, procedure.financing, procedure.unitValue], ["Descrição 0", "Média complexidade", "F", "00", "0000", "06", null]);
      const [unknown] = await db.select().from(healthSusProcedures).where(and(eq(healthSusProcedures.sourceBatchId, procedureBatch.id), eq(healthSusProcedures.code, "0000000002")));
      assert.deepEqual([unknown.complexity, unknown.allowedSex, unknown.financing], [null, null, null]);
      const references = await db.select().from(healthSusReferences);
      assert.equal(references.find(row => row.id === "hct-old-cid")?.isCurrent, false);
      assert.equal(references.find(row => row.id === "hct-keep-service")?.isCurrent, true);
      assert.equal(references.find(row => row.id === "hct-keep-other-source")?.isCurrent, true);
      const priorProcedures = await db.select().from(healthSusProcedures);
      assert.equal(priorProcedures.find(row => row.id === "hct-old-procedure")?.isCurrent, false);
      assert.equal(priorProcedures.find(row => row.id === "hct-keep-procedure")?.isCurrent, true);
      const source = async (url: string) => { const bytes = url.includes("CID-10") ? cidBytes : procedureBytes; return { content: new TextDecoder("windows-1252").decode(bytes), checksum: sha256(bytes) }; };
      await db.insert(healthSusReferences).values({ source: "SIA", competence: "2022-01", kind: "SERVICO", code: "HCT-SERVICE", description: "Não contar como CID", sourceBatchId: cidBatch.id });
      // Unlike the controlled local loader, official imports count any existing
      // checksum, including a previously FAILED batch; preserve that boundary.
      await db.update(healthSusImportBatches).set({ status: "FAILED" }).where(eq(healthSusImportBatches.id, cidBatch.id));
      const beforeReplay = await fixture.snapshot();
      assert.deepEqual(await importHealthCareCatalogs(connection, source), { cids: 1001, procedures: 1001 });
      assert.deepEqual(await fixture.snapshot(), beforeReplay);
      const badSource = async (url: string) => url.includes("CID-10") ? { content: "a;b;c;d;e\nA000;X;;;Um\nA000;X;;;Dois", checksum: "duplicate-cid" } : source(url);
      await rejectWithoutEffects(() => importHealthCareCatalogs(connection, badSource));
      const firstProcedure = new TextDecoder("windows-1252").decode(procedureBytes).split("\n")[0];
      const badProcedures = async (url: string) => url.includes("CID-10") ? source(url) : { content: `${firstProcedure}\n${firstProcedure}`, checksum: "duplicate-procedure" };
      await rejectWithoutEffects(() => importHealthCareCatalogs(connection, badProcedures));
      assert.deepEqual(await fixture.snapshot(healthCatalogProtectedTables), protectedBefore);
    });

    await t.test("carga local: 25 registros, referências, Decimal, payload e retomada FAILED", async () => {
      await fixture.reset();
      const protectedBefore = await fixture.snapshot(healthCatalogProtectedTables);
      const result = await loadSigtapBase(connection);
      assert.equal(result.status, "LOADED");
      assert.deepEqual(result.counters, { processed: 25, inserted: 25, updated: 0, ignored: 0 });
      assert.deepEqual(result.issues, []);
      const [batch] = await db.select().from(healthSusImportBatches).where(eq(healthSusImportBatches.id, result.batchId));
      assert.equal(batch.checksum, LOCAL_CHECKSUM);
      assert.equal(batch.actorUsuarioId, "hct-admin");
      assert.equal(batch.competence, "2026-09");
      assert.equal(batch.origin, "Carga controlada local para demonstração de fluxos (contrato LOCAL_CONTROLLED_V1; sem vínculo com atualização oficial)");
      assert.equal(batch.contractVersion, "LOCAL_CONTROLLED_V1");
      assert.equal(batch.fileName, "sigtap-base-local.csv");
      const procedures = await db.select().from(healthSusProcedures).orderBy(asc(healthSusProcedures.code));
      assert.deepEqual(procedures.map(row => row.unitValue?.toFixed(2)), ["10.00", "0.00", "8.50", "3.00", "5.00", "25.00", "30.00", "12.00", "4.00", "2.50", "15.00", "7.00"]);
      assert.deepEqual([procedures[7].minimumAge, procedures[7].maximumAge, procedures[7].allowedSex], [25, 64, "F"]);
      assert.equal((await db.select().from(healthSusReferences)).length, 13);
      assert.equal((await db.select().from(healthSusProcedureReferences)).length, 49);
      const [audit] = await db.select().from(auditEvents);
      assert.deepEqual([audit.actorUsuarioId, audit.eventType, audit.targetType, audit.targetId], ["hct-admin", "ADMINISTRATIVE_MUTATION", "HEALTH_SUS_IMPORT", result.batchId]);
      const beforeReplay = await fixture.snapshot();
      assert.deepEqual(await loadSigtapBase(connection), { status: "SKIPPED_DUPLICATE", batchId: result.batchId });
      assert.deepEqual(await fixture.snapshot(), beforeReplay);
      await db.update(healthSusImportBatches).set({ status: "FAILED", actorUsuarioId: "hct-oldest" }).where(eq(healthSusImportBatches.id, result.batchId));
      await db.insert(healthSusImportIssues).values({ batchId: result.batchId, rowNumber: 999, entityType: "OLD", reason: "Diagnóstico anterior" });
      const retried = await loadSigtapBase(connection);
      assert.equal(retried.batchId, result.batchId);
      assert.deepEqual(retried.counters, { processed: 25, inserted: 0, updated: 25, ignored: 0 });
      assert.equal((await db.select().from(healthSusImportIssues)).length, 0);
      const [retriedBatch] = await db.select().from(healthSusImportBatches);
      assert.equal(retriedBatch.actorUsuarioId, "hct-oldest");
      assert.ok(retriedBatch.completedAt instanceof Date);
      assert.deepEqual(await fixture.snapshot(healthCatalogProtectedTables), protectedBefore);
    });

    await t.test("carga local: CBO existente, diagnóstico e auditoria/rollback na mesma tx", async () => {
      await fixture.reset();
      await db.insert(healthCbos).values({ code: "225125", description: 'Descrição CBO preexistente; com aspas "X"' });
      await db.insert(healthSpecialties).values({ code: "hct-other-specialty", name: "Medicina de família e comunidade (carga local)" });
      const result = await loadSigtapBase(connection);
      assert.deepEqual(result.counters, { processed: 25, inserted: 24, updated: 0, ignored: 1 });
      assert.deepEqual(result.issues, [{ rowNumber: 14, entityType: "ESPECIALIDADE", reason: "A descrição da especialidade já está associada a outro código." }]);
      const [batch] = await db.select().from(healthSusImportBatches);
      assert.equal(batch.checksum, CUSTOM_CBO_CHECKSUM);
      assert.equal(batch.status, "COMPLETED_WITH_ISSUES");
      const [issue] = await db.select().from(healthSusImportIssues);
      assert.deepEqual([issue.batchId, issue.rowNumber, issue.entityType, issue.reason], [batch.id, 14, "ESPECIALIDADE", result.issues?.[0].reason]);
      await db.update(healthSusImportBatches).set({ status: "FAILED", completedAt: new Date("2026-01-02T03:04:05.678Z") }).where(eq(healthSusImportBatches.id, batch.id));
      const before = await fixture.snapshot(healthCatalogChangedTables.filter(table => table !== "HealthSusImportBatch"));
      await failAudit("AuditEvent", `NEW."targetType" = 'HEALTH_SUS_IMPORT'`, async () => { await assert.rejects(() => loadSigtapBase(connection)); });
      assert.deepEqual(await fixture.snapshot(healthCatalogChangedTables.filter(table => table !== "HealthSusImportBatch")), before);
      const [processing] = await db.select().from(healthSusImportBatches);
      assert.equal(processing.status, "PROCESSING");
      assert.equal(processing.completedAt, null);
      // The original script creates/resumes the batch before the transaction.
      const processingSnapshot = await fixture.snapshot();
      assert.deepEqual(await loadSigtapBase(connection), { status: "SKIPPED_DUPLICATE", batchId: batch.id });
      assert.deepEqual(await fixture.snapshot(), processingSnapshot);
      await fixture.reset();
      await db.update(users).set({ employeeId: null }).where(eq(users.id, "hct-admin"));
      await rejectWithoutEffects(() => loadSigtapBase(connection), /Usuario não encontrado/);
    });

    await t.test("identificadores: dry-run, CNS fixos, identidade, autoria e replay sem escrita", async () => {
      await fixture.reset();
      const protectedBefore = await fixture.snapshot(healthCatalogProtectedTables);
      const before = await fixture.snapshot();
      const dry = await prepareAuroraHealthIdentifiers(connection, false);
      assert.equal(dry.mode, "READ_ONLY");
      assert.deepEqual(dry.patients.map(row => row.replay), [false, false, false]);
      assert.deepEqual(await fixture.snapshot(), before);
      await withLockEvidence("aurora-health-identifiers-2026-v1", async () => { await prepareAuroraHealthIdentifiers(connection, true); });
      const rows = await db.select().from(patients).orderBy(asc(patients.personId));
      assert.deepEqual(rows.map(row => row.cns), CNS);
      const audits = await db.select().from(financialAuditLogs).orderBy(asc(financialAuditLogs.entityId));
      assert.equal(audits.length, 3);
      for (let index = 0; index < audits.length; index++) {
        assert.deepEqual([audits[index].action, audits[index].entityType, audits[index].entityId, audits[index].authorUsuarioId], ["PREPARE_SYNTHETIC_HEALTH_IDENTIFIER", "Patient", patientId(index + 1), "hct-admin"]);
        assert.deepEqual(audits[index].payload, { decision: dry.decision, configurationKey: "aurora-health-identifiers-2026-v1", identifierNature: "SYNTHETIC_NOT_CADSUS_VERIFIED", personId: `p1-poc-person-${index + 1}` });
      }
      const replaySnapshot = await fixture.snapshot();
      const replay = await prepareAuroraHealthIdentifiers(connection, true);
      assert.deepEqual(replay.patients.map(row => row.replay), [true, true, true]);
      assert.deepEqual(await fixture.snapshot(), replaySnapshot);
      assert.deepEqual(await fixture.snapshot(healthCatalogProtectedTables), protectedBefore);
    });

    await t.test("identificadores: preservar preexistentes e rollback de paciente/auditoria", async () => {
      await fixture.reset();
      await db.update(patients).set({ cns: CNS[0] }).where(eq(patients.id, patientId(1)));
      await prepareAuroraHealthIdentifiers(connection, true);
      assert.equal((await db.select().from(financialAuditLogs)).length, 2);
      await fixture.reset();
      await db.update(patients).set({ cns: "898000000000999" }).where(eq(patients.id, patientId(3)));
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, false), /CNS distinto/);
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true), /CNS distinto/);
      await fixture.reset();
      await db.update(patients).set({ personId: "p1-poc-person-4" }).where(eq(patients.id, patientId(3)));
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true), /identidade fictícia/);
      await fixture.reset();
      await db.insert(patients).values({ id: "hct-other-patient", personId: "p1-poc-person-4", cns: CNS[2] });
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true), /outra pessoa/);
      await fixture.reset();
      await db.update(users).set({ ativo: false }).where(eq(users.id, "hct-admin"));
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true), /Administrador autorizado inativo/);
      await fixture.reset();
      await db.delete(patients).where(eq(patients.id, patientId(3)));
      await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true), /Patient não encontrado/);
      await fixture.reset();
      await failAudit("FinancialAuditLog", `NEW."entityId" = '${patientId(2)}'`, async () => { await rejectWithoutEffects(() => prepareAuroraHealthIdentifiers(connection, true)); });
    });

    await t.test("farmácia: dry-run/apply, hashes, vínculos, Float/inteiro, conversão e replay", async () => {
      await fixture.reset();
      const protectedBefore = await fixture.snapshot(healthCatalogProtectedTables);
      const before = await fixture.snapshot();
      const dry = await prepareAuroraPharmacyCatalogs(connection, false);
      assert.deepEqual([dry.mode, dry.replay, dry.configurationHash], ["READ_ONLY", false, PHARMACY_HASH]);
      assert.deepEqual(await fixture.snapshot(), before);
      await withLockEvidence(PHARMACY_KEY, async () => { assert.equal((await prepareAuroraPharmacyCatalogs(connection, true)).replay, false); });
      const materialRows = await db.select().from(materials).orderBy(asc(materials.code));
      assert.deepEqual(materialRows.map(row => [row.id, row.catalogItemId, row.unitOfMeasure, row.isPerishable, row.minStock, row.maxStock]), ["AUR-FAR-001", "AUR-FAR-002"].map(code => [`${PHARMACY_KEY}:material:${code}`, `${PHARMACY_KEY}:catalog:${code}`, "UN", true, 20, 200]));
      const catalogRows = await db.select().from(catalogItems).orderBy(asc(catalogItems.code));
      assert.deepEqual(catalogRows.map(row => [row.name, row.description, row.specification, row.unit, row.productKind]), [["Paracetamol 500 mg", "Paracetamol — 500 mg", "Comprimido", "UN", "MATERIAL"], ["Solução de cloreto de sódio 0,9% 100 mL", "Cloreto de sódio — 0,9%", "Frasco 100 mL", "UN", "MATERIAL"]]);
      const profiles = await db.select().from(healthMaterialProfiles);
      assert.equal(profiles.length, 2);
      for (const profile of profiles) assert.deepEqual([profile.productKind, profile.stockUnitsPerSupply, profile.dcbCode, profile.catmatCode, profile.renameMember, profile.remumeMember], ["MEDICINE", 1, null, null, false, false]);
      assert.deepEqual((await db.select().from(medicines)).map(row => [row.currentStock, row.minStock, row.isControlled]), [[0, 20, false], [0, 20, false]]);
      const policies = await db.select().from(healthCatalogStockPolicies);
      assert.equal(policies.length, 4);
      for (const row of policies) assert.deepEqual([row.minQuantity, row.maxQuantity, row.isActive, row.createdAt instanceof Date, row.updatedAt instanceof Date], [20, 200, true, true, true]);
      const warehouseRows = await db.select().from(warehouses);
      assert.equal(warehouseRows.length, 2);
      for (const row of warehouseRows) assert.deepEqual([row.healthUnitId, row.costCenterId], [UNIT_ID, `${PHARMACY_KEY}:cost-center`]);
      const [audit] = await db.select().from(financialAuditLogs);
      assert.deepEqual([audit.action, audit.entityType, audit.entityId, audit.authorUsuarioId], ["PREPARE_PHARMACY_CATALOGS", "MUNICIPAL_CONFIGURATION", PHARMACY_KEY, "hct-admin"]);
      assert.deepEqual(audit.payload, { configurationHash: PHARMACY_HASH, decision: dry.decision, parameterOrigin: "OWNER_ESTIMATE", products: ["AUR-FAR-001", "AUR-FAR-002"], healthUnitId: UNIT_ID, governmentEntityId: "p0-current-exe", stockBalancesCreated: false, clinicalRecordsCreated: false });
      const replaySnapshot = await fixture.snapshot();
      assert.equal((await prepareAuroraPharmacyCatalogs(connection, true)).replay, true);
      assert.deepEqual(await fixture.snapshot(), replaySnapshot);
      await db.update(materials).set({ name: "Cadastro local posterior a preservar" }).where(eq(materials.id, materialRows[0].id));
      const driftSnapshot = await fixture.snapshot();
      assert.equal((await prepareAuroraPharmacyCatalogs(connection, true)).replay, true);
      assert.deepEqual(await fixture.snapshot(), driftSnapshot);
      assert.deepEqual(await fixture.snapshot(healthCatalogProtectedTables), protectedBefore);
    });

    await t.test("farmácia: colisões, ente/UG, autorização, JSON null e rollback completo", async () => {
      await fixture.reset();
      await db.insert(catalogItems).values({ code: "AUR-FAR-002", name: "Cadastro anterior" });
      const beforeDry = await fixture.snapshot();
      assert.equal((await prepareAuroraPharmacyCatalogs(connection, false)).mode, "READ_ONLY");
      assert.deepEqual(await fixture.snapshot(), beforeDry);
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true), /Código de medicamento já utilizado/);
      await fixture.reset();
      await db.insert(materialCategories).values({ code: "AUR-MEDICAMENTOS", name: "Grupo preexistente" });
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true));
      await fixture.reset();
      await db.update(planningEntityUnits).set({ governmentEntityId: "hct-other" }).where(eq(planningEntityUnits.budgetUnitId, "p0-current-exe-ug-1"));
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, false), /UG da Saúde divergente/);
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true), /UG da Saúde divergente/);
      await fixture.reset();
      await db.update(healthUnits).set({ isActive: false }).where(eq(healthUnits.id, UNIT_ID));
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true), /HealthUnit não encontrado/);
      await fixture.reset();
      await db.update(users).set({ ativo: false }).where(eq(users.id, "hct-admin"));
      await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true), /Operador autorizado inativo/);
      for (const payload of [{ configurationHash: "divergent" }, null, JsonNull]) {
        await fixture.reset();
        await db.insert(financialAuditLogs).values({ action: "PREPARE_PHARMACY_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: PHARMACY_KEY, authorUsuarioId: "hct-admin", payload });
        await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, false), /Preparação anterior divergente/);
        await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true), /Preparação anterior divergente/);
      }
      await fixture.reset();
      const protectedBefore = await fixture.snapshot(healthCatalogProtectedTables);
      await failAudit("FinancialAuditLog", `NEW.action = 'PREPARE_PHARMACY_CATALOGS'`, async () => { await rejectWithoutEffects(() => prepareAuroraPharmacyCatalogs(connection, true)); });
      assert.deepEqual(await fixture.snapshot(healthCatalogProtectedTables), protectedBefore);
    });
  } finally { await fixture.close(); }
});
