import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { academicPeriods, enrollments, enrollmentMovements, schoolClasses, schools, students } from "../src/db/schema/education-core";
import { enrollEducationStudent, moveEducationEnrollment } from "../src/lib/educacao/enrollment-service";
import { listEducationClasses, listEducationEnrollments, listEducationPeople, listEducationStudents } from "../src/db/repositories/education/core";
import { findActivePortalEmployee, listPublishedBirthdayEmployees } from "../src/db/repositories/portal-servidor/identity";
import { departments, employees, roles, secretariats } from "../src/db/schema/administration";
import { findSstClinicalGrant, findSstDisciplineGrant } from "../src/db/repositories/sst/access";

// Dedicated copied database only: this suite never falls back to DATABASE_URL.
const url = process.env.PERSONNEL_EDUCATION_TEST_DATABASE_URL;

test("Educação PostgreSQL: matrícula/histórico atômicos, vagas, identidade única, vigência e rollback", { skip: !url, timeout: 90_000 }, async () => {
  assert.ok(url);
  const connection = createDatabaseConnection(url), fixture = createId(), rollback = new Error("expected education rollback");
  const schoolId = createId(), personId = createId(), studentId = createId();
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      await tx.insert(schools).values({ id: schoolId, name: fixture });
      await tx.insert(people).values({ id: personId, fullName: fixture });
      const otherPerson = createId(), otherStudent = createId();
      await tx.insert(people).values({ id: otherPerson, fullName: `${fixture} segundo` });
      await tx.insert(students).values([{ id: studentId, studentCode: fixture, personId }, { id: otherStudent, studentCode: `${fixture}-2`, personId: otherPerson }]);
      const [period] = await tx.insert(academicPeriods).values({ schoolId, code: fixture, name: fixture, year: 2099, modality: "Regular", startDate: new Date("2099-02-01T12:00:00Z"), endDate: new Date("2099-12-01T12:00:00Z") }).returning();
      const classes = await tx.insert(schoolClasses).values(["A", "B"].map(name => ({ schoolId, periodId: period.id, name, year: 2099, stage: "Fundamental", grade: "1º", shift: "Manhã", capacity: 1 }))).returning();
      const enrollmentDate = new Date("2099-02-01T12:00:00Z");
      const enrollmentId = await enrollEducationStudent(tx, { studentId, classId: classes[0].id, enrollmentDate, actorName: "Autor verificado", notes: "Histórico inicial" });
      const [created] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
      assert.equal(created.supportCode, `MAT-2099-${fixture.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-12)}`);
      assert.equal(created.enrollmentDate.toISOString(), enrollmentDate.toISOString());
      assert.ok(created.updatedAt instanceof Date);
      await assert.rejects(tx.transaction(nested => enrollEducationStudent(nested, { studentId: otherStudent, classId: classes[0].id, enrollmentDate, actorName: "Autor", notes: null })), /capacidade/);
      await assert.rejects(tx.transaction(nested => enrollEducationStudent(nested, { studentId, classId: classes[1].id, enrollmentDate, actorName: "Autor", notes: null })), /matrícula ativa/);
      const move = { enrollmentId, type: "Remanejamento", targetClassId: classes[1].id, effectiveDate: new Date("2099-03-01T12:00:00Z"), reason: "Mudança documental", destinationMunicipality: null, actorName: "Outro autor" };
      await moveEducationEnrollment(tx, move);
      const [moved] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
      assert.equal(moved.classId, classes[1].id);
      const history = await tx.select().from(enrollmentMovements).where(eq(enrollmentMovements.enrollmentId, enrollmentId));
      assert.equal(history.length, 2);
      assert.equal(history.find(row => row.type === "Remanejamento")?.sourceClassId, classes[0].id);
      assert.equal(history.find(row => row.type === "Remanejamento")?.actorName, "Outro autor");
      await assert.rejects(tx.transaction(nested => moveEducationEnrollment(nested, { ...move, type: "Transferência", targetClassId: "missing-education-class" })), error => getPostgresError(error)?.code === "23503");
      const [afterFailure] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
      assert.equal(afterFailure.status, "Matriculado", "falha no histórico reverte a mudança anterior da matrícula");
      const listed = (await listEducationEnrollments(tx)).find(row => row.id === enrollmentId);
      assert.equal(listed?.movements.length, 2);
      assert.equal(listed?.student.person.fullName, fixture);
      assert.equal((await listEducationClasses(tx)).find(row => row.id === classes[0].id)?._count.enrollments, 0);
      assert.equal((await listEducationClasses(tx)).find(row => row.id === classes[1].id)?._count.enrollments, 1);
      assert.equal((await listEducationStudents(tx)).find(row => row.id === studentId)?.enrollments.length, 1);
      assert.equal((await listEducationPeople(tx, true)).some(row => row.id === personId), false);
      await moveEducationEnrollment(tx, { ...move, type: "Transferência", targetClassId: null });
      const [transferred] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
      assert.equal(transferred.status, "Transferido");
      assert.equal(transferred.endDate?.toISOString(), move.effectiveDate.toISOString());
      throw rollback;
    }, { isolationLevel: "serializable", timeoutMs: 60_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId)), []);
    assert.deepEqual(await connection.db.select({ id: students.id }).from(students).where(eq(students.id, studentId)), []);
  } finally { await connection.pool.end(); }
});

test("Portal/SST PostgreSQL: vínculo autenticado ativo, relações opcionais, recorte publicado e grants ausentes", { skip: !url, timeout: 60_000 }, async () => {
  assert.ok(url);
  const connection = createDatabaseConnection(url), fixture = createId(), rollback = new Error("expected portal rollback");
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const [person] = await tx.insert(people).values({ fullName: fixture, birthDate: new Date("1974-10-05T00:00:00Z") }).returning();
      const [unit] = await tx.insert(secretariats).values({ name: fixture }).returning();
      const [role] = await tx.insert(roles).values({ name: fixture }).returning();
      const [department] = await tx.insert(departments).values({ name: fixture, secretariatId: unit.id }).returning();
      const [employee] = await tx.insert(employees).values({ name: fixture, personId: person.id, secretariatId: unit.id, roleId: role.id, departmentId: department.id }).returning();
      const identity = await findActivePortalEmployee(tx, employee.id);
      assert.equal(identity?.id, employee.id);
      assert.equal(identity?.role?.name, fixture);
      assert.equal(identity?.secretariat?.name, fixture);
      assert.equal(identity?.department?.name, fixture);
      assert.equal(await findActivePortalEmployee(tx, "other-unlinked-employee"), null);
      assert.deepEqual(await listPublishedBirthdayEmployees(tx, []), []);
      assert.equal((await listPublishedBirthdayEmployees(tx, [employee.id]))[0].birthDate?.toISOString(), "1974-10-05T00:00:00.000Z");
      await tx.update(employees).set({ isActive: false }).where(eq(employees.id, employee.id));
      assert.equal(await findActivePortalEmployee(tx, employee.id), null);
      assert.deepEqual(await listPublishedBirthdayEmployees(tx, [employee.id]), []);
      assert.equal(await findSstClinicalGrant(tx, fixture, fixture), null);
      assert.equal(await findSstDisciplineGrant(tx, fixture, fixture, "MEDICINE"), null);
      const isolation = await tx.execute<{ value: string }>(sql`SELECT current_setting('transaction_isolation') AS value`);
      assert.equal(isolation.rows[0].value, "repeatable read");
      throw rollback;
    }, { isolationLevel: "repeatable read", timeoutMs: 45_000 }), error => error === rollback);
  } finally { await connection.pool.end(); }
});
