import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { JsonNull, type JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { taxCertificateEvaluations } from "../src/db/schema/tax-final-helpers";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxActiveDebts, taxPayments } from "../src/db/schema/tax-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { accessProfiles, modules, userBudgetUnits, userModulePermissions, users } from "../src/db/schema/identity";
import { auditTaxFinal, insertTaxFinalRegistryEntry, taxFinalJson } from "../src/db/repositories/tax-final-helpers/records";
import { inspectTaxFinalMigrationAuthority, type MigrationInspectionSet } from "../src/db/repositories/tax-final-helpers/migration-inspection";
import { readCertificateSubjects, readEconomicRegistrationSubjects, evaluateCertificateInTransaction } from "../src/lib/tributacao/certificate-subjects";
import { publishSimplesOptionLayout, importSimplesOptionFile, decideSimplesOptionCompany, simplesOptionLayoutSchema } from "../src/lib/tributacao/simples-option-files";
import { taxScopeSnapshot as object } from "../src/lib/tributacao/scope";
import { inspectHrMigrations, hrMigrationSelection } from "../scripts/deploy-hr-migrations";
import { inspectCemeteryMigrations } from "../scripts/deploy-cemetery-migrations";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { openMigrationConnection } from "../scripts/database-migrate-driver.mjs";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

const scope = { governmentEntityId: "tf-entity", budgetUnitId: "tf-unit" };
const actor = { usuarioId: "tf-user", employeeId: "tf-employee", allowedBudgetUnitIds: ["tf-unit"] };
const instant = new Date("2026-01-31T12:34:56.789Z");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function injectedFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = error; current && typeof current === "object" && !seen.has(current); current = "cause" in current ? current.cause : null) {
    seen.add(current);
    if ("code" in current && current.code === "P0001" && "message" in current && current.message === "injected tax final helper failure") return true;
  }
  return false;
}

test("Tax final helpers: installed evaluation mapping, JSON boundary and wrapper selectors (pure)", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as {
    catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean; default_expression: string | null }[]; constraints: { schema: string; table_name: string; name: string; type: string; definition: string }[]; indexes: { schema: string; table_name: string; name: string }[] };
  };
  const config = getTableConfig(taxCertificateEvaluations), installed = catalog.columns.filter(column => column.schema === "public" && column.table_name === config.name);
  assert.equal(config.columns.length, installed.length);
  for (const column of config.columns) {
    const physical = installed.find(item => item.name === column.name); assert.ok(physical, column.name);
    assert.equal(column.notNull, physical.not_null, column.name);
    const normalize = (value: string) => value.replace(/\s/g, "").replace("withouttimezone", "");
    assert.equal(normalize(column.getSQLType()), normalize(physical.type), column.name);
    assert.equal(column.default !== undefined, physical.default_expression !== null, `${column.name} SQL default`);
  }
  const fks = catalog.constraints.filter(item => item.schema === "public" && item.table_name === config.name && item.type === "f");
  assert.equal(config.foreignKeys.length, fks.length);
  for (const fk of config.foreignKeys) {
    const physical = fks.find(item => item.name === fk.getName()); assert.ok(physical, fk.getName());
    assert.ok(physical.definition.includes(`ON UPDATE ${fk.onUpdate?.toUpperCase()}`));
    assert.ok(physical.definition.includes(`ON DELETE ${fk.onDelete?.toUpperCase()}`));
  }
  const indexes = catalog.indexes.filter(item => item.schema === "public" && item.table_name === config.name && !item.name.endsWith("_pkey"));
  assert.deepEqual(config.indexes.map(index => index.config.name).sort(), indexes.map(index => index.name).sort());
  assert.deepEqual(taxFinalJson({ omitted: undefined, explicit: null, string: '{"looks":"json"}', nested: [undefined, "001.00", { gone: undefined, yes: true }] }), { explicit: null, string: '{"looks":"json"}', nested: [null, "001.00", { yes: true }] });
  assert.equal(hrMigrationSelection([]), "20261011030000_hr_workforce_foundation");
  assert.equal(hrMigrationSelection(["--temporal"]), "20261011130000_hr_contract_temporal_revisions");
  assert.equal(hrMigrationSelection(["--consignments", "--apply"]), "20261011160000_hr_consignment_schedule");
  assert.throws(() => hrMigrationSelection(["--temporal", "--consignments"]), /apenas uma/);
  assert.throws(() => hrMigrationSelection(["--preview", "--apply"]), /preview/);
  assert.throws(() => hrMigrationSelection(["--all"]), /desconhecida/);
  assert.equal(injectedFailure({ message: "Failed query", cause: { code: "P0001", message: "injected tax final helper failure" } }), true);
  assert.equal(injectedFailure({ code: "23505", message: "injected tax final helper failure" }), false);
  assert.equal(injectedFailure({ code: "P0001", message: "Failed query" }), false);
});

/** Independent full-156-historical-SQL fixture (+ current future SQL), initialized by the actual authority replay.
 * Application and wrapper queries use real Neon/Drizzle + loopback PGlite, server
 * max 10 / production pool max 5. No Prisma or generated schema fixture. */
async function fixture() {
  const f = await createLocalDrizzleDatabase();
  let migrationConnection: Awaited<ReturnType<typeof openMigrationConnection>> | undefined;
  try {
    const set = loadMigrationSet(); assert.equal(set.historical.length, 156);
    const url = f.connection.pool.options.connectionString; assert.ok(url);
    migrationConnection = await openMigrationConnection(url);
    const replay = await runDatabaseMigrations(migrationConnection, set, { command: "replay" });
    assert.equal(replay.result, "PASS");
    await f.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('tf-profile','TF_OPERATOR','Tributação','{}',CURRENT_TIMESTAMP),('tf-admin-profile','SYSTEM_ADMINISTRATOR','Administrador','{}',CURRENT_TIMESTAMP) ON CONFLICT (codigo) DO NOTHING;
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('tf-secretariat','Fazenda',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"secretariatId","updatedAt") VALUES ('tf-employee','Operador tributário','tf-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"firebaseUid","perfilId","employeeId","updatedAt") VALUES ('tf-user','Operador','tf@example.invalid','tf-firebase','tf-profile','tf-employee',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('tf-entity','TF','Ente titular','PREFEITURA','ATIVA',CURRENT_TIMESTAMP),('tf-other-entity','TFO','Outro ente','PREFEITURA','ATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('tf-entity','EXECUTIVE'),('tf-other-entity','EXECUTIVE');
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('tf-unit','TF.1','UG titular','tf-secretariat',CURRENT_TIMESTAMP),('tf-other-unit','TF.2','Outra UG','tf-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('tf-unit','tf-entity'),('tf-other-unit','tf-other-entity');
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('tf-user-unit','tf-user','tf-unit');
      INSERT INTO "ConfiguracaoModulo" (id,codigo,nome,ativo,"updatedAt") VALUES ('tf-module','TRIBUTACAO','Tributação',true,CURRENT_TIMESTAMP) ON CONFLICT (codigo) DO UPDATE SET ativo=true;
      INSERT INTO "UsuarioModulo" (id,"usuarioId","moduloId","canView","canEdit") SELECT 'tf-permission','tf-user',id,true,true FROM "ConfiguracaoModulo" WHERE codigo='TRIBUTACAO';
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('tf-company','Empresa titular','11222333000181',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","companyId","updatedAt") VALUES ('tf-payer','PJ','tf-company',CURRENT_TIMESTAMP);
      INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('tf-partner','PF',CURRENT_TIMESTAMP),('tf-unrelated','PF',CURRENT_TIMESTAMP);
      INSERT INTO "EconomicRegistration" (id,"municipalInsc","taxpayerId","updatedAt") VALUES ('tf-registration','TF.001','tf-payer',CURRENT_TIMESTAMP),('tf-second-registration','TF.002','tf-payer',CURRENT_TIMESTAMP);
      INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('tf-tax','ISS','Imposto',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('tf-source','TF.0','Recursos próprios',CURRENT_TIMESTAMP);
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","updatedAt") VALUES ('tf-bank','Banco fixture','0001','TF-1','tf-source','tf-unit',CURRENT_TIMESTAMP);
      CREATE FUNCTION tf_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected tax final helper failure'; END $$;
    `);
    const db = f.connection.db;
    const registry = async (id: string, entityType: string, entityId: string, category: string, data: JsonValue, version = 1, status = "ATIVO", title = id) => (await db.insert(taxRegistryEntries).values({ id, entityType, entityId, category, title, data: data === null ? JsonNull : data, version, status, actorUsuarioId: actor.usuarioId }).returning())[0];
    await registry("tf-profile1", "ECONOMIC_REGISTRATION", "tf-registration", "ECONOMIC_PROFILE", { ...scope, partners: [{ taxpayerId: "tf-partner", role: "Administrador", validateDebt: false }] });
    await registry("tf-profile2", "ECONOMIC_REGISTRATION", "tf-second-registration", "ECONOMIC_PROFILE", { ...scope, partners: [{ taxpayerId: "tf-unrelated", role: "Investidor", validateDebt: false }] });
    await registry("tf-admin-type", "FISCAL_CATALOG", "tf-admin-type", "TYPED_FISCAL_CATALOG", { ...scope, kind: "TIPO_SOCIO", validatePartnerDebt: true }, 1, "ATIVO", "Administrador");
    await registry("tf-investor-type", "FISCAL_CATALOG", "tf-investor-type", "TYPED_FISCAL_CATALOG", { ...scope, kind: "TIPO_SOCIO", validatePartnerDebt: false }, 1, "ATIVO", "Investidor");
    const assessment = async (id: string, taxpayerId = "tf-payer", value: string | null = "100.00", calculationSnapshot: JsonValue | null = scope, status = "Lançado") => (await db.insert(taxAssessments).values({ id, year: 2026, taxId: "tf-tax", taxpayerId, originalValue: 100.125, originalValueDecimal: new Decimal("100.00"), finalValueDecimal: value === null ? null : new Decimal(value), calculationSnapshot, competence: instant, status }).returning())[0];
    const guide = async (id: string, assessmentId: string) => (await db.insert(taxGuides).values({ id, assessmentId, totalValue: 100.125, totalValueDecimal: new Decimal("100"), dueDate: instant }).returning())[0];
    const payment = async (id: string, guideId: string, amount: string | null, status = "Confirmado") => (await db.insert(taxPayments).values({ id, guideId, amountPaid: 1.125, amountPaidDecimal: amount === null ? null : new Decimal(amount), paymentDate: instant, paymentMethod: "Manual", bankAccountId: "tf-bank", status }).returning())[0];
    return { ...f, db, set, migrationConnection, registry, assessment, guide, payment, async close() { try { await migrationConnection?.close(); } finally { await f.close(); } } };
  } catch (error) { try { await migrationConnection?.close(); } finally { await f.close(); } throw error; }
}

test("Tax final helpers: real scoped subjects, balances, files, worker, seed and SQL-authority wrappers", async suite => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const f = await fixture(), { db, connection } = f;
  const tx = <T>(operation: Parameters<typeof withDatabaseTransaction<T>>[1]) => withDatabaseTransaction(connection, operation, { timeoutMs: 120000 });
  const entries = (category: string) => db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, category));
  const countEvaluations = async () => (await db.select({ total: count() }).from(taxCertificateEvaluations))[0].total;
  try {
    await suite.test("subjects retain taxpayer/registration ownership, current partner policy and UG denial", async () => {
      const subjects = await readCertificateSubjects(db, actor, "tf-payer");
      assert.deepEqual(subjects, [{ taxpayerId: "tf-payer", role: "CONTRIBUINTE", profileId: null, typeCatalogId: null }, { taxpayerId: "tf-partner", role: "Administrador", profileId: "tf-profile1", typeCatalogId: "tf-admin-type" }]);
      assert.equal((await readEconomicRegistrationSubjects(db, actor, "tf-second-registration")).length, 1);
      await assert.rejects(readCertificateSubjects(db, { ...actor, allowedBudgetUnitIds: [] }, "tf-payer"), /UG fora/);
      await f.registry("tf-admin-disabled", "FISCAL_CATALOG", "tf-admin-type", "TYPED_FISCAL_CATALOG", { ...scope, kind: "TIPO_SOCIO", validatePartnerDebt: true }, 2, "INATIVO", "Administrador");
      await assert.rejects(readEconomicRegistrationSubjects(db, actor, "tf-registration"), /desativado/);
      await f.registry("tf-admin-enabled", "FISCAL_CATALOG", "tf-admin-type", "TYPED_FISCAL_CATALOG", { ...scope, kind: "TIPO_SOCIO", validatePartnerDebt: true }, 3, "ATIVO", "Administrador");
      assert.equal((await readEconomicRegistrationSubjects(db, actor, "tf-registration"))[1].typeCatalogId, "tf-admin-enabled");
      await assert.rejects(readEconomicRegistrationSubjects(db, actor, "missing"), /não encontrado/);
    });

    await suite.test("evaluation uses exact Decimal payments/credits, does not hide unmerged values or active partner debt, rolls audit back", async () => {
      await f.assessment("tf-open", "tf-payer", "9999999999999.99"); await f.guide("tf-guide", "tf-open");
      await f.payment("tf-paid", "tf-guide", "0.01"); await f.payment("tf-not-confirmed", "tf-guide", null, "Cancelado");
      await f.registry("tf-credit", "TAX_ASSESSMENT", "tf-open", "CREDIT_MOVEMENT", { operation: "COMPENSAR", amount: "0.02" }, 1, "EFETIVADO");
      await f.assessment("tf-missing-decimal", "tf-partner", null);
      await f.assessment("tf-paid-assessment", "tf-payer", "10", scope, "Pago");
      await db.insert(taxActiveDebts).values({ id: "tf-debt", taxpayerId: "tf-partner", originDebtType: "ISS", year: 2026, originalValue: 1.125, updatedValue: 1.125, cdaNumber: "TF-CDA", ...scope });
      const evaluation = await tx(transaction => evaluateCertificateInTransaction(transaction, actor, "tf-payer"));
      assert.equal(evaluation.pendingCount, 3); assert.equal(evaluation.result, "PENDENCIAS_ENCONTRADAS");
      assert.ok(evaluation.evaluatedAt instanceof Date); assert.equal(evaluation.certificateId, null);
      const details = object(evaluation.details);
      assert.equal(details.scope, "AVALIACAO_INTERNA_SEM_EMISSAO_DE_CERTIDAO");
      const assessed = details.assessments; assert.ok(Array.isArray(assessed));
      assert.deepEqual([...assessed].sort((a, b) => String(object(a).id).localeCompare(String(object(b).id))), [{ id: "tf-missing-decimal", taxpayerId: "tf-partner", status: "VALORES_NAO_CONCILIADOS", balance: null }, { id: "tf-open", taxpayerId: "tf-payer", status: "Lançado", balance: "9999999999999.96" }]);
      assert.deepEqual(details.activeDebts, [{ id: "tf-debt", taxpayerId: "tf-partner", cdaNumber: "TF-CDA", status: "Inscrita" }]);
      await f.payment("tf-unmerged-confirmed", "tf-guide", null);
      const unmerged = await tx(transaction => evaluateCertificateInTransaction(transaction, actor, "tf-payer"));
      const unmergedRows = object(unmerged.details).assessments; assert.ok(Array.isArray(unmergedRows));
      assert.deepEqual(object(unmergedRows.find(row => object(row).id === "tf-open")), { id: "tf-open", taxpayerId: "tf-payer", status: "VALORES_NAO_CONCILIADOS", balance: null });
      await db.update(taxPayments).set({ status: "Cancelado" }).where(eq(taxPayments.id, "tf-unmerged-confirmed"));
      const before = await countEvaluations();
      await f.database.exec(`CREATE TRIGGER tf_fail_evaluation_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW WHEN (NEW.action='EVALUATE') EXECUTE FUNCTION tf_fail_write();`);
      try { await assert.rejects(tx(transaction => evaluateCertificateInTransaction(transaction, actor, "tf-payer")), injectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER tf_fail_evaluation_audit ON "TaxAuditLog";`); }
      assert.equal(await countEvaluations(), before);
      assert.equal((await db.select().from(taxAuditLogs).where(and(eq(taxAuditLogs.action, "EVALUATE"), eq(taxAuditLogs.entityId, evaluation.id)))).length, 1);
      await db.update(taxAssessments).set({ status: "Cancelado" }).where(inArray(taxAssessments.id, ["tf-open", "tf-missing-decimal", "tf-paid-assessment"]));
      await db.update(taxActiveDebts).set({ status: "BAIXADA" }).where(eq(taxActiveDebts.id, "tf-debt"));
      assert.equal((await tx(transaction => evaluateCertificateInTransaction(transaction, actor, "tf-payer"))).pendingCount, 0);
    });

    await suite.test("Simples freezes original bytes/layout/hash/export and versions decisions; authority/audit failures are atomic", async () => {
      const layout = { ...scope, expectedVersion: 0, name: "Intercâmbio municipal", active: true, format: "DELIMITED" as const, delimiter: ";" as const, cnpjColumn: 1, cnpjStart: 1, cnpjLength: 14, headerRows: 1, footerRows: 0, outputDelimiter: ";" as const, outputHeader: "CNPJ;PENDENCIAS;SALDO", approvalTitle: "Termo de deferimento", refusalTitle: "Termo de indeferimento", termText: "Termo municipal com origem", legalBasis: "Lei municipal" };
      const published = await publishSimplesOptionLayout(connection, actor, layout);
      assert.equal(published.version, 1); assert.equal(published.actorUsuarioId, actor.usuarioId);
      await assert.rejects(publishSimplesOptionLayout(connection, actor, layout), /alterado/);
      await assert.rejects(importSimplesOptionFile(connection, { ...actor, allowedBudgetUnitIds: [] }, { ...scope, expectedLayoutVersion: 1, filename: "empresas.txt", originalBase64: Buffer.from("CNPJ\r\n11222333000181\r\n").toString("base64"), encoding: "utf-8" }), /autorizado/);
      await f.assessment("tf-file-debt", "tf-payer", "10", null);
      const bytes = Buffer.from('CNPJ;NOME\r\n"11222333000181";Empresa\r\n99999999000199;Não conciliada\r\n');
      const input = { ...scope, expectedLayoutVersion: 1, filename: "empresas.txt", originalBase64: bytes.toString("base64"), encoding: "utf-8" as const };
      const imported = await importSimplesOptionFile(connection, actor, input), data = object(imported.data);
      assert.equal((await importSimplesOptionFile(connection, actor, input)).id, imported.id);
      assert.equal(data.originalBase64, input.originalBase64); assert.equal(data.checksum, sha(bytes)); assert.deepEqual(data.layout, published.data);
      const rows = data.rows; assert.ok(Array.isArray(rows));
      assert.deepEqual(object(rows[0]).pending, ["ORIGEM_DEBITO_NAO_CONCILIADA"]); assert.equal(object(rows[0]).taxpayerId, "tf-payer"); assert.equal(object(rows[0]).balance, "0.00");
      assert.deepEqual(object(rows[1]).pending, ["CADASTRO_NAO_CONCILIADO"]); assert.equal(object(rows[1]).taxpayerId, null);
      const exports = await entries("SIMPLES_OPTION_EXPORT"); assert.equal(exports.length, 1);
      const exported = object(exports[0].data), output = "CNPJ;PENDENCIAS;SALDO\r\n11222333000181;ORIGEM_DEBITO_NAO_CONCILIADA;0.00\r\n99999999000199;CADASTRO_NAO_CONCILIADO;0.00";
      assert.equal(exported.content, output); assert.equal(exported.checksum, sha(output)); assert.equal(exported.sourceId, imported.id);
      const decision = { fileId: imported.entityId, cnpj: "11222333000181", expectedVersion: 0, approved: false, reason: "Pendências verificadas" };
      const first = await decideSimplesOptionCompany(connection, actor, decision);
      await assert.rejects(decideSimplesOptionCompany(connection, actor, { ...decision, approved: true }), /alterada/);
      const revised = await decideSimplesOptionCompany(connection, actor, { ...decision, expectedVersion: 1, approved: true });
      assert.equal(revised.version, 2); assert.equal(object(revised.data).previousId, first.id); assert.deepEqual(object(revised.data).layout, published.data);
      await assert.rejects(decideSimplesOptionCompany(connection, { ...actor, allowedBudgetUnitIds: [] }, { ...decision, expectedVersion: 2 }), /autorizado/);
      const before = (await db.select({ total: count() }).from(taxRegistryEntries))[0].total;
      await f.database.exec(`CREATE TRIGGER tf_fail_simples_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW WHEN (NEW.action='IMPORT_SIMPLES_OPTION_FILE') EXECUTE FUNCTION tf_fail_write();`);
      try { await assert.rejects(importSimplesOptionFile(connection, actor, { ...input, originalBase64: Buffer.from("CNPJ\n11222333000181\n").toString("base64") }), injectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER tf_fail_simples_audit ON "TaxAuditLog";`); }
      assert.equal((await db.select({ total: count() }).from(taxRegistryEntries))[0].total, before);
      assert.equal((await entries("SIMPLES_OPTION_FILE")).length, 1); assert.equal((await entries("SIMPLES_OPTION_EXPORT")).length, 1);
      await publishSimplesOptionLayout(connection, actor, { ...layout, expectedVersion: 1, termText: "Texto novo" });
      assert.deepEqual(object((await entries("SIMPLES_OPTION_FILE"))[0].data).layout, published.data);
      await assert.rejects(importSimplesOptionFile(connection, actor, input), /alterado/);
      await assert.rejects(importSimplesOptionFile(connection, actor, { ...input, expectedLayoutVersion: 2, originalBase64: Buffer.from("CNPJ\n11222333000181\n11222333000181").toString("base64") }), /repetido/);
      await assert.rejects(importSimplesOptionFile(connection, actor, { ...input, expectedLayoutVersion: 2, originalBase64: "invalid!" }), /inválido/);
    });

    await suite.test("Simples keeps exact remaining value, suspension/active-debt review, origin reconciliation, no double counting and Windows-1252 fixed bytes", async () => {
      await db.update(taxAssessments).set({ calculationSnapshot: scope, finalValueDecimal: new Decimal("100") }).where(eq(taxAssessments.id, "tf-file-debt"));
      await f.guide("tf-file-guide", "tf-file-debt"); await f.payment("tf-file-payment", "tf-file-guide", "10.00");
      await f.registry("tf-file-credit", "TAX_ASSESSMENT", "tf-file-debt", "CREDIT_MOVEMENT", { operation: "COMPENSAR", amount: "5.00" }, 1, "EFETIVADO");
      await f.assessment("tf-suspended", "tf-payer", "4", scope, "Suspenso");
      await f.assessment("tf-other-government", "tf-payer", "9999", { governmentEntityId: "tf-other-entity", budgetUnitId: "tf-other-unit" });
      await db.insert(taxActiveDebts).values([
        { id: "tf-linked-debt", taxpayerId: "tf-payer", assessmentId: "tf-file-debt", originDebtType: "ISS", year: 2026, originalValue: 100, updatedValue: 1000, updatedValueDecimal: new Decimal("1000"), ...scope },
        { id: "tf-independent-debt", taxpayerId: "tf-payer", originDebtType: "ISS", year: 2026, originalValue: 12.34, updatedValue: 12.34, updatedValueDecimal: new Decimal("12.34"), ...scope },
        { id: "tf-unmerged-debt", taxpayerId: "tf-payer", originDebtType: "ISS", year: 2026, originalValue: 7.125, updatedValue: 7.125, updatedValueDecimal: null, ...scope },
      ]);
      const bytes = Buffer.from("CNPJ\r\n11222333000181\r\n\r\n");
      const input = { ...scope, expectedLayoutVersion: 2, filename: "saldos.txt", originalBase64: bytes.toString("base64"), encoding: "utf-8" as const };
      const imported = await importSimplesOptionFile(connection, actor, input), rows = object(imported.data).rows; assert.ok(Array.isArray(rows));
      assert.equal(object(rows[0]).balance, "97.34");
      const pending = object(rows[0]).pending; assert.ok(Array.isArray(pending));
      assert.deepEqual(new Set(pending), new Set(["CREDITO_SUSPENSO_PARA_ANALISE", "DIVIDA_ATIVA_PARA_ANALISE", "VALOR_DIVIDA_ATIVA_NAO_CONCILIADO", "DEBITO_MUNICIPAL"]));
      await f.payment("tf-file-unmerged", "tf-file-guide", null);
      await assert.rejects(importSimplesOptionFile(connection, actor, { ...input, originalBase64: Buffer.from("CNPJ\n11222333000181\n\n").toString("base64") }), /Recebimento sem Decimal/);
      await db.update(taxPayments).set({ status: "Cancelado" }).where(eq(taxPayments.id, "tf-file-unmerged"));
      const published = (await entries("SIMPLES_OPTION_LAYOUT")).find(row => row.version === 2); assert.ok(published);
      const layout = simplesOptionLayoutSchema.parse(published.data);
      await publishSimplesOptionLayout(connection, actor, { ...layout, expectedVersion: 2, format: "FIXED", headerRows: 0 });
      const windowsBytes = Buffer.from("11222333000181;Ação municipal\r\n", "latin1");
      const windows = await importSimplesOptionFile(connection, actor, { ...input, expectedLayoutVersion: 3, filename: "ações.txt", originalBase64: windowsBytes.toString("base64"), encoding: "windows-1252" });
      assert.equal(object(windows.data).originalBase64, windowsBytes.toString("base64")); assert.equal(object(windows.data).checksum, sha(windowsBytes)); assert.equal(object(windows.data).encoding, "windows-1252");
      const windowsRows = object(windows.data).rows; assert.ok(Array.isArray(windowsRows)); assert.equal(object(windowsRows[0]).cnpj, "11222333000181");
    });

    await suite.test("JSON null/SQL NULL and UTC/Float/exact numerics retain mapper semantics", async () => {
      const explicit = await tx(transaction => insertTaxFinalRegistryEntry(transaction, { entityType: "FIXTURE", entityId: "null", category: "JSON_TEST", title: "JSON null", data: null }));
      await tx(transaction => auditTaxFinal(transaction, { action: "JSON_TEST", entityType: "Fixture", entityId: explicit.id, authorUsuarioId: actor.usuarioId, payload: null }));
      await tx(transaction => auditTaxFinal(transaction, { action: "JSON_TEST", entityType: "Fixture", entityId: "omitted", authorUsuarioId: actor.usuarioId }));
      const result = await db.execute<{ entityId: string; sqlNull: boolean; kind: string | null }>(sql`SELECT "entityId", payload IS NULL AS "sqlNull", jsonb_typeof(payload) AS kind FROM "TaxAuditLog" WHERE action='JSON_TEST'`);
      assert.deepEqual(result.rows.find(row => row.entityId === explicit.id), { entityId: explicit.id, sqlNull: false, kind: "null" });
      assert.deepEqual(result.rows.find(row => row.entityId === "omitted"), { entityId: "omitted", sqlNull: true, kind: null });
      const [assessment] = await db.select().from(taxAssessments).where(eq(taxAssessments.id, "tf-open"));
      assert.equal(assessment.originalValue, 100.125); assert.equal(assessment.finalValueDecimal?.toFixed(2), "9999999999999.99"); assert.equal(assessment.competence?.toISOString(), instant.toISOString());
    });

    await suite.test("worker requires active identity/profile/module, Firebase, update permission and explicit UGs on supplied tx", async () => {
      // Set only a synthetic dead endpoint before transitive platform imports.
      // All operations below explicitly use the fixture executor/transaction.
      process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/tax_final_unused";
      const { resolveTaxWorkerActor } = await import("../src/lib/tributacao/tax-worker-actor");
      assert.deepEqual(await tx(transaction => resolveTaxWorkerActor(transaction, " tf-user ")), actor);
      await assert.rejects(resolveTaxWorkerActor(db, " "), /Configure/);
      await db.update(modules).set({ ativo: false }).where(eq(modules.codigo, "TRIBUTACAO"));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /indisponível/);
      await db.update(modules).set({ ativo: true }).where(eq(modules.codigo, "TRIBUTACAO"));
      await db.update(userModulePermissions).set({ canEdit: false }).where(eq(userModulePermissions.usuarioId, actor.usuarioId));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /alteração tributária/);
      await db.update(userModulePermissions).set({ canEdit: true }).where(eq(userModulePermissions.usuarioId, actor.usuarioId));
      await db.delete(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, actor.usuarioId));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /UGs explícitas/);
      await db.insert(userBudgetUnits).values({ usuarioId: actor.usuarioId, budgetUnitId: "tf-unit" });
      await db.update(users).set({ firebaseUid: null }).where(eq(users.id, actor.usuarioId));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /indisponível/);
      await db.update(users).set({ firebaseUid: "tf-firebase" }).where(eq(users.id, actor.usuarioId));
      await db.update(accessProfiles).set({ ativo: false }).where(eq(accessProfiles.id, "tf-profile"));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /indisponível/);
      await db.update(accessProfiles).set({ ativo: true }).where(eq(accessProfiles.id, "tf-profile"));
      await db.update(accessProfiles).set({ permissoes: JSON.stringify({ modules: { TRIBUTACAO: { showDashboardCard: true, blocked: false, create: true, update: false, delete: true } } }) }).where(eq(accessProfiles.id, "tf-profile"));
      await assert.rejects(resolveTaxWorkerActor(db, actor.usuarioId), /alteração tributária/);
      await db.update(accessProfiles).set({ permissoes: "{}" }).where(eq(accessProfiles.id, "tf-profile"));
      const rollback = new Error("worker-fixture-rollback");
      await assert.rejects(tx(async transaction => {
        await transaction.delete(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, actor.usuarioId));
        await assert.rejects(resolveTaxWorkerActor(transaction, actor.usuarioId), /UGs explícitas/);
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await resolveTaxWorkerActor(db, actor.usuarioId), actor);
    });

    await suite.test("HR/Cemetery wrappers inspect read-only, apply only synchronized noop, honor core lock/provenance and block every future SQL", async () => {
      const { migrationConnection: c, set } = f;
      const receipts = async () => (await c.query("SELECT row_to_json(m)::text AS row FROM public._celeriflow_sql_migrations m ORDER BY position")).rows;
      const before = await receipts();
      for (const flag of [[], ["--temporal"], ["--consignments"]]) {
        const preview = await inspectHrMigrations(c, set, flag);
        assert.equal(preview.mode, "PREVIEW"); assert.equal(preview.state, "APPLIED_CHECKSUM_VERIFIED"); assert.deepEqual(preview.missingRuntimeDependencies, []);
        const applied = await inspectHrMigrations(c, set, [...flag, "--apply"]); assert.equal(applied.execution, "SQL_AUTHORITY_NOOP");
      }
      assert.equal((await inspectCemeteryMigrations(c, set)).migrations.length, 2);
      assert.equal((await inspectCemeteryMigrations(c, set, true)).execution, "SQL_AUTHORITY_NOOP");
      const lfSet: MigrationInspectionSet = { ...set, migrations: set.migrations.map((migration: { historical: boolean; checksum: string; lfChecksum: string }) => ({ ...migration, checksum: migration.historical ? migration.lfChecksum : migration.checksum })) };
      assert.equal((await inspectCemeteryMigrations(c, lfSet, true)).execution, "SQL_AUTHORITY_NOOP");
      const futureSql = 'CREATE TABLE "tf_wrapper_must_not_apply" (id text PRIMARY KEY)';
      const future = { name: "20990101000000_tax_final_future", source: "db/migrations/20990101000000_tax_final_future/migration.sql", historical: false, checksum: sha(futureSql), lfChecksum: sha(futureSql), executionSql: futureSql };
      const pendingSet: MigrationInspectionSet = { ...set, migrations: [...set.migrations, future], future: [...set.future, future] };
      assert.equal((await inspectCemeteryMigrations(c, pendingSet)).migrations[0].state, "APPLIED_CHECKSUM_VERIFIED");
      await assert.rejects(inspectCemeteryMigrations(c, pendingSet, true), /npm run db:migrate:deploy explicitamente/);
      await assert.rejects(inspectHrMigrations(c, pendingSet, ["--apply"]), /npm run db:migrate:deploy explicitamente/);
      assert.equal((await c.query("SELECT to_regclass('public.tf_wrapper_must_not_apply') AS relation")).rows[0].relation, null);
      await c.exec('ALTER TABLE "PayrollItem" RENAME COLUMN "valueDecimal" TO "tf_missing_decimal"');
      try {
        const preview = await inspectHrMigrations(c, set); assert.ok(preview.missingRuntimeDependencies.includes("PayrollItem.valueDecimal"));
        await assert.rejects(inspectHrMigrations(c, set, ["--apply"]), /Dependências/);
      } finally { await c.exec('ALTER TABLE "PayrollItem" RENAME COLUMN "tf_missing_decimal" TO "valueDecimal"'); }
      assert.deepEqual(await receipts(), before);
      assert.equal((await c.query("SELECT to_regclass('public._prisma_migrations') AS relation")).rows[0].relation, null);
      const [receipt] = (await c.query("SELECT name,checksum FROM public._celeriflow_sql_migrations ORDER BY position LIMIT 1")).rows;
      await c.query("UPDATE public._celeriflow_sql_migrations SET checksum=$1 WHERE name=$2", ["0".repeat(64), receipt.name]);
      try { await assert.rejects(inspectCemeteryMigrations(c, set, true), /receipt|source/i); }
      finally { await c.query("UPDATE public._celeriflow_sql_migrations SET checksum=$1 WHERE name=$2", [receipt.checksum, receipt.name]); }
      const lockClient = await connection.pool.connect();
      try {
        await lockClient.query("BEGIN"); await lockClient.query("SELECT pg_advisory_xact_lock($1::integer,$2::integer)", [1866280812, 1936813409]);
        await assert.rejects(inspectTaxFinalMigrationAuthority(c, set, ["20261011010000_cemetery_integrity"]), /lock/i);
      } finally { await lockClient.query("ROLLBACK"); lockClient.release(); }
      assert.deepEqual(await receipts(), before);
    });

    await suite.test("municipal seed preserves 20 cases, preview rollback, amounts/UTC/title/origin, replay and audit atomicity", async () => {
      process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/tax_final_unused";
      const { seedMunicipalTaxCases } = await import("../scripts/seed-municipal-tax-cases");
      const key = (kind: string, index: number) => `aurora-system-v1:${kind}:${String(index).padStart(3, "0")}`;
      await f.database.exec(`
        INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") SELECT 'tf-admin','Administrador','tf-admin@example.invalid',id,CURRENT_TIMESTAMP FROM "ConfiguracaoPerfil" WHERE codigo='SYSTEM_ADMINISTRATOR';
        INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('tf-year',2026,'tf-entity','Aberto','2026-01-01','2026-12-31',CURRENT_TIMESTAMP);
        INSERT INTO "Tax" (id,name,"taxType","updatedAt") VALUES ('tax_iptu','IPTU','Imposto',CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING;
        INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('tf-nature','TF.1','Receita',CURRENT_TIMESTAMP);
        INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('tf-mapping','tax_iptu','tf-nature','tf-source','tf-bank',CURRENT_TIMESTAMP);
      `);
      for (let i = 0; i < 20; i++) {
        await f.database.query('INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ($1,\'PF\',CURRENT_TIMESTAMP)', [key("taxpayer", i)]);
        await f.database.query('INSERT INTO "RealEstate" (id,"taxpayerId","landArea","builtArea","updatedAt") VALUES ($1,$2,150.125,70.125,CURRENT_TIMESTAMP)', [key("property", i), key("taxpayer", i)]);
      }
      const cases = () => db.select().from(taxAssessments).where(eq(taxAssessments.taxId, "tax_iptu")).orderBy(asc(taxAssessments.taxpayerId));
      const before = await cases(), auditBefore = (await db.select({ total: count() }).from(financialAuditLogs))[0].total;
      const guidesBefore = (await db.select({ total: count() }).from(taxGuides))[0].total, nativeAuditsBefore = (await db.select({ total: count() }).from(taxAuditLogs))[0].total;
      const preview = await seedMunicipalTaxCases(connection);
      assert.equal(preview.mode, "TRANSACTIONAL_PREVIEW_ROLLED_BACK"); assert.equal(preview.cases, 20); assert.equal(preview.created, 0);
      assert.deepEqual(await cases(), before); assert.equal((await db.select({ total: count() }).from(financialAuditLogs))[0].total, auditBefore);
      assert.equal((await db.select({ total: count() }).from(taxGuides))[0].total, guidesBefore); assert.equal((await db.select({ total: count() }).from(taxAuditLogs))[0].total, nativeAuditsBefore);
      await f.database.exec(`CREATE TRIGGER tf_fail_seed BEFORE INSERT ON "FinancialAuditLog" FOR EACH ROW WHEN (NEW.action='MUNICIPAL_TAX_CASE_POPULATED') EXECUTE FUNCTION tf_fail_write();`);
      try { await assert.rejects(seedMunicipalTaxCases(connection, true), injectedFailure); }
      finally { await f.database.exec(`DROP TRIGGER tf_fail_seed ON "FinancialAuditLog";`); }
      assert.deepEqual(await cases(), before);
      assert.equal((await db.select({ total: count() }).from(taxGuides))[0].total, guidesBefore); assert.equal((await db.select({ total: count() }).from(taxAuditLogs))[0].total, nativeAuditsBefore);
      assert.equal((await db.select({ total: count() }).from(financialAuditLogs))[0].total, auditBefore);
      const applied = await seedMunicipalTaxCases(connection, true); assert.equal(applied.created, 20); assert.equal(applied.reused, 0);
      const stored = await cases(); assert.equal(stored.length, 20);
      for (let i = 0; i < stored.length; i++) {
        const row = stored[i]; assert.equal(row.taxpayerId, key("taxpayer", i)); assert.equal(row.realEstateId, key("property", i)); assert.equal(row.year, 2026);
        assert.equal(row.taxableBaseDecimal?.toFixed(2), new Decimal(80000 + i * 3500).toFixed(2)); assert.equal(row.rate?.toString(), "0.5");
        assert.equal(row.finalValueDecimal?.toFixed(2), new Decimal(80000 + i * 3500).mul("0.005").toFixed(2));
        assert.equal(row.competence?.toISOString(), "2026-10-01T12:00:00.000Z"); assert.equal(object(row.calculationSnapshot).budgetUnitId, "tf-unit"); assert.equal(object(row.calculationSnapshot).governmentEntityId, "tf-entity");
        const [guide] = await db.select().from(taxGuides).where(eq(taxGuides.assessmentId, row.id)); assert.equal(guide.dueDate.toISOString(), "2026-11-20T12:00:00.000Z"); assert.equal(guide.totalValueDecimal?.toFixed(2), row.finalValueDecimal?.toFixed(2));
      }
      assert.equal((await seedMunicipalTaxCases(connection, true)).reused, 20); assert.deepEqual(await cases(), stored);
      // Narrow historical property-link path preserves all amounts/snapshots.
      await db.update(taxAssessments).set({ realEstateId: null }).where(eq(taxAssessments.id, stored[0].id));
      const [unlinked] = await db.select().from(taxAssessments).where(eq(taxAssessments.id, stored[0].id));
      await seedMunicipalTaxCases(connection, true);
      const [linked] = await db.select().from(taxAssessments).where(eq(taxAssessments.id, stored[0].id));
      assert.deepEqual(linked, { ...unlinked, realEstateId: key("property", 0), updatedAt: linked.updatedAt });
      await db.update(taxAssessments).set({ realEstateId: key("property", 1) }).where(eq(taxAssessments.id, stored[0].id));
      try { await assert.rejects(seedMunicipalTaxCases(connection, true), /operador/); }
      finally { await db.update(taxAssessments).set({ realEstateId: key("property", 0) }).where(eq(taxAssessments.id, stored[0].id)); }
    });
  } finally {
    try { await f.close(); }
    finally { if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl; }
  }
});
