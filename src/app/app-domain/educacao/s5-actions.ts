"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { educationSupportRequests, pedagogicalCatalogItems, pedagogicalReleases } from "@/db/schema/education-interactive";
import { completeEducationPedagogicalAttempt } from "@/lib/educacao/interactive-service";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export type S5ActionResult = { error: string | null; message?: string };
const v = (data: FormData, key: string) => String(data.get(key) || "").trim();
const fail = (cause: unknown): S5ActionResult => ({ error: cause instanceof Error ? cause.message : "Não foi possível concluir a operação." });
const refresh = () => { revalidatePath("/educacao/portal-interativo"); revalidatePath("/educacao/suporte"); };

export async function createCatalogItemAction(data: FormData): Promise<S5ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const questions = v(data, "questions").split("\n").map((line, index) => {
      const [statement, answer, ...options] = line.split("|").map(item => item.trim());
      return { id: index + 1, statement, answer, options: options.length ? options : [answer] };
    }).filter(item => item.statement && item.answer);
    if (!questions.length) throw new Error("Informe ao menos uma questão no formato solicitado.");
    await (context.database ?? db).insert(pedagogicalCatalogItems).values({ title: v(data, "title"), description: v(data, "description"), schoolYear: v(data, "schoolYear"), type: v(data, "type"), instructions: v(data, "instructions"), durationSeconds: Number(v(data, "durationSeconds")) || null, subjectId: v(data, "subjectId") || null, content: { questions } });
    refresh(); return { error: null, message: "Atividade incluída no catálogo." };
  } catch (cause) { return fail(cause); }
}

export async function releaseCatalogItemAction(data: FormData): Promise<S5ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const classId = v(data, "classId") || null, studentId = v(data, "studentId") || null;
    if (!classId && !studentId) throw new Error("Selecione uma turma ou um aluno.");
    await (context.database ?? db).insert(pedagogicalReleases).values({ catalogItemId: v(data, "catalogItemId"), teacherId: v(data, "teacherId"), classId, studentId });
    refresh(); return { error: null, message: "Atividade liberada." };
  } catch (cause) { return fail(cause); }
}

export async function completePedagogicalAttemptAction(data: FormData): Promise<S5ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const score = await completeEducationPedagogicalAttempt(context.database ?? db, { studentId: v(data, "studentId"), releaseId: v(data, "releaseId"), answers: JSON.parse(v(data, "answers") || "{}") as Record<string, string> });
    refresh(); return { error: null, message: `Atividade concluída: ${score} pontos.` };
  } catch (cause) { return fail(cause); }
}

export async function createSupportRequestAction(data: FormData): Promise<S5ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create"), database = context.database ?? db;
    const [total] = await database.select({ value: count() }).from(educationSupportRequests);
    const protocol = `EDU-${new Date().getFullYear()}-${String(total.value + 1).padStart(5, "0")}`;
    await database.insert(educationSupportRequests).values({ protocol, requesterName: context.user.name, requesterEmail: context.user.email, subject: v(data, "subject"), description: v(data, "description") });
    refresh(); return { error: null, message: `Solicitação registrada: ${protocol}.` };
  } catch (cause) { return fail(cause); }
}

export async function updateSupportRequestAction(data: FormData): Promise<S5ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "update");
    const [updated] = await (context.database ?? db).update(educationSupportRequests).set({ status: v(data, "status"), response: v(data, "response") || null }).where(eq(educationSupportRequests.id, v(data, "requestId"))).returning({ id: educationSupportRequests.id });
    if (!updated) throw new Error("Solicitação não encontrada.");
    refresh(); return { error: null, message: "Solicitação atualizada." };
  } catch (cause) { return fail(cause); }
}
