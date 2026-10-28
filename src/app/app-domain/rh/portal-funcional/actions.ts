"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveManagedPortalPolicy, saveUploadRetention } from "@/lib/portal-servidor/management";
import { allocateConfirmedPayrollPayment } from "@/lib/rh/payroll-payment-allocation";
import { approvePppTechnicalData } from "@/lib/sst/ppp-final-service";
import { manageGeneratedDocument } from "@/lib/portal-servidor/generated-documents";
import { recognizeSpecialPayrollFinality } from "@/lib/rh/special-payroll-finality";
import { databaseConnection } from "@/db/client";
export async function manageFunctionalPortal(command: string, raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation(command === "PPP_TECNICO" ? "SST" : "RH", command === "POLITICA" && !(raw as { id?: string })?.id ? "create" : "update");
    let id = "";
    if (command === "POLITICA") id = await saveManagedPortalPolicy(context, raw);
    else if (command === "RETENCAO") await saveUploadRetention(context, (raw as { hours: unknown }).hours);
    else if (command === "PAGAMENTO_INDIVIDUAL") id = await allocateConfirmedPayrollPayment(databaseConnection, context, raw);
    else if (command === "PPP_TECNICO") id = await approvePppTechnicalData(context, raw);
    else if (command === "CALCULO_ESPECIAL") id = await recognizeSpecialPayrollFinality(databaseConnection, context, raw);
    else if (command === "EMISSAO") await manageGeneratedDocument(context, raw);
    else return { error: "Operação inválida." };
    revalidatePath("/rh/portal-funcional"); revalidatePath("/rh/recadastramento"); revalidatePath("/portal-servidor", "layout");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a operação funcional." }; }
}
