import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { withDatabaseTransaction, type DatabaseTransaction } from "../../src/db/transaction";
import { departments, employees } from "../../src/db/schema/administration";
import { people } from "../../src/db/schema/people";
import { documents, realEstates, taxpayers } from "../../src/db/schema/registry";
import { documentVersions } from "../../src/db/schema/document-workflow";
import { processes, processTypes, processSubjects } from "../../src/db/schema/processes";
import { financialYears } from "../../src/db/schema/finance-years";
import { constructionCases, constructionCaseProperties, constructionConfigVersions, constructionParticipants, constructionPortalIdentities, constructionProfessionals } from "../../src/db/schema/construction-core";
import { constructionDocumentTemplateVersions, constructionIssuedDocuments } from "../../src/db/schema/construction-documents";
import { constructionTerms, constructionTermAcceptances } from "../../src/db/schema/construction-portal";
import { taxes } from "../../src/db/schema/taxation-core";
import { taxFinancialMappings } from "../../src/db/schema/tax-accounting";
import { createTaxChainDatabase } from "./tax-chain-database";

/** Real municipal SQL history, including the tax writer's scope, fiscal year,
 * sequence, audit and FK constraints. No replacement for the shared writer. */
export async function createConstructionFeeIssueFixture() {
  const f = await createTaxChainDatabase();
  const db = f.db, year = new Date().getUTCFullYear();
  try {
    await db.update(financialYears).set({ year, startDate: new Date(`${year}-01-01T00:00:00Z`), endDate: new Date(`${year}-12-31T23:59:59.999Z`) }).where(eq(financialYears.id, "ano"));
    await db.insert(departments).values({ id: "sector", name: "Urbanismo", secretariatId: "secretaria" });
    await db.update(employees).set({ departmentId: "sector", secretariatId: "secretaria" }).where(eq(employees.id, f.actor.employeeId!));
    await db.insert(people).values({ id: "person", fullName: "Requerente da taxa" });
    await db.insert(taxpayers).values({ id: "taxpayer", taxpayerType: "PF", personId: "person" });
    await db.insert(realEstates).values({ id: "property", municipalInsc: "FEE-TEST", taxpayerId: "taxpayer", landArea: 200 });
    await db.insert(taxes).values({ id: "tax", code: "CONSTRUCTION_FEE_TEST", name: "Taxa urbanística da fixture", taxType: "Taxa" });
    await db.insert(taxFinancialMappings).values({ taxId: "tax", revenueNatureId: "receita", resourceSourceId: "livre", defaultBankAccountId: "banco" });
    await db.insert(processTypes).values({ id: "type", name: "Licenciamento da fixture" });
    await db.insert(processSubjects).values({ id: "subject", name: "Construção da fixture", processTypeId: "type" });
    await db.insert(processes).values({ id: "process", protocolNumber: "FEE-TEST", processTypeId: "type", subjectId: "subject", personId: "person", currentDepartmentId: "sector", status: "Em Análise" });
    await db.insert(constructionConfigVersions).values({ id: "config", version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: false, subjectIds: ["subject"], areaWeights: {}, instructions: "Configuração da fixture tributária", publishedBy: f.actor.usuarioId });
    await db.insert(constructionCases).values({ id: "case", requestKey: randomUUID(), processId: "process", configurationId: "config", category: "BUILDING", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal(0), expandedArea: new Decimal(10), irregularArea: new Decimal(0), renovationArea: new Decimal(0), demolitionArea: new Decimal(0), totalArea: new Decimal(10), calculationSnapshot: {}, revisionCount: 2, reviewStatus: "APPROVED", createdBy: f.actor.usuarioId });
    await db.insert(constructionCaseProperties).values({ caseId: "case", realEstateId: "property", cadastralSnapshot: {} });
    await db.insert(constructionProfessionals).values({ id: "professional", personId: "person", professionalType: "ENGINEER", council: "CREA", registration: "FEE-TEST", startsAt: new Date("2020-01-01T00:00:00Z") });
    await db.insert(constructionPortalIdentities).values({ id: "identity", firebaseUid: "fee-test", email: "fee@example.invalid", professionalId: "professional", createdBy: f.actor.usuarioId });
    await db.insert(constructionParticipants).values({ caseId: "case", identityId: "identity", role: "TECHNICAL", reason: "Participação da fixture", createdBy: f.actor.usuarioId });
    await db.insert(constructionTerms).values({ id: "term", version: 1, text: "Termo da fixture", publishedBy: f.actor.usuarioId });
    await db.insert(constructionTermAcceptances).values({ caseId: "case", identityId: "identity", termId: "term" });
    await db.insert(documents).values({ id: "source-document", title: "Alvará da fixture", documentType: "ALVARA", fileUrl: "/fixture.pdf", status: "Válido" });
    await db.insert(documentVersions).values({ id: "source-version", documentId: "source-document", versionNumber: 1, fileUrl: "/fixture.pdf", hashSha256: "a".repeat(64), status: "SIGNED" });
    await db.insert(constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará da fixture", body: "Alvará", stamp: "Municipal", signaturePolicy: "INTERNAL_ALLOWED", createdBy: f.actor.usuarioId });
    await db.insert(constructionIssuedDocuments).values({ id: "source", requestKey: randomUUID(), caseId: "case", processId: "process", kind: "PERMIT", year, sequence: 1, number: `PERMIT-1/${year}`, templateVersionId: "template", templateSnapshot: {}, documentId: "source-document", documentVersionId: "source-version", fileUrl: "/fixture.pdf", hashSha256: "a".repeat(64), backupPath: "/fixture-backup.pdf", validationCode: "fee-fixture", status: "PUBLISHED", createdBy: f.actor.usuarioId });
    const transaction = <T>(operation: (tx: DatabaseTransaction) => Promise<T>) => withDatabaseTransaction(f.connection, operation);
    const access = { administrator: false, employeeId: f.actor.employeeId!, departmentId: "sector", roles: ["MANAGER"] };
    return { ...f, year, transaction, access };
  } catch (error) { await f.close(); throw error; }
}
