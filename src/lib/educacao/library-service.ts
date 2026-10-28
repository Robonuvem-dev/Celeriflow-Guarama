import { and, count, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { educationLibraryCopies, educationLibraryLoans, educationLibraryReservations } from "@/db/schema/education-operations";

export async function createEducationLibraryLoan(tx: DatabaseTransaction, input: { copyId: string; studentId: string; dueAt: Date }): Promise<void> {
  await tx.insert(educationLibraryLoans).values(input);
  const [copy] = await tx.update(educationLibraryCopies).set({ status: "Emprestado" }).where(eq(educationLibraryCopies.id, input.copyId)).returning({ id: educationLibraryCopies.id });
  if (!copy) throw new Error("Exemplar não encontrado.");
}

export async function returnEducationLibraryLoan(tx: DatabaseTransaction, input: { loanId: string; copyId: string }): Promise<void> {
  const [loan] = await tx.update(educationLibraryLoans).set({ status: "Devolvido", returnedAt: new Date() }).where(eq(educationLibraryLoans.id, input.loanId)).returning({ id: educationLibraryLoans.id });
  if (!loan) throw new Error("Empréstimo não encontrado.");
  const [copy] = await tx.update(educationLibraryCopies).set({ status: "Disponível" }).where(eq(educationLibraryCopies.id, input.copyId)).returning({ id: educationLibraryCopies.id });
  if (!copy) throw new Error("Exemplar não encontrado.");
}

export async function renewEducationLibraryLoan(database: DatabaseExecutor, loanId: string, dueAt: Date): Promise<void> {
  const [loan] = await database.update(educationLibraryLoans).set({ dueAt, renewals: sql`${educationLibraryLoans.renewals} + 1` }).where(eq(educationLibraryLoans.id, loanId)).returning({ id: educationLibraryLoans.id });
  if (!loan) throw new Error("Empréstimo não encontrado.");
}

export async function reserveEducationLibraryTitle(database: DatabaseExecutor, titleId: string, studentId: string): Promise<void> {
  const [total] = await database.select({ value: count() }).from(educationLibraryReservations).where(and(eq(educationLibraryReservations.titleId, titleId), eq(educationLibraryReservations.status, "Aguardando")));
  const position = total.value + 1;
  await database.insert(educationLibraryReservations).values({ titleId, studentId, position }).onConflictDoUpdate({ target: [educationLibraryReservations.titleId, educationLibraryReservations.studentId], set: { status: "Aguardando", position, updatedAt: new Date() } });
}
