import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { importPlanningCatalogVersion, publishPlanningCatalogVersion, parsePlanningCatalogCsv } from "../src/lib/planejamento/classification";
import { addPlanningAction, addPlanningLine, addPlanningProgram, createPlanningInstrument } from "../src/lib/planejamento/service";
import { maintainPlanningRecord } from "../src/lib/planejamento/maintenance";
import { planningLookup } from "../src/lib/planejamento/lookups";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createCommitment, createRevenue } from "../src/lib/financeiro";
import { importPlanningLines, importPlanningStructure, previewPlanningImport } from "../src/lib/planejamento/imports";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { ingestPlanningDocument, readPlanningDocument } from "../src/lib/planejamento/documents";
import { linkPlanningLegislativeProcedure, advancePlanningLegislativeProcedure } from "../src/lib/planejamento/legislative-bridge";
import type { uploadFile } from "../src/lib/platform/blob";
import { readPlanningRclExecution, synchronizePlanningWaiver } from "../src/lib/planejamento/fiscal-execution";
import { generatePlanningReport } from "../src/lib/planejamento/reports";
import { projectPlanningAnnualMemory } from "../src/lib/planejamento/projections";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { planningInstruments, planningLines } from "../src/db/schema/planning-budget";
import { planningInstrumentSources, planningLegislativeLinks, planningMemories, planningPlannedWorks, planningPrograms, planningVersions, planningWaivers } from "../src/db/schema/planning-legal";
import { financialYears } from "../src/db/schema/finance-years";
import { monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { documentClasses } from "../src/db/schema/document-workflow";
import { councilors, laws, legislatures, propositions } from "../src/db/schema/chamber";
import { readPlanningInstrument } from "../src/db/repositories/planning/instruments";

export const catalogCsv = ["kind;code;name;degree;parentCode;tceCode;stnGroup;stnSpecification;stnDetail", "SOURCE;000;Recursos ordinários;1;;000;1;500;000", "REVENUE;1;Receitas correntes;1;;;;;", "REVENUE;1.7.1.1.51;Transferências da União;6;1;;;;", "EXPENSE;3;Despesas correntes;1;;;;;", "EXPENSE;3.3.90.39;Serviços de terceiros;6;3;;;;"].join("\n");

test("S3: classificação por edição, árvore, replay, imutabilidade e código composto em orçamento só por fonte", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    assert.throws(() => parsePlanningCatalogCsv(catalogCsv.replace(";6;3", ";1;3")), /grau inconsistente/);
    const input = { year: 2026, label: "Classificações municipais 2026", normativeReference: "Referência da base isolada", csv: catalogCsv };
    const version = await importPlanningCatalogVersion(f.context, input);
    assert.equal(await importPlanningCatalogVersion(f.context, input), version);
    await publishPlanningCatalogVersion(f.context, { versionId: version });
    await assert.rejects(f.pg.query('UPDATE "PlanningCatalogEntry" SET name=$1 WHERE "versionId"=$2', ["Outra classificação", version]), /immutable/);
    const ppa = await createPlanningInstrument(f.context, { governmentEntityId: "ente", kind: "PPA", code: "CLASS-2026", title: "PPA por destinação", startYear: 2026, endYear: 2029, revenueDegree: 6, expenseDegree: 6, expenseLevel: "SOURCE", catalogVersionId: version });
    const program = await addPlanningProgram(f.context, { instrumentId: ppa, code: "0010", name: "Serviços Municipais", type: "Gestão", origin: "Plano de governo", objectiveCode: "01", objective: "Manter serviços", guidelines: "Continuidade", targetAudience: "População", financing: "Recursos ordinários", managerName: "Ana Paula Martins", indicatorName: "Atendimentos", indicatorUnit: "atendimentos", baselineValue: 10, targetValue: 20 });
    const action = await addPlanningAction(f.context, { instrumentId: ppa, programId: program, code: "2010", name: "Atendimento municipal", type: "Atividade" });
    const line = { instrumentId: ppa, kind: "EXPENSE", code: "E", description: "Programação por fonte", year: 2026, budgetUnitId: "ug", resourceSourceId: "livre", programId: program, actionId: action, functionCode: "04", subfunctionCode: "122", product: "Atendimentos", productUnit: "atendimentos", originalValue: "20.00" };
    const first = await addPlanningLine(f.context, line);
    const second = await addPlanningLine(f.context, { ...line, code: "E-2027", year: 2027 });
    const records = await f.db.select().from(planningLines).where(inArray(planningLines.id, [first, second]));
    assert.ok(records.every((record) => record.reducedCode?.startsWith("01.01.04.122.0010.2010.")));
    assert.equal(new Set(records.map((record) => record.reducedCode)).size, 2);
    assert.ok(records.every((record) => (record.classificationSnapshot as { versionId: string }).versionId === version));
    assert.equal((await f.db.select({ value: count() }).from(planningInstrumentSources).where(eq(planningInstrumentSources.instrumentId, ppa)))[0].value, 1);
  } finally { await f.close(); }
});

test("S4: múltiplos objetivos/indicadores, manutenção legal compartilhada e obras/prioridades LDO completas", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    const [program] = await f.db.select().from(planningPrograms).where(eq(planningPrograms.id, f.expenseInput.programId));
    await assert.rejects(maintainPlanningRecord(f.context, { instrumentId: f.ppa, entity: "PROGRAM", recordId: program.id, ...program, name: "Gestão Municipal Integrada", reason: "Adequação do programa" }), /exige data, ato/);
    const legal = { effectiveAt: "2026-02-01", legalActNumber: "Lei 2/2026", legalText: "Adequação autorizada", reason: "Revisão da organização do programa" };
    await maintainPlanningRecord(f.context, { ...program, instrumentId: f.ppa, entity: "PROGRAM", recordId: program.id, name: "Gestão Municipal Integrada", ...legal });
    const [preserved] = await f.db.select().from(planningVersions).where(and(eq(planningVersions.instrumentId, f.loa), eq(planningVersions.number, 1))).limit(1);
    assert.ok(JSON.stringify(preserved.snapshot).includes("Gestão Municipal"));
    assert.ok(!JSON.stringify(preserved.snapshot).includes("Gestão Municipal Integrada"));
    const objective = await maintainPlanningRecord(f.context, { instrumentId: f.ppa, entity: "OBJECTIVE", programId: program.id, code: "02", description: "Ampliar atendimento", ...legal });
    await maintainPlanningRecord(f.context, { instrumentId: f.ppa, entity: "INDICATOR", objectiveId: objective, name: "Famílias atendidas", unit: "famílias", baselineValue: 10, targetValue: 30, ...legal });
    const [ldo] = await f.db.select().from(planningInstruments).where(eq(planningInstruments.kind, "LDO")).limit(1);
    const work = await maintainPlanningRecord(f.context, { instrumentId: ldo.id, entity: "WORK", title: "Reforma do Centro Municipal", type: "CONSERVATION", location: "Centro", legalReference: "Diretrizes municipais", year: 2026, value: "100.00", startsAt: "2026-03-01", conservationValue: "80.00", newProjectsValue: "20.00" });
    assert.equal((await f.db.select().from(planningPlannedWorks).where(eq(planningPlannedWorks.id, work)))[0].conservationValue.toFixed(2), "80.00");
    await maintainPlanningRecord(f.context, { instrumentId: ldo.id, entity: "PRIORITY", description: "Atendimento à população", targetValue: "100.00" });
    await maintainPlanningRecord(f.context, { instrumentId: ldo.id, entity: "RISK", description: "Redução de transferências", estimatedImpact: "20.00", mitigation: "Reserva e revisão de prioridades" });
    const options = await planningLookup(f.context, { field: "programId", instrumentId: f.ppa, q: "Integrada", page: 1 });
    assert.equal(options.total, 1);
  } finally { await f.close(); }
});

test("S5: realizado anterior, ano explícito, prévia com hash/replay e importação independente de vínculos", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE; process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Awaited<ReturnType<typeof createPlanningExecutionFixture>> | undefined;
  try {
    const f = await createPlanningExecutionFixture(); fixture = f;
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await createRevenue(f.connection, f.actor, { date: new Date("2026-01-01"), value: "30.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "COLLECT", idempotencyKey: "completion:income" });
    const reservation = await f.reserve("COMPLETION-RES", "2.00");
    await createCommitment(f.connection, f.actor, { number: "NE-COMPLETION", date: new Date("2026-09-01"), value: "2.00", type: "Ordinário", history: "Serviços municipais", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
    await f.db.insert(financialYears).values({ id: "2027", governmentEntityId: "ente", year: 2027, status: "Preparação", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31") });
    const common = { governmentEntityId: "ente", startYear: 2027, endYear: 2027, revenueDegree: 6, expenseDegree: 6, expenseLevel: "ELEMENT_SOURCE" };
    const ldo = await createPlanningInstrument(f.context, { ...common, kind: "LDO", code: "2027", title: "Diretrizes 2027", parentId: f.ppa });
    const loa = await createPlanningInstrument(f.context, { ...common, kind: "LOA", code: "2027", title: "Orçamento 2027", parentId: ldo });
    const input = { sourceInstrumentId: f.loa, targetInstrumentId: loa, sourceYear: 2026, targetYear: 2027, mode: "REALIZED", realizedStage: "EMPENHADA", lineCodes: "R,E1" };
    const preview = await previewPlanningImport(f.context, input);
    assert.equal(preview.revenue, "30.00"); assert.equal(preview.expense, "2.00");
    const submission = { ...input, submissionKey: randomUUID(), expectedSourceRevision: preview.sourceRevision, expectedTargetRevision: preview.targetRevision, expectedValuesHash: preview.valuesHash };
    const batch = await importPlanningLines(f.context, submission);
    assert.equal(await importPlanningLines(f.context, submission), batch);
    assert.equal((await readPlanningInstrument(f.db, loa))!.annualBudgetLaw!.totalExpense.toFixed(2), "2.00");
    await importPlanningStructure(f.context, { sourceInstrumentId: f.loa, targetInstrumentId: loa, kind: "SOURCES" });
    assert.equal((await f.db.select({ value: count() }).from(planningInstrumentSources).where(eq(planningInstrumentSources.instrumentId, loa)))[0].value, 1);
    await assert.rejects(importPlanningLines(f.context, { ...submission, submissionKey: randomUUID(), sourceYear: 2025 }), /vigência/);
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});

test("S6: ingresso GED atômico/hash, recusa de escopo parcial e tramitação em proposição/lei canônicas", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.insert(documentClasses).values({ code: "PLANEJAMENTO_ANEXO", label: "Anexo orçamentário", signaturePolicy: "INTERNAL_ALLOWED", isActive: true });
    const bytes = Buffer.from("%PDF-1.7\nAnexo orçamentário municipal\n%%EOF");
    const file = new File([bytes], "anexo.pdf", { type: "application/pdf" });
    const store: typeof uploadFile = async () => ({ url: "https://arquivos.example.org/anexo.pdf", downloadUrl: "https://arquivos.example.org/anexo.pdf", pathname: "isolated/documents/anexo.pdf", contentType: "application/pdf", contentDisposition: "attachment; filename=anexo.pdf", etag: createHash("sha256").update(bytes).digest("hex") });
    const linkId = await ingestPlanningDocument(f.context, { instrumentId: f.loa, title: "Anexo da lei orçamentária", purpose: "ANNEX", documentClassCode: "PLANEJAMENTO_ANEXO" }, file, store);
    const document = await readPlanningDocument(f.context, linkId);
    assert.equal(document.version.hashSha256, createHash("sha256").update(bytes).digest("hex"));
    await assert.rejects(readPlanningDocument({ ...f.context, user: { ...f.context.user, profileCode: "BUDGET_ANALYST" } }, linkId), /todas as unidades/);
    await f.db.insert(legislatures).values({ id: "2025-2028", numero: 1, inicio: new Date("2025-01-01"), fim: new Date("2028-12-31") });
    await f.db.insert(councilors).values({ id: "vereador-referencia", nomeCompleto: "Rafael Augusto Pereira", nomeParlamentar: "Rafael Pereira", legislaturaId: "2025-2028", active: true });
    const [proposal] = await f.db.insert(propositions).values({ numero: "PL-1/2026", tipo: "Projeto de Lei", ementa: "Orçamento Municipal", autorId: "vereador-referencia", status: "Protocolada" }).returning();
    const link = await linkPlanningLegislativeProcedure(f.context, { instrumentId: f.loa, propositionId: proposal.id, reference: "Processo legislativo do orçamento" });
    const stage = { linkId: link, date: "2026-03-01", reason: "Decisão registrada na Câmara" };
    await advancePlanningLegislativeProcedure(f.context, { ...stage, stage: "ANALYZE" });
    await advancePlanningLegislativeProcedure(f.context, { ...stage, stage: "AGENDA" });
    await assert.rejects(advancePlanningLegislativeProcedure(f.context, { ...stage, stage: "APPROVE" }), /distinto/);
    await advancePlanningLegislativeProcedure(f.reviewer, { ...stage, stage: "APPROVE" });
    await f.pg.exec(`INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('carolina','Carolina Mendes','carolina.mendes@example.org','planning-profile',NOW())`);
    const authority = { ...f.context, user: { ...f.context.user, id: "carolina" } };
    await advancePlanningLegislativeProcedure(authority, { ...stage, stage: "SANCTION", lawNumber: "1/2026", legalText: "Orçamento municipal aprovado" });
    await advancePlanningLegislativeProcedure(authority, { ...stage, stage: "PUBLISH" });
    assert.equal((await f.db.select().from(propositions).where(eq(propositions.id, proposal.id)))[0].status, "Sancionada");
    const [law] = await f.db.select().from(laws).where(eq(laws.proposicaoId, proposal.id)).limit(1);
    assert.ok(law.dataPublicacao);
    assert.equal((await f.db.select().from(planningLegislativeLinks).where(eq(planningLegislativeLinks.id, link)))[0].lawId, law.id);
  } finally { await f.close(); }
});

test("S7: RCL de doze competências, renúncia tributária vinculada e projeções anuais reproduzíveis", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE; process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let fixture: Awaited<ReturnType<typeof createPlanningExecutionFixture>> | undefined;
  try {
    const f = await createPlanningExecutionFixture(); fixture = f;
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await createRevenue(f.connection, f.actor, { date: new Date("2026-03-01"), value: "50.00", revenueNatureId: "receita", resourceSourceId: "livre", bankAccountId: "banco", sourceModule: "FINANCEIRO", sourceType: "REVENUE", eventType: "COLLECT", idempotencyKey: "s7:receipt" });
    const references = [{ budgetUnitId: "ug", resourceSourceId: "livre", revenueNature: { id: "receita" } }];
    assert.equal((await readPlanningRclExecution(f.context, "ente", references, "2026-09-30")).status, "INCOMPLETE");
    await f.db.insert(financialYears).values({ id: "2025", governmentEntityId: "ente", year: 2025, status: "Encerrado", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") });
    for (let index = 0; index < 12; index++) { const date = new Date(Date.UTC(2025, 9 + index, 1)); await f.db.insert(monthlyAccountingCloses).values({ financialYearId: date.getUTCFullYear() === 2025 ? "2025" : "ano", competence: date, status: "FECHADO" }); }
    const rcl = await readPlanningRclExecution(f.context, "ente", references, "2026-09-30"); assert.equal(rcl.total, "50.00"); assert.equal(rcl.rows.length, 12);
    await f.pg.exec(`INSERT INTO "Tax" (id,name,"taxType","isActive","updatedAt") VALUES ('taxa-s7','Taxa Municipal','Taxa',true,NOW());
      INSERT INTO "Taxpayer" (id,"taxpayerType","updatedAt") VALUES ('contribuinte','JURIDICA',NOW());
      INSERT INTO "TaxFinancialMapping" (id,"taxId","revenueNatureId","resourceSourceId","defaultBankAccountId","isActive","updatedAt") VALUES ('mapa-s7','taxa-s7','receita','livre','banco',true,NOW());
      INSERT INTO "TaxAssessment" (id,year,"originalValue","originalValueDecimal","taxId","taxpayerId","updatedAt") VALUES ('assessment-s7',2026,20,20,'taxa-s7','contribuinte',NOW());
      INSERT INTO "TaxBenefitRule" (id,code,name,"benefitType","legalReference",eligibility,calculation,"effectiveFrom","createdByUsuarioId","updatedAt") VALUES ('regra-s7','REN-S7','Renúncia municipal','RENUNCIA','Lei municipal','{}','{}','2026-01-01','ana',NOW());
      INSERT INTO "TaxBenefitGrant" (id,"ruleId","taxpayerId","sourceType","sourceId","originalAmountDecimal","renunciationDecimal","finalAmountDecimal",status,"calculationSnapshot","grantedByUsuarioId","grantedAt") VALUES ('grant-s7','regra-s7','contribuinte','TAX_ASSESSMENT','assessment-s7',20,5,15,'CONCEDIDO','{}','ana','2026-03-01');`);
    const waiver = await maintainPlanningRecord(f.context, { instrumentId: f.ppa, entity: "WAIVER", year: 2026, description: "Renúncia da taxa municipal", taxId: "taxa-s7", legalReference: "Lei municipal", modality: "Isenção parcial", estimatedValue: "10.00", compensation: "Ampliação da base arrecadatória", compensationValue: "10.00", methodology: "Estimativa municipal" });
    await synchronizePlanningWaiver(f.context, { waiverId: waiver, asOf: "2026-09-30" });
    assert.equal((await f.db.select().from(planningWaivers).where(eq(planningWaivers.id, waiver)))[0].realizedValue?.toFixed(2), "5.00");
    await projectPlanningAnnualMemory(f.context, { instrumentId: f.ppa, kind: "REVENUE", baseValue: "100.00", rates: "10;10;10;10", normativeReference: "Referência da base isolada", methodology: "Projeção cumulativa anual" });
    const memories = await f.db.select().from(planningMemories).where(eq(planningMemories.instrumentId, f.ppa)).orderBy(asc(planningMemories.year));
    assert.deepEqual(memories.map((memory) => memory.resultValue.toFixed(2)), ["110.00", "121.00", "133.10", "146.41"]);
    const report = await generatePlanningReport(f.context, { instrumentIds: f.ppa, type: "WAIVERS", asOf: "2026-09-30" }); assert.equal(report.sections[0].rows[0].realizada, "5.00");
  } finally { await fixture?.close(); if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; }
});
