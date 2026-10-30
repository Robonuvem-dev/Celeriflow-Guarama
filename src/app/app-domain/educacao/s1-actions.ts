"use server";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { people } from "@/db/schema/people";
import { academicPeriods, classScheduleBoards, classScheduleEntries, curriculumMatrices, curriculumMatrixSubjects, educacensoOperations, educationalGuardians, schoolClasses, schools, schoolSubjects, students, teacherClassAssignments } from "@/db/schema/education-core";
import { educationCensusExportLines } from "@/db/repositories/education/core";
import { enrollEducationStudent, moveEducationEnrollment } from "@/lib/educacao/enrollment-service";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { intervalsOverlap, normalizeDigits, parseEducacensoFile, validateEducacensoRows, validateScheduleInterval } from "@/lib/educacao/s1";

export type EducationActionResult = { error: string | null; message?: string; download?: { fileName: string; content: string } };

const required = (data: FormData, name: string) => String(data.get(name) || "").trim();
const asDate = (value: string) => new Date(`${value}T12:00:00.000Z`);

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

function refreshEducation() {
  revalidatePath("/educacao");
  revalidatePath("/educacao/academico");
  revalidatePath("/educacao/alunos");
  revalidatePath("/educacao/matriculas");
  revalidatePath("/educacao/educacenso");
}

export async function createStudentAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    const personId = required(data, "personId");
    const studentCode = required(data, "studentCode");
    if (!personId || !studentCode) throw new Error("Pessoa e código do aluno são obrigatórios.");
    const guardianPersonId = required(data, "guardianPersonId");
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [student] = await tx.insert(students).values({
        personId,
        studentCode,
        specialNeeds: required(data, "specialNeeds") || null,
        dietaryRestrictions: required(data, "dietaryRestrictions").slice(0, 4000) || null,
        usesSchoolTransport: data.get("usesSchoolTransport") === "on",
        needsSpecialMeal: data.get("needsSpecialMeal") === "on",
      }).returning({ id: students.id });
      if (guardianPersonId) await tx.insert(educationalGuardians).values({ studentId: student.id, personId: guardianPersonId, kinship: required(data, "kinship") || "Responsável" });
    });
    refreshEducation();
    return { error: null, message: "Aluno vinculado ao cadastro único de pessoas." };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function createAcademicPeriodAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    const schoolId = required(data, "schoolId");
    const code = required(data, "code");
    const name = required(data, "name");
    const year = Number(required(data, "year"));
    const startDate = asDate(required(data, "startDate"));
    const endDate = asDate(required(data, "endDate"));
    if (!schoolId || !code || !name || !year || Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) throw new Error("Preencha os dados obrigatórios do período.");
    if (startDate >= endDate) throw new Error("O término deve ser posterior ao início.");
    await db.insert(academicPeriods).values({ schoolId, code, name, year, startDate, endDate, modality: required(data, "modality") || "Regular", resolution: required(data, "resolution") || null, minimumSchoolDays: Number(required(data, "minimumSchoolDays")) || 200 });
    refreshEducation();
    return { error: null, message: "Período letivo criado." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function createCurriculumMatrixAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    const schoolId = required(data, "schoolId");
    const periodId = required(data, "periodId");
    const name = required(data, "name");
    const subjectName = required(data, "subjectName");
    if (!schoolId || !periodId || !name || !subjectName) throw new Error("Escola, período, matriz e componente são obrigatórios.");
    const subjectCode = required(data, "subjectCode") || undefined;
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [subject] = subjectCode
        ? await tx.insert(schoolSubjects).values({ code: subjectCode, name: subjectName }).onConflictDoUpdate({ target: schoolSubjects.code, set: { name: subjectName, isActive: true, updatedAt: new Date() } }).returning({ id: schoolSubjects.id })
        : await tx.insert(schoolSubjects).values({ name: subjectName }).returning({ id: schoolSubjects.id });
      const [matrix] = await tx.insert(curriculumMatrices).values({ schoolId, periodId, name, stage: required(data, "stage"), grade: required(data, "grade"), annualWorkload: Number(required(data, "annualWorkload")) || 800 }).returning({ id: curriculumMatrices.id });
      await tx.insert(curriculumMatrixSubjects).values({ matrixId: matrix.id, subjectId: subject.id, workload: Number(required(data, "subjectWorkload")) || 80, weeklyLessons: Number(required(data, "weeklyLessons")) || 2 });
    });
    refreshEducation();
    return { error: null, message: "Matriz curricular criada com o primeiro componente." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function createSchoolClassAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    const periodId = required(data, "periodId");
    const matrixId = required(data, "matrixId");
    const [period] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, periodId)).limit(1);
    if (!period) throw new Error("Período letivo não encontrado.");
    await db.insert(schoolClasses).values({ schoolId: period.schoolId, periodId, matrixId: matrixId || null, name: required(data, "name"), year: period.year, stage: required(data, "stage"), grade: required(data, "grade"), shift: required(data, "shift"), room: required(data, "room") || null, capacity: Number(required(data, "capacity")) || 30, classType: required(data, "classType") || "Regular", groupingType: required(data, "groupingType") || "Disciplina", annualWorkload: Number(required(data, "annualWorkload")) || null, annualLessons: Number(required(data, "annualLessons")) || null, lessonMinutes: Number(required(data, "lessonMinutes")) || null });
    refreshEducation();
    return { error: null, message: "Turma criada." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function assignTeacherSubjectAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    await db.insert(teacherClassAssignments).values({ classId: required(data, "classId"), teacherId: required(data, "teacherId"), subjectId: required(data, "subjectId"), role: required(data, "role") || "Docente", startDate: asDate(required(data, "startDate")) });
    refreshEducation();
    return { error: null, message: "Professor e componente vinculados à turma." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function createEnrollmentAction(data: FormData): Promise<EducationActionResult> {
  try {
    const { user } = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const studentId = required(data, "studentId");
    const classId = required(data, "classId");
    await withDatabaseTransaction(databaseConnection, tx => enrollEducationStudent(tx, { studentId, classId, enrollmentDate: asDate(required(data, "enrollmentDate")), actorName: user.name, notes: required(data, "notes") || null }), { isolationLevel: "serializable" });
    refreshEducation();
    return { error: null, message: "Matrícula efetivada com histórico inicial." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function moveEnrollmentAction(data: FormData): Promise<EducationActionResult> {
  try {
    const { user } = await getTenantContextForModuleOperation("EDUCACAO", "update");
    const enrollmentId = required(data, "enrollmentId");
    const type = required(data, "type");
    const targetClassId = required(data, "targetClassId") || null;
    await withDatabaseTransaction(databaseConnection, tx => moveEducationEnrollment(tx, { enrollmentId, type, targetClassId, effectiveDate: asDate(required(data, "effectiveDate")), reason: required(data, "reason") || null, destinationMunicipality: required(data, "destinationMunicipality") || null, actorName: user.name, minimumConsecutiveAbsences: Number(required(data, "minimumConsecutiveAbsences")) || undefined }), { isolationLevel: "serializable" });
    refreshEducation();
    return { error: null, message: "Movimentação registrada sem perder o histórico da matrícula." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function createScheduleEntryAction(data: FormData): Promise<EducationActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    const classId = required(data, "classId");
    const startTime = required(data, "startTime");
    const endTime = required(data, "endTime");
    const weekday = Number(required(data, "weekday"));
    if (!validateScheduleInterval(startTime, endTime)) throw new Error("Informe um intervalo de horário válido.");
    let [board] = await db.select().from(classScheduleBoards).where(and(eq(classScheduleBoards.classId, classId), eq(classScheduleBoards.status, "Rascunho"))).limit(1);
    if (!board) {
      const [schoolClass] = await db.select().from(schoolClasses).where(eq(schoolClasses.id, classId)).limit(1);
      if (!schoolClass?.periodId) throw new Error("A turma precisa estar vinculada a um período.");
      [board] = await db.insert(classScheduleBoards).values({ classId, periodId: schoolClass.periodId, name: `Horário ${schoolClass.year}`, startDate: new Date(), status: "Rascunho" }).returning();
    }
    const entries = await db.select().from(classScheduleEntries).where(eq(classScheduleEntries.boardId, board.id));
    const conflict = entries.some((entry) => entry.weekday === weekday && intervalsOverlap(startTime, endTime, entry.startTime, entry.endTime));
    if (conflict) throw new Error("Existe conflito com outro horário desta turma.");
    await db.insert(classScheduleEntries).values({ boardId: board.id, subjectId: required(data, "subjectId"), teacherId: required(data, "teacherId") || null, weekday, lessonOrder: Number(required(data, "lessonOrder")), startTime, endTime });
    refreshEducation();
    return { error: null, message: "Aula adicionada ao quadro de horários." };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function processEducacensoImportAction(data: FormData): Promise<EducationActionResult> {
  try {
    const { user } = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const fileName = required(data, "fileName");
    const content = required(data, "content");
    const competence = required(data, "competence");
    const layoutVersion = required(data, "layoutVersion");
    if (!fileName || !content || !competence || !layoutVersion) throw new Error("Arquivo, competência e versão do leiaute são obrigatórios.");
    const checksum = createHash("sha256").update(content).digest("hex");
    const [previous] = await db.select().from(educacensoOperations).where(and(eq(educacensoOperations.operationType, "Importação"), eq(educacensoOperations.competence, competence), eq(educacensoOperations.checksum, checksum), eq(educacensoOperations.status, "Processado"))).limit(1);
    if (previous) {
      await db.insert(educacensoOperations).values({ operationType: "Importação", competence, layoutVersion, fileName, checksum, status: "Ignorado", recordsRead: previous.recordsRead, ignoredRecords: previous.recordsRead, actorName: user.name, issues: [{ message: "Arquivo já processado para esta competência." }] });
      refreshEducation();
      return { error: null, message: "Arquivo já processado; a repetição foi registrada e ignorada." };
    }
    const rows = parseEducacensoFile(content);
    const issues = validateEducacensoRows(rows);
    let updatedRecords = 0;
    for (const row of rows) {
      if (issues.some((issue) => issue.line === row.line)) continue;
      if (row.type === "ESCOLA") {
        const [inepCode, name] = row.fields;
        await db.insert(schools).values({ inepCode, name }).onConflictDoUpdate({ target: schools.inepCode, set: { name, isActive: true, updatedAt: new Date() } });
        updatedRecords += 1;
      } else if (row.type === "ESTUDANTE") {
        const [studentCode, fullName, rawCpf] = row.fields;
        const cpf = normalizeDigits(rawCpf || "");
        if (cpf.length !== 11) { issues.push({ line: row.line, message: "CPF do estudante ausente ou inválido." }); continue; }
        const [person] = await db.insert(people).values({ cpf, fullName }).onConflictDoUpdate({ target: people.cpf, set: { fullName, status: "Ativo", updatedAt: new Date() } }).returning({ id: people.id });
        await db.insert(students).values({ studentCode, personId: person.id }).onConflictDoUpdate({ target: students.studentCode, set: { status: "Ativo", updatedAt: new Date() } });
        updatedRecords += 1;
      } else {
        issues.push({ line: row.line, message: `${row.type} validado; vínculo depende dos cadastros funcionais e acadêmicos correspondentes.` });
      }
    }
    await db.insert(educacensoOperations).values({ operationType: "Importação", competence, layoutVersion, fileName, checksum, status: issues.length ? "Processado com críticas" : "Processado", recordsRead: rows.length, validRecords: rows.length - new Set(issues.map((item) => item.line)).size, updatedRecords, inconsistentRecords: new Set(issues.map((item) => item.line)).size, issues, actorName: user.name });
    refreshEducation();
    return { error: null, message: `${rows.length} registros lidos, ${updatedRecords} atualizados e ${new Set(issues.map((item) => item.line)).size} com críticas.` };
  } catch (error) { return { error: messageFor(error) }; }
}

export async function generateEducacensoExportAction(data: FormData): Promise<EducationActionResult> {
  try {
    const { user } = await getTenantContextForModuleOperation("EDUCACAO", "issueReports");
    const competence = required(data, "competence");
    const layoutVersion = required(data, "layoutVersion");
    const exportType = required(data, "exportType");
    const lines = await educationCensusExportLines(db, exportType);
    const content = lines.join("\n");
    const fileName = `educacenso-${exportType.toLowerCase().replace(/\s/g, "-")}-${competence}.txt`;
    await db.insert(educacensoOperations).values({ operationType: `Exportação - ${exportType}`, competence, layoutVersion, fileName, checksum: createHash("sha256").update(content).digest("hex"), status: "Gerado", recordsRead: lines.length, validRecords: lines.length, generatedContent: content, actorName: user.name });
    refreshEducation();
    return { error: null, message: `${lines.length} registros preparados para conferência.`, download: { fileName, content } };
  } catch (error) { return { error: messageFor(error) }; }
}
