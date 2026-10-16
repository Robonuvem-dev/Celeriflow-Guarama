"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { chargeCemeteryFeeEvent, publishCemeteryFeeRule, recordCemeteryFeeEvent, type CemeteryFeeEventInput } from "@/lib/cemeteries/fees-service";

export async function publishFeeVersionAction(input: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    await publishCemeteryFeeRule(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, input);
    revalidatePath("/cemiterios/taxas");
    revalidatePath("/cemiterios");
    return { error: undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível publicar a regra." };
  }
}

export async function retryFeeEventAction(eventKey: string) {
  try {
    const context = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    const result = await chargeCemeteryFeeEvent(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, eventKey);
    revalidatePath("/cemiterios/taxas");
    revalidatePath("/cemiterios");
    return { error: result.status === "FALHA_EMISSAO" ? result.lastError ?? "Falha na emissão." : result.status === "AGUARDANDO_CONFIGURACAO" ? "Não há regra vigente na data do fato gerador. Publique a configuração e reprocesse." : result.status === "AGUARDANDO_CONTRIBUINTE" ? "O fato gerador não possui responsável tributário cadastrado." : undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível emitir a guia." };
  }
}

export async function recordAdditionalFeeEventAction(input: CemeteryFeeEventInput) {
  try {
    const context = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    const event = await context.prisma.$transaction((tx) => recordCemeteryFeeEvent(tx, input));
    const result = await chargeCemeteryFeeEvent(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, event.eventKey);
    revalidatePath("/cemiterios/taxas");
    return { error: result.status === "FALHA_EMISSAO" ? result.lastError ?? "Falha na emissão." : undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível registrar o evento." };
  }
}
