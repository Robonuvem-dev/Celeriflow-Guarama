import { createHash } from "node:crypto";
import { z } from "zod";

export const followupContractNames = ["CELERIFLOW_SISPRENATAL", "CELERIFLOW_HIPERDIA", "CELERIFLOW_RIRA"] as const;
export const followupContractNameSchema = z.enum(followupContractNames);
export type FollowupContractName = z.infer<typeof followupContractNameSchema>;
export const followupSchemaVersion = "1.0.0" as const;
export const followupContractLabels: Record<FollowupContractName, string> = { CELERIFLOW_SISPRENATAL: "Acompanhamento gestacional", CELERIFLOW_HIPERDIA: "Hipertensão e diabetes", CELERIFLOW_RIRA: "Regulação e listas de espera" };
const id = z.string().min(1).max(200).refine(value => value === value.trim(), "Identificador com espaçamento inválido."), text = z.string().min(1).max(12000).refine(value => value.trim().length > 0, "Campo de texto obrigatório."), nullableText = z.string().max(12000).nullable();
const timestamp = z.iso.datetime(), nullableTimestamp = timestamp.nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const patient = z.object({ id, personId: id, name: text, status: text, birthDate: nullableTimestamp, deathDate: nullableTimestamp, gender: nullableText, cpf: nullableText, cns: nullableText, phone: nullableText, address: nullableText }).strict();
const unit = z.object({ id, name: text, cnes: nullableText, isActive: z.boolean() }).strict();
const professional = z.object({ id, employeeId: id, name: text, cns: nullableText, cbo: nullableText, isActive: z.boolean() }).strict();
const header = { originId: id, unitId: id, patientId: id, professionalId: id, operation: z.literal("UPSERT"), occurredAt: timestamp, sourceUpdatedAt: timestamp, snapshotAt: timestamp, sourceVersion: hash, idempotencyKey: hash, patient, unit, professional };

const pregnancyData = z.object({
  id, openedMedicalRecordId: id, calculationMethod: z.enum(["LMP", "ULTRASOUND"]), lastMenstrualDate: nullableTimestamp,
  ultrasoundDate: nullableTimestamp, ultrasoundGestationalDays: z.number().int().min(0).nullable(), estimatedDeliveryDate: timestamp,
  baselineWeight: z.number().positive(), height: z.number().positive(), pregnancyType: z.enum(["SINGLE", "MULTIPLE"]), previousPregnancies: z.number().int().min(0), lastScreeningDate: nullableTimestamp,
  status: z.enum(["ACTIVE", "DELIVERED", "MISCARRIAGE", "ADMINISTRATIVE"]), closedAt: nullableTimestamp, closureReason: nullableText,
  visits: z.array(z.object({ id, medicalRecordId: id, professionalId: id, occurredAt: timestamp, gestationalDays: z.number().int().min(0), trimester: z.number().int().min(1).max(3), weight: z.number().positive(), bmi: z.number().positive(), bloodPressure: nullableText, notes: text }).strict()).max(1000),
  postpartumVisits: z.array(z.object({ id, medicalRecordId: id, occurredAt: timestamp, outcome: text, gestationalDaysAtBirth: z.number().int().min(0).nullable(), deliveryType: nullableText, deliveryLocation: nullableText, deliveryDate: nullableTimestamp, clinicalConditions: text }).strict()).max(1000),
  exams: z.array(z.object({ id, medicalRecordId: id, name: text, status: text, requestedAt: timestamp, reviews: z.array(z.object({ id, performedAt: nullableTimestamp, resultedAt: nullableTimestamp, evaluation: text, resultChanged: z.boolean() }).strict()).max(1000) }).strict()).max(5000),
}).strict();
const chronicData = z.object({
  originMedicalRecordId: id,
  conditions: z.array(z.object({ id, medicalRecordId: id.nullable(), professionalId: id.nullable(), chronicKind: z.enum(["HYPERTENSION", "DIABETES"]).nullable(), label: text, startedAt: timestamp, endedAt: nullableTimestamp, narrative: text }).strict()).max(1000),
  assessments: z.array(z.object({ id, medicalRecordId: id, professionalId: id, conditionKind: z.enum(["HYPERTENSION", "DIABETES"]), assessedAt: timestamp, systolic: z.number().positive().nullable(), diastolic: z.number().positive().nullable(), glucose: z.number().positive().nullable(), hba1c: z.number().positive().nullable(), riskFactors: z.array(text).max(1000), complications: z.array(text).max(1000), notes: text }).strict()).max(5000),
}).strict().refine(data => data.assessments.length > 0 || data.conditions.some(condition => condition.chronicKind !== null), "Informe condição crônica classificada ou avaliação estruturada de hipertensão/diabetes.");
const regulationData = z.object({
  id, origin: text, requestedAt: timestamp, requestedByUsuarioId: id, status: text, priority: text, description: nullableText,
  specialtyId: id.nullable(), serviceId: id.nullable(), procedureId: id.nullable(), procedureCode: nullableText,
  protocolNumber: nullableText, guideNumber: nullableText, authorizedAt: nullableTimestamp, scheduledAt: nullableTimestamp, executedAt: nullableTimestamp, returnedAt: nullableTimestamp,
  patientCondition: nullableText, transportNotes: nullableText,
  events: z.array(z.object({ id, eventType: text, fromStatus: nullableText, toStatus: text, notes: nullableText, appointmentId: id.nullable(), actorUsuarioId: id, createdAt: timestamp }).strict()).max(10000),
  waitlist: z.object({ id, status: text, enteredAt: timestamp, updatedAt: timestamp, specialtyId: id.nullable(), serviceId: id.nullable(), scheduledAppointmentId: id.nullable() }).nullable(),
  appointment: z.object({ id, date: timestamp, status: text, unitId: id, professionalId: id.nullable() }).nullable(),
}).strict();

const pregnancyRecord = z.object({ ...header, originType: z.literal("HEALTH_PREGNANCY"), data: pregnancyData }).strict();
const chronicRecord = z.object({ ...header, originType: z.literal("CHRONIC_PATIENT"), data: chronicData }).strict();
const regulationRecord = z.object({ ...header, professionalId: id.nullable(), professional: professional.nullable(), originType: z.enum(["REGULATION_REQUEST", "WAITLIST_ENTRY"]), data: regulationData }).strict();
function identityCheck(record: z.infer<typeof pregnancyRecord> | z.infer<typeof chronicRecord> | z.infer<typeof regulationRecord>, context: z.RefinementCtx) {
  if (record.patientId !== record.patient.id) context.addIssue({ code: "custom", path: ["patientId"], message: "Paciente do cabeçalho diverge do conteúdo." });
  if (record.unitId !== record.unit.id) context.addIssue({ code: "custom", path: ["unitId"], message: "Unidade do cabeçalho diverge do conteúdo." });
  if (record.professionalId !== (record.professional?.id || null)) context.addIssue({ code: "custom", path: ["professionalId"], message: "Profissional do cabeçalho diverge do conteúdo." });
}
export const followupRecordSchemas = {
  CELERIFLOW_SISPRENATAL: pregnancyRecord.superRefine(identityCheck),
  CELERIFLOW_HIPERDIA: chronicRecord.superRefine(identityCheck),
  CELERIFLOW_RIRA: regulationRecord.superRefine(identityCheck),
} as const;
export type FollowupRecord = z.infer<typeof pregnancyRecord> | z.infer<typeof chronicRecord> | z.infer<typeof regulationRecord>;

export const followupEnvelopeSchema = z.object({
  contract: followupContractNameSchema, schemaVersion: z.literal(followupSchemaVersion), batchId: id,
  sender: z.object({ connectionId: id, code: text, unitId: id }).strict(),
  receiver: z.object({ id, code: text, name: text }).strict(),
  fromDate: z.iso.date(), toDate: z.iso.date(), generatedAt: timestamp, reprocessOfId: id.nullable(),
  records: z.array(z.unknown()).min(1).max(500),
}).strict().refine(envelope => envelope.fromDate <= envelope.toDate, "Período da remessa inválido.");

export function canonicalFollowupJson(value: unknown): string {
  const sorted = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(sorted) : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right, "en")).map(([key, item]) => [key, sorted(item)])) : entry;
  return JSON.stringify(sorted(JSON.parse(JSON.stringify(value))));
}
export function followupHash(value: unknown) { return createHash("sha256").update(canonicalFollowupJson(value), "utf8").digest("hex"); }
export function followupRecordVersion(value: Record<string, unknown>) {
  const { sourceVersion, idempotencyKey, snapshotAt, ...source } = value;
  void sourceVersion; void idempotencyKey; void snapshotAt;
  return followupHash(source);
}
export function followupRecordKey(contract: FollowupContractName, originType: string, originId: string, sourceVersion: string) {
  return followupHash({ contract, originType, originId, sourceVersion });
}
export function followupJsonSchema(contract: FollowupContractName) {
  return { envelope: z.toJSONSchema(followupEnvelopeSchema), record: z.toJSONSchema(followupRecordSchemas[contract]) };
}
