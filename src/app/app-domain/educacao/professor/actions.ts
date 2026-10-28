"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { classDiaries, enrollments, schoolClasses, teacherClassAssignments, teachers } from "@/db/schema/education-core";
import { educationAssessments, educationAttendances, educationGrades, learningActivities, learningQuestions, learningSubmissions, teacherAcademicRecords } from "@/db/schema/education-teaching";

export type ProfessorActionResult = { error: string | null; message?: string };
const value = (data: FormData, key: string) => String(data.get(key) || "").trim();
const date = (raw: string) => new Date(`${raw}T12:00:00.000Z`);
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação.";
const refresh = () => { revalidatePath("/educacao/professor"); revalidatePath("/educacao"); };

async function contextForTeacher(data: FormData, operation: "create" | "update") {
  const context = await getTenantContextForModuleOperation("EDUCACAO", operation);
  const teacherId = value(data, "teacherId");
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher) throw new Error("Professor não encontrado.");
  if (!isSystemAdministrator(context.user) && context.user.employeeId !== teacher.employeeId) throw new Error("Acesso restrito ao diário do professor autenticado.");
  return { ...context, teacherId };
}

async function assertAssignment(database: DatabaseExecutor, teacherId: string, classId: string, subjectId?: string) {
  const [assignment] = await database.select({ id: teacherClassAssignments.id }).from(teacherClassAssignments).where(and(eq(teacherClassAssignments.teacherId, teacherId), eq(teacherClassAssignments.classId, classId), eq(teacherClassAssignments.isActive, true), subjectId ? eq(teacherClassAssignments.subjectId, subjectId) : undefined)).limit(1);
  const [direct] = await database.select({ id: schoolClasses.id }).from(schoolClasses).where(and(eq(schoolClasses.id, classId), eq(schoolClasses.teacherId, teacherId))).limit(1);
  if (!assignment && !direct) throw new Error("Professor sem vínculo ativo com a turma e o componente selecionados.");
}

export async function saveDiaryAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId } = await contextForTeacher(data, "create");
    const classId = value(data, "classId"), subjectId = value(data, "subjectId"), rawDate = value(data, "date");
    await assertAssignment(db, teacherId, classId, subjectId);
    const entries = JSON.parse(value(data, "attendances") || "[]") as { studentId: string; isPresent: boolean; absenceGroup?: string; justification?: string }[];
    const enrolled = await db.select({ studentId: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classId, classId), eq(enrollments.status, "Matriculado")));
    const allowed = new Set(enrolled.map((item) => item.studentId));
    if (!entries.length || entries.some((item) => !allowed.has(item.studentId))) throw new Error("A lista de chamada não corresponde à turma selecionada.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [existing] = await tx.select().from(classDiaries).where(and(eq(classDiaries.classId, classId), eq(classDiaries.subjectId, subjectId), eq(classDiaries.teacherId, teacherId), eq(classDiaries.date, date(rawDate)))).limit(1);
      if (existing?.status === "Fechado") throw new Error("O diário está fechado. Reabra antes de alterar.");
      const details = { contentTaught: value(data, "contentTaught"), observations: value(data, "observations") || null, stage: value(data, "stage"), lessonCount: Number(value(data, "lessonCount")) || 1 };
      const [diary] = existing ? await tx.update(classDiaries).set(details).where(eq(classDiaries.id, existing.id)).returning({ id: classDiaries.id }) : await tx.insert(classDiaries).values({ classId, subjectId, teacherId, date: date(rawDate), ...details }).returning({ id: classDiaries.id });
      if (!diary) throw new Error("Diário não encontrado.");
      for (const item of entries) {
        const attendance = { isPresent: item.isPresent, absenceGroup: item.absenceGroup || null, justification: item.justification || null };
        await tx.insert(educationAttendances).values({ id: `${diary.id}-${item.studentId}`, diaryId: diary.id, studentId: item.studentId, ...attendance }).onConflictDoUpdate({ target: educationAttendances.id, set: { ...attendance, updatedAt: new Date() } });
      }
    });
    refresh(); return { error: null, message: "Chamada e conteúdo salvos." };
  } catch (error) { return { error: message(error) }; }
}

export async function setDiaryStatusAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId } = await contextForTeacher(data, "update");
    const [diary] = await db.select().from(classDiaries).where(and(eq(classDiaries.id, value(data, "diaryId")), eq(classDiaries.teacherId, teacherId))).limit(1);
    if (!diary) throw new Error("Diário não encontrado.");
    const close = value(data, "status") === "Fechado";
    const [updated] = await db.update(classDiaries).set({ status: close ? "Fechado" : "Aberto", publishedAt: close ? new Date() : null, reopenedAt: close ? diary.reopenedAt : new Date() }).where(eq(classDiaries.id, diary.id)).returning({ id: classDiaries.id });
    if (!updated) throw new Error("Diário não encontrado.");
    refresh(); return { error: null, message: close ? "Diário fechado e publicado." : "Diário reaberto." };
  } catch (error) { return { error: message(error) }; }
}

export async function createAssessmentAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId } = await contextForTeacher(data, "create");
    const classId = value(data, "classId"), subjectId = value(data, "subjectId"), maxScore = Number(value(data, "maxScore")) || null;
    await assertAssignment(db, teacherId, classId, subjectId);
    if (maxScore) { const [used] = await db.select({ total: sql<number>`coalesce(sum(${educationAssessments.maxScore}), 0)::float8` }).from(educationAssessments).where(and(eq(educationAssessments.classId, classId), eq(educationAssessments.subjectId, subjectId), eq(educationAssessments.stage, value(data, "stage")), ne(educationAssessments.status, "Cancelada"))); if (used.total + maxScore > 100) throw new Error("A pontuação total da etapa não pode ultrapassar 100 pontos."); }
    await db.insert(educationAssessments).values({ teacherId, classId, subjectId, title: value(data, "title"), stage: value(data, "stage"), type: value(data, "type"), evaluationMode: value(data, "evaluationMode"), date: date(value(data, "date")), maxScore, averageScore: Number(value(data, "averageScore")) || null, content: value(data, "content") || null });
    refresh(); return { error: null, message: "Avaliação criada." };
  } catch (error) { return { error: message(error) }; }
}

export async function saveGradesAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId } = await contextForTeacher(data, "update");
    const [assessment] = await db.select().from(educationAssessments).where(and(eq(educationAssessments.id, value(data, "assessmentId")), eq(educationAssessments.teacherId, teacherId))).limit(1);
    if (!assessment) throw new Error("Avaliação não encontrada.");
    if (assessment.status === "Fechada") throw new Error("A avaliação está fechada.");
    const grades = JSON.parse(value(data, "grades") || "[]") as { studentId: string; value?: number | null; concept?: string; absent?: boolean; recoveryValue?: number | null; feedback?: string }[];
    for (const item of grades) {
      const details = { value: item.value ?? null, concept: item.concept || null, absent: Boolean(item.absent), recoveryValue: item.recoveryValue ?? null, feedback: item.feedback || null };
      await db.insert(educationGrades).values({ assessmentId: assessment.id, studentId: item.studentId, classId: assessment.classId, subjectId: assessment.subjectId, teacherId, period: assessment.stage, type: "Avaliação", ...details }).onConflictDoUpdate({ target: [educationGrades.assessmentId, educationGrades.studentId], set: { ...details, updatedAt: new Date() } });
    }
    refresh(); return { error: null, message: "Resultados e recuperação salvos." };
  } catch (error) { return { error: message(error) }; }
}

export async function publishAssessmentAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId } = await contextForTeacher(data, "update");
    const [item] = await db.select({ id: educationAssessments.id }).from(educationAssessments).where(and(eq(educationAssessments.id, value(data, "assessmentId")), eq(educationAssessments.teacherId, teacherId))).limit(1);
    if (!item) throw new Error("Avaliação não encontrada.");
    const close = value(data, "status") === "Fechada";
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [updated] = await tx.update(educationAssessments).set({ status: close ? "Fechada" : "Publicada", publishedAt: new Date() }).where(eq(educationAssessments.id, item.id)).returning({ id: educationAssessments.id });
      if (!updated) throw new Error("Avaliação não encontrada.");
      await tx.update(educationGrades).set({ publishedAt: new Date() }).where(eq(educationGrades.assessmentId, item.id));
    });
    refresh(); return { error: null, message: close ? "Avaliação fechada." : "Resultados publicados." };
  } catch (error) { return { error: message(error) }; }
}

export async function createAcademicRecordAction(data: FormData): Promise<ProfessorActionResult> {
  try { const { teacherId } = await contextForTeacher(data, "create"); const classId=value(data,"classId"), subjectId=value(data,"subjectId") || undefined; await assertAssignment(db,teacherId,classId,subjectId); await db.insert(teacherAcademicRecords).values({ teacherId,classId,subjectId,title:value(data,"title"),type:value(data,"type"),stage:value(data,"stage")||null,startDate:date(value(data,"startDate")),endDate:value(data,"endDate")?date(value(data,"endDate")):null,content:{ objectives:value(data,"objectives"),methodology:value(data,"methodology"),resources:value(data,"resources"),assessment:value(data,"assessment") },status:value(data,"publish")==="on"?"Publicado":"Rascunho",publishedAt:value(data,"publish")==="on"?new Date():null }); refresh(); return {error:null,message:"Registro pedagógico salvo."}; } catch(error){return {error:message(error)}}
}

export async function createActivityAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const { teacherId }=await contextForTeacher(data,"create"); const classId=value(data,"classId"),subjectId=value(data,"subjectId"); await assertAssignment(db,teacherId,classId,subjectId);
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [activity] = await tx.insert(learningActivities).values({teacherId,classId,subjectId,title:value(data,"title"),type:value(data,"type"),instructions:value(data,"instructions"),materialUrl:value(data,"materialUrl")||null,dueAt:value(data,"dueAt")?new Date(value(data,"dueAt")):null,status:value(data,"publish")==="on"?"Publicada":"Rascunho",publishedAt:value(data,"publish")==="on"?new Date():null}).returning({ id: learningActivities.id });
      if (value(data,"question")) await tx.insert(learningQuestions).values({activityId:activity.id,statement:value(data,"question"),type:value(data,"questionType")||"Discursiva",options:value(data,"options")?value(data,"options").split("|"):undefined,answerKey:value(data,"answerKey")||null,points:Number(value(data,"points"))||null});
    });
    refresh(); return {error:null,message:"Atividade salva."};
  } catch(error){return {error:message(error)}}
}

export async function reviewSubmissionAction(data: FormData): Promise<ProfessorActionResult> {
  try {
    const {teacherId}=await contextForTeacher(data,"update");
    const [submission]=await db.select({ id: learningSubmissions.id }).from(learningSubmissions).innerJoin(learningActivities,eq(learningActivities.id,learningSubmissions.activityId)).where(and(eq(learningSubmissions.id,value(data,"submissionId")),eq(learningActivities.teacherId,teacherId))).limit(1);
    if(!submission) throw new Error("Entrega não encontrada.");
    const [updated] = await db.update(learningSubmissions).set({score:Number(value(data,"score"))||null,feedback:value(data,"feedback"),status:"Corrigida",reviewedAt:new Date()}).where(eq(learningSubmissions.id,submission.id)).returning({ id: learningSubmissions.id });
    if(!updated) throw new Error("Entrega não encontrada.");
    refresh(); return {error:null,message:"Correção e retorno registrados."};
  } catch(error){return {error:message(error)}}
}
