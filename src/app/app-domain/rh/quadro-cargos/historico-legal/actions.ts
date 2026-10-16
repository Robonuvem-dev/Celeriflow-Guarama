"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { recordRoleLegalHistory, RoleLegalHistoryError, type RoleLegalHistoryInput } from "@/lib/rh/role-legal-history";
import { MunicipalCostError } from "@/lib/financeiro/cost-ledger";

export async function recordRoleLegalHistoryAction(input: RoleLegalHistoryInput) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("RH", "update");
    await recordRoleLegalHistory(prisma, { usuarioId: user.id, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/rh/quadro-cargos/historico-legal"); revalidatePath("/controle-interno/consultas/rh");
    return {};
  } catch (error) { return { error: error instanceof RoleLegalHistoryError || error instanceof MunicipalCostError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message : "Não foi possível registrar a posição legal do cargo." }; }
}
