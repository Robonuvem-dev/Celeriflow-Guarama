import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { constructionCases, constructionConfigVersions, constructionDistributionVersions, constructionParticipants, constructionReviews } from "../src/db/schema/construction-core";
import { constructionDefinitionVersions } from "../src/db/schema/construction-viability";
import { constructionMessages, constructionStaffRoles, constructionTerms, constructionTermAcceptances } from "../src/db/schema/construction-portal";
import { employees } from "../src/db/schema/administration";
import { documentVersions } from "../src/db/schema/document-workflow";
import { processes } from "../src/db/schema/processes";
import { definitionSchema, evaluateConstructionViability, professionalSchema, validateConstructionFields } from "../src/lib/obras/construction-rules";
import { reviewConstructionProject, resubmitConstructionProject } from "../src/lib/obras/construction-review";
import { appendConstructionMessage } from "../src/lib/obras/construction-conversation";
import { createConstructionRequestsFixture } from "./helpers/construction-requests-fixture";

test("campos configuráveis validam tipos, opções, obrigatoriedade e chaves", () => {
  const definition = { fields: [{ key: "use", label: "Uso", type: "CHOICE", required: true, options: ["Residencial"] }, { key: "date", label: "Data", type: "DATE", required: false, options: [] }], checks: [], documents: [] };
  assert.deepEqual(validateConstructionFields(definition, { use: " Residencial " }), { use: "Residencial", date: "" });
  assert.throws(() => validateConstructionFields(definition, {}), /obrigatório/);
  assert.throws(() => validateConstructionFields(definition, { use: "Comercial" }), /opção inválida/);
  assert.throws(() => validateConstructionFields(definition, { use: "Residencial", date: "2026-02-30" }), /data inválida/);
  assert.throws(() => validateConstructionFields(definition, { use: "Residencial", unknown: "x" }), /não previstos/);
  assert.equal(definitionSchema.safeParse({ ...definition, fields: [...definition.fields, definition.fields[0]] }).success, false);
  assert.equal(professionalSchema.safeParse({ personId: "person", professionalType: "ENGINEER", council: "CRECI", registration: "PR123", startsAt: "2026-10-10", endsAt: "", isActive: true }).success, false);
});

test("viabilidade respeita precisão, limites e ausência de regra automática vigente", () => {
  const rule = { code: "ZT", name: "Zona de teste", legalBasis: "Parâmetros demonstrativos", startsAt: "2026-01-01", endsAt: "", allowedPurposeIds: ["residential"], allowedCategories: ["BUILDING"], minimumLandArea: "100", maxFloorAreaRatio: "1.5", automatic: true };
  const input = { category: "BUILDING", purposeId: "residential", landArea: "100.0001", proposedArea: "150.0001", today: "2026-10-10" };
  assert.equal(evaluateConstructionViability(input, rule).outcome, "APPROVED");
  assert.equal(evaluateConstructionViability({ ...input, proposedArea: "150.0003" }, rule).outcome, "DENIED");
  assert.equal(evaluateConstructionViability({ ...input, proposedArea: "150.0002" }, rule).outcome, "DENIED");
  assert.equal(evaluateConstructionViability({ ...input, purposeId: "industrial" }, rule).outcome, "DENIED");
  assert.equal(evaluateConstructionViability(input, { ...rule, automatic: false }).outcome, "MANUAL");
  assert.equal(evaluateConstructionViability(input, { ...rule, startsAt: "2027-01-01" }).outcome, "MANUAL");
  assert.equal(evaluateConstructionViability({ ...input, landArea: "0" }, rule).outcome, "MANUAL");
});

test("Drizzle: parecer, exigência, retorno ao analista inicial, gate de reanálise, comunicação e rollback", async () => {
  const f = await createConstructionRequestsFixture();
  const db = f.db, pg = f.database;
  const access = { administrator: false, employeeId: "analyst-a", departmentId: "sector", roles: ["ANALYST"] };
  const input = { caseId: "case", requestKey: randomUUID(), revision: 0, definitionVersion: 1, reviewType: "PROJECT", decision: "APPROVED", notes: "Parecer técnico", checks: {}, documentIds: {}, fieldValues: {} };
  const review = (data: unknown, scope = access, actor = "manager-user") => f.transaction(tx => reviewConstructionProject(tx, scope, actor, data));
  const reviewCount = async () => (await db.select({ total: count() }).from(constructionReviews))[0].total;
  const readCase = async () => (await db.select().from(constructionCases).where(eq(constructionCases.id, "case")))[0];
  try {
    await pg.exec(readFileSync("prisma/migrations-ibema/20261010190000_construction_analyst_replacement/migration.sql", "utf8"));
    await db.insert(employees).values(["analyst-a", "analyst-b"].map(id => ({ id, name: id, secretariatId: "secretariat", departmentId: "sector" })));
    await db.insert(constructionStaffRoles).values(["analyst-a", "analyst-b"].map(employeeId => ({ employeeId, departmentId: "sector", role: "ANALYST", startsAt: new Date("2020-01-01T00:00:00Z") })));
    await db.insert(constructionDistributionVersions).values({ id: "distribution", departmentId: "sector", version: 1, strategy: "LOWEST_LOAD", publishedBy: "manager-user" });
    await db.insert(constructionConfigVersions).values({ id: "review-config", version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: false, subjectIds: [], areaWeights: {}, instructions: "Orientação", publishedBy: "manager-user" });
    await db.update(constructionCases).set({ configurationId: "review-config", reviewStatus: "SUBMITTED", firstAnalystId: null, assignedEmployeeId: "analyst-a" }).where(eq(constructionCases.id, "case"));
    await db.update(processes).set({ currentResponsibleEmployeeId: "analyst-a" }).where(eq(processes.id, "process"));
    await db.insert(processes).values({ id: "process-b", protocolNumber: "TEST-B", processTypeId: "type", subjectId: "subject", currentDepartmentId: "sector", currentResponsibleEmployeeId: "analyst-b" });
    await db.insert(constructionCases).values({ ...await readCase(), id: "case-b", requestKey: randomUUID(), processId: "process-b", assignedEmployeeId: "analyst-b" });
    await db.insert(constructionDefinitionVersions).values({ id: "checklist", kind: "PERMIT", version: 1, definition: { fields: [], checks: [{ key: "rule", label: "Regra urbanística", required: true }], documents: [{ label: "Projeto", required: true }] }, publishedBy: "manager-user" });
    await assert.rejects(pg.exec(`UPDATE "ConstructionDefinitionVersion" SET version=2 WHERE id='checklist'`));
    await assert.rejects(pg.exec(`DELETE FROM "ConstructionDistributionVersion" WHERE id='distribution'`));
    // Distribution/replacement themselves have real-driver coverage in their own suite.
    await assert.rejects(review(input), /critérios obrigatórios/);
    await assert.rejects(review(input, { ...access, departmentId: "other" }), /indisponível/);
    const correction = { ...input, decision: "CORRECTION_REQUIRED" };
    await pg.exec(`CREATE FUNCTION reject_review_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$; CREATE TRIGGER reject_review_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_review_history()`);
    await assert.rejects(review(correction));
    assert.equal(await reviewCount(), 0); assert.equal((await readCase()).reviewStatus, "SUBMITTED");
    await pg.exec(`DROP TRIGGER reject_review_history ON "ProcessEvent"`);
    const reviewId = await review(correction);
    assert.equal(await review(correction), reviewId); assert.equal(await reviewCount(), 1);
    await assert.rejects(review(correction, access, "other-actor"), /Referência de parecer/);
    assert.ok((await readCase()).correctionDeadline instanceof Date);
    await assert.rejects(pg.query(`DELETE FROM "ConstructionReview" WHERE id=$1`, [reviewId]));
    // Same pre-replaced state as the previous integration fixture.
    await db.update(constructionCases).set({ firstAnalystId: "analyst-b", assignedEmployeeId: "analyst-b" }).where(eq(constructionCases.id, "case"));
    await db.update(processes).set({ currentResponsibleEmployeeId: "analyst-b" }).where(eq(processes.id, "process"));
    const newAccess = { ...access, employeeId: "analyst-b" };
    const resubmit = (scope = newAccess) => f.transaction(tx => resubmitConstructionProject(tx, scope, { caseId: "case", revision: 0, notes: "Projeto complementado" }));
    await assert.rejects(resubmit(access), /reservado ao responsável/);
    await resubmit(); await assert.rejects(resubmit(), /exigência pendente/);
    const record = await readCase();
    assert.equal(record.revisionCount, 1); assert.equal(record.assignedEmployeeId, "analyst-b"); assert.equal(record.reviewStatus, "RESUBMITTED");
    const approval = { ...input, requestKey: randomUUID(), revision: 1, checks: { rule: true }, documentIds: { Projeto: "current-project" } };
    await db.insert(documentVersions).values({ id: "version-cancelled", documentId: "current-project", versionNumber: 2, fileUrl: "/cancelled.pdf", hashSha256: "b".repeat(64), status: "CANCELLED" });
    await assert.rejects(review(approval, newAccess), /versão GED atual válida/);
    await db.update(documentVersions).set({ status: "FINAL" }).where(eq(documentVersions.id, "version-cancelled"));
    await db.update(constructionCases).set({ revisionCount: 2 }).where(eq(constructionCases.id, "case"));
    await assert.rejects(review({ ...approval, revision: 2 }, newAccess), /Taxa REANALYSIS/);
    assert.equal(await reviewCount(), 1);
    await db.update(constructionCases).set({ revisionCount: 1 }).where(eq(constructionCases.id, "case"));
    await review(approval, newAccess);
    assert.equal((await readCase()).reviewStatus, "APPROVED");
    const [term] = await db.insert(constructionTerms).values({ version: 2, text: "Termo atualizado", publishedBy: "manager-user" }).returning();
    const portalMessage = { caseId: "case", requestKey: randomUUID(), content: "Solicito esclarecimentos sobre o projeto." };
    const send = (data: unknown = portalMessage) => f.transaction(tx => appendConstructionMessage(tx, { identityId: "identity" }, data));
    await assert.rejects(send(), /Aceite o termo/);
    const [acceptance] = await db.insert(constructionTermAcceptances).values({ caseId: "case", identityId: "identity", termId: term.id }).returning();
    const messageId = await send(); assert.equal(await send(), messageId);
    await assert.rejects(send({ ...portalMessage, requestKey: randomUUID(), caseId: "case-b" }), /indisponível/);
    await assert.rejects(pg.query(`UPDATE "ConstructionMessage" SET content='alterado' WHERE id=$1`, [messageId]));
    await assert.rejects(pg.query(`DELETE FROM "ConstructionTermAcceptance" WHERE id=$1`, [acceptance.id]));
    await db.update(constructionParticipants).set({ isActive: false, endsAt: new Date() }).where(eq(constructionParticipants.identityId, "identity"));
    await assert.rejects(send({ ...portalMessage, requestKey: randomUUID() }), /indisponível/);
    assert.equal((await db.select().from(constructionMessages).where(eq(constructionMessages.id, messageId)))[0].identityId, "identity");
  } finally { await f.close(); }
});
