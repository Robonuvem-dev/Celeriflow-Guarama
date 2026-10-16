"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { closePregnancy, openPregnancy, recordChronicAssessment, recordDentalMark, recordPrenatalVisit, saveClinicalScreening, scheduleTherapySessions, transitionTherapySession } from "@/lib/saude/care-lines-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
const number = (data: FormData, key: string) => text(data, key) ? Number(text(data, key)) : null;
function refresh(id: string) {
  revalidatePath(`/saude/atendimentos/${id}`);
  revalidatePath(`/saude/atendimentos/${id}/linhas-cuidado`);
  revalidatePath("/saude/linhas-cuidado");
}
export async function openPregnancyAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await openPregnancy(context, { medicalRecordId: text(data, "medicalRecordId"), lastMenstrualDate: nullable(data, "lastMenstrualDate"), ultrasoundDate: nullable(data, "ultrasoundDate"), ultrasoundGestationalDays: number(data, "ultrasoundGestationalDays"), calculationMethod: text(data, "calculationMethod"), baselineWeight: number(data, "baselineWeight"), height: number(data, "height"), pregnancyType: text(data, "pregnancyType"), previousPregnancies: number(data, "previousPregnancies"), lastScreeningDate: nullable(data, "lastScreeningDate") });
  refresh(text(data, "medicalRecordId"));
}
export async function prenatalVisitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordPrenatalVisit(context, { medicalRecordId: text(data, "medicalRecordId"), pregnancyId: text(data, "pregnancyId"), weight: number(data, "weight"), bloodPressure: nullable(data, "bloodPressure"), notes: text(data, "notes") });
  refresh(text(data, "medicalRecordId"));
}
export async function closePregnancyAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await closePregnancy(context, { medicalRecordId: text(data, "medicalRecordId"), pregnancyId: text(data, "pregnancyId"), outcome: text(data, "outcome"), reason: text(data, "reason"), gestationalDaysAtBirth: number(data, "gestationalDaysAtBirth"), deliveryType: nullable(data, "deliveryType"), deliveryLocation: nullable(data, "deliveryLocation"), deliveryDate: nullable(data, "deliveryDate"), clinicalConditions: text(data, "clinicalConditions") });
  refresh(text(data, "medicalRecordId"));
}
export async function chronicAssessmentAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordChronicAssessment(context, { medicalRecordId: text(data, "medicalRecordId"), conditionKind: text(data, "conditionKind"), systolic: number(data, "systolic"), diastolic: number(data, "diastolic"), glucose: number(data, "glucose"), hba1c: number(data, "hba1c"), riskFactors: text(data, "riskFactors").split("\n").map(item => item.trim()).filter(Boolean), complications: text(data, "complications").split("\n").map(item => item.trim()).filter(Boolean), notes: text(data, "notes") });
  refresh(text(data, "medicalRecordId"));
}
export async function screeningAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveClinicalScreening(context, { medicalRecordId: text(data, "medicalRecordId"), id: nullable(data, "id"), kind: text(data, "kind"), eligible: data.get("eligible") === "on", eligibilityReason: text(data, "eligibilityReason"), performedAt: nullable(data, "performedAt"), resultedAt: nullable(data, "resultedAt"), result: nullable(data, "result"), examRequestId: nullable(data, "examRequestId"), followupNotes: text(data, "followupNotes") });
  refresh(text(data, "medicalRecordId"));
}
export async function dentalMarkAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordDentalMark(context, { medicalRecordId: text(data, "medicalRecordId"), dentition: text(data, "dentition"), targetType: text(data, "targetType"), targetCode: text(data, "targetCode"), surface: nullable(data, "surface"), condition: text(data, "condition"), procedureId: nullable(data, "procedureId"), performed: data.get("performed") === "on", notes: text(data, "notes") });
  refresh(text(data, "medicalRecordId"));
}
export async function scheduleSessionsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await scheduleTherapySessions(context, { medicalRecordId: text(data, "medicalRecordId"), planId: text(data, "planId"), specialtyKind: text(data, "specialtyKind"), dates: data.getAll("sessionDate").map(String).filter(Boolean) });
  refresh(text(data, "medicalRecordId"));
}
export async function transitionSessionAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await transitionTherapySession(context, { medicalRecordId: text(data, "medicalRecordId"), sessionId: text(data, "sessionId"), status: text(data, "status"), evolution: text(data, "evolution") });
  refresh(text(data, "medicalRecordId"));
}
