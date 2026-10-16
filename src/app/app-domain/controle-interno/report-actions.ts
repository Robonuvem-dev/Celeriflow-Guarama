"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canPerformModuleOperation, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { C7OperationError } from "@/lib/c7/operations-service";
import { saveControlFinalReport, finalizeControlFinalReport, publishControlFinalReport, signControlFinalReport, type ControlFinalReportInput } from "@/lib/c7/circumstantiated-report";

export async function controlFinalReportAction(input: { command: "SAVE"; planId: string; reportId?: string; expectedRevision: number; input: ControlFinalReportInput; idempotencyKey: string } | { command: "FINALIZE"; editionId: string; reason: string } | { command: "PUBLISH"; finalId: string } | { command: "SIGN"; finalId: string; certificateId: string }) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("ADMINISTRACAO", input.command === "SAVE" ? "create" : "update");
    const actor = { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds };
    if (input.command === "SAVE") await saveControlFinalReport(prisma, actor, input);
    else if (input.command === "FINALIZE") await finalizeControlFinalReport(prisma, actor, input);
    else if (input.command === "SIGN") {
      if (!isSystemAdministrator(user) || !canPerformModuleOperation(user, "CONFIGURACOES", "update")) throw new C7OperationError("Assinatura A1 exige a autorização administrativa de certificados.");
      await signControlFinalReport(prisma, actor, input);
    }
    else {
      if (!canPerformModuleOperation(user, "TRANSPARENCIA", "update") || !await prisma.configuracaoModulo.count({ where: { codigo: "TRANSPARENCIA", ativo: true } })) throw new C7OperationError("Publicação exige alteração autorizada do módulo Transparência ativo.");
      await publishControlFinalReport(prisma, actor, input.finalId);
    }
    revalidatePath("/controle-interno/relatorios"); revalidatePath("/portal/portaldatransparencia");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível executar a operação do relatório." }; }
}
