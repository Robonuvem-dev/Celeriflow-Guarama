import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { planningAppropriations, planningBudgetLaws, planningEntityUnits, planningGuidelines, planningInstruments, planningLines, planningMovements, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { planningActions, planningFixations, planningForecasts, planningIntegrationCommands, planningLegislativeLinks, planningPhysicalEvents, planningPrograms, planningRevenueAllocations, planningRevenueNatures, planningVersions } from "@/db/schema/planning-legal";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { financialYears } from "@/db/schema/finance-years";
import { laws, propositions } from "@/db/schema/chamber";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { planningConnection, planningDatabase } from "./database";
import { z } from "zod";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { planningDateSchema } from "./revisions";
import { applyLineDelta, assertWholePiece, canonicalPiece, contentHash, finalizeLegalRevision, jsonValue, linePosition, lockLegalInstrument, planningAppropriationCode, planningAudit, snapshotVersion, type PlanningTx } from "./operations-core";
import { copyPlanningYearConfiguration } from "./year-rollover";
import { deliverPlanningAccountingCommand } from "./accounting-bridge";

export type PlanningCriticism = { code: string; severity: "ERROR" | "WARNING"; reference: string; message: string };
export async function inspectPlanningPiece(tx: DatabaseExecutor, context: PlanningContext, instrumentId: string, asOf = new Date()) {
  const piece = await readPlanningInstrument(tx, instrumentId, context);
  if (!piece) throw new AccessError("Peça não encontrada neste escopo.", 404);
  const rows = await tx.select({ line: planningLines, action: planningActions, program: planningPrograms, revenueNature: planningRevenueNatures }).from(planningLines).leftJoin(planningActions, eq(planningActions.id, planningLines.actionId)).leftJoin(planningPrograms, eq(planningPrograms.id, planningLines.programId)).leftJoin(planningRevenueNatures, eq(planningRevenueNatures.id, planningLines.revenueNatureId)).where(and(eq(planningLines.instrumentId, instrumentId), planningLineScope(context)));
  const lines = await Promise.all(rows.map(async ({ line, revenueNature, ...relations }) => ({ ...line, ...relations, revenueNature: revenueNature ? { ...revenueNature, planningAllocations: await tx.select().from(planningRevenueAllocations).where(eq(planningRevenueAllocations.revenueNatureId, revenueNature.id)) } : null, movements: await tx.select().from(planningMovements).where(and(eq(planningMovements.lineId, line.id), lte(planningMovements.effectiveAt, asOf))) })));
  const criticisms: PlanningCriticism[] = [];
  const add = (code: string, reference: string, message: string, severity: "ERROR" | "WARNING" = "ERROR") => criticisms.push({ code, reference, message, severity });
  if (!lines.length) add("EMPTY", piece.code, "Cadastre previsões de receita e despesa.");
  const totals = new Map<number, { revenue: Decimal; expense: Decimal }>();
  for (const line of lines) {
    const value = line.movements.reduce((sum, movement) => sum.plus(movement.value), line.originalValue);
    const year = totals.get(line.year) ?? { revenue: new Decimal(0), expense: new Decimal(0) };
    if (line.kind === "REVENUE") year.revenue = year.revenue.plus(value);
    if (line.kind === "EXPENSE") year.expense = year.expense.plus(value);
    totals.set(line.year, year);
    if (line.year < piece.startYear || line.year > piece.endYear) add("YEAR", line.code, "Exercício fora da vigência.");
    if (value.isNegative()) add("NEGATIVE", line.code, "Saldo financeiro negativo.");
    if (line.kind === "EXPENSE" && ((piece.expenseLevel !== "SOURCE" || piece.kind === "LOA") && !line.expenseNatureId || !line.functionCode || !line.subfunctionCode || !line.product || !line.productUnit || line.action?.programId !== line.programId)) add("CLASSIFICATION", line.code, "Complete a classificação funcional, programa, ação e produto.");
    if (line.kind === "EXPENSE" && line.physicalTarget.isZero() && value.greaterThan(0)) add("TARGET", line.code, "Informe a meta física ou justifique a ausência de produto mensurável.", "WARNING");
    const allocations = line.revenueNature?.planningAllocations ?? [];
    if (allocations.length && !allocations.reduce((sum, row) => sum.plus(row.percentage), new Decimal(0)).equals(100)) add("ALLOCATION", line.code, "Os percentuais da natureza de receita não totalizam 100%.");
    if (line.revenueNature?.degree && line.revenueNature.degree > piece.revenueDegree) add("DEGREE", line.code, "Natureza de receita ultrapassa o grau configurado da peça.", "WARNING");
  }
  for (const [year, values] of totals) if (!values.revenue.equals(values.expense)) add("BALANCE", String(year), `Receita ${values.revenue.toFixed(2)} e despesa ${values.expense.toFixed(2)} divergem.`);
  if (piece.kind !== "PPA" && (!piece.parent || piece.parent.governmentEntityId !== piece.governmentEntityId || piece.parent.startYear > piece.startYear || piece.parent.endYear < piece.endYear)) add("CHAIN", piece.code, "Revise a cadeia de peças da mesma entidade e exercício.");
  if (piece.annualBudgetLawId) {
    const forecasts = await tx.select().from(planningForecasts).where(eq(planningForecasts.annualBudgetLawId, piece.annualBudgetLawId));
    const fixations = await tx.select().from(planningFixations).where(eq(planningFixations.annualBudgetLawId, piece.annualBudgetLawId));
    for (const line of lines.filter((row) => row.kind !== "TRANSFER")) {
      const mirrors = line.kind === "REVENUE" ? forecasts.filter((row) => row.code === line.code) : fixations.filter((row) => row.code === line.code);
      if (mirrors.length !== 1) add("CANONICAL", line.code, "Previsão/fixação canônica ausente ou duplicada.");
    }
  }
  return { criticisms, lineCount: lines.length };
}

export async function planningConsistency(context: PlanningContext, instrumentId: string, date?: string) {
  return withDatabaseTransaction(planningConnection(context), (tx) => inspectPlanningPiece(tx, context, instrumentId, date ? new Date(planningDateSchema.parse(date)) : new Date()), { isolationLevel: "repeatable read" });
}

const workflowInput = z.object({ instrumentId: z.string().min(1), stage: z.enum(["SUBMIT", "APPROVE", "SANCTION", "PUBLISH", "IMPLANT"]), date: planningDateSchema, previousInstrumentId: z.string().optional(), legalActNumber: z.string().trim().max(100).optional(), legalText: z.string().trim().max(20000).optional(), publicationReference: z.string().trim().max(1000).optional() });
export async function transitionPlanningPiece(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = workflowInput.parse(raw);
  if (input.stage !== "SUBMIT") assertPlanningLegalAuthority(context);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    await assertWholePiece(tx, context, piece.id);
    if (input.stage !== "SUBMIT" && !isSystemAdministrator(context.user) && (await tx.select().from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, piece.governmentEntityId), sql`NOT (${planningEntityUnits.budgetUnitId} = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`)).limit(1)).length) throw new AccessError("Tramitação legal exige acesso a todas as unidades da entidade.", 403);
    const canonical = canonicalPiece(piece)!;
    if (["APPROVE", "SANCTION", "PUBLISH"].includes(input.stage)) {
      const linked = await tx.select().from(planningLegislativeLinks).where(eq(planningLegislativeLinks.instrumentId, piece.id));
      for (const reference of linked) {
        if (reference.propositionId) { const [proposal] = await tx.select().from(propositions).where(eq(propositions.id, reference.propositionId)).limit(1); if (!proposal || !["Aprovada", "Sancionada"].includes(proposal.status)) throw new Error("Conclua a aprovação da proposição vinculada na Câmara."); }
        if (["SANCTION", "PUBLISH"].includes(input.stage) && reference.propositionId && !reference.lawId) throw new Error("Vincule o ato sancionado da proposição antes da sanção orçamentária.");
        if (reference.lawId) { const [law] = await tx.select().from(laws).where(eq(laws.id, reference.lawId)).limit(1); if (!law || law.status !== "Vigente" || input.stage === "PUBLISH" && !law.dataPublicacao) throw new Error("Ato legislativo ainda não vigente/publicado."); }
      }
    }
    const stages = { SUBMIT: ["DRAFT", "SUBMITTED"], APPROVE: ["SUBMITTED", "APPROVED"], SANCTION: ["APPROVED", "SANCTIONED"], PUBLISH: ["SANCTIONED", "PUBLISHED"], IMPLANT: ["PUBLISHED", "PUBLISHED"] };
    const [expected, status] = stages[input.stage];
    if (input.stage === "IMPLANT" && piece.implantedAt) return piece.id;
    if (canonical.status !== expected) throw new Error(`Etapa incompatível com a situação ${canonical.status}.`);
    if (input.stage === "APPROVE" && context.user.id === canonical.submittedById) throw new Error("A aprovação exige responsável distinto do encaminhamento.");
    if (input.stage === "SANCTION" && context.user.id === canonical.approvedById) throw new Error("A sanção exige responsável distinto da aprovação.");
    if (["APPROVE", "SANCTION", "IMPLANT"].includes(input.stage)) {
      const result = await inspectPlanningPiece(tx, context, piece.id);
      if (result.criticisms.some((row) => row.severity === "ERROR")) throw new Error(`Corrija as consistências: ${result.criticisms.filter((row) => row.severity === "ERROR").map((row) => row.message).join(" ")}`);
    }
    const date = new Date(input.date);
    if (["SANCTION", "PUBLISH"].includes(input.stage) && input.date > new Date().toISOString().slice(0, 10)) throw new Error("A sanção/publicação não pode ter data futura.");
    if (input.stage === "SANCTION" && (!input.legalActNumber || !input.legalText)) throw new Error("Informe ato legal e texto jurídico para a sanção.");
    if (input.stage === "PUBLISH" && (!input.publicationReference || !canonical.sanctionedAt || date < canonical.sanctionedAt)) throw new Error("Informe publicação com data posterior ou igual à sanção.");
    if (input.stage === "IMPLANT") {
      if (piece.kind !== "LOA" || !piece.annualBudgetLaw) throw new Error("Somente LOA pode ser implantada.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PlanningImplant:${piece.governmentEntityId}:${piece.startYear}`}))`);
      if ((await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(and(ne(planningInstruments.id, piece.id), eq(planningInstruments.governmentEntityId, piece.governmentEntityId), eq(planningInstruments.kind, "LOA"), eq(planningInstruments.startYear, piece.startYear), isNotNull(planningInstruments.implantedAt))).limit(1)).length) throw new Error("Já existe orçamento implantado nesta entidade/exercício. Utilize revisão formal da peça implantada.");
      const [year] = await tx.select().from(financialYears).where(eq(financialYears.id, piece.annualBudgetLaw.financialYearId)).limit(1);
      if (!year) throw new Error("Exercício não encontrado.");
      if (!["Preparação", "Aberto"].includes(year.status)) throw new Error("Exercício indisponível para implantação.");
      const unbound = await tx.select({ id: planningAppropriations.id }).from(planningAppropriations).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningAppropriations.budgetUnitId)).where(and(eq(planningAppropriations.financialYearId, year.id), eq(planningEntityUnits.governmentEntityId, piece.governmentEntityId), sql`NOT EXISTS (SELECT 1 FROM ${planningLines} WHERE ${planningLines.appropriationId} = ${planningAppropriations.id})`)).limit(1);
      if (unbound.length) throw new Error("Reconcilie as dotações legadas desta entidade/exercício antes de implantar; o orçamento não será duplicado.");
      const configuration = await copyPlanningYearConfiguration(tx, context, piece, input.previousInstrumentId);
      await planningAudit(tx, context, piece.id, "PLANNING_YEAR_ROLLOVER", configuration);
      const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE"))).orderBy(asc(planningLines.id));
      const newAppropriationIds: string[] = []; const reconciledAppropriationIds: string[] = [];
      for (const line of lines) {
        if (line.appropriationId) { reconciledAppropriationIds.push(line.appropriationId); continue; }
        const [fixation] = await tx.select().from(planningFixations).where(and(eq(planningFixations.annualBudgetLawId, piece.annualBudgetLaw.id), eq(planningFixations.code, line.code))).limit(1);
        if (!fixation) throw new Error("Fixação canônica não encontrada.");
        const balance = await linePosition(tx, line.id);
        const [appropriation] = await tx.insert(planningAppropriations).values({ code: await planningAppropriationCode(tx, piece, line), financialYearId: year.id, budgetUnitId: line.budgetUnitId, expenseNatureId: line.expenseNatureId!, resourceSourceId: line.resourceSourceId, annualBudgetExpenseFixationId: fixation.id, programPPAId: line.programId, actionPPAId: line.actionId, initialValueDecimal: line.originalValue, initialValue: line.originalValue.toNumber(), updatedValueDecimal: balance, updatedValue: balance.toNumber(), committedValueDecimal: new Decimal(0) }).returning();
        await tx.update(planningLines).set({ appropriationId: appropriation.id }).where(eq(planningLines.id, line.id));
        newAppropriationIds.push(appropriation.id);
      }
      await tx.update(planningInstruments).set({ implantedAt: date, implantedById: context.user.id }).where(eq(planningInstruments.id, piece.id));
      const openingLines = await tx.select({ id: planningLines.id, kind: planningLines.kind, year: planningLines.year, budgetUnitId: planningLines.budgetUnitId, appropriationId: planningLines.appropriationId, originalValue: planningLines.originalValue }).from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), inArray(planningLines.kind, ["REVENUE", "EXPENSE"]))).orderBy(asc(planningLines.year), asc(planningLines.code), asc(planningLines.id));
      const [command] = await tx.insert(planningIntegrationCommands).values({ type: "BUDGET_OPENING", sourceId: piece.id, idempotencyKey: `implant:${piece.id}`, payload: jsonValue({ governmentEntityId: piece.governmentEntityId, instrumentId: piece.id, year: year.year, revision: piece.revision + 1, openingLines: openingLines.map((line) => ({ ...line, originalValue: line.originalValue.toFixed(2) })), newAppropriationIds, reconciledAppropriationIds, accountingRule: "POST_NEW_ONLY_VERIFY_RECONCILED_OPENING_WITHOUT_DUPLICATION" }) }).returning();
      await deliverPlanningAccountingCommand(tx, context, command.id);
      await finalizeLegalRevision(tx, context, piece, date, canonical.legalActNumber ?? "Implantação orçamentária", "Implantação e cópia de configurações do exercício");
    } else {
      const data = { status, ...(input.stage === "SUBMIT" ? { submittedById: context.user.id, submittedAt: date } : input.stage === "APPROVE" ? { approvedById: context.user.id, approvedAt: date } : input.stage === "SANCTION" ? { sanctionedById: context.user.id, sanctionedAt: date, legalActNumber: input.legalActNumber, legalActDate: date } : { publishedById: context.user.id, publishedAt: date, publicationDate: date, publicationReference: input.publicationReference }) };
      if (piece.multiYearPlanId) await tx.update(planningMultiYearPlans).set(data).where(eq(planningMultiYearPlans.id, piece.multiYearPlanId));
      if (piece.budgetGuidelineId) await tx.update(planningGuidelines).set(data).where(eq(planningGuidelines.id, piece.budgetGuidelineId));
      if (piece.annualBudgetLawId) await tx.update(planningBudgetLaws).set(data).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId));
      if (input.legalText) await tx.update(planningInstruments).set({ legalText: input.legalText }).where(eq(planningInstruments.id, piece.id));
      if (input.stage === "SANCTION") await snapshotVersion(tx, context, piece.id, date, input.legalActNumber!, "Versão sancionada");
    }
    await planningAudit(tx, context, piece.id, `PLANNING_${input.stage}`, input);
    return piece.id;
  });
}

const compatibilityInput = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1), year: z.coerce.number().int(), effectiveAt: planningDateSchema, legalActNumber: z.string().trim().min(1), legalText: z.string().trim().min(1), reason: z.string().trim().min(1), lineMappings: z.string().default("[]"), submissionKey: z.string().uuid(), expectedSourceRevision: z.coerce.number().int(), expectedTargetRevision: z.coerce.number().int() });
export async function planningCompatibility(context: PlanningContext, sourceId: string, targetId: string, year: number, date?: string) {
  const db = planningDatabase(context);
  const pieces = await db.select().from(planningInstruments).where(and(inArray(planningInstruments.id, [sourceId, targetId]), planningInstrumentScope(context)));
  if (pieces.length !== 2 || pieces[0].governmentEntityId !== pieces[1].governmentEntityId || pieces.some((piece) => year < piece.startYear || year > piece.endYear)) throw new Error("Selecione duas peças distintas da mesma entidade e exercício.");
  const root = async (id: string) => { const piece = await readPlanningInstrument(db, id); if (!piece) throw new Error("Peça não encontrada."); return piece.kind === "PPA" ? piece.id : piece.kind === "LDO" ? piece.parentId : piece.parent?.parentId; };
  if (await root(sourceId) !== await root(targetId)) throw new Error("As peças não pertencem à mesma cadeia PPA/LDO/LOA.");
  const asOf = new Date(date ? planningDateSchema.parse(date) : new Date().toISOString().slice(0, 10));
  const base = await db.select().from(planningLines).where(and(inArray(planningLines.instrumentId, [sourceId, targetId]), eq(planningLines.year, year), planningLineScope(context)));
  const records = await Promise.all(base.map(async line => ({ ...line, movements: await db.select().from(planningMovements).where(and(eq(planningMovements.lineId, line.id), lte(planningMovements.effectiveAt, asOf))), physicalEvents: await db.select().from(planningPhysicalEvents).where(and(eq(planningPhysicalEvents.lineId, line.id), lte(planningPhysicalEvents.effectiveAt, asOf))).orderBy(desc(planningPhysicalEvents.effectiveAt), desc(planningPhysicalEvents.createdAt), desc(planningPhysicalEvents.id)).limit(1) })));
  const lines = records.map((line) => ({ ...line, physicalTarget: line.physicalEvents[0]?.target ?? line.originalPhysicalTarget ?? line.physicalTarget }));
  const key = (line: typeof lines[number]) => JSON.stringify([line.kind, line.year, line.budgetUnitId, line.resourceSourceId, line.revenueNatureId, line.expenseNatureId, line.programId, line.actionId, line.functionCode, line.subfunctionCode, line.product, line.productUnit, line.destinationEntityId, line.transferDirection]);
  const keys = new Set(lines.map(key));
  return { sourceRevision: pieces.find((piece) => piece.id === sourceId)!.revision, targetRevision: pieces.find((piece) => piece.id === targetId)!.revision, rows: [...keys].map((dimension) => {
    const source = lines.filter((line) => line.instrumentId === sourceId && key(line) === dimension);
    const target = lines.filter((line) => line.instrumentId === targetId && key(line) === dimension);
    const value = (rows: typeof lines) => rows.reduce((total, line) => total.plus(line.originalValue).plus(line.movements.reduce((sum, row) => sum.plus(row.value), new Decimal(0))), new Decimal(0));
    return { dimension, source, target, difference: value(source).minus(value(target)) };
  }) };
}

export async function applyPlanningCompatibility(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = compatibilityInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), (tx) => applyCompatibilityInTransaction(tx, context, input), { timeoutMs: 30000 });
}

async function applyCompatibilityInTransaction(tx: PlanningTx, context: PlanningContext, input: z.infer<typeof compatibilityInput>) {
    const locked = [];
    for (const id of [input.sourceId, input.targetId].sort()) locked.push(await lockLegalInstrument(tx, context, id));
    const source = locked.find((piece) => piece.id === input.sourceId)!; const target = locked.find((piece) => piece.id === input.targetId)!;
    const [replay] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.entityId, target.id), eq(financialAuditLogs.action, "PLANNING_COMPATIBILITY"), sql`${financialAuditLogs.payload}->>'submissionKey' = ${input.submissionKey}`)).limit(1);
    if (replay) { if (contentHash(replay.payload) !== contentHash(input)) throw new Error("Solicitação repetida com dados diferentes."); return target.id; }
    if (source.revision !== input.expectedSourceRevision || target.revision !== input.expectedTargetRevision) throw new Error("A prévia mudou. Consulte as diferenças novamente.");
    const sourceCanonical = canonicalPiece(source)!;
    if (!["SANCTIONED", "PUBLISHED"].includes(sourceCanonical.status) || !sourceCanonical.sanctionedAt || new Date(input.effectiveAt) < sourceCanonical.sanctionedAt) throw new Error("Propagação legal exige uma versão de origem sancionada/publicada e vigente na data do ato.");
    const preview = await planningCompatibility({ ...context, database: tx }, source.id, target.id, input.year, input.effectiveAt);
    const mappings = z.array(z.object({ sourceLineId: z.string().min(1), targetLineId: z.string().nullable(), newCode: z.string().trim().min(1).max(60).optional() })).parse(JSON.parse(input.lineMappings));
    if (new Set(mappings.map((row) => row.sourceLineId)).size !== mappings.length || mappings.some((mapping) => !preview.rows.some((row) => row.source.some((line) => line.id === mapping.sourceLineId)))) throw new Error("Mapeamento contém origens desconhecidas ou duplicadas.");
    const position = (line: typeof preview.rows[number]["source"][number]) => line.movements.reduce((value, row) => value.plus(row.value), line.originalValue);
    const rowsToApply = preview.rows.flatMap((row) => {
      if (row.source.length <= 1 && row.target.length <= 1 && !mappings.some((mapping) => row.source.some((line) => line.id === mapping.sourceLineId))) return [row];
      const used = new Set<string>();
      const resolved = row.source.map((origin) => {
        const mapping = mappings.find((item) => item.sourceLineId === origin.id);
        if (!mapping) throw new Error("Mapeie cada dotação da classificação ambígua na prévia.");
        const destination = mapping.targetLineId ? row.target.find((line) => line.id === mapping.targetLineId) : undefined;
        if (mapping.targetLineId && (!destination || used.has(mapping.targetLineId))) throw new Error("Destino inválido ou utilizado por mais de uma origem no mapeamento.");
        if (destination) used.add(destination.id);
        return { dimension: `${row.dimension}:${origin.id}`, source: [origin], target: destination ? [destination] : [], difference: position(origin).minus(destination ? position(destination) : 0) };
      });
      return [...resolved, ...row.target.filter((line) => !used.has(line.id)).map((line) => ({ dimension: `${row.dimension}:${line.id}`, source: [], target: [line], difference: position(line).negated() }))];
    });
    const status = canonicalPiece(target)?.status;
    if (!["SANCTIONED", "PUBLISHED"].includes(status ?? "") || !canonicalPiece(target)?.sanctionedAt) throw new Error("Compatibilização legal exige destino sancionado/publicado com sanção registrada.");
    await snapshotVersion(tx, context, target.id, canonicalPiece(target)!.sanctionedAt!, canonicalPiece(target)!.legalActNumber ?? input.legalActNumber, "Antes da compatibilização");
    for (const row of rowsToApply) {
      let destination: typeof planningLines.$inferSelect | undefined = row.target[0];
      const origin = row.source[0];
      if (!destination && origin) {
        const creationCode = mappings.find((mapping) => mapping.sourceLineId === origin.id)?.newCode ?? origin.code;
        if ((await tx.select({ id: planningLines.id }).from(planningLines).where(and(eq(planningLines.instrumentId, target.id), eq(planningLines.code, creationCode))).limit(1)).length) throw new Error(`Código ${creationCode} já utilizado por outra classificação no destino.`);
        [destination] = await tx.insert(planningLines).values({ instrumentId: target.id, code: creationCode, description: origin.description, year: origin.year, kind: origin.kind, budgetUnitId: origin.budgetUnitId, resourceSourceId: origin.resourceSourceId, revenueNatureId: origin.revenueNatureId, expenseNatureId: origin.expenseNatureId, programId: origin.programId, actionId: origin.actionId, functionCode: origin.functionCode, subfunctionCode: origin.subfunctionCode, product: origin.product, productUnit: origin.productUnit, destinationEntityId: origin.destinationEntityId, transferDirection: origin.transferDirection, originalValue: new Decimal(0), physicalTarget: new Decimal(0) }).returning();
        if (target.annualBudgetLawId && destination.kind !== "TRANSFER") {
          if (destination.kind === "REVENUE") await tx.insert(planningForecasts).values({ annualBudgetLawId: target.annualBudgetLawId, code: destination.code, name: destination.description, estimatedValue: new Decimal(0) });
          else {
            const [fixation] = await tx.insert(planningFixations).values({ annualBudgetLawId: target.annualBudgetLawId, code: destination.code, name: destination.description, fixedValue: new Decimal(0) }).returning();
            if (target.implantedAt && target.annualBudgetLaw) {
              const [appropriation] = await tx.insert(planningAppropriations).values({ code: await planningAppropriationCode(tx, target, destination), financialYearId: target.annualBudgetLaw.financialYearId, budgetUnitId: destination.budgetUnitId, resourceSourceId: destination.resourceSourceId, expenseNatureId: destination.expenseNatureId!, annualBudgetExpenseFixationId: fixation.id, programPPAId: destination.programId, actionPPAId: destination.actionId, initialValue: 0, initialValueDecimal: new Decimal(0), updatedValue: 0, updatedValueDecimal: new Decimal(0), committedValueDecimal: new Decimal(0) }).returning();
              [destination] = await tx.update(planningLines).set({ appropriationId: appropriation.id }).where(eq(planningLines.id, destination.id)).returning();
            }
          }
        }
      }
      if (!destination) throw new Error("Nenhuma dotação correspondente no destino.");
      if (!row.difference.isZero()) await applyLineDelta(tx, context, target, { lineId: destination.id, value: row.difference, effectiveAt: new Date(input.effectiveAt), legalActNumber: input.legalActNumber, legalText: input.legalText, reason: input.reason, key: `${input.submissionKey}:${destination.id}`, allowBlocked: true });
      if (destination.kind === "EXPENSE" && !destination.physicalTarget.equals(origin?.physicalTarget ?? 0)) {
        const physicalTarget = origin?.physicalTarget ?? new Decimal(0);
        await tx.insert(planningPhysicalEvents).values({ lineId: destination.id, effectiveAt: new Date(input.effectiveAt), target: physicalTarget, actual: destination.physicalActual, reason: input.reason, submissionKey: `${input.submissionKey}:physical:${destination.id}`, createdById: context.user.id });
        await tx.update(planningLines).set({ originalPhysicalTarget: destination.originalPhysicalTarget ?? destination.physicalTarget, originalPhysicalActual: destination.originalPhysicalActual ?? destination.physicalActual, physicalTarget }).where(eq(planningLines.id, destination.id));
      }
    }
    await finalizeLegalRevision(tx, context, target, new Date(input.effectiveAt), input.legalActNumber, input.reason);
    await planningAudit(tx, context, target.id, "PLANNING_COMPATIBILITY", input);
    return target.id;
}

export async function propagatePlanningCompatibility(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = compatibilityInput.omit({ targetId: true, expectedSourceRevision: true, expectedTargetRevision: true }).extend({ targetIds: z.string().min(1), expectedRevisions: z.string().min(1) }).parse(raw);
  const ids = [...new Set(input.targetIds.split(",").filter(Boolean))];
  const revisions = z.record(z.string(), z.number().int().positive()).parse(JSON.parse(input.expectedRevisions));
  if (!ids.length || ids.length > 10 || ids.includes(input.sourceId)) throw new Error("Selecione de um a dez destinos distintos da origem.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    for (const id of [input.sourceId, ...ids].sort()) await lockLegalInstrument(tx, context, id);
    for (const targetId of ids) {
      if (!revisions[targetId] || !revisions[input.sourceId]) throw new Error("Atualize a prévia das versões antes de propagar.");
      await applyCompatibilityInTransaction(tx, context, { sourceId: input.sourceId, targetId, expectedSourceRevision: revisions[input.sourceId], expectedTargetRevision: revisions[targetId], lineMappings: input.lineMappings, year: input.year, effectiveAt: input.effectiveAt, legalActNumber: input.legalActNumber, legalText: input.legalText, reason: input.reason, submissionKey: `${input.submissionKey}:${targetId}` });
    }
    return input.sourceId;
  }, { timeoutMs: 30000 });
}

export async function updatePlanningPhysical(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), effectiveAt: planningDateSchema, target: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/), actual: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/), legalActNumber: z.string().trim().optional(), reason: z.string().trim().min(1), submissionKey: z.string().uuid() }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const visible = await readPlanningInstrument(tx, input.instrumentId, context);
    if (!visible) throw new AccessError("Peça não encontrada neste escopo.", 404);
    const ids = visible.kind === "LDO" && visible.parentId ? [visible.id, visible.parentId].sort() : [visible.id];
    for (const id of ids) await lockLegalInstrument(tx, context, id);
    const [line] = await tx.select().from(planningLines).where(and(planningLineScope(context), eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, visible.id), eq(planningLines.kind, "EXPENSE"))).limit(1);
    if (!line) throw new AccessError("Previsão não encontrada neste escopo.", 404);
    const [duplicate] = await tx.select().from(planningPhysicalEvents).where(eq(planningPhysicalEvents.submissionKey, input.submissionKey)).limit(1);
    if (duplicate) { if (duplicate.lineId !== line.id || !duplicate.target.equals(input.target) || !duplicate.actual.equals(input.actual) || duplicate.reason !== input.reason || duplicate.effectiveAt.toISOString().slice(0, 10) !== input.effectiveAt) throw new Error("Solicitação repetida com dados diferentes."); return duplicate.id; }
    if (Number(input.effectiveAt.slice(0, 4)) !== line.year) throw new Error("Realização deve pertencer ao exercício da meta.");
    if (input.effectiveAt > new Date().toISOString().slice(0, 10)) throw new Error("Realização física não pode ter data futura.");
    const targets = [line];
    if (visible.kind === "LDO" && visible.parentId) {
      const matches = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, visible.parentId), eq(planningLines.year, line.year), eq(planningLines.kind, "EXPENSE"), sql`${planningLines.actionId} IS NOT DISTINCT FROM ${line.actionId}`, eq(planningLines.resourceSourceId, line.resourceSourceId), eq(planningLines.budgetUnitId, line.budgetUnitId), sql`${planningLines.expenseNatureId} IS NOT DISTINCT FROM ${line.expenseNatureId}`, sql`${planningLines.product} IS NOT DISTINCT FROM ${line.product}`, sql`${planningLines.productUnit} IS NOT DISTINCT FROM ${line.productUnit}`, planningLineScope(context)));
      if (matches.length !== 1) throw new Error("Meta do PPA ausente ou ambígua; compatibilize antes de registrar o realizado.");
      targets.push(matches[0]);
    }
    for (const target of targets) {
      const targetPiece = await lockLegalInstrument(tx, context, target.instrumentId);
      const canonical = canonicalPiece(targetPiece)!;
      if (["SANCTIONED", "PUBLISHED"].includes(canonical.status) && !target.physicalTarget.equals(input.target) && !input.legalActNumber) throw new Error("Alteração da meta de peça fechada exige número do ato legal.");
      if (canonical.sanctionedAt) await snapshotVersion(tx, context, targetPiece.id, canonical.sanctionedAt, canonical.legalActNumber ?? input.legalActNumber ?? "Registro físico", "Antes da atualização física");
      await tx.insert(planningPhysicalEvents).values({ lineId: target.id, target: new Decimal(input.target), actual: new Decimal(input.actual), effectiveAt: new Date(input.effectiveAt), reason: input.reason, submissionKey: target.id === line.id ? input.submissionKey : `${input.submissionKey}:ppa`, createdById: context.user.id });
      const [latest] = await tx.select().from(planningPhysicalEvents).where(eq(planningPhysicalEvents.lineId, target.id)).orderBy(desc(planningPhysicalEvents.effectiveAt), desc(planningPhysicalEvents.createdAt), desc(planningPhysicalEvents.id)).limit(1);
      await tx.update(planningLines).set({ originalPhysicalTarget: target.originalPhysicalTarget ?? target.physicalTarget, originalPhysicalActual: target.originalPhysicalActual ?? target.physicalActual, physicalTarget: latest.target, physicalActual: latest.actual }).where(eq(planningLines.id, target.id));
      await finalizeLegalRevision(tx, context, targetPiece, new Date(input.effectiveAt), input.legalActNumber ?? "Registro de realização física", input.reason);
    }
    await planningAudit(tx, context, visible.id, "PLANNING_PHYSICAL", input);
    return line.id;
  });
}

const versionSnapshot = z.object({
  piece: z.record(z.string(), z.unknown()),
  lines: z.array(z.object({ budgetUnitId: z.string() }).passthrough()),
}).passthrough();

export async function readPlanningVersion(context: PlanningContext, instrumentId: string, number: number) {
  const [version] = await planningDatabase(context).select().from(planningVersions).where(and(eq(planningVersions.instrumentId, instrumentId), eq(planningVersions.number, number), planningInstrumentScope(context, planningVersions.instrumentId))).limit(1);
  if (!version) throw new AccessError("Versão não encontrada neste escopo.", 404);
  const snapshot = versionSnapshot.parse(version.snapshot);
  return { ...version, snapshot: { ...snapshot, lines: snapshot.lines.filter((line) => isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) } };
}
