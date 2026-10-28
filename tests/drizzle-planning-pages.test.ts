import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { Decimal } from "../src/db/decimal";
import type { DatabaseConnection } from "../src/db/connection";
import type { PlanningContext } from "../src/lib/planejamento/access";
import type { PermissionUser } from "../src/lib/contracts/identity";
import { secretariats } from "../src/db/schema/administration";
import { governmentEntities } from "../src/db/schema/master-data";
import { financialYears } from "../src/db/schema/finance-years";
import { planningAppropriations, planningBudgetLaws, planningBudgetUnits, planningCreditBatches, planningCreditLines, planningDocumentLinks, planningEntityScopes, planningEntityUnits, planningGuidelines, planningHearings, planningInstruments, planningLines, planningMovements, planningMultiYearPlans, planningQuotas, planningQuotaEvents } from "../src/db/schema/planning-budget";
import { planningActions, planningAnnualPrograms, planningCatalogEntries, planningCatalogVersions, planningExpenseNatures, planningFiscalRules, planningGoals, planningIndicators, planningInstrumentSources, planningMemories, planningObjectives, planningPhysicalEvents, planningPlannedWorks, planningPriorities, planningPrograms, planningResourceSources, planningRevenueAllocations, planningRevenueNatures, planningRisks, planningVersions, planningWaivers } from "../src/db/schema/planning-legal";
import { documentClasses, documentVersions } from "../src/db/schema/document-workflow";
import { documents } from "../src/db/schema/registry";
import { accessProfiles, users } from "../src/db/schema/identity";
import { financeCreditRequests } from "../src/db/schema/finance-legacy-budget";
import { councilors, legislatures } from "../src/db/schema/chamber";
import * as mappings from "../src/db/schema/planning-pages";
import { contentHash, jsonValue, snapshotVersion } from "../src/lib/planejamento/operations-core";
import { planningLookup, planningLookupFields } from "../src/lib/planejamento/lookups";
import { generatePlanningReport, persistPlanningReport, readPreservedPlanningReport, configurePlanningFiscalReport, addPlanningWork } from "../src/lib/planejamento/reports";
import { configurePlanningReportLayout } from "../src/lib/planejamento/report-layouts";
import { publicPlanningPublicationResponse } from "../src/lib/planejamento/publication-response";
import { pageCanonicalCatalog, pageClassifiers, pagePublishedCatalogs, pageReferences } from "../src/db/repositories/planning-pages/catalogs";
import { pageDatabase, pageDocumentClasses, pageInstrument, pageUnitOptions } from "../src/db/repositories/planning-pages/shared";
import { pageCounterparties, pageEntities, pageImports, pageParentOptions, pagePrograms } from "../src/db/repositories/planning-pages/navigation";
import { pageHearings } from "../src/db/repositories/planning-pages/hearings";
import { pageMaintenanceOptions, pageMaintenanceRecords } from "../src/db/repositories/planning-pages/maintenance";
import { pageAmendmentList, pageCouncilors, pageCredits, pageDocuments, pageLegacy, pageLegislativeLinks, pageManagementLines, pagePeers, pagePredecessors, pageQuotaList, pageReportOptions, pageSigners, pageVersions, pageWaiverOptions } from "../src/db/repositories/planning-pages/management";
import { pageReportLines, pageReportPieces, pageReportPrograms } from "../src/db/repositories/planning-pages/reports";
import { planningReportCatalog } from "../src/lib/planejamento/report-catalog";

const instant = new Date("2026-10-28T00:30:12.345Z"), start = new Date("2026-01-01T00:00:00.000Z"), end = new Date("2029-12-31T00:00:00.000Z");
const ppa = "pp-ppa", ldo = "pp-ldo", loa = "pp-loa", actor = "pp-user", entityId = "pp-entity-a", unitId = "pp-unit-a";
const snapshotJson = { nested: [null, "90071992547409.91", { untouched: true }], dateText: "2026-01-01" };
function fixtureContext(connection: DatabaseConnection, admin = false, allowedBudgetUnitIds = [unitId]): PlanningContext {
  const grants = { acesso: "TOTAL", modules: Object.fromEntries(["PLANEJAMENTO", "CAMARA", "DOCUMENTOS", "TRANSPARENCIA"].map(code => [code, { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: true, legalApproval: true }])) };
  const user: PermissionUser = { id: actor, firebaseUid: "pp-firebase", email: "planning-pages@example.test", name: "Pessoa de ensaio", role: admin ? "Administrador" : "Planejamento", profileCode: admin ? "SYSTEM_ADMINISTRATOR" : "PP-READER", permissions: JSON.stringify(grants), modulePermissions: ["PLANEJAMENTO", "CAMARA", "DOCUMENTOS", "TRANSPARENCIA"].map(code => ({ code, canView: true, canEdit: true })), allowedBudgetUnitIds, employeeId: null, departmentId: null, secretariatId: null };
  return { user, jurisdiction: "EXECUTIVE", database: connection.db, connection };
}

async function seed(connection: DatabaseConnection) {
  const db = connection.db;
  await db.insert(accessProfiles).values({ id: "pp-profile", codigo: "PP-READER", nome: "Fixture Planning", permissoes: "{}" });
  await db.insert(users).values({ id: actor, perfilId: "pp-profile", nome: "Pessoa de ensaio", email: "planning-pages@example.test" });
  await db.insert(secretariats).values({ id: "pp-secretariat", name: "Secretaria PP fixture" });
  for (const suffix of ["a", "b", "leg", "inactive"]) {
    await db.insert(governmentEntities).values({ id: `pp-entity-${suffix}`, code: `PP.${suffix}`, name: `Ente PP ${suffix}`, type: "PREFEITURA" });
    await db.insert(planningEntityScopes).values({ governmentEntityId: `pp-entity-${suffix}`, jurisdiction: suffix === "leg" ? "LEGISLATIVE" : "EXECUTIVE", isActive: suffix !== "inactive" });
    await db.insert(planningBudgetUnits).values({ id: `pp-unit-${suffix}`, code: `PP.UG.${suffix}`, name: `Unidade PP ${suffix}`, secretariatId: "pp-secretariat" });
    await db.insert(planningEntityUnits).values({ governmentEntityId: `pp-entity-${suffix}`, budgetUnitId: `pp-unit-${suffix}` });
  }
  await db.insert(planningBudgetUnits).values({ id: "pp-unit-other", code: "PP.UG.other", name: "Unidade PP não autorizada", secretariatId: "pp-secretariat" });
  await db.insert(planningEntityUnits).values({ governmentEntityId: entityId, budgetUnitId: "pp-unit-other" });
  await db.insert(planningResourceSources).values({ id: "pp-source", code: "PP.FONTE", name: "Fonte canônica PP", tceCode: null, referenceYear: 2026 });
  await db.insert(planningRevenueNatures).values({ id: "pp-revenue", code: "PP.RECEITA", name: "Receita PP", degree: 6, referenceYear: 2026 });
  await db.insert(planningExpenseNatures).values({ id: "pp-expense", code: "PP.DESPESA", name: "Despesa PP" });
  await db.insert(planningRevenueAllocations).values({ id: "pp-allocation", revenueNatureId: "pp-revenue", resourceSourceId: "pp-source", percentage: new Decimal("100.000000") });
  // Populate draft editions before publication: the historical INSERT guard
  // protects entries of published editions just as it protects their updates.
  await db.insert(planningCatalogVersions).values([{ id: "pp-catalog", year: 2026, label: "Fixture PP vigente", normativeReference: "Norma PP preservada", sourceHash: "1".repeat(64), createdById: actor }, { id: "pp-msc", year: 2026, label: "Fixture PP MSC", normativeReference: "MSC", sourceHash: "2".repeat(64), createdById: actor }]);
  await db.insert(planningCatalogEntries).values([{ id: "pp-entry", versionId: "pp-catalog", kind: "SOURCE", code: "PP.NORMA", name: "Fonte PP normativa", degree: 1, canonicalId: "pp-source", attributes: { governmentEntityId: entityId, budgetUnitId: null } }, { id: "pp-msc-entry", versionId: "pp-msc", kind: "MSC_ACCOUNT", code: "PP.MSC", name: "MSC", degree: 1, canonicalId: "msc", attributes: {} }]);
  for (const [index, suffix, attributes] of [
    [3, "missing", { governmentEntityId: entityId }],
    [4, "unit", { governmentEntityId: entityId, budgetUnitId: unitId, presentationPredecessorVersionId: "pp-json-missing", presentationEffectiveFrom: "2026-01-01" }],
    [5, "denied", { governmentEntityId: entityId, budgetUnitId: "pp-unit-other", presentationPredecessorVersionId: "pp-catalog", presentationEffectiveFrom: "2200-01-01" }],
  ] as const) {
    await db.insert(planningCatalogVersions).values({ id: `pp-json-${suffix}`, year: 2026, label: `JSON PP ${suffix}`, normativeReference: "Norma JSON", sourceHash: String(index).repeat(64), createdById: actor });
    await db.insert(planningCatalogEntries).values({ id: `pp-json-entry-${suffix}`, versionId: `pp-json-${suffix}`, kind: "SOURCE", code: "PP.JSON", name: `JSON ${suffix}`, degree: 1, canonicalId: "pp-json-source", attributes });
    await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, `pp-json-${suffix}`));
  }
  for (const id of ["pp-catalog", "pp-msc"]) await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, id));
  await db.insert(planningMultiYearPlans).values([{ id: "pp-canonical", code: "PP.PPA", name: "PPA PP", startYear: 2026, endYear: 2029, status: "DRAFT" }, { id: "pp-other-canonical", code: "PP.OTHER", name: "PPA restrito", startYear: 2026, endYear: 2029, status: "DRAFT" }]);
  await db.insert(planningInstruments).values([{ id: ppa, governmentEntityId: entityId, kind: "PPA", code: "PP.PPA", title: "PPA PP", startYear: 2026, endYear: 2029, multiYearPlanId: "pp-canonical", catalogVersionId: "pp-catalog", createdById: actor, createdAt: instant }, { id: "pp-other", governmentEntityId: "pp-entity-b", kind: "PPA", code: "PP.OTHER", title: "PPA restrito", startYear: 2026, endYear: 2029, multiYearPlanId: "pp-other-canonical", createdById: actor }]);
  await db.insert(financialYears).values({ id: "pp-year", governmentEntityId: entityId, year: 2026, startDate: start, endDate: new Date("2026-12-31T00:00:00.000Z") });
  await db.insert(planningGuidelines).values({ id: "pp-guideline", financialYearId: "pp-year", multiYearPlanId: "pp-canonical", status: "DRAFT" });
  await db.insert(planningBudgetLaws).values({ id: "pp-law", lawNumber: "PP.LOA", financialYearId: "pp-year", budgetGuidelineId: "pp-guideline", status: "DRAFT", totalRevenue: new Decimal("100"), totalExpense: new Decimal("100") });
  await db.insert(planningInstruments).values({ id: ldo, governmentEntityId: entityId, kind: "LDO", code: "PP.LDO", title: "LDO PP", startYear: 2026, endYear: 2026, budgetGuidelineId: "pp-guideline", parentId: ppa, createdById: actor });
  await db.insert(planningInstruments).values({ id: loa, governmentEntityId: entityId, kind: "LOA", code: "PP.LOA", title: "LOA PP", startYear: 2026, endYear: 2026, annualBudgetLawId: "pp-law", parentId: ldo, createdById: actor });
  await db.insert(planningPrograms).values({ id: "pp-program", multiYearPlanId: "pp-canonical", code: "PP.PROG", name: "Programa PP", origin: null });
  await db.insert(planningActions).values({ id: "pp-action", programId: "pp-program", code: "PP.ACAO", name: "Ação PP" });
  await db.insert(planningGoals).values({ id: "pp-goal", actionId: "pp-action", year: 2026, physical: 0.125, financial: new Decimal("0.01") });
  await db.insert(planningObjectives).values({ id: "pp-objective", programId: "pp-program", code: "PP.OBJ", description: "Objetivo PP" });
  await db.insert(planningIndicators).values({ id: "pp-indicator", objectiveId: "pp-objective", name: "Indicador PP", unit: "%", baselineValue: 0.125, targetValue: 99.5 });
  const common = { instrumentId: ppa, year: 2026, budgetUnitId: unitId, resourceSourceId: "pp-source", originalValue: new Decimal("90071992547409.91") };
  await db.insert(planningLines).values({ ...common, id: "pp-line-r", kind: "REVENUE", code: "R", description: "Receita ' OR '1'='1' --", revenueNatureId: "pp-revenue", classificationSnapshot: null });
  await db.insert(planningLines).values({ ...common, id: "pp-line-e", kind: "EXPENSE", code: "E", description: "Despesa PP", expenseNatureId: "pp-expense", programId: "pp-program", actionId: "pp-action", functionCode: "12", subfunctionCode: "361", product: "Produto PP", productUnit: "un", physicalTarget: new Decimal("12345678901234.1234"), originalPhysicalTarget: new Decimal("2.0001"), classificationSnapshot: { versionId: "pp-catalog", normativeReference: "Norma PP preservada", source: { code: "PP.NORMA", name: "Fonte PP normativa" }, revenue: null, expense: { id: "pp-expense", code: "3.3.90.30", name: "Elemento preservado" }, tree: [{ kind: "EXPENSE", code: "3.3.90.30", name: "Elemento preservado", parentCode: null, degree: 6 }] } });
  for (let index = 0; index < 23; index++) await db.insert(planningLines).values({ ...common, id: `pp-page-${String(index).padStart(2, "0")}`, kind: "REVENUE", code: `Z${String(index).padStart(2, "0")}`, description: `Linha paginada ${index}`, revenueNatureId: "pp-revenue", originalValue: new Decimal("0"), budgetUnitId: index === 22 ? "pp-unit-other" : unitId });
  for (const suffix of ["legacy", "bound", "denied"]) await db.insert(planningAppropriations).values({ id: `pp-appropriation-${suffix}`, code: `PP.${suffix}`, financialYearId: "pp-year", budgetUnitId: suffix === "denied" ? "pp-unit-other" : unitId, expenseNatureId: "pp-expense", resourceSourceId: "pp-source", initialValue: 0.125, initialValueDecimal: null });
  await db.insert(planningLines).values({ ...common, instrumentId: loa, id: "pp-loa-bound", code: "PP.BOUND", kind: "EXPENSE", description: "Dotação reconciliada", expenseNatureId: "pp-expense", programId: "pp-program", actionId: "pp-action", appropriationId: "pp-appropriation-bound", originalValue: new Decimal("0") });
  await db.insert(planningInstrumentSources).values({ instrumentId: ppa, resourceSourceId: "pp-source" });
  await db.insert(planningMovements).values([{ id: "pp-move", lineId: "pp-line-r", effectiveAt: start, value: new Decimal("0.09"), reason: "Ato preservado", legalText: "Texto legal", legalActNumber: "PP.1", createdById: actor, idempotencyKey: "pp-move-key", createdAt: instant }, { id: "pp-future", lineId: "pp-line-r", effectiveAt: new Date("2026-12-31"), value: new Decimal("7"), reason: "Ato futuro", legalText: "Texto legal", legalActNumber: "PP.2", createdById: actor, idempotencyKey: "pp-future-key", createdAt: instant }]);
  await db.insert(planningPhysicalEvents).values({ id: "pp-physical", lineId: "pp-line-e", effectiveAt: start, target: new Decimal("3.0001"), actual: new Decimal("1.0001"), reason: "Realizado", submissionKey: "pp-physical-key", createdById: actor, createdAt: instant });
  await db.insert(planningQuotas).values({ id: "pp-quota", lineId: "pp-line-e", month: 1, planned: new Decimal("100"), disbursementPlanned: new Decimal("80"), consumed: new Decimal("20"), method: "TWELFTHS", calculation: { initialPlanned: "100.00", initialDisbursement: "80.00", generatedAt: start.toISOString(), ...snapshotJson } });
  for (const [index, type, value] of [[1, "CONSUME", "20"], [2, "BLOCK", "5"], [3, "PAY", "3"], [4, "RELEASE", "2"]] as const) await db.insert(planningQuotaEvents).values({ id: `pp-event-${index}`, quotaId: "pp-quota", type, value: new Decimal(value), reason: "Evento PP", submissionKey: `pp-event-key-${index}`, effectiveAt: start, createdById: actor, createdAt: new Date(instant.valueOf() + index) });
  await db.insert(planningMemories).values({ id: "pp-memory", instrumentId: ppa, title: "Memória PP", normativeReference: "Norma PP", methodology: "Método", assumptions: "Premissas", baseValue: new Decimal("0.01"), rate: new Decimal("1.123456"), resultValue: new Decimal("0.01"), calculation: snapshotJson, createdById: actor, createdAt: instant });
  await db.insert(planningWaivers).values({ id: "pp-waiver", instrumentId: ppa, year: 2026, description: "Renúncia PP", legalReference: "Norma PP", modality: "ISENÇÃO", estimatedValue: new Decimal("5"), compensation: "Medida PP", compensationValue: new Decimal("5"), methodology: "Método PP", createdById: actor });
  await db.insert(planningPlannedWorks).values({ id: "pp-work", instrumentId: ppa, title: "Obra PP", type: "WORK", location: "Local PP", legalReference: "Norma PP", year: 2026, value: new Decimal("0.01"), startsAt: start, createdById: actor });
  await db.insert(planningAnnualPrograms).values({ instrumentId: ppa, programId: "pp-program", year: 2026, priority: null });
  await db.insert(planningPriorities).values({ budgetGuidelineId: "pp-guideline", description: "Prioridade PP", targetValue: null });
  await db.insert(planningRisks).values({ budgetGuidelineId: "pp-guideline", description: "Risco PP", estimatedImpact: new Decimal("0.01"), mitigation: "Mitigação" });
  await db.insert(planningHearings).values({ id: "pp-hearing", instrumentId: ppa, title: "Audiência PP", heldAt: instant, location: "Local PP", minutes: null, createdById: actor });
  await db.insert(mappings.pageDemands).values([{ id: "pp-demand", hearingId: "pp-hearing", requesterName: "Pessoa PP", neighborhood: "Bairro PP", request: "Pedido íntegro", responsibleUnitId: unitId, createdAt: instant }, { id: "pp-demand-denied", hearingId: "pp-hearing", requesterName: "Pessoa", neighborhood: "Bairro", request: "Fora da UG", responsibleUnitId: "pp-unit-other" }]);
  await db.insert(documentClasses).values({ id: "pp-class", code: "PLANNING.PP", label: "Classe PP" });
  await db.insert(documents).values({ id: "pp-document", title: "Modelo PP", documentType: `PLANEJAMENTO:${entityId}:ANNEX`, status: "Válido", fileUrl: "https://example.test/planning", createdAt: instant });
  await db.insert(documentVersions).values({ id: "pp-document-version", documentId: "pp-document", versionNumber: 1, fileUrl: "https://example.test/planning-v1", hashSha256: "a".repeat(64), status: "FINAL" });
  await db.insert(planningDocumentLinks).values({ id: "pp-link", instrumentId: ppa, hearingId: "pp-hearing", documentId: "pp-document", documentVersionId: "pp-document-version", purpose: "ANNEX", targetKey: "ANNEX:pp-hearing", createdById: actor, createdAt: instant });
  await db.insert(legislatures).values({ id: "pp-legislature", numero: 989, inicio: start, fim: end });
  await db.insert(councilors).values({ id: "pp-councilor", nomeCompleto: "Vereador PP", nomeParlamentar: "PP", legislaturaId: "pp-legislature" });
  await db.insert(mappings.pageAmendments).values([{ id: "pp-amendment", instrumentId: ppa, number: "PP.A1", date: start, objective: "Objetivo PP", justification: "Justificativa PP", councilorId: "pp-councilor", legalText: "Texto PP", createdById: actor }, { id: "pp-amendment-denied", instrumentId: ppa, number: "PP.A2", date: start, objective: "Restrita", justification: "Justificativa", councilorId: "pp-councilor", legalText: "Texto", createdById: actor }]);
  await db.insert(mappings.pageAmendmentItems).values([{ id: "pp-amendment-item", amendmentId: "pp-amendment", lineId: "pp-line-e", value: new Decimal("0.01"), sanctioned: null }, { id: "pp-amendment-denied-item", amendmentId: "pp-amendment-denied", lineId: "pp-page-22", value: new Decimal("0.01") }]);
  for (const suffix of ["ok", "denied", "empty"]) {
    await db.insert(financeCreditRequests).values({ id: `pp-request-${suffix}`, number: `PP.CR.${suffix}`, financialYearId: "pp-year", type: "Suplementar", justification: "Justificativa PP", totalValue: new Decimal("0.01"), requestedById: actor });
    await db.insert(planningCreditBatches).values({ id: `pp-credit-${suffix}`, instrumentId: ppa, creditRequestId: `pp-request-${suffix}`, origin: "SURPLUS", originEvidence: "Evidência PP", originLimit: new Decimal("0.01"), createdById: actor, submissionKey: `pp-credit-key-${suffix}`, createdAt: instant });
    if (suffix !== "empty") await db.insert(planningCreditLines).values({ id: `pp-credit-item-${suffix}`, batchId: `pp-credit-${suffix}`, lineId: suffix === "ok" ? "pp-line-e" : "pp-page-22", value: new Decimal("0.01") });
  }
}

test("Planning pages: Neon/Drizzle real, SQL histórico e fixture independente", { timeout: 180_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase(), connection = fixture.connection, db = connection.db;
  try {
    const client = await connection.pool.connect();
    try { await runDatabaseMigrations({ query: client.query.bind(client), exec: (text: string) => client.query(text) }, loadMigrationSet(), { command: "replay" }); } finally { client.release(); }
    await seed(connection);
    const context = fixtureContext(connection), admin = fixtureContext(connection, true), full = fixtureContext(connection, false, [unitId, "pp-unit-other"]);

    await t.test("ente/UG/jurisdição, projeções completas, limites e paginação", async () => {
      assert.deepEqual((await pageEntities(db, context, false)).entities.map(row => row.id), [entityId]);
      assert.ok(!(await pageEntities(db, admin, true)).entities.some(row => ["pp-entity-leg", "pp-entity-inactive"].includes(row.id)));
      assert.deepEqual(await pageUnitOptions(db, context), [{ id: unitId, name: "Unidade PP a" }]);
      assert.equal((await pageInstrument(db, context, loa)).parent?.parent?.id, ppa);
      await assert.rejects(pageInstrument(db, context, "pp-other"));
      const imported = await pageImports(db, context, { sourceId: ppa, page: "999" }); assert.equal(imported.total, 24); assert.equal(imported.page, 2); assert.deepEqual(imported.records.map(row => row.code), ["Z18", "Z19", "Z20", "Z21"]);
      assert.equal(imported.records[0].originalValue.toFixed(2), "0.00");
      const line = (await pageReportLines(db, context, ppa, {})).find(row => row.id === "pp-line-e"); assert.ok(line); assert.equal(line.physicalTarget.toFixed(4), "12345678901234.1234"); assert.equal(line.createdAt instanceof Date, true); assert.equal(line.program?.objectives[0].indicators[0].baselineValue, 0.125);
      assert.equal((await pagePrograms(db, "pp-canonical"))[0].actions[0].id, "pp-action");
      assert.ok((await pageParentOptions(db, context, "PPA")).some(row => row.id === ppa));
      assert.ok((await pageCounterparties(db, entityId)).every(row => row.id !== entityId));
      assert.equal((await pagePeers(db, context, ppa, entityId)).length, 2);
      assert.deepEqual(await pagePredecessors(db, context, { governmentEntityId: entityId, startYear: 2026 }), []);
      assert.deepEqual(await pageLegacy(db, context, "pp-year", entityId), { legacyTotal: 1, legacyPage: 1, legacy: [{ id: "pp-appropriation-legacy", code: "PP.legacy", budgetUnit: { name: "Unidade PP a" } }] });
    });

    await t.test("catálogos, Decimal de rateio, versões MSC e relações opcionais", async () => {
      const catalog = await pageCanonicalCatalog(db, "revenue", { q: "Receita PP" }); assert.equal(catalog.total, 1);
      const row = catalog.records[0]; assert.ok("planningAllocations" in row); assert.equal(row.planningAllocations[0].percentage.toFixed(6), "100.000000"); assert.equal(row.planningAllocations[0].resourceSource.name, "Fonte canônica PP");
      assert.ok((await pageCanonicalCatalog(db, "source", { q: "PP.FONTE" })).records[0].createdAt instanceof Date);
      assert.equal((await pageCanonicalCatalog(db, "expense", { q: "PP.DESPESA" })).total, 1);
      assert.equal((await pageCanonicalCatalog(db, "source", { q: "' OR true --" })).total, 0);
      assert.ok((await pageClassifiers(db)).sources.some(row => row.id === "pp-source"));
      const refs = await pageReferences(db, context, { q: "Fixture PP", versionId: "pp-catalog" }); assert.equal(refs.total, 1); assert.equal(refs.entries[0].canonicalId, "pp-source"); assert.equal(refs.selected?.createdAt instanceof Date, true);
      assert.equal((await pageReferences(db, context, { versionId: "pp-msc" })).selected, null);
      assert.ok((await pagePublishedCatalogs(db, { startYear: 2026, endYear: 2029 })).some(row => row.id === "pp-catalog"));
    });

    await t.test("lookups: todos os campos, catálogo fixado, códigos versus IDs e escopo JSON", async () => {
      for (const field of planningLookupFields) { const result = await planningLookup(context, { field, instrumentId: ppa, catalogKind: "SOURCE", canonicalId: "pp-source" }); assert.ok(Array.isArray(result.options), field); assert.equal(typeof result.total, "number", field); }
      assert.deepEqual((await planningLookup(context, { field: "governmentEntityId" })).options, [{ id: entityId, name: "Ente PP a" }]);
      assert.deepEqual((await planningLookup(context, { field: "resourceSourceId", instrumentId: ppa })).options, [{ id: "pp-source", name: "PP.NORMA · Fonte PP normativa" }]);
      assert.equal((await planningLookup(context, { field: "sourceCodes", instrumentId: ppa })).options[0].id, "PP.FONTE");
      assert.equal((await planningLookup(context, { field: "programId", instrumentId: loa })).options[0].id, "pp-program");
      assert.equal((await planningLookup(context, { field: "programCodes", instrumentId: ppa })).options[0].id, "PP.PROG");
      assert.equal((await planningLookup(context, { field: "lineId", instrumentId: ppa, q: "' OR '1'='1' --" })).total, 1);
      assert.equal((await planningLookup(context, { field: "lineCodes", instrumentId: ppa, q: "Receita '" })).options[0].id, "R");
      assert.deepEqual((await planningLookup(context, { field: "selectedCodes", instrumentId: ppa, amendmentId: "pp-amendment" })).options.map(row => row.id), ["E"]);
      assert.deepEqual((await planningLookup(context, { field: "predecessorEntryId", catalogKind: "SOURCE", canonicalId: "pp-source" })).options.map(row => row.id), ["pp-entry"]);
      assert.deepEqual((await planningLookup(context, { field: "predecessorEntryId", catalogKind: "SOURCE", canonicalId: "pp-json-source" })).options.map(row => row.id), ["pp-json-entry-unit"]);
      const editions = await planningLookup(context, { field: "catalogVersionId", q: "JSON PP" }); assert.deepEqual(editions.options.map(row => row.id), ["pp-json-denied", "pp-json-unit"]);
      assert.ok((await planningLookup(context, { field: "catalogVersionId", q: "Fixture PP vigente" })).options.some(row => row.id === "pp-catalog"));
      const denied = fixtureContext(connection, false, []); assert.equal((await planningLookup(denied, { field: "budgetUnitId" })).total, 0);
      await assert.rejects(planningLookup(context, { field: "instrumentId", instrumentId: "pp-other" }));
    });

    await t.test("audiência/GED e every em emenda/crédito incluindo lote vazio", async () => {
      const hearing = await pageHearings(db, context, { hearingId: "pp-hearing" }); assert.equal(hearing.total, 1); assert.equal(hearing.demands[0].opinion, null); assert.equal(hearing.hearings[0].heldAt.toISOString(), instant.toISOString()); assert.deepEqual(hearing.hearings[0].documentLinks, [{ id: "pp-link", purpose: "ANNEX", document: { title: "Modelo PP" } }]);
      assert.ok((await pageDocumentClasses(db)).some(row => row.code === "PLANNING.PP"));
      const docs = await pageDocuments(db, ppa, entityId, 1); assert.equal(docs.links[0].document.createdAt.toISOString(), instant.toISOString()); assert.equal(docs.links[0].hearing?.minutes, null);
      assert.ok((await pageSigners(db)).some(row => row.id === actor)); assert.ok((await pageCouncilors(db)).some(row => row.id === "pp-councilor"));
      assert.equal((await pageAmendmentList(db, context, ppa, 1)).total, 1); assert.equal((await pageAmendmentList(db, context, ppa, 1)).records[0].items[0].sanctioned, null);
      assert.deepEqual((await pageCredits(db, context, ppa, 1)).records.map(row => row.id), ["pp-credit-empty", "pp-credit-ok"]);
      assert.deepEqual(await pageLegislativeLinks(db, ppa), []);
      const quota = await pageQuotaList(db, context, ppa); assert.deepEqual(quota.quotas[0].events.map(row => row.type), ["CONSUME", "BLOCK", "PAY"]); assert.deepEqual(quota.quotas[0].calculation, { initialPlanned: "100.00", initialDisbursement: "80.00", generatedAt: start.toISOString(), ...snapshotJson });
      assert.equal((await pageManagementLines(db, context, ppa, "999")).linePage, 2);
      const options = await pageReportOptions(db, context, ppa); assert.equal(options.dimensions.filter(row => row.program).length, 1); assert.equal(options.credits.length, 2);
    });

    await t.test("todas as entidades de manutenção, valores exatos e null sem coerção", async () => {
      const piece = await pageInstrument(db, context, ppa), options = await pageMaintenanceOptions(db, "pp-canonical"); assert.equal(options.actions[0].id, "pp-action");
      for (const entity of ["PROGRAM", "ACTION", "OBJECTIVE", "INDICATOR", "LINE", "MEMORY", "WAIVER", "WORK", "ANNUAL_PROGRAM"]) { const result = await pageMaintenanceRecords(db, context, piece, "pp-canonical", entity, {}, options.programs); assert.ok(result.total > 0, entity); }
      const memory = await pageMaintenanceRecords(db, context, piece, "pp-canonical", "MEMORY", {}, options.programs); assert.equal(memory.records[0].values.rate, "1.123456"); assert.equal(memory.records[0].values.createdAt, "2026-10-28"); assert.ok(!("calculation" in memory.records[0].values));
      const line = await pageMaintenanceRecords(db, context, piece, "pp-canonical", "LINE", { q: "Despesa PP" }, options.programs); assert.equal(line.records[0].values.originalValue, "90071992547409.91");
      const ldoPiece = await pageInstrument(db, context, ldo); assert.equal((await pageMaintenanceRecords(db, context, ldoPiece, "pp-canonical", "PRIORITY", {}, options.programs)).total, 1); assert.equal((await pageMaintenanceRecords(db, context, ldoPiece, "pp-canonical", "RISK", {}, options.programs)).total, 1);
      assert.equal((await pageWaiverOptions(db, ppa))[0].description, "Renúncia PP");
    });

    await t.test("relatórios: precisão, corte, quotas, cada família, layout e isolamento de leitura", async () => {
      const filters = { instrumentIds: ppa, type: "REVENUE", asOf: "2026-10-01", year: 2026 };
      const revenue = await generatePlanningReport(context, filters); assert.equal(revenue.sections[0].rows[0].atualizado, "90071992547410.00");
      const physical = await generatePlanningReport(context, { ...filters, type: "PHYSICAL_ACTION" }); assert.equal(physical.sections[0].rows[0].prevista, "3.0001");
      const quota = await generatePlanningReport(context, { ...filters, type: "QUOTAS" }); assert.equal(quota.sections[0].rows[0].disponível, "77.00");
      assert.equal((await pageReportPieces(db, context, [ppa]))[0].memories[0].createdAt.toISOString(), instant.toISOString());
      assert.equal((await pageReportPrograms(db, await pageInstrument(db, context, loa)))[0].id, "pp-program");
      await assert.rejects(generatePlanningReport(context, { ...filters, year: 2030 }), /vigência/); await assert.rejects(generatePlanningReport(context, { ...filters, instrumentIds: "pp-other" }), /escopo/);
      for (const type of ["MDE", "HEALTH", "PERSONNEL", "RCL"]) await db.insert(planningFiscalRules).values({ instrumentId: ppa, type, normativeReference: "Norma PP", definition: { revenueCodes: ["R"], expenseCodes: ["E"], threshold: "15", comparison: "MINIMUM" }, updatedById: actor });
      for (const report of planningReportCatalog) { const result = await generatePlanningReport(context, { ...filters, type: report.type, creditId: "pp-credit-ok", targetId: ldo }); assert.ok(result.sections.length, report.type); }
      // One real PostgreSQL transaction and its executor flow through every
      // nested read. A writer accidentally hidden in a loader fails READ ONLY.
      await db.transaction(async tx => { const scoped = { ...context, database: tx }; assert.equal(pageDatabase(scoped), tx); await generatePlanningReport(scoped, filters); assert.equal((await tx.execute<{ value: string }>(sql`SELECT current_setting('transaction_read_only') AS value`)).rows[0].value, "on"); }, { accessMode: "read only", isolationLevel: "repeatable read" });
      const rollback = new Error("Rollback intencional do cenário de executor");
      await assert.rejects(db.transaction(async tx => {
        await tx.insert(planningMovements).values({ lineId: "pp-line-r", effectiveAt: start, value: new Decimal("0.01"), reason: "Ainda não commitado", legalText: "Texto", legalActNumber: "PP.TX", createdById: actor, idempotencyKey: "pp-uncommitted" });
        const uncommitted = await generatePlanningReport({ ...context, database: tx }, filters);
        assert.equal(uncommitted.sections[0].rows[0].atualizado, "90071992547410.01");
        throw rollback;
      }, { isolationLevel: "repeatable read" }), error => error === rollback);
      assert.deepEqual(await db.select({ id: planningMovements.id }).from(planningMovements).where(eq(planningMovements.idempotencyKey, "pp-uncommitted")), []);
      const ruleId = await configurePlanningFiscalReport(full, { instrumentId: ppa, type: "HEALTH", normativeReference: "Norma atualizada PP", revenueCodes: "R", expenseCodes: "E" }); assert.ok(ruleId);
      const workId = await addPlanningWork(full, { instrumentId: ppa, title: "Conservação criada", type: "CONSERVATION", location: "Local", legalReference: "Norma", year: 2026, value: "0.01" }); assert.equal((await db.select().from(planningPlannedWorks).where(eq(planningPlannedWorks.id, workId)))[0].conservationValue.toFixed(2), "0.01");
      const layout = await configurePlanningReportLayout(admin, { instrumentId: ppa, type: "REVENUE", linkId: "pp-link", title: "Edição PP", normativeReference: "Norma PP do modelo", footnotes: "Notas preservadas" }); assert.ok(layout); const rendered = await generatePlanningReport(context, filters); assert.equal(rendered.title, "Edição PP"); assert.equal(rendered.sections.at(-1)?.rows[0].hashModelo, "a".repeat(64));
    });

    await t.test("snapshot repetível, versão histórica, autorização integral e hash", async () => {
      const filters = { instrumentIds: ppa, type: "REVENUE", asOf: "2026-10-01" };
      const preserved = await persistPlanningReport(context, filters); assert.ok(preserved.createdAt instanceof Date); assert.equal(contentHash(preserved.dataset), preserved.hash);
      await connection.db.transaction(async tx => { await snapshotVersion(tx, full, ppa, start, "PP.Ato", "Versão de teste"); });
      const historical = await generatePlanningReport(context, { ...filters, version: 1 }); assert.equal(historical.sections[0].rows[0].atualizado, "90071992547410.00");
      assert.ok((await pageVersions(db, ppa, 1)).versions[0].effectiveAt instanceof Date);
      const before = (await readPreservedPlanningReport(context, preserved.id)).dataset;
      await db.insert(planningMovements).values({ lineId: "pp-line-r", effectiveAt: start, value: new Decimal("1"), reason: "Novo ato", legalText: "Texto", legalActNumber: "PP.3", createdById: actor, idempotencyKey: "pp-after-snapshot" });
      assert.deepEqual((await readPreservedPlanningReport(context, preserved.id)).dataset, before);
      await assert.rejects(readPreservedPlanningReport(fixtureContext(connection, false, []), preserved.id));
      const fullSnapshot = await persistPlanningReport(full, filters); await assert.rejects(readPreservedPlanningReport(context, fullSnapshot.id), /unidades/);
      await assert.rejects(db.update(mappings.pageReportSnapshots).set({ hash: "0".repeat(64) }).where(eq(mappings.pageReportSnapshots.id, preserved.id)), error => error instanceof Error && error.cause instanceof Error && /imut|immutable|preserv/i.test(error.cause.message));
    });

    await t.test("publicação: bytes/headers exatos, 404, integridade 423 e falha 503", async () => {
      const snapshot = await persistPlanningReport(context, { instrumentIds: ppa, type: "REVENUE", asOf: "2026-10-01" });
      const bytes = new TextEncoder().encode("arquivo PP preservado"), hash = createHash("sha256").update(bytes).digest("hex");
      await db.execute(sql`INSERT INTO "PlanningReportPublication" (id,"snapshotId",format,"publicKey",status,"fileUrl","fileHash",filename,"contentType",title,"requestedById",reason,"publishedAt","updatedAt") VALUES ('pp-publication',${snapshot.id},'CSV','pp-public-key','PUBLISHED','local://pp',${hash},'planejamento.csv','text/csv; charset=utf-8','PP',${actor},'Fixture de publicação',${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC',${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`);
      const store = { async put() { return "local://pp"; }, async get() { return bytes; } };
      const response = await publicPlanningPublicationResponse(db, "pp-public-key", store); assert.equal(response.status, 200); assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8"); assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="planejamento.csv"'); assert.equal(response.headers.get("X-Report-File-SHA256"), hash); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(response.headers.get("X-Planning-Completeness"), "REVIEW_COPY_NOT_STATUTORY"); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
      assert.equal((await publicPlanningPublicationResponse(db, "missing", store)).status, 404);
      assert.equal((await publicPlanningPublicationResponse(db, "pp-public-key", { ...store, async get() { return new Uint8Array([0]); } })).status, 423);
      assert.equal((await publicPlanningPublicationResponse(db, "pp-public-key", { ...store, async get() { throw new Error("storage"); } })).status, 503);
      await db.execute(sql`UPDATE "PlanningReportPublication" SET status='WITHDRAWN',"withdrawnAt"=${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC' WHERE id='pp-publication'`);
      assert.equal((await publicPlanningPublicationResponse(db, "pp-public-key", store)).status, 404);
    });
    assert.equal((await db.select().from(planningVersions).where(and(eq(planningVersions.instrumentId, ppa), eq(planningVersions.number, 1)))).length, 1);
    assert.deepEqual(jsonValue(snapshotJson), snapshotJson);
  } finally { await fixture.close(); }
});
