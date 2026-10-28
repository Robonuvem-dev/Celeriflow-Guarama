import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { cancelCostSource, findCostMovementReplay, findCostPolicy, findCostRecognitionYear, findCostReductionReplay, findCostRule, findCostSource, findCostSourceByOrigin, hasCostCorrection, insertCostMovement, insertCostPolicy, insertCostReduction, insertCostSource, listApplicableCostRules, readCostMovementOrigin, readCostPairDefinitions, readCostPosition, readCostReductions } from "@/db/repositories/finance/cost-ledger";
import { createHash } from "node:crypto";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { assertAccountingPeriodOpen } from "./index";
import { costSourceTypes, type CostActor, type CostAmount, type CostShare, type CostSourceType } from "./cost-types";
import type { DatabaseExecutor } from "@/db/transaction";
import type { FinancialYearRecord } from "@/lib/contracts/finance-scope";
import { findFinancialScopeYear, listCostScopeUnits } from "@/db/repositories/finance/report-scopes";
import { MunicipalCostError } from "./cost-errors";

export { MunicipalCostError } from "./cost-errors";
type Tx = DatabaseTransaction;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const required = (value: string, label: string) => { if (!value?.trim()) throw new MunicipalCostError(`${label} é obrigatório.`); return value.trim(); };
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sourceMemoryFingerprint(value: unknown): string {
  // The caller parses serialized JSON, so every enumerated key has a JSON value.
  const normalize = (entry: JsonValue): JsonValue => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object" ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, normalize(entry[key]!)])) : entry;
  return fingerprint(normalize(json(value)));
}

export async function assertCostScope(tx: DatabaseExecutor, actor: CostActor, financialYearId: string, budgetUnitId?: string | null, completeEntity = false): Promise<FinancialYearRecord> {
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year?.governmentEntityId) throw new MunicipalCostError("Custos exige exercício vinculado à entidade.");
  const units = await listCostScopeUnits(tx, year.governmentEntityId);
  if (!units.length || (budgetUnitId && !units.some(unit => unit.budgetUnitId === budgetUnitId))) throw new MunicipalCostError("UG de custos não pertence ao exercício.");
  if (actor.allowedBudgetUnitIds && (budgetUnitId ? !actor.allowedBudgetUnitIds.includes(budgetUnitId) : completeEntity ? units.some(unit => !actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId)) : !units.some(unit => actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId)))) throw new MunicipalCostError("Custos fora das unidades gestoras autorizadas.");
  return year;
}

export async function lockCostYear(tx: Tx, financialYearId: string) {
  const key = `MUNICIPAL_COST_YEAR:${financialYearId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}

async function costPeriod(tx: Tx, financialYearId: string, date: Date) {
  if (!Number.isFinite(date.getTime())) throw new MunicipalCostError("Data da apropriação inválida.");
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new MunicipalCostError("Exercício financeiro não encontrado.");
  if (year.status !== "Aberto" || date < year.startDate || date > new Date(Date.UTC(year.year + 1, 0, 1) - 1)) throw new MunicipalCostError("A apropriação exige exercício aberto e data no exercício.");
  await assertAccountingPeriodOpen(tx, financialYearId, date);
}

/** Keep the acquisition/source year intact and recognize a later fact in its own entity-year. */
export async function resolveCostRecognitionYear(tx: Tx, actor: CostActor, originFinancialYearId: string, budgetUnitId: string | null, date: Date) {
  if (!Number.isFinite(date.getTime())) throw new MunicipalCostError("Data do fato de custos inválida.");
  const originYear = await assertCostScope(tx, actor, originFinancialYearId, budgetUnitId);
  const year = await findCostRecognitionYear(tx, originYear.governmentEntityId!, date.getUTCFullYear());
  if (!year) throw new MunicipalCostError("Fato de custos exige exercício da mesma entidade na data do movimento.");
  await assertCostScope(tx, actor, year.id, budgetUnitId);
  await costPeriod(tx, year.id, date);
  return year;
}

async function policyFor(tx: Tx, governmentEntityId: string, date: Date) {
  return findCostPolicy(tx, governmentEntityId, date);
}

export async function configureMunicipalCosts(db: DatabaseConnection, actor: CostActor, input: { financialYearId: string; enabled: boolean; sourceTypes: CostSourceType[]; effectiveFrom: Date; reason: string }) {
  const reason = required(input.reason, "Justificativa");
  if (typeof input.enabled !== "boolean" || !Number.isFinite(input.effectiveFrom.getTime()) || !Array.isArray(input.sourceTypes) || input.sourceTypes.some(type => !costSourceTypes.includes(type)) || new Set(input.sourceTypes).size !== input.sourceTypes.length) throw new MunicipalCostError("Configuração de custos inválida.");
  return withDatabaseTransaction(db, async tx => {
    await lockCostYear(tx, input.financialYearId);
    const year = await assertCostScope(tx, actor, input.financialYearId, undefined, true);
    const policy = await insertCostPolicy(tx, { governmentEntityId: year.governmentEntityId!, enabled: input.enabled, effectiveFrom: input.effectiveFrom, sourceTypes: [...input.sourceTypes].sort(), reason, actorId: actor.usuarioId });
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_POLICY", targetId: policy.id });
    return policy;
  });
}

export async function validateCostPairs(tx: Tx, actor: CostActor, financialYearId: string, budgetUnitId: string | null, pairs: Array<{ objectId: string; itemId: string }>) {
  if (!pairs.length || pairs.length > 200 || new Set(pairs.map(pair => `${pair.objectId}:${pair.itemId}`)).size !== pairs.length) throw new MunicipalCostError("Selecione de 1 a 200 pares objeto/item distintos.");
  for (const pair of pairs) {
    const [link] = await readCostPairDefinitions(tx, [pair]);
    if (!link || !link.object.isActive || !link.item.isActive || link.object.financialYearId !== financialYearId || link.item.financialYearId !== financialYearId || (link.object.budgetUnitId && budgetUnitId && link.object.budgetUnitId !== budgetUnitId)) throw new MunicipalCostError("Objeto/item ativo e relacionado deve pertencer ao mesmo exercício e UG da origem.");
    await assertCostScope(tx, actor, financialYearId, link.object.budgetUnitId, !link.object.budgetUnitId);
  }
}

export function distributeCostPercentages(amount: Decimal, shares: CostShare[]): CostAmount[] {
  if (!shares.length || new Set(shares.map(share => `${share.objectId}:${share.itemId}`)).size !== shares.length) throw new MunicipalCostError("Distribuição exige pares distintos.");
  const rows = shares.map(share => {
    const percentage = new Decimal(share.percentage);
    if (!percentage.isFinite() || percentage.lte(0) || percentage.gt(100) || percentage.decimalPlaces() > 4) throw new MunicipalCostError("Percentuais devem ser positivos e ter até quatro casas decimais.");
    const raw = amount.mul(percentage).div(100);
    return { ...share, percentage, raw, value: raw.toDecimalPlaces(2, Decimal.ROUND_DOWN) };
  });
  const total = rows.reduce((sum, row) => sum.plus(row.percentage), new Decimal(0));
  if (total.gt(100)) throw new MunicipalCostError("A soma dos percentuais não pode superar 100%.");
  const target = amount.mul(total).div(100).toDecimalPlaces(2);
  let pennies = target.minus(rows.reduce((sum, row) => sum.plus(row.value), new Decimal(0))).mul(100).toNumber();
  const ordered = [...rows].sort((a, b) => b.raw.minus(b.value).comparedTo(a.raw.minus(a.value)) || `${a.objectId}:${a.itemId}`.localeCompare(`${b.objectId}:${b.itemId}`));
  for (const row of ordered) { if (pennies <= 0) break; row.value = row.value.plus("0.01"); pennies--; }
  return rows.filter(row => row.value.gt(0)).map(row => ({ objectId: row.objectId, itemId: row.itemId, amount: row.value.toFixed(2) }));
}

export async function municipalCostPosition(tx: Tx, sourceId: string) {
  return readCostPosition(tx, sourceId);
}

export async function municipalCostSourceCeiling(tx: DatabaseExecutor, source: { id: string; amount: Decimal }) {
  return source.amount.minus(await readCostReductions(tx, source.id));
}

export async function reduceMunicipalCostSource(tx: Tx, actor: CostActor, input: { sourceId: string; date: Date; amount: Decimal; reason: string; idempotencyKey: string; evidence: unknown }) {
  const origin = await findCostSource(tx, input.sourceId);
  if (!origin) throw new MunicipalCostError("Origem apropriável não encontrada.");
  await assertCostScope(tx, actor, origin.financialYearId, origin.budgetUnitId);
  const requestHash = fingerprint({ ...input, amount: input.amount.toString(), actorId: actor.usuarioId });
  const replay = await findCostReductionReplay(tx, required(input.idempotencyKey, "Chave da redução"));
  if (replay) { if ((replay.snapshot as JsonObject).requestHash !== requestHash) throw new MunicipalCostError("Chave de redução já utilizada com outro conteúdo."); return replay; }
  const recognitionYear = await resolveCostRecognitionYear(tx, actor, origin.financialYearId, origin.budgetUnitId, input.date);
  await lockCostYear(tx, origin.financialYearId);
  if (recognitionYear.id !== origin.financialYearId) await lockCostYear(tx, recognitionYear.id);
  await tx.execute(sql`SELECT id FROM "MunicipalCostSource" WHERE id=${origin.id} FOR UPDATE`);
  const concurrentReplay = await findCostReductionReplay(tx, input.idempotencyKey.trim());
  if (concurrentReplay) { if ((concurrentReplay.snapshot as JsonObject).requestHash !== requestHash) throw new MunicipalCostError("Chave de redução já utilizada com outro conteúdo."); return concurrentReplay; }
  const source = (await findCostSource(tx, origin.id))!;
  const reason = required(input.reason, "Justificativa da redução");
  if (source.status !== "ACTIVE" || input.date < source.expenseDate || !input.amount.isFinite() || input.amount.lte(0) || input.amount.decimalPlaces() > 2) throw new MunicipalCostError("Redução exige origem ativa, data posterior e valor positivo em centavos.");
  const ceiling = (await municipalCostSourceCeiling(tx, source)).minus(input.amount);
  if (ceiling.lt(await municipalCostPosition(tx, source.id))) throw new MunicipalCostError("Estorne as apropriações excedentes antes de devolver o material; o custo não pode superar o consumo remanescente.");
  const reduction = await insertCostReduction(tx, { sourceId: source.id, date: input.date, amount: input.amount, reason, actorId: actor.usuarioId, idempotencyKey: input.idempotencyKey.trim(), snapshot: json({ requestHash, evidence: input.evidence, originFinancialYearId: source.financialYearId, recognitionFinancialYearId: recognitionYear.id, remainingAmount: ceiling.toFixed(2) }) });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_SOURCE_REDUCTION", targetId: reduction.id });
  return reduction;
}

async function allocateInTransaction(tx: Tx, actor: CostActor, input: { sourceId: string; date: Date; reason: string; idempotencyKey: string; allocations: CostAmount[]; ruleId?: string }) {
  const origin = await findCostSource(tx, input.sourceId);
  if (!origin) throw new MunicipalCostError("Origem apropriável não encontrada.");
  const year = await assertCostScope(tx, actor, origin.financialYearId, origin.budgetUnitId);
  let source = origin;
  const reason = required(input.reason, "Justificativa");
  const key = required(input.idempotencyKey, "Chave da apropriação");
  const allocations = input.allocations.map(row => {
    const amount = new Decimal(row.amount);
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw new MunicipalCostError("Valores da distribuição devem ser positivos, em centavos.");
    return { objectId: row.objectId, itemId: row.itemId, amount: amount.toFixed(2) };
  }).sort((a, b) => `${a.objectId}:${a.itemId}`.localeCompare(`${b.objectId}:${b.itemId}`));
  const requestHash = fingerprint({ sourceId: source.id, date: input.date.toISOString(), reason, allocations, ruleId: input.ruleId ?? null });
  const replay = await findCostMovementReplay(tx, key);
  if (replay) { if ((replay.snapshot as JsonObject).requestHash !== requestHash || replay.sourceId !== source.id) throw new MunicipalCostError("Chave já usada com outra apropriação."); return replay; }
  await costPeriod(tx, source.financialYearId, input.date);
  await lockCostYear(tx, origin.financialYearId);
  await tx.execute(sql`SELECT id FROM "MunicipalCostSource" WHERE id = ${origin.id} FOR UPDATE`);
  source = (await findCostSource(tx, origin.id))!;
  const concurrentReplay = await findCostMovementReplay(tx, key);
  if (concurrentReplay) { if ((concurrentReplay.snapshot as JsonObject).requestHash !== requestHash || concurrentReplay.sourceId !== source.id) throw new MunicipalCostError("Chave já usada com outra apropriação."); return concurrentReplay; }
  if (source.status !== "ACTIVE" || input.date < source.expenseDate) throw new MunicipalCostError("A origem deve estar ativa e a apropriação não pode anteceder a despesa.");
  const policy = await policyFor(tx, year.governmentEntityId!, input.date);
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes(source.sourceType)) throw new MunicipalCostError("A entidade não habilitou apropriação para esta origem na data.");
  await validateCostPairs(tx, actor, source.financialYearId, source.budgetUnitId, allocations);
  const total = allocations.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  if ((await municipalCostPosition(tx, source.id)).plus(total).gt(await municipalCostSourceCeiling(tx, source))) throw new MunicipalCostError("A distribuição excede o saldo a apropriar.");
  const definitions = await readCostPairDefinitions(tx, allocations);
  const ruleDefinition = input.ruleId ? await findCostRule(tx, input.ruleId) : null;
  if (input.ruleId && !ruleDefinition) throw new MunicipalCostError("Regra de apropriação não encontrada.");
  const movement = await insertCostMovement(tx, { sourceId: source.id, kind: "ALLOCATION", date: input.date, reason, actorId: actor.usuarioId, idempotencyKey: key, snapshot: json({ requestHash, policyId: policy.id, ruleId: input.ruleId ?? null, ruleDefinition, source: { ...source, amount: source.amount.toFixed(2) }, allocations, definitions }) }, allocations.map(row => ({ ...row, amount: new Decimal(row.amount) })));
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_MOVEMENT", targetId: movement.id });
  return movement;
}

export async function allocateMunicipalCost(db: DatabaseConnection, actor: CostActor, input: { sourceId: string; date: Date; reason: string; idempotencyKey: string; allocations: CostAmount[] }) {
  return withDatabaseTransaction(db, tx => allocateInTransaction(tx, actor, input));
}

export async function correctMunicipalCost(db: DatabaseConnection, actor: CostActor, input: { movementId: string; date: Date; reason: string; idempotencyKey: string; kind: "REVERSAL" | "RESTORATION" }) {
  return withDatabaseTransaction(db, async tx => {
    const original = await readCostMovementOrigin(tx, input.movementId);
    if (!original || !["REVERSAL", "RESTORATION"].includes(input.kind)) throw new MunicipalCostError("Movimento corretivo inválido.");
    await assertCostScope(tx, actor, original.source.financialYearId, original.source.budgetUnitId);
    let source = original.source;
    const reason = required(input.reason, "Justificativa da correção");
    const key = required(input.idempotencyKey, "Chave da correção");
    const requestHash = fingerprint({ movementId: original.id, date: input.date.toISOString(), reason, kind: input.kind });
    const replay = await findCostMovementReplay(tx, key);
    if (replay) { if ((replay.snapshot as JsonObject).requestHash !== requestHash || replay.sourceId !== source.id) throw new MunicipalCostError("Chave já usada com outra correção."); return replay; }
    const recognitionYear = await resolveCostRecognitionYear(tx, actor, source.financialYearId, source.budgetUnitId, input.date);
    await lockCostYear(tx, original.source.financialYearId);
    if (recognitionYear.id !== original.source.financialYearId) await lockCostYear(tx, recognitionYear.id);
    await tx.execute(sql`SELECT id FROM "MunicipalCostSource" WHERE id = ${original.sourceId} FOR UPDATE`);
    source = (await findCostSource(tx, original.sourceId))!;
    const concurrentReplay = await findCostMovementReplay(tx, key);
    if (concurrentReplay) { if ((concurrentReplay.snapshot as JsonObject).requestHash !== requestHash || concurrentReplay.sourceId !== source.id) throw new MunicipalCostError("Chave já usada com outra correção."); return concurrentReplay; }
    if (source.status !== "ACTIVE" || input.date < original.date || (input.kind === "REVERSAL") === (original.kind === "REVERSAL") || await hasCostCorrection(tx, original.id)) throw new MunicipalCostError("Corrija a última posição vigente da cadeia, sem antecipar a data nem alterar origem cancelada.");
    if (input.kind === "RESTORATION") await validateCostPairs(tx, actor, source.financialYearId, source.budgetUnitId, original.allocations);
    const allocations = original.allocations.map(row => ({ objectId: row.objectId, itemId: row.itemId, amount: row.amount.negated() }));
    const balance = (await municipalCostPosition(tx, source.id)).plus(allocations.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)));
    if (balance.lt(0) || balance.gt(await municipalCostSourceCeiling(tx, source))) throw new MunicipalCostError("A correção ultrapassa a posição apropriada ou o teto da origem.");
    const correction = await insertCostMovement(tx, { sourceId: source.id, kind: input.kind, date: input.date, reason, actorId: actor.usuarioId, idempotencyKey: key, referenceMovementId: original.id, snapshot: json({ requestHash, referenceMovementId: original.id, originFinancialYearId: source.financialYearId, recognitionFinancialYearId: recognitionYear.id, previousSnapshot: original.snapshot, allocations: allocations.map(row => ({ ...row, amount: row.amount.toFixed(2) })) }) }, allocations);
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_MOVEMENT", targetId: correction.id });
    return correction;
  });
}

export async function recordMunicipalCostSource(tx: Tx, actor: CostActor, input: { financialYearId: string; budgetUnitId: string; sourceType: CostSourceType; sourceId: string; expenseDate: Date; amount: Decimal; dimensions: Record<string, string>; evidence: unknown }) {
  const year = await findFinancialScopeYear(tx, input.financialYearId);
  if (!year) throw new MunicipalCostError("Exercício financeiro não encontrado.");
  if (!year.governmentEntityId) return null;
  let policy = await policyFor(tx, year.governmentEntityId, input.expenseDate);
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes(input.sourceType)) return null;
  await assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId);
  await costPeriod(tx, input.financialYearId, input.expenseDate);
  await lockCostYear(tx, input.financialYearId);
  policy = await policyFor(tx, year.governmentEntityId, input.expenseDate);
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes(input.sourceType)) return null;
  if (!input.amount.isFinite() || input.amount.lte(0) || input.amount.decimalPlaces() > 2) throw new MunicipalCostError("Origem de custo exige valor Decimal positivo em centavos.");
  const existing = await findCostSourceByOrigin(tx, input.sourceType, input.sourceId);
  if (existing) {
    if (existing.financialYearId !== input.financialYearId || existing.budgetUnitId !== input.budgetUnitId || existing.expenseDate.getTime() !== input.expenseDate.getTime() || !existing.amount.equals(input.amount)) throw new MunicipalCostError("A origem de custo já existe com dados divergentes.");
    const frozen = existing.snapshot as JsonObject;
    if (sourceMemoryFingerprint({ dimensions: frozen.dimensions, evidence: frozen.evidence }) !== sourceMemoryFingerprint({ dimensions: input.dimensions, evidence: input.evidence })) throw new MunicipalCostError("A origem de custo já existe com dimensões ou evidências divergentes.");
    return existing;
  }
  const source = await insertCostSource(tx, { financialYearId: input.financialYearId, budgetUnitId: input.budgetUnitId, sourceType: input.sourceType, sourceId: input.sourceId, expenseDate: input.expenseDate, amount: input.amount, snapshot: json({ dimensions: input.dimensions, evidence: input.evidence, policyId: policy.id }) });
  const rules = await listApplicableCostRules(tx, input.financialYearId, input.budgetUnitId, input.sourceType, input.expenseDate);
  const matching = rules.filter(rule => { const selector = rule.selector as JsonObject; return Object.entries(selector).every(([key, value]) => input.dimensions[key] === value); });
  if (matching.length > 1 && matching[0].priority === matching[1].priority) throw new MunicipalCostError("Há regras automáticas concorrentes com a mesma prioridade; regularize a configuração.");
  const rule = matching[0];
  if (rule) {
    const allocations = distributeCostPercentages(input.amount, rule.shares as unknown as CostShare[]);
    if (allocations.length) await allocateInTransaction(tx, actor, { sourceId: source.id, date: input.expenseDate, reason: `Apropriação automática: ${rule.title}`, idempotencyKey: `MUNICIPAL_COST:${source.id}:AUTO`, allocations, ruleId: rule.id });
  }
  return source;
}

export async function cancelMunicipalCostSource(tx: Tx, actor: CostActor, sourceType: CostSourceType, sourceId: string) {
  const origin = await findCostSourceByOrigin(tx, sourceType, sourceId);
  if (!origin) return;
  await assertCostScope(tx, actor, origin.financialYearId, origin.budgetUnitId);
  await lockCostYear(tx, origin.financialYearId);
  await tx.execute(sql`SELECT id FROM "MunicipalCostSource" WHERE id = ${origin.id} FOR UPDATE`);
  if ((await municipalCostPosition(tx, origin.id)).gt(0)) throw new MunicipalCostError("Estorne as apropriações na mesma rotina antes de cancelar a origem.");
  await cancelCostSource(tx, origin.id);
}
