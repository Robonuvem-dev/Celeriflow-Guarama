import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { clinicalRecordForActor } from "./clinical-extension-service";
import { assertDentalTarget, pregnancyDating } from "./care-lines-policy";

const origin = { medicalRecordId: z.string().min(1) };
const nullableDate = z.coerce.date().nullable();
const note = z.string().trim().min(1).max(10000);

export async function openPregnancy(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, lastMenstrualDate: nullableDate, ultrasoundDate: nullableDate, ultrasoundGestationalDays: z.number().int().min(0).max(315).nullable(), calculationMethod: z.enum(["LMP", "ULTRASOUND"]), baselineWeight: z.number().positive().max(700), height: z.number().positive().max(3), pregnancyType: z.enum(["SINGLE", "MULTIPLE"]), previousPregnancies: z.number().int().min(0).max(50), lastScreeningDate: nullableDate }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${record.patientId} FOR UPDATE`;
    if (await tx.healthPregnancy.count({ where: { patientId: record.patientId, status: "ACTIVE" } })) throw new Error("O paciente já possui uma gestação ativa.");
    const dating = pregnancyDating(input, record.date);
    const { medicalRecordId, ...data } = input;
    return tx.healthPregnancy.create({ data: { ...data, openedMedicalRecordId: medicalRecordId, patientId: record.patientId, unitId: record.unitId, estimatedDeliveryDate: dating.estimatedDeliveryDate, createdByUsuarioId: context.user.id } });
  });
}

export async function recordPrenatalVisit(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, pregnancyId: z.string().min(1), weight: z.number().positive().max(700), bloodPressure: z.string().trim().max(50).nullable(), notes: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.$queryRaw`SELECT id FROM "HealthPregnancy" WHERE id=${input.pregnancyId} FOR UPDATE`;
    const pregnancy = await tx.healthPregnancy.findUniqueOrThrow({ where: { id: input.pregnancyId } });
    if (pregnancy.patientId !== record.patientId || pregnancy.status !== "ACTIVE") throw new Error("Selecione uma gestação ativa deste paciente.");
    const dating = pregnancyDating({ ...pregnancy, calculationMethod: z.enum(["LMP", "ULTRASOUND"]).parse(pregnancy.calculationMethod) }, record.date);
    const data = { ...input, occurredAt: record.date, gestationalDays: dating.gestationalDays, trimester: dating.trimester, bmi: Number((input.weight / pregnancy.height ** 2).toFixed(2)), professionalId: professional.id, actorUsuarioId: context.user.id };
    const previous = await tx.healthPregnancyVisit.findUnique({ where: { medicalRecordId: record.id } });
    if (previous) throw new Error("Este atendimento já possui uma consulta pré-natal registrada.");
    return tx.healthPregnancyVisit.create({ data });
  });
}

export async function closePregnancy(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, pregnancyId: z.string().min(1), outcome: z.enum(["DELIVERED", "MISCARRIAGE", "ADMINISTRATIVE"]), reason: note, gestationalDaysAtBirth: z.number().int().min(0).max(350).nullable(), deliveryType: z.string().trim().max(200).nullable(), deliveryLocation: z.string().trim().max(300).nullable(), deliveryDate: nullableDate, clinicalConditions: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.$queryRaw`SELECT id FROM "HealthPregnancy" WHERE id=${input.pregnancyId} FOR UPDATE`;
    const pregnancy = await tx.healthPregnancy.findUniqueOrThrow({ where: { id: input.pregnancyId } });
    if (pregnancy.patientId !== record.patientId || pregnancy.status !== "ACTIVE") throw new Error("Gestação ativa não encontrada neste paciente.");
    if (input.outcome === "DELIVERED" && (input.gestationalDaysAtBirth === null || !input.deliveryType || !input.deliveryLocation || !input.deliveryDate)) throw new Error("Informe idade gestacional, data, tipo e local do parto.");
    if (input.deliveryDate && (input.deliveryDate > record.date || input.deliveryDate.valueOf() < pregnancy.estimatedDeliveryDate.valueOf() - 280 * 86400000)) throw new Error("Confira a data do parto em relação à gestação e à consulta.");
    if (input.outcome !== "ADMINISTRATIVE") await tx.healthPostpartumVisit.create({ data: { pregnancyId: pregnancy.id, medicalRecordId: record.id, occurredAt: record.date, outcome: input.outcome, gestationalDaysAtBirth: input.gestationalDaysAtBirth, deliveryType: input.deliveryType, deliveryLocation: input.deliveryLocation, deliveryDate: input.deliveryDate, clinicalConditions: input.clinicalConditions, actorUsuarioId: context.user.id } });
    return tx.healthPregnancy.update({ where: { id: pregnancy.id }, data: { status: input.outcome, closureReason: `${input.reason}\n${input.clinicalConditions}`, closedAt: record.date, closedByUsuarioId: context.user.id } });
  });
}

export async function recordChronicAssessment(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, conditionKind: z.enum(["HYPERTENSION", "DIABETES"]), systolic: z.number().positive().max(400).nullable(), diastolic: z.number().positive().max(300).nullable(), glucose: z.number().positive().max(2000).nullable(), hba1c: z.number().positive().max(30).nullable(), riskFactors: z.array(z.string().trim().min(1)).max(100), complications: z.array(z.string().trim().min(1)).max(100), notes: note }).strict().parse(raw);
  if (input.conditionKind === "HYPERTENSION" && (input.systolic === null || input.diastolic === null || input.systolic <= input.diastolic)) throw new Error("Informe pressão sistólica e diastólica válidas.");
  if (input.conditionKind === "DIABETES" && input.glucose === null && input.hba1c === null) throw new Error("Informe glicemia ou hemoglobina glicada no acompanhamento.");
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const label = input.conditionKind === "HYPERTENSION" ? "Hipertensão" : "Diabetes";
    await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${record.patientId} FOR UPDATE`;
    const previous = await tx.healthPatientCondition.findFirst({ where: { patientId: record.patientId, kind: "CHRONIC", endedAt: null, OR: [{ chronicKind: input.conditionKind }, { chronicKind: null, label }] }, orderBy: { createdAt: "asc" } });
    if (!previous) await tx.healthPatientCondition.create({ data: { patientId: record.patientId, medicalRecordId: record.id, professionalId: professional.id, kind: "CHRONIC", chronicKind: input.conditionKind, label, startedAt: record.date, narrative: input.notes, actorUsuarioId: context.user.id } });
    else if (!previous.chronicKind) {
      const after = await tx.healthPatientCondition.update({ where: { id: previous.id }, data: { chronicKind: input.conditionKind } });
      await tx.healthPatientConditionRevision.create({ data: { conditionId: previous.id, medicalRecordId: record.id, actorUsuarioId: context.user.id, before: JSON.parse(JSON.stringify(previous)), after: JSON.parse(JSON.stringify(after)) } });
    }
    return tx.healthChronicAssessment.create({ data: { ...input, patientId: record.patientId, assessedAt: record.date, actorUsuarioId: context.user.id }, select: { id: true } });
  });
}

export async function saveClinicalScreening(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, id: z.string().min(1).nullable(), kind: z.enum(["CYTOLOGY", "MAMMOGRAPHY"]), eligible: z.boolean(), eligibilityReason: note, performedAt: nullableDate, resultedAt: nullableDate, result: z.string().trim().max(10000).nullable(), examRequestId: z.string().nullable(), followupNotes: note }).strict().parse(raw);
  if (input.resultedAt && (!input.performedAt || input.resultedAt < input.performedAt || !input.result)) throw new Error("Resultado exige realização anterior e descrição.");
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.performedAt && input.performedAt > new Date() || input.resultedAt && input.resultedAt > new Date()) throw new Error("Realização e resultado não podem estar no futuro.");
    const previous = input.id ? await tx.healthClinicalScreening.findFirstOrThrow({ where: { id: input.id, patientId: record.patientId, kind: input.kind } }) : null;
    if (input.examRequestId && !await tx.healthExamRequest.count({ where: { id: input.examRequestId, patientId: record.patientId } })) throw new Error("Exame de outro paciente.");
    const { id, ...data } = input;
    const values = { ...data, patientId: record.patientId, requestedAt: previous?.requestedAt || record.date, status: !input.eligible ? "NOT_ELIGIBLE" : input.resultedAt ? "RESULTED" : input.performedAt ? "PERFORMED" : "REQUESTED", actorUsuarioId: context.user.id };
    return id ? tx.healthClinicalScreening.update({ where: { id }, data: values }) : tx.healthClinicalScreening.create({ data: values });
  });
}

export async function recordDentalMark(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, dentition: z.enum(["ADULT", "CHILD", "BOTH"]), targetType: z.enum(["TOOTH", "ARCH", "QUADRANT", "MOUTH", "SEXTANT"]), targetCode: z.string().min(1), surface: z.enum(["M", "D", "O", "V", "L", "I", "P"]).nullable(), condition: z.enum(["HEALTHY", "CARIES", "MISSING", "RESTORED", "EXTRACTION_INDICATED", "TREATMENT_PLANNED", "TREATED"]), procedureId: z.string().nullable(), performed: z.boolean(), notes: note }).strict().parse(raw);
  assertDentalTarget(input.dentition, input.targetType, input.targetCode);
  if (input.surface && input.targetType !== "TOOTH") throw new Error("Superfície somente se aplica à marcação por dente.");
  if (input.performed && !input.procedureId) throw new Error("Selecione o procedimento realizado.");
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.procedureId && !await tx.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true, isCurrent: true } })) throw new Error("Procedimento SIGTAP indisponível.");
    const procedure = input.performed && input.procedureId ? await tx.healthPerformedProcedure.create({ data: { medicalRecordId: record.id, procedureId: input.procedureId, professionalId: professional.id, quantity: 1, notes: `Odontologia · ${input.targetType}:${input.targetCode} · ${input.notes}` } }) : null;
    const { performed, ...data } = input;
    return tx.healthDentalMark.create({ data: { ...data, patientId: record.patientId, performedProcedureId: procedure?.id, performedAt: performed ? record.date : null, actorUsuarioId: context.user.id } });
  });
}

export async function scheduleTherapySessions(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, planId: z.string().min(1), specialtyKind: z.enum(["PHYSIOTHERAPY", "PSYCHOLOGY"]), dates: z.array(z.coerce.date()).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.dates.map(date => date.valueOf())).size !== input.dates.length) throw new Error("Não repita o horário das sessões.");
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.$queryRaw`SELECT id FROM "SpecializedTherapeuticPlan" WHERE id=${input.planId} FOR UPDATE`;
    const plan = await tx.specializedTherapeuticPlan.findUniqueOrThrow({ where: { id: input.planId }, include: { sessions: true } });
    const teamMember = await tx.healthProfessional.count({ where: { id: professional.id, teamId: plan.teamId } });
    if (plan.patientId !== record.patientId || plan.unitId !== record.unitId || plan.status !== "ACTIVE" || !teamMember) throw new Error("Plano ativo deste paciente, unidade e equipe é obrigatório.");
    if (plan.sessions.filter(session => session.status !== "CANCELLED").length + input.dates.length > plan.plannedConsultations) throw new Error("As sessões ultrapassam a quantidade prevista no plano.");
    if (input.dates.some(date => plan.sessions.some(session => session.status !== "CANCELLED" && session.scheduledAt.valueOf() === date.valueOf()))) throw new Error("Já existe sessão neste horário no plano.");
    const start = Math.max(0, ...plan.sessions.map(session => session.sessionNumber));
    return tx.healthTherapySession.createMany({ data: input.dates.map((date, index) => ({ planId: plan.id, sessionNumber: start + index + 1, specialtyKind: input.specialtyKind, scheduledAt: date, professionalId: professional.id, actorUsuarioId: context.user.id })) });
  });
}

export async function transitionTherapySession(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, sessionId: z.string().min(1), status: z.enum(["COMPLETED", "ABSENT", "CANCELLED"]), evolution: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.$queryRaw`SELECT id FROM "HealthTherapySession" WHERE id=${input.sessionId} FOR UPDATE`;
    const session = await tx.healthTherapySession.findUniqueOrThrow({ where: { id: input.sessionId }, include: { plan: true } });
    if (session.plan.patientId !== record.patientId || session.plan.unitId !== record.unitId || session.professionalId !== professional.id || session.plan.status !== "ACTIVE") throw new Error("Sessão incompatível com paciente, unidade ou profissional.");
    if (session.status !== "SCHEDULED") { if (session.status === input.status && session.medicalRecordId === record.id) return session; throw new Error("A sessão já possui desfecho."); }
    if (input.status === "COMPLETED" && session.scheduledAt > new Date()) throw new Error("Sessão futura não pode ser concluída.");
    if (input.status === "COMPLETED") {
      await tx.specializedPlanEntry.create({ data: { planId: session.planId, professionalId: professional.id, medicalRecordId: record.id, kind: "EVOLUTION", content: input.evolution } });
      await tx.specializedTherapeuticPlan.update({ where: { id: session.planId }, data: { completedConsultations: { increment: 1 } } });
    }
    return tx.healthTherapySession.update({ where: { id: session.id }, data: { status: input.status, evolution: input.evolution, medicalRecordId: record.id, performedAt: input.status === "COMPLETED" ? record.date : null } });
  });
}
