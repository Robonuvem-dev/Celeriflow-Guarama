import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { appointmentBillingContextSchema, resolveHealthProcedurePrice } from "./billing-price-service";

export class ProductionError extends Error {}

const periodOf = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe competência válida no formato AAAA-MM.");
async function lockProductionPeriod(tx: Prisma.TransactionClient, period: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PRODUCTION_PERIOD:${period}`}))`;
}
async function assertGlobalProductionScope(tx: Prisma.TransactionClient, context: AppContext) {
  if (context.user.hasHealthAccessScope && await tx.healthUnit.count({ where: { id: { notIn: context.user.allowedHealthUnitIds || [] } } })) throw new ProductionError("Processamento e fechamento da competência global exigem acesso a todas as unidades de Saúde.");
}

export async function registerProductionFactTx(tx: Prisma.TransactionClient, input: Omit<Prisma.HealthProductionFactUncheckedCreateInput, "period" | "competenceId"> & { period?: string }, billingContext?: unknown) {
  const period = periodSchema.parse(input.period || periodOf(new Date(input.occurredAt)));
  if (!Number.isInteger(input.quantity ?? 1) || (input.quantity ?? 1) <= 0) throw new ProductionError("Quantidade de produção inválida.");
  await lockProductionPeriod(tx, period);
  const existing = await tx.healthProductionFact.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, originType: true, originId: true } });
  if (existing) {
    if (existing.originType !== input.originType || existing.originId !== input.originId) throw new ProductionError("Chave de produção já utilizada por outra origem.");
    return { id: existing.id, created: false };
  }
  const competence = await tx.healthProductionCompetence.findUnique({ where: { period }, select: { id: true, status: true } });
  if (competence?.status === "FECHADA") throw new ProductionError(`Competência ${period} fechada: produção retroativa bloqueada.`);
  const billing = appointmentBillingContextSchema.safeParse(billingContext);
  const context = billing.success ? billing.data : null;
  const price = input.value === undefined && input.unitId && input.procedureId ? await resolveHealthProcedurePrice(tx, { unitId: context?.providerUnit?.id || input.unitId, procedureId: input.procedureId, occurredAt: new Date(input.occurredAt), quantity: input.quantity ?? 1, agreementId: context?.agreementId, billingContext: context }) : null;
  const result = await tx.healthProductionFact.create({ data: { ...input, value: input.value ?? price?.totalValue ?? null, pricingSnapshot: input.pricingSnapshot ?? price?.snapshot, period, competenceId: competence?.id || null }, select: { id: true } });
  if (competence) await tx.healthProductionCompetence.update({ where: { id: competence.id }, data: { status: "ABERTA", processedAt: null } });
  return { id: result.id, created: true };
}

export async function ensureCompetence(context: AppContext, period: string) {
  periodSchema.parse(period);
  return context.prisma.$transaction(async tx => {
    await lockProductionPeriod(tx, period);
    return tx.healthProductionCompetence.upsert({ where: { period }, create: { period, createdByUsuarioId: context.user.id }, update: {}, select: { id: true } });
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
  value?: number | null;
  occurredAt: Date;
  pricingSnapshot?: Prisma.InputJsonValue;
};

type ClinicalContext = { cidReferenceId: string | null; municipality: string | null; state: string | null; billingContext: z.infer<typeof appointmentBillingContextSchema> | null };

// CID e município/UF vêm do prontuário de origem quando determinável com
// segurança (diagnóstico principal + snapshot do agendamento). Sem origem
// clínica, mantém nulo em vez de inventar.
type ClinicalReader = Pick<Prisma.TransactionClient, "medicalRecord" | "healthRegulationRequest">;

async function clinicalContextForRecord(tx: ClinicalReader, medicalRecordId: string | null): Promise<ClinicalContext> {
  const empty = { cidReferenceId: null, municipality: null, state: null, billingContext: null };
  if (!medicalRecordId) return empty;
  const record = await tx.medicalRecord.findUnique({
    where: { id: medicalRecordId },
    select: {
      appointment: { select: { municipalitySnapshot: true, stateSnapshot: true, billingContextSnapshot: true } },
      diagnoses: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }], take: 1, select: { cidReferenceId: true } },
    },
  });
  if (!record) return empty;
  const billing = appointmentBillingContextSchema.safeParse(record.appointment?.billingContextSnapshot);
  return {
    cidReferenceId: record.diagnoses[0]?.cidReferenceId || null,
    municipality: record.appointment?.municipalitySnapshot || null,
    state: record.appointment?.stateSnapshot || null,
    billingContext: billing.success ? billing.data : null,
  };
}

async function clinicalContextForRegulation(tx: ClinicalReader, requestId: string): Promise<{ medicalRecordId: string | null } & ClinicalContext> {
  const request = await tx.healthRegulationRequest.findUnique({
    where: { id: requestId },
    select: { referral: { select: { medicalRecordId: true } }, examRequest: { select: { medicalRecordId: true } } },
  });
  const medicalRecordId = request?.referral?.medicalRecordId || request?.examRequest?.medicalRecordId || null;
  return { medicalRecordId, ...(await clinicalContextForRecord(tx, medicalRecordId)) };
}

export async function captureFacts(context: AppContext, period?: string | null) {
  if (period) periodSchema.parse(period);
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const candidates: Candidate[] = [];
  const clinicalRecords = new Map<string, ClinicalContext>();
  const prices = new Map<string, Awaited<ReturnType<typeof resolveHealthProcedurePrice>>>();
  const priceFor = async (input: Parameters<typeof resolveHealthProcedurePrice>[1]) => {
    const key = JSON.stringify({ ...input, occurredAt: input.occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) });
    const existing = prices.get(key); if (existing) return existing;
    const result = await resolveHealthProcedurePrice(context.prisma, input); prices.set(key, result); return result;
  };
  const inPeriod = period ? { gte: new Date(`${period}-01T00:00:00-03:00`), lt: new Date(`${nextMonth(period)}T00:00:00-03:00`) } : undefined;
  // PEP: procedimentos realizados (somente atendimento concluído conta como realizado)
  const performed = await context.prisma.healthPerformedProcedure.findMany({
    where: { ...(inPeriod ? { performedAt: inPeriod } : {}), medicalRecord: { completedAt: { not: null }, ...(unitIds ? { unitId: { in: unitIds } } : {}) } },
    select: { id: true, quantity: true, performedAt: true, procedureId: true, professionalId: true, medicalRecordId: true, medicalRecord: { select: { patientId: true, unitId: true, completedAt: true } }, procedure: { select: { unitValue: true } } },
  });
  for (const p of performed) {
    if (!p.medicalRecord.completedAt) continue;
    let clinical = clinicalRecords.get(p.medicalRecordId);
    if (!clinical) { clinical = await clinicalContextForRecord(context.prisma, p.medicalRecordId); clinicalRecords.set(p.medicalRecordId, clinical); }
    const price = await priceFor({ unitId: clinical.billingContext?.providerUnit?.id || p.medicalRecord.unitId, procedureId: p.procedureId, occurredAt: p.performedAt, quantity: p.quantity, agreementId: clinical.billingContext?.agreementId, billingContext: clinical.billingContext });
    candidates.push({ originType: "PEP_PROCEDURE", originId: p.id, patientId: p.medicalRecord.patientId, unitId: p.medicalRecord.unitId, professionalId: p.professionalId, procedureId: p.procedureId, cidReferenceId: clinical.cidReferenceId, municipality: clinical.municipality, state: clinical.state, quantity: p.quantity, value: price.totalValue?.toNumber() ?? null, pricingSnapshot: price.snapshot, occurredAt: p.performedAt });
  }
  // Laboratório: ordens com resultado final (fato realizado = laudo final)
  const labOrders = await context.prisma.healthLabOrder.findMany({
    where: { ...(unitIds ? { collectionUnitId: { in: unitIds } } : {}), results: { some: { status: "FINAL", ...(inPeriod ? { enteredAt: inPeriod } : {}) } } },
    select: { id: true, patientId: true, collectionUnitId: true, collectorProfessionalId: true, examModel: { select: { procedureId: true } }, results: { where: { status: "FINAL" }, orderBy: { version: "desc" }, take: 1, select: { id: true, enteredAt: true } } },
  });
  for (const o of labOrders) {
    const r = o.results[0];
    if (!r) continue;
    if (inPeriod && (r.enteredAt < inPeriod.gte || r.enteredAt >= inPeriod.lt)) continue;
    const price = o.collectionUnitId && o.examModel?.procedureId ? await priceFor({ unitId: o.collectionUnitId, procedureId: o.examModel.procedureId, occurredAt: r.enteredAt, quantity: 1 }) : null;
    candidates.push({ originType: "LAB_RESULT", originId: r.id, patientId: o.patientId, unitId: o.collectionUnitId, professionalId: o.collectorProfessionalId, procedureId: o.examModel?.procedureId || null, quantity: 1, value: price?.totalValue?.toNumber() ?? null, pricingSnapshot: price?.snapshot, occurredAt: r.enteredAt });
  }
  // Vacinação: aplicações (fato realizado por definição)
  const vaccinations = await context.prisma.vaccinationRecord.findMany({
    where: { ...(inPeriod ? { date: inPeriod } : {}), ...(unitIds ? { unitId: { in: unitIds } } : {}) },
    select: { id: true, date: true, patientId: true, unitId: true, professionalId: true },
  });
  for (const v of vaccinations) {
    candidates.push({ originType: "VACCINATION", originId: v.id, patientId: v.patientId, unitId: v.unitId, professionalId: v.professionalId, procedureId: null, quantity: 1, occurredAt: v.date });
  }
  // Regulação: solicitações executadas/concluídas
  const regs = await context.prisma.healthRegulationRequest.findMany({
    where: { status: { in: ["EXECUTADA", "CONCLUIDA"] }, ...(inPeriod ? { executedAt: inPeriod } : {}), ...(unitIds ? { requestUnitId: { in: unitIds } } : {}) },
    select: { id: true, executedAt: true, patientId: true, requestUnitId: true, professionalId: true, procedureId: true, quota: { select: { id: true, unitValue: true, providerSupplierId: true } } },
  });
  for (const r of regs) {
    if (!r.executedAt) continue;
    const clinical = await clinicalContextForRegulation(context.prisma, r.id);
    const price = r.requestUnitId && r.procedureId ? await priceFor({ unitId: r.requestUnitId, procedureId: r.procedureId, occurredAt: r.executedAt, quantity: 1 }) : null;
    const quotaPrice = r.quota?.unitValue;
    candidates.push({ originType: "REGULATION", originId: r.id, patientId: r.patientId, unitId: r.requestUnitId, professionalId: r.professionalId, procedureId: r.procedureId, cidReferenceId: clinical.cidReferenceId, municipality: clinical.municipality, state: clinical.state, quantity: 1, value: quotaPrice?.toNumber() ?? price?.totalValue?.toNumber() ?? null, pricingSnapshot: quotaPrice !== null && quotaPrice !== undefined ? { source: "REGULATION_QUOTA", quotaId: r.quota!.id, providerSupplierId: r.quota!.providerSupplierId, totalValue: quotaPrice.toFixed(2) } : price?.snapshot, occurredAt: r.executedAt });
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
    const result = await context.prisma.$transaction(async tx => {
      await lockProductionPeriod(tx, p);
      const competence = await tx.healthProductionCompetence.findUnique({ where: { period: p }, select: { id: true, status: true } });
      if (competence?.status === "FECHADA") return { created: 0, blocked: group.length };
      let count = 0;
      for (let offset = 0; offset < group.length; offset += 1000) {
        const batch = group.slice(offset, offset + 1000).map(c => ({ competenceId: competence?.id || null, originType: c.originType, originId: c.originId, patientId: c.patientId || null, unitId: c.unitId || null, professionalId: c.professionalId || null, procedureId: c.procedureId || null, cidReferenceId: c.cidReferenceId || null, municipality: c.municipality || null, state: c.state || null, quantity: c.quantity, value: c.value ?? null, pricingSnapshot: c.pricingSnapshot, occurredAt: c.occurredAt, period: p, idempotencyKey: `${c.originType}:${c.originId}` }));
        count += (await tx.healthProductionFact.createMany({ data: batch, skipDuplicates: true })).count;
      }
      if (competence && count > 0) await tx.healthProductionCompetence.update({ where: { id: competence.id }, data: { status: "ABERTA", processedAt: null } });
      return { created: count, blocked: 0 };
    }, { timeout: 120000 });
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

async function manualProductionPrice(tx: Prisma.TransactionClient, input: z.infer<typeof manualFactSchema>, occurredAt: Date, actorUsuarioId: string) {
  if (input.agreementId) {
    const on = new Date(`${occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00Z`);
    if (!await tx.healthCareCoverage.count({ where: { agreementId: input.agreementId, unitId: input.unitId, procedureId: input.procedureId, isActive: true, validFrom: { lte: on }, OR: [{ validUntil: null }, { validUntil: { gte: on } }], agreement: { validFrom: { lte: on }, OR: [{ validUntil: null }, { validUntil: { gte: on } }] } } })) throw new ProductionError("Convênio sem cobertura vigente para o procedimento e unidade da produção manual.");
  }
  const pricing = input.value === null || input.value === undefined
    ? await resolveHealthProcedurePrice(tx, { unitId: input.unitId, procedureId: input.procedureId, quantity: input.quantity, occurredAt, agreementId: input.agreementId })
    : { totalValue: new Prisma.Decimal(input.value), snapshot: { source: "MANUAL_VALUE", procedureId: input.procedureId, quantity: input.quantity, totalValue: input.value.toFixed(2) } as Prisma.InputJsonObject };
  return { value: pricing.totalValue, snapshot: { ...(pricing.snapshot as Prisma.InputJsonObject), manualInput: { value: input.value ?? null, agreementId: input.agreementId || null }, actorUsuarioId } };
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
  const procedure = await context.prisma.healthSusProcedure.findFirst({ where: { id: input.procedureId, isActive: true, isCurrent: true }, select: { id: true, unitValue: true } });
  if (!procedure) throw new ProductionError("Procedimento SUS ativo não encontrado.");
  if (!await context.prisma.healthUnit.findFirst({ where: { id: input.unitId, isActive: true }, select: { id: true } })) throw new ProductionError("Unidade ativa não encontrada.");
  const occurredAt = new Date(`${input.occurredAt}T12:00:00-03:00`);
  const p = periodOf(occurredAt);
  const key = `MANUAL:${input.idempotencyKey || randomUUID()}`;
  return context.prisma.$transaction(async tx => {
    await lockProductionPeriod(tx, p);
    const competence = await tx.healthProductionCompetence.findUnique({ where: { period: p }, select: { id: true, status: true } });
    const exists = await tx.healthProductionFact.findUnique({ where: { idempotencyKey: key } });
    if (exists) {
      if (exists.unitId) assertHealthUnitAccess(context.user, exists.unitId);
      const previousInput = z.object({ manualInput: z.object({ value: z.number().nullable(), agreementId: z.string().nullable() }) }).safeParse(exists.pricingSnapshot);
      if (exists.originType !== "MANUAL" || exists.patientId !== (input.patientId || null) || exists.unitId !== input.unitId || exists.professionalId !== (input.professionalId || null) || exists.procedureId !== procedure.id || exists.quantity !== input.quantity || exists.occurredAt.valueOf() !== occurredAt.valueOf() || (input.value != null && (exists.value === null || !exists.value.eq(input.value))) || (previousInput.success && (previousInput.data.manualInput.value !== (input.value ?? null) || previousInput.data.manualInput.agreementId !== (input.agreementId || null)))) throw new ProductionError("Chave de digitação já utilizada com outros dados.");
      return { id: exists.id, created: false };
    }
    if (competence?.status === "FECHADA") throw new ProductionError(`Competência ${p} fechada: digitação retroativa bloqueada.`);
    if (input.patientId && !await tx.patient.count({ where: { id: input.patientId } })) throw new ProductionError("Paciente não encontrado.");
    if (input.professionalId && !await tx.healthProfessional.count({ where: { id: input.professionalId, isActive: true, employee: { isActive: true } } })) throw new ProductionError("Profissional ativo não encontrado.");
    const pricing = await manualProductionPrice(tx, input, occurredAt, context.user.id);
    const result = await tx.healthProductionFact.create({ data: { competenceId: competence?.id || null, originType: "MANUAL", originId: key, patientId: input.patientId || null, unitId: input.unitId, professionalId: input.professionalId || null, procedureId: procedure.id, quantity: input.quantity, value: pricing.value, pricingSnapshot: pricing.snapshot, occurredAt, period: p, idempotencyKey: key }, select: { id: true } });
    if (competence) await tx.healthProductionCompetence.update({ where: { id: competence.id }, data: { status: "ABERTA", processedAt: null } });
    return { id: result.id, created: true };
  });
}

export async function reviseManualProductionFact(context: AppContext, raw: unknown) {
  const input = manualFactSchema.omit({ idempotencyKey: true }).extend({ factId: z.string().min(1), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(4000), cidReferenceId: z.string().min(1).nullable().default(null), municipality: z.string().trim().max(200).nullable().default(null), state: z.string().regex(/^[A-Z]{2}$/).nullable().default(null) }).parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  const initial = await context.prisma.healthProductionFact.findUniqueOrThrow({ where: { id: input.factId }, select: { period: true } });
  const occurredAt = new Date(`${input.occurredAt}T12:00:00-03:00`), period = periodOf(occurredAt);
  return context.prisma.$transaction(async tx => {
    for (const p of [...new Set([initial.period, period])].sort()) await lockProductionPeriod(tx, p);
    const before = await tx.healthProductionFact.findUniqueOrThrow({ where: { id: input.factId } });
    if (before.unitId) assertHealthUnitAccess(context.user, before.unitId);
    if (before.originType !== "MANUAL") throw new ProductionError("Corrija o atendimento ou registro de origem; somente produção manual pode ser editada aqui.");
    if (before.period !== initial.period || before.version !== input.expectedVersion) throw new ProductionError("Produção alterada por outra sessão. Atualize antes de salvar.");
    const competences = await tx.healthProductionCompetence.findMany({ where: { period: { in: [initial.period, period] } }, select: { id: true, period: true, status: true } });
    if (competences.some(competence => competence.status === "FECHADA")) throw new ProductionError("Reabra a competência antes de corrigir a produção.");
    const procedure = await tx.healthSusProcedure.findFirst({ where: { id: input.procedureId, isActive: true }, select: { unitValue: true } });
    if (!procedure || !await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new ProductionError("Selecione unidade e procedimento ativos.");
    if (input.professionalId && !await tx.healthProfessional.count({ where: { id: input.professionalId, isActive: true, employee: { isActive: true } } })) throw new ProductionError("Profissional ativo não encontrado.");
    if (input.patientId && !await tx.patient.count({ where: { id: input.patientId } })) throw new ProductionError("Paciente não encontrado.");
    if (input.cidReferenceId && !await tx.healthSusReference.count({ where: { id: input.cidReferenceId, kind: "CID" } })) throw new ProductionError("CID não encontrado no catálogo.");
    const previousPricing = z.object({ manualInput: z.object({ agreementId: z.string().nullable() }) }).safeParse(before.pricingSnapshot);
    const unchangedPricing = before.unitId === input.unitId && before.procedureId === input.procedureId && before.quantity === input.quantity && before.occurredAt.valueOf() === occurredAt.valueOf() && (before.value === null ? input.value == null : input.value != null && before.value.eq(input.value)) && (previousPricing.success ? previousPricing.data.manualInput.agreementId : null) === (input.agreementId || null);
    const pricing = unchangedPricing ? { value: before.value, snapshot: before.pricingSnapshot as Prisma.InputJsonValue | null } : await manualProductionPrice(tx, input, occurredAt, context.user.id);
    const after = await tx.healthProductionFact.update({ where: { id: before.id }, data: { unitId: input.unitId, professionalId: input.professionalId || null, patientId: input.patientId || null, procedureId: input.procedureId, quantity: input.quantity, value: pricing.value, pricingSnapshot: pricing.snapshot === null ? Prisma.DbNull : pricing.snapshot, occurredAt, period, competenceId: competences.find(competence => competence.period === period)?.id || null, cidReferenceId: input.cidReferenceId, municipality: input.municipality, state: input.state, version: { increment: 1 } } });
    await tx.healthProductionFactRevision.create({ data: { factId: before.id, version: after.version, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)), reason: input.reason, actorUsuarioId: context.user.id } });
    for (const competence of competences) await tx.healthProductionCompetence.update({ where: { id: competence.id }, data: { status: "ABERTA", processedAt: null } });
    return { id: after.id, version: after.version };
  });
}

export async function saveProductionTarget(context: AppContext, raw: unknown) {
  const input = z.object({ competenceId: z.string().min(1), procedureId: z.string().min(1), contractedQuantity: z.number().positive().max(999999) }).strict().parse(raw);
  const competence = await context.prisma.healthProductionCompetence.findUnique({ where: { id: input.competenceId }, select: { id: true, status: true } });
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (competence.status === "FECHADA") throw new ProductionError("Competência fechada.");
  return context.prisma.healthProductionTarget.upsert({ where: { competenceId_procedureId: { competenceId: input.competenceId, procedureId: input.procedureId } }, create: { competenceId: input.competenceId, procedureId: input.procedureId, contractedQuantity: input.contractedQuantity, createdByUsuarioId: context.user.id }, update: { contractedQuantity: input.contractedQuantity }, select: { id: true } });
}

export async function saveUnitCeiling(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), period: z.string().regex(/^\d{4}-\d{2}$/), value: z.number().nonnegative().max(999999999) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return context.prisma.healthUnitCeiling.upsert({ where: { unitId_period: { unitId: input.unitId, period: input.period } }, create: { unitId: input.unitId, period: input.period, value: input.value, createdByUsuarioId: context.user.id }, update: { value: input.value }, select: { id: true } });
}

// Sincroniza campos nulos do fato com a origem (correção na origem +
// reprocesso reflete no fato). Nunca sobrescreve histórico já capturado.
async function syncFactFromOrigin(tx: Prisma.TransactionClient, fact: { id: string; originType: string; originId: string; procedureId: string | null; professionalId: string | null; unitId: string | null; patientId: string | null; cidReferenceId: string | null; municipality: string | null; state: string | null }) {
  const patch: { procedureId?: string; professionalId?: string; unitId?: string; patientId?: string; cidReferenceId?: string; municipality?: string; state?: string } = {};
  if (fact.originType === "PEP_PROCEDURE") {
    const performed = await tx.healthPerformedProcedure.findUnique({ where: { id: fact.originId }, select: { procedureId: true, professionalId: true, medicalRecord: { select: { patientId: true, unitId: true, id: true } } } });
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
    const result = await tx.healthLabResult.findUnique({ where: { id: fact.originId }, select: { order: { select: { patientId: true, collectionUnitId: true, collectorProfessionalId: true, examModel: { select: { procedureId: true } } } } } });
    if (!result) return;
    if (!fact.procedureId && result.order.examModel?.procedureId) patch.procedureId = result.order.examModel.procedureId;
    if (!fact.professionalId && result.order.collectorProfessionalId) patch.professionalId = result.order.collectorProfessionalId;
    if (!fact.unitId && result.order.collectionUnitId) patch.unitId = result.order.collectionUnitId;
    if (!fact.patientId) patch.patientId = result.order.patientId;
  } else if (fact.originType === "REGULATION") {
    const request = await tx.healthRegulationRequest.findUnique({ where: { id: fact.originId }, select: { procedureId: true, professionalId: true, requestUnitId: true, patientId: true } });
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
  if (Object.keys(patch).length) await tx.healthProductionFact.update({ where: { id: fact.id }, data: patch });
}

function nextMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

export async function processCompetence(context: AppContext, competenceId: string) {
  const competence = await context.prisma.healthProductionCompetence.findUnique({ where: { id: competenceId }, select: { id: true, period: true, status: true } });
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (competence.status === "FECHADA") throw new ProductionError("Competência fechada. Reabra antes de reprocessar.");
  return context.prisma.$transaction(async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const current = await tx.healthProductionCompetence.findUniqueOrThrow({ where: { id: competenceId }, select: { status: true } });
    if (current.status === "FECHADA") throw new ProductionError("Competência fechada. Reabra antes de reprocessar.");
    const facts = await tx.healthProductionFact.findMany({ where: { period: competence.period }, select: { id: true, originType: true, originId: true, unitId: true, professionalId: true, procedureId: true, patientId: true, cidReferenceId: true, municipality: true, state: true, quantity: true } });
    for (const f of facts) {
      if (f.unitId) assertHealthUnitAccess(context.user, f.unitId);
      await syncFactFromOrigin(tx, f);
      const fresh = await tx.healthProductionFact.findUnique({ where: { id: f.id }, select: { unitId: true, professionalId: true, procedureId: true, quantity: true, occurredAt: true, patientId: true, cidReferenceId: true } });
      if (!fresh) continue;
      if (fresh.unitId) assertHealthUnitAccess(context.user, fresh.unitId);
      await tx.healthProductionFact.update({ where: { id: f.id }, data: { competenceId: competence.id } });
      await tx.healthProductionCriticism.updateMany({ where: { factId: f.id, status: "ABERTA" }, data: { status: "REPROCESSADA", resolvedAt: new Date() } });
      const issues: Array<{ code: string; message: string; actionNeeded: string }> = [];
      // Vacinação (SI-PNI) e fichas e-SUS alimentam outros sistemas: não exigem procedimento BPA.
      if (!fresh.procedureId && ["PEP_PROCEDURE", "LAB_RESULT", "REGULATION"].includes(f.originType)) issues.push({ code: "SEM_PROCEDIMENTO", message: "Fato sem procedimento SUS vinculado.", actionNeeded: "Vincular procedimento SIGTAP na origem e reprocessar." });
      if (!fresh.professionalId) issues.push({ code: "SEM_PROFISSIONAL", message: "Fato sem profissional responsável.", actionNeeded: "Identificar o profissional executor na origem e reprocessar." });
      if (!fresh.unitId) issues.push({ code: "SEM_UNIDADE", message: "Fato sem unidade de realização.", actionNeeded: "Informar a unidade de realização na origem e reprocessar." });
      if (!Number.isInteger(fresh.quantity) || fresh.quantity <= 0) issues.push({ code: "QUANTIDADE_INVALIDA", message: "Quantidade inválida.", actionNeeded: "Corrigir a quantidade na origem e reprocessar." });
      // Consistências SUS a partir dos vínculos do procedimento (CBO, CID, idade, sexo).
      if (fresh.procedureId) {
        const [procedure, professional, patient] = await Promise.all([
          tx.healthSusProcedure.findUnique({ where: { id: fresh.procedureId }, select: { minimumAge: true, maximumAge: true, allowedSex: true, referenceLinks: { select: { relationType: true, reference: { select: { code: true } } } } } }),
          fresh.professionalId ? tx.healthProfessional.findUnique({ where: { id: fresh.professionalId }, select: { cbo: true } }) : null,
          fresh.patientId ? tx.patient.findUnique({ where: { id: fresh.patientId }, select: { person: { select: { gender: true, birthDate: true } } } }) : null,
        ]);
        if (procedure) {
          const cbos = procedure.referenceLinks.filter(l => l.relationType === "CBO").map(l => l.reference.code);
          if (cbos.length && !professional?.cbo) issues.push({ code: "SEM_CBO", message: "Procedimento exige CBO e o executor não possui ocupação informada.", actionNeeded: "Complete o CBO do profissional na origem e reprocesse." });
          if (cbos.length && professional?.cbo && !cbos.includes(professional.cbo)) issues.push({ code: "CBO_INCOMPATIVEL", message: `CBO ${professional.cbo} incompatível com o procedimento.`, actionNeeded: "Verificar o executor ou o vínculo CBO do procedimento." });
          const cids = procedure.referenceLinks.filter(l => l.relationType === "CID").map(l => l.reference.code);
          const factCid = fresh.cidReferenceId ? await tx.healthSusReference.findUnique({ where: { id: fresh.cidReferenceId }, select: { code: true } }) : null;
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
        await tx.healthProductionCriticism.create({ data: { factId: f.id, code: issue.code, message: issue.message, actionNeeded: issue.actionNeeded } });
      }
      await tx.healthProductionFact.update({ where: { id: f.id }, data: { status: issues.length ? "CRITICADO" : "VALIDO" } });
    }
    return tx.healthProductionCompetence.update({ where: { id: competence.id }, data: { status: "PROCESSADA", processedAt: new Date() }, select: { id: true, status: true } });
  });
}

export async function closeCompetence(context: AppContext, competenceId: string) {
  const competence = await context.prisma.healthProductionCompetence.findUnique({ where: { id: competenceId }, select: { id: true, period: true, status: true } });
  if (!competence) throw new ProductionError("Competência não encontrada.");
  return context.prisma.$transaction(async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const current = await tx.healthProductionCompetence.findUniqueOrThrow({ where: { id: competenceId }, select: { status: true } });
    if (current.status === "FECHADA") return { id: competenceId, status: current.status };
    if (current.status !== "PROCESSADA") throw new ProductionError("Processe toda a competência antes de fechar; há produção nova ou ainda não validada.");
    const open = await tx.healthProductionCriticism.count({ where: { status: "ABERTA", fact: { period: competence.period } } });
    if (open > 0) throw new ProductionError(`Há ${open} crítica(s) aberta(s). Resolva na origem e reprocesse antes de fechar.`);
    return tx.healthProductionCompetence.update({ where: { id: competenceId }, data: { status: "FECHADA", closedAt: new Date() }, select: { id: true, status: true } });
  });
}

export async function reopenCompetence(context: AppContext, competenceId: string) {
  const competence = await context.prisma.healthProductionCompetence.findUnique({ where: { id: competenceId }, select: { id: true, status: true, period: true } });
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (competence.status !== "FECHADA") throw new ProductionError("Somente competências fechadas podem ser reabertas.");
  return context.prisma.$transaction(async tx => {
    await lockProductionPeriod(tx, competence.period);
    await assertGlobalProductionScope(tx, context);
    const result = await tx.healthProductionCompetence.updateMany({ where: { id: competenceId, status: "FECHADA" }, data: { status: "ABERTA", closedAt: null, processedAt: null } });
    if (!result.count) throw new ProductionError("A situação da competência mudou. Atualize a página.");
    return { id: competenceId, status: "ABERTA" };
  });
}

export async function resolveCriticism(context: AppContext, criticismId: string) {
  const criticism = await context.prisma.healthProductionCriticism.findUnique({ where: { id: criticismId }, include: { fact: { select: { id: true, unitId: true, period: true } } } });
  if (!criticism) throw new ProductionError("Crítica não encontrada.");
  if (criticism.fact.unitId) assertHealthUnitAccess(context.user, criticism.fact.unitId);
  const competence = await ensureCompetence(context, criticism.fact.period);
  await processCompetence(context, competence.id);
  if (await context.prisma.healthProductionCriticism.count({ where: { factId: criticism.factId, code: criticism.code, status: "ABERTA" } })) throw new ProductionError("A crítica permanece na origem. Corrija os dados indicados antes de resolver.");
  return { id: criticismId };
}

export async function generateSusFile(context: AppContext, input: { competenceId: string; fileType: string; unitId?: string | null; financing?: string | null }) {
  const type = input.fileType.toUpperCase();
  if (!["BPA", "FPO", "RAAS", "AIH", "OUTRO"].includes(type)) throw new ProductionError("Tipo de arquivo inválido.");
  const competence = await context.prisma.healthProductionCompetence.findUnique({ where: { id: input.competenceId }, select: { id: true, period: true } });
  if (!competence) throw new ProductionError("Competência não encontrada.");
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  if (!input.unitId && context.user.hasHealthAccessScope) throw new ProductionError("Selecione uma unidade autorizada. Arquivo consolidado exige escopo global de Saúde.");
  return context.prisma.$transaction(async tx => {
  await lockProductionPeriod(tx, competence.period);
  const current = await tx.healthProductionCompetence.findUniqueOrThrow({ where: { id: competence.id }, select: { status: true } });
  if (!["PROCESSADA", "FECHADA"].includes(current.status)) throw new ProductionError("Processe e valide a competência antes de gerar arquivos.");
  // Arquivos tipo BPA/RAAS/AIH/FPO consolidam apenas fatos com procedimento SUS.
  const facts = await tx.healthProductionFact.findMany({
    where: { competenceId: competence.id, status: "VALIDO", procedureId: { not: null }, ...(input.unitId ? { unitId: input.unitId } : {}), ...(input.financing ? { procedure: { financing: input.financing } } : {}) },
    include: { procedure: { select: { code: true, financing: true } }, unit: { select: { cnes: true, name: true } }, professional: { select: { cns: true } }, patient: { select: { cns: true } } },
    orderBy: { occurredAt: "asc" },
  });
  if (facts.length === 0) throw new ProductionError("Não há fatos válidos para gerar o arquivo.");
  const institution = await tx.institution.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, cnpj: true } });
  const targets = type === "FPO" ? await tx.healthProductionTarget.findMany({ where: { competenceId: competence.id }, select: { procedureId: true, contractedQuantity: true } }) : [];
  const targetOf = new Map(targets.map(t => [t.procedureId, t.contractedQuantity]));
  const lines = facts.map(f => [
    type,
    competence.period.replace("-", ""),
    f.unit?.cnes || f.unit?.name || "",
    f.procedure?.code || "",
    f.professional?.cns || "",
    f.occurredAt.toISOString().slice(0, 10),
    String(f.quantity),
    f.value != null ? Number(f.value).toFixed(2) : "",
    type === "FPO" && f.procedureId ? `META:${targetOf.get(f.procedureId) ?? 0}` : `${f.originType}:${f.originId}`,
  ].join("|"));
  const header = `#${type}|COMPETENCIA:${competence.period}|QTDE:${facts.length}|ESTABELECIMENTO:${institution?.name || ""}|CNPJ:${institution?.cnpj || ""}${input.financing ? `|FINANCIAMENTO:${input.financing}` : ""}|GERADO_EM:${new Date().toISOString()}`;
  const content = [header, ...lines].join("\n");
  const hash = createHash("sha256").update(content).digest("hex");
  const totalValue = facts.reduce((sum, f) => sum + (f.value != null ? Number(f.value) : 0), 0);
  return tx.healthSusFile.create({
    data: { fileType: type, competenceId: competence.id, unitId: input.unitId || null, content, hash, quantity: facts.length, totalValue: totalValue || null, createdByUsuarioId: context.user.id },
    select: { id: true, hash: true, quantity: true },
  });
  });
}

// Importação de arquivo no leiaute local (consistência de BPA recebido):
// cada linha válida vira fato MANUAL idempotente para processamento normal.
export async function importProductionFile(context: AppContext, content: string) {
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
    const [unit, procedure] = await Promise.all([
      context.prisma.healthUnit.findFirst({ where: { OR: [{ cnes: unitRef }, { name: unitRef }], isActive: true }, select: { id: true } }),
      context.prisma.healthSusProcedure.findFirst({ where: { code: procedureCode, isActive: true, isCurrent: true }, select: { id: true, unitValue: true } }),
    ]);
    if (!unit || !procedure) {
      errors.push({ line: index + 1, reason: "Unidade ou procedimento não localizado na base." });
      continue;
    }
    if (unit) assertHealthUnitAccess(context.user, unit.id);
    const key = `BPA:${fileHash.slice(0, 12)}:${index + 1}`;
    if (await context.prisma.healthProductionFact.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
    const professional = professionalCns ? await context.prisma.healthProfessional.findFirst({ where: { cns: professionalCns, isActive: true }, select: { id: true } }) : null;
    try {
      if (await context.prisma.healthProductionFact.findUnique({ where: { idempotencyKey: `MANUAL:${key}` }, select: { id: true } })) continue;
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
  const file = await context.prisma.healthSusFile.findUnique({ where: { id: fileId }, select: { id: true, fileType: true, content: true, competenceId: true, unitId: true } });
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
  return context.prisma.healthSusFile.update({
    where: { id: fileId },
    data: { status, processedCount: accepted, rejectedCount: rejected, errors, processedAt: new Date() },
    select: { id: true, status: true, processedCount: true, rejectedCount: true },
  });
}

export type { Prisma };
