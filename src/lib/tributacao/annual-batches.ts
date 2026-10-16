import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { TaxError, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear } from "./scope";
import { resolveFiscalRule, simulateParametrizedAssessment, createParametrizedAssessmentInTransaction } from "./s2-service";

export const annualBatchInput = z.object({ taxId: z.string().min(1), parameterId: z.string().min(1), competence: z.iso.date(), targetType: z.enum(["TAXPAYER", "REAL_ESTATE", "ECONOMIC_REGISTRATION"]), targets: z.array(z.object({ targetId: z.string().min(1), taxableBase: z.string().regex(/^\d{1,22}(?:\.\d{1,2})?$/), propertyValuationId: z.string().min(1).optional() }).strict()).min(1).max(5000), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(150) }).strict().refine(input => new Set(input.targets.map(target => target.targetId)).size === input.targets.length, "Selecione alvos distintos.");
export type AnnualBatchInput = z.infer<typeof annualBatchInput>;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
function digest(value: unknown) {
  const sort = (entry: Prisma.JsonValue): Prisma.JsonValue => Array.isArray(entry) ? entry.map(sort) : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).flatMap(([key, value]) => value === undefined ? [] : [[key, sort(value)]])) : entry;
  return createHash("sha256").update(JSON.stringify(sort(JSON.parse(JSON.stringify(value))))).digest("hex");
}
const ruleMemory = (rule: Awaited<ReturnType<typeof resolveFiscalRule>>) => ({ parameterId: rule.parameter.id, configuration: rule.configuration, effectiveFrom: rule.parameter.effectiveFrom.toISOString(), effectiveUntil: rule.parameter.effectiveUntil?.toISOString() ?? null });

const propertyValuationMemory = (value: { id: string; realEstateId: string; year: number; venalValueDecimal: Prisma.Decimal; landUnitValue: Prisma.Decimal | null; constructionUnitValue: Prisma.Decimal | null; source: string; updatedAt: Date }) => ({ id: value.id, realEstateId: value.realEstateId, year: value.year, venalValue: value.venalValueDecimal.toFixed(2), landUnitValue: value.landUnitValue?.toFixed(6) ?? null, constructionUnitValue: value.constructionUnitValue?.toFixed(6) ?? null, source: value.source, updatedAt: value.updatedAt.toISOString() });

/** Generates the selected bases from the canonical annual Decimal valuations;
 * missing assessments are inconsistencies, never zero/previous-year estimates. */
export async function simulateTaxAnnualPropertyBatch(db: PrismaClient, actor: TaxActor, raw: { taxId: string; parameterId: string; year: number; realEstateIds: string[]; reason: string; idempotencyKey: string }) {
  const input = z.object({ taxId: z.string().min(1), parameterId: z.string().min(1), year: z.number().int().min(1900).max(2200), realEstateIds: z.array(z.string().min(1)).min(1).max(5000), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(150) }).strict().parse(raw);
  if (new Set(input.realEstateIds).size !== input.realEstateIds.length) throw new TaxError("Selecione inscrições imobiliárias distintas.");
  await resolveTaxAssessmentScope(db, actor, input.taxId);
  const values = await db.propertyValuation.findMany({ where: { realEstateId: { in: input.realEstateIds }, year: input.year } });
  const targets = input.realEstateIds.map(targetId => {
    const value = values.find(row => row.realEstateId === targetId);
    if (!value || value.venalValueDecimal.lte(0) || !value.source.trim()) throw new TaxError(`Imóvel ${targetId} sem avaliação Decimal positiva e fundamentada no exercício ${input.year}.`);
    return { targetId, taxableBase: value.venalValueDecimal.toFixed(2), propertyValuationId: value.id };
  });
  return simulateTaxAnnualBatch(db, actor, { taxId: input.taxId, parameterId: input.parameterId, competence: `${input.year}-01-01`, targetType: "REAL_ESTATE", targets, reason: input.reason, idempotencyKey: input.idempotencyKey });
}

async function lockBatch(tx: Prisma.TransactionClient, actor: TaxActor, id: string) {
  await tx.$queryRaw`SELECT id FROM "TaxAnnualBatch" WHERE id=${id} FOR UPDATE`;
  const batch = await tx.taxAnnualBatch.findUniqueOrThrow({ where: { id } });
  if (batch.actorUsuarioId !== actor.usuarioId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(batch.budgetUnitId))) throw new TaxError("Lote anual fora do responsável/UG autorizados.");
  const scope = await resolveTaxAssessmentScope(tx, actor, batch.taxId);
  if (scope.budgetUnitId !== batch.budgetUnitId || scope.governmentEntityId !== batch.governmentEntityId) throw new TaxError("O mapeamento arrecadador diverge do escopo congelado do lote.");
  return batch;
}

async function audit(tx: Prisma.TransactionClient, actor: TaxActor, id: string, action: string, payload: Prisma.InputJsonValue) {
  await tx.taxAuditLog.create({ data: { entityType: "TaxAnnualBatch", entityId: id, action, payload, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId } });
}

export async function simulateTaxAnnualBatch(db: PrismaClient, actor: TaxActor, raw: AnnualBatchInput) {
  const input = annualBatchInput.parse(raw);
  const competence = new Date(`${input.competence}T12:00:00.000Z`);
  const normalized = { ...input, targets: [...input.targets].sort((a, b) => a.targetId.localeCompare(b.targetId)).map(target => ({ ...target, taxableBase: new Prisma.Decimal(target.taxableBase).toFixed(2) })) };
  return db.$transaction(async tx => {
    const scope = await resolveTaxAssessmentScope(tx, actor, input.taxId);
    if (!scope.budgetUnitId || !scope.governmentEntityId) throw new TaxError("Lote anual exige ente/UG duráveis na configuração arrecadadora.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`TAX_ANNUAL:${scope.governmentEntityId}:${input.idempotencyKey}`},0))::text`;
    const existing = await tx.taxAnnualBatch.findUnique({ where: { governmentEntityId_idempotencyKey: { governmentEntityId: scope.governmentEntityId, idempotencyKey: input.idempotencyKey } } });
    if (existing) { if (existing.actorUsuarioId !== actor.usuarioId || existing.budgetUnitId !== scope.budgetUnitId || existing.requestHash !== digest(normalized)) throw new TaxError("Chave da simulação reutilizada com outros dados ou responsável."); return existing; }
    const year = await resolveTaxFinancialYear(tx, competence.getUTCFullYear(), scope, false);
    const rule = await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: competence });
    await tx.$queryRaw`SELECT id FROM "TaxParameter" WHERE id=${rule.parameter.id} FOR SHARE`;
    const frozenRule = ruleMemory(await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: competence }));
    const items = [];
    for (const target of normalized.targets) {
      let baseSource: ReturnType<typeof propertyValuationMemory> | null = null;
      if (target.propertyValuationId) {
        if (input.targetType !== "REAL_ESTATE") throw new TaxError("Avaliação imobiliária só pode gerar base de imóvel.");
        await tx.$queryRaw`SELECT id FROM "PropertyValuation" WHERE id=${target.propertyValuationId} FOR SHARE`;
        const valuation = await tx.propertyValuation.findUniqueOrThrow({ where: { id: target.propertyValuationId } });
        if (valuation.realEstateId !== target.targetId || valuation.year !== year.year || !valuation.venalValueDecimal.eq(target.taxableBase) || !valuation.source.trim()) throw new TaxError("Base difere da avaliação canônica do imóvel/exercício.");
        baseSource = propertyValuationMemory(valuation);
      }
      const property = input.targetType === "REAL_ESTATE" ? await tx.realEstate.findUniqueOrThrow({ where: { id: target.targetId }, select: { taxpayerId: true, updatedAt: true } }) : null;
      const registration = input.targetType === "ECONOMIC_REGISTRATION" ? await tx.economicRegistration.findUniqueOrThrow({ where: { id: target.targetId }, select: { taxpayerId: true, updatedAt: true, status: true } }) : null;
      if (property && !property.taxpayerId) throw new TaxError("Inscrição imobiliária sem contribuinte responsável; concilie o cadastro antes da geração anual.");
      if (registration && registration.status !== "Ativo") throw new TaxError("Inscrição econômica deve estar ativa para geração anual.");
      const taxpayerId = property?.taxpayerId ?? registration?.taxpayerId ?? target.targetId;
      const taxpayer = await tx.taxpayer.findUniqueOrThrow({ where: { id: taxpayerId }, select: { status: true, updatedAt: true } });
      if (taxpayer.status !== "Ativo") throw new TaxError("Todos os contribuintes da simulação devem estar ativos.");
      const simulation = await simulateParametrizedAssessment(tx, { taxId: input.taxId, parameterId: input.parameterId, taxableBase: target.taxableBase, effectiveAt: competence });
      items.push({ targetId: target.targetId, taxpayerId, taxableBase: new Prisma.Decimal(target.taxableBase), simulatedAmount: simulation.calculation.principal, snapshot: json({ effect: simulation.effect, calculation: simulation.calculation.memory, schedule: simulation.calculation.schedule.map(row => ({ ...row, amount: row.amount.toFixed(2) })), targetUpdatedAt: (property?.updatedAt ?? registration?.updatedAt ?? taxpayer.updatedAt).toISOString(), taxpayerUpdatedAt: taxpayer.updatedAt.toISOString(), ruleHash: digest(frozenRule), baseSource }) });
    }
    const batch = await tx.taxAnnualBatch.create({ data: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, financialYearId: year.id, taxId: input.taxId, parameterId: input.parameterId, year: year.year, competence, targetType: input.targetType, actorUsuarioId: actor.usuarioId, idempotencyKey: input.idempotencyKey, requestHash: digest(normalized), ruleSnapshot: json(frozenRule), reason: input.reason, items: { create: items } } });
    await audit(tx, actor, batch.id, "ANNUAL_SIMULATED", { count: items.length, amount: items.reduce((sum, item) => sum.plus(item.simulatedAmount), new Prisma.Decimal(0)).toFixed(2), effect: "SIMULACAO_SEM_EFEITO" });
    return batch;
  }, { timeout: 120000 });
}

export async function queueTaxAnnualBatch(db: PrismaClient, actor: TaxActor, input: { batchId: string; scheduledAt: Date; reason: string }) {
  if (!Number.isFinite(input.scheduledAt.getTime()) || input.reason.trim().length < 10) throw new TaxError("Informe data e fundamento de efetivação/reapresentação.");
  return db.$transaction(async tx => {
    const batch = await lockBatch(tx, actor, input.batchId);
    if (["COMPLETED", "CANCELLED"].includes(batch.status)) throw new TaxError("Lote encerrado não pode ser reapresentado.");
    if (batch.status === "QUEUED" && batch.scheduledAt?.getTime() === input.scheduledAt.getTime() && !await tx.taxAnnualBatchItem.count({ where: { batchId: batch.id, status: "FAILED" } })) {
      const prior = await tx.taxAuditLog.findFirst({ where: { entityType: "TaxAnnualBatch", entityId: batch.id, action: "ANNUAL_QUEUED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { payload: true } });
      if ((prior?.payload as Prisma.JsonObject | undefined)?.reason !== input.reason.trim()) throw new TaxError("Agendamento já registrado com outro fundamento.");
      return batch;
    }
    const rule = await resolveFiscalRule(tx, { taxId: batch.taxId, parameterId: batch.parameterId, effectiveAt: batch.competence });
    if (digest(ruleMemory(rule)) !== digest(batch.ruleSnapshot)) throw new TaxError("Regra fiscal diverge da simulação; crie uma nova simulação.");
    await resolveTaxFinancialYear(tx, batch.year, { governmentEntityId: batch.governmentEntityId });
    await tx.taxAnnualBatchItem.updateMany({ where: { batchId: batch.id, status: "FAILED" }, data: { status: "PENDING", error: null } });
    const queued = await tx.taxAnnualBatch.update({ where: { id: batch.id }, data: { status: "QUEUED", scheduledAt: input.scheduledAt, queuedAt: new Date() } });
    await audit(tx, actor, batch.id, "ANNUAL_QUEUED", { scheduledAt: input.scheduledAt.toISOString(), reason: input.reason.trim() });
    return queued;
  });
}

export async function processTaxAnnualBatch(db: PrismaClient, actor: TaxActor, batchId: string, limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TaxError("Limite de processamento inválido.");
  let processed = 0;
  const failures: string[] = [];
  for (let at = 0; at < limit; at++) {
    let itemId: string | undefined;
    try {
      const done = await db.$transaction(async tx => {
        const batch = await lockBatch(tx, actor, batchId);
        if (!["QUEUED", "RUNNING"].includes(batch.status) || !batch.scheduledAt || batch.scheduledAt > new Date()) return false;
        const item = await tx.taxAnnualBatchItem.findFirst({ where: { batchId, status: "PENDING" }, orderBy: { id: "asc" } });
        if (!item) {
          if (!await tx.taxAnnualBatchItem.count({ where: { batchId, status: { not: "COMPLETED" } } })) await tx.taxAnnualBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", completedAt: new Date() } });
          return false;
        }
        itemId = item.id;
        const frozen = item.snapshot as Prisma.JsonObject;
        if (frozen.baseSource && typeof frozen.baseSource === "object" && !Array.isArray(frozen.baseSource)) {
          const valuationId = frozen.baseSource.id;
          if (typeof valuationId !== "string") throw new TaxError("Memória da avaliação anual inválida.");
          await tx.$queryRaw`SELECT id FROM "PropertyValuation" WHERE id=${valuationId} FOR SHARE`;
          const valuation = await tx.propertyValuation.findUniqueOrThrow({ where: { id: valuationId } });
          if (digest(propertyValuationMemory(valuation)) !== digest(frozen.baseSource)) throw new TaxError("Avaliação anual foi alterada após a simulação; gere uma nova base/simulação.");
        }
        await tx.$queryRaw`SELECT id FROM "Taxpayer" WHERE id=${item.taxpayerId} FOR SHARE`;
        const taxpayer = await tx.taxpayer.findUniqueOrThrow({ where: { id: item.taxpayerId }, select: { updatedAt: true } });
        let targetUpdatedAt = taxpayer.updatedAt;
        if (batch.targetType === "REAL_ESTATE") {
          await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${item.targetId} FOR SHARE`;
          targetUpdatedAt = (await tx.realEstate.findUniqueOrThrow({ where: { id: item.targetId }, select: { updatedAt: true } })).updatedAt;
        } else if (batch.targetType === "ECONOMIC_REGISTRATION") {
          await tx.$queryRaw`SELECT id FROM "EconomicRegistration" WHERE id=${item.targetId} FOR SHARE`;
          targetUpdatedAt = (await tx.economicRegistration.findUniqueOrThrow({ where: { id: item.targetId }, select: { updatedAt: true } })).updatedAt;
        }
        if (frozen.taxpayerUpdatedAt !== taxpayer.updatedAt.toISOString() || frozen.targetUpdatedAt !== targetUpdatedAt.toISOString()) throw new TaxError("Cadastro foi alterado após a simulação; confira a base e crie uma nova simulação.");
        await tx.$queryRaw`SELECT id FROM "TaxParameter" WHERE id=${batch.parameterId} FOR SHARE`;
        const rule = await resolveFiscalRule(tx, { taxId: batch.taxId, parameterId: batch.parameterId, effectiveAt: batch.competence });
        if (digest(ruleMemory(rule)) !== digest(batch.ruleSnapshot)) throw new TaxError("A regra fiscal diverge da simulação congelada.");
        const assessment = await createParametrizedAssessmentInTransaction(tx, actor, { taxId: batch.taxId, parameterId: batch.parameterId, taxpayerId: item.taxpayerId, taxableBase: item.taxableBase.toFixed(2), competence: batch.competence, ...(batch.targetType === "REAL_ESTATE" ? { realEstateId: item.targetId } : {}), ...(batch.targetType === "ECONOMIC_REGISTRATION" ? { economicRegistrationId: item.targetId } : {}), originKey: `ANNUAL:${batch.governmentEntityId}:${batch.year}:${batch.taxId}:${batch.targetType}:${item.targetId}` });
        if (!assessment.originalValueDecimal?.equals(item.simulatedAmount)) throw new TaxError("Valor efetivado diverge da simulação individual.");
        const assessmentMemory = assessment.calculationSnapshot as Prisma.JsonObject;
        if (assessmentMemory.budgetUnitId !== batch.budgetUnitId || assessmentMemory.governmentEntityId !== batch.governmentEntityId || assessmentMemory.financialYearId !== batch.financialYearId) throw new TaxError("Escopo/exercício efetivado diverge da simulação congelada.");
        await tx.taxAnnualBatchItem.update({ where: { id: item.id }, data: { status: "COMPLETED", assessmentId: assessment.id, completedAt: new Date(), attempts: { increment: 1 }, error: null } });
        const remaining = await tx.taxAnnualBatchItem.count({ where: { batchId, status: { not: "COMPLETED" } } });
        await tx.taxAnnualBatch.update({ where: { id: batchId }, data: { status: remaining ? "RUNNING" : "COMPLETED", ...(remaining ? {} : { completedAt: new Date() }) } });
        await audit(tx, actor, batchId, "ANNUAL_ITEM_COMPLETED", { itemId: item.id, assessmentId: assessment.id, amount: item.simulatedAmount.toFixed(2) });
        return true;
      }, { timeout: 60000 });
      if (!done) break;
      processed++;
    } catch (error) {
      if (!itemId) throw error;
      const failedId = itemId;
      await db.$transaction(async tx => {
        const batch = await lockBatch(tx, actor, batchId);
        if (!["QUEUED", "RUNNING"].includes(batch.status)) return;
        const changed = await tx.taxAnnualBatchItem.updateMany({ where: { id: failedId, batchId, status: "PENDING" }, data: { status: "FAILED", attempts: { increment: 1 }, error: error instanceof TaxError ? error.message.slice(0, 2000) : "Falha transacional; nenhuma efetivação foi confirmada para esta tentativa." } });
        if (changed.count) await audit(tx, actor, batchId, "ANNUAL_ITEM_FAILED", { itemId: failedId });
      });
      failures.push(failedId);
    }
  }
  return { processed, failures };
}

export async function cancelTaxAnnualBatch(db: PrismaClient, actor: TaxActor, input: { batchId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new TaxError("Fundamente o cancelamento do lote.");
  return db.$transaction(async tx => {
    const batch = await lockBatch(tx, actor, input.batchId);
    if (batch.status === "CANCELLED") {
      const prior = await tx.taxAuditLog.findFirst({ where: { entityType: "TaxAnnualBatch", entityId: batch.id, action: "ANNUAL_CANCELLED" }, select: { payload: true } });
      if ((prior?.payload as Prisma.JsonObject | undefined)?.reason !== input.reason.trim()) throw new TaxError("Cancelamento já registrado com outro fundamento.");
      return batch;
    }
    if (await tx.taxAnnualBatchItem.count({ where: { batchId: batch.id, status: "COMPLETED" } })) throw new TaxError("Lote possui lançamentos efetivados; utilize as revisões/estornos fiscais individuais, preservando as origens.");
    const cancelled = await tx.taxAnnualBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, batch.id, "ANNUAL_CANCELLED", { reason: input.reason.trim() });
    return cancelled;
  });
}
