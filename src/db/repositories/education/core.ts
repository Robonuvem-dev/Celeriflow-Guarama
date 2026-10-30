import { and, asc, count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { employees } from "../../schema/administration";
import { academicPeriods, curriculumMatrices, educacensoOperations, educationalGuardians, enrollments, enrollmentMovements, schoolClasses, schools, schoolSubjects, students, teachers, classDiaries, schoolCalendarEvents } from "../../schema/education-core";
import type { EducationAcademicData, EducationClassRow, EducationCensusOperation, EducationEnrollmentRow, EducationPersonOption, EducationSchoolOption, EducationStudentRow, EducationSchoolRow, EducationTeacherRow } from "@/lib/contracts/education-core";

export async function listActiveEducationSchools(db: DatabaseExecutor): Promise<EducationSchoolOption[]> {
  return db.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.isActive, true)).orderBy(asc(schools.name));
}
export async function listEducationPeople(db: DatabaseExecutor, availableOnly = false): Promise<EducationPersonOption[]> {
  return db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(and(eq(people.status, "Ativo"), availableOnly ? notExists(db.select({ id: students.id }).from(students).where(eq(students.personId, people.id))) : undefined)).orderBy(asc(people.fullName)).limit(500);
}
export async function listEducationStudents(db: DatabaseExecutor, activeOnly = false): Promise<EducationStudentRow[]> {
  const rows = await db.select({ id: students.id, studentCode: students.studentCode, status: students.status, dietaryRestrictions: students.dietaryRestrictions, usesSchoolTransport: students.usesSchoolTransport, needsSpecialMeal: students.needsSpecialMeal, person: { id: people.id, fullName: people.fullName, cpf: people.cpf, birthDate: people.birthDate, motherName: people.motherName, fatherName: people.fatherName, motherUnknown: people.motherUnknown, fatherUnknown: people.fatherUnknown } }).from(students).innerJoin(people, eq(people.id, students.personId)).where(activeOnly ? eq(students.status, "Ativo") : undefined).orderBy(asc(people.fullName));
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const guardians = await db.select({ studentId: educationalGuardians.studentId, kinship: educationalGuardians.kinship, person: { id: people.id, fullName: people.fullName, cpf: people.cpf } }).from(educationalGuardians).innerJoin(people, eq(people.id, educationalGuardians.personId)).where(inArray(educationalGuardians.studentId, ids));
  const active = await db.select({ studentId: enrollments.studentId, school: { id: schools.id, name: schools.name }, schoolClass: { id: schoolClasses.id, name: schoolClasses.name } }).from(enrollments).innerJoin(schools, eq(schools.id, enrollments.schoolId)).leftJoin(schoolClasses, eq(schoolClasses.id, enrollments.classId)).where(and(inArray(enrollments.studentId, ids), eq(enrollments.status, "Matriculado")));
  return rows.map(row => ({ ...row, guardians: guardians.filter(guardian => guardian.studentId === row.id), enrollments: active.filter(enrollment => enrollment.studentId === row.id).slice(0, 1) }));
}
export async function listEducationClasses(db: DatabaseExecutor, openOnly = false): Promise<EducationClassRow[]> {
  const enrollmentCount = sql<number>`(select count(*)::int from "Enrollment" e where e."classId" = ${schoolClasses.id} and e.status = 'Matriculado')`;
  const assignmentCount = sql<number>`(select count(*)::int from "TeacherClassAssignment" a where a."classId" = ${schoolClasses.id})`;
  const boardCount = sql<number>`(select count(*)::int from "ClassScheduleBoard" b where b."classId" = ${schoolClasses.id})`;
  const rows = await db.select({ id: schoolClasses.id, name: schoolClasses.name, year: schoolClasses.year, stage: schoolClasses.stage, grade: schoolClasses.grade, shift: schoolClasses.shift, classType: schoolClasses.classType, status: schoolClasses.status, capacity: schoolClasses.capacity, school: { id: schools.id, name: schools.name }, period: { id: academicPeriods.id, name: academicPeriods.name }, matrix: { id: curriculumMatrices.id, name: curriculumMatrices.name }, enrollmentCount, assignmentCount, boardCount }).from(schoolClasses).innerJoin(schools, eq(schools.id, schoolClasses.schoolId)).leftJoin(academicPeriods, eq(academicPeriods.id, schoolClasses.periodId)).leftJoin(curriculumMatrices, eq(curriculumMatrices.id, schoolClasses.matrixId)).where(openOnly ? eq(schoolClasses.status, "Aberta") : undefined).orderBy(...(openOnly ? [asc(schools.name), asc(schoolClasses.name)] : [desc(schoolClasses.year), asc(schoolClasses.name)]));
  return rows.map(({ enrollmentCount, assignmentCount, boardCount, ...row }) => ({ ...row, _count: { enrollments: enrollmentCount, teacherAssignments: assignmentCount, scheduleBoards: boardCount } }));
}
export async function loadEducationAcademicData(db: DatabaseExecutor): Promise<EducationAcademicData> {
  const [schoolRows, periods, matrices, classes, teacherRows, subjects] = await Promise.all([
    listActiveEducationSchools(db),
    db.select({ id: academicPeriods.id, name: academicPeriods.name, school: { id: schools.id, name: schools.name } }).from(academicPeriods).innerJoin(schools, eq(schools.id, academicPeriods.schoolId)).orderBy(desc(academicPeriods.year), asc(academicPeriods.name)),
    db.select({ id: curriculumMatrices.id, name: curriculumMatrices.name }).from(curriculumMatrices).orderBy(asc(curriculumMatrices.name)),
    listEducationClasses(db),
    db.select({ id: teachers.id, employee: { name: employees.name } }).from(teachers).innerJoin(employees, eq(employees.id, teachers.employeeId)).orderBy(asc(employees.name)),
    db.select({ id: schoolSubjects.id, name: schoolSubjects.name }).from(schoolSubjects).where(eq(schoolSubjects.isActive, true)).orderBy(asc(schoolSubjects.name)),
  ]);
  return { schools: schoolRows, periods, matrices, classes, teachers: teacherRows, subjects };
}
export async function listEducationEnrollments(db: DatabaseExecutor): Promise<EducationEnrollmentRow[]> {
  const rows = await db.select({ id: enrollments.id, supportCode: enrollments.supportCode, year: enrollments.year, status: enrollments.status, enrollmentDate: enrollments.enrollmentDate, studentId: students.id, studentCode: students.studentCode, person: { id: people.id, fullName: people.fullName, cpf: people.cpf }, school: { id: schools.id, name: schools.name }, schoolClass: { id: schoolClasses.id, name: schoolClasses.name }, period: { id: academicPeriods.id, name: academicPeriods.name } }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(people, eq(people.id, students.personId)).innerJoin(schools, eq(schools.id, enrollments.schoolId)).leftJoin(schoolClasses, eq(schoolClasses.id, enrollments.classId)).leftJoin(academicPeriods, eq(academicPeriods.id, enrollments.periodId)).orderBy(desc(enrollments.enrollmentDate));
  if (!rows.length) return [];
  const movements = await db.select({ enrollmentId: enrollmentMovements.enrollmentId, effectiveDate: enrollmentMovements.effectiveDate, type: enrollmentMovements.type, reason: enrollmentMovements.reason }).from(enrollmentMovements).where(inArray(enrollmentMovements.enrollmentId, rows.map(row => row.id))).orderBy(desc(enrollmentMovements.effectiveDate));
  return rows.map(({ studentId, studentCode, person, ...row }) => ({ ...row, student: { id: studentId, studentCode, person }, movements: movements.filter(movement => movement.enrollmentId === row.id) }));
}
export async function getEducationClassForEnrollment(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ schoolClass: schoolClasses, periodId: academicPeriods.id, enrollmentCount: sql<number>`(select count(*)::int from "Enrollment" e where e."classId" = ${schoolClasses.id} and e.status = 'Matriculado')` }).from(schoolClasses).leftJoin(academicPeriods, eq(academicPeriods.id, schoolClasses.periodId)).where(eq(schoolClasses.id, id)).limit(1);
  return row;
}
export async function listEducationCensusOperations(db: DatabaseExecutor): Promise<EducationCensusOperation[]> {
  return db.select().from(educacensoOperations).orderBy(desc(educacensoOperations.createdAt)).limit(200);
}
export async function educationCensusExportLines(db: DatabaseExecutor, exportType: string): Promise<string[]> {
  const rows = await db.select({ inepCode: schools.inepCode, schoolId: schools.id, studentCode: students.studentCode, fullName: people.fullName, className: schoolClasses.name, status: enrollments.status }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(people, eq(people.id, students.personId)).innerJoin(schools, eq(schools.id, enrollments.schoolId)).leftJoin(schoolClasses, eq(schoolClasses.id, enrollments.classId)).orderBy(asc(schools.name), asc(people.fullName));
  return rows.map(row => [exportType, row.inepCode || row.schoolId, row.studentCode, row.fullName, row.className || "", row.status].join(";"));
}
export async function countActiveStudentEnrollments(db: DatabaseExecutor, studentId: string, year: number): Promise<number> {
  const [row] = await db.select({ value: count() }).from(enrollments).where(and(eq(enrollments.studentId, studentId), eq(enrollments.year, year), eq(enrollments.status, "Matriculado")));
  return row.value;
}
export async function getEducationDashboardTotals(db: DatabaseExecutor): Promise<[number, number, number, number]> {
  const [schoolRows, studentRows, classRows, diaryRows] = await Promise.all([
    db.select({ value: count() }).from(schools),
    db.select({ value: count() }).from(students).where(eq(students.status, "Ativo")),
    db.select({ value: count() }).from(schoolClasses).where(eq(schoolClasses.status, "Aberta")),
    db.select({ value: count() }).from(classDiaries).where(eq(classDiaries.status, "Aberto")),
  ]);
  return [schoolRows[0].value, studentRows[0].value, classRows[0].value, diaryRows[0].value];
}
export async function listEducationSchools(db: DatabaseExecutor): Promise<EducationSchoolRow[]> {
  const rows = await db.select({ id: schools.id, name: schools.name, inepCode: schools.inepCode, capacity: schools.capacity, isActive: schools.isActive,
    director: { id: employees.id }, person: { fullName: people.fullName },
    classes: sql<number>`(select count(*)::int from "SchoolClass" c where c."schoolId" = ${schools.id})`,
    enrollments: sql<number>`(select count(*)::int from "Enrollment" e where e."schoolId" = ${schools.id})`,
  }).from(schools).leftJoin(employees, eq(employees.id, schools.directorId)).leftJoin(people, eq(people.id, employees.personId)).orderBy(asc(schools.name));
  return rows.map(({ director, person, classes, enrollments: enrollmentCount, ...row }) => ({ ...row, director: director ? { person } : null, _count: { classes, enrollments: enrollmentCount } }));
}
export async function listEducationTeachers(db: DatabaseExecutor): Promise<EducationTeacherRow[]> {
  const rows = await db.select({ id: teachers.id, employee: { name: employees.name, registration: employees.registration, isActive: employees.isActive } }).from(teachers).innerJoin(employees, eq(employees.id, teachers.employeeId)).orderBy(asc(employees.name));
  if (!rows.length) return [];
  const classes = await db.select({ teacherId: schoolClasses.teacherId, school: { id: schools.id, name: schools.name } }).from(schoolClasses).innerJoin(schools, eq(schools.id, schoolClasses.schoolId)).where(inArray(schoolClasses.teacherId, rows.map(row => row.id)));
  return rows.map(row => ({ ...row, taughtClasses: classes.filter(item => item.teacherId === row.id).map(item => ({ school: item.school })) }));
}
export async function listEducationCalendarEvents(db: DatabaseExecutor): Promise<{ id: string; title: string; date: Date; endDate: Date | null; type: string }[]> {
  return db.select({ id: schoolCalendarEvents.id, title: schoolCalendarEvents.title, date: schoolCalendarEvents.date, endDate: schoolCalendarEvents.endDate, type: schoolCalendarEvents.type }).from(schoolCalendarEvents).orderBy(asc(schoolCalendarEvents.date));
}
