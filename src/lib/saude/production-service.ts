import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthDatabaseConnection } from "./health-transaction";
import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { institutions, employees } from "@/db/schema/administration";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { healthAppointments } from "@/db/schema/health-agenda";
import { medicalRecords, healthDiagnoses, healthExamRequests, healthReferrals, healthPerformedProcedures } from "@/db/schema/health-care";
import { healthSusProcedures, healthSusReferences, healthSusProcedureReferences } from "@/db/schema/health-catalogs";
import { healthLabOrders, healthLabExamModels, healthLabResults } from "@/db/schema/health-laboratory";
import { healthProductionFacts, healthProductionCompetences, healthProductionFactRevisions, healthProductionTargets, healthUnitCeilings, healthProductionCriticisms, healthSusFiles } from "@/db/schema/health-production";
import { healthRegulationRequests, healthRegulationQuotas } from "@/db/schema/health-regulation";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthTimestamp } from "@/db/repositories/health/timestamp";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { appointmentBillingContextSchema, resolveHealthProcedurePrice } from "./billing-price-service";

export class ProductionError extends Error {}

const periodOf = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe competência válida no formato AAAA-MM.");
function productionTransaction<T>(context: AppContext, operation: (tx: DatabaseTransaction) => Promise<T>, timeoutMs = 30_000) {
  return withDatabaseTransaction(healthDatabaseConnection(context), operation, { timeoutMs });
}
async function lockProductionPeriod(tx: DatabaseTransaction, period: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PRODUCTION_PERIOD:${period}`}))`);
}
async function assertGlobalProductionScope(tx: DatabaseExecutor, context: AppContext) {
  if (context.user.hasHealthAccessScope && (await tx.select({ id: healthUnits.id }).from(healthUnits).where(notInArray(healthUnits.id, context.user.allowedHealthUnitIds || [])).limit(1)).length) throw new ProductionError("Processamento e fechamento da competência global exigem acesso a todas as unidades de Saúde.");
}

export async function registerProductionFactTx(tx: DatabaseTransaction, input: Omit<typeof healthProductionFacts.$inferInsert, "period" | "competenceId"> & { period?: string }, billingContext?: unknown) {
  const period = periodSchema.parse(input.period || periodOf(input.occurredAt));
  if (!Number.isInteger(input.quantity ?? 1) || (input.quantity ?? 1) <= 0) throw new ProductionError("Quantidade de produção inválida.");
  await lockProductionPeriod(tx, period);
  const [existing] = await tx.select({ id: healthProductionFacts.id, originType: healthProductionFacts.originType, originId: healthProductionFacts.originId }).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) {
    if (existing.originType !== input.originType || existing.originId !== input.originId) throw new ProductionError("Chave de produção já utilizada por outra origem.");
    return { id: existing.id, created: false };
  }
  const [competence] = await tx.select({ id: healthProductionCompetences.id, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.period, period)).limit(1);
  if (competence?.status === "FECHADA") throw new ProductionError(`Competência ${period} fechada: produção retroativa bloqueada.`);
  const billing = appointmentBillingContextSchema.safeParse(billingContext);
  const context = billing.success ? billing.data : null;
  const price = input.value === undefined && input.unitId && input.procedureId ? await resolveHealthProcedurePrice(tx, { unitId: context?.providerUnit?.id || input.unitId, procedureId: input.procedureId, occurredAt: input.occurredAt, quantity: input.quantity ?? 1, agreementId: context?.agreementId, billingContext: context }) : null;
  const [result] = await tx.insert(healthProductionFacts).values({ ...input, value: input.value ?? price?.totalValue ?? null, pricingSnapshot: input.pricingSnapshot ?? price?.snapshot, period, competenceId: competence?.id || null }).returning({ id: healthProductionFacts.id });
  if (competence) await tx.update(healthProductionCompetences).set({ status: "ABERTA", processedAt: null }).where(eq(healthProductionCompetences.id, competence.id));
  return { id: result.id, created: true };
}

export async function ensureCompetence(context: AppContext, period: string) {
  periodSchema.parse(period);
  return productionTransaction(context, async tx => {
    await lockProductionPeriod(tx, period);
    const [existing] = await tx.select({ id: healthProductionCompetences.id }).from(healthProductionCompetences).where(eq(healthProductionCompetences.period, period)).limit(1);
    if (existing) return existing;
    const [competence] = await tx.insert(healthProductionCompetences).values({ period, createdByUsuarioId: context.user.id }).returning({ id: healthProductionCompetences.id });
    return competence;
  });
}

type Candidate = {
  originType: string;
  originId: string;
  patientId?: string | null;
  unitId?: string | null;
  professionalId?: string | null;
  procedureId?: string | null;
  cidReferenceId?: string | null;
  municipality?: string | null;
  state?: string | null;
  quantity: number;
  value?: Decimal | null;
  occurredAt: Date;
  pricingSnapshot?: JsonObject;
};

type ClinicalContext = { cidReferenceId: string | null; municipality: string | null; state: string | null; billingContext: z.infer<typeof appointmentBillingContextSchema> | null };

// CID e município/UF vêm do prontuário de origem quando determinável com
// segurança (diagnóstico principal + snapshot do agendamento). Sem origem
// clínica, mantém nulo em vez de inventar.
type ClinicalReader = DatabaseExecutor;

async function clinicalContextForRecord(tx: ClinicalReader, medicalRecordId: string | null): Promise<ClinicalContext> {
  const empty = { cidReferenceId: null, municipality: null, state: null, billingContext: null };
  if (!medicalRecordId) return empty;
  const [record] = await tx.select({ appointment: { id: healthAppointments.id, municipalitySnapshot: healthAppointments.municipalitySnapshot, stateSnapshot: healthAppointments.stateSnapshot, billingContextSnapshot: healthAppointments.billingContextSnapshot } }).from(medicalRecords).leftJoin(healthAppointments, eq(healthAppointments.id, medicalRecords.appointmentId)).where(eq(medicalRecords.id, medicalRecordId)).limit(1);
  if (!record) return empty;
  const [diagnosis] = await tx.select({ cidReferenceId: healthDiagnoses.cidReferenceId }).from(healthDiagnoses).where(eq(healthDiagnoses.medicalRecordId, medicalRecordId)).orderBy(desc(healthDiagnoses.isPrimary), asc(healthDiagnoses.id)).limit(1);
  const billing = appointmentBillingContextSchema.safeParse(record.appointment?.billingContextSnapshot);
  return {
    cidReferenceId: diagnosis?.cidReferenceId || null,
    municipality: record.appointment?.municipalitySnapshot || null,
    state: record.appointment?.stateSnapshot || null,
    billingContext: billing.success ? billing.data : null,
  };
}

async function clinicalContextForRegulation(tx: ClinicalReader, requestId: string): Promise<{ medicalRecordId: string | null } & ClinicalContext> {
  const [request] = await tx.select({ referralRecordId: healthReferrals.medicalRecordId, examRecordId: healthExamRequests.medicalRecordId }).from(healthRegulationRequests).leftJoin(healthReferrals, eq(healthReferrals.id, healthRegulationRequests.referralId)).leftJoin(healthExamRequests, eq(healthExamRequests.id, healthRegulationRequests.examRequestId)).where(eq(healthRegulationRequests.id, requestId)).limit(1);
  const medicalRecordId = request?.referralRecordId || request?.examRecordId || null;
  return { medicalRecordId, ...(await clinicalContextForRecord(tx, medicalRecordId)) };
}

export async function captureFacts(context: AppContext, period?: string | null) {
  if (period) periodSchema.parse(period);
  const database = context.database ?? db;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const candidates: Candidate[] = [];
  const clinicalRecords = new Map<string, ClinicalContext>();
  const prices = new Map<string, Awaited<ReturnType<typeof resolveHealthProcedurePrice>>>();
  const priceFor = async (input: Parameters<typeof resolveHealthProcedurePrice>[1]) => {
    const key = JSON.stringify({ ...input, occurredAt: input.occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) });
    const existing = prices.get(key); if (existing) return existing;
    const result = await resolveHealthProcedurePrice(database, input); prices.set(key, result); return result;
  };
  const inPeriod = period ? { gte: new Date(`${period}-01T00:00:00-03:00`), lt: new Date(`${nextMonth(period)}T00:00:00-03:00`) } : undefined;
  // PEP: procedimentos realizados (somente atendimento concluído conta como realizado)
  const performedRows = await database.select({ performed: healthPerformedProcedures, medicalRecord: { patientId: medicalRecords.patientId, unitId: medicalRecords.unitId, completedAt: medicalRecords.completedAt } }).from(healthPerformedProcedures).innerJoin(medicalRecords, eq(medicalRecords.id, healthPerformedProcedures.medicalRecordId)).where(and(isNotNull(medicalRecords.completedAt), unitIds ? inArray(medicalRecords.unitId, unitIds) : undefined, inPeriod ? and(gte(healthPerformedProcedures.performedAt, inPeriod.gte), lt(healthPerformedProcedures.performedAt, inPeriod.lt)) : undefined));
  const performed = performedRows.map(row => ({ ...row.performed, medicalRecord: row.medicalRecord }));
  for (const p of performed) {
    if (!p.medicalRecord.completedAt) continue;
    let clinical = clinicalRecords.get(p.medicalRecordId);
    if (!clinical) { clinical = await clinicalContextForRecord(database, p.medicalRecordId); clinicalRecords.set(p.medicalRecordId, clinical); }
    const price = await priceFor({ unitId: clinical.billingContext?.providerUnit?.id || p.medicalRecord.unitId, procedureId: p.procedureId, occurredAt: p.performedAt, quantity: p.quantity, agreementId: clinical.billingContext?.agreementId, billingContext: clinical.billingContext });
    candidates.push({ originType: "PEP_PROCEDURE", originId: p.id, patientId: p.medicalRecord.patientId, unitId: p.medicalRecord.unitId, professionalId: p.professionalId, procedureId: p.procedureId, cidReferenceId: clinical.cidReferenceId, municipality: clinical.municipality, state: clinical.state, quantity: p.quantity, value: price.totalValue, pricingSnapshot: price.snapshot, occurredAt: p.performedAt });
  }
  // Laboratório: ordens com resultado final (fato realizado = laudo final)
  const labRows = await database.select({ order: healthLabOrders, examModel: { procedureId: healthLabExamModels.procedureId }, result: { id: healthLabResults.id, enteredAt: healthLabResults.enteredAt } }).from(healthLabOrders).leftJoin(healthLabExamModels, eq(healthLabExamModels.id, healthLabOrders.examModelId)).innerJoin(healthLabResults, and(eq(healthLabResults.orderId, healthLabOrders.id), eq(healthLabResults.status, "FINAL"), sql`${healthLabResults.version} = (SELECT MAX(r.version) FROM "HealthLabResult" r WHERE r."orderId"=${healthLabOrders.id} AND r.status='FINAL')`)).where(and(unitIds ? inArray(healthLabOrders.collectionUnitId, unitIds) : undefined, inPeriod ? and(gte(healthLabResults.enteredAt, inPeriod.gte), lt(healthLabResults.enteredAt, inPeriod.lt)) : undefined));
  const labOrders = labRows.map(row => ({ ...row.order, examModel: row.examModel, results: [row.result] }));
  for (const o of labOrders) {
    const r = o.results[0];
    if (!r) continue;
    if (inPeriod && (r.enteredAt < inPeriod.gte || r.enteredAt >= inPeriod.lt)) continue;
    const price = o.collectionUnitId && o.examModel?.procedureId ? await priceFor({ unitId: o.collectionUnitId, procedureId: o.examModel.procedureId, occurredAt: r.enteredAt, quantity: 1 }) : null;
    candidates.push({ originType: "LAB_RESULT", originId: r.id, patientId: o.patientId, unitId: o.collectionUnitId, professionalId: o.collectorProfessionalId, procedureId: o.examModel?.procedureId || null, quantity: 1, value: price?.totalValue ?? null, pricingSnapshot: price?.snapshot, occurredAt: r.enteredAt });
  }
  // Vacinação: aplicações (fato realizado por definição)
  const vaccinations = (await database.execute<{ id: string; date: string; patientId: string; unitId: string; professionalId: string | null }>(sql`SELECT id, date, "patientId", "unitId", "professionalId" FROM "VaccinationRecord" WHERE ${and(unitIds ? inArray(sql`"unitId"`, unitIds) : undefined, inPeriod ? sql`date>=${inPeriod.gte} AND date<${inPeriod.lt}` : undefined) ?? sql`true`}`)).rows;
  for (const v of vaccinations) {
    candidates.push({ originType: "VACCINATION", originId: v.id, patientId: v.patientId, unitId: v.unitId, professionalId: v.professionalId, procedureId: null, quantity: 1, occurredAt: healthTimestamp(v.date) });
  }
  // Regulação: solicitações executadas/concluídas
  const regulationRows = await database.select({ request: healthRegulationRequests, quota: { id: healthRegulationQuotas.id, unitValue: healthRegulationQuotas.unitValue, providerSupplierId: healthRegulationQuotas.providerSupplierId } }).from(healthRegulationRequests).leftJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).where(and(inArray(healthRegulationRequests.status, ["EXECUTADA", "CONCLUIDA"]), unitIds ? inArray(healthRegulationRequests.requestUnitId, unitIds) : undefined, inPeriod ? and(gte(healthRegulationRequests.executedAt, inPeriod.gte), lt(healthRegulationRequests.executedAt, inPeriod.lt)) : undefined));
  const regs = regulationRows.map(row => ({ ...row.request, quota: row.quota }));
  for (const r of regs) {
    if (!r.executedAt) continue;
    const clinical = await clinicalContextForRegulation(database, r.id);
    const price = r.requestUnitId && r.procedureId ? await priceFor({ unitId: r.requestUnitId, procedureId: r.procedureId, occurredAt: r.executedAt, quantity: 1 }) : null;
    const quotaPrice = r.quota?.unitValue;
    candidates.push({ originType: "REGULATION", originId: r.id, patientId: r.patientId, unitId: r.requestUnitId, professionalId: r.professionalId, procedureId: r.procedureId, cidReferenceId: clinical.cidReferenceId, municipality: clinical.municipality, state: clinical.state, quantity: 1, value: quotaPrice ?? price?.totalValue ?? null, pricingSnapshot: r.quota && quotaPrice !== null && quotaPrice !== undefined ? { source: "REGULATION_QUOTA", quotaId: r.quota.id, providerSupplierId: r.quota.providerSupplierId, totalValue: quotaPrice.toFixed(2) } : price?.snapshot, occurredAt: r.executedAt });
  }
  let created = 0;
  let blocked = 0;
  const grouped = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const p = periodOf(c.occurredAt);
    if (period && p !== period) continue;
    const group = grouped.get(p) || []; group.push(c); grouped.set(p, group);
  }
  for (const [p, group] of grouped) {
    const result = await productionTransaction(context, async tx => {
      await lockProductionPeriod(tx, p);
      const [competence] = await tx.select({ id: healthProductionCompetences.id, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.period, p)).limit(1);
      if (competence?.status === "FECHADA") return { created: 0, blocked: group.length };
      let count = 0;
      for (let offset = 0; offset < group.length; offset += 1000) {
        const batch = group.slice(offset, offset + 1000).map(c => ({ competenceId: competence?.id || null, originType: c.originType, originId: c.originId, patientId: c.patientId || null, unitId: c.unitId || null, professionalId: c.professionalId || null, procedureId: c.procedureId || null, cidReferenceId: c.cidReferenceId || null, municipality: c.municipality || null, state: c.state || null, quantity: c.quantity, value: c.value ?? null, pricingSnapshot: c.pricingSnapshot, occurredAt: c.occurredAt, period: p, idempotencyKey: `${c.originType}:${c.originId}` }));
        count += (await tx.insert(healthProductionFacts).values(batch).onConflictDoNothing().returning({ id: healthProductionFacts.id })).length;
      }
      if (competence && count > 0) await tx.update(healthProductionCompetences).set({ status: "ABERTA", processedAt: null }).where(eq(healthProductionCompetences.id, competence.id));
      return { created: count, blocked: 0 };
    }, 120000);
    created += result.created; blocked += result.blocked;
  }
  return { candidates: candidates.length, created, blocked };
}

const manualFactSchema = z.object({
  procedureId: z.string().min(1),
  unitId: z.string().min(1),
  professionalId: z.string().min(1).nullable().optional(),
  patientId: z.string().min(1).nullable().optional(),
  agreementId: z.string().min(1).nullable().optional(),
  quantity: z.number().int().positive().max(9999),
  value: z.number().finite().nonnegative().refine(value => Number(value.toFixed(2)) === value, "Informe o valor em centavos, com até duas casas decimais.").nullable().optional(),
  occurredAt: z.iso.date(),
  idempotencyKey: z.string().min(1).max(120).nullable().optional(),
}).strict();

async function manualProductionPrice(tx: DatabaseExecutor, input: z.infer<typeof manualFactSchema>, occurredAt: Date, actorUsuarioId: string) {
  if (input.agreementId) {
    const on = new Date(`${occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00Z`);
    if (!(await tx.execute(sql`SELECT c.id FROM "HealthCareCoverage" c JOIN "HealthCareAgreement" a ON a.id=c."agreementId" WHERE c."agreementId"=${input.agreementId} AND c."unitId"=${input.unitId} AND c."procedureId"=${input.procedureId} AND c."isActive"=true AND c."validFrom"<=${on} AND (c."validUntil" IS NULL OR c."validUntil">=${on}) AND a."validFrom"<=${on} AND (a."validUntil" IS NULL OR a."validUntil">=${on}) LIMIT 1`)).rows.length) throw new ProductionError("Convênio sem cobertura vigente para o procedimento e unidade da produção manual.");
  }
  const pricing = input.value === null || input.value === undefined
    ? await resolveHealthProcedurePrice(tx, { unitId: input.unitId, procedureId: input.procedureId, quantity: input.quantity, occurredAt, agreementId: input.agreementId })
    : { totalValue: new Decimal(input.value), snapshot: { source: "MANUAL_VALUE", procedureId: input.procedureId, quantity: input.quantity, totalValue: input.value.toFixed(2) } };
  return { value: pricing.totalValue, snapshot: { ...pricing.snapshot, manualInput: { value: input.value ?? null, agreementId: input.agreementId || null }, actorUsuarioId } };
}

// Digitação manual (ROA/BAU/consolidado): fato avulso com trava de
// competência fechada. Retroativo permitido somente em competência aberta.
export async function captureManualFact(context: AppContext, raw: unknown) {
  const result = await captureManualFactWithResult(context, raw);
  return { id: result.id };
}

async function captureManualFactWithResult(context: AppContext, raw: unknown) {
  const input = manualFactSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const database = context.database ?? db;
  const [procedure] = await database.select({ id: healthSusProcedures.id, unitValue: healthSusProcedures.unitValue }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1);
  if (!procedure) throw new ProductionError("Procedimento SUS ativo não encontrado.");
  if (!(await database.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1)).length) throw new ProductionError("Unidade ativa não encontrada.");
  const occurredAt = new Date(`${input.occurredAt}T12:00:00-03:00`);
  const p = periodOf(occurredAt);
  const key = `MANUAL:${input.idempotencyKey || randomUUID()}`;
  return productionTransaction(context, async tx => {
    await lockProductionPeriod(tx, p);
    const [competence] = await tx.select({ id: healthProductionCompetences.id, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.period, p)).limit(1);
    const [exists] = await tx.select().from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey, key)).limit(1);
    if (exists) {
      if (exists.unitId) assertHealthUnitAccess(context.user, exists.unitId);
      const previousInput = z.object({ manualInput: z.object({ value: z.number().nullable(), agreementId: z.string().nullable() }) }).safeParse(exists.pricingSnapshot);
      if (exists.originType !== "MANUAL" || exists.patientId !== (input.patientId || null) || exists.unitId !== input.unitId || exists.professionalId !== (input.professionalId || null) || exists.procedureId !== procedure.id || exists.quantity !== input.quantity || exists.occurredAt.valueOf() !== occurredAt.valueOf() || (input.value != null && (exists.value === null || !exists.value.eq(input.value))) || (previousInput.success && (previousInput.data.manualInput.value !== (input.value ?? null) || previousInput.data.manualInput.agreementId !== (input.agreementId || null)))) throw new ProductionError("Chave de digitação já utilizada com outros dados.");
      return { id: exists.id, created: false };
    }
    if (competence?.status === "FECHADA") throw new ProductionError(`Competência ${p} fechada: digitação retroativa bloqueada.`);
    if (input.patientId && !(await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, input.patientId)).limit(1)).length) throw new ProductionError("Paciente não encontrado.");
    if (input.professionalId && !(await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.id, input.professionalId), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1)).length) throw new ProductionError("Profissional ativo não encontrado.");
    const pricing = await manualProductionPrice(tx, input, occurredAt, context.user.id);
    const [result] = await tx.insert(healthProductionFacts).values({ competenceId: competence?.id || null, originType: "MANUAL", originId: key, patientId: input.patientId || null, unitId: input.unitId, professionalId: input.professionalId || null, procedureId: procedure.id, quantity: input.quantity, value: pricing.value, pricingSnapshot: pricing.snapshot, occurredAt, period: p, idempotencyKey: key }).returning({ id: healthProductionFacts.id });
    if (competence) await tx.update(healthProductionCompetences).set({ status: "ABERTA", processedAt: null }).where(eq(healthProductionCompetences.id, competence.id));
    return { id: result.id, created: true };
  });
}

export async function reviseManualProductionFact(context: AppContext, raw: unknown) {
  const input = manualFactSchema.omit({ idempotencyKey: true }).extend({ factId: z.string().min(1), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(4000), cidReferenceId: z.string().min(1).nullable().default(null), municipality: z.string().trim().max(200).nullable().default(null), state: z.string().regex(/^[A-Z]{2}$/).nullable().default(null) }).parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const [initial] = await (context.database ?? db).select({ period: healthProductionFacts.period }).from(healthProductionFacts).where(eq(healthProductionFacts.id, input.factId)).limit(1);
  if (!initial) throw new ProductionError("Produção não encontrada.");
  const occurredAt = new Date(`${input.occurredAt}T12:00:00-03:00`), period = periodOf(occurredAt);
  return productionTransaction(context, async tx => {
    for (const p of [...new Set([initial.period, period])].sort()) await lockProductionPeriod(tx, p);
    const [before] = await tx.select().from(healthProductionFacts).where(eq(healthProductionFacts.id, input.factId)).limit(1);
    if (!before) throw new ProductionError("Produção não encontrada.");
    if (before.unitId) assertHealthUnitAccess(context.user, before.unitId);
    if (before.originType !== "MANUAL") throw new ProductionError("Corrija o atendimento ou registro de origem; somente produção manual pode ser editada aqui.");
    if (before.period !== initial.period || before.version !== input.expectedVersion) throw new ProductionError("Produção alterada por outra sessão. Atualize antes de salvar.");
    const competences = await tx.select({ id: healthProductionCompetences.id, period: healthProductionCompetences.period, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(inArray(healthProductionCompetences.period, [initial.period, period]));
    if (competences.some(competence => competence.status === "FECHADA")) throw new ProductionError("Reabra a competência antes de corrigir a produção.");
    const [procedure] = await tx.select({ unitValue: healthSusProcedures.unitValue }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true))).limit(1);
    if (!procedure || !(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1)).length) throw new ProductionError("Selecione unidade e procedimento ativos.");
    if (input.professionalId && !(await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.id, input.professionalId), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1)).length) throw new ProductionError("Profissional ativo não encontrado.");
    if (input.patientId && !(await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, input.patientId)).limit(1)).length) throw new ProductionError("Paciente não encontrado.");
    if (input.cidReferenceId && !(await tx.select({ id: healthSusReferences.id }).from(healthSusReferences).where(and(eq(healthSusReferences.id, input.cidReferenceId), eq(healthSusReferences.kind, "CID"))).limit(1)).length) throw new ProductionError("CID não encontrado no catálogo.");
    const previousPricing = z.object({ manualInput: z.object({ agreementId: z.string().nullable() }) }).safeParse(before.pricingSnapshot);
    const unchangedPricing = before.unitId === input.unitId && before.procedureId === input.procedureId && before.quantity === input.quantity && before.occurredAt.valueOf() === occurredAt.valueOf() && (before.value === null ? input.value == null : input.value != null && before.value.eq(input.value)) && (previousPricing.success ? previousPricing.data.manualInput.agreementId : null) === (input.agreementId || null);
    const pricing = unchangedPricing ? { value: before.value, snapshot: before.pricingSnapshot } : await manualProductionPrice(tx, input, occurredAt, context.user.id);
    const [after] = await tx.update(healthProductionFacts).set({ unitId: input.unitId, professionalId: input.professionalId || null, patientId: input.patientId || null, procedureId: input.procedureId, quantity: input.quantity, value: pricing.value, pricingSnapshot: pricing.snapshot, occurredAt, period, competenceId: competences.find(competence => competence.period === period)?.id || null, cidReferenceId: input.cidReferenceId, municipality: input.municipality, state: input.state, version: sql`${healthProductionFacts.version} + 1` }).where(eq(healthProductionFacts.id, before.id)).returning();
    await tx.insert(healthProductionFactRevisions).values({ factId: before.id, version: after.version, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)), reason: input.reason, actorUsuarioId: context.user.id });
    for (const competence of competences) await tx.update(healthProductionCompetences).set({ status: "ABERTA", processedAt: null }).where(eq(healthProductionCompetences.id, competence.id));
    return { id: after.id, version: after.version };
  });
}

export async function saveProductionTarget(context: AppContext, raw: unknown) {
  const input = z.object({ competenceId: z.string().min(1), procedureId: z.string().min(1), contractedQuantity: z.number().positive().max(999999) }).strict().parse(raw);
  return productionTransaction(context, async tx => {
    const [competence] = await tx.select().from(healthProductionCompetences).where(eq(healthProductionCompetences.id, input.competenceId)).limit(1);
    if (!competence) throw new ProductionError("Competência não encontrada.");
    await lockProductionPeriod(tx, competence.period);
    const [current] = await tx.select({ status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competence.id)).limit(1);
    if (current.status === "FECHADA") throw new ProductionError("Competência fechada.");
    const [target] = await tx.insert(healthProductionTargets).values({ competenceId: input.competenceId, procedureId: input.procedureId, contractedQuantity: input.contractedQuantity, createdByUsuarioId: context.user.id }).onConflictDoUpdate({ target: [healthProductionTargets.competenceId, healthProductionTargets.procedureId], set: { contractedQuantity: input.contractedQuantity } }).returning({ id: healthProductionTargets.id });
    return target;
  });
}

export async function saveUnitCeiling(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), period: z.string().regex(/^\d{4}-\d{2}$/), value: z.number().nonnegative().max(999999999) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const [ceiling] = await (context.database ?? db).insert(healthUnitCeilings).values({ unitId: input.unitId, period: input.period, value: new Decimal(input.value), createdByUsuarioId: context.user.id }).onConflictDoUpdate({ target: [healthUnitCeilings.unitId, healthUnitCeilings.period], set: { value: new Decimal(input.value) } }).returning({ id: healthUnitCeilings.id });
  return ceiling;
}

// Sincroniza campos nulos do fato com a origem (correção na origem +
// reprocesso reflete no fato). Nunca sobrescreve histórico já capturado.
async function syncFactFromOrigin(tx: DatabaseExecutor, fact: { id: string; originType: string; originId: string; procedureId: string | null; professionalId: string | null; unitId: string | null; patientId: string | null; cidReferenceId: string | null; municipality: string | null; state: string | null }) {
  const patch: { procedureId?: string; professionalId?: string; unitId?: string; patientId?: string; cidReferenceId?: string; municipality?: string; state?: string } = {};
  if (fact.originType === "PEP_PROCEDURE") {
    const [performed] = await tx.select({ procedureId: healthPerformedProcedures.procedureId, professionalId: healthPerformedProcedures.professionalId, medicalRecord: { patientId: medicalRecords.patientId, unitId: medicalRecords.unitId, id: medicalRecords.id } }).from(healthPerformedProcedures).innerJoin(medicalRecords, eq(medicalRecords.id, healthPerformedProcedures.medicalRecordId)).where(eq(healthPerformedProcedures.id, fact.originId)).limit(1);
    if (!performed) return;
    if (!fact.procedureId) patch.procedureId = performed.procedureId;
    if (!fact.professionalId) patch.professionalId = performed.professionalId;
    if (!fact.unitId) patch.unitId = performed.medicalRecord.unitId;
    if (!fact.patientId) patch.patientId = performed.medicalRecord.patientId;
    if (!fact.cidReferenceId || !fact.municipality) {
      const clinical = await clinicalContextForRecord(tx, performed.medicalRecord.id);
      if (!fact.cidReferenceId && clinical.cidReferenceId) patch.cidReferenceId = clinical.cidReferenceId;
      if (!fact.municipality && clinical.municipality) { patch.municipality = clinical.municipality; if (clinical.state) patch.state = clinical.state; }
    }
  } else if (fact.originType === "LAB_RESULT") {
    const [result] = await tx.select({ order: { patientId: healthLabOrders.patientId, collectionUnitId: healthLabOrders.collectionUnitId, collectorProfessionalId: healthLabOrders.collectorProfessionalId }, procedureId: healthLabExamModels.procedureId }).from(healthLabResults).innerJoin(healthLabOrders, eq(healthLabOrders.id, healthLabResults.orderId)).leftJoin(healthLabExamModels, eq(healthLabExamModels.id, healthLabOrders.examModelId)).where(eq(healthLabResults.id, fact.originId)).limit(1);
    if (!result) return;
    if (!fact.procedureId && result.procedureId) patch.procedureId = result.procedureId;
    if (!fact.professionalId && result.order.collectorProfessionalId) patch.professionalId = result.order.collectorProfessionalId;
    if (!fact.unitId && result.order.collectionUnitId) patch.unitId = result.order.collectionUnitId;
    if (!fact.patientId) patch.patientId = result.order.patientId;
  } else if (fact.originType === "REGULATION") {
    const [request] = await tx.select({ procedureId: healthRegulationRequests.procedureId, professionalId: healthRegulationRequests.professionalId, requestUnitId: healthRegulationRequests.requestUnitId, patientId: healthRegulationRequests.patientId }).from(healthRegulationRequests).where(eq(healthRegulationRequests.id, fact.originId)).limit(1);
    if (!request) return;
    if (!fact.procedureId && request.procedureId) patch.procedureId = request.procedureId;
    if (!fact.professionalId && request.professionalId) patch.professionalId = request.professionalId;
    if (!fact.unitId && request.requestUnitId) patch.unitId = request.requestUnitId;
    if (!fact.patientId) patch.patientId = request.patientId;
    if (!fact.cidReferenceId || !fact.municipality) {
      const clinical = await clinicalContextForRegulation(tx, fact.originId);
      if (!fact.cidReferenceId && clinical.cidReferenceId) patch.cidReferenceId = clinical.cidReferenceId;
      if (!fact.municipality && clinical.municipality) { patch.municipality = clinical.municipality; if (clinical.state) patch.state = clinical.state; }
    }
  } else {
    return;
  }
  if (Object.keys(patch).length) await tx.update(healthProductionFacts).set(patch).where(eq(healthProductionFacts.id, fact.id));
}

function nextMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

export async function processCompetence(context: AppContext, competenceId: string) {
  const [competence] = await (context.database ?? db).select({ id: healthProductionCompetences.id, period: healthProductionCompetences.period, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competenceId)).limit(1);
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (competence.status === "FECHADA") throw new ProductionError("Competência fechada. Reabra antes de reprocessar.");
  return productionTransaction(context, async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const [current] = await tx.select({ status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competenceId)).limit(1);
    if (!current) throw new ProductionError("Competência não encontrada.");
    if (current.status === "FECHADA") throw new ProductionError("Competência fechada. Reabra antes de reprocessar.");
    const facts = await tx.select().from(healthProductionFacts).where(eq(healthProductionFacts.period, competence.period));
    for (const f of facts) {
      if (f.unitId) assertHealthUnitAccess(context.user, f.unitId);
      await syncFactFromOrigin(tx, f);
      const [fresh] = await tx.select().from(healthProductionFacts).where(eq(healthProductionFacts.id, f.id)).limit(1);
      if (!fresh) continue;
      if (fresh.unitId) assertHealthUnitAccess(context.user, fresh.unitId);
      await tx.update(healthProductionFacts).set({ competenceId: competence.id }).where(eq(healthProductionFacts.id, f.id));
      await tx.update(healthProductionCriticisms).set({ status: "REPROCESSADA", resolvedAt: new Date() }).where(and(eq(healthProductionCriticisms.factId, f.id), eq(healthProductionCriticisms.status, "ABERTA")));
      const issues: Array<{ code: string; message: string; actionNeeded: string }> = [];
      // Vacinação (SI-PNI) e fichas e-SUS alimentam outros sistemas: não exigem procedimento BPA.
      if (!fresh.procedureId && ["PEP_PROCEDURE", "LAB_RESULT", "REGULATION"].includes(f.originType)) issues.push({ code: "SEM_PROCEDIMENTO", message: "Fato sem procedimento SUS vinculado.", actionNeeded: "Vincular procedimento SIGTAP na origem e reprocessar." });
      if (!fresh.professionalId) issues.push({ code: "SEM_PROFISSIONAL", message: "Fato sem profissional responsável.", actionNeeded: "Identificar o profissional executor na origem e reprocessar." });
      if (!fresh.unitId) issues.push({ code: "SEM_UNIDADE", message: "Fato sem unidade de realização.", actionNeeded: "Informar a unidade de realização na origem e reprocessar." });
      if (!Number.isInteger(fresh.quantity) || fresh.quantity <= 0) issues.push({ code: "QUANTIDADE_INVALIDA", message: "Quantidade inválida.", actionNeeded: "Corrigir a quantidade na origem e reprocessar." });
      // Consistências SUS a partir dos vínculos do procedimento (CBO, CID, idade, sexo).
      if (fresh.procedureId) {
        const [procedureRows, professionalRows, patientRows, referenceLinks] = await Promise.all([
          tx.select({ minimumAge: healthSusProcedures.minimumAge, maximumAge: healthSusProcedures.maximumAge, allowedSex: healthSusProcedures.allowedSex }).from(healthSusProcedures).where(eq(healthSusProcedures.id, fresh.procedureId)).limit(1),
          fresh.professionalId ? tx.select({ cbo: healthProfessionals.cbo }).from(healthProfessionals).where(eq(healthProfessionals.id, fresh.professionalId)).limit(1) : [],
          fresh.patientId ? tx.select({ person: { gender: people.gender, birthDate: people.birthDate } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(eq(patients.id, fresh.patientId)).limit(1) : [],
          tx.select({ relationType: healthSusProcedureReferences.relationType, code: healthSusReferences.code }).from(healthSusProcedureReferences).innerJoin(healthSusReferences, eq(healthSusReferences.id, healthSusProcedureReferences.referenceId)).where(eq(healthSusProcedureReferences.procedureId, fresh.procedureId)),
        ]);
        const procedure = procedureRows[0], professional = professionalRows[0], patient = patientRows[0];
        if (procedure) {
          const cbos = referenceLinks.filter(l => l.relationType === "CBO").map(l => l.code);
          if (cbos.length && !professional?.cbo) issues.push({ code: "SEM_CBO", message: "Procedimento exige CBO e o executor não possui ocupação informada.", actionNeeded: "Complete o CBO do profissional na origem e reprocesse." });
          if (cbos.length && professional?.cbo && !cbos.includes(professional.cbo)) issues.push({ code: "CBO_INCOMPATIVEL", message: `CBO ${professional.cbo} incompatível com o procedimento.`, actionNeeded: "Verificar o executor ou o vínculo CBO do procedimento." });
          const cids = referenceLinks.filter(l => l.relationType === "CID").map(l => l.code);
          const factCid = fresh.cidReferenceId ? (await tx.select({ code: healthSusReferences.code }).from(healthSusReferences).where(eq(healthSusReferences.id, fresh.cidReferenceId)).limit(1))[0] : null;
          if (cids.length && !factCid) issues.push({ code: "SEM_CID", message: "Procedimento exige diagnóstico CID não informado na origem.", actionNeeded: "Registre o diagnóstico principal na origem e reprocesse." });
          if (cids.length && factCid && !cids.includes(factCid.code)) issues.push({ code: "CID_INCOMPATIVEL", message: `CID ${factCid.code} incompatível com o procedimento.`, actionNeeded: "Revisar o diagnóstico ou o vínculo CID do procedimento." });
          const birth = patient?.person.birthDate;
          if (birth && (procedure.minimumAge !== null || procedure.maximumAge !== null)) {
            let age = fresh.occurredAt.getFullYear() - birth.getFullYear();
            const m = fresh.occurredAt.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && fresh.occurredAt.getDate() < birth.getDate())) age -= 1;
            if ((procedure.minimumAge !== null && age < procedure.minimumAge) || (procedure.maximumAge !== null && age > procedure.maximumAge)) issues.push({ code: "IDADE_INCOMPATIVEL", message: `Idade ${age} fora da faixa do procedimento.`, actionNeeded: "Verificar a indicação ou a faixa etária do procedimento." });
          }
          const sex = patient?.person.gender;
          if (procedure.allowedSex && sex && !procedure.allowedSex.toLocaleLowerCase("pt-BR").includes(sex.toLocaleLowerCase("pt-BR").slice(0, 1)) && procedure.allowedSex.trim().length <= 3) issues.push({ code: "SEXO_INCOMPATIVEL", message: "Sexo incompatível com o procedimento.", actionNeeded: "Verificar a indicação ou o sexo permitido do procedimento." });
        }
      }
      for (const issue of issues) {
        await tx.insert(healthProductionCriticisms).values({ factId: f.id, code: issue.code, message: issue.message, actionNeeded: issue.actionNeeded });
      }
      await tx.update(healthProductionFacts).set({ status: issues.length ? "CRITICADO" : "VALIDO" }).where(eq(healthProductionFacts.id, f.id));
    }
    const [processed] = await tx.update(healthProductionCompetences).set({ status: "PROCESSADA", processedAt: new Date() }).where(eq(healthProductionCompetences.id, competence.id)).returning({ id: healthProductionCompetences.id, status: healthProductionCompetences.status });
    return processed;
  });
}

export async function closeCompetence(context: AppContext, competenceId: string) {
  const [competence] = await (context.database ?? db).select({ id: healthProductionCompetences.id, period: healthProductionCompetences.period, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competenceId)).limit(1);
  if (!competence) throw new ProductionError("Competência não encontrada.");
  return productionTransaction(context, async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const [current] = await tx.select({ status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competenceId)).limit(1);
    if (!current) throw new ProductionError("Competência não encontrada.");
    if (current.status === "FECHADA") return { id: competenceId, status: current.status };
    if (current.status !== "PROCESSADA") throw new ProductionError("Processe toda a competência antes de fechar; há produção nova ou ainda não validada.");
    const [{ open }] = await tx.select({ open: sql<number>`count(*)::int` }).from(healthProductionCriticisms).innerJoin(healthProductionFacts, eq(healthProductionFacts.id, healthProductionCriticisms.factId)).where(and(eq(healthProductionCriticisms.status, "ABERTA"), eq(healthProductionFacts.period, competence.period)));
    if (open > 0) throw new ProductionError(`Há ${open} crítica(s) aberta(s). Resolva na origem e reprocesse antes de fechar.`);
    const [closed] = await tx.update(healthProductionCompetences).set({ status: "FECHADA", closedAt: new Date() }).where(eq(healthProductionCompetences.id, competenceId)).returning({ id: healthProductionCompetences.id, status: healthProductionCompetences.status });
    return closed;
  });
}

export async function reopenCompetence(context: AppContext, competenceId: string) {
  const [competence] = await (context.database ?? db).select({ id: healthProductionCompetences.id, period: healthProductionCompetences.period, status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competenceId)).limit(1);
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (competence.status !== "FECHADA") throw new ProductionError("Somente competências fechadas podem ser reabertas.");
  return productionTransaction(context, async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const result = await tx.update(healthProductionCompetences).set({ status: "ABERTA", closedAt: null, processedAt: null }).where(and(eq(healthProductionCompetences.id, competenceId), eq(healthProductionCompetences.status, "FECHADA"))).returning({ id: healthProductionCompetences.id });
    if (!result.length) throw new ProductionError("A situação da competência mudou. Atualize a página.");
    return { id: competenceId, status: "ABERTA" };
  });
}

export async function resolveCriticism(context: AppContext, criticismId: string) {
  const database = context.database ?? db;
  const [row] = await database.select({ criticism: healthProductionCriticisms, fact: { id: healthProductionFacts.id, unitId: healthProductionFacts.unitId, period: healthProductionFacts.period } }).from(healthProductionCriticisms).innerJoin(healthProductionFacts, eq(healthProductionFacts.id, healthProductionCriticisms.factId)).where(eq(healthProductionCriticisms.id, criticismId)).limit(1);
  const criticism = row ? { ...row.criticism, fact: row.fact } : null;
  if (!criticism) throw new ProductionError("Crítica não encontrada.");
  if (criticism.fact.unitId) assertHealthUnitAccess(context.user, criticism.fact.unitId);
  const competence = await ensureCompetence(context, criticism.fact.period);
  await processCompetence(context, competence.id);
  if ((await database.select({ id: healthProductionCriticisms.id }).from(healthProductionCriticisms).where(and(eq(healthProductionCriticisms.factId, criticism.factId), eq(healthProductionCriticisms.code, criticism.code), eq(healthProductionCriticisms.status, "ABERTA"))).limit(1)).length) throw new ProductionError("A crítica permanece na origem. Corrija os dados indicados antes de resolver.");
  return { id: criticismId };
}

export async function generateSusFile(context: AppContext, input: { competenceId: string; fileType: string; unitId?: string | null; financing?: string | null }) {
  const type = input.fileType.toUpperCase();
  if (!["BPA", "FPO", "RAAS", "AIH", "OUTRO"].includes(type)) throw new ProductionError("Tipo de arquivo inválido.");
  const [competence] = await (context.database ?? db).select({ id: healthProductionCompetences.id, period: healthProductionCompetences.period }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, input.competenceId)).limit(1);
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  if (!input.unitId && context.user.hasHealthAccessScope) throw new ProductionError("Selecione uma unidade autorizada. Arquivo consolidado exige escopo global de Saúde.");
  return productionTransaction(context, async tx => {
  await lockProductionPeriod(tx, competence.period);
   const [current] = await tx.select({ status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.id, competence.id)).limit(1);
   if (!current) throw new ProductionError("Competência não encontrada.");
  if (!["PROCESSADA", "FECHADA"].includes(current.status)) throw new ProductionError("Processe e valide a competência antes de gerar arquivos.");
  // Arquivos tipo BPA/RAAS/AIH/FPO consolidam apenas fatos com procedimento SUS.
   const rows = await tx.select({ fact: healthProductionFacts, procedure: { code: healthSusProcedures.code, financing: healthSusProcedures.financing }, unit: { cnes: healthUnits.cnes, name: healthUnits.name }, professional: { cns: healthProfessionals.cns }, patient: { cns: patients.cns } }).from(healthProductionFacts).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthProductionFacts.procedureId)).leftJoin(healthUnits, eq(healthUnits.id, healthProductionFacts.unitId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthProductionFacts.professionalId)).leftJoin(patients, eq(patients.id, healthProductionFacts.patientId)).where(and(eq(healthProductionFacts.competenceId, competence.id), eq(healthProductionFacts.status, "VALIDO"), isNotNull(healthProductionFacts.procedureId), input.unitId ? eq(healthProductionFacts.unitId, input.unitId) : undefined, input.financing ? eq(healthSusProcedures.financing, input.financing) : undefined)).orderBy(asc(healthProductionFacts.occurredAt));
   const facts = rows.map(row => ({ ...row.fact, procedure: row.procedure, unit: row.unit, professional: row.professional, patient: row.patient }));
  if (facts.length === 0) throw new ProductionError("Não há fatos válidos para gerar o arquivo.");
   const [institution] = await tx.select({ name: institutions.name, cnpj: institutions.cnpj }).from(institutions).orderBy(asc(institutions.createdAt)).limit(1);
   const targets = type === "FPO" ? await tx.select({ procedureId: healthProductionTargets.procedureId, contractedQuantity: healthProductionTargets.contractedQuantity }).from(healthProductionTargets).where(eq(healthProductionTargets.competenceId, competence.id)) : [];
  const targetOf = new Map(targets.map(t => [t.procedureId, t.contractedQuantity]));
  const lines = facts.map(f => [
    type,
    competence.period.replace("-", ""),
    f.unit?.cnes || f.unit?.name || "",
    f.procedure?.code || "",
    f.professional?.cns || "",
    f.occurredAt.toISOString().slice(0, 10),
    String(f.quantity),
     f.value?.toFixed(2) ?? "",
    type === "FPO" && f.procedureId ? `META:${targetOf.get(f.procedureId) ?? 0}` : `${f.originType}:${f.originId}`,
  ].join("|"));
  const header = `#${type}|COMPETENCIA:${competence.period}|QTDE:${facts.length}|ESTABELECIMENTO:${institution?.name || ""}|CNPJ:${institution?.cnpj || ""}${input.financing ? `|FINANCIAMENTO:${input.financing}` : ""}|GERADO_EM:${new Date().toISOString()}`;
  const content = [header, ...lines].join("\n");
  const hash = createHash("sha256").update(content).digest("hex");
   const totalValue = facts.reduce((sum, f) => sum.plus(f.value ?? 0), new Decimal(0));
   const [file] = await tx.insert(healthSusFiles).values({ fileType: type, competenceId: competence.id, unitId: input.unitId || null, content, hash, quantity: facts.length, totalValue: totalValue.isZero() ? null : totalValue, createdByUsuarioId: context.user.id }).returning({ id: healthSusFiles.id, hash: healthSusFiles.hash, quantity: healthSusFiles.quantity });
   return file;
  });
}

// Importação de arquivo no leiaute local (consistência de BPA recebido):
// cada linha válida vira fato MANUAL idempotente para processamento normal.
export async function importProductionFile(context: AppContext, content: string) {
  const database = context.database ?? db;
  const fileHash = createHash("sha256").update(content).digest("hex");
  const lines = content.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  if (!lines.length) throw new ProductionError("O arquivo não contém linhas de produção.");
  let created = 0;
  const errors: Array<{ line: number; reason: string }> = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split("|");
    const [, competenceRaw, unitRef, procedureCode, professionalCns, dateRaw, qtyRaw] = parts;
    const period = /^\d{6}$/.test(competenceRaw || "") ? `${competenceRaw.slice(0, 4)}-${competenceRaw.slice(4)}` : null;
    const quantity = Number(qtyRaw);
    if (!period || !periodSchema.safeParse(period).success || !unitRef || !procedureCode || !z.iso.date().safeParse(dateRaw).success || dateRaw.slice(0, 7) !== period || !Number.isInteger(quantity) || quantity <= 0) {
      errors.push({ line: index + 1, reason: "Linha fora do leiaute esperado." });
      continue;
    }
     const [unitRows, procedureRows] = await Promise.all([
       database.select({ id: healthUnits.id }).from(healthUnits).where(and(or(eq(healthUnits.cnes, unitRef), eq(healthUnits.name, unitRef)), eq(healthUnits.isActive, true))).limit(1),
       database.select({ id: healthSusProcedures.id, unitValue: healthSusProcedures.unitValue }).from(healthSusProcedures).where(and(eq(healthSusProcedures.code, procedureCode), eq(healthSusProcedures.isActive, true), eq(healthSusProcedures.isCurrent, true))).limit(1),
     ]);
     const unit = unitRows[0], procedure = procedureRows[0];
    if (!unit || !procedure) {
      errors.push({ line: index + 1, reason: "Unidade ou procedimento não localizado na base." });
      continue;
    }
    if (unit) assertHealthUnitAccess(context.user, unit.id);
    const key = `BPA:${fileHash.slice(0, 12)}:${index + 1}`;
     if ((await database.select({ id: healthProductionFacts.id }).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey, key)).limit(1)).length) continue;
     const professional = professionalCns ? (await database.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.cns, professionalCns), eq(healthProfessionals.isActive, true))).limit(1))[0] : null;
    try {
       if ((await database.select({ id: healthProductionFacts.id }).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey, `MANUAL:${key}`)).limit(1)).length) continue;
      const result = await captureManualFactWithResult(context, { unitId: unit.id, procedureId: procedure.id, professionalId: professional?.id || null, quantity, occurredAt: dateRaw, idempotencyKey: key });
      if (result.created) created += 1;
    } catch (error) { errors.push({ line: index + 1, reason: error instanceof Error ? error.message : "Não foi possível capturar a linha de produção." }); }
  }
  return { created, rejected: errors.length, errors };
}

// Adaptador/validador controlado: valida estrutura real do arquivo gerado e
// devolve aceites/rejeições por linha. Troca futura de endpoint/credenciais
// ocorre na camada de integração sem alterar o arquivo.
export async function processSusFile(context: AppContext, fileId: string) {
  const database = context.database ?? db;
  const [file] = await database.select({ id: healthSusFiles.id, fileType: healthSusFiles.fileType, content: healthSusFiles.content, competenceId: healthSusFiles.competenceId, unitId: healthSusFiles.unitId }).from(healthSusFiles).where(eq(healthSusFiles.id, fileId)).limit(1);
  if (!file) throw new ProductionError("Arquivo não encontrado.");
  if (file.unitId) assertHealthUnitAccess(context.user, file.unitId);
  else if (context.user.hasHealthAccessScope) throw new ProductionError("Arquivo consolidado fora do escopo de unidade do usuário.");
  const lines = file.content.split("\n").slice(1).filter(Boolean);
  const errors: Array<{ line: number; reason: string }> = [];
  let accepted = 0;
  lines.forEach((line, index) => {
    const parts = line.split("|");
    const [, competence, unit, procedure, , date, qty] = parts;
    if (!competence || !/^\d{6}$/.test(competence)) errors.push({ line: index + 1, reason: "Competência inválida na linha." });
    else if (!unit) errors.push({ line: index + 1, reason: "Unidade não identificada na linha." });
    else if (!procedure) errors.push({ line: index + 1, reason: "Procedimento SUS ausente na linha." });
    else if (!date || Number.isNaN(Date.parse(date))) errors.push({ line: index + 1, reason: "Data inválida na linha." });
    else if (!qty || Number(qty) <= 0) errors.push({ line: index + 1, reason: "Quantidade inválida na linha." });
    else accepted += 1;
  });
  const rejected = errors.length;
  const status = rejected === 0 ? "PROCESSADO" : accepted === 0 ? "REJEITADO" : "PARCIAL";
  const [processed] = await database.update(healthSusFiles).set({ status, processedCount: accepted, rejectedCount: rejected, errors, processedAt: new Date() }).where(eq(healthSusFiles.id, fileId)).returning({ id: healthSusFiles.id, status: healthSusFiles.status, processedCount: healthSusFiles.processedCount, rejectedCount: healthSusFiles.rejectedCount });
  return processed;
}
