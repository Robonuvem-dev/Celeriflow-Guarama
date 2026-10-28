import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { preEnrollmentProcesses, preEnrollments } from "@/db/schema/education-admissions";

export async function submitEducationPreEnrollment(database: DatabaseExecutor, input: { processId: string; studentId: string; grade: string; shift: string; rankingScore: number }): Promise<string> {
  const [process] = await database.select().from(preEnrollmentProcesses).where(eq(preEnrollmentProcesses.id, input.processId)).limit(1);
  if (!process || process.status !== "Aberto" || new Date() > process.endDate) throw new Error("Processo indisponível para solicitação.");
  const [duplicate] = await database.select({ id: preEnrollments.id }).from(preEnrollments).where(and(eq(preEnrollments.processId, process.id), eq(preEnrollments.studentId, input.studentId), ne(preEnrollments.status, "Cancelada"))).limit(1);
  if (duplicate) throw new Error("Já existe solicitação do aluno neste processo.");
  const [total] = await database.select({ value: count() }).from(preEnrollments).where(eq(preEnrollments.processId, process.id));
  const protocol = `PM-${process.year}-${String(total.value + 1).padStart(5, "0")}`;
  await database.insert(preEnrollments).values({ processId: process.id, studentId: input.studentId, schoolId: process.schoolId, year: process.year, stage: process.stage, grade: input.grade, shift: process.shift || input.shift || "A definir", protocol, rankingScore: input.rankingScore, history: [{ date: new Date().toISOString(), status: "Pendente" }] });
  return protocol;
}

export async function classifyEducationPreEnrollments(tx: DatabaseTransaction, processId: string): Promise<number> {
  const items = await tx.select({ id: preEnrollments.id }).from(preEnrollments).where(and(eq(preEnrollments.processId, processId), inArray(preEnrollments.status, ["Pendente", "Classificado", "Lista de espera"]))).orderBy(desc(preEnrollments.rankingScore), asc(preEnrollments.createdAt));
  const [process] = await tx.select({ capacity: preEnrollmentProcesses.capacity }).from(preEnrollmentProcesses).where(eq(preEnrollmentProcesses.id, processId)).limit(1);
  if (!process) throw new Error("Processo não encontrado.");
  for (const [index, item] of items.entries()) {
    const status = index < process.capacity ? "Classificado" : "Lista de espera";
    await tx.update(preEnrollments).set({ position: index + 1, status, history: [{ date: new Date().toISOString(), status, position: index + 1 }] }).where(eq(preEnrollments.id, item.id));
  }
  return items.length;
}

export async function allocateEducationPreEnrollment(database: DatabaseExecutor, applicationId: string): Promise<void> {
  const [item] = await database.select({ id: preEnrollments.id, status: preEnrollments.status }).from(preEnrollments).where(eq(preEnrollments.id, applicationId)).limit(1);
  if (!item || item.status !== "Classificado") throw new Error("Somente candidato classificado pode ser alocado.");
  const [updated] = await database.update(preEnrollments).set({ status: "Alocado", allocatedAt: new Date(), history: [{ date: new Date().toISOString(), status: "Alocado" }] }).where(eq(preEnrollments.id, item.id)).returning({ id: preEnrollments.id });
  if (!updated) throw new Error("Somente candidato classificado pode ser alocado.");
}
