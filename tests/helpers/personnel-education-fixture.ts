import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

// Physical definitions come from the immutable historical SQL, never generated
// ORM metadata. Only relations between the named fixture tables are installed.
export async function createEducationServiceFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const baseline = readFileSync("prisma/migrations-ibema/20261009232000_baseline/migration.sql", "utf8");
    const tables = new Set([
      "Person", "Employee", "Teacher", "TeacherClassAssignment", "School", "Student", "EducationalGuardian", "AcademicPeriod", "CurriculumMatrix", "CurriculumMatrixSubject", "SchoolSubject", "SchoolClass", "Enrollment", "ClassDiary", "Attendance", "Grade", "EducationAssessment", "TeacherAcademicRecord", "LearningActivity", "LearningQuestion", "LearningSubmission",
      "PreEnrollmentProcess", "PreEnrollment", "AcademicDocumentIssue", "EducationLibraryTitle", "EducationLibraryCopy", "EducationLibraryLoan", "EducationLibraryReservation",
      "PedagogicalCatalogItem", "PedagogicalRelease", "PedagogicalAttempt", "EducationFinancialAccount", "EducationFinancialMovement", "EducationApplicationPlan",
      "MaterialCategory", "Material", "Warehouse", "BankAccount", "FleetRoute", "FleetUnit", "EducationSchoolMenu", "EducationFoodMovement", "EducationTransportRoute", "EducationTransportStop", "EducationTransportStudent", "EducationTransportJourney", "EducationTransportEvent",
    ]);
    const definitions = [...baseline.matchAll(/CREATE TABLE "([A-Za-z0-9_]+)" \([\s\S]*?\n\);/g)].filter(match => tables.has(match[1]));
    assert.equal(definitions.length, tables.size, "cada tabela da fixture precisa existir no SQL histórico");
    for (const definition of definitions) await fixture.database.exec(definition[0]);
    const cemetery = readFileSync("prisma/migrations-ibema/20261010100000_complete_cemetery_domain/migration.sql", "utf8");
    const personLifecycle = cemetery.match(/ALTER TABLE "Person"[^;]+;/)?.[0];
    assert.ok(personLifecycle);
    await fixture.database.exec(personLifecycle);
    const healthIdentity = readFileSync("prisma/migrations-ibema/20261015020000_health_registration_identity/migration.sql", "utf8");
    for (const statement of healthIdentity.matchAll(/ALTER TABLE "Person"[^;]+;/g)) await fixture.database.exec(statement[0]);
    for (const match of baseline.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([A-Za-z0-9_]+)"[^;]+;/g)) {
      if (tables.has(match[1])) await fixture.database.exec(match[0]);
    }
    for (const match of baseline.matchAll(/ALTER TABLE "([A-Za-z0-9_]+)" ADD CONSTRAINT [^;]+ REFERENCES "([A-Za-z0-9_]+)"[^;]+;/g)) {
      if (tables.has(match[1]) && tables.has(match[2])) await fixture.database.exec(match[0]);
    }
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}
