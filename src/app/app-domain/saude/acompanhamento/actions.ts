"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { configureHealthFollowup, generateHealthFollowupBatches } from "@/lib/saude/followup-exchange-service";
import { processHealthFollowupBatch } from "@/lib/saude/followup-receiver-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();

export async function configureFollowupAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await configureHealthFollowup(context, { unitId: text(data, "unitId"), contract: text(data, "contract"), code: text(data, "code"), name: text(data, "name") });
  revalidatePath("/saude/acompanhamento"); revalidatePath("/saude/integracoes");
}
export async function generateFollowupAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const result = await generateHealthFollowupBatches(context, { bindingId: text(data, "bindingId"), requestKey: text(data, "requestKey"), fromDate: text(data, "fromDate"), toDate: text(data, "toDate"), reprocessOfId: text(data, "reprocessOfId") || null, onlyRejected: text(data, "onlyRejected") !== "false" });
  revalidatePath("/saude/acompanhamento");
  if (result.batchIds.length === 1) redirect(`/saude/acompanhamento/remessas/${encodeURIComponent(result.batchIds[0])}`);
  redirect(`/saude/acompanhamento?binding=${encodeURIComponent(text(data, "bindingId"))}`);
}
export async function processFollowupAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const receipt = await processHealthFollowupBatch(context, text(data, "batchId"));
  revalidatePath("/saude/acompanhamento"); revalidatePath(`/saude/acompanhamento/remessas/${encodeURIComponent(receipt.batchId)}`); revalidatePath(`/saude/acompanhamento/receptores/${encodeURIComponent(receipt.receiverId)}`); revalidatePath("/saude/integracoes");
}
