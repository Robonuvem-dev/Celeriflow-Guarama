"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { changeChequeState, createCheckbook, issueCheque } from "@/lib/financeiro/cheques";

async function actor(operation: "create" | "update") {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", operation);
  return { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
}
export async function createCheckbookAction(form: FormData): Promise<void> {
  await createCheckbook(databaseConnection, await actor("create"), Object.fromEntries(form));
  revalidatePath("/financeiro/cheques");
}
export async function issueChequeAction(form: FormData): Promise<void> {
  await issueCheque(databaseConnection, await actor("create"), Object.fromEntries(form));
  revalidatePath("/financeiro/cheques");
}
export async function changeChequeAction(form: FormData): Promise<void> {
  await changeChequeState(databaseConnection, await actor("update"), { id: String(form.get("id") || ""), status: String(form.get("status")) as "CANCELADO" | "COMPENSADO", reason: String(form.get("reason") || ""), clearedAt: String(form.get("clearedAt") || "") });
  revalidatePath("/financeiro/cheques");
}
