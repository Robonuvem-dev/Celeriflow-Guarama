import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import { runHealthTransaction } from "./health-transaction";
import { healthAppointments, healthAppointmentEvents } from "@/db/schema/health-agenda";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { instanceParameters, systemInstances } from "@/db/schema/instance-configuration";
import { materialStocks, warehouses } from "@/db/schema/assets-stock";
import { medicines } from "@/db/schema/health-prescriptions";
import { medicalRecords, healthObservations, healthPatientConditions, healthPatientConditionRevisions, healthOngoingMedications, healthClinicalQuestionnaires, healthClinicalQuestionnaireResponses, healthMedicationAdministrations, healthClinicalExamReviews, healthExamRequests, healthReferrals, healthCounterreferences, healthCareRevisions, healthSpecialtyProcedureRules, healthInternalCareReferrals } from "@/db/schema/health-care";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { clinicalConditionQuestionnaireKeys } from "./clinical-questionnaire-policy";

type Tx = DatabaseExecutor;
export async function clinicalRecordForActor(tx: Tx, context: AppContext, medicalRecordId: string, editable = true) {
  if (editable) await tx.execute(sql`SELECT id FROM "MedicalRecord" WHERE id=${medicalRecordId} FOR UPDATE`);
  const [row] = await tx.select({ record: medicalRecords, patient: patients, person: people, appointment: healthAppointments, observation: healthObservations }).from(medicalRecords).innerJoin(patients, eq(patients.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthAppointments, eq(healthAppointments.id, medicalRecords.appointmentId)).leftJoin(healthObservations, eq(healthObservations.medicalRecordId, medicalRecords.id)).where(eq(medicalRecords.id, medicalRecordId)).limit(1);
  if (!row) throw new Error("Prontuário de atendimento não encontrado.");
  const record = { ...row.record, patient: { ...row.patient, person: row.person }, appointment: row.appointment, observation: row.observation };
  assertHealthUnitAccess(context.user, record.unitId);
  const [professional] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId || "__SEM_PROFISSIONAL__"), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1);
  if (!professional || record.professionalId !== professional.id) throw new Error("A operação exige o profissional autenticado responsável pelo atendimento.");
  if (editable && record.completedAt && record.observation?.status !== "Em observação") throw new Error("Atendimento concluído: utilize a revisão dentro da janela parametrizada.");
  return { record, professional };
}

export async function savePatientClinicalCondition(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), id: z.string().optional(), kind: z.enum(["ALLERGY", "CHRONIC", "RISK", "OTHER"]), chronicKind: z.enum(["HYPERTENSION", "DIABETES"]).nullable().optional(), label: z.string().trim().min(1).max(300), startedAt: z.coerce.date(), endedAt: z.coerce.date().nullable(), narrative: z.string().trim().min(1).max(10000) }).strict().parse(raw);
  if (input.endedAt && input.endedAt < input.startedAt) throw new Error("Confira as datas da condição clínica.");
  if (input.chronicKind && input.kind !== "CHRONIC") throw new Error("A classificação de hipertensão/diabetes exige selecionar condição crônica.");
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.id) await tx.execute(sql`SELECT id FROM "HealthPatientCondition" WHERE id=${input.id} FOR UPDATE`);
    const previous = input.id ? (await tx.select().from(healthPatientConditions).where(and(eq(healthPatientConditions.id, input.id), eq(healthPatientConditions.patientId, record.patientId))).limit(1))[0] : null;
    if (input.id && !previous) throw new Error("Condição não pertence ao paciente.");
    const chronicKind = input.kind === "CHRONIC" ? input.chronicKind === undefined ? previous?.chronicKind || null : input.chronicKind : null;
    const data = { patientId: record.patientId, medicalRecordId: record.id, professionalId: professional.id, kind: input.kind, chronicKind, label: input.label, startedAt: input.startedAt, endedAt: input.endedAt, narrative: input.narrative, actorUsuarioId: context.user.id };
    const [condition] = input.id ? await tx.update(healthPatientConditions).set(data).where(eq(healthPatientConditions.id, input.id)).returning() : await tx.insert(healthPatientConditions).values(data).returning();
    await tx.insert(healthPatientConditionRevisions).values({ conditionId: condition.id, medicalRecordId: record.id, actorUsuarioId: context.user.id, before: previous ? JSON.parse(JSON.stringify(previous)) : undefined, after: JSON.parse(JSON.stringify(condition)), createdAt: new Date() });
    return condition;
  });
}

export async function saveOngoingMedication(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), medicineId: z.string().nullable(), name: z.string().trim().min(1), dosage: z.string().trim().min(1), startedAt: z.coerce.date(), endedAt: z.coerce.date().nullable() }).strict().parse(raw);
  if (input.endedAt && input.endedAt < input.startedAt) throw new Error("O encerramento do uso não pode anteceder seu início.");
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.medicineId && !(await tx.select({ id: medicines.id }).from(medicines).where(and(eq(medicines.id, input.medicineId), eq(medicines.isActive, true))).limit(1)).length) throw new Error("Medicamento não encontrado.");
    const [medication] = await tx.insert(healthOngoingMedications).values({ patientId: record.patientId, medicineId: input.medicineId, name: input.name, dosage: input.dosage, startedAt: input.startedAt, endedAt: input.endedAt, actorUsuarioId: context.user.id }).returning();
    return medication;
  });
}

const questionnaireField = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/), label: z.string().trim().min(1), type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"]), required: z.boolean(), options: z.array(z.string()).optional() }).strict();
export const questionnaireFieldsSchema = z.array(questionnaireField).min(1).max(200);
export async function saveClinicalQuestionnaire(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), specialtyId: z.string().nullable(), conditionKind: z.string().nullable(), required: z.boolean(), fields: questionnaireFieldsSchema }).strict().parse(raw);
  if (new Set(input.fields.map(field => field.key)).size !== input.fields.length) throw new Error("Não repita chaves dos campos do questionário.");
  if (input.fields.some(field => field.type === "SELECT" && !field.options?.length)) throw new Error("Campos de lista exigem ao menos uma opção.");
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_QUESTIONNAIRE:${input.code}`}))`);
    const [previous] = await tx.select({ version: healthClinicalQuestionnaires.version }).from(healthClinicalQuestionnaires).where(eq(healthClinicalQuestionnaires.code, input.code)).orderBy(desc(healthClinicalQuestionnaires.version)).limit(1);
    await tx.update(healthClinicalQuestionnaires).set({ isActive: false }).where(eq(healthClinicalQuestionnaires.code, input.code));
    const [questionnaire] = await tx.insert(healthClinicalQuestionnaires).values({ ...input, version: (previous?.version || 0) + 1 }).returning();
    return questionnaire;
  });
}

export async function answerClinicalQuestionnaire(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), questionnaireId: z.string().min(1), answers: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const [questionnaire] = await tx.select().from(healthClinicalQuestionnaires).where(eq(healthClinicalQuestionnaires.id, input.questionnaireId)).limit(1);
    if (!questionnaire) throw new Error("Questionário não encontrado.");
    const fields = questionnaireFieldsSchema.parse(questionnaire.fields);
    const answers: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      const value = input.answers[field.key];
      if (value === null || value === undefined || value === "") { if (field.required) throw new Error(`Preencha ${field.label}.`); continue; }
      if (field.type === "TEXT" && (typeof value !== "string" || field.required && !value.trim()) || field.type === "NUMBER" && (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim())) throw new Error(`Valor inválido em ${field.label}.`);
      if (field.type === "NUMBER" && !Number.isFinite(Number(value)) || field.type === "BOOLEAN" && typeof value !== "boolean" || field.type === "DATE" && !z.iso.date().safeParse(value).success || field.type === "SELECT" && !field.options?.includes(String(value))) throw new Error(`Valor inválido em ${field.label}.`);
      answers[field.key] = field.type === "NUMBER" ? Number(value) : field.type === "BOOLEAN" ? Boolean(value) : String(value);
    }
    const [response] = await tx.insert(healthClinicalQuestionnaireResponses).values({ questionnaireId: questionnaire.id, medicalRecordId: input.medicalRecordId, answers, actorUsuarioId: context.user.id }).onConflictDoUpdate({ target: [healthClinicalQuestionnaireResponses.questionnaireId, healthClinicalQuestionnaireResponses.medicalRecordId], set: { answers, actorUsuarioId: context.user.id } }).returning();
    return response;
  });
}

export async function administerClinicalMedication(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), medicineId: z.string().nullable(), medicineName: z.string().trim().min(1), dosage: z.string().trim().min(1), quantity: z.number().positive(), administeredAt: z.coerce.date(), patientOwned: z.boolean(), warehouseId: z.string().nullable(), batchNumber: z.string().nullable(), materials: z.array(z.object({ materialId: z.string().min(1), warehouseId: z.string().min(1), batchNumber: z.string().min(1), quantity: z.number().positive() }).strict()) }).strict().parse(raw);
  if (input.administeredAt > new Date()) throw new Error("A administração não pode ser registrada como realizada no futuro.");
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const medicine = input.medicineId ? (await tx.select().from(medicines).where(eq(medicines.id, input.medicineId)).limit(1))[0] : null;
    if (input.medicineId && !medicine) throw new Error("Medicamento não encontrado.");
    let movementId: string | null = null;
    if (!input.patientOwned) {
      if (!medicine?.materialId || !input.warehouseId || !input.batchNumber) throw new Error("Medicamento da unidade exige produto, estoque e lote.");
      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, input.warehouseId)).limit(1);
      if (!warehouse) throw new Error("Estoque não encontrado.");
      if (warehouse.healthUnitId !== record.unitId) throw new Error("Estoque não pertence à unidade do atendimento.");
      const [stock] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, warehouse.id), eq(materialStocks.materialId, medicine.materialId), eq(materialStocks.batchNumber, input.batchNumber))).limit(1);
      if (!stock) throw new Error("Lote não encontrado.");
      if (stock.blockedAt || stock.expirationDate && stock.expirationDate < input.administeredAt) throw new Error("Lote bloqueado ou vencido.");
      movementId = (await applyStockMovement(tx, { kind: "EXIT", warehouseId: warehouse.id, materialId: medicine.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `ADMINISTRACAO_CLINICA:${record.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } })).movement.id;
    }
    const movements: JsonObject[] = [];
    for (const item of input.materials) {
      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, item.warehouseId)).limit(1);
      if (!warehouse) throw new Error("Estoque não encontrado.");
      if (warehouse.healthUnitId !== record.unitId) throw new Error("Material auxiliar fora da unidade do atendimento.");
      const [stock] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, item.warehouseId), eq(materialStocks.materialId, item.materialId), eq(materialStocks.batchNumber, item.batchNumber))).limit(1);
      if (!stock) throw new Error("Lote auxiliar não encontrado.");
      if (stock.blockedAt || stock.expirationDate && stock.expirationDate < input.administeredAt) throw new Error("Material auxiliar de lote bloqueado ou vencido.");
      const result = await applyStockMovement(tx, { kind: "EXIT", ...item, reason: `MATERIAL_ADMINISTRACAO:${record.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      movements.push({ ...item, movementId: result.movement.id });
    }
    const [administration] = await tx.insert(healthMedicationAdministrations).values({ medicalRecordId: record.id, medicineId: input.medicineId, medicineName: input.medicineName, dosage: input.dosage, quantity: input.quantity, administeredAt: input.administeredAt, patientOwned: input.patientOwned, professionalId: professional.id, actorUsuarioId: context.user.id, movementId, materials: movements }).returning();
    return administration;
  });
}

export async function reviewClinicalExam(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), examRequestId: z.string().min(1), performedAt: z.coerce.date().nullable(), resultedAt: z.coerce.date().nullable(), resultChanged: z.boolean(), providerSupplierId: z.string().nullable(), evaluation: z.string().trim().min(1) }).strict().parse(raw);
  if (input.resultedAt && (!input.performedAt || input.resultedAt < input.performedAt) || input.performedAt && input.performedAt > new Date() || input.resultedAt && input.resultedAt > new Date()) throw new Error("Confira as datas de realização e resultado do exame.");
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (!(await tx.select({ id: healthExamRequests.id }).from(healthExamRequests).where(and(eq(healthExamRequests.id, input.examRequestId), eq(healthExamRequests.patientId, record.patientId))).limit(1)).length) throw new Error("O exame deve pertencer ao paciente do atendimento.");
    if (input.providerSupplierId && !(await tx.execute(sql`SELECT id FROM "Supplier" WHERE id=${input.providerSupplierId} AND status='Ativo' LIMIT 1`)).rows.length) throw new Error("Selecione um prestador ativo cadastrado.");
    const [review] = await tx.insert(healthClinicalExamReviews).values({ ...input, actorUsuarioId: context.user.id }).returning();
    return review;
  });
}

export async function recordCounterreference(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), referralId: z.string().min(1), response: z.string().trim().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (!(await tx.select({ id: healthReferrals.id }).from(healthReferrals).where(and(eq(healthReferrals.id, input.referralId), eq(healthReferrals.patientId, record.patientId))).limit(1)).length) throw new Error("Encaminhamento não pertence ao paciente.");
    await tx.update(healthReferrals).set({ status: "CONCLUIDO" }).where(eq(healthReferrals.id, input.referralId));
    const [counterreference] = await tx.insert(healthCounterreferences).values({ ...input, actorUsuarioId: context.user.id }).returning();
    return counterreference;
  });
}

export async function reviseCompletedCare(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), reason: z.string().trim().min(1), anamnesis: z.string().max(10000).nullable(), assessment: z.string().max(10000).nullable(), evolution: z.string().max(10000).nullable(), conduct: z.string().max(10000).nullable(), observations: z.string().max(10000).nullable() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "MedicalRecord" WHERE id=${input.medicalRecordId} FOR UPDATE`);
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId, false);
    const [parameter] = await tx.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, `HEALTH_CARE_REVISION_HOURS:${record.unitId}`)).limit(1);
    const hours = typeof parameter?.valor === "number" ? parameter.valor : 0;
    if (!record.completedAt || hours <= 0 || Date.now() > record.completedAt.valueOf() + hours * 3600000) throw new Error("Janela de revisão encerrada ou não habilitada pela unidade.");
    const { medicalRecordId, reason, ...after } = input;
    const before = { anamnesis: record.anamnesis, assessment: record.assessment, evolution: record.evolution, conduct: record.conduct, observations: record.observations };
    await tx.update(medicalRecords).set(after).where(eq(medicalRecords.id, medicalRecordId));
    const [revision] = await tx.insert(healthCareRevisions).values({ medicalRecordId, reason, before, after, actorUsuarioId: context.user.id }).returning();
    return revision;
  });
}

export async function configureCareRevisionWindow(context: AppContext, unitId: string, hours: number) {
  z.number().int().min(0).max(720).parse(hours); assertHealthUnitAccess(context.user, unitId);
  const database = context.database ?? db;
  const [instance] = await database.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!instance) throw new Error("Configuração da instância não encontrada.");
  const chave = `HEALTH_CARE_REVISION_HOURS:${unitId}`;
  const [parameter] = await database.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave, valor: hours }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: hours } }).returning();
  return parameter;
}

export async function assertRequiredClinicalQuestionnaires(tx: Tx, medicalRecordId: string) {
  const [row] = await tx.select({ patientId: medicalRecords.patientId, specialtyId: healthAppointments.specialtyId }).from(medicalRecords).leftJoin(healthAppointments, eq(healthAppointments.id, medicalRecords.appointmentId)).where(eq(medicalRecords.id, medicalRecordId)).limit(1);
  if (!row) throw new Error("Prontuário de atendimento não encontrado.");
  const conditions = await tx.select({ kind: healthPatientConditions.kind, label: healthPatientConditions.label }).from(healthPatientConditions).where(and(eq(healthPatientConditions.patientId, row.patientId), isNull(healthPatientConditions.endedAt)));
  const pregnant = (await tx.execute(sql`SELECT id FROM "HealthPregnancy" WHERE "patientId"=${row.patientId} AND status='ACTIVE' LIMIT 1`)).rows.length > 0;
  const keys = clinicalConditionQuestionnaireKeys(conditions, pregnant);
  const questionnaires = await tx.select({ id: healthClinicalQuestionnaires.id, name: healthClinicalQuestionnaires.name }).from(healthClinicalQuestionnaires).where(and(eq(healthClinicalQuestionnaires.isActive, true), eq(healthClinicalQuestionnaires.required, true), or(isNull(healthClinicalQuestionnaires.specialtyId), eq(healthClinicalQuestionnaires.specialtyId, row.specialtyId || "__SEM_ESPECIALIDADE__")), or(isNull(healthClinicalQuestionnaires.conditionKind), inArray(healthClinicalQuestionnaires.conditionKind, keys))));
  for (const questionnaire of questionnaires) if (!(await tx.select({ id: healthClinicalQuestionnaireResponses.id }).from(healthClinicalQuestionnaireResponses).where(and(eq(healthClinicalQuestionnaireResponses.medicalRecordId, medicalRecordId), eq(healthClinicalQuestionnaireResponses.questionnaireId, questionnaire.id))).limit(1)).length) throw new Error(`Responda o questionário obrigatório: ${questionnaire.name}.`);
}

export async function saveSpecialtyProcedureRule(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().nullable(), specialtyId: z.string().nullable(), eventType: z.enum(["CARE_COMPLETED", "TRIAGE_COMPLETED", "DENTAL_COMPLETED"]), procedureId: z.string().min(1), quantity: z.number().int().positive(), isActive: z.boolean().default(true) }).strict().parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  const database = context.database ?? db;
  if (!(await database.execute(sql`SELECT id FROM "HealthSusProcedure" WHERE id=${input.procedureId} AND "isActive"=true AND "isCurrent"=true LIMIT 1`)).rows.length) throw new Error("Selecione procedimento SIGTAP ativo.");
  const [rule] = await database.insert(healthSpecialtyProcedureRules).values(input).returning();
  return rule;
}

export async function configureClinicalBiometry(context: AppContext, unitId: string, enabled: boolean) {
  z.boolean().parse(enabled); assertHealthUnitAccess(context.user, unitId);
  const database = context.database ?? db;
  const [instance] = await database.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!instance) throw new Error("Configuração da instância não encontrada.");
  const chave = `HEALTH_BIOMETRY_ENABLED:${unitId}`;
  const [parameter] = await database.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave, valor: enabled }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: enabled } }).returning();
  return parameter;
}

export type HealthBiometricReader = {
  connectionState(): Promise<"CONNECTED" | "DISCONNECTED">;
  captureAndValidate(challenge: string): Promise<{ challenge: string; verifiedIdentityToken: string; method: "BIOMETRIC" }>;
};

export async function internallyReferCare(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), unitId: z.string().min(1), specialtyId: z.string().nullable(), serviceId: z.string().nullable(), professionalId: z.string().nullable(), reason: z.string().trim().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    assertHealthUnitAccess(context.user, input.unitId);
    if (!(await tx.execute(sql`SELECT id FROM "HealthUnit" WHERE id=${input.unitId} AND "isActive"=true LIMIT 1`)).rows.length) throw new Error("Selecione unidade de destino ativa.");
    if (input.specialtyId && !(await tx.execute(sql`SELECT u.id FROM "HealthUnitSpecialty" u JOIN "HealthSpecialty" s ON s.id=u."specialtyId" WHERE u."unitId"=${input.unitId} AND u."specialtyId"=${input.specialtyId} AND u."isActive"=true AND s."isActive"=true LIMIT 1`)).rows.length) throw new Error("Especialidade não está ativa na unidade de destino.");
    if (input.serviceId && !(await tx.execute(sql`SELECT u.id FROM "HealthServiceAssignment" u JOIN "HealthService" s ON s.id=u."serviceId" WHERE u."unitId"=${input.unitId} AND u."serviceId"=${input.serviceId} AND u."isActive"=true AND s."isActive"=true LIMIT 1`)).rows.length) throw new Error("Serviço não está ativo na unidade de destino.");
    if (input.professionalId && !(await tx.execute(sql`SELECT p.id FROM "HealthProfessional" p JOIN "Employee" e ON e.id=p."employeeId" WHERE p.id=${input.professionalId} AND p."isActive"=true AND e."isActive"=true AND (p."unitId"=${input.unitId} OR EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=p.id AND a."unitId"=${input.unitId} AND a."isActive"=true)) LIMIT 1`)).rows.length) throw new Error("Profissional sem vínculo ativo com a unidade de destino.");
    const [appointment] = await tx.insert(healthAppointments).values({ patientId: record.patientId, unitId: input.unitId, professionalId: input.professionalId, specialtyId: input.specialtyId, serviceId: input.serviceId, origin: "SPONTANEOUS", status: "Aguardando", priority: "Normal", date: new Date(), arrivedAt: new Date(), arrivalNotes: input.reason }).returning({ id: healthAppointments.id });
    const [referral] = await tx.insert(healthInternalCareReferrals).values({ medicalRecordId: record.id, appointmentId: appointment.id, reason: input.reason, actorUsuarioId: context.user.id }).returning();
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "INTERNAL_REFERRAL", toStatus: "Aguardando", notes: `Origem clínica ${record.id}: ${input.reason}`, actorUsuarioId: context.user.id });
    return referral;
  });
}
