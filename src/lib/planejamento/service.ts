import "server-only";
import { and, asc, count, desc, eq, ilike, lte, or, sql, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { planningAppropriations, planningBudgetLaws, planningBudgetUnits, planningEntityScopes, planningEntityUnits, planningGuidelines, planningInstruments, planningLines, planningMovements, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { planningActions, planningCatalogVersions, planningFixations, planningForecasts, planningIndicators, planningMemories, planningObjectives, planningPhysicalEvents, planningPrograms, planningResourceSources, planningRevenueAllocations, planningRevenueNatures, planningWaivers } from "@/db/schema/planning-legal";
import { governmentEntities } from "@/db/schema/master-data";
import { financialYears } from "@/db/schema/finance-years";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningEntityScope, planningInstrumentScope, planningLineScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { planningConnection, planningDatabase } from "./database";
import { z } from "zod";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { actionInput, allocateRevenue, instrumentInput, lineInput, memoryInput, moneySchema, planningLineData, programInput, projectedValue, waiverInput } from "./policy";
import { planningDateSchema } from "./revisions";
import { applyLineDelta, canonicalPiece, contentHash, finalizeLegalRevision, lockLegalInstrument, planningAppropriationCode, planningAudit, snapshotVersion } from "./operations-core";
import { automaticPlanningReducedCode, planningLineClassification } from "./classification";

type Tx = DatabaseTransaction;
const audit = planningAudit;

export async function lockPlanningInstrument(tx: Tx, context: PlanningContext, instrumentId: string) {
  const [visible] = await tx.select().from(planningInstruments).where(and(eq(planningInstruments.id, instrumentId), planningInstrumentScope(context))).limit(1);
  if (!visible) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(eq(planningInstruments.id, instrumentId)).for("update");
  const instrument = await readPlanningInstrument(tx, instrumentId, context);
  if (!instrument) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  const status = instrument.multiYearPlan?.status ?? instrument.budgetGuideline?.status ?? instrument.annualBudgetLaw?.status;
  if (status !== "DRAFT") throw new Error("A peça está fechada para elaboração. Utilize o fluxo de revisão legal.");
  return instrument;
}

export async function createPlanningInstrument(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = instrumentInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [entity] = await tx.select().from(governmentEntities).where(and(eq(governmentEntities.id, input.governmentEntityId), planningEntityScope(context, governmentEntities.id))).limit(1);
    if (!entity) throw new AccessError("Entidade não autorizada para esta jornada.", 403);
    if (input.catalogVersionId) {
      const [catalog] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, input.catalogVersionId)).limit(1);
      if (!catalog) throw new Error("Catálogo não encontrado.");
      if (catalog.status !== "PUBLISHED" || catalog.year < input.startYear || catalog.year > input.endYear) throw new Error("Selecione catálogo publicado e vigente no período da peça.");
    }
    const parent = input.parentId ? (await tx.select().from(planningInstruments).where(and(eq(planningInstruments.id, input.parentId), eq(planningInstruments.governmentEntityId, entity.id), planningInstrumentScope(context))).limit(1))[0] : null;
    if (input.kind !== "PPA" && (!parent || parent.kind !== (input.kind === "LDO" ? "PPA" : "LDO") || input.startYear < parent.startYear || input.endYear > parent.endYear)) throw new Error("A peça anterior deve pertencer à mesma entidade, cadeia e vigência.");
    const year = input.kind !== "PPA" ? (await tx.select().from(financialYears).where(and(eq(financialYears.year, input.startYear), eq(financialYears.governmentEntityId, entity.id))).limit(1))[0] : null;
    if (input.kind !== "PPA" && (!year || !["Preparação", "Aberto"].includes(year.status))) throw new Error("Cadastre um exercício financeiro em preparação ou aberto.");
    let multiYearPlanId: string | undefined, budgetGuidelineId: string | undefined, annualBudgetLawId: string | undefined;
    if (input.kind === "PPA") {
      const [ppa] = await tx.insert(planningMultiYearPlans).values({ code: `${entity.code}:${input.code}`, name: input.title, startYear: input.startYear, endYear: input.endYear, status: "DRAFT", draftedById: context.user.id }).returning();
      multiYearPlanId = ppa.id;
    } else if (input.kind === "LDO") {
      if (!parent?.multiYearPlanId) throw new Error("PPA sem referência canônica.");
      const [ldo] = await tx.insert(planningGuidelines).values({ financialYearId: year!.id, multiYearPlanId: parent.multiYearPlanId, status: "DRAFT", draftedById: context.user.id }).returning();
      budgetGuidelineId = ldo.id;
    } else {
      if (!parent?.budgetGuidelineId) throw new Error("LDO sem referência canônica.");
      const [loa] = await tx.insert(planningBudgetLaws).values({ lawNumber: input.code, financialYearId: year!.id, budgetGuidelineId: parent.budgetGuidelineId, totalRevenue: new Decimal(0), totalExpense: new Decimal(0), status: "DRAFT", draftedById: context.user.id }).returning();
      annualBudgetLawId = loa.id;
    }
    const [instrument] = await tx.insert(planningInstruments).values({ ...input, multiYearPlanId, budgetGuidelineId, annualBudgetLawId, createdById: context.user.id }).returning();
    await audit(tx, context, instrument.id, "PLANNING_CREATE", { kind: input.kind, governmentEntityId: entity.id, code: input.code });
    return instrument.id;
  });
}

function ppaId(instrument: Awaited<ReturnType<typeof lockPlanningInstrument>>) {
  const id = instrument.multiYearPlanId ?? instrument.parent?.multiYearPlanId ?? instrument.parent?.parent?.multiYearPlanId;
  if (!id) throw new Error("Cadeia do PPA inválida.");
  return id;
}

export async function addPlanningProgram(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = programInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (instrument.kind !== "PPA") throw new Error("Cadastre o programa na peça PPA.");
    const [program] = await tx.insert(planningPrograms).values({
      multiYearPlanId: ppaId(instrument), code: input.code, name: input.name, type: input.type, origin: input.origin,
      guidelines: input.guidelines, targetAudience: input.targetAudience, financing: input.financing, managerName: input.managerName,
    }).returning();
    const [objective] = await tx.insert(planningObjectives).values({ programId: program.id, code: input.objectiveCode, description: input.objective }).returning();
    await tx.insert(planningIndicators).values({ objectiveId: objective.id, name: input.indicatorName, unit: input.indicatorUnit, baselineValue: input.baselineValue, targetValue: input.targetValue });
    await audit(tx, context, instrument.id, "PLANNING_PROGRAM_CREATE", { programId: program.id });
    return program.id;
  });
}

export async function addPlanningAction(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = actionInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (instrument.kind !== "PPA") throw new Error("Cadastre a ação na peça PPA.");
    const [program] = await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, input.programId), eq(planningPrograms.multiYearPlanId, ppaId(instrument)))).limit(1);
    if (!program) throw new Error("Programa não pertence ao PPA.");
    const [action] = await tx.insert(planningActions).values({ programId: program.id, code: input.code, name: input.name, type: input.type }).returning();
    await audit(tx, context, instrument.id, "PLANNING_ACTION_CREATE", { actionId: action.id });
    return action.id;
  });
}

export async function addPlanningLine(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const supplied = z.object({ instrumentId: z.string().min(1) }).passthrough().parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, supplied.instrumentId);
    const input = lineInput.parse({ ...supplied, expenseBudgetLevel: instrument.kind === "LOA" ? "ELEMENT_SOURCE" : instrument.expenseLevel });
    return savePlanningLine(tx, context, instrument, input);
  });
}

export async function addPlanningTransfer(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), code: z.string().trim().min(1).max(60), description: z.string().trim().min(1).max(4000), year: z.coerce.number().int(), budgetUnitId: z.string().min(1), resourceSourceId: z.string().min(1), destinationEntityId: z.string().min(1), transferDirection: z.enum(["IN", "OUT"]), originalValue: moneySchema }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (input.year < piece.startYear || input.year > piece.endYear || input.destinationEntityId === piece.governmentEntityId) throw new Error("Revise exercício e contraparte da transferência.");
    const unit = await authorizedUnit(tx, context, input.budgetUnitId, piece.governmentEntityId);
    const [destination] = await tx.select().from(governmentEntities).where(and(eq(governmentEntities.id, input.destinationEntityId), eq(governmentEntities.status, "ATIVA"))).limit(1);
    if (!unit || !destination) throw new Error("Unidade ou contraparte inválida.");
    const [line] = await tx.insert(planningLines).values({ ...input, originalValue: new Decimal(input.originalValue), kind: "TRANSFER" }).returning();
    await planningAudit(tx, context, piece.id, "PLANNING_TRANSFER_CREATE", { lineId: line.id, ...input }); return line.id;
  });
}

export async function addApprovedPlanningLine(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = lineInput.parse(raw);
  const legal = z.object({ effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1), legalText: z.string().trim().min(1), reason: z.string().trim().min(1), submissionKey: z.string().uuid() }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const canonical = canonicalPiece(piece)!;
    if (!["SANCTIONED", "PUBLISHED"].includes(canonical.status) || !canonical.sanctionedAt) throw new Error("Inclusão formal exige peça sancionada/publicada.");
    const date = new Date(legal.effectiveAt);
    if (legal.effectiveAt > new Date().toISOString().slice(0, 10) || date < canonical.sanctionedAt || date.getUTCFullYear() > piece.endYear) throw new Error("Data fora da vigência legal da peça.");
    if (input.kind === "EXPENSE" && !new Decimal(input.originalValue).isZero()) throw new Error("Nova classificação de despesa inicia sem saldo. Efetive a dotação pelo fluxo de crédito especial.");
    const [existing] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, piece.id), eq(financialAuditLogs.action, "PLANNING_APPROVED_LINE"), sql`${financialAuditLogs.payload}->>'submissionKey' = ${legal.submissionKey}`)).limit(1);
    if (existing) {
      const saved = existing.payload as { lineId: string; inputHash: string };
      if (saved.inputHash !== contentHash({ input, legal })) throw new Error("Solicitação repetida com dados diferentes.");
      return saved.lineId;
    }
    if (input.year < piece.startYear || input.year > piece.endYear) throw new Error("Exercício fora da vigência.");
    const unit = await authorizedUnit(tx, context, input.budgetUnitId, piece.governmentEntityId);
    if (!unit) throw new AccessError("Unidade não autorizada na entidade da peça.", 403);
    if (input.kind === "EXPENSE" && !await authorizedAction(tx, input.actionId!, input.programId!, ppaId(piece))) throw new Error("Programa/ação não pertencem ao PPA da peça.");
    await snapshotVersion(tx, context, piece.id, canonical.sanctionedAt, canonical.legalActNumber ?? legal.legalActNumber, "Antes da inclusão formal de classificação");
    const lineData = planningLineData(input);
    const classificationSnapshot = await planningLineClassification(tx, piece, input);
    const reducedCode = await automaticPlanningReducedCode(tx, piece.id, input);
    const [line] = await tx.insert(planningLines).values({ ...lineData, reducedCode, classificationSnapshot: classificationSnapshot ?? undefined, originalValue: new Decimal(0), physicalTarget: new Decimal(input.physicalTarget) }).returning();
    if (piece.annualBudgetLawId) {
      if (input.kind === "REVENUE") await tx.insert(planningForecasts).values({ annualBudgetLawId: piece.annualBudgetLawId, code: line.code, name: line.description, estimatedValue: new Decimal(0) });
      else {
        const [fixation] = await tx.insert(planningFixations).values({ annualBudgetLawId: piece.annualBudgetLawId, code: line.code, name: line.description, fixedValue: new Decimal(0) }).returning();
        if (piece.implantedAt && piece.annualBudgetLaw) {
          const [appropriation] = await tx.insert(planningAppropriations).values({ code: await planningAppropriationCode(tx, piece, line), financialYearId: piece.annualBudgetLaw.financialYearId, budgetUnitId: line.budgetUnitId, expenseNatureId: line.expenseNatureId!, resourceSourceId: line.resourceSourceId, annualBudgetExpenseFixationId: fixation.id, programPPAId: line.programId, actionPPAId: line.actionId, initialValue: 0, initialValueDecimal: new Decimal(0), updatedValue: 0, updatedValueDecimal: new Decimal(0), committedValueDecimal: new Decimal(0) }).returning();
          await tx.update(planningLines).set({ appropriationId: appropriation.id }).where(eq(planningLines.id, line.id));
        }
      }
    }
    const value = new Decimal(input.originalValue);
    if (!value.isZero()) await applyLineDelta(tx, context, piece, { lineId: line.id, value, effectiveAt: new Date(legal.effectiveAt), legalActNumber: legal.legalActNumber, legalText: legal.legalText, reason: legal.reason, key: legal.submissionKey, allowBlocked: true });
    await finalizeLegalRevision(tx, context, piece, new Date(legal.effectiveAt), legal.legalActNumber, legal.reason);
    await planningAudit(tx, context, piece.id, "PLANNING_APPROVED_LINE", { ...legal, lineId: line.id, inputHash: contentHash({ input, legal }) });
    return line.id;
  });
}

async function authorizedUnit(tx: Tx, context: PlanningContext, id: string, entityId: string) {
  const [row] = await tx.select({ unit: planningBudgetUnits }).from(planningBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)).where(and(eq(planningBudgetUnits.id, id), eq(planningEntityUnits.governmentEntityId, entityId), planningUnitScope(context, planningBudgetUnits.id))).limit(1);
  return row?.unit;
}

async function authorizedAction(tx: Tx, id: string, programId: string, multiYearPlanId: string) {
  return (await tx.select({ id: planningActions.id }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).where(and(eq(planningActions.id, id), eq(planningActions.programId, programId), eq(planningPrograms.multiYearPlanId, multiYearPlanId))).limit(1))[0];
}

async function savePlanningLine(tx: Tx, context: PlanningContext, instrument: Awaited<ReturnType<typeof lockPlanningInstrument>>, input: z.infer<typeof lineInput>) {
    if (input.year < instrument.startYear || input.year > instrument.endYear) throw new Error("Ano fora da vigência da peça.");
    const unit = await authorizedUnit(tx, context, input.budgetUnitId, instrument.governmentEntityId);
    if (!unit) throw new AccessError("Unidade não autorizada na entidade da peça.", 403);
    if (input.kind === "EXPENSE") {
      const action = await authorizedAction(tx, input.actionId!, input.programId!, ppaId(instrument));
      if (!action) throw new Error("Programa/ação não pertencem ao PPA da peça.");
    }
    const data = planningLineData(input);
    if (input.kind === "EXPENSE" && !input.expenseNatureId && (instrument.expenseLevel !== "SOURCE" || instrument.kind === "LOA")) throw new Error("Informe o elemento de despesa nesta peça.");
    const classificationSnapshot = await planningLineClassification(tx, instrument, input);
    const reducedCode = await automaticPlanningReducedCode(tx, instrument.id, input);
    const [line] = await tx.insert(planningLines).values({ ...data, reducedCode, classificationSnapshot: classificationSnapshot ?? undefined, originalValue: new Decimal(input.originalValue), physicalTarget: new Decimal(input.physicalTarget) }).returning();
    if (instrument.annualBudgetLawId) {
      if (input.kind === "REVENUE") await tx.insert(planningForecasts).values({ annualBudgetLawId: instrument.annualBudgetLawId, code: input.code, name: input.description, estimatedValue: line.originalValue });
      else await tx.insert(planningFixations).values({ annualBudgetLawId: instrument.annualBudgetLawId, code: input.code, name: input.description, fixedValue: line.originalValue });
      await tx.update(planningBudgetLaws).set(input.kind === "REVENUE" ? { totalRevenue: sql`${planningBudgetLaws.totalRevenue} + ${line.originalValue.toString()}::numeric` } : { totalExpense: sql`${planningBudgetLaws.totalExpense} + ${line.originalValue.toString()}::numeric` }).where(eq(planningBudgetLaws.id, instrument.annualBudgetLawId));
    }
    await audit(tx, context, instrument.id, "PLANNING_LINE_CREATE", { lineId: line.id, value: line.originalValue.toFixed(2), budgetUnitId: unit.id });
    return line.id;
}

export async function addAllocatedPlanningRevenue(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), revenueNatureId: z.string().min(1), budgetUnitId: z.string().min(1), code: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(4000), year: z.coerce.number().int(), originalValue: moneySchema }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    await tx.select({ id: planningRevenueNatures.id }).from(planningRevenueNatures).where(eq(planningRevenueNatures.id, input.revenueNatureId)).for("share");
    const allocations = await tx.select().from(planningRevenueAllocations).where(eq(planningRevenueAllocations.revenueNatureId, input.revenueNatureId)).orderBy(asc(planningRevenueAllocations.resourceSourceId));
    const amounts = allocateRevenue(input.originalValue, allocations.map((row) => ({ id: row.resourceSourceId, percentage: row.percentage.toString() })));
    let firstId = "";
    for (const [index, amount] of amounts.entries()) {
      const id = await savePlanningLine(tx, context, instrument, lineInput.parse({ ...input, kind: "REVENUE", resourceSourceId: amount.id, code: `${input.code}.${index + 1}`, originalValue: amount.value }));
      firstId ||= id;
    }
    return firstId;
  });
}

export async function addPlanningMemory(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = memoryInput.parse(raw);
  const resultValue = projectedValue(input.baseValue, input.rate);
  if (resultValue.isNegative()) throw new Error("A projeção não pode resultar em valor negativo.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    await lockPlanningInstrument(tx, context, input.instrumentId);
    const [memory] = await tx.insert(planningMemories).values({ ...input, baseValue: new Decimal(input.baseValue), rate: new Decimal(input.rate), resultValue, createdById: context.user.id }).returning();
    await audit(tx, context, input.instrumentId, "PLANNING_MEMORY_CREATE", { memoryId: memory.id, resultValue: resultValue.toFixed(2) });
    return memory.id;
  });
}

export async function addPlanningWaiver(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = waiverInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (input.year < instrument.startYear || input.year > instrument.endYear) throw new Error("Ano fora da vigência da peça.");
    const [waiver] = await tx.insert(planningWaivers).values({ ...input, estimatedValue: new Decimal(input.estimatedValue), compensationValue: new Decimal(input.compensationValue), createdById: context.user.id }).returning();
    await audit(tx, context, instrument.id, "PLANNING_WAIVER_CREATE", { waiverId: waiver.id });
    return waiver.id;
  });
}

export async function configurePlanningEntity(context: PlanningContext, entityId: string, unitId: string) {
  assertPlanningOperation(context, "update");
  if (!isSystemAdministrator(context.user)) throw new AccessError("Vinculação de entidades exige administração técnica.", 403);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [entity] = await tx.select().from(governmentEntities).where(eq(governmentEntities.id, entityId)).for("update");
    const [unit] = await tx.select().from(planningBudgetUnits).where(eq(planningBudgetUnits.id, unitId)).limit(1);
    const [existing] = await tx.select().from(planningEntityScopes).where(eq(planningEntityScopes.governmentEntityId, entityId)).limit(1);
    if (!entity || !unit || entity.status !== "ATIVA") throw new Error("Selecione entidade ativa e unidade existentes.");
    if (existing && existing.jurisdiction !== context.jurisdiction) throw new Error("Entidade já vinculada a outra jurisdição.");
    const [assigned] = await tx.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, unitId)).limit(1);
    if (assigned && assigned.governmentEntityId !== entityId) throw new Error("Unidade já vinculada a outra entidade.");
    await tx.insert(planningEntityScopes).values({ governmentEntityId: entityId, jurisdiction: context.jurisdiction }).onConflictDoNothing();
    await tx.insert(planningEntityUnits).values({ budgetUnitId: unitId, governmentEntityId: entityId }).onConflictDoNothing();
    await audit(tx, context, entityId, "PLANNING_SCOPE_ASSIGN", { budgetUnitId: unitId, jurisdiction: context.jurisdiction });
  });
}

export async function listPlanningInstruments(context: PlanningContext, filters: { kind?: string; q?: string; page?: string; entityId?: string }) {
  const pageInput = Number(filters.page || 1);
  const requestedPage = Number.isSafeInteger(pageInput) && pageInput > 0 ? pageInput : 1;
  const kind = ["PPA", "LDO", "LOA"].includes(filters.kind || "") ? filters.kind as "PPA" | "LDO" | "LOA" : undefined;
  const db = planningDatabase(context);
  const search = filters.q?.slice(0, 200).replace(/[\\%_]/g, "\\$&");
  const where = and(planningInstrumentScope(context), kind ? eq(planningInstruments.kind, kind) : undefined, filters.entityId ? eq(planningInstruments.governmentEntityId, filters.entityId) : undefined, search ? or(ilike(planningInstruments.title, `%${search}%`), ilike(planningInstruments.code, `%${search}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(planningInstruments).where(where);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.select({ instrument: planningInstruments, governmentEntity: { name: governmentEntities.name }, multiYearPlan: { status: planningMultiYearPlans.status }, budgetGuideline: { status: planningGuidelines.status }, annualBudgetLaw: { status: planningBudgetLaws.status } }).from(planningInstruments).innerJoin(governmentEntities, eq(governmentEntities.id, planningInstruments.governmentEntityId)).leftJoin(planningMultiYearPlans, eq(planningMultiYearPlans.id, planningInstruments.multiYearPlanId)).leftJoin(planningGuidelines, eq(planningGuidelines.id, planningInstruments.budgetGuidelineId)).leftJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningInstruments.annualBudgetLawId)).where(where).orderBy(desc(planningInstruments.startYear), asc(planningInstruments.code), asc(planningInstruments.id)).limit(20).offset((page - 1) * 20);
  const records = rows.map(({ instrument, ...relations }) => ({ ...instrument, ...relations }));
  return { records, total, page };
}

export async function getPlanningInstrument(context: PlanningContext, id: string, pageInput = "1", dateInput?: string) {
  const asOf = dateInput ? planningDateSchema.parse(dateInput) : new Date().toISOString().slice(0, 10);
  const effectiveAt = new Date(`${asOf}T00:00:00.000Z`);
  const db = planningDatabase(context);
  const piece = await readPlanningInstrument(db, id, context);
  if (!piece) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  const [governmentEntity] = await db.select().from(governmentEntities).where(eq(governmentEntities.id, piece.governmentEntityId)).limit(1);
  const instrument = { ...piece, governmentEntity };
  const where = and(eq(planningLines.instrumentId, id), planningLineScope(context));
  const [{ total }] = await db.select({ total: count() }).from(planningLines).where(where);
  const requestedPage = Number(pageInput);
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const [rows, grouped, memories, waivers] = await Promise.all([
    db.select({ line: planningLines, budgetUnit: planningBudgetUnits, resourceSource: planningResourceSources }).from(planningLines).innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, planningLines.budgetUnitId)).innerJoin(planningResourceSources, eq(planningResourceSources.id, planningLines.resourceSourceId)).where(where).orderBy(asc(planningLines.year), asc(planningLines.code), asc(planningLines.id)).limit(20).offset((page - 1) * 20),
    db.select({ kind: planningLines.kind, originalValue: sum(planningLines.originalValue) }).from(planningLines).where(where).groupBy(planningLines.kind),
    db.select().from(planningMemories).where(eq(planningMemories.instrumentId, id)).orderBy(desc(planningMemories.createdAt), asc(planningMemories.id)).limit(20),
    db.select().from(planningWaivers).where(eq(planningWaivers.instrumentId, id)).orderBy(asc(planningWaivers.year), asc(planningWaivers.id)).limit(20),
  ]);
  const lines = await Promise.all(rows.map(async ({ line, ...relations }) => ({ ...line, ...relations, movements: await db.select().from(planningMovements).where(and(eq(planningMovements.lineId, line.id), lte(planningMovements.effectiveAt, effectiveAt))), physicalEvents: await db.select().from(planningPhysicalEvents).where(and(eq(planningPhysicalEvents.lineId, line.id), lte(planningPhysicalEvents.effectiveAt, effectiveAt))).orderBy(desc(planningPhysicalEvents.effectiveAt), desc(planningPhysicalEvents.createdAt), desc(planningPhysicalEvents.id)).limit(1) })));
  const sums = grouped.map(row => ({ kind: row.kind, _sum: { originalValue: row.originalValue === null ? null : new Decimal(row.originalValue) } }));
  const revisedSums = await Promise.all(sums.map(async (row) => {
    const [delta] = await db.select({ value: sum(planningMovements.value) }).from(planningMovements).innerJoin(planningLines, eq(planningLines.id, planningMovements.lineId)).where(and(where, eq(planningLines.kind, row.kind), lte(planningMovements.effectiveAt, effectiveAt)));
    return { kind: row.kind, value: (row._sum.originalValue ?? new Decimal(0)).plus(delta.value ?? 0) };
  }));
  return { instrument, lines: lines.map((line) => ({ ...line, physicalTarget: line.physicalEvents[0]?.target ?? line.originalPhysicalTarget ?? line.physicalTarget, physicalActual: line.physicalEvents[0]?.actual ?? line.originalPhysicalActual ?? line.physicalActual, revisedValue: line.movements.reduce((value, movement) => value.plus(movement.value), line.originalValue) })), sums, revisedSums, asOf, total, page, memories, waivers };
}
