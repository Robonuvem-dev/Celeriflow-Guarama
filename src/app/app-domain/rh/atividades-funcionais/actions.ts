"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { completeFunctionalCourse, saveCareerPolicy } from "@/lib/portal-servidor/career-service";
import { publishFunctionalEvaluationResult } from "@/lib/portal-servidor/evaluation-results";

export async function saveCareerPolicyAction(raw: unknown) {
  try {
    const reference = z.object({ id: z.string().min(1).optional() }).parse(raw);
    const context = await getTenantContextForModuleOperation("RH", reference.id ? "update" : "create");
    const id = await saveCareerPolicy(context, raw);
    revalidatePath("/rh/atividades-funcionais");
    revalidatePath("/portal-servidor/capacitacao");
    revalidatePath("/portal-servidor/avaliacoes");
    return { id, error: "" };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : error instanceof Error ? error.message : "Não foi possível salvar a atividade." };
  }
}

export async function completeFunctionalCourseAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await completeFunctionalCourse(context, raw);
    revalidatePath("/rh/atividades-funcionais");
    revalidatePath("/portal-servidor/capacitacao");
    return { error: "" };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : error instanceof Error ? error.message : "Não foi possível reconhecer a conclusão." };
  }
}

export async function publishFunctionalEvaluationResultAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await publishFunctionalEvaluationResult(context, raw);
    revalidatePath("/rh/atividades-funcionais");
    revalidatePath("/portal-servidor/avaliacoes");
    return { error: "" };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : error instanceof Error ? error.message : "Não foi possível publicar o resultado." }; }
}
