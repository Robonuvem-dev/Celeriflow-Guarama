"use server";

import { revalidatePath } from "next/cache";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { enrollOwnCourse, submitOwnFunctionalEvaluation, submitCommissionEvaluation } from "@/lib/portal-servidor/career-service";

export async function enrollMyCourse(raw: unknown) {
  try { const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." }; const id = await enrollOwnCourse(access.context, raw); revalidatePath("/portal-servidor/capacitacao"); revalidatePath("/rh/capacitacao"); return { id, error: "" }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a inscrição." }; }
}

export async function submitMyEvaluation(raw: unknown) {
  try { const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." }; await submitOwnFunctionalEvaluation(access.context, raw); revalidatePath("/portal-servidor/avaliacoes"); return { error: "" }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a autoavaliação." }; }
}

export async function submitAssignedEvaluation(raw: unknown) {
  try { const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." }; await submitCommissionEvaluation(access.context, raw); revalidatePath("/portal-servidor/avaliacoes"); return { error: "" }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a avaliação atribuída." }; }
}
