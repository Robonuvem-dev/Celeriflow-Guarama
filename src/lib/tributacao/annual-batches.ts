import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseTransaction } from "@/db/transaction";
import { withDatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { annualBatches, annualBatchItems } from "@/db/schema/tax-annual";
import { pageValuations } from "@/db/schema/taxation-pages";
import { annualJson as json, annualObject, annualRequired, countAnnualItems, findAnnualAudit, findAnnualBatch, insertAnnualAudit, lockAnnualKey, lockAnnualRow, nextAnnualItem, readAnnualBatch, readAnnualProperty, readAnnualRegistration, readAnnualTaxpayer, readAnnualValuation } from "@/db/repositories/tax-annual/records";
import { z } from "zod";
import { TaxError, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear } from "./scope";
import { resolveFiscalRule, simulateParametrizedAssessment, createParametrizedAssessmentInTransaction } from "./s2-service";

export const annualBatchInput = z.object({ taxId: z.string().min(1), parameterId: z.string().min(1), competence: z.iso.date(), targetType: z.enum(["TAXPAYER", "REAL_ESTATE", "ECONOMIC_REGISTRATION"]), targets: z.array(z.object({ targetId: z.string().min(1), taxableBase: z.string().regex(/^\d{1,22}(?:\.\d{1,2})?$/), propertyValuationId: z.string().min(1).optional() }).strict()).min(1).max(5000), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(150) }).strict().refine(input => new Set(input.targets.map(target => target.targetId)).size === input.targets.length, "Selecione alvos distintos.");
export type AnnualBatchInput = z.infer<typeof annualBatchInput>;
function digest(value: unknown) {
  const sort = (entry: JsonValue): JsonValue => Array.isArray(entry) ? entry.map(sort) : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).flatMap(([key, value]) => value === undefined ? [] : [[key, sort(value)]])) : entry;
  return createHash("sha256").update(JSON.stringify(sort(JSON.parse(JSON.stringify(value))))).digest("hex");
}
const ruleMemory = (rule: Awaited<ReturnType<typeof resolveFiscalRule>>) => ({ parameterId: rule.parameter.id, configuration: rule.configuration, effectiveFrom: rule.parameter.effectiveFrom.toISOString(), effectiveUntil: rule.parameter.effectiveUntil?.toISOString() ?? null });

const propertyValuationMemory = (value: { id: string; realEstateId: string; year: number; venalValueDecimal: Decimal; landUnitValue: Decimal | null; constructionUnitValue: Decimal | null; source: string; updatedAt: Date }) => ({ id: value.id, realEstateId: value.realEstateId, year: value.year, venalValue: value.venalValueDecimal.toFixed(2), landUnitValue: value.landUnitValue?.toFixed(6) ?? null, constructionUnitValue: value.constructionUnitValue?.toFixed(6) ?? null, source: value.source, updatedAt: value.updatedAt.toISOString() });

/** Generates the selected bases from the canonical annual Decimal valuations;
 * missing assessments are inconsistencies, never zero/previous-year estimates. */
export async function simulateTaxAnnualPropertyBatch(connection: DatabaseConnection, actor: TaxActor, raw: { taxId: string; parameterId: string; year: number; realEstateIds: string[]; reason: string; idempotencyKey: string }) {
  const input = z.object({ taxId: z.string().min(1), parameterId: z.string().min(1), year: z.number().int().min(1900).max(2200), realEstateIds: z.array(z.string().min(1)).min(1).max(5000), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(150) }).strict().parse(raw);
  if (new Set(input.realEstateIds).size !== input.realEstateIds.length) throw new TaxError("Selecione inscrições imobiliárias distintas.");
  await resolveTaxAssessmentScope(connection.db, actor, input.taxId);
  const values = await connection.db.select().from(pageValuations).where(and(inArray(pageValuations.realEstateId, input.realEstateIds), eq(pageValuations.year, input.year)));
  const targets = input.realEstateIds.map(targetId => {
    const value = values.find(row => row.realEstateId === targetId);
    if (!value || value.venalValueDecimal.lte(0) || !value.source.trim()) throw new TaxError(`Imóvel ${targetId} sem avaliação Decimal positiva e fundamentada no exercício ${input.year}.`);
    return { targetId, taxableBase: value.venalValueDecimal.toFixed(2), propertyValuationId: value.id };
  });
  return simulateTaxAnnualBatch(connection, actor, { taxId: input.taxId, parameterId: input.parameterId, competence: `${input.year}-01-01`, targetType: "REAL_ESTATE", targets, reason: input.reason, idempotencyKey: input.idempotencyKey });
}

async function lockBatch(tx: DatabaseTransaction, actor: TaxActor, id: string) {
  await lockAnnualRow(tx, "TaxAnnualBatch", id, "UPDATE");
  const batch = await readAnnualBatch(tx, id);
  if (batch.actorUsuarioId !== actor.usuarioId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(batch.budgetUnitId))) throw new TaxError("Lote anual fora do responsável/UG autorizados.");
  const scope = await resolveTaxAssessmentScope(tx, actor, batch.taxId);
  if (scope.budgetUnitId !== batch.budgetUnitId || scope.governmentEntityId !== batch.governmentEntityId) throw new TaxError("O mapeamento arrecadador diverge do escopo congelado do lote.");
  return batch;
}

async function audit(tx: DatabaseTransaction, actor: TaxActor, id: string, action: string, payload: JsonValue) {
  await insertAnnualAudit(tx, actor, { entityType: "TaxAnnualBatch", entityId: id, action, payload });
}

export async function simulateTaxAnnualBatch(connection: DatabaseConnection, actor: TaxActor, raw: AnnualBatchInput) {
  const input = annualBatchInput.parse(raw);
  const competence = new Date(`${input.competence}T12:00:00.000Z`);
  const normalized = { ...input, targets: [...input.targets].sort((a, b) => a.targetId.localeCompare(b.targetId)).map(target => ({ ...target, taxableBase: new Decimal(target.taxableBase).toFixed(2) })) };
  return withDatabaseTransaction(connection, async tx => {
    const scope = await resolveTaxAssessmentScope(tx, actor, input.taxId);
    if (!scope.budgetUnitId || !scope.governmentEntityId) throw new TaxError("Lote anual exige ente/UG duráveis na configuração arrecadadora.");
    await lockAnnualKey(tx, `TAX_ANNUAL:${scope.governmentEntityId}:${input.idempotencyKey}`);
    const existing = await findAnnualBatch(tx, scope.governmentEntityId, input.idempotencyKey);
    if (existing) { if (existing.actorUsuarioId !== actor.usuarioId || existing.budgetUnitId !== scope.budgetUnitId || existing.requestHash !== digest(normalized)) throw new TaxError("Chave da simulação reutilizada com outros dados ou responsável."); return existing; }
    const year = await resolveTaxFinancialYear(tx, competence.getUTCFullYear(), scope, false);
    const rule = await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: competence });
    await lockAnnualRow(tx, "TaxParameter", rule.parameter.id, "SHARE");
    const frozenRule = ruleMemory(await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: competence }));
    const items = [];
    for (const target of normalized.targets) {
      let baseSource: ReturnType<typeof propertyValuationMemory> | null = null;
      if (target.propertyValuationId) {
        if (input.targetType !== "REAL_ESTATE") throw new TaxError("Avaliação imobiliária só pode gerar base de imóvel.");
        await lockAnnualRow(tx, "PropertyValuation", target.propertyValuationId, "SHARE");
        const valuation = await readAnnualValuation(tx, target.propertyValuationId);
        if (valuation.realEstateId !== target.targetId || valuation.year !== year.year || !valuation.venalValueDecimal.eq(target.taxableBase) || !valuation.source.trim()) throw new TaxError("Base difere da avaliação canônica do imóvel/exercício.");
        baseSource = propertyValuationMemory(valuation);
      }
      const property = input.targetType === "REAL_ESTATE" ? await readAnnualProperty(tx, target.targetId) : null;
      const registration = input.targetType === "ECONOMIC_REGISTRATION" ? await readAnnualRegistration(tx, target.targetId) : null;
      if (property && !property.taxpayerId) throw new TaxError("Inscrição imobiliária sem contribuinte responsável; concilie o cadastro antes da geração anual.");
      if (registration && registration.status !== "Ativo") throw new TaxError("Inscrição econômica deve estar ativa para geração anual.");
      const taxpayerId = property?.taxpayerId ?? registration?.taxpayerId ?? target.targetId;
      const taxpayer = await readAnnualTaxpayer(tx, taxpayerId);
      if (taxpayer.status !== "Ativo") throw new TaxError("Todos os contribuintes da simulação devem estar ativos.");
      const simulation = await simulateParametrizedAssessment(tx, { taxId: input.taxId, parameterId: input.parameterId, taxableBase: target.taxableBase, effectiveAt: competence });
      items.push({ targetId: target.targetId, taxpayerId, taxableBase: new Decimal(target.taxableBase), simulatedAmount: simulation.calculation.principal, snapshot: json({ effect: simulation.effect, calculation: simulation.calculation.memory, schedule: simulation.calculation.schedule.map(row => ({ ...row, amount: row.amount.toFixed(2) })), targetUpdatedAt: (property?.updatedAt ?? registration?.updatedAt ?? taxpayer.updatedAt).toISOString(), taxpayerUpdatedAt: taxpayer.updatedAt.toISOString(), ruleHash: digest(frozenRule), baseSource }) });
    }
    const batch = annualRequired((await tx.insert(annualBatches).values({ governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, financialYearId: year.id, taxId: input.taxId, parameterId: input.parameterId, year: year.year, competence, targetType: input.targetType, actorUsuarioId: actor.usuarioId, idempotencyKey: input.idempotencyKey, requestHash: digest(normalized), ruleSnapshot: json(frozenRule), reason: input.reason }).returning())[0], "Lote anual");
    // Chunk bound parameters, retaining the one simulation transaction and all
    // 5,000 supported targets (no PostgreSQL protocol parameter overflow).
    for (let at = 0; at < items.length; at += 500) await tx.insert(annualBatchItems).values(items.slice(at, at + 500).map(item => ({ ...item, batchId: batch.id })));
    await audit(tx, actor, batch.id, "ANNUAL_SIMULATED", { count: items.length, amount: items.reduce((sum, item) => sum.plus(item.simulatedAmount), new Decimal(0)).toFixed(2), effect: "SIMULACAO_SEM_EFEITO" });
    return batch;
  }, { timeoutMs: 120000 });
}

export async function queueTaxAnnualBatch(connection: DatabaseConnection, actor: TaxActor, input: { batchId: string; scheduledAt: Date; reason: string }) {
  if (!Number.isFinite(input.scheduledAt.getTime()) || input.reason.trim().length < 10) throw new TaxError("Informe data e fundamento de efetivação/reapresentação.");
  return withDatabaseTransaction(connection, async tx => {
    const batch = await lockBatch(tx, actor, input.batchId);
    if (["COMPLETED", "CANCELLED"].includes(batch.status)) throw new TaxError("Lote encerrado não pode ser reapresentado.");
    if (batch.status === "QUEUED" && batch.scheduledAt?.getTime() === input.scheduledAt.getTime() && !await countAnnualItems(tx, batch.id, "FAILED")) {
      const prior = await findAnnualAudit(tx, batch.id, "ANNUAL_QUEUED", true);
      if (annualObject(prior?.payload).reason !== input.reason.trim()) throw new TaxError("Agendamento já registrado com outro fundamento.");
      return batch;
    }
    const rule = await resolveFiscalRule(tx, { taxId: batch.taxId, parameterId: batch.parameterId, effectiveAt: batch.competence });
    if (digest(ruleMemory(rule)) !== digest(batch.ruleSnapshot)) throw new TaxError("Regra fiscal diverge da simulação; crie uma nova simulação.");
    await resolveTaxFinancialYear(tx, batch.year, { governmentEntityId: batch.governmentEntityId });
    await tx.update(annualBatchItems).set({ status: "PENDING", error: null }).where(and(eq(annualBatchItems.batchId, batch.id), eq(annualBatchItems.status, "FAILED")));
    const queued = annualRequired((await tx.update(annualBatches).set({ status: "QUEUED", scheduledAt: input.scheduledAt, queuedAt: new Date() }).where(eq(annualBatches.id, batch.id)).returning())[0], "Lote anual");
    await audit(tx, actor, batch.id, "ANNUAL_QUEUED", { scheduledAt: input.scheduledAt.toISOString(), reason: input.reason.trim() });
    return queued;
  });
}

export async function processTaxAnnualBatch(connection: DatabaseConnection, actor: TaxActor, batchId: string, limit = 25) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TaxError("Limite de processamento inválido.");
  let processed = 0;
  const failures: string[] = [];
  for (let at = 0; at < limit; at++) {
    let itemId: string | undefined;
    try {
      const done = await withDatabaseTransaction(connection, async tx => {
        const batch = await lockBatch(tx, actor, batchId);
        if (!["QUEUED", "RUNNING"].includes(batch.status) || !batch.scheduledAt || batch.scheduledAt > new Date()) return false;
        const item = await nextAnnualItem(tx, batchId);
        if (!item) {
          if (!await countAnnualItems(tx, batchId, "COMPLETED", true)) await tx.update(annualBatches).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(annualBatches.id, batchId));
          return false;
        }
        itemId = item.id;
        const frozen = annualObject(item.snapshot);
        if (frozen.baseSource && typeof frozen.baseSource === "object" && !Array.isArray(frozen.baseSource)) {
          const valuationId = frozen.baseSource.id;
          if (typeof valuationId !== "string") throw new TaxError("Memória da avaliação anual inválida.");
          await lockAnnualRow(tx, "PropertyValuation", valuationId, "SHARE");
          const valuation = await readAnnualValuation(tx, valuationId);
          if (digest(propertyValuationMemory(valuation)) !== digest(frozen.baseSource)) throw new TaxError("Avaliação anual foi alterada após a simulação; gere uma nova base/simulação.");
        }
        await lockAnnualRow(tx, "Taxpayer", item.taxpayerId, "SHARE");
        const taxpayer = await readAnnualTaxpayer(tx, item.taxpayerId);
        let targetUpdatedAt = taxpayer.updatedAt;
        if (batch.targetType === "REAL_ESTATE") {
          await lockAnnualRow(tx, "RealEstate", item.targetId, "SHARE");
          targetUpdatedAt = (await readAnnualProperty(tx, item.targetId)).updatedAt;
        } else if (batch.targetType === "ECONOMIC_REGISTRATION") {
          await lockAnnualRow(tx, "EconomicRegistration", item.targetId, "SHARE");
          targetUpdatedAt = (await readAnnualRegistration(tx, item.targetId)).updatedAt;
        }
        if (frozen.taxpayerUpdatedAt !== taxpayer.updatedAt.toISOString() || frozen.targetUpdatedAt !== targetUpdatedAt.toISOString()) throw new TaxError("Cadastro foi alterado após a simulação; confira a base e crie uma nova simulação.");
        await lockAnnualRow(tx, "TaxParameter", batch.parameterId, "SHARE");
        const rule = await resolveFiscalRule(tx, { taxId: batch.taxId, parameterId: batch.parameterId, effectiveAt: batch.competence });
        if (digest(ruleMemory(rule)) !== digest(batch.ruleSnapshot)) throw new TaxError("A regra fiscal diverge da simulação congelada.");
        const assessment = await createParametrizedAssessmentInTransaction(tx, actor, { taxId: batch.taxId, parameterId: batch.parameterId, taxpayerId: item.taxpayerId, taxableBase: item.taxableBase.toFixed(2), competence: batch.competence, ...(batch.targetType === "REAL_ESTATE" ? { realEstateId: item.targetId } : {}), ...(batch.targetType === "ECONOMIC_REGISTRATION" ? { economicRegistrationId: item.targetId } : {}), originKey: `ANNUAL:${batch.governmentEntityId}:${batch.year}:${batch.taxId}:${batch.targetType}:${item.targetId}` });
        if (!assessment.originalValueDecimal?.equals(item.simulatedAmount)) throw new TaxError("Valor efetivado diverge da simulação individual.");
        const assessmentMemory = annualObject(assessment.calculationSnapshot);
        if (assessmentMemory.budgetUnitId !== batch.budgetUnitId || assessmentMemory.governmentEntityId !== batch.governmentEntityId || assessmentMemory.financialYearId !== batch.financialYearId) throw new TaxError("Escopo/exercício efetivado diverge da simulação congelada.");
        await tx.update(annualBatchItems).set({ status: "COMPLETED", assessmentId: assessment.id, completedAt: new Date(), attempts: sql`${annualBatchItems.attempts}+1`, error: null }).where(eq(annualBatchItems.id, item.id));
        const remaining = await countAnnualItems(tx, batchId, "COMPLETED", true);
        await tx.update(annualBatches).set({ status: remaining ? "RUNNING" : "COMPLETED", ...(remaining ? {} : { completedAt: new Date() }) }).where(eq(annualBatches.id, batchId));
        await audit(tx, actor, batchId, "ANNUAL_ITEM_COMPLETED", { itemId: item.id, assessmentId: assessment.id, amount: item.simulatedAmount.toFixed(2) });
        return true;
      }, { timeoutMs: 60000 });
      if (!done) break;
      processed++;
    } catch (error) {
      if (!itemId) throw error;
      const failedId = itemId;
      await withDatabaseTransaction(connection, async tx => {
        const batch = await lockBatch(tx, actor, batchId);
        if (!["QUEUED", "RUNNING"].includes(batch.status)) return;
        const changed = await tx.update(annualBatchItems).set({ status: "FAILED", attempts: sql`${annualBatchItems.attempts}+1`, error: error instanceof TaxError ? error.message.slice(0, 2000) : "Falha transacional; nenhuma efetivação foi confirmada para esta tentativa." }).where(and(eq(annualBatchItems.id, failedId), eq(annualBatchItems.batchId, batchId), eq(annualBatchItems.status, "PENDING"))).returning({ id: annualBatchItems.id });
        if (changed.length) await audit(tx, actor, batchId, "ANNUAL_ITEM_FAILED", { itemId: failedId });
      });
      failures.push(failedId);
    }
  }
  return { processed, failures };
}

export async function cancelTaxAnnualBatch(connection: DatabaseConnection, actor: TaxActor, input: { batchId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new TaxError("Fundamente o cancelamento do lote.");
  return withDatabaseTransaction(connection, async tx => {
    const batch = await lockBatch(tx, actor, input.batchId);
    if (batch.status === "CANCELLED") {
      const prior = await findAnnualAudit(tx, batch.id, "ANNUAL_CANCELLED");
      if (annualObject(prior?.payload).reason !== input.reason.trim()) throw new TaxError("Cancelamento já registrado com outro fundamento.");
      return batch;
    }
    if (await countAnnualItems(tx, batch.id, "COMPLETED")) throw new TaxError("Lote possui lançamentos efetivados; utilize as revisões/estornos fiscais individuais, preservando as origens.");
    const cancelled = annualRequired((await tx.update(annualBatches).set({ status: "CANCELLED" }).where(eq(annualBatches.id, batch.id)).returning())[0], "Lote anual");
    await audit(tx, actor, batch.id, "ANNUAL_CANCELLED", { reason: input.reason.trim() });
    return cancelled;
  });
}
