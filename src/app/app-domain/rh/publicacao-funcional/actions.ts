"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { publishPayrollByFunctionalPolicy, revokeFunctionalStatement, savePayrollPublicationPolicy } from "@/lib/portal-servidor/payroll-publication";

function refreshPublication() {
  revalidatePath("/rh/publicacao-funcional");
  revalidatePath("/portal-servidor/folha");
  revalidatePath("/portal-servidor/demonstrativos");
}
function message(error: unknown) {
  return error instanceof z.ZodError ? error.issues.map(issue => issue.message).join(" · ") : error instanceof Error ? error.message : "Não foi possível registrar a operação.";
}
export async function savePayrollPublicationPolicyAction(raw: unknown) {
  try {
    const { id } = z.object({ id: z.string().min(1).optional() }).parse(raw);
    const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
    await savePayrollPublicationPolicy(context, raw);
    refreshPublication();
    return { error: "" };
  } catch (error) { return { error: message(error) }; }
}
export async function publishPayrollByFunctionalPolicyAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    const count = await publishPayrollByFunctionalPolicy(context, raw);
    refreshPublication();
    return { error: "", count };
  } catch (error) { return { error: message(error) }; }
}
export async function revokeFunctionalStatementAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await revokeFunctionalStatement(context, raw);
    refreshPublication();
    return { error: "" };
  } catch (error) { return { error: message(error) }; }
}
