import { eq } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { enrollments, enrollmentMovements, students } from "@/db/schema/education-core";
import { countActiveStudentEnrollments, getEducationClassForEnrollment } from "@/db/repositories/education/core";
import { makeSupportCode } from "./s1";

// Both operations must be invoked inside the caller's SERIALIZABLE transaction.
// No connection is opened here: enrollment and its historical evidence share rollback.
export async function enrollEducationStudent(tx: DatabaseTransaction, input: {
  studentId: string; classId: string; enrollmentDate: Date; actorName: string; notes: string | null;
}): Promise<string> {
  const current = await getEducationClassForEnrollment(tx, input.classId);
  const [student] = await tx.select().from(students).where(eq(students.id, input.studentId)).limit(1);
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
  reason: string | null; destinationMunicipality: string | null; actorName: string;
}): Promise<void> {
  const [enrollment] = await tx.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId)).limit(1);
  if (!enrollment) throw new Error("Matrícula não encontrada.");
  if (input.type === "Remanejamento") {
    if (!input.targetClassId) throw new Error("Informe a turma de destino.");
    const target = await getEducationClassForEnrollment(tx, input.targetClassId);
    if (!target || target.schoolClass.year !== enrollment.year || target.schoolClass.schoolId !== enrollment.schoolId) throw new Error("A turma de destino deve pertencer à mesma escola e ano.");
    if (target.enrollmentCount >= target.schoolClass.capacity) throw new Error("A turma de destino não possui vaga.");
    await tx.update(enrollments).set({ classId: input.targetClassId }).where(eq(enrollments.id, input.enrollmentId));
  } else if (["Transferência", "Evasão", "Cancelamento"].includes(input.type)) {
    await tx.update(enrollments).set({ status: input.type === "Transferência" ? "Transferido" : input.type === "Evasão" ? "Evadido" : "Cancelado", endDate: input.effectiveDate }).where(eq(enrollments.id, input.enrollmentId));
  } else throw new Error("Tipo de movimentação inválido.");
  await tx.insert(enrollmentMovements).values({ enrollmentId: input.enrollmentId, type: input.type, effectiveDate: input.effectiveDate, sourceClassId: enrollment.classId, targetClassId: input.targetClassId, reason: input.reason, destinationMunicipality: input.destinationMunicipality, actorName: input.actorName });
}
