"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { reviseMaterialRequest } from "@/lib/patrimonio/request-revisions";
export async function reviseRequestAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  const requestId = String(form.get("requestId") || "");
  await reviseMaterialRequest(databaseConnection, context.user, { requestId, operation: form.get("operation"), reason: form.get("reason"), justification: String(form.get("justification") || ""), items: [...form.entries()].filter(([key]) => key.startsWith("quantity_")).map(([key,value]) => ({ id: key.slice(9), quantity: Number(value) })) });
  revalidatePath("/patrimonio/requisicoes");
  revalidatePath(`/patrimonio/requisicoes/${requestId}`);
}
