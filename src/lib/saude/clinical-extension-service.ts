import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { clinicalConditionQuestionnaireKeys } from "./clinical-questionnaire-policy";

type Tx = Prisma.TransactionClient;
export async function clinicalRecordForActor(tx: Tx, context: AppContext, medicalRecordId: string, editable = true) {
  if (editable) await tx.$queryRaw`SELECT id FROM "MedicalRecord" WHERE id=${medicalRecordId} FOR UPDATE`;
  const record = await tx.medicalRecord.findUniqueOrThrow({ where: { id: medicalRecordId }, include: { patient: { include: { person: true } }, appointment: true, observation: true } });
  assertHealthUnitAccess(context.user, record.unitId);
  const professional = await tx.healthProfessional.findFirst({ where: { employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true } }, select: { id: true } });
  if (!professional || record.professionalId !== professional.id) throw new Error("A operação exige o profissional autenticado responsável pelo atendimento.");
  if (editable && record.completedAt && record.observation?.status !== "Em observação") throw new Error("Atendimento concluído: utilize a revisão dentro da janela parametrizada.");
  return { record, professional };
}

export async function savePatientClinicalCondition(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), id: z.string().optional(), kind: z.enum(["ALLERGY", "CHRONIC", "RISK", "OTHER"]), chronicKind: z.enum(["HYPERTENSION", "DIABETES"]).nullable().optional(), label: z.string().trim().min(1).max(300), startedAt: z.coerce.date(), endedAt: z.coerce.date().nullable(), narrative: z.string().trim().min(1).max(10000) }).strict().parse(raw);
  if (input.endedAt && input.endedAt < input.startedAt) throw new Error("Confira as datas da condição clínica.");
  if (input.chronicKind && input.kind !== "CHRONIC") throw new Error("A classificação de hipertensão/diabetes exige selecionar condição crônica.");
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.id) await tx.$queryRaw`SELECT id FROM "HealthPatientCondition" WHERE id=${input.id} FOR UPDATE`;
    const previous = input.id ? await tx.healthPatientCondition.findFirst({ where: { id: input.id, patientId: record.patientId } }) : null;
    if (input.id && !previous) throw new Error("Condição não pertence ao paciente.");
    const chronicKind = input.kind === "CHRONIC" ? input.chronicKind === undefined ? previous?.chronicKind || null : input.chronicKind : null;
    const data = { patientId: record.patientId, medicalRecordId: record.id, professionalId: professional.id, kind: input.kind, chronicKind, label: input.label, startedAt: input.startedAt, endedAt: input.endedAt, narrative: input.narrative, actorUsuarioId: context.user.id };
    const condition = input.id ? await tx.healthPatientCondition.update({ where: { id: input.id }, data }) : await tx.healthPatientCondition.create({ data });
    await tx.healthPatientConditionRevision.create({ data: { conditionId: condition.id, medicalRecordId: record.id, actorUsuarioId: context.user.id, before: previous ? JSON.parse(JSON.stringify(previous)) : undefined, after: JSON.parse(JSON.stringify(condition)), createdAt: new Date() } });
    return condition;
  });
}

export async function saveOngoingMedication(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), medicineId: z.string().nullable(), name: z.string().trim().min(1), dosage: z.string().trim().min(1), startedAt: z.coerce.date(), endedAt: z.coerce.date().nullable() }).strict().parse(raw);
  if (input.endedAt && input.endedAt < input.startedAt) throw new Error("O encerramento do uso não pode anteceder seu início.");
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.medicineId && !await tx.medicine.count({ where: { id: input.medicineId, isActive: true } })) throw new Error("Medicamento não encontrado.");
    return tx.healthOngoingMedication.create({ data: { patientId: record.patientId, medicineId: input.medicineId, name: input.name, dosage: input.dosage, startedAt: input.startedAt, endedAt: input.endedAt, actorUsuarioId: context.user.id } });
  });
}

const questionnaireField = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/), label: z.string().trim().min(1), type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT"]), required: z.boolean(), options: z.array(z.string()).optional() }).strict();
export const questionnaireFieldsSchema = z.array(questionnaireField).min(1).max(200);
export async function saveClinicalQuestionnaire(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), specialtyId: z.string().nullable(), conditionKind: z.string().nullable(), required: z.boolean(), fields: questionnaireFieldsSchema }).strict().parse(raw);
  if (new Set(input.fields.map(field => field.key)).size !== input.fields.length) throw new Error("Não repita chaves dos campos do questionário.");
  if (input.fields.some(field => field.type === "SELECT" && !field.options?.length)) throw new Error("Campos de lista exigem ao menos uma opção.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_QUESTIONNAIRE:${input.code}`}))`;
    const previous = await tx.healthClinicalQuestionnaire.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
    await tx.healthClinicalQuestionnaire.updateMany({ where: { code: input.code }, data: { isActive: false } });
    return tx.healthClinicalQuestionnaire.create({ data: { ...input, version: (previous?.version || 0) + 1 } });
  });
}

export async function answerClinicalQuestionnaire(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), questionnaireId: z.string().min(1), answers: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const questionnaire = await tx.healthClinicalQuestionnaire.findUniqueOrThrow({ where: { id: input.questionnaireId } });
    const fields = questionnaireFieldsSchema.parse(questionnaire.fields);
    const answers: Record<string, Prisma.InputJsonValue> = {};
    for (const field of fields) {
      const value = input.answers[field.key];
      if (value === null || value === undefined || value === "") { if (field.required) throw new Error(`Preencha ${field.label}.`); continue; }
      if (field.type === "TEXT" && (typeof value !== "string" || field.required && !value.trim()) || field.type === "NUMBER" && (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim())) throw new Error(`Valor inválido em ${field.label}.`);
      if (field.type === "NUMBER" && !Number.isFinite(Number(value)) || field.type === "BOOLEAN" && typeof value !== "boolean" || field.type === "DATE" && !z.iso.date().safeParse(value).success || field.type === "SELECT" && !field.options?.includes(String(value))) throw new Error(`Valor inválido em ${field.label}.`);
      answers[field.key] = field.type === "NUMBER" ? Number(value) : field.type === "BOOLEAN" ? Boolean(value) : String(value);
    }
    return tx.healthClinicalQuestionnaireResponse.upsert({ where: { questionnaireId_medicalRecordId: { questionnaireId: questionnaire.id, medicalRecordId: input.medicalRecordId } }, create: { questionnaireId: questionnaire.id, medicalRecordId: input.medicalRecordId, answers, actorUsuarioId: context.user.id }, update: { answers, actorUsuarioId: context.user.id } });
  });
}

export async function administerClinicalMedication(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), medicineId: z.string().nullable(), medicineName: z.string().trim().min(1), dosage: z.string().trim().min(1), quantity: z.number().positive(), administeredAt: z.coerce.date(), patientOwned: z.boolean(), warehouseId: z.string().nullable(), batchNumber: z.string().nullable(), materials: z.array(z.object({ materialId: z.string().min(1), warehouseId: z.string().min(1), batchNumber: z.string().min(1), quantity: z.number().positive() }).strict()) }).strict().parse(raw);
  if (input.administeredAt > new Date()) throw new Error("A administração não pode ser registrada como realizada no futuro.");
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const medicine = input.medicineId ? await tx.medicine.findUniqueOrThrow({ where: { id: input.medicineId } }) : null;
    let movementId: string | null = null;
    if (!input.patientOwned) {
      if (!medicine?.materialId || !input.warehouseId || !input.batchNumber) throw new Error("Medicamento da unidade exige produto, estoque e lote.");
      const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: input.warehouseId } });
      if (warehouse.healthUnitId !== record.unitId) throw new Error("Estoque não pertence à unidade do atendimento.");
      const stock = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId: warehouse.id, materialId: medicine.materialId, batchNumber: input.batchNumber } } });
      if (stock.blockedAt || stock.expirationDate && stock.expirationDate < input.administeredAt) throw new Error("Lote bloqueado ou vencido.");
      movementId = (await applyStockMovement(tx, { kind: "EXIT", warehouseId: warehouse.id, materialId: medicine.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `ADMINISTRACAO_CLINICA:${record.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } })).movement.id;
    }
    const movements: Prisma.InputJsonObject[] = [];
    for (const item of input.materials) {
      const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: item.warehouseId } });
      if (warehouse.healthUnitId !== record.unitId) throw new Error("Material auxiliar fora da unidade do atendimento.");
      const stock = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId: item.warehouseId, materialId: item.materialId, batchNumber: item.batchNumber } } });
      if (stock.blockedAt || stock.expirationDate && stock.expirationDate < input.administeredAt) throw new Error("Material auxiliar de lote bloqueado ou vencido.");
      const result = await applyStockMovement(tx, { kind: "EXIT", ...item, reason: `MATERIAL_ADMINISTRACAO:${record.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      movements.push({ ...item, movementId: result.movement.id });
    }
    return tx.healthMedicationAdministration.create({ data: { medicalRecordId: record.id, medicineId: input.medicineId, medicineName: input.medicineName, dosage: input.dosage, quantity: input.quantity, administeredAt: input.administeredAt, patientOwned: input.patientOwned, professionalId: professional.id, actorUsuarioId: context.user.id, movementId, materials: movements } });
  });
}

export async function reviewClinicalExam(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), examRequestId: z.string().min(1), performedAt: z.coerce.date().nullable(), resultedAt: z.coerce.date().nullable(), resultChanged: z.boolean(), providerSupplierId: z.string().nullable(), evaluation: z.string().trim().min(1) }).strict().parse(raw);
  if (input.resultedAt && (!input.performedAt || input.resultedAt < input.performedAt) || input.performedAt && input.performedAt > new Date() || input.resultedAt && input.resultedAt > new Date()) throw new Error("Confira as datas de realização e resultado do exame.");
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (!await tx.healthExamRequest.count({ where: { id: input.examRequestId, patientId: record.patientId } })) throw new Error("O exame deve pertencer ao paciente do atendimento.");
    if (input.providerSupplierId && !await tx.supplier.count({ where: { id: input.providerSupplierId, status: "Ativo" } })) throw new Error("Selecione um prestador ativo cadastrado.");
    return tx.healthClinicalExamReview.create({ data: { ...input, actorUsuarioId: context.user.id } });
  });
}

export async function recordCounterreference(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), referralId: z.string().min(1), response: z.string().trim().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (!await tx.healthReferral.count({ where: { id: input.referralId, patientId: record.patientId } })) throw new Error("Encaminhamento não pertence ao paciente.");
    await tx.healthReferral.update({ where: { id: input.referralId }, data: { status: "CONCLUIDO" } });
    return tx.healthCounterreference.create({ data: { ...input, actorUsuarioId: context.user.id } });
  });
}

export async function reviseCompletedCare(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), reason: z.string().trim().min(1), anamnesis: z.string().max(10000).nullable(), assessment: z.string().max(10000).nullable(), evolution: z.string().max(10000).nullable(), conduct: z.string().max(10000).nullable(), observations: z.string().max(10000).nullable() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MedicalRecord" WHERE id=${input.medicalRecordId} FOR UPDATE`;
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId, false);
    const parameter = await tx.configuracaoParametroInstancia.findFirst({ where: { chave: `HEALTH_CARE_REVISION_HOURS:${record.unitId}` }, select: { valor: true } });
    const hours = typeof parameter?.valor === "number" ? parameter.valor : 0;
    if (!record.completedAt || hours <= 0 || Date.now() > record.completedAt.valueOf() + hours * 3600000) throw new Error("Janela de revisão encerrada ou não habilitada pela unidade.");
    const { medicalRecordId, reason, ...after } = input;
    const before = { anamnesis: record.anamnesis, assessment: record.assessment, evolution: record.evolution, conduct: record.conduct, observations: record.observations };
    await tx.medicalRecord.update({ where: { id: medicalRecordId }, data: after });
    return tx.healthCareRevision.create({ data: { medicalRecordId, reason, before, after, actorUsuarioId: context.user.id } });
  });
}

export async function configureCareRevisionWindow(context: AppContext, unitId: string, hours: number) {
  z.number().int().min(0).max(720).parse(hours); assertHealthUnitAccess(context.user, unitId);
  const instance = await context.prisma.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const chave = `HEALTH_CARE_REVISION_HOURS:${unitId}`;
  return context.prisma.configuracaoParametroInstancia.upsert({ where: { configuracaoInstanciaId_chave: { configuracaoInstanciaId: instance.id, chave } }, create: { configuracaoInstanciaId: instance.id, chave, valor: hours }, update: { valor: hours } });
}

export async function assertRequiredClinicalQuestionnaires(tx: Tx, medicalRecordId: string) {
  const record = await tx.medicalRecord.findUniqueOrThrow({ where: { id: medicalRecordId }, include: { appointment: true } });
  const conditions = await tx.healthPatientCondition.findMany({ where: { patientId: record.patientId, endedAt: null }, select: { kind: true, label: true } });
  const pregnant = await tx.healthPregnancy.count({ where: { patientId: record.patientId, status: "ACTIVE" } }) > 0;
  const keys = clinicalConditionQuestionnaireKeys(conditions, pregnant);
  const questionnaires = await tx.healthClinicalQuestionnaire.findMany({ where: { isActive: true, required: true, AND: [{ OR: [{ specialtyId: null }, { specialtyId: record.appointment?.specialtyId || "__SEM_ESPECIALIDADE__" }] }, { OR: [{ conditionKind: null }, { conditionKind: { in: keys } }] }] }, select: { id: true, name: true } });
  for (const questionnaire of questionnaires) if (!await tx.healthClinicalQuestionnaireResponse.count({ where: { medicalRecordId, questionnaireId: questionnaire.id } })) throw new Error(`Responda o questionário obrigatório: ${questionnaire.name}.`);
}

export async function saveSpecialtyProcedureRule(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().nullable(), specialtyId: z.string().nullable(), eventType: z.enum(["CARE_COMPLETED", "TRIAGE_COMPLETED", "DENTAL_COMPLETED"]), procedureId: z.string().min(1), quantity: z.number().int().positive(), isActive: z.boolean().default(true) }).strict().parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  if (!await context.prisma.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true, isCurrent: true } })) throw new Error("Selecione procedimento SIGTAP ativo.");
  return context.prisma.healthSpecialtyProcedureRule.create({ data: input });
}

export async function configureClinicalBiometry(context: AppContext, unitId: string, enabled: boolean) {
  z.boolean().parse(enabled); assertHealthUnitAccess(context.user, unitId);
  const instance = await context.prisma.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const chave = `HEALTH_BIOMETRY_ENABLED:${unitId}`;
  return context.prisma.configuracaoParametroInstancia.upsert({ where: { configuracaoInstanciaId_chave: { configuracaoInstanciaId: instance.id, chave } }, create: { configuracaoInstanciaId: instance.id, chave, valor: enabled }, update: { valor: enabled } });
}

export type HealthBiometricReader = {
  connectionState(): Promise<"CONNECTED" | "DISCONNECTED">;
  captureAndValidate(challenge: string): Promise<{ challenge: string; verifiedIdentityToken: string; method: "BIOMETRIC" }>;
};

export async function internallyReferCare(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), unitId: z.string().min(1), specialtyId: z.string().nullable(), serviceId: z.string().nullable(), professionalId: z.string().nullable(), reason: z.string().trim().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    assertHealthUnitAccess(context.user, input.unitId);
    if (!await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione unidade de destino ativa.");
    if (input.specialtyId && !await tx.healthUnitSpecialty.count({ where: { unitId: input.unitId, specialtyId: input.specialtyId, isActive: true, specialty: { isActive: true } } })) throw new Error("Especialidade não está ativa na unidade de destino.");
    if (input.serviceId && !await tx.healthServiceAssignment.count({ where: { unitId: input.unitId, serviceId: input.serviceId, isActive: true, service: { isActive: true } } })) throw new Error("Serviço não está ativo na unidade de destino.");
    if (input.professionalId && !await tx.healthProfessional.count({ where: { id: input.professionalId, isActive: true, employee: { isActive: true }, OR: [{ unitId: input.unitId }, { assignments: { some: { unitId: input.unitId, isActive: true } } }] } })) throw new Error("Profissional sem vínculo ativo com a unidade de destino.");
    const appointment = await tx.healthAppointment.create({ data: { patientId: record.patientId, unitId: input.unitId, professionalId: input.professionalId, specialtyId: input.specialtyId, serviceId: input.serviceId, origin: "SPONTANEOUS", status: "Aguardando", priority: "Normal", date: new Date(), arrivedAt: new Date(), arrivalNotes: input.reason } });
    const referral = await tx.healthInternalCareReferral.create({ data: { medicalRecordId: record.id, appointmentId: appointment.id, reason: input.reason, actorUsuarioId: context.user.id } });
    await tx.healthAppointmentEvent.create({ data: { appointmentId: appointment.id, eventType: "INTERNAL_REFERRAL", toStatus: "Aguardando", notes: `Origem clínica ${record.id}: ${input.reason}`, actorUsuarioId: context.user.id } });
    return referral;
  });
}
