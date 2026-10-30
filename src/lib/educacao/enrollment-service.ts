import { and, desc, eq, lte, gte } from "drizzle-orm";
import { educationAttendances } from "@/db/schema/education-teaching";
import { consecutiveAbsentDays } from "./enrollment-lifecycle";
import type { DatabaseTransaction } from "@/db/transaction";
import { enrollments, enrollmentMovements, students, classDiaries } from "@/db/schema/education-core";
import { countActiveStudentEnrollments, getEducationClassForEnrollment } from "@/db/repositories/education/core";
import { makeSupportCode } from "./s1";

// Both operations must be invoked inside the caller's SERIALIZABLE transaction.
// No connection is opened here: enrollment and its historical evidence share rollback.
export async function enrollEducationStudent(tx: DatabaseTransaction, input: {
  studentId: string; classId: string; enrollmentDate: Date; actorName: string; notes: string | null;
}): Promise<string> {
  const current = await getEducationClassForEnrollment(tx, input.classId);
  const [student] = await tx.select().from(students).where(eq(students.id, input.studentId)).limit(1);
  if (student?.status === "Falecido") throw new Error("Aluno falecido não pode ser matriculado.");
  if (!current || !student || !current.periodId) throw new Error("Aluno, turma ou período letivo não encontrado.");
  const { schoolClass } = current;
  if (schoolClass.status !== "Aberta") throw new Error("A turma não está aberta para matrículas.");
  if (current.enrollmentCount >= schoolClass.capacity) throw new Error("A turma atingiu a capacidade cadastrada.");
  if (await countActiveStudentEnrollments(tx, input.studentId, schoolClass.year)) throw new Error("O aluno já possui matrícula ativa neste ano letivo.");
  const [enrollment] = await tx.insert(enrollments).values({ studentId: input.studentId, classId: input.classId, schoolId: schoolClass.schoolId, periodId: schoolClass.periodId, year: schoolClass.year, supportCode: makeSupportCode(schoolClass.year, student.studentCode), enrollmentDate: input.enrollmentDate }).returning({ id: enrollments.id });
  await tx.insert(enrollmentMovements).values({ enrollmentId: enrollment.id, type: "Matrícula", effectiveDate: input.enrollmentDate, targetClassId: input.classId, actorName: input.actorName, notes: input.notes });
  return enrollment.id;
}

export async function moveEducationEnrollment(tx: DatabaseTransaction, input: {
  enrollmentId: string; type: string; targetClassId: string | null; effectiveDate: Date;
  reason: string | null; destinationMunicipality: string | null; actorName: string; minimumConsecutiveAbsences?: number;
}): Promise<void> {
  const [enrollment] = await tx.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!enrollment) throw new Error("Matrícula não encontrada.");
  if (!Number.isFinite(input.effectiveDate.getTime()) || input.effectiveDate < enrollment.enrollmentDate) throw new Error("Data de movimentação inválida ou anterior à matrícula.");
  if (enrollment.status !== "Matriculado") throw new Error("A matrícula já está encerrada.");
  if (input.type === "Abandono") {
    const minimum = input.minimumConsecutiveAbsences;
    if (!minimum || !Number.isSafeInteger(minimum) || minimum < 1 || minimum > 365 || !input.reason?.trim()) throw new Error("Informe o limite regulamentar de faltas consecutivas e o fundamento do abandono.");
    const records = await tx.select({ date: classDiaries.date, isPresent: educationAttendances.isPresent }).from(classDiaries).leftJoin(educationAttendances, and(eq(educationAttendances.diaryId, classDiaries.id), eq(educationAttendances.studentId, enrollment.studentId))).where(and(eq(classDiaries.classId, enrollment.classId!), lte(classDiaries.date, input.effectiveDate), gte(classDiaries.date, enrollment.enrollmentDate))).orderBy(desc(classDiaries.date));
    if (consecutiveAbsentDays(records.map(r => ({ date: r.date.toISOString(), isPresent: r.isPresent }))) < minimum) throw new Error("Faltas consecutivas comprovadas insuficientes para abandono.");
  }

  if (input.type === "Remanejamento") {
    if (!input.targetClassId) throw new Error("Informe a turma de destino.");
    const target = await getEducationClassForEnrollment(tx, input.targetClassId);
    if (!target || target.schoolClass.year !== enrollment.year || target.schoolClass.schoolId !== enrollment.schoolId) throw new Error("A turma de destino deve pertencer à mesma escola e ano.");
    if (target.enrollmentCount >= target.schoolClass.capacity) throw new Error("A turma de destino não possui vaga.");
    await tx.update(enrollments).set({ classId: input.targetClassId }).where(eq(enrollments.id, input.enrollmentId));
  } else if (["Transferência", "Evasão", "Cancelamento", "Falecimento", "Abandono"].includes(input.type)) {
    await tx.update(enrollments).set({ status: input.type === "Falecimento" ? "Falecido" : input.type === "Abandono" ? "Abandono" : input.type === "Transferência" ? "Transferido" : input.type === "Evasão" ? "Evadido" : "Cancelado", endDate: input.effectiveDate }).where(eq(enrollments.id, input.enrollmentId));
  } else throw new Error("Tipo de movimentação inválido.");
  if (input.type === "Falecimento") {
    await tx.update(students).set({ status: "Falecido" }).where(eq(students.id, enrollment.studentId));
    const others = await tx.update(enrollments).set({ status: "Falecido", endDate: input.effectiveDate }).where(and(eq(enrollments.studentId, enrollment.studentId), eq(enrollments.status, "Matriculado"))).returning();
    for (const other of others) await tx.insert(enrollmentMovements).values({ enrollmentId: other.id, type: "Falecimento", effectiveDate: input.effectiveDate, sourceClassId: other.classId, reason: input.reason, actorName: input.actorName });
  }
  await tx.insert(enrollmentMovements).values({ enrollmentId: input.enrollmentId, type: input.type, effectiveDate: input.effectiveDate, sourceClassId: enrollment.classId, targetClassId: input.targetClassId, reason: input.reason, destinationMunicipality: input.destinationMunicipality, actorName: input.actorName });
}
