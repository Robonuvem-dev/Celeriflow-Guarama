import { and, asc, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { employees } from "../../schema/administration";
import { academicPeriods, classDiaries, curriculumMatrices, curriculumMatrixSubjects, enrollments, schoolClasses, schools, schoolSubjects, students, teacherClassAssignments, teachers } from "../../schema/education-core";
import { educationAssessments, educationGrades, learningActivities, learningQuestions, learningSubmissions, teacherAcademicRecords } from "../../schema/education-teaching";
import type { TeachingClass, TeachingEnrollment, TeachingWorkspaceRecords } from "@/lib/contracts/education-teaching";

export async function findTeachingWorkspaceIdentity(database: DatabaseExecutor, employeeId: string | null | undefined, administrator: boolean): Promise<{ id: string; employee: { name: string } } | null> {
  if (!employeeId && !administrator) return null;
  const [teacher] = await database.select({ id: teachers.id, employee: { name: employees.name } }).from(teachers).innerJoin(employees, eq(employees.id, teachers.employeeId)).where(employeeId ? eq(teachers.employeeId, employeeId) : undefined).orderBy(asc(employees.name)).limit(1);
  return teacher ?? null;
}

async function listTeachingEnrollments(database: DatabaseExecutor, classIds: string[]): Promise<(TeachingEnrollment & { classId: string | null })[]> {
  if (!classIds.length) return [];
  const rows = await database.select({ classId: enrollments.classId, status: enrollments.status, enrollmentDate: enrollments.enrollmentDate, endDate: enrollments.endDate, student: { id: students.id, studentCode: students.studentCode }, fullName: people.fullName }).from(enrollments).innerJoin(students, eq(students.id, enrollments.studentId)).innerJoin(people, eq(people.id, students.personId)).where(and(inArray(enrollments.classId, classIds), inArray(enrollments.status, ["Matriculado", "Falecido", "Abandono"]))).orderBy(asc(people.fullName));
  return rows.map(({ fullName, student, ...row }) => ({ ...row, student: { ...student, person: { fullName } } }));
}

export async function listTeachingWorkspaceClasses(database: DatabaseExecutor, teacherId: string): Promise<TeachingClass[]> {
  const rows = await database.select({ id: schoolClasses.id, name: schoolClasses.name, teacherId: schoolClasses.teacherId, school: { name: schools.name }, period: { name: academicPeriods.name }, matrix: { id: curriculumMatrices.id } }).from(schoolClasses).innerJoin(schools, eq(schools.id, schoolClasses.schoolId)).leftJoin(academicPeriods, eq(academicPeriods.id, schoolClasses.periodId)).leftJoin(curriculumMatrices, eq(curriculumMatrices.id, schoolClasses.matrixId)).where(or(eq(schoolClasses.teacherId, teacherId), exists(database.select({ id: teacherClassAssignments.id }).from(teacherClassAssignments).where(and(eq(teacherClassAssignments.classId, schoolClasses.id), eq(teacherClassAssignments.teacherId, teacherId), eq(teacherClassAssignments.isActive, true)))))).orderBy(asc(schools.name), asc(schoolClasses.name));
  if (!rows.length) return [];
  const classIds = rows.map(row => row.id), matrixIds = rows.flatMap(row => row.matrix ? [row.matrix.id] : []);
  const [enrollmentRows, assignments, components] = await Promise.all([
    listTeachingEnrollments(database, classIds),
    database.select({ classId: teacherClassAssignments.classId, subjectId: teacherClassAssignments.subjectId, subject: { id: schoolSubjects.id, name: schoolSubjects.name } }).from(teacherClassAssignments).innerJoin(schoolSubjects, eq(schoolSubjects.id, teacherClassAssignments.subjectId)).where(and(inArray(teacherClassAssignments.classId, classIds), eq(teacherClassAssignments.teacherId, teacherId), eq(teacherClassAssignments.isActive, true))),
    matrixIds.length ? database.select({ matrixId: curriculumMatrixSubjects.matrixId, subjectId: curriculumMatrixSubjects.subjectId, subject: { id: schoolSubjects.id, name: schoolSubjects.name } }).from(curriculumMatrixSubjects).innerJoin(schoolSubjects, eq(schoolSubjects.id, curriculumMatrixSubjects.subjectId)).where(inArray(curriculumMatrixSubjects.matrixId, matrixIds)) : Promise.resolve([]),
  ]);
  return rows.map(row => ({ ...row, matrix: row.matrix ? { subjects: components.filter(item => item.matrixId === row.matrix?.id) } : null, teacherAssignments: assignments.filter(item => item.classId === row.id), enrollments: enrollmentRows.filter(item => item.classId === row.id) }));
}

export async function loadTeachingWorkspaceRecords(database: DatabaseExecutor, teacherId: string): Promise<TeachingWorkspaceRecords> {
  const [diaryRows, assessmentRows, records, activityRows] = await Promise.all([
    database.select({ id: classDiaries.id, date: classDiaries.date, contentTaught: classDiaries.contentTaught, status: classDiaries.status, stage: classDiaries.stage, schoolClass: { name: schoolClasses.name }, schoolSubject: { name: schoolSubjects.name }, attendanceCount: sql<number>`(select count(*)::int from "Attendance" a where a."diaryId" = ${classDiaries.id})` }).from(classDiaries).innerJoin(schoolClasses, eq(schoolClasses.id, classDiaries.classId)).leftJoin(schoolSubjects, eq(schoolSubjects.id, classDiaries.subjectId)).where(eq(classDiaries.teacherId, teacherId)).orderBy(desc(classDiaries.date)).limit(200),
    database.select({ id: educationAssessments.id, date: educationAssessments.date, title: educationAssessments.title, stage: educationAssessments.stage, status: educationAssessments.status, evaluationMode: educationAssessments.evaluationMode, maxScore: educationAssessments.maxScore, classId: educationAssessments.classId, schoolClass: { name: schoolClasses.name }, subject: { name: schoolSubjects.name } }).from(educationAssessments).innerJoin(schoolClasses, eq(schoolClasses.id, educationAssessments.classId)).innerJoin(schoolSubjects, eq(schoolSubjects.id, educationAssessments.subjectId)).where(eq(educationAssessments.teacherId, teacherId)).orderBy(desc(educationAssessments.date)),
    database.select({ id: teacherAcademicRecords.id, type: teacherAcademicRecords.type, title: teacherAcademicRecords.title, stage: teacherAcademicRecords.stage, status: teacherAcademicRecords.status, startDate: teacherAcademicRecords.startDate, schoolClass: { name: schoolClasses.name }, subject: { name: schoolSubjects.name } }).from(teacherAcademicRecords).innerJoin(schoolClasses, eq(schoolClasses.id, teacherAcademicRecords.classId)).leftJoin(schoolSubjects, eq(schoolSubjects.id, teacherAcademicRecords.subjectId)).where(eq(teacherAcademicRecords.teacherId, teacherId)).orderBy(desc(teacherAcademicRecords.startDate)).limit(200),
    database.select({ id: learningActivities.id, type: learningActivities.type, title: learningActivities.title, status: learningActivities.status, createdAt: learningActivities.createdAt, schoolClass: { name: schoolClasses.name }, subject: { name: schoolSubjects.name } }).from(learningActivities).innerJoin(schoolClasses, eq(schoolClasses.id, learningActivities.classId)).innerJoin(schoolSubjects, eq(schoolSubjects.id, learningActivities.subjectId)).where(eq(learningActivities.teacherId, teacherId)).orderBy(desc(learningActivities.createdAt)).limit(200),
  ]);
  const assessmentIds = assessmentRows.map(row => row.id), activityIds = activityRows.map(row => row.id);
  const [enrollmentRows, grades, questions, submissionRows] = await Promise.all([
    listTeachingEnrollments(database, [...new Set(assessmentRows.map(row => row.classId))]),
    assessmentIds.length ? database.select({ assessmentId: educationGrades.assessmentId, studentId: educationGrades.studentId, value: educationGrades.value, concept: educationGrades.concept, absent: educationGrades.absent, recoveryValue: educationGrades.recoveryValue, feedback: educationGrades.feedback }).from(educationGrades).where(inArray(educationGrades.assessmentId, assessmentIds)) : Promise.resolve([]),
    activityIds.length ? database.select({ id: learningQuestions.id, activityId: learningQuestions.activityId }).from(learningQuestions).where(inArray(learningQuestions.activityId, activityIds)) : Promise.resolve([]),
    activityIds.length ? database.select({ id: learningSubmissions.id, activityId: learningSubmissions.activityId, status: learningSubmissions.status, answer: learningSubmissions.answer, feedback: learningSubmissions.feedback, fullName: people.fullName }).from(learningSubmissions).innerJoin(students, eq(students.id, learningSubmissions.studentId)).innerJoin(people, eq(people.id, students.personId)).where(inArray(learningSubmissions.activityId, activityIds)) : Promise.resolve([]),
  ]);
  return {
    diaries: diaryRows.map(({ attendanceCount, ...row }) => ({ ...row, _count: { attendances: attendanceCount } })),
    assessments: assessmentRows.map(row => ({ ...row, schoolClass: { ...row.schoolClass, enrollments: enrollmentRows.filter(item => item.classId === row.classId) }, grades: grades.filter(item => item.assessmentId === row.id) })),
    records,
    activities: activityRows.map(row => ({ ...row, questions: questions.filter(item => item.activityId === row.id), submissions: submissionRows.filter(item => item.activityId === row.id).map(({ fullName, ...item }) => ({ ...item, student: { person: { fullName } } })) })),
  };
}
