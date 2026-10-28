"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthTfdBenefits } from "@/db/schema/health-tfd";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { addTfdReportSupplement, requestTfdBenefit, saveTfdClinicalReport, transitionTfdBenefit, transitionTfdClinicalRequest } from "@/lib/saude/tfd-clinical-service";
import { authorizeTfdRequest } from "@/lib/saude/tfd-service";

const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const refresh = (id: string) => { revalidatePath("/saude/tfd"); revalidatePath("/saude/tfd/laudos"); revalidatePath(`/saude/tfd/laudos/${encodeURIComponent(id)}`); };

export async function saveTfdReportAction(data: FormData): Promise<void> {
  const expectedVersion = Number(data.get("expectedVersion"));
  const context = await getTenantContextForModuleOperation("SAUDE", expectedVersion === 0 ? "create" : "update");
  const result = await saveTfdClinicalReport(context, {
    requestId: text(data, "requestId"), expectedVersion,
    professionalId: text(data, "professionalId"), medicalRecordId: text(data, "medicalRecordId") || null,
    procedureId: text(data, "procedureId") || null, diagnosis: text(data, "diagnosis"), diagnosticCode: text(data, "diagnosticCode") || null,
    clinicalHistory: text(data, "clinicalHistory"), examinations: text(data, "examinations"), treatment: text(data, "treatment"),
    localTreatmentUnavailableReason: text(data, "localTreatmentUnavailableReason"), transportType: text(data, "transportType"),
    transportJustification: text(data, "transportJustification"), companionRequired: data.get("companionRequired") === "on",
    companionJustification: text(data, "companionJustification") || null, reason: text(data, "reason"),
  });
  refresh(result.requestId);
  redirect(`/api/saude/tfd/${encodeURIComponent(result.requestId)}/documento?tipo=LAUDO&versao=${result.version}`);
}

export async function supplementTfdReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"), requestId = text(data, "requestId");
  await addTfdReportSupplement(context, { requestId, narrative: text(data, "narrative") }); refresh(requestId);
}

export async function transitionTfdReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"), requestId = text(data, "requestId");
  await transitionTfdClinicalRequest(context, { requestId, status: text(data, "status"), reason: text(data, "reason") }); refresh(requestId);
}

export async function authorizeTfdReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"), requestId = text(data, "requestId");
  await authorizeTfdRequest(context, requestId); refresh(requestId);
}

export async function requestTfdBenefitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create"), requestId = text(data, "requestId");
  await requestTfdBenefit(context, { requestId, kind: text(data, "kind"), description: text(data, "description"), quantity: Number(data.get("quantity")), unitValue: text(data, "unitValue") || null }); refresh(requestId);
}

export async function transitionTfdBenefitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const [result] = await (context.database ?? db).select({ requestId: healthTfdBenefits.requestId }).from(healthTfdBenefits).where(eq(healthTfdBenefits.id, text(data, "benefitId"))).limit(1);
  if (!result) throw new Error("Benefício TFD não encontrado.");
  await transitionTfdBenefit(context, { benefitId: text(data, "benefitId"), status: text(data, "status"), reason: text(data, "reason"), receivedByPersonId: text(data, "receivedByPersonId") || null, deliveryReceipt: text(data, "deliveryReceipt") || null }); refresh(result.requestId);
}
