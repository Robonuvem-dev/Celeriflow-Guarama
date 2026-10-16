"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { authorizeTreatmentReports, cancelTreatmentAuthorization, configureAihCancellation, createAuthorizationIssuer, createAuthorizationNumberRange, dischargeAihPatient, markAihPaid, recordApacPermanence, renewApacReport, saveTreatmentReport, transitionTreatmentReport } from "@/lib/saude/treatment-authorization-service";

const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const dateTime = (value: string) => value ? `${value.length === 16 ? `${value}:00` : value}-03:00` : null;
const refresh = () => { revalidatePath("/saude/producao/laudos", "layout"); revalidatePath("/saude/producao"); };

export async function saveTreatmentReportAction(data: FormData): Promise<void> {
  const version = Number(data.get("expectedVersion")), context = await getTenantContextForModuleOperation("SAUDE", version === 0 ? "create" : "update");
  const ids = data.getAll("procedureId").map(String), roles = data.getAll("procedureRole").map(String), quantities = data.getAll("procedureQuantity").map(Number), performers = data.getAll("performerProfessionalId").map(String);
  const report = await saveTreatmentReport(context, {
    id: text(data, "reportId") || null, expectedVersion: version, kind: text(data, "kind"), patientId: text(data, "patientId"), unitId: text(data, "unitId"), professionalId: text(data, "professionalId"), medicalRecordId: text(data, "medicalRecordId") || null,
    diagnosis: text(data, "diagnosis"), diagnosticCode: text(data, "diagnosticCode") || null, clinicalHistory: text(data, "clinicalHistory"), examinations: text(data, "examinations"), treatmentJustification: text(data, "treatmentJustification"),
    admissionAt: dateTime(text(data, "admissionAt")), plannedStart: text(data, "plannedStart"), plannedEnd: text(data, "plannedEnd"), initialApac: data.get("initialApac") === "on", reason: text(data, "reason"),
    procedures: ids.map((procedureId, index) => ({ procedureId, role: roles[index], quantity: quantities[index], performerProfessionalId: performers[index] || null })),
  });
  refresh(); redirect(`/api/saude/producao/laudos/${encodeURIComponent(report.id)}/documento?tipo=LAUDO&versao=${report.version}`);
}

export async function createIssuerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createAuthorizationIssuer(context, { code: text(data, "code"), name: text(data, "name"), typeCode: text(data, "typeCode"), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function createNumberRangeAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createAuthorizationNumberRange(context, { issuerId: text(data, "issuerId"), kind: text(data, "kind"), firstNumber: text(data, "firstNumber"), lastNumber: text(data, "lastNumber"), validFrom: text(data, "validFrom"), validUntil: text(data, "validUntil"), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function transitionTreatmentReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await transitionTreatmentReport(context, { reportId: text(data, "reportId"), status: text(data, "status"), reason: text(data, "reason") }); refresh();
}
export async function authorizeTreatmentReportsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await authorizeTreatmentReports(context, { rangeId: text(data, "rangeId"), reportIds: data.getAll("reportId").map(String), expectedNextNumber: text(data, "expectedNextNumber") || null }); refresh();
}
export async function configureAihCancellationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await configureAihCancellation(context, text(data, "unitId"), text(data, "required") === "true"); refresh();
}
export async function cancelTreatmentAuthorizationAction(input: { reportId: string; reason: string; reauthenticationToken: string | null }) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await cancelTreatmentAuthorization(context, input); refresh(); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível cancelar a autorização." }; }
}
export async function markAihPaidAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await markAihPaid(context, { reportId: text(data, "reportId"), paymentReference: text(data, "paymentReference"), paidAt: dateTime(text(data, "paidAt")), reason: text(data, "reason") }); refresh();
}
export async function dischargeAihAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await dischargeAihPatient(context, { reportId: text(data, "reportId"), dischargedAt: dateTime(text(data, "dischargedAt")), outcome: text(data, "outcome"), reason: text(data, "reason"), ...(text(data, "outcome") === "OBITO" ? { deathRegistration: { deathDate: text(data, "deathDate"), registeredAt: text(data, "registeredAt"), municipality: text(data, "municipality"), cause: text(data, "cause"), cidReferenceId: text(data, "cidReferenceId") || null } } : {}) }); refresh();
}
export async function renewApacAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const renewed = await renewApacReport(context, { reportId: text(data, "reportId"), plannedStart: text(data, "plannedStart"), plannedEnd: text(data, "plannedEnd"), professionalId: text(data, "professionalId"), reason: text(data, "reason") });
  refresh(); redirect(`/saude/producao/laudos/${encodeURIComponent(renewed.id)}`);
}
export async function recordApacPermanenceAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordApacPermanence(context, { reportId: text(data, "reportId"), reason: text(data, "reason") }); refresh();
}
