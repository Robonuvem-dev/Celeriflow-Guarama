import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, planningEntityWhere, planningInstrumentWhere, planningLineWhere, planningUnitWhere, type PlanningContext } from "./access";
import { actionInput, allocateRevenue, instrumentInput, lineInput, memoryInput, moneySchema, planningLineData, programInput, projectedValue, waiverInput } from "./policy";
import { planningDateSchema } from "./revisions";
import { applyLineDelta, canonicalPiece, contentHash, finalizeLegalRevision, lockLegalInstrument, planningAppropriationCode, planningAudit, snapshotVersion } from "./operations-core";
import { automaticPlanningReducedCode, planningLineClassification } from "./classification";

type Tx = Prisma.TransactionClient;
async function audit(tx: Tx, context: PlanningContext, entityId: string, action: string, payload: Prisma.InputJsonValue) {
  await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, action, entityType: "PLANNING_INSTRUMENT", entityId, payload } });
}

export async function lockPlanningInstrument(tx: Tx, context: PlanningContext, instrumentId: string) {
  const visible = await tx.planningInstrument.findFirst({ where: { id: instrumentId, ...planningInstrumentWhere(context) } });
  if (!visible) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  await tx.$queryRaw`SELECT id FROM "PlanningInstrument" WHERE id = ${instrumentId} FOR UPDATE`;
  const instrument = await tx.planningInstrument.findFirstOrThrow({
    where: { id: instrumentId, ...planningInstrumentWhere(context) },
    include: { multiYearPlan: true, budgetGuideline: true, annualBudgetLaw: true, parent: { include: { parent: true } } },
  });
  const status = instrument.multiYearPlan?.status ?? instrument.budgetGuideline?.status ?? instrument.annualBudgetLaw?.status;
  if (status !== "DRAFT") throw new Error("A peça está fechada para elaboração. Utilize o fluxo de revisão legal.");
  return instrument;
}

export async function createPlanningInstrument(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = instrumentInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const entity = await tx.governmentEntity.findFirst({ where: { id: input.governmentEntityId, ...planningEntityWhere(context) } });
    if (!entity) throw new AccessError("Entidade não autorizada para esta jornada.", 403);
    if (input.catalogVersionId) {
      const catalog = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: input.catalogVersionId } });
      if (catalog.status !== "PUBLISHED" || catalog.year < input.startYear || catalog.year > input.endYear) throw new Error("Selecione catálogo publicado e vigente no período da peça.");
    }
    const parent = input.parentId ? await tx.planningInstrument.findFirst({ where: { id: input.parentId, governmentEntityId: entity.id, ...planningInstrumentWhere(context) } }) : null;
    if (input.kind !== "PPA" && (!parent || parent.kind !== (input.kind === "LDO" ? "PPA" : "LDO") || input.startYear < parent.startYear || input.endYear > parent.endYear)) throw new Error("A peça anterior deve pertencer à mesma entidade, cadeia e vigência.");
    const year = input.kind !== "PPA" ? await tx.financialYear.findFirst({ where: { year: input.startYear, governmentEntityId: entity.id } }) : null;
    if (input.kind !== "PPA" && (!year || !["Preparação", "Aberto"].includes(year.status))) throw new Error("Cadastre um exercício financeiro em preparação ou aberto.");
    let multiYearPlanId: string | undefined, budgetGuidelineId: string | undefined, annualBudgetLawId: string | undefined;
    if (input.kind === "PPA") {
      const ppa = await tx.multiYearPlan.create({ data: { code: `${entity.code}:${input.code}`, name: input.title, startYear: input.startYear, endYear: input.endYear, status: "DRAFT", draftedById: context.user.id } });
      multiYearPlanId = ppa.id;
    } else if (input.kind === "LDO") {
      if (!parent?.multiYearPlanId) throw new Error("PPA sem referência canônica.");
      const ldo = await tx.budgetGuideline.create({ data: { financialYearId: year!.id, multiYearPlanId: parent.multiYearPlanId, status: "DRAFT", draftedById: context.user.id } });
      budgetGuidelineId = ldo.id;
    } else {
      if (!parent?.budgetGuidelineId) throw new Error("LDO sem referência canônica.");
      const loa = await tx.annualBudgetLaw.create({ data: { lawNumber: input.code, financialYearId: year!.id, budgetGuidelineId: parent.budgetGuidelineId, totalRevenue: 0, totalExpense: 0, status: "DRAFT", draftedById: context.user.id } });
      annualBudgetLawId = loa.id;
    }
    const instrument = await tx.planningInstrument.create({ data: { ...input, multiYearPlanId, budgetGuidelineId, annualBudgetLawId, createdById: context.user.id } });
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
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (instrument.kind !== "PPA") throw new Error("Cadastre o programa na peça PPA.");
    const program = await tx.programPPA.create({ data: {
      multiYearPlanId: ppaId(instrument), code: input.code, name: input.name, type: input.type, origin: input.origin,
      guidelines: input.guidelines, targetAudience: input.targetAudience, financing: input.financing, managerName: input.managerName,
      objectives: { create: { code: input.objectiveCode, description: input.objective, indicators: { create: { name: input.indicatorName, unit: input.indicatorUnit, baselineValue: input.baselineValue, targetValue: input.targetValue } } } },
    } });
    await audit(tx, context, instrument.id, "PLANNING_PROGRAM_CREATE", { programId: program.id });
    return program.id;
  });
}

export async function addPlanningAction(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = actionInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (instrument.kind !== "PPA") throw new Error("Cadastre a ação na peça PPA.");
    const program = await tx.programPPA.findFirst({ where: { id: input.programId, multiYearPlanId: ppaId(instrument) } });
    if (!program) throw new Error("Programa não pertence ao PPA.");
    const action = await tx.actionPPA.create({ data: { programId: program.id, code: input.code, name: input.name, type: input.type } });
    await audit(tx, context, instrument.id, "PLANNING_ACTION_CREATE", { actionId: action.id });
    return action.id;
  });
}

export async function addPlanningLine(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const supplied = z.object({ instrumentId: z.string().min(1) }).passthrough().parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, supplied.instrumentId);
    const input = lineInput.parse({ ...supplied, expenseBudgetLevel: instrument.kind === "LOA" ? "ELEMENT_SOURCE" : instrument.expenseLevel });
    return savePlanningLine(tx, context, instrument, input);
  });
}

export async function addPlanningTransfer(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), code: z.string().trim().min(1).max(60), description: z.string().trim().min(1).max(4000), year: z.coerce.number().int(), budgetUnitId: z.string().min(1), resourceSourceId: z.string().min(1), destinationEntityId: z.string().min(1), transferDirection: z.enum(["IN", "OUT"]), originalValue: moneySchema }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (input.year < piece.startYear || input.year > piece.endYear || input.destinationEntityId === piece.governmentEntityId) throw new Error("Revise exercício e contraparte da transferência.");
    const unit = await tx.budgetUnit.findFirst({ where: { AND: [planningUnitWhere(context), { id: input.budgetUnitId, planningEntityUnit: { is: { governmentEntityId: piece.governmentEntityId } } }] } });
    if (!unit || !await tx.governmentEntity.findFirst({ where: { id: input.destinationEntityId, status: "ATIVA" } })) throw new Error("Unidade ou contraparte inválida.");
    const line = await tx.planningBudgetLine.create({ data: { ...input, kind: "TRANSFER" } });
    await planningAudit(tx, context, piece.id, "PLANNING_TRANSFER_CREATE", { lineId: line.id, ...input }); return line.id;
  });
}

export async function addApprovedPlanningLine(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = lineInput.parse(raw);
  const legal = z.object({ effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1), legalText: z.string().trim().min(1), reason: z.string().trim().min(1), submissionKey: z.string().uuid() }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    const canonical = canonicalPiece(piece)!;
    if (!["SANCTIONED", "PUBLISHED"].includes(canonical.status) || !canonical.sanctionedAt) throw new Error("Inclusão formal exige peça sancionada/publicada.");
    const date = new Date(legal.effectiveAt);
    if (legal.effectiveAt > new Date().toISOString().slice(0, 10) || date < canonical.sanctionedAt || date.getUTCFullYear() > piece.endYear) throw new Error("Data fora da vigência legal da peça.");
    if (input.kind === "EXPENSE" && !new Prisma.Decimal(input.originalValue).isZero()) throw new Error("Nova classificação de despesa inicia sem saldo. Efetive a dotação pelo fluxo de crédito especial.");
    const existing = await tx.financialAuditLog.findFirst({ where: { entityId: piece.id, action: "PLANNING_APPROVED_LINE", payload: { path: ["submissionKey"], equals: legal.submissionKey } } });
    if (existing) {
      const saved = existing.payload as { lineId: string; inputHash: string };
      if (saved.inputHash !== contentHash({ input, legal })) throw new Error("Solicitação repetida com dados diferentes.");
      return saved.lineId;
    }
    if (input.year < piece.startYear || input.year > piece.endYear) throw new Error("Exercício fora da vigência.");
    const unit = await tx.budgetUnit.findFirst({ where: { AND: [planningUnitWhere(context), { id: input.budgetUnitId, planningEntityUnit: { is: { governmentEntityId: piece.governmentEntityId } } }] } });
    if (!unit) throw new AccessError("Unidade não autorizada na entidade da peça.", 403);
    if (input.kind === "EXPENSE" && !await tx.actionPPA.findFirst({ where: { id: input.actionId, programId: input.programId, program: { multiYearPlanId: ppaId(piece) } } })) throw new Error("Programa/ação não pertencem ao PPA da peça.");
    await snapshotVersion(tx, context, piece.id, canonical.sanctionedAt, canonical.legalActNumber ?? legal.legalActNumber, "Antes da inclusão formal de classificação");
    const lineData = planningLineData(input);
    const classificationSnapshot = await planningLineClassification(tx, piece, input);
    const reducedCode = await automaticPlanningReducedCode(tx, piece.id, input);
    const line = await tx.planningBudgetLine.create({ data: { ...lineData, reducedCode, classificationSnapshot: classificationSnapshot ?? undefined, originalValue: 0, physicalTarget: input.physicalTarget } });
    if (piece.annualBudgetLawId) {
      if (input.kind === "REVENUE") await tx.annualBudgetRevenueForecast.create({ data: { annualBudgetLawId: piece.annualBudgetLawId, code: line.code, name: line.description, estimatedValue: 0 } });
      else {
        const fixation = await tx.annualBudgetExpenseFixation.create({ data: { annualBudgetLawId: piece.annualBudgetLawId, code: line.code, name: line.description, fixedValue: 0 } });
        if (piece.implantedAt && piece.annualBudgetLaw) {
          const appropriation = await tx.budgetAppropriation.create({ data: { code: await planningAppropriationCode(tx, piece, line), financialYearId: piece.annualBudgetLaw.financialYearId, budgetUnitId: line.budgetUnitId, expenseNatureId: line.expenseNatureId!, resourceSourceId: line.resourceSourceId, annualBudgetExpenseFixationId: fixation.id, programPPAId: line.programId, actionPPAId: line.actionId, initialValue: 0, initialValueDecimal: 0, updatedValue: 0, updatedValueDecimal: 0, committedValueDecimal: 0 } });
          await tx.planningBudgetLine.update({ where: { id: line.id }, data: { appropriationId: appropriation.id } });
        }
      }
    }
    const value = new Prisma.Decimal(input.originalValue);
    if (!value.isZero()) await applyLineDelta(tx, context, piece, { lineId: line.id, value, effectiveAt: new Date(legal.effectiveAt), legalActNumber: legal.legalActNumber, legalText: legal.legalText, reason: legal.reason, key: legal.submissionKey, allowBlocked: true });
    await finalizeLegalRevision(tx, context, piece, new Date(legal.effectiveAt), legal.legalActNumber, legal.reason);
    await planningAudit(tx, context, piece.id, "PLANNING_APPROVED_LINE", { ...legal, lineId: line.id, inputHash: contentHash({ input, legal }) });
    return line.id;
  });
}

async function savePlanningLine(tx: Tx, context: PlanningContext, instrument: Awaited<ReturnType<typeof lockPlanningInstrument>>, input: z.infer<typeof lineInput>) {
    if (input.year < instrument.startYear || input.year > instrument.endYear) throw new Error("Ano fora da vigência da peça.");
    const unit = await tx.budgetUnit.findFirst({ where: { AND: [planningUnitWhere(context), { id: input.budgetUnitId, planningEntityUnit: { is: { governmentEntityId: instrument.governmentEntityId } } }] } });
    if (!unit) throw new AccessError("Unidade não autorizada na entidade da peça.", 403);
    if (input.kind === "EXPENSE") {
      const action = await tx.actionPPA.findFirst({ where: { id: input.actionId, programId: input.programId, program: { multiYearPlanId: ppaId(instrument) } } });
      if (!action) throw new Error("Programa/ação não pertencem ao PPA da peça.");
    }
    const data = planningLineData(input);
    if (input.kind === "EXPENSE" && !input.expenseNatureId && (instrument.expenseLevel !== "SOURCE" || instrument.kind === "LOA")) throw new Error("Informe o elemento de despesa nesta peça.");
    const classificationSnapshot = await planningLineClassification(tx, instrument, input);
    const reducedCode = await automaticPlanningReducedCode(tx, instrument.id, input);
    const line = await tx.planningBudgetLine.create({ data: { ...data, reducedCode, classificationSnapshot: classificationSnapshot ?? undefined, originalValue: new Prisma.Decimal(input.originalValue), physicalTarget: new Prisma.Decimal(input.physicalTarget) } });
    if (instrument.annualBudgetLawId) {
      if (input.kind === "REVENUE") await tx.annualBudgetRevenueForecast.create({ data: { annualBudgetLawId: instrument.annualBudgetLawId, code: input.code, name: input.description, estimatedValue: line.originalValue } });
      else await tx.annualBudgetExpenseFixation.create({ data: { annualBudgetLawId: instrument.annualBudgetLawId, code: input.code, name: input.description, fixedValue: line.originalValue } });
      await tx.annualBudgetLaw.update({ where: { id: instrument.annualBudgetLawId }, data: input.kind === "REVENUE" ? { totalRevenue: { increment: line.originalValue } } : { totalExpense: { increment: line.originalValue } } });
    }
    await audit(tx, context, instrument.id, "PLANNING_LINE_CREATE", { lineId: line.id, value: line.originalValue.toFixed(2), budgetUnitId: unit.id });
    return line.id;
}

export async function addAllocatedPlanningRevenue(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), revenueNatureId: z.string().min(1), budgetUnitId: z.string().min(1), code: z.string().trim().min(1).max(40), description: z.string().trim().min(1).max(4000), year: z.coerce.number().int(), originalValue: moneySchema }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    await tx.$queryRaw`SELECT id FROM "RevenueNature" WHERE id = ${input.revenueNatureId} FOR SHARE`;
    const allocations = await tx.planningRevenueAllocation.findMany({ where: { revenueNatureId: input.revenueNatureId }, orderBy: { resourceSourceId: "asc" } });
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
  return context.prisma.$transaction(async (tx) => {
    await lockPlanningInstrument(tx, context, input.instrumentId);
    const memory = await tx.planningCalculationMemory.create({ data: { ...input, resultValue, createdById: context.user.id } });
    await audit(tx, context, input.instrumentId, "PLANNING_MEMORY_CREATE", { memoryId: memory.id, resultValue: resultValue.toFixed(2) });
    return memory.id;
  });
}

export async function addPlanningWaiver(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = waiverInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (input.year < instrument.startYear || input.year > instrument.endYear) throw new Error("Ano fora da vigência da peça.");
    const waiver = await tx.planningRevenueWaiver.create({ data: { ...input, createdById: context.user.id } });
    await audit(tx, context, instrument.id, "PLANNING_WAIVER_CREATE", { waiverId: waiver.id });
    return waiver.id;
  });
}

export async function configurePlanningEntity(context: PlanningContext, entityId: string, unitId: string) {
  assertPlanningOperation(context, "update");
  if (!isSystemAdministrator(context.user)) throw new AccessError("Vinculação de entidades exige administração técnica.", 403);
  return context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "GovernmentEntity" WHERE id = ${entityId} FOR UPDATE`;
    const [entity, unit, existing] = await Promise.all([
      tx.governmentEntity.findUnique({ where: { id: entityId } }), tx.budgetUnit.findUnique({ where: { id: unitId } }),
      tx.planningEntityScope.findUnique({ where: { governmentEntityId: entityId } }),
    ]);
    if (!entity || !unit || entity.status !== "ATIVA") throw new Error("Selecione entidade ativa e unidade existentes.");
    if (existing && existing.jurisdiction !== context.jurisdiction) throw new Error("Entidade já vinculada a outra jurisdição.");
    const assigned = await tx.planningEntityUnit.findUnique({ where: { budgetUnitId: unitId } });
    if (assigned && assigned.governmentEntityId !== entityId) throw new Error("Unidade já vinculada a outra entidade.");
    await tx.planningEntityScope.upsert({ where: { governmentEntityId: entityId }, create: { governmentEntityId: entityId, jurisdiction: context.jurisdiction }, update: {} });
    await tx.planningEntityUnit.upsert({ where: { budgetUnitId: unitId }, create: { budgetUnitId: unitId, governmentEntityId: entityId }, update: {} });
    await audit(tx, context, entityId, "PLANNING_SCOPE_ASSIGN", { budgetUnitId: unitId, jurisdiction: context.jurisdiction });
  });
}

export async function listPlanningInstruments(context: PlanningContext, filters: { kind?: string; q?: string; page?: string; entityId?: string }) {
  const pageInput = Number(filters.page || 1);
  const requestedPage = Number.isSafeInteger(pageInput) && pageInput > 0 ? pageInput : 1;
  const kind = ["PPA", "LDO", "LOA"].includes(filters.kind || "") ? filters.kind as "PPA" | "LDO" | "LOA" : undefined;
  const where: Prisma.PlanningInstrumentWhereInput = {
    ...planningInstrumentWhere(context), ...(kind ? { kind } : {}),
    ...(filters.entityId ? { governmentEntityId: filters.entityId } : {}),
    ...(filters.q ? { OR: [{ title: { contains: filters.q.slice(0, 200), mode: "insensitive" } }, { code: { contains: filters.q.slice(0, 200), mode: "insensitive" } }] } : {}),
  };
  const total = await context.prisma.planningInstrument.count({ where });
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.planningInstrument.findMany({ where, include: { governmentEntity: { select: { name: true } }, multiYearPlan: { select: { status: true } }, budgetGuideline: { select: { status: true } }, annualBudgetLaw: { select: { status: true } } }, orderBy: [{ startYear: "desc" }, { code: "asc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  return { records, total, page };
}

export async function getPlanningInstrument(context: PlanningContext, id: string, pageInput = "1", dateInput?: string) {
  const asOf = dateInput ? planningDateSchema.parse(dateInput) : new Date().toISOString().slice(0, 10);
  const effectiveAt = { lte: new Date(`${asOf}T00:00:00.000Z`) };
  const instrument = await context.prisma.planningInstrument.findFirst({ where: { id, ...planningInstrumentWhere(context) }, include: { governmentEntity: true, multiYearPlan: true, parent: { include: { parent: true } }, budgetGuideline: true, annualBudgetLaw: true } });
  if (!instrument) throw new AccessError("Peça orçamentária não encontrada neste escopo.", 404);
  const where = { instrumentId: id, ...planningLineWhere(context) };
  const total = await context.prisma.planningBudgetLine.count({ where });
  const requestedPage = Number(pageInput);
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const [lines, sums, memories, waivers] = await Promise.all([
    context.prisma.planningBudgetLine.findMany({ where, include: { budgetUnit: true, resourceSource: true, movements: { where: { effectiveAt } }, physicalEvents: { where: { effectiveAt }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 } }, orderBy: [{ year: "asc" }, { code: "asc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 }),
    context.prisma.planningBudgetLine.groupBy({ by: ["kind"], where, _sum: { originalValue: true } }),
    context.prisma.planningCalculationMemory.findMany({ where: { instrumentId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20 }),
    context.prisma.planningRevenueWaiver.findMany({ where: { instrumentId: id }, orderBy: [{ year: "asc" }, { id: "asc" }], take: 20 }),
  ]);
  const revisedSums = await Promise.all(sums.map(async (row) => {
    const delta = await context.prisma.planningLineMovement.aggregate({ where: { line: { ...where, kind: row.kind }, effectiveAt }, _sum: { value: true } });
    return { kind: row.kind, value: (row._sum.originalValue ?? new Prisma.Decimal(0)).plus(delta._sum.value ?? 0) };
  }));
  return { instrument, lines: lines.map((line) => ({ ...line, physicalTarget: line.physicalEvents[0]?.target ?? line.originalPhysicalTarget ?? line.physicalTarget, physicalActual: line.physicalEvents[0]?.actual ?? line.originalPhysicalActual ?? line.physicalActual, revisedValue: line.movements.reduce((value, movement) => value.plus(movement.value), line.originalValue) })), sums, revisedSums, asOf, total, page, memories, waivers };
}
