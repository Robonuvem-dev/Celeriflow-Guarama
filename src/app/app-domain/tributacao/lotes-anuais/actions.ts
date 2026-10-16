"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { canPerformModuleOperation, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { TaxError } from "@/lib/tributacao";
import { simulateTaxAnnualBatch, queueTaxAnnualBatch, processTaxAnnualBatch, cancelTaxAnnualBatch, type AnnualBatchInput } from "@/lib/tributacao/annual-batches";
import { simulateTaxAnnualPropertyBatch } from "@/lib/tributacao/annual-batches";
import { copyTaxAnnualRule, type AnnualRuleCopyInput } from "@/lib/tributacao/annual-rollover";

export async function taxAnnualBatchAction(input: { command: "SIMULATE"; input: AnnualBatchInput } | { command: "PROPERTY_BASES"; input: Parameters<typeof simulateTaxAnnualPropertyBatch>[2] } | { command: "COPY_RULE"; input: AnnualRuleCopyInput } | { command: "QUEUE"; batchId: string; scheduledAt: string; reason: string } | { command: "PROCESS"; batchId: string } | { command: "CANCEL"; batchId: string; reason: string }) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", ["SIMULATE", "PROPERTY_BASES", "COPY_RULE"].includes(input.command) ? "create" : "update");
    const actor = { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds };
    if (input.command === "SIMULATE") await simulateTaxAnnualBatch(prisma, actor, input.input);
    else if (input.command === "PROPERTY_BASES") await simulateTaxAnnualPropertyBatch(prisma, actor, input.input);
    else if (input.command === "COPY_RULE") await copyTaxAnnualRule(prisma, actor, input.input);
    else if (input.command === "QUEUE") {
      if (!canPerformModuleOperation(user, "TRIBUTACAO", "create")) throw new TaxError("Agendamento de efetivação exige criação tributária autorizada.");
      await queueTaxAnnualBatch(prisma, actor, { ...input, scheduledAt: new Date(z.iso.datetime().parse(input.scheduledAt)) });
    }
    else if (input.command === "CANCEL") await cancelTaxAnnualBatch(prisma, actor, input);
    else {
      if (!canPerformModuleOperation(user, "TRIBUTACAO", "create")) throw new TaxError("Efetivação do lote também exige criação tributária autorizada.");
      await processTaxAnnualBatch(prisma, actor, input.batchId);
    }
    revalidatePath("/tributacao/lotes-anuais"); revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: error instanceof TaxError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível executar a operação do lote anual." }; }
}
