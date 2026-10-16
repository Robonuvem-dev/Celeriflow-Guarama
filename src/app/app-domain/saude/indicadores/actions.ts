"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { classifyHealthTeam } from "@/lib/saude/indicator-context";
export async function classifyIndicatorTeamAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await classifyHealthTeam(context, { teamId: String(data.get("teamId") || ""), classification: String(data.get("classification") || ""), reason: String(data.get("reason") || "") });
  revalidatePath("/saude/indicadores"); revalidatePath("/saude/equipes");
}
