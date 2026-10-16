"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { fleetControlPermission, mutateFleetControl } from "@/lib/frotas/control-service";
import { fleetControlRequest } from "@/lib/frotas/control-policy";
import { FleetControlError } from "@/lib/frotas/control-access";

export async function fleetControlAction(raw: unknown) {
  try {
    const request = fleetControlRequest.parse(raw);
    const context = await getTenantContextForModuleOperation("FROTAS", fleetControlPermission(request.operation, request.data));
    const result = await mutateFleetControl(context, request);
    for (const path of ["/frotas", "/frotas/gestao", "/indicadores", "/patrimonio"]) revalidatePath(path, "layout");
    return { ...result, error: null };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof FleetControlError || error instanceof AccessError ? error.message : "Não foi possível confirmar. Atualize os dados e tente novamente com a mesma confirmação." }; }
}
