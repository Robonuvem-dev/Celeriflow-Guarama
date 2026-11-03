"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { recordFleetMovement } from "@/lib/frotas/movements";

export async function fleetMovementAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("FROTAS", "update");
  const values = Object.fromEntries(["operation", "unitId", "externalPlate", "recordId", "reading", "reason"].map(key => [key, String(form.get(key) || "")]));
  const file = form.get("file");
  if (file instanceof File && file.size > 500000) throw new Error("O arquivo deve ter até 500 KB.");
  await recordFleetMovement(context, { ...values, requestId: String(form.get("requestId") || randomUUID()), csv: file instanceof File ? await file.text() : "" });
  revalidatePath("/frotas", "layout");
  redirect("/frotas/movimentos?salvo=1");
}
