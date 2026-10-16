"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fleetMutationOperation, fleetMutationSchema, type FleetMutationInput } from "@/lib/frotas/contract";
import { FleetError, mutateFleet } from "@/lib/frotas/service";
import { StockServiceError } from "@/lib/patrimonio/stock-service";
import { AccessError } from "@/lib/platform/tenant-context";

export async function mutateFleetAction(input: FleetMutationInput) {
  try {
    const parsed = fleetMutationSchema.parse(input);
    const context = await getTenantContextForModuleOperation("FROTAS", fleetMutationOperation(parsed));
    const result = await mutateFleet(context, input);
    revalidatePath("/frotas");
    revalidatePath("/indicadores");
    revalidatePath("/administracao/indicadores");
    revalidatePath("/patrimonio", "layout");
    return { ...result, error: undefined, fields: undefined };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Revise os campos indicados.", fields: Object.fromEntries(error.issues.map(i => [String(i.path.at(-1)), i.message])) };
    return { error: error instanceof FleetError || error instanceof AccessError || error instanceof StockServiceError ? error.message : "Não foi possível confirmar a operação. Os dados foram preservados.", fields: undefined };
  }
}
