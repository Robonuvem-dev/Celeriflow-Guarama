import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import type { DatabaseConnection } from "../src/db/connection";
import { secretariats } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { governmentEntities } from "../src/db/schema/master-data";
import { financialYears } from "../src/db/schema/finance-years";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { budgetReservations, budgetMovements } from "../src/db/schema/finance-budget";
import { financeCreditRequests } from "../src/db/schema/finance-legacy-budget";
import { monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { revenues, revenueReversals } from "../src/db/schema/finance-revenues";
import { councilors, laws, legislatures, propositions } from "../src/db/schema/chamber";
import { planningAppropriations, planningBudgetLaws, planningBudgetUnits, planningCreditBatches, planningCreditLines, planningEntityScopes, planningEntityUnits, planningGuidelines, planningInstruments, planningLines, planningMovements, planningMultiYearPlans, planningQuotaEvents, planningQuotas } from "../src/db/schema/planning-budget";
import { planningActions, planningAnnualPrograms, planningCatalogEntries, planningCatalogVersions, planningExpenseNatures, planningFiscalRules, planningFixations, planningForecasts, planningIndicators, planningInstrumentSources, planningIntegrationCommands, planningLegislativeLinks, planningMemories, planningObjectives, planningPrograms, planningResourceSources, planningRevenueNatures, planningVersions, planningWaivers } from "../src/db/schema/planning-legal";
import { executionBenefitGrants } from "../src/db/schema/planning-execution-operations";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAssessments, taxGuides, taxes } from "../src/db/schema/taxation-core";
import { taxFinancialMappings } from "../src/db/schema/tax-accounting";
import { pageBenefitRules } from "../src/db/schema/taxation-pages";
import { taxpayers } from "../src/db/schema/registry";
import type { PermissionUser } from "../src/lib/contracts/identity";
import type { PlanningContext } from "../src/lib/planejamento/access";
import { planningOperationObject } from "../src/lib/contracts/planning-execution-operations";
import { configureMunicipalActivityRelation, readMunicipalServiceRelationships } from "../src/lib/planejamento/activity-relations";
import { linkPlanningLegislativeProcedure, advancePlanningLegislativeProcedure } from "../src/lib/planejamento/legislative-bridge";
import { projectPlanningAnnualMemory } from "../src/lib/planejamento/projections";
import { planningDateSchema, registerPlanningMovement, getPlanningMovementHistory } from "../src/lib/planejamento/revisions";
import { distributePlanningMonths, generatePlanningSchedule, planningQuotaEvent, contingencyPlanningBudget, redistributePlanningQuotas } from "../src/lib/planejamento/scheduling";
import { copyPlanningYearConfiguration } from "../src/lib/planejamento/year-rollover";
import { readPlanningRclExecution, readPlanningWaiverRealization, synchronizePlanningWaiver } from "../src/lib/planejamento/fiscal-execution";
import { contentHash, lockLegalInstrument } from "../src/lib/planejamento/operations-core";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

const instant = new Date("2026-03-01T12:34:56.789Z");
const moduleCodes = ["PLANEJAMENTO", "FINANCEIRO", "TRIBUTACAO", "CAMARA"];
function contextFor(connection: DatabaseConnection, allowedBudgetUnitIds = ["eo-unit"], actor = "eo-author"): PlanningContext {
  const permissions = JSON.stringify({ modules: Object.fromEntries(moduleCodes.map(code => [code, { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: true, legalApproval: true }])) });
  const user: PermissionUser = { id: actor, firebaseUid: actor, name: actor, email: `${actor}@execution.invalid`, role: "Planejamento", profileCode: "EO_LEGAL", permissions, modulePermissions: moduleCodes.map(code => ({ code, canView: true, canEdit: true })), allowedBudgetUnitIds, employeeId: null, departmentId: null, secretariatId: null };
  return { user, jurisdiction: "EXECUTIVE", connection, database: connection.db };
}

async function fixture() {
  const local = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) {
      try { await local.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8")); }
      catch (cause) { throw new Error(`Replay SQL de execução/planejamento: ${name}`, { cause }); }
    }
    const db = local.connection.db, context = contextFor(local.connection);
    await db.insert(accessProfiles).values({ id: "eo-profile", codigo: "EO_LEGAL", nome: "Execução municipal", permissoes: "{}" });
    await db.insert(users).values(["author", "reviewer", "authority"].map(role => ({ id: `eo-${role}`, nome: role, email: `eo-${role}@execution.invalid`, perfilId: "eo-profile" })));
    await db.insert(secretariats).values({ id: "eo-secretariat", name: "Secretaria da fixture execution-operations" });
    await db.insert(governmentEntities).values([{ id: "eo-entity", code: "EO", name: "Executivo EO", type: "PREFEITURA" }, { id: "eo-other", code: "EOX", name: "Outro ente EO", type: "PREFEITURA" }, { id: "eo-legislative", code: "EOL", name: "Câmara EO", type: "CAMARA" }]);
    await db.insert(planningEntityScopes).values([{ governmentEntityId: "eo-entity", jurisdiction: "EXECUTIVE" }, { governmentEntityId: "eo-other", jurisdiction: "EXECUTIVE" }, { governmentEntityId: "eo-legislative", jurisdiction: "LEGISLATIVE" }]);
    for (const [name, entity] of [["unit", "entity"], ["restricted", "entity"], ["other-unit", "other"], ["legislative-unit", "legislative"]]) {
      await db.insert(planningBudgetUnits).values({ id: `eo-${name}`, code: `EO.${name}`, name, secretariatId: "eo-secretariat" });
      await db.insert(planningEntityUnits).values({ budgetUnitId: `eo-${name}`, governmentEntityId: `eo-${entity}` });
    }
    await db.insert(planningResourceSources).values([{ id: "eo-source", code: "EO.500", name: "Fonte EO" }, { id: "eo-source-2", code: "EO.600", name: "Outra fonte EO" }]);
    await db.insert(planningRevenueNatures).values({ id: "eo-revenue", code: "EO.REC", name: "Receita EO", degree: 6, referenceYear: 2026 });
    await db.insert(planningExpenseNatures).values({ id: "eo-expense", code: "EO.DESP", name: "Despesa EO" });
    async function year(year: number, entityId = "eo-entity") {
      const id = `${entityId}:${year}`;
      await db.insert(financialYears).values({ id, governmentEntityId: entityId, year, status: "Aberto", startDate: new Date(`${year}-01-01T00:00:00.000Z`), endDate: new Date(`${year}-12-31T23:59:59.999Z`) }).onConflictDoNothing();
      return id;
    }
    async function chain(prefix: string, fiscalYear = 2026, entityId = "eo-entity") {
      const financialYearId = await year(fiscalYear, entityId), ppaId = `${prefix}:ppa`, guidelineId = `${prefix}:ldo`, lawId = `${prefix}:loa`;
      await db.insert(planningMultiYearPlans).values({ id: ppaId, code: ppaId, name: prefix, startYear: fiscalYear, endYear: fiscalYear + 3, status: "DRAFT" });
      await db.insert(planningGuidelines).values({ id: guidelineId, financialYearId, multiYearPlanId: ppaId, status: "DRAFT" });
      await db.insert(planningBudgetLaws).values({ id: lawId, lawNumber: lawId, financialYearId, budgetGuidelineId: guidelineId, totalRevenue: new Decimal("0"), totalExpense: new Decimal("0"), status: "DRAFT", metadata: { planningInternalExecution: false, planningInternalAccounting: false, nested: [null, "001.00"] } });
      const ppa = `${prefix}:piece-ppa`, ldo = `${prefix}:piece-ldo`, loa = `${prefix}:piece-loa`, common = { governmentEntityId: entityId, title: prefix, startYear: fiscalYear, createdById: context.user.id };
      await db.insert(planningInstruments).values([{ ...common, id: ppa, kind: "PPA", code: ppa, endYear: fiscalYear + 3, multiYearPlanId: ppaId }, { ...common, id: ldo, kind: "LDO", code: ldo, endYear: fiscalYear, parentId: ppa, budgetGuidelineId: guidelineId }, { ...common, id: loa, kind: "LOA", code: loa, endYear: fiscalYear, parentId: ldo, annualBudgetLawId: lawId }]);
      const programId = `${prefix}:program`, actionId = `${prefix}:action`;
      await db.insert(planningPrograms).values({ id: programId, multiYearPlanId: ppaId, code: "001", name: "Programa EO" });
      await db.insert(planningObjectives).values({ id: `${prefix}:objective`, programId, code: "01", description: "Objetivo EO" });
      await db.insert(planningIndicators).values({ objectiveId: `${prefix}:objective`, name: "Cobertura EO", unit: "%", baselineValue: 0.125, targetValue: 99.875 });
      await db.insert(planningActions).values({ id: actionId, programId, code: "1001", name: "Ação EO" });
      return { prefix, year: fiscalYear, financialYearId, ppaId, guidelineId, lawId, ppa, ldo, loa, programId, actionId };
    }
    async function line(piece: Awaited<ReturnType<typeof chain>>, code = "E", options: { kind?: "REVENUE" | "EXPENSE"; instrumentId?: string; unitId?: string; value?: string; appropriation?: boolean; sourceId?: string } = {}) {
      const id = `${piece.prefix}:${code}`, kind = options.kind ?? "EXPENSE", value = new Decimal(options.value ?? "120.00"), budgetUnitId = options.unitId ?? "eo-unit", resourceSourceId = options.sourceId ?? "eo-source", instrumentId = options.instrumentId ?? piece.loa;
      const appropriationId = options.appropriation ? `${id}:appropriation` : null;
      if (appropriationId) await db.insert(planningAppropriations).values({ id: appropriationId, code: appropriationId, financialYearId: piece.financialYearId, budgetUnitId, resourceSourceId, expenseNatureId: "eo-expense", programPPAId: piece.programId, actionPPAId: piece.actionId, initialValue: value.toNumber(), updatedValue: value.toNumber(), initialValueDecimal: value, updatedValueDecimal: value, committedValueDecimal: new Decimal("0") });
      await db.insert(planningLines).values({ id, instrumentId, code, description: `Previsão EO ${code}`, kind, year: piece.year, budgetUnitId, resourceSourceId, appropriationId, revenueNatureId: kind === "REVENUE" ? "eo-revenue" : null, expenseNatureId: kind === "EXPENSE" ? "eo-expense" : null, programId: kind === "EXPENSE" ? piece.programId : null, actionId: kind === "EXPENSE" ? piece.actionId : null, functionCode: kind === "EXPENSE" ? "04" : null, subfunctionCode: kind === "EXPENSE" ? "122" : null, product: "Atendimento", productUnit: "pessoa", physicalTarget: new Decimal("1.2345"), originalValue: value });
      if (instrumentId === piece.loa) {
        if (kind === "REVENUE") await db.insert(planningForecasts).values({ annualBudgetLawId: piece.lawId, code, name: code, estimatedValue: value });
        else await db.insert(planningFixations).values({ annualBudgetLawId: piece.lawId, code, name: code, fixedValue: value });
        const rows = await db.select().from(planningLines).where(eq(planningLines.instrumentId, piece.loa));
        await db.update(planningBudgetLaws).set({ totalRevenue: rows.filter(row => row.kind === "REVENUE").reduce((sum, row) => sum.plus(row.originalValue), new Decimal("0")), totalExpense: rows.filter(row => row.kind === "EXPENSE").reduce((sum, row) => sum.plus(row.originalValue), new Decimal("0")) }).where(eq(planningBudgetLaws.id, piece.lawId));
      }
      return id;
    }
    const quotas = (lineId: string) => db.select().from(planningQuotas).where(eq(planningQuotas.lineId, lineId)).orderBy(asc(planningQuotas.month));
    const actor = (id: string, allowed = ["eo-unit"]) => contextFor(local.connection, allowed, id);
    async function bank(id = "eo-bank", unit = "eo-unit") { await db.insert(reconciliationBankAccounts).values({ id, bankName: "Banco EO", agency: "0001", accountNumber: id, budgetUnitId: unit, resourceSourceId: "eo-source" }).onConflictDoNothing(); return id; }
    return { ...local, db, context, actor, chain, line, year, bank, quotas, migrationCount: migrations.length };
  } catch (error) { await local.close(); throw error; }
}

function databaseError(pattern: RegExp) {
  return (error: unknown): boolean => { for (let at = error; at instanceof Error; at = at.cause) if (pattern.test(at.message)) return true; return false; };
}

// Central integration queue: one complete historical replay, one production
// Neon/Drizzle connection family, awaited subtests and awaited transport teardown.
test("Planning execution operations: original SQL, real executor and immutable legal effects", { timeout: 240_000 }, async t => {
  const f = await fixture(), { db, context } = f;
  try {
    await t.test("all 156 migrations and the new complete projection match the physical catalog", async () => {
      assert.equal(f.migrationCount, 156);
      const table = getTableConfig(executionBenefitGrants);
      const physical = (await db.execute<{ name: string; type: string; notNull: boolean }>(sql`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS "notNull" FROM pg_attribute a WHERE a.attrelid='"TaxBenefitGrant"'::regclass AND a.attnum>0 AND NOT a.attisdropped`)).rows;
      assert.equal(table.columns.length, physical.length);
      for (const column of table.columns) {
        const found = physical.find(row => row.name === column.name); assert.ok(found, column.name);
        const normalize = (value: string) => value.replace(" without time zone", "").replaceAll(" ", "");
        assert.equal(normalize(column.getSQLType()), normalize(found.type), column.name); assert.equal(column.notNull, found.notNull, column.name);
      }
    });

    await t.test("exact cents agree with an independent integer oracle, including large values and UTC dates", () => {
      for (const cents of [BigInt("5"), BigInt("10001"), BigInt("12345678901234567")]) {
        const weights = Array.from({ length: 12 }, (_, index) => BigInt(index + 1)), sum = BigInt("78");
        const floors = weights.map(weight => cents * weight / sum), remainders = weights.map(weight => cents * weight % sum);
        const extra = Number(cents - floors.reduce((total, value) => total + value, BigInt("0")));
        const winners = [...weights.keys()].sort((a, b) => Number(remainders[b] - remainders[a]) || a - b).slice(0, extra);
        const expected = floors.map((value, at) => (value + BigInt(winners.includes(at))));
        const total = `${cents / BigInt("100")}.${String(cents % BigInt("100")).padStart(2, "0")}`;
        assert.deepEqual(distributePlanningMonths(total, weights.map(String)).map(value => BigInt(value.mul(100).toFixed(0))), expected);
      }
      assert.deepEqual(distributePlanningMonths("0.05", Array<string>(12).fill("1")).map(value => value.toFixed(2)), [...Array<string>(5).fill("0.01"), ...Array<string>(7).fill("0.00")]);
      assert.throws(() => distributePlanningMonths("1", Array<string>(12).fill("0")), /maior que zero/);
      assert.throws(() => distributePlanningMonths("1", ["-1", ...Array<string>(11).fill("1")]), /inválido/);
      assert.equal(planningDateSchema.parse("2024-02-29"), "2024-02-29"); assert.throws(() => planningDateSchema.parse("2026-02-29"));
    });

    await t.test("municipal relationships preserve explicit adoption, scope, successor intervals, JSON and audit rollback", async () => {
      async function edition(id: string, from = "2026-01-01", attributes = {}, year = 2026) {
        await db.insert(planningCatalogVersions).values({ id, year, label: id, normativeReference: "Adoção EO fundamentada", sourceHash: contentHash(id), createdById: context.user.id });
        await db.insert(planningCatalogEntries).values(["CNAE", "SERVICE"].map(kind => ({ id: `${id}:${kind}`, versionId: id, kind, code: kind, name: `${kind} EO`, canonicalId: `eo-canonical-${kind}`, degree: 1, attributes: { operational: true, pocOnly: false, governmentEntityId: "eo-entity", budgetUnitId: null, effectiveFrom: from, effectiveUntil: "2026-12-31", extra: [null, "001.00"], ...attributes } })));
        await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, id));
      }
      await edition("eo-adoption");
      const input = { governmentEntityId: "eo-entity", relationType: "CNAE_SERVICE", leftEntryId: "eo-adoption:CNAE", rightEntryId: "eo-adoption:SERVICE", reason: "Vínculo municipal documentado" };
      const id = await configureMunicipalActivityRelation(context, input); assert.equal(await configureMunicipalActivityRelation(context, input), id);
      await assert.rejects(configureMunicipalActivityRelation(context, { ...input, reason: "Outra motivação" }), /já registrada/);
      await assert.rejects(configureMunicipalActivityRelation({ ...context, jurisdiction: "LEGISLATIVE" }, input), /escopo/);
      await edition("eo-unit-adoption", "2026-01-01", { budgetUnitId: "eo-unit" });
      await assert.rejects(configureMunicipalActivityRelation(context, { ...input, leftEntryId: "eo-unit-adoption:CNAE" }), /alcance de entidade/);
      await edition("eo-july", "2026-07-01");
      const successorInput = { ...input, leftEntryId: "eo-july:CNAE", rightEntryId: "eo-july:SERVICE", supersedesEntryId: id };
      const successor = await configureMunicipalActivityRelation(context, successorInput);
      const read = (date: string) => readMunicipalServiceRelationships(db, { governmentEntityId: "eo-entity", activityId: "eo-canonical-SERVICE", date: new Date(`${date}T00:00:00.000Z`) });
      assert.deepEqual((await read("2026-06-30")).relationships.map(row => row.id), [id]);
      const current = await read("2026-07-01"); assert.deepEqual(current.relationships.map(row => row.id), [successor]); assert.equal(current.relationships[0].effectiveFrom, "2026-07-01T00:00:00.000Z");
      assert.equal((await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, successor)))[0].version, 2);
      assert.equal((await readMunicipalServiceRelationships(db, { governmentEntityId: "eo-other", activityId: "eo-canonical-SERVICE", date: instant })).status, "NOT_CONFIGURED");
      const before = (await db.select({ total: count() }).from(taxRegistryEntries))[0].total;
      await assert.rejects(configureMunicipalActivityRelation(f.actor("eo-missing"), { ...successorInput, leftEntryId: input.leftEntryId, rightEntryId: input.rightEntryId, supersedesEntryId: undefined, relationType: "CBO_SERVICE" }), /Relacione/);
      // A distinct valid pair reaches the final audit FK and must roll back its registry INSERT.
      await db.insert(planningCatalogVersions).values({ id: "eo-rollback-adoption", year: 2026, label: "Rollback", normativeReference: "Adoção de rollback", sourceHash: "eo-rollback-adoption", createdById: context.user.id });
      await db.insert(planningCatalogEntries).values([{ id: "eo-rollback-cbo", versionId: "eo-rollback-adoption", kind: "CBO", code: "CBO", name: "CBO EO", degree: 1, canonicalId: "eo-cbo", attributes: { operational: true, pocOnly: false, governmentEntityId: "eo-entity", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } }, { id: "eo-rollback-service", versionId: "eo-rollback-adoption", kind: "SERVICE", code: "SERVICE", name: "Serviço EO", degree: 1, canonicalId: "eo-service-2", attributes: { operational: true, pocOnly: false, governmentEntityId: "eo-entity", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } }]);
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "eo-rollback-adoption"));
      await assert.rejects(configureMunicipalActivityRelation(f.actor("eo-missing"), { ...input, relationType: "CBO_SERVICE", leftEntryId: "eo-rollback-cbo", rightEntryId: "eo-rollback-service" }), databaseError(/foreign key/));
      assert.equal((await db.select({ total: count() }).from(taxRegistryEntries))[0].total, before);
      const cbo = await configureMunicipalActivityRelation(context, { ...input, relationType: "CBO_SERVICE", leftEntryId: "eo-rollback-cbo", rightEntryId: "eo-rollback-service" });
      const [stored] = await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, cbo)); assert.equal(planningOperationObject(stored.data).supersedesEntryId, null);
    });

    await t.test("formal movements keep immutable originals, idempotency, canonical decree effects and atomic rollback", async () => {
      const piece = await f.chain("eo-movement"), lineId = await f.line(piece, "E", { appropriation: true });
      await generatePlanningSchedule(context, { instrumentId: piece.loa, lineId, method: "TWELFTHS", periodMonths: 2, reason: "Cronograma inicial" });
      const input = { instrumentId: piece.loa, lineId, effectiveAt: "2026-03-01", amount: "0.05", direction: "INCREASE", reason: "Motivação do ajuste legal", legalText: "Texto íntegro do decreto", legalActNumber: "Decreto 7/2026", submissionKey: randomUUID() };
      await assert.rejects(registerPlanningMovement(context, input), /sancionada ou publicada/);
      await db.update(planningBudgetLaws).set({ status: "PUBLISHED", sanctionedAt: new Date("2026-01-01"), legalActNumber: "Lei 1/2026" }).where(eq(planningBudgetLaws.id, piece.lawId));
      const id = await registerPlanningMovement(context, input); assert.equal(await registerPlanningMovement(context, input), id);
      await assert.rejects(registerPlanningMovement(context, { ...input, amount: "0.06" }), /outros dados/);
      await assert.rejects(registerPlanningMovement(f.actor("eo-reviewer"), input), /outros dados/);
      await assert.rejects(registerPlanningMovement({ ...context, jurisdiction: "LEGISLATIVE" }, input), /escopo/);
      const [line] = await db.select().from(planningLines).where(eq(planningLines.id, lineId)); assert.equal(line.originalValue.toFixed(2), "120.00"); assert.equal(line.physicalTarget.toFixed(4), "1.2345");
      assert.equal((await f.quotas(lineId)).reduce((sum, row) => sum.plus(row.planned), new Decimal("0")).toFixed(2), "120.05");
      assert.equal((await db.select().from(planningAppropriations).where(eq(planningAppropriations.id, `${lineId}:appropriation`)))[0].updatedValueDecimal?.toFixed(2), "120.05");
      assert.equal((await db.select().from(planningFixations).where(eq(planningFixations.annualBudgetLawId, piece.lawId)))[0].fixedValue.toFixed(2), "120.05");
      const [command] = await db.select().from(planningIntegrationCommands).where(eq(planningIntegrationCommands.sourceId, id)); assert.equal(command.type, "ACCOUNTING_BUDGET_CHANGE"); assert.equal(command.status, "PENDING");
      const [budgetMovement] = await db.select().from(budgetMovements).where(eq(budgetMovements.sourceId, input.submissionKey)); assert.equal(budgetMovement.justification, input.reason); assert.equal(budgetMovement.valueDecimal.toFixed(2), "0.05");
      const versions = await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.loa)).orderBy(asc(planningVersions.number));
      assert.deepEqual(versions.map(row => row.number), [1, 2]); for (const version of versions) assert.equal(version.hash, contentHash(version.snapshot));
      await assert.rejects(db.update(planningMovements).set({ reason: "Reescrita" }).where(eq(planningMovements.id, id)), databaseError(/immutable/));
      const before = contentHash({ quotas: await f.quotas(lineId), versions, instrument: await db.select().from(planningInstruments).where(eq(planningInstruments.id, piece.loa)) });
      await db.delete(planningFixations).where(eq(planningFixations.annualBudgetLawId, piece.lawId));
      await assert.rejects(registerPlanningMovement(context, { ...input, submissionKey: randomUUID() }), /canônica/);
      assert.equal(contentHash({ quotas: await f.quotas(lineId), versions: await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.loa)).orderBy(asc(planningVersions.number)), instrument: await db.select().from(planningInstruments).where(eq(planningInstruments.id, piece.loa)) }), before);
      assert.equal((await getPlanningMovementHistory(context, piece.loa)).total, 1);
    });

    await t.test("movement history keeps UG scope, 20-row pagination, tie ordering and Date/Decimal decoding", async () => {
      const piece = await f.chain("eo-history"), visible = await f.line(piece), hidden = await f.line(piece, "HIDDEN", { unitId: "eo-restricted" });
      for (let at = 0; at < 25; at++) await db.insert(planningMovements).values({ id: `eo-history-${String(at).padStart(2, "0")}`, lineId: visible, value: new Decimal("90071992547409.91"), effectiveAt: new Date("2026-01-02"), createdAt: instant, reason: "Motivação paginada", legalText: "Texto paginado", legalActNumber: "Ato EO", createdById: context.user.id, idempotencyKey: `eo-history-${at}` });
      await db.insert(planningMovements).values({ lineId: hidden, value: new Decimal("1"), effectiveAt: instant, reason: "Restrito", legalText: "Restrito", legalActNumber: "Ato restrito", createdById: context.user.id, idempotencyKey: "eo-history-hidden" });
      const result = await getPlanningMovementHistory(context, piece.loa, "999"); assert.equal(result.total, 25); assert.equal(result.page, 2); assert.deepEqual(result.records.map(row => row.id), [20, 21, 22, 23, 24].map(at => `eo-history-${at}`));
      assert.equal(result.records[0].value.toFixed(2), "90071992547409.91"); assert.equal(result.records[0].effectiveAt.toISOString(), "2026-01-02T00:00:00.000Z"); assert.equal(result.records[0].createdAt.toISOString(), instant.toISOString()); assert.equal(result.records[0].line.code, "E");
      assert.equal((await getPlanningMovementHistory(context, piece.loa, "NaN")).page, 1);
      await assert.rejects(getPlanningMovementHistory(f.actor("eo-author", []), piece.loa), /escopo/);
    });

    await t.test("legal reductions validate the full dated balance and preserve motivation, legal bounds and UG authorization", async () => {
      const piece = await f.chain("eo-movement-dates"), lineId = await f.line(piece, "R", { kind: "REVENUE", instrumentId: piece.ppa, value: "100.00" }), hidden = await f.line(piece, "HIDDEN", { kind: "REVENUE", instrumentId: piece.ppa, unitId: "eo-restricted" });
      await db.update(planningMultiYearPlans).set({ status: "PUBLISHED", sanctionedAt: new Date("2026-01-01"), legalActNumber: "Lei EO temporal" }).where(eq(planningMultiYearPlans.id, piece.ppaId));
      const movement = { instrumentId: piece.ppa, lineId, effectiveAt: "2026-01-02", amount: "50.00", direction: "DECREASE", reason: "Redução motivada EO", legalText: "Ato EO de redução", legalActNumber: "Ato EO temporal", submissionKey: randomUUID() };
      await registerPlanningMovement(context, movement);
      await registerPlanningMovement(context, { ...movement, effectiveAt: "2026-01-03", direction: "INCREASE", amount: "60.00", submissionKey: randomUUID() });
      await assert.rejects(registerPlanningMovement(context, { ...movement, amount: "60.00", submissionKey: randomUUID() }), /saldo negativo em uma data/);
      await assert.rejects(registerPlanningMovement(context, { ...movement, lineId: hidden, submissionKey: randomUUID() }), /unidades autorizadas/);
      await assert.rejects(registerPlanningMovement(context, { ...movement, amount: "0", submissionKey: randomUUID() }), /maior que zero/);
      await assert.rejects(registerPlanningMovement(context, { ...movement, effectiveAt: "2025-12-31", submissionKey: randomUUID() }), /anteceder a sanção/);
      assert.equal((await getPlanningMovementHistory(context, piece.ppa)).total, 2);
      assert.equal((await db.select().from(planningInstruments).where(eq(planningInstruments.id, piece.ppa)))[0].revision, 3);
      assert.equal((await db.select().from(planningLines).where(eq(planningLines.id, lineId)))[0].originalValue.toFixed(2), "100.00");
    });
    await t.test("schedule generation preserves both financial stages, percentages and multi-year code matching", async () => {
      const current = await f.chain("eo-schedule"), expense = await f.line(current, "E", { value: "120.05" }), revenue = await f.line(current, "R", { kind: "REVENUE", value: "100.00" });
      await generatePlanningSchedule(context, { instrumentId: current.loa, lineId: expense, method: "TWELFTHS", periodMonths: 2, effectiveAt: "2026-01-01", reason: "Duodécimos exatos" });
      const monthly = await f.quotas(expense); assert.equal(monthly.length, 12); assert.deepEqual(monthly.map(row => row.planned.toFixed(2)), [...Array<string>(5).fill("10.01"), ...Array<string>(7).fill("10.00")]);
      assert.ok(monthly.every(row => row.disbursementPlanned.equals(row.planned))); assert.equal(planningOperationObject(monthly[0].calculation).stage, "EMPENHADA");
      await assert.rejects(generatePlanningSchedule(context, { instrumentId: current.loa, lineId: expense, method: "TWELFTHS", periodMonths: 2, reason: "Regravar" }), /já existente/);
      await generatePlanningSchedule(context, { instrumentId: current.loa, lineId: revenue, method: "PERCENTAGES", periodMonths: 3, percentages: "100;0;0;0;0;0;0;0;0;0;0;0", reason: "Receita sazonal" });
      const receivables = await f.quotas(revenue); assert.equal(receivables[0].planned.toFixed(2), "100.00"); assert.ok(receivables.every(row => row.disbursementPlanned.isZero())); assert.equal(planningOperationObject(receivables[0].calculation).stage, "ARRECADADA");
      for (const year of [2023, 2024, 2025]) {
        const historical = await f.chain(`eo-season-${year}`, year), id = await f.line(historical);
        await db.insert(planningQuotas).values(Array.from({ length: 12 }, (_, at) => ({ lineId: id, month: at + 1, planned: new Decimal("100"), consumed: new Decimal(String((at + 1) * (2026 - year))), method: "HISTORICAL", calculation: { initialPlanned: "100.00", nested: [null] } })));
      }
      const priorYear = await f.line(current, "PREVIOUS", { value: "78.00" }), threeYears = await f.line(current, "THREE", { value: "78.00" });
      for (const [lineId, method] of [[priorYear, "PREVIOUS_YEAR"], [threeYears, "THREE_YEARS"]]) {
        await generatePlanningSchedule(context, { instrumentId: current.loa, lineId, method, periodMonths: 6, reason: "Histórico pelo código canônico" });
        assert.deepEqual((await f.quotas(lineId)).map(row => row.planned.toFixed(2)), Array.from({ length: 12 }, (_, at) => `${at + 1}.00`));
      }
      const otherSource = await f.line(current, "INCOMPLETE", { sourceId: "eo-source-2" });
      await assert.rejects(generatePlanningSchedule(context, { instrumentId: current.loa, lineId: otherSource, method: "PREVIOUS_YEAR", periodMonths: 2, reason: "Origem ausente" }), /Histórico mensal incompleto/);
      assert.equal((await f.quotas(otherSource)).length, 0);
      await assert.rejects(generatePlanningSchedule(context, { instrumentId: current.ppa, lineId: otherSource, method: "TWELFTHS", periodMonths: 2, reason: "Peça incompatível" }), /exige LOA/);
    });

    await t.test("quota events retain period transfers, reversals, disbursement, closure, redistribution and rollback", async () => {
      const piece = await f.chain("eo-quota"), lineId = await f.line(piece), revenueId = await f.line(piece, "R", { kind: "REVENUE" });
      for (const id of [lineId, revenueId]) await generatePlanningSchedule(context, { instrumentId: piece.loa, lineId: id, method: "TWELFTHS", periodMonths: 2, reason: "Cotas da fixture" });
      const quotas = await f.quotas(lineId), event = { instrumentId: piece.loa, quotaId: quotas[0].id, operation: "CONSUME", amount: "15.00", effectiveAt: "2026-01-15", reason: "Consumo do primeiro bimestre", submissionKey: randomUUID() };
      const origin = await planningQuotaEvent(context, event); assert.equal(await planningQuotaEvent(context, event), origin);
      const transferred = await f.quotas(lineId); assert.equal(transferred[0].planned.toFixed(2), "15.00"); assert.equal(transferred[1].planned.toFixed(2), "5.00");
      const transfers = await db.select().from(planningQuotaEvents).where(sql`starts_with(${planningQuotaEvents.submissionKey}, ${`${event.submissionKey}:`})`); assert.deepEqual(transfers.map(row => row.type).sort(), ["PERIOD_TRANSFER_IN", "PERIOD_TRANSFER_OUT"]); assert.equal(transfers.reduce((sum, row) => sum.plus(row.value), new Decimal("0")).toFixed(2), "0.00");
      const before = contentHash(await f.quotas(lineId));
      await assert.rejects(planningQuotaEvent(context, { ...event, quotaId: quotas[1].id, amount: "6.00", submissionKey: randomUUID() }), /disponibilidade do período/); assert.equal(contentHash(await f.quotas(lineId)), before);
      await planningQuotaEvent(context, { ...event, operation: "REVERSE", amount: "1.00", originEventId: origin, submissionKey: randomUUID() });
      await assert.rejects(planningQuotaEvent(context, { ...event, operation: "REVERSE", effectiveAt: "2026-01-14", amount: "1.00", originEventId: origin, submissionKey: randomUUID() }), /anteceder/);
      const payment = await planningQuotaEvent(context, { ...event, operation: "PAY", amount: "2.00", submissionKey: randomUUID() });
      await assert.rejects(planningQuotaEvent(context, { ...event, operation: "SET_DISBURSEMENT", amount: "1.99", submissionKey: randomUUID() }), /inferior/);
      await planningQuotaEvent(context, { ...event, operation: "REVERSE_PAYMENT", amount: "0.50", originEventId: payment, submissionKey: randomUUID() });
      await planningQuotaEvent(context, { ...event, operation: "SET_DISBURSEMENT", amount: "2.00", submissionKey: randomUUID() });
      const block = await planningQuotaEvent(context, { ...event, quotaId: quotas[2].id, operation: "BLOCK", amount: "2.00", submissionKey: randomUUID() });
      await planningQuotaEvent(context, { ...event, quotaId: quotas[2].id, operation: "RELEASE", amount: "1.00", originEventId: block, submissionKey: randomUUID() });
      await assert.rejects(planningQuotaEvent(context, { ...event, quotaId: quotas[2].id, operation: "RELEASE", amount: "1.01", originEventId: block, submissionKey: randomUUID() }), /saldo do evento/);
      await assert.rejects(planningQuotaEvent(context, { ...event, quotaId: (await f.quotas(revenueId))[0].id, operation: "BLOCK", amount: "1.00", submissionKey: randomUUID() }), /cota de despesa/);
      await planningQuotaEvent(context, { ...event, operation: "CLOSE", amount: "0", effectiveAt: "2026-01-31", submissionKey: randomUUID() });
      assert.equal(await planningQuotaEvent(context, event), origin, "replay remains valid after closing the month");
      await assert.rejects(planningQuotaEvent(context, { ...event, amount: "1.00", submissionKey: randomUUID() }), /fechado/);
      const redistribute = { instrumentId: piece.loa, lineId, reason: "Saldo fechado redistribuído", submissionKey: randomUUID() };
      assert.equal(await redistributePlanningQuotas(context, redistribute), lineId); assert.equal(await redistributePlanningQuotas(context, redistribute), lineId);
      const after = await f.quotas(lineId); assert.equal(after[0].planned.toFixed(2), "14.00"); assert.equal(after.reduce((sum, row) => sum.plus(row.planned), new Decimal("0")).toFixed(2), "120.00"); assert.equal(after[0].disbursementPaid.toFixed(2), "1.50");
      await db.update(planningBudgetLaws).set({ metadata: { planningInternalExecution: true } }).where(eq(planningBudgetLaws.id, piece.lawId));
      await assert.rejects(planningQuotaEvent(context, { ...event, quotaId: quotas[3].id, submissionKey: randomUUID() }), /alimentado pelo Financeiro/);
      await assert.rejects(db.update(planningQuotaEvents).set({ reason: "Alterar evento" }).where(eq(planningQuotaEvents.id, origin)), databaseError(/immutable/));
    });

    await t.test("contingency includes active purchase and credit reservations, global UG access and exact audit replay", async () => {
      const piece = await f.chain("eo-contingency"), lineId = await f.line(piece, "E", { value: "100.00", appropriation: true });
      await f.line(piece, "RESTRICTED", { unitId: "eo-restricted" });
      await generatePlanningSchedule(context, { instrumentId: piece.loa, lineId, method: "TWELFTHS", periodMonths: 2, reason: "Programação para limitação" });
      await db.insert(budgetReservations).values({ id: "eo-purchase-reservation", number: "EO.RES", appropriationId: `${lineId}:appropriation`, date: new Date("2026-01-01"), value: 0.125, valueDecimal: null });
      const input = { instrumentId: piece.loa, lineId, percentage: "10", reason: "Limitação motivada", submissionKey: randomUUID() };
      await assert.rejects(contingencyPlanningBudget(context, input), /Reconcilie as reservas/);
      await db.update(budgetReservations).set({ valueDecimal: new Decimal("95") }).where(eq(budgetReservations.id, "eo-purchase-reservation"));
      await assert.rejects(contingencyPlanningBudget(context, input), /reservas de compra e crédito/);
      await db.update(budgetReservations).set({ valueDecimal: new Decimal("50") }).where(eq(budgetReservations.id, "eo-purchase-reservation"));
      await db.insert(financeCreditRequests).values({ id: "eo-credit-request", number: "EO.CR", financialYearId: piece.financialYearId, type: "Suplementar", justification: "Reserva de crédito EO", totalValue: new Decimal("45"), requestedById: context.user.id });
      await db.insert(planningCreditBatches).values({ id: "eo-credit", instrumentId: piece.loa, creditRequestId: "eo-credit-request", origin: "SURPLUS", originEvidence: "Evidência EO", originLimit: new Decimal("45"), submissionKey: "eo-credit-key", createdById: context.user.id });
      await db.insert(planningCreditLines).values({ batchId: "eo-credit", lineId, value: new Decimal("45"), reserved: new Decimal("45") });
      await assert.rejects(contingencyPlanningBudget(context, input), /reservas de compra e crédito/);
      const request = { ...input, percentage: "1" }; assert.equal(await contingencyPlanningBudget(context, request), piece.loa); assert.equal(await contingencyPlanningBudget(context, request), piece.loa);
      assert.equal((await f.quotas(lineId)).reduce((sum, row) => sum.plus(row.blocked), new Decimal("0")).toFixed(2), "1.00");
      await assert.rejects(contingencyPlanningBudget(context, { ...request, reason: "Outra motivação" }), /dados diferentes/);
      await assert.rejects(contingencyPlanningBudget(context, { ...request, lineId: undefined, submissionKey: randomUUID() }), /todas as unidades/);
      const [audit] = await db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.loa), eq(financialAuditLogs.action, "PLANNING_CONTINGENCY"))); assert.equal(contentHash(audit.payload), contentHash(request));
    });
    await t.test("legislative bridge preserves chronological stages, dual responsibility, canonical law and revision hashes", async () => {
      const piece = await f.chain("eo-legislative-flow"); await f.line(piece);
      await db.insert(legislatures).values({ id: "eo-legislature", numero: 70001, inicio: new Date("2025-01-01"), fim: new Date("2028-12-31") });
      await db.insert(councilors).values({ id: "eo-councilor", nomeCompleto: "Responsável EO", nomeParlamentar: "EO", legislaturaId: "eo-legislature" });
      await db.insert(propositions).values({ id: "eo-proposal", numero: "EO-PL-70001/2026", tipo: "Projeto de Lei", ementa: "Orçamento EO íntegro", autorId: "eo-councilor" });
      const input = { instrumentId: piece.loa, propositionId: "eo-proposal", reference: "Processo EO ' OR '1'='1" };
      const link = await linkPlanningLegislativeProcedure(context, input); assert.equal(await linkPlanningLegislativeProcedure(context, input), link);
      await assert.rejects(linkPlanningLegislativeProcedure(context, { ...input, propositionId: "outra" }), /outro ato/);
      const stage = { linkId: link, date: "2026-03-02", reason: "Tramitação EO fundamentada" };
      await advancePlanningLegislativeProcedure(context, { ...stage, stage: "ANALYZE" }); assert.equal(await advancePlanningLegislativeProcedure(context, { ...stage, stage: "ANALYZE" }), link);
      await assert.rejects(advancePlanningLegislativeProcedure(context, { ...stage, stage: "ANALYZE", reason: "Outra fundamentação" }), /outros dados/);
      await assert.rejects(advancePlanningLegislativeProcedure(context, { ...stage, stage: "AGENDA", date: "2026-03-01" }), /anteceder/);
      await advancePlanningLegislativeProcedure(context, { ...stage, stage: "AGENDA" });
      await assert.rejects(advancePlanningLegislativeProcedure(context, { ...stage, stage: "APPROVE" }), /distinto/);
      const reviewer = f.actor("eo-reviewer"), authority = f.actor("eo-authority");
      await advancePlanningLegislativeProcedure(reviewer, { ...stage, stage: "APPROVE" });
      const sanction = { ...stage, stage: "SANCTION", lawNumber: "EO-70001/2026", lawType: "Lei Complementar", legalText: "Texto sancionado EO preservado" };
      await assert.rejects(advancePlanningLegislativeProcedure(reviewer, sanction), /distinto da aprovação/);
      await advancePlanningLegislativeProcedure(authority, sanction);
      await advancePlanningLegislativeProcedure(authority, { ...stage, stage: "PUBLISH" });
      const [storedLink] = await db.select().from(planningLegislativeLinks).where(eq(planningLegislativeLinks.id, link)); assert.ok(storedLink.lawId);
      const [law] = await db.select().from(laws).where(eq(laws.id, storedLink.lawId)); assert.equal(law.texto, sanction.legalText); assert.equal(law.tipo, "Lei Complementar"); assert.equal(law.dataPublicacao?.toISOString(), "2026-03-02T00:00:00.000Z"); assert.equal(law.proposicaoId, "eo-proposal");
      assert.equal((await db.select().from(propositions).where(eq(propositions.id, "eo-proposal")))[0].status, "Sancionada");
      const versions = await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.loa)); assert.equal(versions.length, 7); assert.ok(versions.every(row => row.hash === contentHash(row.snapshot)));
      await assert.rejects(advancePlanningLegislativeProcedure({ ...context, jurisdiction: "LEGISLATIVE" }, { ...stage, stage: "PUBLISH" }), /escopo/);
      await db.insert(propositions).values({ id: "eo-rejected-proposal", numero: "EO-PL-70002/2026", tipo: "Projeto de Lei", ementa: "Peça rejeitada EO", autorId: "eo-councilor" });
      const rejected = await linkPlanningLegislativeProcedure(context, { ...input, propositionId: "eo-rejected-proposal", reference: "Processo de rejeição EO" });
      for (const transition of ["ANALYZE", "AGENDA", "REJECT"]) await advancePlanningLegislativeProcedure(context, { ...stage, linkId: rejected, stage: transition });
      assert.equal((await db.select().from(propositions).where(eq(propositions.id, "eo-rejected-proposal")))[0].status, "Rejeitada");
    });

    await t.test("year rollover copies relationships, rules and original seasonality without execution or cross-entity data", async () => {
      const source = await f.chain("eo-rollover-source", 2025), target = await f.chain("eo-rollover-target"), sourceExpense = await f.line(source), sourceRevenue = await f.line(source, "R", { kind: "REVENUE" }), targetExpense = await f.line(target, "E", { value: "200.00" }), targetRevenue = await f.line(target, "R", { kind: "REVENUE", value: "78.00" });
      const weights = Array.from({ length: 12 }, (_, at) => String(at + 1));
      for (const [lineId, kind] of [[sourceExpense, "EXPENSE"], [sourceRevenue, "REVENUE"]]) await db.insert(planningQuotas).values(Array.from({ length: 12 }, (_, at) => ({ lineId, kind, month: at + 1, planned: new Decimal("100"), consumed: new Decimal("1"), blocked: new Decimal(kind === "EXPENSE" ? "1" : "0"), disbursementPlanned: new Decimal(kind === "EXPENSE" ? "90" : "0"), disbursementPaid: new Decimal(kind === "EXPENSE" ? "1" : "0"), closedAt: instant, periodMonths: 3, method: "PERCENTAGES", calculation: { initialPlanned: weights[at], ...(kind === "REVENUE" ? { weights } : {}), nested: [null, "001.00"] } })));
      const definition = { revenueCodes: ["R"], expenseCodes: ["E"], excludedRevenueCodes: [], excludedExpenseCodes: [], extra: { preserved: [null, "001.00"] } };
      await db.insert(planningFiscalRules).values({ instrumentId: source.loa, type: "HEALTH", normativeReference: "Norma fiscal EO", definition, updatedById: context.user.id });
      await db.insert(planningInstrumentSources).values({ instrumentId: source.loa, resourceSourceId: "eo-source" });
      await db.insert(planningAnnualPrograms).values({ instrumentId: source.loa, programId: source.programId, year: 2025, priority: "Prioridade anual EO" });
      await db.update(planningBudgetLaws).set({ status: "PUBLISHED" }).where(eq(planningBudgetLaws.id, source.lawId));
      const copy = () => withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, target.loa), source.loa));
      const result = await copy(); assert.equal(result.configurationStatus, "COPIED_WITHOUT_EXECUTION"); assert.equal(result.copiedRules, 1); assert.equal(result.copiedSchedules, 2); assert.equal(result.copiedSources, 1); assert.equal(result.copiedAnnualPrograms, 1);
      const copied = await f.quotas(targetExpense); assert.ok(copied.every(row => row.consumed.isZero() && row.blocked.isZero() && row.disbursementPaid.isZero() && row.closedAt === null)); assert.equal(copied.reduce((sum, row) => sum.plus(row.planned), new Decimal("0")).toFixed(2), "200.00"); assert.equal(copied[0].periodMonths, 3); assert.equal(planningOperationObject(copied[0].calculation).sourceInstrumentId, source.loa); assert.deepEqual(planningOperationObject(copied[0].calculation).weights, weights);
      assert.deepEqual((await f.quotas(targetRevenue)).map(row => row.planned.toFixed(2)), weights.map(value => `${value}.00`));
      assert.deepEqual((await db.select().from(planningFiscalRules).where(eq(planningFiscalRules.instrumentId, target.loa)))[0].definition, definition);
      const [annual] = await db.select().from(planningAnnualPrograms).where(eq(planningAnnualPrograms.instrumentId, target.loa)); assert.equal(annual.programId, target.programId); assert.equal(annual.priority, "Prioridade anual EO"); assert.equal(annual.year, 2026);
      const repeated = await copy(); assert.equal(repeated.copiedRules, 0); assert.equal(repeated.copiedSchedules, 0);
      const noSource = await f.chain("eo-first-year", 2030);
      const firstYear = await withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, noSource.loa)));
      assert.equal(firstYear.configurationStatus, "FIRST_YEAR_OR_NO_PUBLISHED_PREDECESSOR"); assert.equal(firstYear.sourceId, null);
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, target.loa), "eo-missing-source")), /Origem publicada/);
      const mismatch = await f.chain("eo-rollover-mismatch"); await f.line(mismatch, "R", { kind: "REVENUE" });
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, mismatch.loa), source.loa)), /códigos ausentes/);
      assert.equal((await db.select().from(planningInstrumentSources).where(eq(planningInstrumentSources.instrumentId, mismatch.loa))).length, 0, "failed compatibility rolls back earlier source bindings and annual selections");
      const other = await f.chain("eo-rollover-other", 2025, "eo-other"); await db.update(planningBudgetLaws).set({ status: "PUBLISHED" }).where(eq(planningBudgetLaws.id, other.lawId));
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, target.loa), other.loa)), /Origem publicada/);
      const duplicate = await f.chain("eo-rollover-ambiguous", 2025); await db.update(planningBudgetLaws).set({ status: "PUBLISHED" }).where(eq(planningBudgetLaws.id, duplicate.lawId));
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => copyPlanningYearConfiguration(tx, context, await lockLegalInstrument(tx, context, target.loa))), /Mais de uma LOA publicada/);
    });

    await t.test("RCL spans twelve closed UTC competences, exact deductions/reversals, all UGs and nonduplicating joins", async () => {
      const full = f.actor("eo-author", ["eo-unit", "eo-restricted"]), references = [{ budgetUnitId: "eo-unit", resourceSourceId: "eo-source", revenueNature: { id: "eo-revenue" } }];
      const bank = await f.bank();
      assert.equal((await readPlanningRclExecution(full, "eo-entity", references, "2026-09-30")).status, "INCOMPLETE");
      for (let at = 0; at < 12; at++) { const competence = new Date(Date.UTC(2025, 9 + at, 1)), financialYearId = await f.year(competence.getUTCFullYear()); await db.insert(monthlyAccountingCloses).values({ financialYearId, competence, status: "FECHADO" }); }
      async function receipt(id: string, amount: string, classification: "ORCAMENTARIA" | "REDUTORA", date: Date, bankAccountId = bank, entity = "eo-entity", status = "Confirmado") {
        const financialYearId = await f.year(date.getUTCFullYear(), entity);
        await db.insert(revenues).values({ id, date, value: 0.125, valueDecimal: new Decimal(amount), revenueNatureId: "eo-revenue", resourceSourceId: "eo-source", bankAccountId, classification });
        await db.insert(reconciliationTreasuryMovements).values({ id: `${id}:cash`, date, type: "Revenue", direction: "Entrada", valueDecimal: new Decimal(amount), bankAccountId, resourceSourceId: "eo-source", financialYearId, revenueId: id, status });
        return { id, financialYearId, bankAccountId };
      }
      const ordinary = await receipt("eo-rcl-ordinary", "90071992547409.91", "ORCAMENTARIA", new Date("2026-09-30T23:59:59.999Z"));
      const deduction = await receipt("eo-rcl-deduction", "20.00", "REDUTORA", instant);
      for (const [origin, amount] of [[ordinary, "10.00"], [deduction, "5.00"]] as const) {
        const id = `${origin.id}:reverse`;
        const date = origin.id === ordinary.id ? new Date("2026-09-30T23:59:59.999Z") : instant;
        await db.insert(reconciliationTreasuryMovements).values({ id: `${id}:cash`, date, type: "RevenueReversal", direction: "Saída", valueDecimal: new Decimal(amount), bankAccountId: origin.bankAccountId, resourceSourceId: "eo-source", financialYearId: origin.financialYearId });
        await db.insert(revenueReversals).values({ id, revenueId: origin.id, date, valueDecimal: new Decimal(amount), justification: "Estorno EO", financialYearId: origin.financialYearId, treasuryMovementId: `${id}:cash` });
      }
      await receipt("eo-rcl-pending", "1000", "ORCAMENTARIA", instant, bank, "eo-entity", "Pendente");
      await receipt("eo-rcl-future", "1000", "ORCAMENTARIA", new Date("2026-10-01T00:00:00.000Z"));
      await receipt("eo-rcl-other", "1000", "ORCAMENTARIA", instant, await f.bank("eo-other-bank", "eo-other-unit"), "eo-other");
      const result = await readPlanningRclExecution(full, "eo-entity", [...references, ...references], "2026-09-30"); assert.equal(result.status, "CONNECTED"); assert.equal(result.total, "90071992547384.91"); assert.equal(result.rows.length, 12);
      if (result.status === "CONNECTED") { assert.equal(result.rows.reduce((sum, row) => sum + row.movimentos, 0), 4); assert.equal(result.rows[11].memória, contentHash(["eo-rcl-ordinary:cash", "eo-rcl-ordinary:reverse:cash"].sort())); }
      assert.equal((await readPlanningRclExecution(full, "eo-entity", references, "2026-09-15")).status, "INCOMPLETE");
      await assert.rejects(readPlanningRclExecution(context, "eo-entity", references, "2026-09-30"), /todas as unidades/);
      await assert.rejects(readPlanningRclExecution(full, "eo-entity", [{ ...references[0], budgetUnitId: "eo-other-unit" }], "2026-09-30"), /fora da entidade/);
      await withDatabaseTransaction(f.connection, async tx => { const readOnly = await readPlanningRclExecution({ ...full, database: tx }, "eo-entity", references, "2026-09-30"); assert.equal(readOnly.total, result.total); }, { isolationLevel: "repeatable read", accessMode: "read only" });
      const denied = { ...context, user: { ...context.user, permissions: "{}", modulePermissions: [] } };
      assert.equal((await readPlanningRclExecution(denied, "eo-entity", references, "2026-09-30")).status, "RESTRICTED");
      await withDatabaseTransaction(f.connection, async tx => { await tx.execute(sql`SET LOCAL search_path TO pg_catalog`); assert.equal((await readPlanningRclExecution({ ...full, database: tx }, "eo-entity", references, "2026-09-30")).status, "UNAVAILABLE"); });
    });

    await t.test("waiver realization resolves assessment/guide origins on the same transaction and preserves revisions", async () => {
      const piece = await f.chain("eo-waiver"), bank = await f.bank();
      await db.insert(taxes).values([{ id: "eo-tax", name: "Taxa EO", taxType: "Taxa" }, { id: "eo-tax-other", name: "Outro tributo EO", taxType: "Taxa" }]);
      await db.insert(taxFinancialMappings).values({ taxId: "eo-tax", revenueNatureId: "eo-revenue", resourceSourceId: "eo-source", defaultBankAccountId: bank });
      await db.insert(taxpayers).values({ id: "eo-taxpayer", taxpayerType: "Pessoa Física" });
      await db.insert(taxAssessments).values([{ id: "eo-assessment", year: 2026, taxId: "eo-tax", taxpayerId: "eo-taxpayer", originalValue: 0.125, originalValueDecimal: new Decimal("20") }, { id: "eo-assessment-other", year: 2026, taxId: "eo-tax-other", taxpayerId: "eo-taxpayer", originalValue: 0.125, originalValueDecimal: new Decimal("20") }]);
      await db.insert(taxGuides).values({ id: "eo-guide", assessmentId: "eo-assessment", dueDate: instant, totalValue: 0.125, totalValueDecimal: new Decimal("20") });
      await db.insert(pageBenefitRules).values({ id: "eo-benefit-rule", code: "EO.REN", name: "Renúncia EO", benefitType: "RENUNCIA", legalReference: "Lei EO", eligibility: {}, calculation: { retained: null }, effectiveFrom: new Date("2026-01-01"), active: true, createdByUsuarioId: context.user.id, createdAt: instant, updatedAt: instant });
      const grant = { ruleId: "eo-benefit-rule", taxpayerId: "eo-taxpayer", originalAmountDecimal: new Decimal("20"), finalAmountDecimal: new Decimal("10"), calculationSnapshot: { extra: [null, "001.00"] }, grantedByUsuarioId: context.user.id, grantedAt: instant };
      await db.insert(executionBenefitGrants).values([{ ...grant, id: "eo-grant-assessment", sourceType: "TAX_ASSESSMENT", sourceId: "eo-assessment", renunciationDecimal: new Decimal("5.01") }, { ...grant, id: "eo-grant-guide", sourceType: "GUIA", sourceId: "eo-guide", renunciationDecimal: new Decimal("10.09") }, { ...grant, id: "eo-grant-other", sourceType: "ASSESSMENT", sourceId: "eo-assessment-other", renunciationDecimal: new Decimal("2") }]);
      const read = (ctx = context) => readPlanningWaiverRealization(ctx, "eo-entity", "eo-tax", 2026, "2026-09-30");
      const result = await read(); assert.equal(result.status, "CONNECTED"); assert.equal(result.value, "15.10"); assert.deepEqual(result.originIds.sort(), ["eo-grant-assessment", "eo-grant-guide"]);
      assert.equal((await readPlanningWaiverRealization(context, "eo-other", "eo-tax", 2026, "2026-09-30")).status, "UNMAPPED"); assert.equal((await readPlanningWaiverRealization(context, "eo-entity", null, 2026, "2026-09-30")).status, "UNMAPPED");
      assert.equal((await readPlanningWaiverRealization(context, "eo-entity", "eo-tax", 2027, "2026-09-30")).status, "INCOMPLETE");
      await assert.rejects(read(f.actor("eo-author", ["eo-restricted"])), /unidades autorizadas/);
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await tx.insert(executionBenefitGrants).values({ ...grant, id: "eo-uncommitted-grant", sourceType: "ASSESSMENT", sourceId: "eo-assessment", ruleId: "eo-benefit-rule", renunciationDecimal: new Decimal("1") });
        // Use another source spelling to respect the physical origin unique key.
        const current = await readPlanningWaiverRealization({ ...context, database: tx }, "eo-entity", "eo-tax", 2026, "2026-09-30"); assert.equal(current.value, "16.10");
        throw new Error("expected rollback of uncommitted realization");
      }), /expected rollback/);
      assert.equal((await read()).value, "15.10");
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => { await tx.insert(executionBenefitGrants).values({ ...grant, id: "eo-unreconciled", sourceType: "UNKNOWN", sourceId: "eo-unknown", renunciationDecimal: new Decimal("1") }); assert.equal((await readPlanningWaiverRealization({ ...context, database: tx }, "eo-entity", "eo-tax", 2026, "2026-09-30")).status, "UNRECONCILED"); throw new Error("expected unknown rollback"); }), /expected unknown rollback/);
      await db.insert(planningWaivers).values({ id: "eo-waiver-record", instrumentId: piece.ppa, year: 2026, description: "Renúncia EO vinculada", legalReference: "Lei EO", modality: "Isenção", estimatedValue: new Decimal("20"), compensation: "Compensação EO", compensationValue: new Decimal("20"), methodology: "Metodologia EO", taxId: "eo-tax", createdById: context.user.id });
      assert.equal(await synchronizePlanningWaiver(context, { waiverId: "eo-waiver-record", asOf: "2026-09-30" }), "eo-waiver-record");
      await db.update(planningMultiYearPlans).set({ status: "PUBLISHED", sanctionedAt: new Date("2026-01-01"), legalActNumber: "Lei EO de renúncia" }).where(eq(planningMultiYearPlans.id, piece.ppaId));
      await synchronizePlanningWaiver(context, { waiverId: "eo-waiver-record", asOf: "2026-09-30" });
      const [stored] = await db.select().from(planningWaivers).where(eq(planningWaivers.id, "eo-waiver-record")); assert.equal(stored.realizedValue?.toFixed(2), "15.10"); assert.equal(stored.realizedThrough?.toISOString(), "2026-09-30T00:00:00.000Z"); assert.equal(stored.originKey, contentHash(result.originIds));
      const versions = await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.ppa)); assert.equal(versions.length, 2); assert.ok(versions.every(row => contentHash(row.snapshot) === row.hash));
      await withDatabaseTransaction(f.connection, async tx => { await tx.execute(sql`SET LOCAL search_path TO pg_catalog`); assert.equal((await readPlanningWaiverRealization({ ...context, database: tx }, "eo-entity", "eo-tax", 2026, "2026-09-30")).status, "UNAVAILABLE"); });
    });

    await t.test("annual projections retain cumulative HALF_UP memory, execution origin hashes and all-or-nothing writes", async () => {
      const target = await f.chain("eo-projection"), input = { instrumentId: target.ppa, kind: "REVENUE", baseValue: "100.00", rates: "10;10;10;10", normativeReference: "Premissa normativa EO", methodology: "Projeção anual acumulada EO" };
      await projectPlanningAnnualMemory(context, input);
      const memories = await db.select().from(planningMemories).where(eq(planningMemories.instrumentId, target.ppa)).orderBy(asc(planningMemories.year)); assert.deepEqual(memories.map(row => row.resultValue.toFixed(2)), ["110.00", "121.00", "133.10", "146.41"]); assert.deepEqual(memories.map(row => row.baseValue.toFixed(2)), ["100.00", "110.00", "121.00", "133.10"]);
      assert.equal(planningOperationObject(memories[0].calculation).sourceHash, null); assert.equal(memories[0].rate.toFixed(6), "10.000000");
      const rollback = await f.chain("eo-projection-rollback");
      await assert.rejects(projectPlanningAnnualMemory(context, { ...input, instrumentId: rollback.ppa, rates: "10;-100.000001;10;10" }), /negativo/);
      assert.equal((await db.select().from(planningMemories).where(eq(planningMemories.instrumentId, rollback.ppa))).length, 0); assert.equal((await db.select().from(financialAuditLogs).where(eq(financialAuditLogs.entityId, rollback.ppa))).length, 0);
      const source = await f.chain("eo-projection-history", 2024), sourceLine = await f.line(source, "R", { kind: "REVENUE", value: "42.05" }), bank = await f.bank();
      await db.insert(revenues).values({ id: "eo-projection-receipt", date: new Date("2024-03-01"), value: 0.125, valueDecimal: new Decimal("42.05"), revenueNatureId: "eo-revenue", resourceSourceId: "eo-source", bankAccountId: bank });
      await db.insert(reconciliationTreasuryMovements).values({ date: new Date("2024-03-01"), type: "Revenue", direction: "Entrada", valueDecimal: new Decimal("42.05"), financialYearId: source.financialYearId, bankAccountId: bank, revenueId: "eo-projection-receipt" });
      const historyTarget = await f.chain("eo-projection-from-execution");
      await projectPlanningAnnualMemory(context, { ...input, instrumentId: historyTarget.ppa, baseValue: undefined, sourceInstrumentId: source.loa });
      const fromHistory = await db.select().from(planningMemories).where(eq(planningMemories.instrumentId, historyTarget.ppa)).orderBy(asc(planningMemories.year)); assert.deepEqual(fromHistory.map(row => row.resultValue.toFixed(2)), ["46.26", "50.89", "55.98", "61.58"]); assert.equal(planningOperationObject(fromHistory[0].calculation).originalBase, "42.05"); assert.equal(planningOperationObject(fromHistory[0].calculation).origin, `LOA:${source.loa}:2024`); assert.equal(typeof planningOperationObject(fromHistory[0].calculation).sourceHash, "string"); assert.ok(sourceLine);
      await assert.rejects(projectPlanningAnnualMemory(context, { ...input, sourceInstrumentId: target.loa }), /ainda não completo/);
      await assert.rejects(projectPlanningAnnualMemory(context, { ...input, rates: "10;10" }), /uma taxa/);
      await db.update(planningMultiYearPlans).set({ status: "PUBLISHED" }).where(eq(planningMultiYearPlans.id, target.ppaId));
      await assert.rejects(projectPlanningAnnualMemory(context, input), /fechada para elaboração/);
    });
  } finally { await f.close(); }
});
