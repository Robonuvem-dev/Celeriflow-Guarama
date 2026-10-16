"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { operateFleetDriverPortal } from "@/lib/frotas/control-driver-portal";
import { AccessError } from "@/lib/platform/tenant-context";
import { FleetControlError } from "@/lib/frotas/control-access";

export async function fleetDriverAction(raw: unknown) {
  try { const input = z.object({ requestId: z.uuid(), operation: z.enum(["depart", "arrive"]), data: z.record(z.string(), z.unknown()) }).strict().parse(raw); await operateFleetDriverPortal(input.requestId, input.operation, input.data); revalidatePath("/portal/frota/motorista"); return { error: null }; } catch (error) { return { error: error instanceof AccessError || error instanceof FleetControlError ? error.message : "Não foi possível registrar esta movimentação." }; }
}
