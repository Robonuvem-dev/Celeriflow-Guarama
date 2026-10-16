"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { addWaitlist, saveSchedule, transitionWaitlist } from "@/lib/saude/schedule-service";
import { callHealthPanelPatient, configureRegulationReviews, distributeRegulationQuota, reviewRegulationRequest, saveHealthCallPanel, saveSchedulePeriodBlock, updateBookingPatientIdentity } from "@/lib/saude/regulation-management-service";
import { transitionRegulationRequest } from "@/lib/saude/regulation-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
const refresh = () => { for (const path of ["/saude/agenda", "/saude/agenda/gestao", "/saude/regulacao", "/saude/farmacia"]) revalidatePath(path); };
export async function updateBookingIdentityAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await updateBookingPatientIdentity(context, { patientId: text(data, "patientId"), cpf: nullable(data, "cpf"), cns: nullable(data, "cns"), cellphone: nullable(data, "cellphone") }); refresh(); revalidatePath("/saude/pacientes");
}
export async function saveExtendedScheduleAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveSchedule(context, { id: text(data, "id") || undefined, kind: text(data, "kind"), unitId: text(data, "unitId"), specialtyId: nullable(data, "specialtyId"), professionalId: nullable(data, "professionalId"), providerSupplierId: nullable(data, "providerSupplierId"), groupId: null, agreementId: nullable(data, "agreementId"), procedureId: nullable(data, "procedureId"), locationUnitId: nullable(data, "locationUnitId"), weekday: text(data, "weekday") ? Number(text(data, "weekday")) : null, date: nullable(data, "date"), startTime: nullable(data, "startTime"), endTime: nullable(data, "endTime"), totalSlots: Number(text(data, "totalSlots")), validFrom: nullable(data, "validFrom"), validUntil: nullable(data, "validUntil"), genderRestriction: nullable(data, "genderRestriction"), minAge: text(data, "minAge") ? Number(text(data, "minAge")) : null, maxAge: text(data, "maxAge") ? Number(text(data, "maxAge")) : null, allowHolidays: data.get("allowHolidays") === "on", requirePresenceConfirmation: data.get("requirePresenceConfirmation") === "on", releaseAbsenceSlot: data.get("releaseAbsenceSlot") === "on", fixedReceiptTime: nullable(data, "fixedReceiptTime"), slotMinutes: Number(text(data, "slotMinutes")) }); refresh();
}
export async function saveScheduleBlockAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await saveSchedulePeriodBlock(context, { scheduleId: text(data, "scheduleId"), startsAt: text(data, "startsAt"), endsAt: text(data, "endsAt"), reason: text(data, "reason") }); refresh();
}
export async function configureReviewsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await configureRegulationReviews(context, { unitId: text(data, "unitId"), administrativeRequired: data.get("administrativeRequired") === "on", technicalRequired: data.get("technicalRequired") === "on" }); refresh();
}
export async function reviewRequestAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await reviewRegulationRequest(context, Object.fromEntries(["requestId", "step", "decision", "priority", "notes"].map(key => [key, text(data, key)]))); refresh();
}
export async function bookRegulationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await transitionRegulationRequest(context, text(data, "requestId"), "AGENDADA", { scheduledAt: `${text(data, "scheduledAt")}:00-03:00`, appointmentUnitId: text(data, "unitId"), executorProfessionalId: nullable(data, "professionalId"), scheduleId: nullable(data, "scheduleId") }); refresh();
}
export async function distributeQuotaAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await distributeRegulationQuota(context, { quotaId: text(data, "quotaId"), requestUnitId: text(data, "requestUnitId"), totalQuantity: Number(text(data, "totalQuantity")) }); refresh();
}
export async function addProgramWaitlistAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create"); await addWaitlist(context, { patientId: text(data, "patientId"), unitId: text(data, "unitId"), programName: nullable(data, "programName"), procedureId: nullable(data, "procedureId"), specialtyId: nullable(data, "specialtyId"), scheduleId: nullable(data, "scheduleId"), priority: text(data, "priority"), notes: nullable(data, "notes") }); refresh();
}
export async function convertWaitlistAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await transitionWaitlist(context, text(data, "waitlistId"), text(data, "status"), text(data, "date") ? { date: text(data, "date"), unitId: text(data, "unitId"), professionalId: nullable(data, "professionalId") } : undefined); refresh();
}
export async function saveCallPanelAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await saveHealthCallPanel(context, { unitId: text(data, "unitId"), sector: text(data, "sector"), title: text(data, "title"), callMessage: text(data, "callMessage"), news: text(data, "news"), isActive: true }); refresh();
}
export async function callPatientAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update"); await callHealthPanelPatient(context, { panelId: text(data, "panelId"), patientId: text(data, "patientId"), appointmentId: nullable(data, "appointmentId"), pharmacyRequestId: nullable(data, "pharmacyRequestId") }); refresh();
}
