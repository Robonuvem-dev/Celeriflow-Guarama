import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Decimal } from "../../src/db/decimal";
import { withDatabaseTransaction, type DatabaseTransaction } from "../../src/db/transaction";
import { users, accessProfiles, userModulePermissions, modules } from "../../src/db/schema/identity";
import { auditEvents } from "../../src/db/schema/audit";
import { internalNotifications } from "../../src/db/schema/notifications";
import { departments, employees } from "../../src/db/schema/administration";
import { people } from "../../src/db/schema/people";
import { companies, documents, realEstates, taxpayers } from "../../src/db/schema/registry";
import { taxes, taxAssessments, taxGuides } from "../../src/db/schema/taxation-core";
import { taxPayments } from "../../src/db/schema/tax-accounting";
import { taxRegistryEntries } from "../../src/db/schema/taxation-registry";
import { documentVersions } from "../../src/db/schema/document-workflow";
import { processes, processEvents, processDocuments, processTypes, processSubjects, processSequences, processMovements, processWorkflowStages } from "../../src/db/schema/processes";
import { constructionCases, constructionConfigVersions, constructionProfessionals, constructionPortalIdentities, constructionParticipants } from "../../src/db/schema/construction-core";
import { constructionTerms, constructionTermAcceptances, constructionStaffRoles, constructionMessages } from "../../src/db/schema/construction-portal";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";
import { createConstructionSharedTables } from "./construction-shared-tables";

/** Physical Construction constraints, scalar shared projections and the real
 * production driver. The optional pause exercises the deadline upgrade itself. */
export async function createConstructionRequestsFixture(options: { pauseBeforeDeadlineMigration?: boolean } = {}) {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  try {
    await createConstructionSharedTables(fixture.database, [users, accessProfiles, userModulePermissions, modules, auditEvents, internalNotifications, departments, employees, people, companies, documents, realEstates, taxpayers, taxes, taxAssessments, taxGuides, taxPayments, taxRegistryEntries, documentVersions, processes, processEvents, processDocuments, processTypes, processSubjects, processSequences, processMovements, processWorkflowStages]);
    await fixture.database.exec(`CREATE UNIQUE INDEX "fixture_notification_dedupe" ON "ProtocolNotification" ("userId","dedupeKey") WHERE "dedupeKey" IS NOT NULL`);
    for (const migration of ["20261010160000_construction_foundation", "20261010170000_construction_rules_profiles", "20261010180000_construction_project_reviews", "20261010200000_construction_portal_participation", "20261010210000_construction_external_requests", "20261010220000_construction_taxation", "20261010230000_construction_documents", "20261010240000_construction_lifecycle", "20261010270000_construction_company_validity"]) await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    if (!options.pauseBeforeDeadlineMigration) await fixture.database.exec(readFileSync("prisma/migrations-ibema/20261010330000_construction_inspection_deadlines/migration.sql", "utf8"));
    await db.insert(departments).values({ id: "sector", name: "Urbanismo", secretariatId: "secretariat" });
    await db.insert(employees).values([{ id: "analyst", name: "Analista", secretariatId: "secretariat", departmentId: "sector" }, { id: "manager", name: "Gestor", secretariatId: "secretariat", departmentId: "sector" }]);
    await db.insert(accessProfiles).values({ id: "profile", codigo: "CONSTRUCTION_TEST", nome: "Equipe urbanística", permissoes: '{"modulosPermitidos":["PROCESSOS"]}' });
    await db.insert(users).values({ id: "manager-user", nome: "Gestor", email: "manager@example.invalid", perfilId: "profile", employeeId: "manager" });
    await db.insert(people).values([{ id: "person", fullName: "Profissional" }, { id: "other-person", fullName: "Outro profissional" }]);
    await db.insert(constructionConfigVersions).values({ id: "config", version: 3, freeRevisions: 2, correctionDays: 7, checkPropertyDebts: false, subjectIds: [], areaWeights: {}, instructions: "Configuração sintética", publishedBy: "manager-user" });
    await db.insert(processes).values({ id: "process", protocolNumber: "TEST-REQUEST", processTypeId: "type", subjectId: "subject", status: "Em Análise", currentDepartmentId: "sector" });
    await db.insert(constructionCases).values({ id: "case", requestKey: randomUUID(), processId: "process", configurationId: "config", category: "SUBDIVISION", locationType: "URBAN", catalogSnapshot: {}, existingArea: new Decimal(0), expandedArea: new Decimal(0), irregularArea: new Decimal(0), renovationArea: new Decimal(0), demolitionArea: new Decimal(0), totalArea: new Decimal(0), calculationSnapshot: {}, reviewStatus: "APPROVED", firstAnalystId: "analyst", createdBy: "manager-user" });
    for (const [identityId, personId] of [["identity", "person"], ["other-participant", "other-person"]]) {
      await db.insert(constructionProfessionals).values({ id: personId, personId, professionalType: "ENGINEER", council: "CREA", registration: identityId, startsAt: new Date("2020-01-01T00:00:00Z") });
      await db.insert(constructionPortalIdentities).values({ id: identityId, firebaseUid: identityId, email: `${identityId}@example.invalid`, professionalId: personId, createdBy: "manager-user" });
      await db.insert(constructionParticipants).values({ caseId: "case", identityId, role: "TECHNICAL", reason: "Participação sintética", createdBy: "manager-user" });
    }
    await db.insert(constructionTerms).values({ id: "term", version: 1, text: "Termo vigente", publishedBy: "manager-user" });
    await db.insert(constructionTermAcceptances).values(["identity", "other-participant"].map(identityId => ({ caseId: "case", identityId, termId: "term" })));
    await db.insert(constructionStaffRoles).values({ id: "analyst-role", employeeId: "analyst", departmentId: "sector", role: "ANALYST", startsAt: new Date("2020-01-01T00:00:00Z") });
    await db.insert(documents).values({ id: "current-project", title: "Projeto atualizado", documentType: "PROJETO", fileUrl: "/project.pdf", status: "Válido" });
    await db.insert(documentVersions).values({ id: "ged-version", documentId: "current-project", versionNumber: 1, fileUrl: "/project.pdf", hashSha256: "a".repeat(64), status: "FINAL" });
    await db.insert(processDocuments).values({ processId: "process", documentId: "current-project" });
    await db.insert(constructionMessages).values({ caseId: "case", requestKey: randomUUID(), identityId: "identity", content: "Projeto compartilhado", documentId: "current-project" });
    const transaction = <T>(operation: (tx: DatabaseTransaction) => Promise<T>) => withDatabaseTransaction(fixture.connection, operation);
    return { ...fixture, db, transaction };
  } catch (error) { await fixture.close(); throw error; }
}
