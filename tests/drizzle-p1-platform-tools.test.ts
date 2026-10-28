import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { users } from "../src/db/schema/identity";
import { planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { identifier, insertToolRows, queryRows } from "../scripts/lib/cross-domain-database";
import { insertP1DraftCatalog } from "../scripts/lib/cross-domain-p1-catalogs";
import { readPlanningCatalogs } from "../scripts/lib/cross-domain-planning-catalogs";
import { parseP1CboCapture, importP1CboCapture } from "../scripts/import-poc-p1-cbo";
import { parseP1CnaeCapture, importP1CnaeCapture } from "../scripts/import-poc-p1-cnae";
import { parseP1OfficialSource, p1OfficialSources, summarizeP1OfficialCatalogs, importP1OfficialCatalogs } from "../scripts/import-poc-p1-official-catalogs";
import { prepareP1IdentityLinks, p1SyntheticCpf } from "../scripts/prepare-poc-p1-identities";
import { readP1ScopeReport, p1ScopeHasRequiredFoundation } from "../scripts/verify-poc-p1-scope";
import { readMunicipalModuleReadiness } from "../scripts/verify-municipal-module-readiness";
import { publishAuroraPublicModels, type AuroraModelFiles } from "../scripts/publish-aurora-public-models";
import { auroraPublicModels } from "../src/lib/transparencia/aurora-models";
import { renderTransparencyFile } from "../src/lib/transparencia/export-files";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
// The official capture is a simple two-column source, without quoted CSV fields.
// Keep SQL-shaped text as a value without introducing a third source column.
const cboParameterText = "Descrição oficial ' OR '1'='1' --";
const cboBytes = () => Buffer.from(`CODIGO;TITULO\r\n${Array.from({ length: 2000 }, (_, index) => `${100000 + index};${index ? `Ocupação ${index}` : cboParameterText}`).join("\r\n")}\r\n`, "latin1");
const cboCapture = () => {
  const bytes = cboBytes();
  return parseP1CboCapture(bytes, { sha256: sha256(bytes), url: "https://example.test/cbo", capturedAt: "2026-10-28T00:00:00Z", encoding: "windows-1252" });
};
const cnaeCapture = () => {
  const bytes = Buffer.from(JSON.stringify([
    { id: "1234501", descricao: "Atividade '); SELECT pg_sleep(100); --", classe: { id: "12345", descricao: "Classe preservada" }, extra: { flags: [true, null, "evidência"] } },
    { id: "1234502", descricao: "Outra atividade", classe: { id: "12345" } },
  ]));
  return parseP1CnaeCapture(bytes, { sha256: sha256(bytes), url: "https://example.test/cnae", capturedAt: "2026-10-28T00:00:00Z", entries: 2 });
};
type OfficialCatalog = Awaited<ReturnType<typeof parseP1OfficialSource>>;
function officialCatalog(index: number): OfficialCatalog {
  const source = { ...p1OfficialSources[index], hash: sha256(`official-fixture-${index}`) };
  const id = `p1-tce-pr-${source.kind.toLowerCase()}-2026-${source.version}`;
  return { id, source, entries: [{ id: `${id}:1.0`, versionId: id, kind: source.kind, code: "1.0", name: "Classificação de ensaio", degree: 1, canonicalId: `UNMAPPED:TCE_PR:${source.kind}:1.0`, attributes: { postingAllowed: true, mapped: false, homologated: false } }] };
}

test("fontes P1 puras: hashes, Windows-1252, quantidade e sourceRecord CNAE", () => {
  const cbo = cboCapture();
  assert.equal(cbo.rows.length, 2000);
  assert.equal(cbo.rows[0].name, cboParameterText);
  assert.equal(cbo.versionId, `p1-mte-cbo-capture-${cbo.hash.slice(0, 16)}`);
  assert.throws(() => parseP1CboCapture(cboBytes(), { ...cbo.metadata, sha256: "different" }), /Hash/);
  assert.throws(() => parseP1CboCapture(cboBytes(), { ...cbo.metadata, encoding: "utf-8" }), /codificação/);
  const duplicate = Buffer.from(cboBytes().toString("latin1").replace("100001;", "100000;"), "latin1");
  assert.throws(() => parseP1CboCapture(duplicate, { ...cbo.metadata, sha256: sha256(duplicate) }), /duplicados/);
  const cnae = cnaeCapture();
  assert.deepEqual(cnae.rows[0].extra, { flags: [true, null, "evidência"] });
  const duplicateCnae = Buffer.from(JSON.stringify([cnae.rows[0], cnae.rows[0]]));
  assert.throws(() => parseP1CnaeCapture(duplicateCnae, { ...cnae.metadata, sha256: sha256(duplicateCnae) }), /duplicados/);
  assert.throws(() => parseP1CnaeCapture(Buffer.from("[]"), { ...cnae.metadata, sha256: sha256("[]") }), /quantidade/);
  assert.equal(p1SyntheticCpf(1), "98000000113");
  assert.equal(new Set(Array.from({ length: 21 }, (_, index) => p1SyntheticCpf(index + 1))).size, 21);
});

test("planilha P1: cabeçalhos, fórmulas em cache, hierarquia, nível e hash", async () => {
  const root = join(tmpdir(), "opencode");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "p1-official-"));
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("fixture");
    const heading = sheet.getRow(1);
    heading.getCell(1).value = "tpEscrituracao";
    heading.getCell(2).value = "tpNaturezaSaldo";
    heading.getCell(3).value = "tpNaturezaInformacao";
    heading.getCell(14).value = "Conta";
    heading.getCell(15).value = "Ano";
    heading.getCell(16).value = "Nome";
    for (let index = 0; index < 100; index++) {
      const row = sheet.getRow(index + 2);
      row.getCell(1).value = index % 2 ? "N" : "S";
      row.getCell(2).value = "D";
      row.getCell(3).value = "P";
      row.getCell(14).value = `1.${index}.0`;
      row.getCell(15).value = 2026;
      row.getCell(16).value = `Conta ${index}`;
    }
    sheet.getRow(2).getCell(16).value = { richText: [{ text: "Conta " }, { text: "raiz" }] };
    sheet.getRow(3).getCell(16).value = { formula: '"Não executar fórmula"', result: "Nome preservado do cache" };
    const file = join(directory, "fixture.xlsx");
    await workbook.xlsx.writeFile(file);
    const source = { ...p1OfficialSources[0], file: "fixture.xlsx", sheet: "fixture", header: 1, hash: sha256(readFileSync(file)) };
    const catalog = await parseP1OfficialSource(source, directory);
    assert.equal(catalog.entries.length, 100);
    assert.equal(catalog.entries[0].name, "Conta raiz");
    assert.equal(catalog.entries[1].name, "Nome preservado do cache");
    assert.equal(catalog.entries[1].parentCode, "1.0.0");
    assert.equal(catalog.entries[1].degree, 2);
    assert.equal(catalog.entries[1].attributes.postingAllowed, false);
    assert.equal(summarizeP1OfficialCatalogs([catalog])[0].postingAllowed, 50);
    await assert.rejects(parseP1OfficialSource({ ...source, hash: "wrong" }, directory), /Hash divergente/);
    sheet.getRow(2).getCell(15).value = 2025;
    await workbook.xlsx.writeFile(file);
    await assert.rejects(parseP1OfficialSource({ ...source, hash: sha256(readFileSync(file)) }, directory), /Ano divergente/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("plataforma P1: driver real, catálogos, identidades, escopo e publicação", { timeout: 300_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const { db } = fixture.connection;
  const count = async (table: string) => (await queryRows<{ count: number }>(db, sql`SELECT count(*)::integer AS count FROM ${identifier(table)}`))[0].count;
  const identitySnapshot = () => queryRows<{ model: string; row: unknown }>(db, sql`SELECT model,row FROM (SELECT 'Usuario' AS model,to_jsonb(u) AS row FROM "Usuario" u UNION ALL SELECT 'ConfiguracaoPerfil',to_jsonb(p) FROM "ConfiguracaoPerfil" p) snapshots ORDER BY model,row::text`);
  try {
    const client = await fixture.connection.pool.connect();
    try { await runDatabaseMigrations({ query: client.query.bind(client), exec: (text: string) => client.query(text) }, loadMigrationSet(), { command: "replay" }); }
    finally { client.release(); }
    const [profile] = await queryRows<{ id: string }>(db, sql`SELECT id FROM "ConfiguracaoPerfil" LIMIT 1`);
    const [actor] = await db.insert(users).values({ id: "p1-platform-actor", nome: "Operador P1", email: "p1-platform@example.test", senha: "fixture-kept-secret", firebaseUid: "fixture-kept-auth-uid", perfilId: profile.id }).returning();

    await t.test("CBO: preview, candidatos/conflitos, importação e revisão local preservados", async () => {
      const capture = cboCapture();
      const usersBefore = await identitySnapshot();
      await db.execute(sql`INSERT INTO "HealthCbo" (id,code,description,"updatedAt") VALUES ('p1-local-cbo-a',${capture.rows[0].code},${capture.rows[0].name},CURRENT_TIMESTAMP),('p1-local-cbo-b',${capture.rows[1].code},'Descrição local preservada',CURRENT_TIMESTAMP)`);
      const before = await count("PlanningCatalogVersion");
      const preview = await importP1CboCapture(fixture.connection, capture, false);
      assert.equal(preview.existingCanonicalCandidates, 1);
      assert.deepEqual(preview.conflicts, [{ code: capture.rows[1].code, official: capture.rows[1].name, local: "Descrição local preservada" }]);
      assert.equal(await count("PlanningCatalogVersion"), before);
      await importP1CboCapture(fixture.connection, capture, true);
      const [version] = await readPlanningCatalogs(db, [capture.versionId]);
      assert.equal(version.status, "DRAFT");
      assert.equal(version.entries.length, 2000);
      assert.equal(version.entries.find(entry => entry.code === capture.rows[0].code)?.name, cboParameterText);
      assert.deepEqual(await identitySnapshot(), usersBefore);
      const snapshot = JSON.stringify(version);
      await importP1CboCapture(fixture.connection, capture, true);
      assert.equal(JSON.stringify((await readPlanningCatalogs(db, [capture.versionId]))[0]), snapshot);
      await db.execute(sql`UPDATE "PlanningCatalogEntry" SET "canonicalId"='local-reviewed-cbo' WHERE "versionId"=${capture.versionId} AND code=${capture.rows[0].code}`);
      await assert.rejects(importP1CboCapture(fixture.connection, capture, true), /De-para CBO alterado/);
      assert.equal((await queryRows(db, sql`SELECT "canonicalId" FROM "PlanningCatalogEntry" WHERE "versionId"=${capture.versionId} AND code=${capture.rows[0].code}`))[0].canonicalId, "local-reviewed-cbo");
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "FinancialAuditLog" WHERE action='IMPORT_CBO_DRAFT' AND "entityId"=${capture.versionId}`))[0].count, 1);
      assert.equal((await queryRows(db, sql`SELECT description FROM "HealthCbo" WHERE id='p1-local-cbo-b'`))[0].description, "Descrição local preservada");
    });

    await t.test("CNAE: sourceRecord completo, parâmetros e divergência de hierarquia", async () => {
      const capture = cnaeCapture();
      await importP1CnaeCapture(fixture.connection, capture, false);
      assert.equal((await readPlanningCatalogs(db, [capture.versionId])).length, 0);
      await importP1CnaeCapture(fixture.connection, capture, true);
      const [version] = await readPlanningCatalogs(db, [capture.versionId]);
      const entry = version.entries.find(row => row.code === capture.rows[0].id)!;
      assert.equal(entry.name, capture.rows[0].descricao);
      assert.deepEqual(entry.attributes, { sourceUrl: capture.metadata.url, sourceHash: capture.hash, capturedAt: capture.metadata.capturedAt, sourceRecord: capture.rows[0], mapped: false, versionVerified: false, effectiveDatesVerified: false });
      await importP1CnaeCapture(fixture.connection, capture, true);
      await db.execute(sql`UPDATE "PlanningCatalogEntry" SET "parentCode"='local-parent' WHERE id=${entry.id}`);
      await assert.rejects(importP1CnaeCapture(fixture.connection, capture, false), /De-para CNAE alterado/);
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "FinancialAuditLog" WHERE action='IMPORT_CNAE_DRAFT' AND "entityId"=${capture.versionId}`))[0].count, 1);
    });

    await t.test("catálogos oficiais: rollback do lote, auditoria atômica e IDs determinísticos", async () => {
      const account = officialCatalog(0), revenue = officialCatalog(1);
      await db.insert(planningCatalogVersions).values({ id: revenue.id, year: 2026, label: "Versão local", normativeReference: "Não sobrescrever", sourceHash: "different-local-hash", createdById: actor.id });
      await assert.rejects(importP1OfficialCatalogs(fixture.connection, [account, revenue]), /Versão existente divergente/);
      assert.equal((await readPlanningCatalogs(db, [account.id])).length, 0);
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "FinancialAuditLog" WHERE action='IMPORT_OFFICIAL_CATALOG' AND "entityId"=${account.id}`))[0].count, 0);
      await db.execute(sql`DELETE FROM "PlanningCatalogVersion" WHERE id=${revenue.id}`);
      await importP1OfficialCatalogs(fixture.connection, [account, revenue]);
      await db.execute(sql`UPDATE "PlanningCatalogEntry" SET name='Edição local mantida' WHERE "versionId"=${account.id}`);
      await importP1OfficialCatalogs(fixture.connection, [account, revenue]);
      const [stored] = await readPlanningCatalogs(db, [account.id]);
      assert.equal(stored.entries[0].id, account.entries[0].id);
      assert.equal(stored.entries[0].name, "Edição local mantida");
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => insertP1DraftCatalog(tx, { id: "p1-audit-rollback", year: 2026, label: "Reverter", normativeReference: "Ensaio", sourceHash: "audit-rollback-hash", entries: [{ versionId: "p1-audit-rollback", kind: "CNAE", code: "1", name: "Reverter", degree: 1, canonicalId: "UNMAPPED:1", attributes: {} }] }, "missing-actor", "IMPORT_CNAE_DRAFT", {})), error => getPostgresError(error)?.code === "23503");
      assert.equal((await readPlanningCatalogs(db, ["p1-audit-rollback"])).length, 0);
    });

    await t.test("identidades: preview, colisão de CPF, rollback por cadeia, replay e Auth/RBAC preservados", async () => {
      for (let index = 1; index <= 21; index++) await insertToolRows(db, "Taxpayer", { id: `p0-current-taxpayer-${index}`, taxpayerType: "PF", municipalInsc: `P1.TEST.${index}` });
      const authBefore = await identitySnapshot();
      const before = await count("Person");
      const preview = await prepareP1IdentityLinks(fixture.connection, false);
      assert.equal(preview.links.length, 21);
      assert.equal(await count("Person"), before);
      await insertToolRows(db, "Person", { id: "p1-cpf-collision", fullName: "Outra identidade", cpf: p1SyntheticCpf(1) });
      await assert.rejects(prepareP1IdentityLinks(fixture.connection, true), /Documento sintético já utilizado/);
      assert.equal((await queryRows(db, sql`SELECT "personId" FROM "Taxpayer" WHERE id='p0-current-taxpayer-1'`))[0].personId, null);
      await db.execute(sql`DELETE FROM "Person" WHERE id='p1-cpf-collision'`);
      await insertToolRows(db, "Person", [{ id: "p1-poc-person-1", fullName: "Nome local preservado", cpf: p1SyntheticCpf(1), email: "kept@example.test" }, { id: "p1-poc-person-2", fullName: "Pessoa 2", cpf: p1SyntheticCpf(2) }]);
      await db.execute(sql`INSERT INTO "Supplier" (id,"personId","updatedAt") VALUES ('p1-unexpected-supplier','p1-poc-person-2',CURRENT_TIMESTAMP)`);
      await assert.rejects(prepareP1IdentityLinks(fixture.connection, true), /fornecedor inesperado/);
      assert.equal((await queryRows(db, sql`SELECT "personId" FROM "Taxpayer" WHERE id='p0-current-taxpayer-1'`))[0].personId, "p1-poc-person-1");
      assert.equal((await queryRows(db, sql`SELECT "personId" FROM "Taxpayer" WHERE id='p0-current-taxpayer-2'`))[0].personId, null);
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "FinancialAuditLog" WHERE action='POC_P1_IDENTITY_LINK'`))[0].count, 1);
      await db.execute(sql`DELETE FROM "Supplier" WHERE id='p1-unexpected-supplier'`);
      await prepareP1IdentityLinks(fixture.connection, true);
      const [person] = await queryRows<{ row: unknown }>(db, sql`SELECT to_jsonb(p) AS row FROM "Person" p WHERE id='p1-poc-person-1'`);
      await prepareP1IdentityLinks(fixture.connection, true);
      assert.deepEqual((await queryRows(db, sql`SELECT to_jsonb(p) AS row FROM "Person" p WHERE id='p1-poc-person-1'`))[0].row, person.row);
      assert.equal((await queryRows(db, sql`SELECT "fullName" FROM "Person" WHERE id='p1-poc-person-1'`))[0].fullName, "Nome local preservado");
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "FinancialAuditLog" WHERE action='POC_P1_IDENTITY_LINK'`))[0].count, 21);
      assert.equal((await queryRows(db, sql`SELECT count(*)::integer AS count FROM "Taxpayer" t JOIN "Supplier" s ON s."personId"=t."personId" JOIN "Creditor" c ON c."personId"=t."personId" AND c."supplierId"=s.id WHERE starts_with(t.id,'p0-current-taxpayer-')`))[0].count, 21);
      assert.deepEqual(await identitySnapshot(), authBefore);
    });

    await t.test("leitura de escopo/prontidão é read-only e exige o recorte exato 2/42/12/18", async () => {
      for (const suffix of ["exe", "leg"]) {
        const entityId = `p0-current-${suffix}`;
        await insertToolRows(db, "GovernmentEntity", { id: entityId, code: `P1.${suffix}`, name: `Ente ${suffix}`, type: suffix === "exe" ? "PREFEITURA" : "CAMARA" });
        const secretariatId = `p1-scope-${suffix}-secretariat`;
        await insertToolRows(db, "Secretariat", { id: secretariatId, name: `Secretaria de ensaio ${suffix}` });
        for (let index = 1; index <= 21; index++) await insertToolRows(db, "BudgetUnit", { id: `p0-current-${suffix}-ug-${index}`, code: `P1.${suffix}.${index}`, name: `Unidade ${index}`, secretariatId });
        for (let year = 2022; year <= 2027; year++) await insertToolRows(db, "FinancialYear", { id: `p1-${suffix}-year-${year}`, governmentEntityId: entityId, year, startDate: new Date(`${year}-01-01T00:00:00.000Z`), endDate: new Date(`${year}-12-31T23:59:59.999Z`) });
        for (let index = 1; index <= 9; index++) {
          const id = `p0-current-${suffix}-test-ppa-${index}`;
          await insertToolRows(db, "MultiYearPlan", { id, code: id, name: "Instrumento de ensaio", startYear: 2024, endYear: 2027 });
          await insertToolRows(db, "PlanningInstrument", { id, governmentEntityId: entityId, kind: "PPA", code: id, title: "Instrumento de ensaio", startYear: 2024, endYear: 2027, multiYearPlanId: id, createdById: actor.id });
        }
      }
      const readinessBefore = await readMunicipalModuleReadiness(db);
      await db.execute(sql`INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,"updatedAt") VALUES
        ('p1-profile-active','MUNICIPALITY','p1-test','ACCOUNTING_PROFILE','Perfil de teste','{}'::jsonb,'ATIVO',CURRENT_TIMESTAMP),
        ('p1-profile-inactive','MUNICIPALITY','p1-test','ACCOUNTING_PROFILE','Perfil inativo','{}'::jsonb,'INATIVO',CURRENT_TIMESTAMP),
        ('p1-profile-other','MUNICIPALITY','p1-test','OTHER','Outro registro','{}'::jsonb,'ATIVO',CURRENT_TIMESTAMP)`);
      const before = { versions: await count("PlanningCatalogVersion"), audit: await count("FinancialAuditLog"), users: await identitySnapshot() };
      const result = await withDatabaseTransaction(fixture.connection, async tx => ({ scope: await readP1ScopeReport(tx), readiness: await readMunicipalModuleReadiness(tx) }), { accessMode: "read only" });
      assert.equal(result.scope.migrations.length, 7);
      assert.equal(result.scope.migrationsApplied, true);
      assert.deepEqual(result.scope.p0Fixtures, { entities: 2, units: 42, years: 12, instruments: 18 });
      assert.equal(p1ScopeHasRequiredFoundation(result.scope), true);
      assert.equal(result.scope.preservation, "SELECT-only; no rows updated or inserted");
      assert.ok(result.readiness.catalogVersions.some(row => row.id === "p1-tce-pr-account-2026-1.0d"));
      assert.ok(!result.readiness.catalogVersions.some(row => row.id === "p1-tce-pr-revenue-2026-1.0e"));
      assert.equal(result.readiness.operationalDependencies.bankConfigurationRequired, result.readiness.bankAccounts === 0);
      assert.equal(result.readiness.operationalDependencies.taxAccountingActivationRequired, result.readiness.activeTaxAccountingProfiles === 0);
      assert.equal(result.readiness.activeTaxAccountingProfiles, readinessBefore.activeTaxAccountingProfiles + 1);
      assert.equal((await queryRows(db, sql`SELECT to_regclass('public._prisma_migrations') IS NULL AS absent`))[0].absent, true);
      assert.deepEqual({ versions: await count("PlanningCatalogVersion"), audit: await count("FinancialAuditLog"), users: await identitySnapshot() }, before);
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.execute(sql`DELETE FROM public._celeriflow_sql_migrations WHERE name='20261012100000_accounting_entity_unit_scope'`);
        assert.equal((await readP1ScopeReport(tx)).migrationsApplied, false);
        throw new Error("restore-receipt-fixture");
      }), /restore-receipt-fixture/);
      await insertToolRows(db, "BudgetUnit", { id: "p0-current-extra-unit", code: "P1.EXTRA", name: "Unidade extra deve reprovar o recorte", secretariatId: "p1-scope-exe-secretariat" });
      assert.equal(p1ScopeHasRequiredFoundation(await readP1ScopeReport(db)), false);
      await db.execute(sql`DELETE FROM "BudgetUnit" WHERE id='p0-current-extra-unit'`);
    });

    await t.test("publicação: preview sem IO, confirmação SHA, ambas entidades e reuso sem sobrescrita", async () => {
      const blobs = new Map<string, Buffer>();
      let uploads = 0;
      const files: AuroraModelFiles = {
        documentPrefix: () => "instances/p1-test/documents/",
        render: (collection, dataset, query) => renderTransparencyFile(collection, dataset, query, "pdf"),
        put: async (pathname, bytes) => { uploads++; const url = `https://example.test/blob/${uploads}`; blobs.set(url, bytes); return { url, pathname: `${pathname}-${uploads}` }; },
        read: async url => blobs.get(url) ?? null,
      };
      const expected = auroraPublicModels.length * 2;
      assert.deepEqual(await publishAuroraPublicModels(fixture.connection, false, files), { mode: "READ_ONLY", created: expected, reused: 0, legalStage: "REFERENCIA", presumedLegalActs: false, presumedCourtJudgments: false });
      assert.equal(uploads, 0);
      const before = await count("TransparencyPublication");
      await assert.rejects(publishAuroraPublicModels(fixture.connection, true, { ...files, read: async () => Buffer.from("divergent bytes") }), /Modelo não confirmado/);
      assert.equal(await count("TransparencyPublication"), before);
      const result = await publishAuroraPublicModels(fixture.connection, true, files);
      assert.equal(result.created, expected);
      const publications = await queryRows<{ id: string; publicKey: string; entity: string; sha256: string; fileUrl: string; legalStage: string; source: string; status: string; filename: string }>(db, sql`SELECT id,"publicKey",entity,sha256,"fileUrl","legalStage",source,status,filename FROM "TransparencyPublication" WHERE starts_with(id,'aurora-public-model:') ORDER BY id`);
      assert.equal(publications.length, expected);
      assert.equal(new Set(publications.map(row => row.publicKey)).size, expected);
      for (const row of publications) {
        const bytes = blobs.get(row.fileUrl)!;
        assert.ok(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
        assert.equal(row.sha256, sha256(bytes));
        assert.equal(row.legalStage, "REFERENCIA");
        assert.equal(row.source, "DOCUMENTOS");
        assert.equal(row.status, "PUBLISHED");
        assert.ok(row.filename.startsWith(`aurora-${row.entity}-`));
      }
      await db.execute(sql`UPDATE "TransparencyPublication" SET status='WITHDRAWN',title='Revisão local preservada' WHERE id=${publications[0].id}`);
      const [snapshot] = await queryRows<{ row: unknown }>(db, sql`SELECT to_jsonb(p) AS row FROM "TransparencyPublication" p WHERE id=${publications[0].id}`);
      const uploaded = uploads;
      assert.equal((await publishAuroraPublicModels(fixture.connection, true, files)).reused, expected);
      assert.equal(uploads, uploaded);
      assert.deepEqual((await queryRows(db, sql`SELECT to_jsonb(p) AS row FROM "TransparencyPublication" p WHERE id=${publications[0].id}`))[0].row, snapshot.row);
    });
  } finally { await fixture.close(); }
});
