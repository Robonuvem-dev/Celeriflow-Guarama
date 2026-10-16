import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

export async function getHealthRaasSources(context: AppContext, raw: unknown) {
  const input = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), unitId: z.string().max(200).default(""), modality: z.enum(["ALL", "DOMICILIAR", "PSICOSSOCIAL"]).default("ALL") }).strict().parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  const units = input.unitId ? [input.unitId] : context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [year, month] = input.period.split("-").map(Number);
  const period = { gte: new Date(`${input.period}-01T00:00:00-03:00`), lt: new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`) };
  const home = input.modality === "PSICOSSOCIAL" ? [] : await context.prisma.healthHomeCareAttendance.findMany({ where: { performedAt: period, ...(units ? { request: { unitId: { in: units } } } : {}) }, include: { assessment: true, request: { select: { patientId: true, unitId: true, requestedAt: true, reason: true } } }, orderBy: { performedAt: "asc" } });
  const homeByRecord = new Map(home.map(item => [item.medicalRecordId, item]));
  const records = await context.prisma.medicalRecord.findMany({ where: { ...(units ? { unitId: { in: units } } : {}), completedAt: { not: null }, OR: [
    ...(home.length ? [{ id: { in: home.map(item => item.medicalRecordId) } }] : []),
    ...(input.modality !== "DOMICILIAR" ? [{ date: period, unit: { type: { equals: "CAPS", mode: "insensitive" as const } } }] : []),
  ] }, include: { patient: { include: { person: { select: { fullName: true, birthDate: true, gender: true } } } }, unit: { select: { id: true, name: true, cnes: true, type: true } }, professional: { select: { id: true, cns: true, cbo: true, employee: { select: { name: true } } } }, diagnoses: { include: { cidReference: { select: { code: true, description: true } } } }, procedures: { include: { procedure: { select: { id: true, code: true, description: true } } } } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
  const origins = records.map(record => {
    const attendance = homeByRecord.get(record.id), modality = attendance ? "DOMICILIAR" : "PSICOSSOCIAL";
    const criticisms: string[] = [];
    if (!record.patient.cns) criticisms.push("SEM_CNS_PACIENTE");
    if (!record.patient.person.birthDate) criticisms.push("SEM_NASCIMENTO");
    if (!record.unit.cnes) criticisms.push("SEM_CNES_UNIDADE");
    if (!record.professional.cns) criticisms.push("SEM_CNS_PROFISSIONAL");
    if (!record.professional.cbo) criticisms.push("SEM_CBO_PROFISSIONAL");
    if (!record.diagnoses.length) criticisms.push("SEM_DIAGNOSTICO_CID");
    if (!record.procedures.length) criticisms.push("SEM_PROCEDIMENTO_REALIZADO");
    if (attendance && (attendance.request.patientId !== record.patientId || attendance.request.unitId !== record.unitId || !attendance.assessment.eligible)) criticisms.push("ORIGEM_DOMICILIAR_INCONSISTENTE");
    return { originType: attendance ? "HOME_CARE_ATTENDANCE" : "CAPS_MEDICAL_RECORD", originId: attendance?.id || record.id, medicalRecordId: record.id, modality, occurredAt: record.date.toISOString(), completedAt: record.completedAt!.toISOString(), outcome: record.outcome, patient: { id: record.patientId, name: record.patient.person.fullName, cns: record.patient.cns, birthDate: record.patient.person.birthDate?.toISOString() || null, gender: record.patient.person.gender }, unit: record.unit, professional: { id: record.professional.id, name: record.professional.employee.name, cns: record.professional.cns, cbo: record.professional.cbo }, diagnoses: record.diagnoses.map(diagnosis => ({ code: diagnosis.cidReference.code, description: diagnosis.cidReference.description, principal: diagnosis.isPrimary })), procedures: record.procedures.map(item => ({ id: item.id, procedureId: item.procedure.id, code: item.procedure.code, description: item.procedure.description, quantity: item.quantity, performedAt: item.performedAt.toISOString(), professionalId: item.professionalId })), homeCare: attendance ? { requestId: attendance.requestId, assessmentId: attendance.assessmentId, assessmentDate: attendance.assessment.assessedAt.toISOString(), modality: attendance.assessment.modality, character: attendance.assessment.character, requestedAt: attendance.request.requestedAt.toISOString(), indication: attendance.request.reason } : null, criticisms };
  });
  const found = new Set(records.map(record => record.id));
  const missingOrigins = home.filter(item => !found.has(item.medicalRecordId)).map(item => ({ originType: "HOME_CARE_ATTENDANCE", originId: item.id, medicalRecordId: item.medicalRecordId, criticism: "PRONTUARIO_CONCLUIDO_NAO_LOCALIZADO_NO_ESCOPO" }));
  return { contract: "CELERIFLOW_RAAS_ORIGINS", version: "1.0.0", period: input.period, origins, missingOrigins };
}
