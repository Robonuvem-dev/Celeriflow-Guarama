import "dotenv/config";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { curriculumMatrixSubjects, enrollments, schoolClasses, teacherClassAssignments, teachers } from "../src/db/schema/education-core";
import { educationAssessments, educationGrades, learningActivities, learningQuestions, learningSubmissions } from "../src/db/schema/education-teaching";

async function main() {
  let assignments = await db.select().from(teacherClassAssignments).where(eq(teacherClassAssignments.isActive, true)).orderBy(asc(teacherClassAssignments.createdAt));
  if (!assignments.length) {
    const direct = await db.select({ schoolClass: schoolClasses, teacher: { id: teachers.id } }).from(schoolClasses).leftJoin(teachers, eq(teachers.id, schoolClasses.teacherId)).where(and(isNotNull(schoolClasses.teacherId), isNotNull(schoolClasses.matrixId)));
    for (const { schoolClass, teacher } of direct) {
      const [component] = schoolClass.matrixId ? await db.select({ subjectId: curriculumMatrixSubjects.subjectId }).from(curriculumMatrixSubjects).where(eq(curriculumMatrixSubjects.matrixId, schoolClass.matrixId)).limit(1) : [];
      if (teacher && component) await db.insert(teacherClassAssignments).values({ classId: schoolClass.id, teacherId: teacher.id, subjectId: component.subjectId, startDate: new Date(`${schoolClass.year}-02-01T12:00:00Z`) }).onConflictDoUpdate({ target: [teacherClassAssignments.classId, teacherClassAssignments.teacherId, teacherClassAssignments.subjectId, teacherClassAssignments.startDate], set: { isActive: true, updatedAt: new Date() } });
    }
    assignments = await db.select().from(teacherClassAssignments).where(eq(teacherClassAssignments.isActive, true)).orderBy(asc(teacherClassAssignments.createdAt));
  }
  for (const assignment of assignments) {
    const studentRows = await db.select({ studentId: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, assignment.classId), eq(enrollments.status, "Matriculado")));
    const key = `S2-${assignment.classId.slice(-6)}-${assignment.subjectId.slice(-6)}`, title = `Avaliação diagnóstica ${key}`;
    let [assessment] = await db.select({ id: educationAssessments.id }).from(educationAssessments).where(and(eq(educationAssessments.teacherId, assignment.teacherId), eq(educationAssessments.classId, assignment.classId), eq(educationAssessments.subjectId, assignment.subjectId), eq(educationAssessments.title, title))).limit(1);
    if (!assessment) [assessment] = await db.insert(educationAssessments).values({ teacherId: assignment.teacherId, classId: assignment.classId, subjectId: assignment.subjectId, title, stage: "1º Bimestre", type: "Diagnóstica", evaluationMode: "Nota", date: new Date("2026-03-12T12:00:00Z"), maxScore: 10, averageScore: 6, status: "Publicada", publishedAt: new Date("2026-03-15T12:00:00Z") }).returning({ id: educationAssessments.id });
    for (const [index, enrollment] of studentRows.entries()) await db.insert(educationGrades).values({ assessmentId: assessment.id, classId: assignment.classId, studentId: enrollment.studentId, subjectId: assignment.subjectId, teacherId: assignment.teacherId, period: "1º Bimestre", value: 7 + (index % 3), publishedAt: new Date("2026-03-15T12:00:00Z") }).onConflictDoNothing({ target: [educationGrades.assessmentId, educationGrades.studentId] });
    const activityTitle = `Leitura orientada ${key}`;
    let [activity] = await db.select({ id: learningActivities.id }).from(learningActivities).where(and(eq(learningActivities.teacherId, assignment.teacherId), eq(learningActivities.classId, assignment.classId), eq(learningActivities.title, activityTitle))).limit(1);
    if (!activity) activity = await withDatabaseTransaction(databaseConnection, async tx => {
      const [created] = await tx.insert(learningActivities).values({ teacherId: assignment.teacherId, classId: assignment.classId, subjectId: assignment.subjectId, title: activityTitle, type: "Atividade", instructions: "Leia o material indicado e registre as ideias principais.", dueAt: new Date("2026-03-25T20:00:00Z"), status: "Publicada", publishedAt: new Date("2026-03-18T12:00:00Z") }).returning({ id: learningActivities.id });
      await tx.insert(learningQuestions).values({ activityId: created.id, statement: "Quais foram as ideias principais do texto?", type: "Discursiva", points: 10 });
      return created;
    });
    const first = studentRows[0];
    if (first) await db.insert(learningSubmissions).values({ activityId: activity.id, studentId: first.studentId, answer: "O texto apresenta o tema central e seus exemplos.", status: "Entregue" }).onConflictDoNothing({ target: [learningSubmissions.activityId, learningSubmissions.studentId] });
  }
  console.log(`Operação do professor preparada para ${assignments.length} vínculo(s).`);
}
main().finally(() => databaseConnection.pool.end());
