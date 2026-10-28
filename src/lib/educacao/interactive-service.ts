import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { enrollments } from "@/db/schema/education-core";
import { pedagogicalAttempts, pedagogicalCatalogItems, pedagogicalReleases } from "@/db/schema/education-interactive";

export async function completeEducationPedagogicalAttempt(database: DatabaseExecutor, input: { releaseId: string; studentId: string; answers: Record<string, string> }): Promise<number> {
  const [release] = await database.select({ id: pedagogicalReleases.id, classId: pedagogicalReleases.classId, studentId: pedagogicalReleases.studentId, content: pedagogicalCatalogItems.content }).from(pedagogicalReleases).innerJoin(pedagogicalCatalogItems, eq(pedagogicalCatalogItems.id, pedagogicalReleases.catalogItemId)).where(eq(pedagogicalReleases.id, input.releaseId)).limit(1);
  if (!release) throw new Error("Liberação não encontrada.");
  if (release.studentId && release.studentId !== input.studentId) throw new Error("Atividade não liberada para este aluno.");
  if (!release.studentId && release.classId) {
    const [enrollment] = await database.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.studentId, input.studentId), eq(enrollments.classId, release.classId), eq(enrollments.status, "Matriculado"))).limit(1);
    if (!enrollment) throw new Error("Aluno não pertence à turma autorizada.");
  }
  const content = release.content as { questions?: Array<{ id: number; answer: string }> };
  const questions = content.questions || [];
  const correct = questions.filter(question => String(input.answers[question.id] || "").localeCompare(question.answer, "pt-BR", { sensitivity: "base" }) === 0).length;
  const score = questions.length ? Math.round(correct / questions.length * 100) : 0;
  await database.insert(pedagogicalAttempts).values({ releaseId: release.id, studentId: input.studentId, answers: input.answers, completedAt: new Date(), score, correctAnswers: correct, incorrectAnswers: questions.length - correct });
  return score;
}
