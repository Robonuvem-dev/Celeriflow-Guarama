import { z } from "zod";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { healthPregnancies, healthPregnancyVisits, healthPostpartumVisits, healthChronicAssessments, healthClinicalScreenings, healthDentalMarks, healthTherapySessions, specializedTherapeuticPlans, specializedPlanEntries } from "@/db/schema/health-care-lines";
import { healthPatientConditions, healthPatientConditionRevisions, healthExamRequests, healthPerformedProcedures } from "@/db/schema/health-care";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import type { AppContext } from "@/lib/platform/tenant-context";
import { runHealthTransaction } from "./health-transaction";
import { clinicalRecordForActor } from "./clinical-extension-service";
import { assertDentalTarget, pregnancyDating } from "./care-lines-policy";

const origin = { medicalRecordId: z.string().min(1) };
const nullableDate = z.coerce.date().nullable();
const note = z.string().trim().min(1).max(10000);

export async function openPregnancy(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, lastMenstrualDate: nullableDate, ultrasoundDate: nullableDate, ultrasoundGestationalDays: z.number().int().min(0).max(315).nullable(), calculationMethod: z.enum(["LMP", "ULTRASOUND"]), baselineWeight: z.number().positive().max(700), height: z.number().positive().max(3), pregnancyType: z.enum(["SINGLE", "MULTIPLE"]), previousPregnancies: z.number().int().min(0).max(50), lastScreeningDate: nullableDate }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "Patient" WHERE id=${record.patientId} FOR UPDATE`);
    if ((await tx.select({ id: healthPregnancies.id }).from(healthPregnancies).where(and(eq(healthPregnancies.patientId, record.patientId), eq(healthPregnancies.status, "ACTIVE"))).limit(1)).length) throw new Error("O paciente já possui uma gestação ativa.");
    const dating = pregnancyDating(input, record.date);
    const { medicalRecordId, ...data } = input;
    const [pregnancy] = await tx.insert(healthPregnancies).values({ ...data, openedMedicalRecordId: medicalRecordId, patientId: record.patientId, unitId: record.unitId, estimatedDeliveryDate: dating.estimatedDeliveryDate, createdByUsuarioId: context.user.id }).returning();
    return pregnancy;
  });
}

export async function recordPrenatalVisit(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, pregnancyId: z.string().min(1), weight: z.number().positive().max(700), bloodPressure: z.string().trim().max(50).nullable(), notes: note }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "HealthPregnancy" WHERE id=${input.pregnancyId} FOR UPDATE`);
    const [pregnancy] = await tx.select().from(healthPregnancies).where(eq(healthPregnancies.id, input.pregnancyId)).limit(1);
    if (!pregnancy) throw new Error("Gestação não encontrada.");
    if (pregnancy.patientId !== record.patientId || pregnancy.status !== "ACTIVE") throw new Error("Selecione uma gestação ativa deste paciente.");
    const dating = pregnancyDating({ ...pregnancy, calculationMethod: z.enum(["LMP", "ULTRASOUND"]).parse(pregnancy.calculationMethod) }, record.date);
    const data = { ...input, occurredAt: record.date, gestationalDays: dating.gestationalDays, trimester: dating.trimester, bmi: Number((input.weight / pregnancy.height ** 2).toFixed(2)), professionalId: professional.id, actorUsuarioId: context.user.id };
    const [previous] = await tx.select({ id: healthPregnancyVisits.id }).from(healthPregnancyVisits).where(eq(healthPregnancyVisits.medicalRecordId, record.id)).limit(1);
    if (previous) throw new Error("Este atendimento já possui uma consulta pré-natal registrada.");
    const [visit] = await tx.insert(healthPregnancyVisits).values(data).returning();
    return visit;
  });
}

export async function closePregnancy(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, pregnancyId: z.string().min(1), outcome: z.enum(["DELIVERED", "MISCARRIAGE", "ADMINISTRATIVE"]), reason: note, gestationalDaysAtBirth: z.number().int().min(0).max(350).nullable(), deliveryType: z.string().trim().max(200).nullable(), deliveryLocation: z.string().trim().max(300).nullable(), deliveryDate: nullableDate, clinicalConditions: note }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "HealthPregnancy" WHERE id=${input.pregnancyId} FOR UPDATE`);
    const [pregnancy] = await tx.select().from(healthPregnancies).where(eq(healthPregnancies.id, input.pregnancyId)).limit(1);
    if (!pregnancy) throw new Error("Gestação não encontrada.");
    if (pregnancy.patientId !== record.patientId || pregnancy.status !== "ACTIVE") throw new Error("Gestação ativa não encontrada neste paciente.");
    if (input.outcome === "DELIVERED" && (input.gestationalDaysAtBirth === null || !input.deliveryType || !input.deliveryLocation || !input.deliveryDate)) throw new Error("Informe idade gestacional, data, tipo e local do parto.");
    if (input.deliveryDate && (input.deliveryDate > record.date || input.deliveryDate.valueOf() < pregnancy.estimatedDeliveryDate.valueOf() - 280 * 86400000)) throw new Error("Confira a data do parto em relação à gestação e à consulta.");
    if (input.outcome !== "ADMINISTRATIVE") await tx.insert(healthPostpartumVisits).values({ pregnancyId: pregnancy.id, medicalRecordId: record.id, occurredAt: record.date, outcome: input.outcome, gestationalDaysAtBirth: input.gestationalDaysAtBirth, deliveryType: input.deliveryType, deliveryLocation: input.deliveryLocation, deliveryDate: input.deliveryDate, clinicalConditions: input.clinicalConditions, actorUsuarioId: context.user.id });
    const [closed] = await tx.update(healthPregnancies).set({ status: input.outcome, closureReason: `${input.reason}\n${input.clinicalConditions}`, closedAt: record.date, closedByUsuarioId: context.user.id }).where(eq(healthPregnancies.id, pregnancy.id)).returning();
    return closed;
  });
}

export async function recordChronicAssessment(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, conditionKind: z.enum(["HYPERTENSION", "DIABETES"]), systolic: z.number().positive().max(400).nullable(), diastolic: z.number().positive().max(300).nullable(), glucose: z.number().positive().max(2000).nullable(), hba1c: z.number().positive().max(30).nullable(), riskFactors: z.array(z.string().trim().min(1)).max(100), complications: z.array(z.string().trim().min(1)).max(100), notes: note }).strict().parse(raw);
  if (input.conditionKind === "HYPERTENSION" && (input.systolic === null || input.diastolic === null || input.systolic <= input.diastolic)) throw new Error("Informe pressão sistólica e diastólica válidas.");
  if (input.conditionKind === "DIABETES" && input.glucose === null && input.hba1c === null) throw new Error("Informe glicemia ou hemoglobina glicada no acompanhamento.");
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const label = input.conditionKind === "HYPERTENSION" ? "Hipertensão" : "Diabetes";
    await tx.execute(sql`SELECT id FROM "Patient" WHERE id=${record.patientId} FOR UPDATE`);
    const [previous] = await tx.select().from(healthPatientConditions).where(and(eq(healthPatientConditions.patientId, record.patientId), eq(healthPatientConditions.kind, "CHRONIC"), isNull(healthPatientConditions.endedAt), or(eq(healthPatientConditions.chronicKind, input.conditionKind), and(isNull(healthPatientConditions.chronicKind), eq(healthPatientConditions.label, label))))).orderBy(asc(healthPatientConditions.createdAt)).limit(1);
    if (!previous) await tx.insert(healthPatientConditions).values({ patientId: record.patientId, medicalRecordId: record.id, professionalId: professional.id, kind: "CHRONIC", chronicKind: input.conditionKind, label, startedAt: record.date, narrative: input.notes, actorUsuarioId: context.user.id });
    else if (!previous.chronicKind) {
      const [after] = await tx.update(healthPatientConditions).set({ chronicKind: input.conditionKind }).where(eq(healthPatientConditions.id, previous.id)).returning();
      await tx.insert(healthPatientConditionRevisions).values({ conditionId: previous.id, medicalRecordId: record.id, actorUsuarioId: context.user.id, before: JSON.parse(JSON.stringify(previous)), after: JSON.parse(JSON.stringify(after)) });
    }
    const [assessment] = await tx.insert(healthChronicAssessments).values({ ...input, patientId: record.patientId, assessedAt: record.date, actorUsuarioId: context.user.id }).returning({ id: healthChronicAssessments.id });
    return assessment;
  });
}

export async function saveClinicalScreening(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, id: z.string().min(1).nullable(), kind: z.enum(["CYTOLOGY", "MAMMOGRAPHY"]), eligible: z.boolean(), eligibilityReason: note, performedAt: nullableDate, resultedAt: nullableDate, result: z.string().trim().max(10000).nullable(), examRequestId: z.string().nullable(), followupNotes: note }).strict().parse(raw);
  if (input.resultedAt && (!input.performedAt || input.resultedAt < input.performedAt || !input.result)) throw new Error("Resultado exige realização anterior e descrição.");
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.performedAt && input.performedAt > new Date() || input.resultedAt && input.resultedAt > new Date()) throw new Error("Realização e resultado não podem estar no futuro.");
    const previous = input.id ? (await tx.select().from(healthClinicalScreenings).where(and(eq(healthClinicalScreenings.id, input.id), eq(healthClinicalScreenings.patientId, record.patientId), eq(healthClinicalScreenings.kind, input.kind))).limit(1))[0] : null;
    if (input.id && !previous) throw new Error("Rastreamento não pertence ao paciente.");
    if (input.examRequestId && !(await tx.select({ id: healthExamRequests.id }).from(healthExamRequests).where(and(eq(healthExamRequests.id, input.examRequestId), eq(healthExamRequests.patientId, record.patientId))).limit(1)).length) throw new Error("Exame de outro paciente.");
    const { id, ...data } = input;
    const values = { ...data, patientId: record.patientId, requestedAt: previous?.requestedAt || record.date, status: !input.eligible ? "NOT_ELIGIBLE" : input.resultedAt ? "RESULTED" : input.performedAt ? "PERFORMED" : "REQUESTED", actorUsuarioId: context.user.id };
    const [screening] = id ? await tx.update(healthClinicalScreenings).set(values).where(eq(healthClinicalScreenings.id, id)).returning() : await tx.insert(healthClinicalScreenings).values(values).returning();
    return screening;
  });
}

export async function recordDentalMark(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, dentition: z.enum(["ADULT", "CHILD", "BOTH"]), targetType: z.enum(["TOOTH", "ARCH", "QUADRANT", "MOUTH", "SEXTANT"]), targetCode: z.string().min(1), surface: z.enum(["M", "D", "O", "V", "L", "I", "P"]).nullable(), condition: z.enum(["HEALTHY", "CARIES", "MISSING", "RESTORED", "EXTRACTION_INDICATED", "TREATMENT_PLANNED", "TREATED"]), procedureId: z.string().nullable(), performed: z.boolean(), notes: note }).strict().parse(raw);
  assertDentalTarget(input.dentition, input.targetType, input.targetCode);
  if (input.surface && input.targetType !== "TOOTH") throw new Error("Superfície somente se aplica à marcação por dente.");
  if (input.performed && !input.procedureId) throw new Error("Selecione o procedimento realizado.");
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    if (input.procedureId && !(await tx.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1)).length) throw new Error("Procedimento SIGTAP indisponível.");
    const procedure = input.performed && input.procedureId ? (await tx.insert(healthPerformedProcedures).values({ medicalRecordId: record.id, procedureId: input.procedureId, professionalId: professional.id, quantity: 1, notes: `Odontologia · ${input.targetType}:${input.targetCode} · ${input.notes}` }).returning({ id: healthPerformedProcedures.id }))[0] : null;
    const { performed, ...data } = input;
    const [mark] = await tx.insert(healthDentalMarks).values({ ...data, patientId: record.patientId, performedProcedureId: procedure?.id, performedAt: performed ? record.date : null, actorUsuarioId: context.user.id }).returning();
    return mark;
  });
}

export async function scheduleTherapySessions(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, planId: z.string().min(1), specialtyKind: z.enum(["PHYSIOTHERAPY", "PSYCHOLOGY"]), dates: z.array(z.coerce.date()).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.dates.map(date => date.valueOf())).size !== input.dates.length) throw new Error("Não repita o horário das sessões.");
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "SpecializedTherapeuticPlan" WHERE id=${input.planId} FOR UPDATE`);
    const [planRow] = await tx.select().from(specializedTherapeuticPlans).where(eq(specializedTherapeuticPlans.id, input.planId)).limit(1);
    if (!planRow) throw new Error("Plano terapêutico não encontrado.");
    const sessions = await tx.select().from(healthTherapySessions).where(eq(healthTherapySessions.planId, planRow.id));
    const plan = { ...planRow, sessions };
    const teamMember = (await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.id, professional.id), eq(healthProfessionals.teamId, plan.teamId))).limit(1)).length;
    if (plan.patientId !== record.patientId || plan.unitId !== record.unitId || plan.status !== "ACTIVE" || !teamMember) throw new Error("Plano ativo deste paciente, unidade e equipe é obrigatório.");
    if (plan.sessions.filter(session => session.status !== "CANCELLED").length + input.dates.length > plan.plannedConsultations) throw new Error("As sessões ultrapassam a quantidade prevista no plano.");
    if (input.dates.some(date => plan.sessions.some(session => session.status !== "CANCELLED" && session.scheduledAt.valueOf() === date.valueOf()))) throw new Error("Já existe sessão neste horário no plano.");
    const start = Math.max(0, ...plan.sessions.map(session => session.sessionNumber));
    const created = await tx.insert(healthTherapySessions).values(input.dates.map((date, index) => ({ planId: plan.id, sessionNumber: start + index + 1, specialtyKind: input.specialtyKind, scheduledAt: date, professionalId: professional.id, actorUsuarioId: context.user.id }))).returning({ id: healthTherapySessions.id });
    return { count: created.length };
  });
}

export async function transitionTherapySession(context: AppContext, raw: unknown) {
  const input = z.object({ ...origin, sessionId: z.string().min(1), status: z.enum(["COMPLETED", "ABSENT", "CANCELLED"]), evolution: note }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record, professional } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "HealthTherapySession" WHERE id=${input.sessionId} FOR UPDATE`);
    const [row] = await tx.select({ session: healthTherapySessions, plan: specializedTherapeuticPlans }).from(healthTherapySessions).innerJoin(specializedTherapeuticPlans, eq(specializedTherapeuticPlans.id, healthTherapySessions.planId)).where(eq(healthTherapySessions.id, input.sessionId)).limit(1);
    if (!row) throw new Error("Sessão não encontrada.");
    const session = { ...row.session, plan: row.plan };
    if (session.plan.patientId !== record.patientId || session.plan.unitId !== record.unitId || session.professionalId !== professional.id || session.plan.status !== "ACTIVE") throw new Error("Sessão incompatível com paciente, unidade ou profissional.");
    if (session.status !== "SCHEDULED") { if (session.status === input.status && session.medicalRecordId === record.id) return session; throw new Error("A sessão já possui desfecho."); }
    if (input.status === "COMPLETED" && session.scheduledAt > new Date()) throw new Error("Sessão futura não pode ser concluída.");
    if (input.status === "COMPLETED") {
      await tx.insert(specializedPlanEntries).values({ planId: session.planId, professionalId: professional.id, medicalRecordId: record.id, kind: "EVOLUTION", content: input.evolution });
      await tx.update(specializedTherapeuticPlans).set({ completedConsultations: sql`${specializedTherapeuticPlans.completedConsultations} + 1` }).where(eq(specializedTherapeuticPlans.id, session.planId));
    }
    const [updated] = await tx.update(healthTherapySessions).set({ status: input.status, evolution: input.evolution, medicalRecordId: record.id, performedAt: input.status === "COMPLETED" ? record.date : null }).where(eq(healthTherapySessions.id, session.id)).returning();
    return updated;
  });
}
