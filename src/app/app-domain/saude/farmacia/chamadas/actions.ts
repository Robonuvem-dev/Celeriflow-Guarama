"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { callHealthPanelPatient, saveHealthCallPanel } from "@/lib/saude/regulation-management-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
export async function configurePharmacyPanelAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveHealthCallPanel(context, { unitId: text(data, "unitId"), sector: text(data, "sector"), title: text(data, "title"), callMessage: text(data, "callMessage"), news: text(data, "news") });
  revalidatePath("/saude/farmacia/chamadas"); revalidatePath("/saude/agenda/gestao");
}
export async function callPharmacyPatientAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await callHealthPanelPatient(context, { panelId: text(data, "panelId"), patientId: text(data, "patientId"), appointmentId: null, pharmacyRequestId: text(data, "pharmacyRequestId") || null });
  revalidatePath("/saude/farmacia/chamadas");
}
