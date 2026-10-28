import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingPlans } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { budgetReservations } from "../src/db/schema/finance-budget";
import { revenues } from "../src/db/schema/finance-revenues";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { financeCreditRequests } from "../src/db/schema/finance-legacy-budget";
import { councilors, legislatures } from "../src/db/schema/chamber";
import { planningAppropriations, planningBudgetLaws, planningCreditBatches, planningCreditLines, planningDocumentLinks, planningInstruments, planningLines, planningMultiYearPlans, planningQuotaEvents, planningQuotas } from "../src/db/schema/planning-budget";
import { planningActions, planningCatalogEntries, planningCatalogVersions, planningForecasts, planningIndicators, planningIntegrationCommands, planningMemories, planningPrograms, planningRevenueAllocations, planningVersions } from "../src/db/schema/planning-legal";
import { catalogAmendmentItems, catalogCommunityDemands, catalogImportBatches, catalogLegislativeAmendments, catalogServiceTargets } from "../src/db/schema/planning-catalog-operations";
import { adoptMunicipalCatalog, createCanonicalActivityReference, importSharedReferenceCatalog } from "../src/lib/planejamento/catalog-adoption";
import { currentPresentationEntries, supersededPresentationVersionIds } from "../src/lib/planejamento/catalog-presentation";
import { createPlanningCatalog, saveRevenueAllocation } from "../src/lib/planejamento/catalog";
import { importPlanningLines, importPlanningStructure, previewPlanningImport } from "../src/lib/planejamento/imports";
import { maintainPlanningRecord } from "../src/lib/planejamento/maintenance";
import { reorderPlanningExpenseCodes, setPlanningReducedCode } from "../src/lib/planejamento/reduced-codes";
import { createLegislativePlanningAmendment, decideLegislativePlanningAmendment, setPlanningAmendmentBlock } from "../src/lib/planejamento/amendments";
import { createPlanningCreditPreview, transitionPlanningCredit } from "../src/lib/planejamento/credits";
import { getImplantedPlanningBudget } from "../src/lib/planejamento/budget-availability";
import { reconcilePlanningLegacyAppropriation } from "../src/lib/planejamento/legacy-reconciliation";
import { readPlanningMonthlyExecution } from "../src/lib/planejamento/monthly-execution";
import { decideCommunityDemand, registerCommunityDemand, registerPlanningHearing } from "../src/lib/planejamento/hearings";
import { contentHash } from "../src/lib/planejamento/operations-core";
import { createPlanningCatalogOperationsFixture } from "./helpers/planning-catalog-operations-fixture";
import { financeDatabaseError } from "./helpers/finance-database-error";

// Central integration queue only: replay original historical SQL once, exercise
// the production Neon/Drizzle driver, and await each subtest/transport teardown.
test("planning catalog operations preserve historical PostgreSQL contracts", async t => {
  const f = await createPlanningCatalogOperationsFixture();
  const { db, context } = f;
  try {
    await t.test("new scalar projections match physical columns after complete SQL replay", async () => {
      assert.equal(f.migrationCount, 156);
      for (const table of [catalogAmendmentItems, catalogCommunityDemands, catalogImportBatches, catalogLegislativeAmendments, catalogServiceTargets]) {
        const config = getTableConfig(table);
        const rows = await db.execute<{ name: string; type: string; notNull: boolean }>(sql`SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS "notNull" FROM pg_attribute a WHERE a.attrelid = ${`"${config.name}"`}::regclass AND a.attnum > 0 AND NOT a.attisdropped`);
        for (const column of config.columns) {
          const physical = rows.rows.find(row => row.name === column.name);
          assert.ok(physical, `${config.name}.${column.name}`);
          const normalize = (value: string) => value.replaceAll("without time zone", "").replace(/\s/g, "");
          assert.equal(normalize(physical.type), normalize(column.getSQLType()), `${config.name}.${column.name} type`);
          assert.equal(physical.notNull, column.notNull, `${config.name}.${column.name} nullable`);
        }
      }
    });

    await t.test("capture, canonical CNAE/CBO, scoped adoption, hashes, succession and freeze", async () => {
      const contents = JSON.stringify([
        { kind: "ACCOUNT", code: "1.1", name: "Conta externa", degree: 7, attributes: { postingAllowed: true, balanceNature: "D", nested: { amount: "001.00", unknown: null } } },
        { kind: "CNAE", code: "1234567", name: "Atividade econômica", degree: 1 },
        { kind: "CBO", code: "123456", name: "Ocupação", degree: 1 },
      ]);
      const capture = { year: 2026, label: "Tabela capturada", normativeReference: "Referência oficial preservada", sourceContents: contents };
      const versionId = await importSharedReferenceCatalog(context, capture);
      assert.equal(await importSharedReferenceCatalog(context, capture), versionId);
      await assert.rejects(importSharedReferenceCatalog(context, { ...capture, label: "Outro título" }), /outra identificação/);
      const [version] = await db.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId));
      assert.equal(version.sourceHash, createHash("sha256").update(contents).digest("hex"));
      const entries = await db.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId));
      const cnaeId = await createCanonicalActivityReference(context, { sourceEntryId: entries.find(row => row.kind === "CNAE")!.id });
      assert.equal(cnaeId, "CNAE_REFERENCE:1234567");
      assert.equal(await createCanonicalActivityReference(context, { sourceEntryId: entries.find(row => row.kind === "CNAE")!.id }), cnaeId);
      const cboId = await createCanonicalActivityReference(context, { sourceEntryId: entries.find(row => row.kind === "CBO")!.id });
      assert.equal(await createCanonicalActivityReference(context, { sourceEntryId: entries.find(row => row.kind === "CBO")!.id }), cboId);
      await db.insert(accountingPlans).values({ id: "co-account", code: "CO.A", name: "Conta canônica", type: "Ativo" });
      const sourceEntryId = entries.find(row => row.kind === "ACCOUNT")!.id;
      const decision = { sourceVersionId: versionId, governmentEntityId: "co-entity", budgetUnitId: "co-unit", label: "Adoção municipal", reason: "Classificação municipal fundamentada", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", mappings: JSON.stringify([{ sourceEntryId, canonicalId: "co-account" }]) };
      const adopted = await adoptMunicipalCatalog(context, decision);
      assert.equal(await adoptMunicipalCatalog(context, { ...decision, mappings: JSON.stringify([{ canonicalId: "co-account", sourceEntryId }], null, 2) }), adopted);
      const [adoptedEntry] = await db.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, adopted));
      assert.deepEqual(adoptedEntry.attributes && typeof adoptedEntry.attributes === "object" && !Array.isArray(adoptedEntry.attributes) ? adoptedEntry.attributes.nested : null, { amount: "001.00", unknown: null });
      await assert.rejects(adoptMunicipalCatalog(context, { ...decision, label: "Sobreposição" }), /sobreposta/);
      await assert.rejects(adoptMunicipalCatalog(context, { ...decision, governmentEntityId: "co-legislative", budgetUnitId: "co-legislative-unit" }));
      await assert.rejects(adoptMunicipalCatalog(context, { ...decision, budgetUnitId: "co-restricted" }));
      await assert.rejects(adoptMunicipalCatalog(context, { ...decision, governmentEntityId: "co-other", budgetUnitId: "co-other-unit" }));
      const successor = await adoptMunicipalCatalog(context, { ...decision, label: "Edição de julho", effectiveFrom: "2026-07-01", mappings: JSON.stringify([{ sourceEntryId, canonicalId: "co-account", predecessorEntryId: adoptedEntry.id }]) });
      assert.notEqual(successor, adopted);
      await assert.rejects(db.update(planningCatalogEntries).set({ name: "Reescrita proibida" }).where(eq(planningCatalogEntries.id, adoptedEntry.id)), financeDatabaseError(/Published planning classification is immutable/));
      const [captureAudit] = await db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, versionId), eq(financialAuditLogs.action, "SHARED_REFERENCE_CAPTURE")));
      assert.equal(contentHash(captureAudit.payload), contentHash({ year: 2026, sourceHash: version.sourceHash, sourceContents: contents, sourceEncoding: "UTF-8", normativeReference: capture.normativeReference, rows: 3, status: "DRAFT" }));
    });

    await t.test("presentation revisions preserve semantics and time-dependent selectors", async () => {
      const base = { id: "presentation-old", kind: "SOURCE", code: "500", canonicalId: "co-source", parentCode: null, degree: 1, attributes: { operational: true }, version: { year: 2026 } };
      const revised = { ...base, id: "presentation-new", attributes: { ...base.attributes, presentationPredecessorEntryId: base.id, presentationPredecessorVersionId: "presentation-v1", presentationEffectiveFrom: "2026-07-01" } };
      assert.deepEqual(currentPresentationEntries([base, revised], "2026-06-30").map(row => row.id), [base.id]);
      assert.deepEqual(currentPresentationEntries([base, revised], "2026-07-01").map(row => row.id), [revised.id]);
      assert.throws(() => currentPresentationEntries([base, { ...revised, canonicalId: "other" }], "2026-07-01"), /semântica/);
      await db.insert(planningCatalogVersions).values({ id: "presentation-v2", year: 2026, label: "Nomes revisados", normativeReference: "Revisão nominal", sourceHash: "presentation-v2", createdById: context.user.id });
      await db.insert(planningCatalogEntries).values([{ id: "presentation-row", versionId: "presentation-v2", kind: revised.kind, code: revised.code, canonicalId: revised.canonicalId, degree: revised.degree, attributes: revised.attributes, name: "Fonte renomeada" }, { versionId: "presentation-v2", kind: "SOURCE", code: "600", name: "Sem sucessão", degree: 1, canonicalId: "co-source-2", attributes: { presentationPredecessorVersionId: null } }]);
      await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "presentation-v2"));
      assert.deepEqual(await supersededPresentationVersionIds(db, "2026-06-30"), []);
      assert.deepEqual(await supersededPresentationVersionIds(db, "2026-07-01"), ["presentation-v1"]);
    });

    await t.test("catalog creation and serialized allocations keep six decimal places and rollback", async () => {
      const natureId = await createPlanningCatalog(context, { kind: "REVENUE", code: "CO.ALLOC", name: "Receita rateada", degree: 6, shortCode: "RA", referenceYear: 2026 });
      const first = await saveRevenueAllocation(context, { revenueNatureId: natureId, resourceSourceId: "co-source", percentage: "33.333333" });
      assert.equal(await saveRevenueAllocation(context, { revenueNatureId: natureId, resourceSourceId: "co-source", percentage: "33.333333" }), first);
      await saveRevenueAllocation(context, { revenueNatureId: natureId, resourceSourceId: "co-source-2", percentage: "66.666667" });
      await assert.rejects(saveRevenueAllocation(context, { revenueNatureId: natureId, resourceSourceId: "co-source", percentage: "33.333334" }), /ultrapassar/);
      const allocations = await db.select().from(planningRevenueAllocations).where(eq(planningRevenueAllocations.revenueNatureId, natureId));
      assert.deepEqual(allocations.map(row => row.percentage.toFixed(6)).sort(), ["33.333333", "66.666667"]);
      assert.equal(allocations.reduce((sum, row) => sum.plus(row.percentage), new Decimal(0)).toFixed(6), "100.000000");
    });

    await t.test("imports preserve Float trees, Decimal physicals, values hashes, replay and rollback", async () => {
      const source = await f.chain("import-source"), target = await f.chain("import-target"), rollback = await f.chain("import-rollback"), treeTarget = await f.chain("import-tree");
      await f.line(source, { instrumentId: source.ppa, code: "E1" });
      await f.line(source, { instrumentId: source.ppa, code: "R1", kind: "REVENUE", value: "9007199254740993.01" });
      const input = { sourceInstrumentId: source.ppa, targetInstrumentId: target.ppa, sourceYear: 2026, targetYear: 2026, mode: "VALUES", programConflict: "REUSE_TARGET" };
      const preview = await previewPlanningImport(context, input);
      assert.equal(preview.revenue, "9007199254740993.01");
      const request = { ...input, expectedSourceRevision: preview.sourceRevision, expectedTargetRevision: preview.targetRevision, expectedValuesHash: preview.valuesHash, submissionKey: randomUUID() };
      const batch = await importPlanningLines(context, request);
      assert.equal(await importPlanningLines(context, request), batch);
      await assert.rejects(importPlanningLines(context, { ...request, mode: "STRUCTURE" }), /outros dados/);
      const imported = await db.select().from(planningLines).where(eq(planningLines.instrumentId, target.ppa));
      assert.equal(imported.find(row => row.kind === "REVENUE")?.originalValue.toFixed(2), "9007199254740993.01");
      assert.equal(imported.find(row => row.kind === "EXPENSE")?.physicalTarget.toFixed(4), "1.2345");
      await assert.rejects(importPlanningLines(context, { ...input, targetInstrumentId: rollback.ppa, expectedValuesHash: "wrong", submissionKey: randomUUID() }), /lote foi revertido/);
      assert.equal((await db.select({ total: count() }).from(planningLines).where(eq(planningLines.instrumentId, rollback.ppa)))[0].total, 0);
      assert.equal((await db.select().from(planningInstruments).where(eq(planningInstruments.id, rollback.ppa)))[0].revision, 1);
      await assert.rejects(importPlanningLines(context, { ...input, targetInstrumentId: rollback.ppa, expectedSourceRevision: 999, submissionKey: randomUUID() }), /prévia mudou/);
      // Remove the unused destination tree to prove objective/indicator cloning.
      await db.delete(planningIndicators).where(eq(planningIndicators.id, "import-tree:indicator"));
      await db.execute(sql`DELETE FROM "ObjectivePPA" WHERE id = 'import-tree:objective'`);
      await db.delete(planningActions).where(eq(planningActions.id, treeTarget.actionId));
      await db.delete(planningPrograms).where(eq(planningPrograms.id, treeTarget.programId));
      await importPlanningStructure(context, { sourceInstrumentId: source.ppa, targetInstrumentId: treeTarget.ppa, kind: "PROGRAMS" });
      const cloned = await db.select({ baselineValue: planningIndicators.baselineValue, targetValue: planningIndicators.targetValue }).from(planningIndicators).where(sql`${planningIndicators.objectiveId} IN (SELECT o.id FROM "ObjectivePPA" o JOIN "ProgramPPA" p ON p.id=o."programId" WHERE p."multiYearPlanId"=${treeTarget.ppaId})`);
      assert.deepEqual(cloned, [{ baselineValue: 0.1, targetValue: 99.125 }]);
      await importPlanningStructure(context, { sourceInstrumentId: target.ppa, targetInstrumentId: rollback.ppa, kind: "SOURCES" });
      await assert.rejects(importPlanningLines({ ...context, jurisdiction: "LEGISLATIVE" }, request), /escopo autorizado/);
      await assert.rejects(previewPlanningImport(context, { ...input, mode: "REALIZED" }), /Realizado exige/);
    });

    await t.test("maintenance and reduced codes preserve scope, ordering, JSON SQL null and legal memory", async () => {
      const piece = await f.chain("maintenance");
      const e1 = await f.line(piece), e2 = await f.line(piece, { code: "E2" });
      await reorderPlanningExpenseCodes(context, { instrumentId: piece.loa, orderedCodes: "E2;E1", prefix: "D" });
      assert.equal((await db.select().from(planningLines).where(eq(planningLines.id, e2)))[0].reducedCode, "D000001");
      await setPlanningReducedCode(context, { instrumentId: piece.loa, lineId: e1, reducedCode: "D000003" });
      await assert.rejects(setPlanningReducedCode(context, { instrumentId: piece.loa, lineId: e1, reducedCode: "D000001" }));
      assert.equal((await db.select().from(planningLines).where(eq(planningLines.id, e1)))[0].reducedCode, "D000003");
      await assert.rejects(reorderPlanningExpenseCodes(context, { instrumentId: piece.loa, orderedCodes: "E1" }), /todas as dotações/);
      const memory = await maintainPlanningRecord(context, { instrumentId: piece.ppa, entity: "MEMORY", title: "Memória legal", normativeReference: "Diretriz municipal", methodology: "Projeção fundamentada", assumptions: "Base municipal", year: 2026, baseValue: "100.05", rate: "1.234567" });
      const [stored] = await db.select().from(planningMemories).where(eq(planningMemories.id, memory));
      assert.equal(stored.rate.toFixed(6), "1.234567");
      assert.equal(stored.resultValue.toFixed(2), "101.29");
      assert.deepEqual(stored.calculation, { formula: "BASE*(1+RATE/100)", rounding: "HALF_UP_CENTS", base: "100.05", rate: "1.234567", year: 2026 });
      await maintainPlanningRecord(context, { instrumentId: piece.loa, recordId: e1, entity: "LINE", code: "E1", description: "Dotação atualizada", year: 2026, budgetUnitId: "co-unit", resourceSourceId: "co-source", expenseNatureId: "co-expense", programId: piece.programId, actionId: piece.actionId, functionCode: "04", subfunctionCode: "122", product: "Atendimento", productUnit: "pessoa", physicalTarget: "2.3456", originalValue: "120.12" });
      const nulls = await db.execute<{ sqlNull: boolean }>(sql`SELECT "classificationSnapshot" IS NULL AS "sqlNull" FROM "PlanningBudgetLine" WHERE id=${e1}`);
      assert.equal(nulls.rows[0].sqlNull, true);
      await assert.rejects(maintainPlanningRecord(context, { instrumentId: piece.ppa, entity: "PROGRAM", recordId: piece.programId, mode: "DELETE" }), /dependências/);
      await db.update(planningInstruments).set({ implantedAt: new Date("2026-01-01T00:00:00.000Z") }).where(eq(planningInstruments.id, piece.loa));
      await assert.rejects(setPlanningReducedCode(context, { instrumentId: piece.loa, lineId: e1, reducedCode: "D000004" }), /implantação/);
    });

    await t.test("realized imports read the prior LOA through the originating executor and retain cent totals", async () => {
      const source = await f.chain("realized-source", { year: 2025 }), target = await f.chain("realized-target");
      await f.line(source, { kind: "REVENUE", code: "R1", value: "500.00" });
      await db.insert(reconciliationBankAccounts).values({ id: "co-realized-bank", bankName: "Banco municipal", agency: "0001", accountNumber: "123-4", budgetUnitId: "co-unit", resourceSourceId: "co-source" });
      await withDatabaseTransaction(f.connection, async tx => {
        await tx.insert(revenues).values({ id: "co-realized-revenue", date: new Date("2025-12-31T23:59:59.999Z"), financialYearId: source.financialYearId, budgetUnitId: "co-unit", value: 123.45, valueDecimal: new Decimal("123.45"), revenueNatureId: "co-revenue", resourceSourceId: "co-source", bankAccountId: "co-realized-bank" });
        await tx.insert(reconciliationTreasuryMovements).values({ id: "co-realized-cash", date: new Date("2025-12-31T23:59:59.999Z"), type: "Revenue", direction: "Entrada", valueDecimal: new Decimal("123.45"), bankAccountId: "co-realized-bank", financialYearId: source.financialYearId, resourceSourceId: "co-source", revenueId: "co-realized-revenue" });
      });
      const input = { sourceInstrumentId: source.loa, targetInstrumentId: target.loa, sourceYear: 2025, targetYear: 2026, mode: "REALIZED" };
      const preview = await previewPlanningImport(context, input);
      assert.equal(preview.revenue, "123.45");
      const batchId = await importPlanningLines(context, { ...input, expectedValuesHash: preview.valuesHash, submissionKey: randomUUID() });
      const [batch] = await db.select().from(catalogImportBatches).where(eq(catalogImportBatches.id, batchId));
      assert.equal(batch.sourceYear, 2025);
      assert.equal(batch.realizedStage, "EMPENHADA");
      assert.equal((await db.select().from(planningForecasts).where(eq(planningForecasts.annualBudgetLawId, target.lawId)))[0].estimatedValue.toFixed(2), "123.45");
      assert.equal((await db.select().from(planningBudgetLaws).where(eq(planningBudgetLaws.id, target.lawId)))[0].totalRevenue.toFixed(2), "123.45");
    });

    await t.test("hearings preserve Date, LEG/EXEC and UG scope, conditional decisions and audit rollback", async () => {
      const piece = await f.chain("hearings");
      const hearing = await registerPlanningHearing(context, { instrumentId: piece.ppa, title: "Audiência pública", heldAt: "2026-06-01T12:34:56.789Z", location: "Plenário", minutes: "Ata preservada" });
      const demandInput = { hearingId: hearing, requesterName: "Moradora", email: "moradora@example.invalid", neighborhood: "Centro", request: "Ampliar atendimento", responsibleUnitId: "co-unit" };
      await assert.rejects(registerCommunityDemand(context, { ...demandInput, responsibleUnitId: "co-restricted" }), /não autorizado/);
      await assert.rejects(registerCommunityDemand({ ...context, jurisdiction: "LEGISLATIVE" }, demandInput), /Audiência não encontrada/);
      const demand = await registerCommunityDemand(context, demandInput);
      await f.database.exec(`CREATE FUNCTION co_fail_demand_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PLANNING_DEMAND_DECIDE' THEN RAISE EXCEPTION 'catalog audit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_demand_audit BEFORE INSERT ON "FinancialAuditLog" FOR EACH ROW EXECUTE FUNCTION co_fail_demand_audit();`);
      await assert.rejects(decideCommunityDemand(context, { demandId: demand, status: "ACCEPTED", opinion: "Encaminhada à unidade" }), financeDatabaseError(/catalog audit rollback/));
      assert.equal((await db.select().from(catalogCommunityDemands).where(eq(catalogCommunityDemands.id, demand)))[0].status, "PENDING");
      await f.database.exec(`DROP TRIGGER co_fail_demand_audit ON "FinancialAuditLog"; DROP FUNCTION co_fail_demand_audit();`);
      assert.equal(await decideCommunityDemand(context, { demandId: demand, status: "ACCEPTED", opinion: "Encaminhada à unidade" }), demand);
      await assert.rejects(decideCommunityDemand(context, { demandId: demand, status: "REJECTED", opinion: "Outra decisão" }), /já foi analisada/);
      const [audit] = await db.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, hearing), eq(financialAuditLogs.action, "PLANNING_HEARING_CREATE")));
      assert.deepEqual(audit.payload, { instrumentId: piece.ppa, heldAt: "2026-06-01T12:34:56.789Z" });
    });

    await t.test("credits preserve origin/source reservations, segregation, replay and atomic legal effects", async () => {
      const piece = await f.chain("credit", { status: "SANCTIONED" });
      const e1 = await f.line(piece), e2 = await f.line(piece, { code: "E2", value: "0.00" });
      const input = { instrumentId: piece.loa, number: "1", type: "Remanejamento", origin: "CANCELLATION", originEvidence: "Anulação por fonte", originLimit: "0", justification: "Revisão municipal", items: "E1;-;10.01\nE2;+;10.01", submissionKey: randomUUID() };
      const batchId = await createPlanningCreditPreview(context, input);
      assert.equal(await createPlanningCreditPreview(context, input), batchId);
      await assert.rejects(createPlanningCreditPreview(context, { ...input, justification: "Mudança" }), /dados diferentes/);
      assert.equal((await db.select().from(planningCreditLines).where(and(eq(planningCreditLines.batchId, batchId), eq(planningCreditLines.lineId, e1))))[0].reserved.toFixed(2), "10.01");
      await assert.rejects(createPlanningCreditPreview(context, { ...input, number: "2", items: "E1;-;100.11\nE2;+;100.11", submissionKey: randomUUID() }), /insuficiente/);
      const transition = { instrumentId: piece.loa, batchId, effectiveAt: "2026-06-01", legalActNumber: "Lei-credito-1", legalText: "Texto jurídico preservado", reason: "Redistribuição municipal" };
      await assert.rejects(transitionPlanningCredit(context, { ...transition, stage: "APPROVE" }), /distinto/);
      await f.database.exec(`INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('co-credit-document','Ato legal','Ato','fixture://act',CURRENT_TIMESTAMP); INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256") VALUES ('co-credit-document-v1','co-credit-document',1,'fixture://act','${"a".repeat(64)}');`);
      await db.insert(planningDocumentLinks).values({ id: "co-credit-document-link", instrumentId: piece.loa, documentId: "co-credit-document", documentVersionId: "co-credit-document-v1", purpose: "LEGAL_ACT", targetKey: "LEGAL_ACT:instrument", createdById: context.user.id });
      for (const [stage, actor] of [["APPROVE", "approver"], ["SANCTION", "sanctioner"], ["PUBLISH", "sanctioner"], ["EXECUTE", "sanctioner"]] as const) {
        if (stage === "EXECUTE") {
          // The reduction, first outbox command and snapshot are written before
          // the increase fails. Every one of them must roll back together.
          await f.database.exec(`CREATE FUNCTION co_fail_credit_increase() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value > 0 THEN RAISE EXCEPTION 'catalog credit rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER co_fail_credit_increase BEFORE INSERT ON "PlanningLineMovement" FOR EACH ROW EXECUTE FUNCTION co_fail_credit_increase();`);
          await assert.rejects(transitionPlanningCredit(f.actor(actor), { ...transition, stage }), financeDatabaseError(/catalog credit rollback/));
          assert.equal((await db.execute<{ total: number }>(sql`SELECT count(*)::integer AS total FROM "PlanningLineMovement" WHERE "lineId" IN (${e1},${e2})`)).rows[0].total, 0);
          assert.equal((await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.loa))).length, 0);
          assert.equal((await db.select().from(planningIntegrationCommands).where(sql`${planningIntegrationCommands.payload}->>'instrumentId'=${piece.loa}`)).length, 0);
          assert.equal((await db.select().from(planningCreditBatches).where(eq(planningCreditBatches.id, batchId)))[0].status, "PUBLISHED");
          assert.equal((await db.select().from(planningInstruments).where(eq(planningInstruments.id, piece.loa)))[0].revision, 1);
          await f.database.exec(`DROP TRIGGER co_fail_credit_increase ON "PlanningLineMovement"; DROP FUNCTION co_fail_credit_increase();`);
        }
        assert.equal(await transitionPlanningCredit(f.actor(actor), { ...transition, stage }), batchId);
        assert.equal(await transitionPlanningCredit(f.actor(actor), { ...transition, stage }), batchId);
      }
      const [batch] = await db.select().from(planningCreditBatches).where(eq(planningCreditBatches.id, batchId));
      const [request] = await db.select().from(financeCreditRequests).where(eq(financeCreditRequests.id, batch.creditRequestId));
      assert.equal(batch.status, "EXECUTED");
      assert.equal(request.legalActDate?.toISOString(), "2026-06-01T00:00:00.000Z");
      assert.equal((await db.select().from(planningCreditLines).where(eq(planningCreditLines.batchId, batchId))).every(row => row.reserved.isZero()), true);
      const movements = await db.execute<{ lineId: string; value: string }>(sql`SELECT "lineId", value::text FROM "PlanningLineMovement" WHERE "lineId" IN (${e1}, ${e2})`);
      assert.deepEqual(movements.rows.map(row => [row.lineId, row.value]).sort(), [[e1, "-10.01"], [e2, "10.01"]].sort());
      const versions = await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.loa));
      assert.equal(versions.length, 2);
      for (const version of versions) {
        assert.equal(version.hash, contentHash(version.snapshot));
        assert.match(JSON.stringify(version.snapshot), /co-credit-document-v1/);
      }
    });

    await t.test("legislative amendments preserve proposal, selected items, history and closed-tree memory", async () => {
      const piece = await f.chain("amendment", { status: "SANCTIONED" });
      const e1 = await f.line(piece), e2 = await f.line(piece, { code: "E2", value: "0" });
      await db.insert(legislatures).values({ id: "co-legislature", numero: 1, inicio: new Date("2025-01-01"), fim: new Date("2028-12-31") });
      await db.insert(councilors).values({ id: "co-councilor", nomeCompleto: "Vereadora", nomeParlamentar: "Vereadora", legislaturaId: "co-legislature", active: true });
      await setPlanningAmendmentBlock(context, { instrumentId: piece.loa, lineId: e1, blocked: "true", reason: "Análise" });
      const input = { instrumentId: piece.loa, number: "EM-1", date: "2026-05-01", objective: "Revisão de prioridades", justification: "Interesse público", councilorId: "co-councilor", legalText: "Memória legislativa", items: "E1;-;1.01\nE2;+;1.01" };
      await assert.rejects(createLegislativePlanningAmendment(context, input), /bloqueada/);
      await setPlanningAmendmentBlock(context, { instrumentId: piece.loa, lineId: e1, blocked: "false", reason: "Análise concluída" });
      const amendmentId = await createLegislativePlanningAmendment(context, input);
      const decision = { instrumentId: piece.loa, amendmentId, decision: "APPROVED", effectiveAt: "2026-06-02", legalActNumber: "Lei-emenda-1", reason: "Decisão legislativa" };
      await assert.rejects(decideLegislativePlanningAmendment(context, decision), /distinto/);
      assert.equal(await decideLegislativePlanningAmendment(f.actor("approver"), decision), amendmentId);
      assert.equal(await decideLegislativePlanningAmendment(f.actor("approver"), decision), amendmentId);
      await assert.rejects(decideLegislativePlanningAmendment(f.actor("approver"), { ...decision, reason: "Mudança" }), /já foi decidida/);
      assert.equal((await db.select().from(catalogAmendmentItems).where(eq(catalogAmendmentItems.amendmentId, amendmentId))).every(row => row.sanctioned), true);
      assert.equal((await db.select().from(planningLines).where(eq(planningLines.id, e1)))[0].originalValue.toFixed(2), "100.11");
      assert.equal((await db.select().from(planningLines).where(eq(planningLines.id, e2)))[0].originalValue.toFixed(2), "0.00");
      await assert.rejects(db.update(catalogLegislativeAmendments).set({ legalText: "Reescrita" }).where(eq(catalogLegislativeAmendments.id, amendmentId)), financeDatabaseError(/Decided planning amendments are immutable/));
      await assert.rejects(maintainPlanningRecord(context, { instrumentId: piece.ppa, entity: "OBJECTIVE", programId: piece.programId, code: "02", description: "Objetivo revisado" }), /exige data, ato/);
      const objectiveId = await maintainPlanningRecord(context, { instrumentId: piece.ppa, entity: "OBJECTIVE", programId: piece.programId, code: "02", description: "Objetivo revisado", effectiveAt: "2026-07-01", legalActNumber: "Lei-revisao", legalText: "Texto preservado", reason: "Revisão formal" });
      assert.ok(objectiveId);
      assert.equal((await db.select().from(planningMultiYearPlans).where(eq(planningMultiYearPlans.id, piece.ppaId)))[0].status, "SANCTIONED");
      assert.equal((await db.select().from(planningVersions).where(eq(planningVersions.instrumentId, piece.ppa))).length, 2);
    });

    await t.test("legacy binding preserves balances and replay; availability/monthly readers retain filters", async () => {
      // The reduced-code scenario retains maintenance:piece-loa implanted for
      // co-entity/2026. Keep that evidence and use a separate financial year.
      const year = 2027;
      const piece = await f.chain("legacy", { year });
      const e1 = await f.line(piece, { appropriation: true });
      const [line] = await db.select().from(planningLines).where(eq(planningLines.id, e1));
      const appropriationId = line.appropriationId!;
      await db.update(planningLines).set({ appropriationId: null }).where(eq(planningLines.id, e1));
      const input = { instrumentId: piece.loa, lineId: e1, appropriationId, reason: "Conciliação documental", accountingEvidence: "Saldo contábil verificado" };
      assert.equal(await reconcilePlanningLegacyAppropriation(context, input), e1);
      assert.equal(await reconcilePlanningLegacyAppropriation(context, input), e1);
      await assert.rejects(reconcilePlanningLegacyAppropriation(context, { ...input, reason: "Outra memória" }), /outros dados/);
      const [appropriation] = await db.select().from(planningAppropriations).where(eq(planningAppropriations.id, appropriationId));
      assert.equal(appropriation.updatedValue, 100.11);
      assert.equal(appropriation.updatedValueDecimal?.toFixed(2), "100.11");
      await db.update(planningInstruments).set({ implantedAt: new Date(`${year}-01-01T00:00:00.000Z`) }).where(eq(planningInstruments.id, piece.loa));
      await db.insert(planningQuotas).values({ id: "co-quota", lineId: e1, month: 1, planned: new Decimal("100.11"), consumed: new Decimal("10.01"), blocked: new Decimal("5.00"), method: "MANUAL", calculation: {} });
      await db.insert(budgetReservations).values({ id: "co-reservation", number: "CO-RESERVA-1", appropriationId, date: new Date(`${year}-01-01`), value: 2.01, valueDecimal: new Decimal("2.01"), status: "Ativa" });
      const budget = await getImplantedPlanningBudget(context, piece.loa, "999");
      assert.equal(budget.year, year);
      assert.equal(budget.page, 1);
      assert.equal(budget.records[0].available, "83.09");
      assert.equal(budget.capabilities.accountingPending, true);
      await db.insert(planningQuotaEvents).values([
        { id: "co-consume", quotaId: "co-quota", type: "CONSUME", effectiveAt: new Date(`${year}-01-10`), value: new Decimal("10.01"), reason: "Empenho", submissionKey: "finance:commitment:1", createdById: context.user.id },
        { id: "co-reverse", quotaId: "co-quota", type: "REVERSE", effectiveAt: new Date(`${year}-01-11`), value: new Decimal("0.01"), reason: "Estorno", submissionKey: "finance:reversal:1", createdById: context.user.id },
        { id: "co-pay", quotaId: "co-quota", type: "PAY", effectiveAt: new Date(`${year}-01-12`), value: new Decimal("2.01"), reason: "Pagamento bruto", submissionKey: "finance:payment:1", createdById: context.user.id },
        { id: "co-future", quotaId: "co-quota", type: "CONSUME", effectiveAt: new Date(`${year}-02-01`), value: new Decimal("50.00"), reason: "Fora do corte", submissionKey: "finance:future:1", createdById: context.user.id },
        { id: "co-unrelated", quotaId: "co-quota", type: "CONSUME", effectiveAt: new Date(`${year}-01-10`), value: new Decimal("99.00"), reason: "Outro produtor", submissionKey: "manual:1", createdById: context.user.id },
      ]);
      await assert.rejects(readPlanningMonthlyExecution(context, piece.loa, 2026, "2026-01-31"), /Selecione a LOA do exercício de execução/);
      const monthly = await readPlanningMonthlyExecution(context, piece.loa, year, `${year}-01-31`);
      assert.equal(monthly.status, "INCOMPLETE");
      assert.equal(monthly.rows.length, 12);
      assert.equal(monthly.rows[0].year, year);
      assert.equal(monthly.rows[0].realized, "10.00");
      assert.equal(monthly.rows[0].paidGross, "2.01");
      assert.deepEqual([...monthly.rows[0].sourceEventIds].sort(), ["co-consume", "co-pay", "co-reverse"]);
      await assert.rejects(getImplantedPlanningBudget({ ...context, jurisdiction: "LEGISLATIVE" }, piece.loa), /não encontrada/);
    });
  } finally { await f.close(); }
});
