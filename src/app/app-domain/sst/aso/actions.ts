"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerAso } from "@/lib/sst/aso-service";
import { SstValidationError } from "@/lib/sst/errors";
import { correctAso, saveAsoFlowSettings, registerVacationConcessionSource } from "@/lib/sst/aso-flow-service";
import { archiveAsoDocument } from "@/lib/sst/aso-flow-document";

export async function saveSstAso(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const exams = z.array(z.unknown()).max(100).parse(JSON.parse(String(form.get("exams") || "[]")));
    const anamnesis = JSON.parse(String(form.get("anamnesis") || "null"));
    const id = await registerAso(context, { ...Object.fromEntries(form), exams, anamnesis });
    revalidatePath("/sst/aso");
    revalidatePath("/app-domain/sst/aso");
    return { error: null, id };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos do ASO." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar o ASO. Confira os dados dos exames." };
  }
}

function workflowError(error: unknown) {
  return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível concluir o fluxo ASO." };
}
export async function saveSstAsoCorrection(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await correctAso(context, Object.fromEntries(form));
    revalidatePath("/app-domain/sst/aso"); revalidatePath(`/sst/aso/${form.get("asoId")}`);
    return { error: null, id };
  } catch (error) { return workflowError(error); }
}
export async function saveSstAsoSettings(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await saveAsoFlowSettings(context, { ...Object.fromEntries(form), suggestedResults: form.getAll("suggestedResults") });
    revalidatePath("/app-domain/sst/aso"); return { error: null, id };
  } catch (error) { return workflowError(error); }
}
export async function saveSstAsoVacationSource(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    const id = await registerVacationConcessionSource(context, Object.fromEntries(form));
    revalidatePath("/app-domain/sst/aso"); return { error: null, id };
  } catch (error) { return workflowError(error); }
}
export async function saveSstAsoDocument(form: FormData) {
  try {
    const origin = form.get("kind") === "ORIGIN";
    const context = await getTenantContextForModuleOperation("SST", origin ? "update" : "issueReports");
    const asoId = z.string().min(1).parse(form.get("asoId"));
    const file = form.get("file");
    if (origin && (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || !["application/pdf", "image/png", "image/jpeg"].includes(file.type))) throw new SstValidationError("Envie PDF/JPG/PNG até 10 MB.");
    const id = await archiveAsoDocument(context, asoId, origin ? { file: file as File, examId: z.string().min(1).parse(form.get("examId")), submissionKey: z.uuid().parse(form.get("submissionKey")) } : undefined);
    revalidatePath(`/sst/aso/${asoId}`); revalidatePath(`/app-domain/sst/aso/${asoId}`);
    return { error: null, id };
  } catch (error) { return workflowError(error); }
}
