"use server";

import PDFDocument from "pdfkit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { people } from "@/db/schema/people";
import { educationalGuardians } from "@/db/schema/education-core";
import { academicDocumentIssues, preEnrollmentProcesses } from "@/db/schema/education-admissions";
import { learningSubmissions } from "@/db/schema/education-teaching";
import { getAcademicDocumentSource } from "@/db/repositories/education/admissions";
import { allocateEducationPreEnrollment, classifyEducationPreEnrollments, submitEducationPreEnrollment } from "@/lib/educacao/pre-enrollment-service";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";

export type S3ActionResult = { error: string | null; message?: string };
export type DocumentActionResult = S3ActionResult & { download?: { fileName: string; base64: string } };
const v = (data: FormData, key: string) => String(data.get(key) || "").trim();
const dt = (raw: string) => new Date(`${raw}T12:00:00.000Z`);
const msg = (cause: unknown) => cause instanceof Error ? cause.message : "Não foi possível concluir a operação.";
const refresh = () => { revalidatePath("/educacao/documentos"); revalidatePath("/educacao/pre-matricula"); revalidatePath("/educacao/portal-responsavel"); };

function pdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: title, Author: "CeleriFlow" } }), chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(16).text(title).moveDown(); doc.font("Helvetica").fontSize(10);
    for (const line of lines) doc.text(line).moveDown(.35);
    doc.end();
  });
}

export async function generateAcademicDocumentAction(data: FormData): Promise<DocumentActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "issueReports"), database = context.database ?? db;
    const studentId = v(data, "studentId"), type = v(data, "type");
    const student = await getAcademicDocumentSource(database, studentId);
    if (!student) throw new Error("Aluno não encontrado.");
    const enrollment = student.enrollments[0], absences = student.attendances.filter(item => !item.isPresent).length;
    const lines = [`Aluno: ${student.person.fullName}`, `CPF: ${student.person.cpf}`, `Código: ${student.studentCode}`, `Escola: ${enrollment?.school.name || "Não informada"}`, `Período: ${enrollment?.period?.name || enrollment?.year || "Não informado"}`, `Turma: ${enrollment?.schoolClass?.name || "Não informada"}`, `Situação: ${enrollment?.status || student.status}`, `Faltas registradas: ${absences}`, ...student.grades.map(grade => `${grade.period} · ${grade.schoolSubject.name}: ${grade.value ?? grade.concept ?? "Sem resultado"}${grade.recoveryValue != null ? ` · Recuperação ${grade.recoveryValue}` : ""}`)];
    const title = type === "Boletim" ? "Boletim escolar" : type === "Histórico" ? "Histórico escolar" : "Declaração escolar";
    const buffer = await pdf(title, lines), fileName = `${type.toLowerCase().replace(/\s/g, "-")}-${student.studentCode}.pdf`;
    await database.insert(academicDocumentIssues).values({ type, fileName, studentId, filters: enrollment ? { year: enrollment.year } : {}, generatedContent: lines.join("\n"), actorName: context.user.name });
    refresh(); return { error: null, message: "Documento gerado.", download: { fileName, base64: buffer.toString("base64") } };
  } catch (cause) { return { error: msg(cause) }; }
}

export async function createPreEnrollmentProcessAction(data: FormData): Promise<S3ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(preEnrollmentProcesses).values({ name: v(data, "name"), schoolId: v(data, "schoolId"), year: Number(v(data, "year")), stage: v(data, "stage"), shift: v(data, "shift") || null, capacity: Number(v(data, "capacity")), startDate: dt(v(data, "startDate")), endDate: dt(v(data, "endDate")), status: "Aberto", criteria: { priority: v(data, "priority") || "Data da solicitação" } });
    refresh(); return { error: null, message: "Processo de pré-matrícula aberto." };
  } catch (cause) { return { error: msg(cause) }; }
}

export async function submitPreEnrollmentAction(data: FormData): Promise<S3ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const protocol = await submitEducationPreEnrollment(context.database ?? db, { processId: v(data, "processId"), studentId: v(data, "studentId"), grade: v(data, "grade"), shift: v(data, "shift"), rankingScore: Number(v(data, "rankingScore")) || 0 });
    refresh(); return { error: null, message: `Solicitação registrada: ${protocol}.` };
  } catch (cause) { return { error: msg(cause) }; }
}

export async function classifyPreEnrollmentsAction(data: FormData): Promise<S3ActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "update");
    const total = await withDatabaseTransaction(databaseConnection, tx => classifyEducationPreEnrollments(tx, v(data, "processId")));
    refresh(); return { error: null, message: `${total} candidato(s) classificados.` };
  } catch (cause) { return { error: msg(cause) }; }
}

export async function allocatePreEnrollmentAction(data: FormData): Promise<S3ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "update");
    await allocateEducationPreEnrollment(context.database ?? db, v(data, "applicationId"));
    refresh(); return { error: null, message: "Candidato alocado. A matrícula definitiva permanece pendente de confirmação." };
  } catch (cause) { return { error: msg(cause) }; }
}

export async function submitLearningActivityAction(data: FormData): Promise<S3ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create"), database = context.database ?? db;
    const studentId = v(data, "studentId"), activityId = v(data, "activityId");
    if (!isSystemAdministrator(context.user)) {
      const [person] = await database.select({ id: people.id }).from(people).innerJoin(educationalGuardians, eq(educationalGuardians.personId, people.id)).where(and(eq(people.email, context.user.email), eq(educationalGuardians.studentId, studentId))).limit(1);
      if (!person) throw new Error("Responsável sem autorização para este aluno.");
    }
    const answer = v(data, "answer"), attachmentUrl = v(data, "attachmentUrl") || null;
    await database.insert(learningSubmissions).values({ activityId, studentId, answer, attachmentUrl }).onConflictDoUpdate({ target: [learningSubmissions.activityId, learningSubmissions.studentId], set: { answer, attachmentUrl, status: "Entregue", submittedAt: new Date(), feedback: null, score: null, reviewedAt: null, updatedAt: new Date() } });
    refresh(); return { error: null, message: "Atividade enviada." };
  } catch (cause) { return { error: msg(cause) }; }
}
