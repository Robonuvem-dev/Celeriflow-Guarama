import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { and, eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import type { z } from "zod";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { companies, documents, taxpayers, realEstates } from "../src/db/schema/registry";
import { people } from "../src/db/schema/people";
import { users, accessProfiles } from "../src/db/schema/identity";
import { governmentEntities, healthCbos } from "../src/db/schema/master-data";
import { planningEntityUnits, planningBudgetUnitLabels } from "../src/db/schema/planning-catalog";
import { processes } from "../src/db/schema/processes";
import { economicRegistrations, taxes, taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxRegistryEntries, taxLicenses } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { pageActiveDebts, pageActivities, pagePayments } from "../src/db/schema/taxation-pages";
import { documentVersions, documentSignatures, documentIcpEvidence, certificateUseAudits } from "../src/db/schema/document-workflow";
import { economicPortalAccess, economicSignatureEvidence } from "../src/db/schema/tax-economic";
import { createEconomicDrizzleFixture, economicError } from "../src/db/repositories/tax-economic/test-fixture";
import { economicSnapshot } from "../src/db/repositories/tax-economic/snapshot";
import * as registry from "../src/db/repositories/tax-economic/registry";
import * as registrations from "../src/db/repositories/tax-economic/registrations";
import * as licenses from "../src/db/repositories/tax-economic/licenses";
import { createEconomicRegistrationWithProfile, economicProfileSchema, expireProvisionalEconomicRegistrations, saveEconomicProfile } from "../src/lib/tributacao/economic-profile";
import { updateEconomicRegistrationWithHistory } from "../src/lib/tributacao/economic-history";
import { readEconomicProfiles } from "../src/lib/tributacao/economic-query";
import { assertEconomicTaxpayerDebtFree } from "../src/lib/tributacao/economic-debt-policy";
import { publishEconomicActivity, resolveEconomicActivityCode } from "../src/lib/tributacao/economic-activity-registry";
import { unifyEconomicActivities } from "../src/lib/tributacao/economic-activity-operations";
import { bulkChangeEconomicProfiles } from "../src/lib/tributacao/economic-operations";
import { publishEconomicEventType, saveEconomicEvent, issueEconomicEventLicense, saveEconomicVehicle } from "../src/lib/tributacao/economic-events";
import { configuredLicenseSchema, issueConfiguredLicenses, licensePolicySchema, publishLicensePolicy } from "../src/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "../src/lib/tributacao/license-lifecycle";
import { issuePortalLicense } from "../src/lib/tributacao/portal-licenses";
import { issuePortalEconomicDocument, renderPortalEconomicDocument } from "../src/lib/tributacao/portal-economic-documents";
import { renderConfiguredLicensePdf } from "../src/lib/tributacao/license-pdf";
import { readSignedLicenseArtifact, signConfiguredLicense } from "../src/lib/tributacao/license-signatures";
import { registerA1Certificate } from "../src/lib/signatures/a1-signature-service";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { publishFiscalCatalog, saveConfiguredFiscalRecord } from "../src/lib/tributacao/configurable-cadastres";

const address = { street: "Rua municipal", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" };
function profileInput(overrides: Partial<z.input<typeof economicProfileSchema>> = {}): z.input<typeof economicProfileSchema> {
  return { registrationId: "NEW", expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", accountantTaxpayerId: null, accountantCrc: "", companyType: "LTDA", realEstateIds: [], primaryCnae: "1234567", secondaryCnaes: [], partners: [], contractNumber: "", contractDate: null, companyAddress: address, correspondenceAddress: address, latitude: null, longitude: null, provisionalUntil: null, validateCompanyDebt: false, validatePartnerDebts: false, documentIds: [], processId: null, reason: "Cadastro econômico documentado", ...overrides };
}
function policyInput(code: string, overrides: Partial<z.input<typeof licensePolicySchema>> = {}): z.input<typeof licensePolicySchema> {
  return { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", year: new Date().getUTCFullYear(), code, name: "Funcionamento", active: true, validityDays: 30, requireDebtClearance: false, includePartnerDebts: false, requireFeePayment: false, feeTaxId: null, allowExempt: false, paymentGraceUntil: null, layoutTitle: "Alvará municipal", layoutText: "Condições municipais preservadas", legalBasis: "Norma municipal informada", ...overrides };
}
type Fixture = Awaited<ReturnType<typeof createEconomicDrizzleFixture>>;
async function licenseInput(f: Fixture, registrationId: string, policyId: string): Promise<z.input<typeof configuredLicenseSchema>> {
  const row = await registrations.readEconomicRegistration(f.db, registrationId);
  return { policyId, expectedPolicyVersion: 1, registrationId, expectedRegistrationUpdatedAt: row.updatedAt.toISOString(), processId: null, feeAssessmentId: null, exempt: false, exemptionReason: "", reason: "Emissão autorizada" };
}
async function counts(f: Fixture) {
  return (await f.db.execute<{ registrations: number; entries: number; audits: number; licenses: number }>(sql`SELECT (SELECT count(*)::int FROM "EconomicRegistration") AS registrations,(SELECT count(*)::int FROM "TaxRegistryEntry") AS entries,(SELECT count(*)::int FROM "TaxAuditLog") AS audits,(SELECT count(*)::int FROM "License") AS licenses`)).rows[0];
}

test("Econômico: SQL histórico e driver Neon/Drizzle reais", { timeout: 300_000 }, async t => {
  const f = await createEconomicDrizzleFixture();
  const { db, connection, actor } = f;
  try {
    await t.test("catálogo físico, leitores vazios, relações nullable, Date/Decimal/JSON null", async () => {
      assert.ok(f.migrationCount >= 156);
      const catalog = await db.execute<{ table_name: string; column_name: string; type: string; not_null: boolean }>(sql`SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`);
      for (const table of [companies, documents, taxpayers, realEstates, people, users, accessProfiles, governmentEntities, healthCbos, planningEntityUnits, planningBudgetUnitLabels, processes, economicRegistrations, taxes, taxAssessments, taxGuides, taxRegistryEntries, taxLicenses, taxAuditLogs, pageActiveDebts, pageActivities, pagePayments, documentVersions, economicPortalAccess, economicSignatureEvidence]) {
        for (const column of Object.values(getTableColumns(table))) {
          const key = `${getTableName(table)}.${column.name}`;
          const physical = catalog.rows.find(row => row.table_name === getTableName(table) && row.column_name === column.name);
          assert.ok(physical, key); assert.equal(physical.not_null, column.notNull, key);
          assert.equal(physical.type.replace(/\s+/g, "").replace(/withouttimezone$/, ""), column.getSQLType().replace(/\s+/g, ""), key);
        }
      }
      assert.deepEqual(await registrations.listEconomicRegistrations(db, []), []);
      assert.deepEqual(await registry.listEconomicFiscalRecords(db, [], []), []);
      assert.deepEqual(await registry.listEconomicProfiles(db, { budgetUnitIds: [] }), []);
      assert.equal(await registrations.countActiveEconomicTaxpayers(db, []), 0);
      assert.equal(await licenses.countUncancelledEconomicLicenses(db, []), 0);
      assert.equal(await registrations.hasEconomicOrigin(db, { governmentEntityId: "other-ente", budgetUnitId: "ug" }), false);
      assert.equal((await registrations.readEconomicTaxpayer(db, "payer"))?.person, null);
      assert.equal((await registrations.readEconomicTaxpayer(db, "partner"))?.company, null);
      assert.deepEqual((await registrations.listEconomicTaxpayerNames(db, ["payer", "partner", "accountant"])).sort((a, b) => a.id.localeCompare(b.id)), [
        { id: "accountant", person: null, company: null },
        { id: "partner", person: { fullName: "Sócia Municipal" }, company: null },
        { id: "payer", person: null, company: { corporateName: "Empresa Municipal" } },
      ]);
      const instant = new Date("2026-10-01T12:34:56.123Z");
      const snapshot = economicSnapshot({ instant, amount: new Decimal("9999999999999999.99"), omitted: undefined, array: [undefined, null], nullable: null });
      assert.deepEqual(snapshot, { instant: instant.toISOString(), amount: "9999999999999999.99", array: [null, null], nullable: null });
      const entry = await withDatabaseTransaction(connection, async tx => {
        await registry.lockEconomicKey(tx, "ECONOMIC_FIXTURE_SCALARS");
        await registrations.lockEconomicRegistration(tx, "missing");
        const scalars = await registry.appendEconomicEntry(tx, { entityType: "ECONOMIC_TEST", entityId: "scalars", category: "ECONOMIC_TEST", title: "Escalares", data: snapshot });
        assert.deepEqual(scalars.data, snapshot);
        await registry.appendEconomicAudit(tx, { action: "ECONOMIC_JSON_NULL", entityType: "ECONOMIC_TEST", entityId: "json-null", authorUsuarioId: "ana", payload: null });
        return registry.appendEconomicEntry(tx, { entityType: "ECONOMIC_TEST", entityId: "json-null", category: "ECONOMIC_TEST", title: "Null", data: null, effectiveFrom: instant });
      });
      assert.equal(entry.data, null); assert.equal(entry.effectiveFrom.toISOString(), instant.toISOString()); assert.ok(entry.createdAt instanceof Date);
      assert.deepEqual((await db.execute<{ isSqlNull: boolean; kind: string }>(sql`SELECT data IS NULL AS "isSqlNull",jsonb_typeof(data) AS kind FROM "TaxRegistryEntry" WHERE id=${entry.id}`)).rows[0], { isSqlNull: false, kind: "null" });
      assert.deepEqual((await db.execute<{ isSqlNull: boolean; kind: string }>(sql`SELECT payload IS NULL AS "isSqlNull",jsonb_typeof(payload) AS kind FROM "TaxAuditLog" WHERE action='ECONOMIC_JSON_NULL'`)).rows[0], { isSqlNull: false, kind: "null" });
    });
    await t.test("perfil, CRC, participações exatas, versão, origem e expiração inclusiva", async () => {
      const input = profileInput({ accountantTaxpayerId: "accountant", accountantCrc: "CRC-PR-1", secondaryCnaes: ["7654321"], partners: [{ taxpayerId: "partner", role: "Administrador", sharePercent: "33.333333", validateDebt: true }, { taxpayerId: "unrelated", role: "Sócio", sharePercent: "66.666667", validateDebt: false }], provisionalDays: 30, provisionalStartDate: "2026-10-01" });
      await assert.rejects(createEconomicRegistrationWithProfile(connection, { ...actor, allowedBudgetUnitIds: [] }, { municipalInsc: "DENIED", taxpayerId: "payer", taxRegime: "Normal", profile: input }), /autorizado/);
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "PROFILE-1", taxpayerId: "payer", taxRegime: "Simples Nacional", profile: input });
      const profile = await registry.readEconomicProfile(db, row.id); assert.ok(profile);
      assert.equal(taxScopeSnapshot(profile.data).provisionalUntil, "2026-10-30");
      assert.equal((await readEconomicProfiles(connection, actor, { governmentEntityId: "ente", accountantId: "accountant", partnerId: "partner", cnae: "7654321", simples: "YES" })).length, 1);
      await assert.rejects(saveEconomicProfile(connection, actor, { ...input, registrationId: row.id }), /alterado/);
      await assert.rejects(saveEconomicProfile(connection, actor, { ...input, registrationId: row.id, expectedVersion: 1, accountantCrc: "OUTRO" }), /CRC diverge/);
      await assert.rejects(saveEconomicProfile(connection, actor, { ...input, registrationId: row.id, expectedVersion: 1, governmentEntityId: "other-ente", budgetUnitId: "other-ug" }), /autorizado/);
      await assert.rejects(db.update(taxRegistryEntries).set({ title: "Adulterado" }).where(eq(taxRegistryEntries.id, profile.id)), economicError(/imutável/));
      assert.equal((await expireProvisionalEconomicRegistrations(connection, actor, { governmentEntityId: "ente", budgetUnitId: "ug", date: "2026-10-30" })).count, 0);
      assert.equal((await expireProvisionalEconomicRegistrations(connection, actor, { governmentEntityId: "ente", budgetUnitId: "ug", date: "2026-10-31" })).count, 1);
      assert.equal((await expireProvisionalEconomicRegistrations(connection, actor, { governmentEntityId: "ente", budgetUnitId: "ug", date: "2026-10-31" })).count, 0);
      assert.equal((await registrations.readEconomicRegistration(db, row.id)).status, "Inativo");
      assert.equal((await registry.listEconomicHistory(db, row.id)).length, 2);
    });
    await t.test("falha na auditoria final desfaz cadastro, histórico, perfil e novo contador", async () => {
      await db.insert(taxpayers).values({ id: "rollback-accountant", taxpayerType: "PF" });
      const before = await counts(f);
      await f.database.exec(`CREATE FUNCTION economic_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SAVE_ECONOMIC_PROFILE' THEN RAISE EXCEPTION 'economic final audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER economic_test_fail_audit BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION economic_test_fail_audit()`);
      try {
        await assert.rejects(createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "ROLLBACK", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput({ accountantTaxpayerId: "rollback-accountant", accountantCrc: "CRC-ROLLBACK" }) }), economicError(/economic final audit failure/));
        assert.deepEqual(await counts(f), before);
        assert.equal(await registry.readEconomicAccountant(db, "rollback-accountant"), null);
      } finally { await f.database.exec(`DROP TRIGGER economic_test_fail_audit ON "TaxAuditLog"; DROP FUNCTION economic_test_fail_audit()`); }
    });
    await t.test("CNAE unificado afeta só a origem, preserva versões e resolve aliases", async () => {
      const activity = { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", name: "Atividade municipal", risk: "BAIXO" as const, active: true, serviceActivityIds: [], cboCodes: [], legalBasis: "Norma municipal" };
      const source = await publishEconomicActivity(connection, actor, { ...activity, cnae: "2222222" });
      const target = await publishEconomicActivity(connection, actor, { ...activity, cnae: "3333333" });
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "CNAE-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput({ primaryCnae: "2222222", secondaryCnaes: ["3333333"] }) });
      await db.insert(economicRegistrations).values({ id: "unscoped", municipalInsc: "UNSCOPED", taxpayerId: "unrelated", primaryCnae: "2222222" });
      const result = await unifyEconomicActivities(connection, actor, { governmentEntityId: "ente", budgetUnitId: "ug", sourceId: source.entityId, sourceVersion: 1, targetId: target.entityId, targetVersion: 1, processId: null, reason: "Unificação documentada" });
      assert.equal(result.count, 1); assert.equal(result.unscopedRegistrationsNotAttributed, 1);
      assert.equal((await registrations.readEconomicRegistration(db, row.id)).primaryCnae, "3333333");
      assert.equal((await registrations.readEconomicRegistration(db, "unscoped")).primaryCnae, "2222222");
      const profile = await registry.readEconomicProfile(db, row.id); assert.ok(profile); assert.equal(profile.version, 2);
      assert.deepEqual(taxScopeSnapshot(profile.data).secondaryCnaes, []);
      assert.equal(await withDatabaseTransaction(connection, tx => resolveEconomicActivityCode(tx, "ente", "ug", "2222222")), "3333333");
      await assert.rejects(unifyEconomicActivities(connection, actor, { governmentEntityId: "ente", budgetUnitId: "ug", sourceId: source.entityId, sourceVersion: 1, targetId: target.entityId, targetVersion: 1, processId: null, reason: "Repetição obsoleta" }), /alterada/);
    });
    await t.test("alteração geral rejeita seleção obsoleta e desfaz perfil/histórico após última escrita", async () => {
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "BULK-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const rows = await readEconomicProfiles(connection, actor, { governmentEntityId: "ente", query: "BULK-1" });
      const input = { filter: { governmentEntityId: "ente", query: "BULK-1" }, targets: rows.map(row => ({ id: row.id, updatedAt: row.updatedAt, profileVersion: row.profileVersion })), changes: { companyType: "LTDA revisada", taxRegime: "Simples Nacional" }, processId: null, reason: "Alteração geral documentada" };
      await assert.rejects(bulkChangeEconomicProfiles(connection, actor, { ...input, targets: [{ ...input.targets[0], profileVersion: 99 }] }), /seleção/);
      const before = await counts(f); const position = await registrations.readEconomicRegistration(db, row.id);
      await f.database.exec(`CREATE FUNCTION economic_test_fail_bulk() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ECONOMIC_BULK_CHANGE' THEN RAISE EXCEPTION 'economic final bulk failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER economic_test_fail_bulk BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION economic_test_fail_bulk()`);
      try {
        await assert.rejects(bulkChangeEconomicProfiles(connection, actor, input), economicError(/economic final bulk failure/));
        assert.deepEqual(await counts(f), before); assert.deepEqual(await registrations.readEconomicRegistration(db, row.id), position);
      } finally { await f.database.exec(`DROP TRIGGER economic_test_fail_bulk ON "TaxRegistryEntry"; DROP FUNCTION economic_test_fail_bulk()`); }
      assert.equal((await bulkChangeEconomicProfiles(connection, actor, input)).count, 1);
      await assert.rejects(bulkChangeEconomicProfiles(connection, actor, input), /seleção/);
    });
    await t.test("débitos conciliados usam Decimal exato, pagamentos confirmados e compensações", async () => {
      const [assessment] = await db.insert(taxAssessments).values({ taxId: "fee", taxpayerId: "unrelated", year: 2026, originalValue: 0, originalValueDecimal: new Decimal("9999999999999999.99"), finalValueDecimal: new Decimal("9999999999999999.99"), calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } }).returning();
      const [guide] = await db.insert(taxGuides).values({ assessmentId: assessment.id, totalValue: 0, totalValueDecimal: assessment.finalValueDecimal, dueDate: new Date() }).returning();
      await db.execute(sql`INSERT INTO "TaxPayment" (id,"guideId","amountPaid","amountPaidDecimal","paymentDate","paymentMethod","updatedAt") VALUES ('exact-payment',${guide.id},0,9999999999999999.98,CURRENT_TIMESTAMP,'Manual',CURRENT_TIMESTAMP)`);
      const check = () => withDatabaseTransaction(connection, tx => assertEconomicTaxpayerDebtFree(tx, "unrelated", { governmentEntityId: "ente", budgetUnitId: "ug" }));
      await assert.rejects(check(), /débitos impeditivos/);
      await withDatabaseTransaction(connection, tx => registry.appendEconomicEntry(tx, { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_MOVEMENT", title: "Compensação exata", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "0.01" } }));
      await check();
      await db.insert(pageActiveDebts).values({ id: "economic-active-debt", originDebtType: "ISS", year: 2026, originalValue: 0, updatedValue: 0, taxpayerId: "unrelated", governmentEntityId: "ente", budgetUnitId: "ug", status: "INSCRITA", createdAt: new Date(), updatedAt: new Date() });
      await assert.rejects(check(), /dívida ativa/);
      await db.update(pageActiveDebts).set({ status: "PAGA" }).where(eq(pageActiveDebts.id, "economic-active-debt")); await check();
      await db.update(taxAssessments).set({ calculationSnapshot: null }).where(eq(taxAssessments.id, assessment.id));
      await assert.rejects(check(), /origem conciliada/);
      await db.update(taxAssessments).set({ status: "Cancelado" }).where(eq(taxAssessments.id, assessment.id));
    });
    await t.test("eventos e veículos preservam layout histórico, vigência, placa e cancelamento", async () => {
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "EVENT-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const typeInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, code: "FEIRA", name: "Feira", active: true, fields: [{ key: "area", label: "Área", type: "NUMBER" as const, required: true }], layoutTitle: "Licença de evento", layoutText: "Texto original", legalBasis: "Norma municipal" };
      const type = await publishEconomicEventType(connection, actor, typeInput);
      const eventInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, typeId: type.entityId, expectedTypeVersion: 1, name: "Feira municipal", responsibleTaxpayerId: "partner", registrationId: row.id, startDate: "2099-01-01", endDate: "2099-01-02", address, values: { area: "999999999999.123456" }, active: true, reason: "Cadastro documentado" };
      const event = await saveEconomicEvent(connection, actor, eventInput);
      const license = await issueEconomicEventLicense(connection, actor, { eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 1, reason: "Autorização municipal" });
      assert.equal(license.validUntil?.toISOString(), "2099-01-02T23:59:59.999Z");
      assert.equal(taxScopeSnapshot(taxScopeSnapshot((await registry.readLicenseIssuance(db, license.id)).data).values).area, "999999999999.123456");
      await assert.rejects(saveEconomicEvent(connection, actor, { ...eventInput, eventId: event.entityId, expectedVersion: 1 }), /Cancele/);
      await assert.rejects(issueEconomicEventLicense(connection, actor, { eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 1, reason: "Duplicada" }), /Já existe/);
      assert.equal(Buffer.from(await renderConfiguredLicensePdf(db, license.qrCode!)).subarray(0, 5).toString(), "%PDF-");
      await transitionConfiguredLicense(connection, actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Cancelado", reason: "Substituição documentada" });
      await publishEconomicEventType(connection, actor, { ...typeInput, typeId: type.entityId, expectedVersion: 1, layoutText: "Texto revisado" });
      assert.match(String(taxScopeSnapshot((await registry.readLicenseIssuance(db, license.id)).data).layoutText), /^Texto original/);
      const vehicle = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, brand: "Marca", model: "Modelo", prefix: "1", plate: "ABC-1234", plateType: "BRASILEIRA" as const, registrationId: row.id, driverTaxpayerId: "partner", purpose: "Serviço autorizado", active: true, reason: "Vínculo documentado" };
      const saved = await saveEconomicVehicle(connection, actor, vehicle); assert.equal(saved.title, "ABC1234");
      await assert.rejects(saveEconomicVehicle(connection, actor, vehicle), /Placa já vinculada/);
      await assert.rejects(saveEconomicVehicle(connection, actor, { ...vehicle, plate: "DEF1234", driverTaxpayerId: "payer" }), /pessoa física/);
      await assert.rejects(saveEconomicVehicle(connection, actor, { ...vehicle, vehicleId: saved.entityId, expectedVersion: 0 }), /alterado/);
    });
    await t.test("alvará anual: lote atômico, taxa Decimal, isenção, duplicidade e cancelamento definitivo", async () => {
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "LICENSE-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const second = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "LICENSE-2", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const policy = await publishLicensePolicy(connection, actor, policyInput("FEE", { requireFeePayment: true, feeTaxId: "fee", allowExempt: true }));
      const input = await licenseInput(f, row.id, policy.entityId);
      await assert.rejects(issueConfiguredLicenses(connection, actor, [input]), /pagamento integral/);
      await assert.rejects(issueConfiguredLicenses(connection, actor, [{ ...input, exempt: true }]), /fundamento explícito/);
      const exempt = { ...input, exempt: true, exemptionReason: "Isenção documentada" };
      const before = await counts(f);
      await assert.rejects(issueConfiguredLicenses(connection, actor, [exempt, { ...exempt, registrationId: second.id, expectedRegistrationUpdatedAt: new Date(0).toISOString() }]), /alterado/);
      assert.deepEqual(await counts(f), before);
      const [assessment] = await db.insert(taxAssessments).values({ taxId: "fee", taxpayerId: "payer", economicRegistrationId: row.id, year: new Date().getUTCFullYear(), originalValue: 0, originalValueDecimal: new Decimal("0.30"), finalValueDecimal: new Decimal("0.30"), calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } }).returning();
      const [guide] = await db.insert(taxGuides).values({ assessmentId: assessment.id, totalValue: 0, totalValueDecimal: new Decimal("0.30"), dueDate: new Date() }).returning();
      await db.execute(sql`INSERT INTO "TaxPayment" (id,"guideId","amountPaid","amountPaidDecimal","paymentDate","paymentMethod","updatedAt") VALUES ('fee-payment',${guide.id},0,0.10,CURRENT_TIMESTAMP,'Manual',CURRENT_TIMESTAMP)`);
      await withDatabaseTransaction(connection, tx => registry.appendEconomicEntry(tx, { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_MOVEMENT", title: "Compensação", status: "EFETIVADO", data: { operation: "COMPENSAR", amount: "0.20" } }));
      const [license] = await issueConfiguredLicenses(connection, actor, [{ ...input, feeAssessmentId: assessment.id }]);
      const memory = await registry.readLicenseIssuance(db, license.id);
      assert.deepEqual(taxScopeSnapshot(memory.data).fee, { assessmentId: assessment.id, amount: "0.30", paid: "0.10", compensated: "0.20" });
      await assert.rejects(issueConfiguredLicenses(connection, actor, [exempt]), /Já existe/);
      await assert.rejects(db.update(taxLicenses).set({ status: "Cancelado" }).where(eq(taxLicenses.id, license.id)), economicError(/ciclo auditado/));
      await assert.rejects(db.update(taxRegistryEntries).set({ title: "Alterado" }).where(eq(taxRegistryEntries.id, memory.id)), economicError(/imutável/));
      const cancelled = await transitionConfiguredLicense(connection, actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Cancelado", reason: "Cancelamento definitivo" });
      await assert.rejects(transitionConfiguredLicense(connection, actor, { licenseId: license.id, expectedUpdatedAt: cancelled.updatedAt.toISOString(), status: "Suspenso", reason: "Reativação vedada" }), /indisponível/);
      const gracePolicy = await publishLicensePolicy(connection, actor, policyInput("GRACE", { requireFeePayment: true, feeTaxId: "fee", paymentGraceUntil: new Date().toISOString().slice(0, 10) }));
      const [grace] = await issueConfiguredLicenses(connection, actor, [await licenseInput(f, row.id, gracePolicy.entityId)]);
      assert.equal(grace.validUntil?.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
    });
    await t.test("titular e escopos atuais governam emissão/replay/download dos documentos", async () => {
      const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "PORTAL-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const current = await registrations.readEconomicRegistration(db, row.id);
      const input = { registrationId: row.id, expectedUpdatedAt: current.updatedAt.toISOString(), kind: "REGISTRATION" as const, requestKey: randomUUID() };
      await assert.rejects(issuePortalEconomicDocument(connection, "citizen", input), /EMPRESA/);
      await db.execute(sql`INSERT INTO "TaxpayerPortalAccess" (id,"usuarioId","taxpayerId",scopes,"grantedByUsuarioId") VALUES ('portal-economic-grant','citizen','payer','["EMPRESA","CERTIDOES","ALVARAS"]'::jsonb,'ana')`);
      const emitted = await issuePortalEconomicDocument(connection, "citizen", input);
      assert.deepEqual(await issuePortalEconomicDocument(connection, "citizen", input), emitted);
      await assert.rejects(issuePortalEconomicDocument(connection, "citizen", { ...input, kind: "CESSATION" }), /Chave/);
      assert.equal(Buffer.from(await renderPortalEconomicDocument(connection, "citizen", emitted.issuanceId)).subarray(0, 5).toString(), "%PDF-");
      await updateEconomicRegistrationWithHistory(connection, actor, row.id, { status: "Baixado" });
      const cessation = await issuePortalEconomicDocument(connection, "citizen", { ...input, expectedUpdatedAt: (await registrations.readEconomicRegistration(db, row.id)).updatedAt.toISOString(), kind: "CESSATION", requestKey: randomUUID() });
      assert.ok(typeof taxScopeSnapshot((await registry.readEconomicDocumentIssuance(db, cessation.issuanceId)).data).cessationObservedAt === "string");
      const portalRow = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "PORTAL-LICENSE", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
      const policy = await publishLicensePolicy(connection, actor, policyInput("PORTAL", { allowPortalIssue: true }));
      const portalInput = await licenseInput(f, portalRow.id, policy.entityId);
      assert.equal((await issuePortalLicense(connection, "citizen", portalInput)).status, "Emitido");
      await db.execute(sql`UPDATE "TaxpayerPortalAccess" SET "revokedAt"=CURRENT_TIMESTAMP WHERE id='portal-economic-grant'`);
      await assert.rejects(issuePortalEconomicDocument(connection, "citizen", input), /EMPRESA/);
      await assert.rejects(renderPortalEconomicDocument(connection, "citizen", emitted.issuanceId), /EMPRESA/);
      await assert.rejects(issuePortalLicense(connection, "citizen", portalInput), /ALVARAS/);
    });
  } finally { await f.close(); }
});

test("Alvará A1: GED/evidência atômicos, original privado e integridade após cancelamento", { timeout: 240_000 }, async () => {
  const f = await createEconomicDrizzleFixture();
  const folder = await mkdtemp(join(process.env.CELERIFLOW_POSTGRES_TEST_TEMP ?? (process.platform === "win32" ? join(process.env.LOCALAPPDATA!, "Temp", "opencode") : tmpdir()), "tax-economic-signature-"));
  const keys = ["BLOB_READ_WRITE_TOKEN", "CELERIFLOW_INSTANCE_ID", "VERCEL_BLOB_API_URL", "CELERIFLOW_ECONOMIC_FIXTURE_PRIVATE_KEY_PEM"] as const;
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const dispatcher = getGlobalDispatcher(); const mock = new MockAgent(); mock.disableNetConnect();
  const files = new Map<string, Buffer>(); const pending: Promise<void>[] = []; let deleted = 0;
  try {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_isolated_fixture";
    process.env.CELERIFLOW_INSTANCE_ID = "economic-signature-fixture";
    process.env.VERCEL_BLOB_API_URL = "https://economic-signature-api.invalid";
    setGlobalDispatcher(mock);
    const api = mock.get("https://economic-signature-api.invalid");
    const storage = mock.get("https://isolated.private.blob.vercel-storage.com");
    api.intercept({ method: "PUT", path: /./ }).reply(options => {
      const pathname = new URL(options.path, "https://economic-signature-api.invalid").searchParams.get("pathname")!;
      assert.ok(pathname.startsWith("instances/economic-signature-fixture/documents/processos/"));
      const body = options.body;
      pending.push((async () => {
        const chunks: Buffer[] = [];
        if (typeof body === "string" || Buffer.isBuffer(body)) chunks.push(Buffer.from(body));
        else if (body instanceof Blob) chunks.push(Buffer.from(await body.arrayBuffer()));
        else if (body) for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
        files.set(pathname, Buffer.concat(chunks));
      })());
      const url = `https://isolated.private.blob.vercel-storage.com/${pathname}`;
      return { statusCode: 200, data: { url, pathname, downloadUrl: `${url}?download=1`, contentType: "application/pdf", contentDisposition: "attachment", etag: "fixture" } };
    }).persist();
    api.intercept({ method: "POST", path: /./ }).reply(() => { deleted++; return { statusCode: 200, data: {} }; }).persist();
    storage.intercept({ method: "GET", path: /./ }).reply(options => {
      const bytes = files.get(options.path.slice(1)); assert.ok(bytes);
      return { statusCode: 200, data: bytes, responseOptions: { headers: { "content-type": "application/pdf" } } };
    }).persist();
    const openssl = process.env.CELERIFLOW_TEST_OPENSSL ?? (existsSync("C:\\Program Files\\Git\\usr\\bin\\openssl.exe") ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl");
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1", "-subj", "/CN=Isolated Economic Signature Fixture"], { cwd: folder, stdio: "pipe" });
    const pem = await readFile(join(folder, "cert.pem"), "utf8");
    process.env.CELERIFLOW_ECONOMIC_FIXTURE_PRIVATE_KEY_PEM = await readFile(join(folder, "key.pem"), "utf8");
    const certificate = await registerA1Certificate(f.db, "ana", { alias: "Alvará isolado", ownerName: "Operador", credentialReference: "CELERIFLOW_ECONOMIC_FIXTURE", certificatePem: pem, trustedRootPem: pem, purposes: ["GED"] });
    const row = await createEconomicRegistrationWithProfile(f.connection, f.actor, { municipalInsc: "SIGNED-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput() });
    const policy = await publishLicensePolicy(f.connection, f.actor, policyInput("SIGNED"));
    const [license] = await issueConfiguredLicenses(f.connection, f.actor, [await licenseInput(f, row.id, policy.entityId)]);
    const actor = { ...f.actor, name: "Ana", email: "ana@example.invalid" };
    const input = { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), certificateId: certificate.id };
    await assert.rejects(signConfiguredLicense(f.connection, { ...actor, allowedBudgetUnitIds: [] }, input), /UG autorizada/);
    async function gedCounts() {
      return {
        documents: (await f.db.select().from(documents)).length,
        versions: (await f.db.select().from(documentVersions)).length,
        signatures: (await f.db.select().from(documentSignatures)).length,
        evidence: (await f.db.select().from(documentIcpEvidence)).length,
        certificateUses: (await f.db.select().from(certificateUseAudits)).length,
        tax: await counts(f),
      };
    }
    const beforeGed = await gedCounts();
    await f.database.exec(`CREATE FUNCTION economic_test_fail_signature() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SIGN_CONFIGURED_LICENSE' THEN RAISE EXCEPTION 'economic signature final audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER economic_test_fail_signature BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION economic_test_fail_signature()`);
    try {
      await assert.rejects(signConfiguredLicense(f.connection, actor, input), economicError(/economic signature final audit failure/));
      await Promise.all(pending);
      assert.deepEqual(await gedCounts(), beforeGed);
      assert.equal(await registry.readLicenseSignature(f.db, license.id), null);
    } finally { await f.database.exec(`DROP TRIGGER economic_test_fail_signature ON "TaxAuditLog"; DROP FUNCTION economic_test_fail_signature()`); }
    const signed = await signConfiguredLicense(f.connection, actor, input); await Promise.all(pending);
    const original = await readSignedLicenseArtifact(f.connection, license.qrCode!);
    assert.equal(original.valid, true); assert.equal(Buffer.from(original.bytes).subarray(0, 5).toString(), "%PDF-");
    assert.equal(createHash("sha256").update(original.bytes).digest("hex"), original.signature.documentHash);
    const version = await licenses.readFirstEconomicDocumentVersion(f.db, signed.documentId);
    assert.deepEqual(original.bytes, new Uint8Array(files.get(new URL(version.fileUrl).pathname.slice(1))!));
    await assert.rejects(signConfiguredLicense(f.connection, actor, input), /já possui original assinado/); await Promise.all(pending);
    assert.equal(deleted, 2);
    assert.equal((await f.db.select().from(documents).where(eq(documents.id, signed.documentId))).length, 1);
    const suspended = await transitionConfiguredLicense(f.connection, f.actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Suspenso", reason: "Suspensão motivada" });
    assert.equal((await readSignedLicenseArtifact(f.connection, license.qrCode!)).valid, false);
    await transitionConfiguredLicense(f.connection, f.actor, { licenseId: license.id, expectedUpdatedAt: suspended.updatedAt.toISOString(), status: "Cancelado", reason: "Cancelamento definitivo" });
    const historical = await readSignedLicenseArtifact(f.connection, license.qrCode!);
    assert.equal(historical.licenseStatus, "Cancelado"); assert.deepEqual(historical.bytes, original.bytes);
    await assert.rejects(f.db.update(taxRegistryEntries).set({ title: "Alterado" }).where(and(eq(taxRegistryEntries.entityId, license.id), eq(taxRegistryEntries.category, "LICENSE_SIGNATURE"))), economicError(/imutável/));
    files.set(new URL(version.fileUrl).pathname.slice(1), Buffer.from("%PDF-1.7 adulterado"));
    await assert.rejects(readSignedLicenseArtifact(f.connection, license.qrCode!), /Integridade/);
  } finally {
    await Promise.allSettled(pending); setGlobalDispatcher(dispatcher); await mock.close();
    for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
    await rm(folder, { recursive: true, force: true }); await f.close();
  }
});

// Queue after Tax migrates its scope, subject and configurable-catalog helpers.
// Every dependency below must participate in the owner's existing transaction.
test("Integração Tax: ISS/CBO, sócios por inscrição, zoneamento e formulário compartilham a transação", { timeout: 240_000 }, async () => {
  const f = await createEconomicDrizzleFixture();
  const { db, connection, actor } = f;
  try {
    await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('economic-resource','ECONOMIC-000','Livre',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('economic-revenue','ECONOMIC-RECEITA','Receita municipal',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","resourceSourceId","budgetUnitId","currentBalanceDecimal","updatedAt") VALUES ('economic-bank','Banco','0001','ECONOMIC-1','economic-resource','ug',0,CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","updatedAt") VALUES ('economic-mapping','iss','economic-revenue','economic-resource','economic-bank',CURRENT_TIMESTAMP)`);
    await db.insert(healthCbos).values({ code: "123456", description: "Ocupação municipal" });
    await db.execute(sql`INSERT INTO "TaxServiceActivity" (id,"taxId",code,name,"issRate","updatedAt") VALUES ('service','iss','1.01','Serviço municipal',2,CURRENT_TIMESTAMP)`);
    const activity = { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", name: "Atividade municipal", risk: "BAIXO" as const, active: true, serviceActivityIds: ["service"], cboCodes: ["123456"], legalBasis: "Norma municipal" };
    await assert.rejects(publishEconomicActivity(connection, actor, { ...activity, cnae: "4444444", cboCodes: ["999999"] }), /CBO ativas/);
    const source = await publishEconomicActivity(connection, actor, { ...activity, cnae: "4444444" });
    const target = await publishEconomicActivity(connection, actor, { ...activity, cnae: "5555555" });
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(source.data).serviceNames).service, "1.01 · Serviço municipal");
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(source.data).cboNames)["123456"], "Ocupação municipal");
    const row = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "INTEGRATION-1", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput({ primaryCnae: "4444444", partners: [{ taxpayerId: "partner", role: "Administrador", sharePercent: "100", validateDebt: false }] }) });
    const second = await createEconomicRegistrationWithProfile(connection, actor, { municipalInsc: "INTEGRATION-2", taxpayerId: "payer", taxRegime: "Normal", profile: profileInput({ primaryCnae: "5555555" }) });
    const catalog = { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", kind: "TIPO_SOCIO" as const, code: "MANAGER", name: "Administrador", active: true, fields: [], neighborhoodId: null, streetId: null, landUnitValue: null, legalBasis: "Política de sócios", validatePartnerDebt: true };
    await publishFiscalCatalog(connection, actor, catalog);
    const [debt] = await db.insert(taxAssessments).values({ taxId: "fee", taxpayerId: "partner", year: new Date().getUTCFullYear(), originalValue: 0, originalValueDecimal: new Decimal("1.00"), finalValueDecimal: new Decimal("1.00"), calculationSnapshot: { governmentEntityId: "ente", budgetUnitId: "ug" } }).returning();
    const policy = await publishLicensePolicy(connection, actor, policyInput("PARTNERS", { includePartnerDebts: true }));
    await assert.rejects(issueConfiguredLicenses(connection, actor, [await licenseInput(f, row.id, policy.entityId)]), /débitos impeditivos/);
    assert.equal((await issueConfiguredLicenses(connection, actor, [await licenseInput(f, second.id, policy.entityId)])).length, 1);
    await db.update(taxAssessments).set({ status: "Cancelado" }).where(eq(taxAssessments.id, debt.id));
    const zoneInput = { ...catalog, kind: "ZONEAMENTO" as const, code: "ZONE", name: "Zona municipal", zoningActivities: [{ cnae: "4444444", treatment: "PERMITIDA" as const, condition: "" }, { cnae: "5555555", treatment: "PROIBIDA" as const, condition: "" }] };
    const zone = await publishFiscalCatalog(connection, actor, zoneInput);
    const unify = { governmentEntityId: "ente", budgetUnitId: "ug", sourceId: source.entityId, sourceVersion: 1, targetId: target.entityId, targetVersion: 1, processId: null, reason: "Unificação integrada" };
    await assert.rejects(unifyEconomicActivities(connection, actor, unify), /Concilie a regra urbanística/);
    await publishFiscalCatalog(connection, actor, { ...zoneInput, catalogId: zone.entityId, expectedVersion: 1, zoningActivities: [zoneInput.zoningActivities[0]] });
    const before = await counts(f); const position = await registrations.readEconomicRegistration(db, row.id);
    await f.database.exec(`CREATE FUNCTION economic_test_fail_unification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ECONOMIC_ACTIVITY_UNIFICATION' THEN RAISE EXCEPTION 'economic final unification failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER economic_test_fail_unification BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION economic_test_fail_unification()`);
    try {
      await assert.rejects(unifyEconomicActivities(connection, actor, unify), economicError(/economic final unification failure/));
      assert.deepEqual(await counts(f), before); assert.deepEqual(await registrations.readEconomicRegistration(db, row.id), position);
      assert.equal((await registry.readEconomicCatalog(db, zone.entityId)).version, 2);
    } finally { await f.database.exec(`DROP TRIGGER economic_test_fail_unification ON "TaxRegistryEntry"; DROP FUNCTION economic_test_fail_unification()`); }
    assert.equal((await unifyEconomicActivities(connection, actor, unify)).count, 1);
    const revised = await registry.readEconomicCatalog(db, zone.entityId);
    assert.equal(revised.version, 3); assert.deepEqual(taxScopeSnapshot(revised.data).zoningActivities, [{ cnae: "5555555", treatment: "PERMITIDA", condition: "" }]);
    const form = await publishFiscalCatalog(connection, actor, { ...catalog, kind: "FORMULARIO_EMPRESA", code: "FORM", name: "Formulário econômico", fields: [{ key: "limit", label: "Limite", type: "NUMBER", required: true }] });
    await saveConfiguredFiscalRecord(connection, actor, { catalogId: form.entityId, entityType: "ECONOMIC_REGISTRATION", entityId: row.id, expectedVersion: 0, active: true, values: { limit: "999999999999.123456" }, processId: null, documentIds: [], frontage: null });
    const selected = await readEconomicProfiles(connection, actor, { governmentEntityId: "ente", query: "INTEGRATION-1", fieldKey: "limit", fieldValue: "999999999999.123456" }); assert.equal(selected.length, 1);
    const bulk = { filter: { governmentEntityId: "ente", query: "INTEGRATION-1" }, targets: selected.map(row => ({ id: row.id, updatedAt: row.updatedAt, profileVersion: row.profileVersion })), changes: { taxRegime: "Simples Nacional" }, form: { catalogId: form.entityId, expectedCatalogVersion: 1, expectedRecordVersions: { [row.id]: 1 }, values: { limit: "0.000001" } }, processId: null, reason: "Alteração do formulário" };
    const formBefore = await counts(f); const formPosition = await registrations.readEconomicRegistration(db, row.id);
    await f.database.exec(`CREATE FUNCTION economic_test_fail_form() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.category='ECONOMIC_BULK_CHANGE' THEN RAISE EXCEPTION 'economic final form failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER economic_test_fail_form BEFORE INSERT ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION economic_test_fail_form()`);
    try {
      await assert.rejects(bulkChangeEconomicProfiles(connection, actor, bulk), economicError(/economic final form failure/));
      assert.deepEqual(await counts(f), formBefore); assert.deepEqual(await registrations.readEconomicRegistration(db, row.id), formPosition);
      assert.equal((await registry.readEconomicFiscalRecord(db, row.id, form.entityId))?.version, 1);
    } finally { await f.database.exec(`DROP TRIGGER economic_test_fail_form ON "TaxRegistryEntry"; DROP FUNCTION economic_test_fail_form()`); }
    assert.equal((await bulkChangeEconomicProfiles(connection, actor, bulk)).count, 1);
    const currentForm = await registry.readEconomicFiscalRecord(db, row.id, form.entityId); assert.ok(currentForm);
    assert.equal(taxScopeSnapshot(taxScopeSnapshot(currentForm.data).values).limit, "0.000001");
  } finally { await f.close(); }
});
