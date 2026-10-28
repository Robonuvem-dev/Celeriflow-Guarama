import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { academicPeriods, enrollments, schoolClasses, schools, schoolSubjects, students } from "../../schema/education-core";
import { educationAttendances, educationGrades } from "../../schema/education-teaching";
import { academicDocumentIssues, preEnrollmentProcesses, preEnrollments } from "../../schema/education-admissions";
import type { AcademicDocumentIssueRow, AcademicDocumentSource, EducationPreEnrollmentProcessRow, EducationPreEnrollmentRow } from "@/lib/contracts/education-admissions";

export async function getAcademicDocumentSource(database: DatabaseExecutor, studentId: string): Promise<AcademicDocumentSource | null> {
  const [student] = await database.select({ id: students.id, studentCode: students.studentCode, status: students.status, person: { fullName: people.fullName, cpf: people.cpf } }).from(students).innerJoin(people, eq(people.id, students.personId)).where(eq(students.id, studentId)).limit(1);
  if (!student) return null;
  const [enrollmentRows, grades, attendances] = await Promise.all([
    database.select({ year: enrollments.year, status: enrollments.status, school: { name: schools.name }, schoolClass: { name: schoolClasses.name }, period: { name: academicPeriods.name } }).from(enrollments).innerJoin(schools, eq(schools.id, enrollments.schoolId)).leftJoin(schoolClasses, eq(schoolClasses.id, enrollments.classId)).leftJoin(academicPeriods, eq(academicPeriods.id, enrollments.periodId)).where(eq(enrollments.studentId, studentId)).orderBy(desc(enrollments.year)),
    database.select({ period: educationGrades.period, value: educationGrades.value, concept: educationGrades.concept, recoveryValue: educationGrades.recoveryValue, schoolSubject: { name: schoolSubjects.name } }).from(educationGrades).innerJoin(schoolSubjects, eq(schoolSubjects.id, educationGrades.subjectId)).where(and(eq(educationGrades.studentId, studentId), isNotNull(educationGrades.publishedAt))).orderBy(asc(educationGrades.period)),
    database.select({ isPresent: educationAttendances.isPresent }).from(educationAttendances).where(eq(educationAttendances.studentId, studentId)),
  ]);
  return { ...student, enrollments: enrollmentRows, grades, attendances };
}

export async function listAcademicDocumentIssues(database: DatabaseExecutor): Promise<AcademicDocumentIssueRow[]> {
  const rows = await database.select({ id: academicDocumentIssues.id, type: academicDocumentIssues.type, fileName: academicDocumentIssues.fileName, actorName: academicDocumentIssues.actorName, createdAt: academicDocumentIssues.createdAt, student: { id: students.id }, person: { fullName: people.fullName } }).from(academicDocumentIssues).leftJoin(students, eq(students.id, academicDocumentIssues.studentId)).leftJoin(people, eq(people.id, students.personId)).orderBy(desc(academicDocumentIssues.createdAt)).limit(200);
  return rows.map(({ student, person, ...row }) => ({ ...row, student: student && person ? { person } : null }));
}

export async function listEducationPreEnrollmentProcesses(database: DatabaseExecutor): Promise<EducationPreEnrollmentProcessRow[]> {
  const rows = await database.select({ id: preEnrollmentProcesses.id, name: preEnrollmentProcesses.name, status: preEnrollmentProcesses.status, school: { name: schools.name }, applications: sql<number>`(select count(*)::int from "PreEnrollment" p where p."processId" = ${preEnrollmentProcesses.id})` }).from(preEnrollmentProcesses).innerJoin(schools, eq(schools.id, preEnrollmentProcesses.schoolId)).orderBy(desc(preEnrollmentProcesses.startDate));
  return rows.map(({ applications, ...row }) => ({ ...row, _count: { applications } }));
}

export async function listEducationPreEnrollments(database: DatabaseExecutor): Promise<EducationPreEnrollmentRow[]> {
  const rows = await database.select({ id: preEnrollments.id, protocol: preEnrollments.protocol, year: preEnrollments.year, stage: preEnrollments.stage, grade: preEnrollments.grade, shift: preEnrollments.shift, rankingScore: preEnrollments.rankingScore, position: preEnrollments.position, status: preEnrollments.status, fullName: people.fullName, school: { name: schools.name }, process: { name: preEnrollmentProcesses.name } }).from(preEnrollments).innerJoin(students, eq(students.id, preEnrollments.studentId)).innerJoin(people, eq(people.id, students.personId)).innerJoin(schools, eq(schools.id, preEnrollments.schoolId)).leftJoin(preEnrollmentProcesses, eq(preEnrollmentProcesses.id, preEnrollments.processId)).orderBy(asc(preEnrollments.position), asc(preEnrollments.createdAt));
  return rows.map(({ fullName, ...row }) => ({ ...row, student: { person: { fullName } } }));
}
