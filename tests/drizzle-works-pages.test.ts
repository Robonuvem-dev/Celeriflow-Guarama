import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import type { Database } from "../src/db/connection";
import type { WorksPageAccess } from "../src/lib/contracts/works-pages";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { runDatabaseMigrations } from "../scripts/database-migrate-core.mjs";
import { secretariats, departments, employees } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { companies, documents, realEstates, taxpayers } from "../src/db/schema/registry";
import { processes, processDocuments, processSubjects, processTypes } from "../src/db/schema/processes";
import { documentFolders, documentVersions } from "../src/db/schema/document-workflow";
import { constructionCases, constructionCaseProperties, constructionConfigVersions, constructionCatalogEntries, constructionReviews, constructionProfessionals, constructionPortalIdentities, constructionParticipants, constructionViabilityResults } from "../src/db/schema/construction-core";
import { constructionCompanyProfiles, constructionMessages, constructionProfessionalEmployers, constructionStaffRoles, constructionTerms } from "../src/db/schema/construction-portal";
import { constructionDefinitionVersions, constructionPropertyZones, constructionZoneVersions } from "../src/db/schema/construction-viability";
import { constructionDocumentTemplateVersions } from "../src/db/schema/construction-documents";
import { infrastructureWorks, infrastructureServices, infrastructureMeasurements, infrastructureTeams, infrastructureServiceTeams, infrastructureServiceDocuments, infrastructureTeamMembers } from "../src/db/schema/infrastructure";
import { taxes, taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import * as pages from "../src/db/schema/works-pages";
import { findPageCaseDetail, latestPageTerm, listPageAnalysts, listPageCaseOptions, listPageProcessDocuments, loadPageCaseList, loadPageConsultations, loadPageEvaluations, loadPageExtractions, loadPageMessages, loadPageParticipations, loadPageReplacements, loadPageReviews } from "../src/db/repositories/works-pages/cases";
import { loadPageCompanies, loadPageProfessionals, loadPageStaff, listPagePortalIdentities, listPagePortalProfessionals } from "../src/db/repositories/works-pages/professionals";
import { loadPageRules, loadPageSettings, loadPageTemplates } from "../src/db/repositories/works-pages/settings";
import { findPageLifecycle, loadPageInspectionQueue, loadPageLifecycleHistory, listPageLifecycleRequests } from "../src/db/repositories/works-pages/lifecycle";
import { findPageEnforcement, findPageEnforcementPrint, listPageEnforcementProperties, listPageInspectors, loadPageEnforcementHistory, loadPageEnforcementList } from "../src/db/repositories/works-pages/enforcement";
import { loadPageExports } from "../src/db/repositories/works-pages/integrations";
import { findPageGuide, loadPageTaxation } from "../src/db/repositories/works-pages/taxation";
import { listWorksDocuments, listWorksProjects, listWorksServices, loadWorksDashboard, loadWorksMeasurements, loadWorksReports, loadWorksTeams } from "../src/db/repositories/works-pages/infrastructure";

const instant = new Date("2026-10-28T00:30:12.345Z"), day = new Date("2026-10-28T00:00:00.000Z");
const start = new Date("2026-01-01T00:00:00.000Z");
const actor = "works-test-actor", caseId = "works-case-00", processId = "works-process-00";
const access: WorksPageAccess = { administrator: false, employeeId: "works-employee", departmentId: "works-dept-a", roles: ["MANAGER"] };
const admin: WorksPageAccess = { ...access, administrator: true };
const shape = { nested: { nullable: null, dateText: "2026-10-28", exactText: "9999999999.9999" }, flags: [true, false, "evidência"] };
const area = new Decimal("9999999999.9999");

async function seed(database: Database) {
  await database.insert(secretariats).values({ id: "works-secretariat", name: "Secretaria" });
  await database.insert(departments).values(["a", "b"].map(suffix => ({ id: `works-dept-${suffix}`, name: `Setor ${suffix}`, secretariatId: "works-secretariat" })));
  await database.insert(employees).values({ id: "works-employee", name: "Analista e fiscal", departmentId: access.departmentId });
  await database.insert(people).values({ id: "works-person", fullName: "Pessoa ' OR '1'='1' --", cpf: "12345678909", birthDate: instant });
  await database.insert(companies).values({ id: "works-company", corporateName: "Construtora de ensaio", cnpj: "12345678000195", openingDate: instant });
  await database.insert(taxpayers).values({ id: "works-taxpayer", taxpayerType: "PF", personId: "works-person" });
  await database.insert(realEstates).values({ id: "works-property", municipalInsc: "INSCR-TEST", streetName: "Rua de ensaio", taxpayerId: "works-taxpayer", landArea: 0.125, builtArea: null });
  await database.insert(processTypes).values({ id: "works-type", name: "Processo de construção" });
  await database.insert(processSubjects).values([{ id: "works-subject", name: "Solicitação", processTypeId: "works-type" }, { id: "works-subject-blocked", name: "Não abrir", processTypeId: "works-type", allowsInternalOpening: false }]);
  await database.insert(constructionConfigVersions).values({ id: "works-config", version: 1, freeRevisions: 2, correctionDays: 10, checkPropertyDebts: false, subjectIds: ["works-subject"], areaWeights: { existingArea: 1, expandedArea: 0, irregularArea: 0, renovationArea: 0, demolitionArea: 0 }, instructions: "Instruções", publishedBy: actor, publishedAt: instant });
  // The historical foundation already contains PURPOSE/Residencial. Keep its
  // reference rows intact and give this independently owned purpose a unique name.
  await database.insert(constructionCatalogEntries).values([{ id: "works-inspection-type", kind: "INSPECTION_TYPE", name: "Vistoria" }, { id: "works-purpose", kind: "PURPOSE", name: "Finalidade residencial da fixture works-pages" }]);
  for (let index = 0; index < 26; index++) {
    const suffix = String(index).padStart(2, "0");
    await database.insert(processes).values({ id: `works-process-${suffix}`, protocolNumber: `OBRA-${suffix}`, processTypeId: "works-type", subjectId: "works-subject", personId: "works-person", currentDepartmentId: index < 24 ? access.departmentId : index === 24 ? "works-dept-b" : null, status: "Aberto", createdAt: instant });
    await database.insert(constructionCases).values({ id: `works-case-${suffix}`, requestKey: `works-case-key-${suffix}`, processId: `works-process-${suffix}`, configurationId: "works-config", category: "BUILDING", locationType: "URBAN", catalogSnapshot: shape, calculationSnapshot: shape, existingArea: area, expandedArea: new Decimal("0"), irregularArea: new Decimal("0"), renovationArea: new Decimal("0"), demolitionArea: new Decimal("0"), totalArea: area, createdBy: actor, createdAt: instant, assignedEmployeeId: "works-employee", additionalValues: shape });
  }
  await database.insert(constructionCaseProperties).values({ id: "works-case-property", caseId, realEstateId: "works-property", cadastralSnapshot: shape });
  await database.insert(constructionReviews).values({ id: "works-review", caseId, requestKey: "works-review-key", revision: 0, reviewType: "PROJECT", decision: "APPROVED", notes: "Parecer preservado", definitionSnapshot: shape, evidenceSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(constructionViabilityResults).values({ id: "works-viability", caseId, requestKey: "works-viability-key", outcome: "APPROVED", calculationSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(constructionStaffRoles).values(["MANAGER", "INSPECTOR"].map(role => ({ id: `works-staff-${role}`, employeeId: "works-employee", departmentId: "works-dept-a", role, startsAt: day, endsAt: day })));
  await database.insert(constructionProfessionals).values({ id: "works-professional", personId: "works-person", professionalType: "ENGINEER", council: "CREA", registration: "TEST-01", startsAt: start });
  await database.insert(constructionPortalIdentities).values({ id: "works-identity", professionalId: "works-professional", firebaseUid: "works-firebase-uid", email: "works@example.test", createdBy: actor });
  await database.insert(constructionParticipants).values({ id: "works-participant", caseId, identityId: "works-identity", role: "TECHNICAL", startsAt: instant, reason: "Participação de ensaio", createdBy: actor });
  await database.insert(constructionCompanyProfiles).values({ id: "works-company-profile", companyId: "works-company", startsAt: start, endsAt: day, legalReference: "Referência de ensaio", createdBy: actor });
  await database.insert(constructionProfessionalEmployers).values({ id: "works-employer", professionalId: "works-professional", companyId: "works-company", startsAt: start });
  await database.insert(constructionTerms).values({ id: "works-term", version: 1, text: "Termo íntegro", publishedBy: actor });
  await database.insert(constructionMessages).values({ id: "works-message", caseId, requestKey: "works-message-key", employeeId: "works-employee", content: "Mensagem municipal", evidenceSnapshot: shape, createdAt: instant });
  await database.insert(constructionDefinitionVersions).values({ id: "works-definition", kind: "PERMIT", version: 1, definition: shape, publishedBy: actor, publishedAt: instant });
  await database.insert(constructionZoneVersions).values({ id: "works-zone", code: "TEST", version: 1, name: "Zona teste", legalBasis: "Base de ensaio", startsAt: start, allowedPurposeIds: ["works-purpose"], allowedCategories: ["BUILDING"], minimumLandArea: new Decimal("0.0001"), maxFloorAreaRatio: new Decimal("1.0001"), automatic: true, publishedBy: actor });
  await database.insert(constructionPropertyZones).values({ realEstateId: "works-property", zoneId: "works-zone" });
  await database.insert(constructionDocumentTemplateVersions).values({ id: "works-template", kind: "PERMIT", version: 1, title: "Modelo", body: "Corpo", stamp: "Carimbo", signaturePolicy: "INTERNAL_ALLOWED", createdBy: actor });
  await database.insert(documentFolders).values({ id: "works-folder", name: "Pasta", description: "Descrição completa", createdAt: instant });
  await database.insert(documents).values({ id: "works-document", title: "Projeto", documentType: "Projeto", fileUrl: "https://example.test/document", status: "Válido", folderId: "works-folder", createdAt: instant });
  await database.insert(documentVersions).values({ id: "works-version", documentId: "works-document", versionNumber: 1, fileUrl: "https://example.test/version", hashSha256: "a".repeat(64), status: "FINAL" });
  await database.insert(processDocuments).values({ id: "works-process-document", processId, documentId: "works-document" });
  await database.insert(pages.pageDistributions).values({ id: "works-distribution", departmentId: "works-dept-a", version: 1, strategy: "SECTOR", publishedBy: actor, publishedAt: instant });
  await database.insert(pages.pageConsultations).values({ id: "works-consultation", caseId, requestKey: "works-consultation-key", requestedBy: actor, sourceDepartmentId: "works-dept-a", targetDepartmentId: "works-dept-b", question: "Questão urbanística de ensaio", dueAt: instant, createdAt: instant });
  await database.insert(pages.pageExtractions).values({ id: "works-extraction", caseId, requestKey: "works-extraction-key", filename: "planta ' OR '1'='1' --.pdf", sourceUrl: "https://example.test/plan", sourceHash: "b".repeat(64), engine: "DEMO_RULES", model: "modelo", status: "EXTRACTED", pages: [1], measurements: shape, comparison: shape, limitations: [], createdBy: actor, createdAt: instant });
  await database.insert(pages.pageReplacements).values({ id: "works-replacement", caseId, requestKey: "works-replacement-key", replacementEmployeeId: "works-employee", departmentId: "works-dept-a", reason: "Substituição justificada", createdBy: actor, createdAt: instant });
  await database.insert(pages.pageInspectionPlans).values({ id: "works-plan", caseId, requestKey: "works-plan-key", reviewId: "works-review", inspectionTypes: [{ id: "works-inspection-type", name: "Vistoria" }], definitionSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(pages.pageLifecycleStarts).values({ id: "works-start", caseId, requestKey: "works-start-key", startedAt: day, notes: "Início", evidenceSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(pages.pageInspections).values({ id: "works-inspection", caseId, requestKey: "works-inspection-key", inspectionTypeId: "works-inspection-type", sequence: 1, requestedAt: instant, scheduledAt: day, status: "REQUESTED", requestNotes: "Vistoria de ensaio", definitionSnapshot: shape, evidenceSnapshot: shape, requestedBy: actor });
  await database.insert(pages.pageCompletions).values({ id: "works-completion", caseId, requestKey: "works-completion-key", number: "CONCL-01", kind: "TOTAL", completedAt: day, area, cumulativeArea: area, remainingArea: new Decimal("0"), notes: "Conclusão", evidenceSnapshot: shape, debtSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(pages.pageServiceRequests).values({ id: "works-request", requestKey: "works-request-key", caseId, identityId: "works-identity", kind: "START", status: "PENDING", revision: 0, notes: "Requerimento público", payload: shape, evidenceSnapshot: shape, createdAt: instant });
  await database.insert(taxes).values({ id: "works-tax", name: "Taxa urbanística", taxType: "Taxa" });
  await database.insert(pages.pageTaxRules).values({ id: "works-tax-rule", kind: "PERMIT", version: 1, taxId: "works-tax", startsAt: day, fixedAmount: new Decimal("90071992547409.91"), amountPerSquareMeter: new Decimal("0.0001"), legalBasis: "Base informada", guideInstructions: "Instruções preservadas", demonstration: true, publishedBy: actor, publishedAt: instant });
  await database.insert(taxAssessments).values({ id: "works-assessment", year: 2026, originalValue: 10.1, originalValueDecimal: new Decimal("10.10"), finalValueDecimal: new Decimal("10.11"), status: "Lançado", taxId: "works-tax", taxpayerId: "works-taxpayer", realEstateId: "works-property", calculationSnapshot: shape });
  await database.insert(taxGuides).values({ id: "works-guide", assessmentId: "works-assessment", guideNumber: "TEST-01", totalValue: 10.1, totalValueDecimal: new Decimal("10.11"), dueDate: instant, calculationSnapshot: shape });
  await database.insert(taxPayments).values(["Confirmado", "Cancelado"].map((status, index) => ({ id: `works-payment-${index}`, amountPaid: 1.25, amountPaidDecimal: new Decimal("1.25"), status, paymentDate: instant, clearanceDate: instant, paymentMethod: "Dinheiro", guideId: "works-guide" })));
  await database.insert(pages.pageFees).values({ id: "works-fee", caseId, kind: "PERMIT", revision: 0, cycleKey: "INITIAL", requestKey: "works-fee-key", ruleId: "works-tax-rule", taxpayerId: "works-taxpayer", realEstateId: "works-property", assessmentId: "works-assessment", amount: new Decimal("10.11"), calculationSnapshot: shape, createdBy: actor, createdAt: instant });
  await database.insert(infrastructureWorks).values([{ id: "works-infra", numero: "001", nome: "Obra municipal", tipo: "Construção", status: "Em Execução", valorEstimado: 0.125 }, { id: "works-inactive", numero: "002", nome: "Obra inativa", tipo: "Construção", active: false }]);
  await database.insert(infrastructureMeasurements).values({ id: "works-measurement", numero: 1, data: instant, valorMedido: 0.125, obraId: "works-infra" });
  await database.insert(infrastructureServices).values({ id: "works-service", protocolo: "SERV-01", tipo: "Manutenção", descricao: "Serviço urbano", local: "Rua de ensaio", scheduledFor: instant });
  await database.insert(infrastructureTeams).values({ id: "works-team", code: "EQ-01", name: "Equipe" });
  await database.insert(infrastructureTeamMembers).values({ equipeId: "works-team", employeeId: "works-employee", isLeader: true });
  await database.insert(infrastructureServiceTeams).values({ obrasServicoId: "works-service", equipeId: "works-team" });
  await database.insert(infrastructureServiceDocuments).values({ id: "works-service-document", obrasServicoId: "works-service", documentId: "works-document" });
  // Two departments plus a batch containing an unassigned case exercise every,
  // NULL access semantics and vacuous truth independently of receipt filtering.
  for (const [index, itemIds] of [[1, [caseId]], [2, [caseId, "works-case-24"]], [3, []], [4, ["works-case-25"]]] as const) {
    const id = `works-export-${index}`;
    await database.insert(pages.pageFederalExports).values({ id, requestKey: `${id}-key`, scope: "works-dept-a", period: "2026-10", version: index, layout: "MUNICIPAL_DEMO_JSON_V1", payload: "{}", hashSha256: "c".repeat(64), validationSnapshot: shape, createdBy: actor, createdAt: instant });
    for (const itemId of itemIds) await database.insert(pages.pageFederalItems).values({ id: `${id}-${itemId}`, exportId: id, caseId: itemId });
  }
  await database.insert(pages.pageFederalReceipts).values({ id: "works-receipt", exportId: "works-export-1", protocol: "REC-01", destination: "Destino declarado", submittedAt: instant, evidenceUrl: "https://example.test/receipt", evidenceHash: "d".repeat(64), notes: "Recibo", createdBy: actor, createdAt: instant });
  await database.insert(processes).values({ id: "works-enforcement-process", protocolNumber: "FISC-01", processTypeId: "works-type", subjectId: "works-subject", currentDepartmentId: "works-dept-a" });
  await database.insert(pages.pageEnforcementCases).values({ id: "works-enforcement", requestKey: "works-enforcement-key", requestHash: "hash", processId: "works-enforcement-process", realEstateId: "works-property", locationType: "RURAL", permitStatus: "WITHOUT_PERMIT", reason: "Obra de ensaio sem alvará", cadastralSnapshot: shape, assignedEmployeeId: "works-employee", status: "OPEN", revision: 0, isDemonstration: true, createdBy: actor, createdAt: instant });
  const responsibility = { employeeId: "works-employee", departmentId: "works-dept-a", staffRoleId: "works-staff-INSPECTOR", createdBy: actor, createdAt: instant };
  await database.insert(pages.pageEnforcementVisits).values({ id: "works-visit", caseId: "works-enforcement", requestKey: "works-visit-key", requestHash: "hash", visitedAt: instant, findings: "Constatação de ensaio", ...responsibility });
  await database.insert(pages.pageEnforcementActs).values({ id: "works-act", caseId: "works-enforcement", requestKey: "works-act-key", requestHash: "hash", number: "AUTO-01", kind: "EMBARGO", reason: "Motivação informada", legalBasis: "Fundamento informado", issuedAt: instant, ...responsibility });
  await database.insert(pages.pageEnforcementAssignments).values({ id: "works-assignment", caseId: "works-enforcement", requestKey: "works-assignment-key", requestHash: "hash", reason: "Designação de ensaio", ...responsibility });
  await database.insert(pages.pageEnforcementAcknowledgements).values({ id: "works-science", actId: "works-act", requestKey: "works-science-key", requestHash: "hash", acknowledgedAt: instant, method: "REFUSAL", recipient: "Destinatário", notes: "Recusa declarada", createdBy: actor, createdAt: instant });
  await database.insert(pages.pageEnforcementEvidence).values([{ id: "works-photo", documentId: "works-document", visitId: "works-visit", kind: "PHOTO", versionSnapshot: shape, createdAt: instant }, { id: "works-proof", documentId: "works-document", acknowledgementId: "works-science", kind: "SERVICE_PROOF", versionSnapshot: shape, createdAt: instant }]);
}

test("Obras: repositórios de páginas sobre Neon/PGlite e SQL histórico reais", { timeout: 180_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const database = fixture.connection.db;
  try {
    const client = await fixture.connection.pool.connect();
    try { await runDatabaseMigrations({ query: client.query.bind(client), exec: (text: string) => client.query(text) }, loadMigrationSet(), { command: "replay" }); }
    finally { client.release(); }
    await seed(database);

    await t.test("acesso por setor, NULL, filtros parametrizados, ordem e paginação", async () => {
      const result = await loadPageCaseList(database, access, { page: "999" });
      assert.equal(result.total, 24); assert.equal(result.page, 2);
      assert.deepEqual(result.cases.map(row => row.id), [20, 21, 22, 23].map(index => `works-case-${index}`));
      assert.equal((await loadPageCaseList(database, admin, {})).total, 26);
      assert.equal((await loadPageCaseList(database, { ...access, roles: [] }, {})).total, 0);
      assert.equal((await loadPageCaseList(database, access, { q: "' OR '1'='1' --" })).total, 24);
      assert.equal((await loadPageCaseList(database, access, { q: "not present ' OR true --" })).total, 0);
      assert.equal((await loadPageCaseList(database, access, { category: "SUBDIVISION" })).total, 0);
      assert.equal(await findPageCaseDetail(database, access, "works-case-24"), null);
      const item = await findPageCaseDetail(database, access, caseId); assert.ok(item);
      assert.equal(item.totalArea.toFixed(4), "9999999999.9999");
      assert.equal(item.createdAt.toISOString(), instant.toISOString());
      assert.deepEqual(item.additionalValues, shape); assert.deepEqual(item.properties[0].cadastralSnapshot, shape);
      assert.deepEqual(Object.keys(item.process).sort(), ["id", "protocolNumber", "status", "description", "person", "company", "currentDepartment"].sort());
      assert.equal(item.process.company, null);
      assert.equal((await loadPageEvaluations(database, caseId)).evaluations[0].createdAt.toISOString(), instant.toISOString());
      assert.deepEqual((await loadPageReviews(database, caseId)).reviews[0].evidenceSnapshot, shape);
      assert.equal((await loadPageMessages(database, caseId)).conversation[0].createdAt.toISOString(), instant.toISOString());
      assert.equal((await loadPageReplacements(database, caseId)).replacements[0].previousAssignedId, null);
      assert.deepEqual(await listPageAnalysts(database, "works-dept-a", day), [{ id: "works-employee", name: "Analista e fiscal" }]);
      assert.deepEqual(await listPageProcessDocuments(database, processId, true, true), [{ id: "works-document", title: "Projeto" }]);
      assert.equal((await listPageCaseOptions(database, access)).length, 24);
    });

    await t.test("cadastros, versões, relações e datas civis completas", async () => {
      const companies = await loadPageCompanies(database, { q: "Construtora", status: "active" });
      assert.equal(companies.rows[0].endsAt.toISOString(), day.toISOString());
      assert.equal((await loadPageCompanies(database, { q: "", status: "inactive" })).total, 0);
      const profiles = await loadPageProfessionals(database, { q: "Pessoa", status: "active", tab: "professionals" });
      assert.equal(profiles.profiles[0].startsAt.toISOString(), start.toISOString());
      assert.equal((await loadPageProfessionals(database, { q: "Construtora", status: "active", tab: "companies" })).employers[0].professional.person.fullName, "Pessoa ' OR '1'='1' --");
      assert.equal((await loadPageStaff(database, { q: "fiscal", status: "active" })).total, 2);
      assert.equal((await listPagePortalIdentities(database))[0].professional.person.fullName, profiles.profiles[0].person.fullName);
      assert.equal((await listPagePortalProfessionals(database))[0].portalIdentity?.isActive, true);
      assert.equal((await loadPageParticipations(database, access, "OBRA-00")).participants[0].case.process.protocolNumber, "OBRA-00");
      assert.deepEqual(await latestPageTerm(database), { version: 1, text: "Termo íntegro" });
      const settings = await loadPageSettings(database, { kind: "INSPECTION_TYPE", q: "", status: "all" });
      assert.deepEqual(settings.subjects, [{ id: "works-subject", name: "Solicitação", processType: { name: "Processo de construção" } }]);
      assert.equal((await loadPageTemplates(database, "PERMIT")).latest?.body, "Corpo");
      const rules = await loadPageRules(database, access, { tab: "zones", kind: "PERMIT" });
      assert.equal(rules.zones[0].maxFloorAreaRatio.toFixed(4), "1.0001");
      assert.deepEqual(rules.zones[0].allowedPurposeIds, ["works-purpose"]);
      assert.ok(rules.purposes.some(row => row.id === "works-purpose" && row.name === "Finalidade residencial da fixture works-pages"));
      assert.deepEqual(rules.properties[0].constructionZone, { zone: { code: "TEST", version: 1 } });
      assert.equal((await loadPageRules(database, access, { tab: "distribution", kind: "PERMIT" })).total, 1);
      assert.equal((await loadPageRules(database, { ...access, departmentId: "works-dept-b" }, { tab: "distribution", kind: "PERMIT" })).total, 0);
      const consultations = await loadPageConsultations(database, access, { q: "", status: "pending" });
      assert.equal(consultations.items[0].response, null); assert.equal(consultations.items[0].dueAt.toISOString(), instant.toISOString());
      assert.equal((await loadPageConsultations(database, access, { q: "", status: "answered" })).total, 0);
      assert.equal((await loadPageExtractions(database, caseId, { q: "' OR '1'='1' --", engine: "DEMO_RULES", status: "EXTRACTED" })).total, 1);
    });

    await t.test("ciclo, vistoria, requests públicos, precisão e null nas relações", async () => {
      const record = await findPageLifecycle(database, access, caseId); assert.ok(record);
      assert.deepEqual(record.inspectionPlan?.inspectionTypes, [{ id: "works-inspection-type", name: "Vistoria" }]);
      assert.equal(record.lifecycleStart?.startedAt.toISOString(), day.toISOString());
      assert.equal(record.properties[0].realEstate.landArea, 0.125); assert.equal(record.properties[0].realEstate.builtArea, null);
      const history = await loadPageLifecycleHistory(database, caseId, { inspection: { status: "REQUESTED", q: "ensaio" }, completion: { q: "CONCL", kind: "TOTAL" } });
      assert.equal(history.inspections[0].scheduledAt?.toISOString(), day.toISOString());
      assert.equal(history.completions[0].area.toFixed(4), "9999999999.9999");
      assert.equal(history.completions[0].propertyUpdate, null); assert.ok(history.totalCompletion);
      assert.equal((await loadPageInspectionQueue(database, access, { q: "OBRA-00" })).inspectionTotal, 1);
      assert.equal((await loadPageInspectionQueue(database, { ...access, departmentId: "works-dept-b" }, {})).inspectionTotal, 0);
      assert.deepEqual(await listPageLifecycleRequests(database, caseId), [{ id: "works-request", kind: "START", notes: "Requerimento público" }]);
    });

    await t.test("lotes every, empty, NULL, recibos e última versão por escopo/período", async () => {
      const filters = { q: "", period: "", kind: "all", receipt: "all" };
      const result = await loadPageExports(database, access, filters);
      assert.deepEqual(result.batches.map(row => row.id), ["works-export-1", "works-export-3"]);
      assert.equal(result.rectificationOptions[0].id, "works-export-3");
      assert.equal((await loadPageExports(database, access, { ...filters, receipt: "with" })).batches[0].receipts[0].submittedAt.toISOString(), instant.toISOString());
      assert.equal((await loadPageExports(database, access, { ...filters, receipt: "without" })).total, 1);
      assert.equal((await loadPageExports(database, admin, filters)).total, 4);
      assert.equal((await loadPageExports(database, access, { ...filters, q: "OBRA-00" })).total, 1);
    });

    await t.test("fiscalização: autorização específica, filtros relacionais e espelho", async () => {
      const filters = { q: "INSCR-TEST", status: "OPEN", locationType: "RURAL", permitStatus: "WITHOUT_PERMIT" };
      assert.equal((await loadPageEnforcementList(database, access, filters)).total, 1);
      assert.equal((await loadPageEnforcementList(database, { ...access, roles: ["ANALYST"] }, filters)).total, 0);
      assert.equal((await listPageEnforcementProperties(database, "Rua de ensaio"))[0].id, "works-property");
      const record = await findPageEnforcement(database, access, "works-enforcement"); assert.ok(record);
      assert.equal(record.process.currentDepartment?.name, "Setor a");
      const history = await loadPageEnforcementHistory(database, "works-enforcement", { visitEvidence: "PHOTO", actScience: "RECORDED", scienceMethod: "REFUSAL" });
      assert.equal(history.actTotal, 1); assert.equal(history.scienceTotal, 1); assert.equal(history.visitTotal, 1);
      assert.equal(history.acts[0]._count.acknowledgements, 1); assert.equal(typeof history.acts[0]._count.acknowledgements, "number");
      assert.equal(history.science[0].evidence[0].document.title, "Projeto"); assert.equal(history.visits[0].visitedAt.toISOString(), instant.toISOString());
      assert.equal((await loadPageEnforcementHistory(database, "works-enforcement", { actScience: "PENDING", visitEvidence: "NONE" })).actTotal, 0);
      assert.equal((await listPageInspectors(database, "works-dept-a", day))[0].employee.name, "Analista e fiscal");
      const printed = await findPageEnforcementPrint(database, access, "works-enforcement", "works-act"); assert.ok(printed);
      assert.equal(printed.acts[0].acknowledgements[0].acknowledgedAt.toISOString(), instant.toISOString());
      assert.deepEqual(printed.acts[0].acknowledgements[0].evidence[0].versionSnapshot, shape);
      assert.equal(await findPageEnforcementPrint(database, { ...access, departmentId: "works-dept-b" }, "works-enforcement", "works-act"), null);
    });

    await t.test("tributação: inclusão completa, Float distinto de Decimal e pagamentos confirmados", async () => {
      const result = await loadPageTaxation(database, access, 1, caseId);
      assert.equal(result.records[0].process.person?.taxpayerInfo?.id, "works-taxpayer");
      assert.equal(result.rules[0].fixedAmount.toFixed(2), "90071992547409.91");
      const fee = result.records[0].fees[0]; assert.ok(fee.assessment);
      assert.equal(fee.assessment.originalValue, 10.1); assert.equal(typeof fee.assessment.originalValue, "number");
      assert.equal(fee.assessment.originalValueDecimal?.toFixed(2), "10.10");
      assert.equal(fee.assessment.guides[0].payments.length, 1); assert.equal(fee.assessment.guides[0].payments[0].status, "Confirmado");
      const guide = await findPageGuide(database, access, "works-guide"); assert.ok(guide);
      assert.equal(guide.assessment.guides[0].dueDate.toISOString(), instant.toISOString());
      assert.equal(guide.assessment.taxpayer.person?.birthDate?.toISOString(), instant.toISOString());
      assert.equal(guide.assessment.taxpayer.company, null); assert.deepEqual(guide.calculationSnapshot, shape);
      assert.equal(await findPageGuide(database, { ...access, departmentId: "works-dept-b" }, "works-guide"), null);
    });

    await t.test("infraestrutura: DTO integral, Float, agregados, alocações e leituras sem escrita", async () => {
      await database.transaction(async tx => {
        assert.deepEqual(await loadWorksDashboard(tx), { totalObras: 1, totalMedicoes: 1, totalServicos: 1 });
        assert.equal((await listWorksProjects(tx))[0].valorEstimado, 0.125);
        assert.equal((await listWorksServices(tx))[0].scheduledFor?.toISOString(), instant.toISOString());
        const measurements = await loadWorksMeasurements(tx); assert.equal(measurements.medicoes[0].data.toISOString(), instant.toISOString());
        const documents = await listWorksDocuments(tx); assert.equal(documents[0].document.folder?.description, "Descrição completa");
        assert.equal(documents[0].document.folder?.createdAt.toISOString(), instant.toISOString());
        assert.equal(documents[0].obrasServico.scheduledFor?.toISOString(), instant.toISOString());
        assert.equal(documents[0].obrasServicoId, "works-service");
        const teams = await loadWorksTeams(tx); assert.equal(teams.teams[0].department, null); assert.equal(teams.teams[0].members[0].employee.role, null);
        assert.equal(teams.teams[0].assignments[0].obrasServico.protocolo, "SERV-01");
        assert.deepEqual(Object.keys(teams.teams[0]).sort(), ["id", "code", "name", "isActive", "department", "members", "assignments"].sort());
        const reports = await loadWorksReports(tx); assert.equal(reports.medicoes._sum.valorMedido, 0.125);
        assert.deepEqual(reports.materiaisEmitidos, []);
        // PostgreSQL itself rejects writes here; repositories run through the
        // same Neon connection and no ORM/client is substituted by the test.
        assert.equal((await tx.execute<{ value: string }>(sql`SELECT current_setting('transaction_read_only') AS value`)).rows[0].value, "on");
      }, { accessMode: "read only" });
    });
  } finally { await fixture.close(); }
});
