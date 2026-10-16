"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { functionalServiceInputSchema, saveFunctionalService } from "@/lib/portal-servidor/service-catalog";
import { completeFunctionalDocumentRequest, decideFunctionalRequest, requestFunctionalComplement } from "@/lib/portal-servidor/functional-requests";

export async function saveFunctionalServiceAction(raw: unknown) {
  try {
    const input = functionalServiceInputSchema.parse(raw);
    const context = await getTenantContextForModuleOperation("RH", input.id ? "update" : "create");
    const id = await saveFunctionalService(context, input);
    revalidatePath("/rh/servicos-funcionais"); revalidatePath("/portal-servidor/servicos");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : error instanceof Error ? error.message : "Não foi possível salvar o serviço." }; }
}

export async function decideFunctionalRequestAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await decideFunctionalRequest(context, raw);
    revalidatePath("/rh/requerimentos-funcionais"); revalidatePath("/portal-servidor/protocolos", "layout"); revalidatePath("/portal-servidor/ferias"); revalidatePath("/portal-servidor/ponto");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível decidir o requerimento." }; }
}

export async function requestFunctionalComplementAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await requestFunctionalComplement(context, raw);
    revalidatePath("/rh/solicitacoes"); revalidatePath("/portal-servidor/protocolos", "layout");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a pendência." }; }
}

export async function completeFunctionalDocumentRequestAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await completeFunctionalDocumentRequest(context, raw);
    revalidatePath("/rh/requerimentos-funcionais");
    revalidatePath("/portal-servidor/protocolos", "layout");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível concluir a providência." }; }
}
