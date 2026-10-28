import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningAppropriations, planningBudgetLaws, planningInstruments, planningLines, planningMovements, planningQuotas } from "@/db/schema/planning-budget";
import { planningActions, planningAnnualPrograms, planningCatalogVersions, planningFixations, planningForecasts, planningGoals, planningIndicators, planningMemories, planningObjectives, planningPlannedWorks, planningPriorities, planningPrograms, planningRisks, planningWaivers } from "@/db/schema/planning-legal";
import { taxes } from "@/db/schema/master-data";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { lockCatalogDraftInstrument, requireCatalogLine } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { assertWholePiece, canonicalPiece, finalizeLegalRevision, jsonValue, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { actionInput, lineInput, moneySchema, planningLineData, programInput, projectedValue } from "./policy";
import { automaticPlanningReducedCode, planningLineClassification } from "./classification";
import { planningDateSchema } from "./revisions";

const inputSchema = z.object({ instrumentId: z.string().min(1), recordId: z.string().optional(), entity: z.enum(["INSTRUMENT", "PROGRAM", "ACTION", "OBJECTIVE", "INDICATOR", "LINE", "MEMORY", "WAIVER", "PRIORITY", "RISK", "WORK", "ANNUAL_PROGRAM"]), mode: z.enum(["SAVE", "DELETE"]).default("SAVE"), expectedRevision: z.coerce.number().int().positive().optional(), effectiveAt: planningDateSchema.optional(), legalActNumber: z.string().optional(), legalText: z.string().optional(), reason: z.string().trim().min(1).default("Manutenção da elaboração") }).passthrough();
const text = z.string().trim().min(1).max(4000);
function required<T>(rows: T[]): T { if (!rows.length) throw new Error("Registro não encontrado neste escopo."); return rows[0]; }

export async function maintainPlanningRecord(context: PlanningContext, raw: unknown) {
  const input = inputSchema.parse(raw);
  assertPlanningOperation(context, input.mode === "DELETE" ? "delete" : "update");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const visible = await readPlanningInstrument(tx, input.instrumentId, context);
    if (!visible) throw new Error("Peça não encontrada neste escopo.");
    const rootId = visible.kind === "PPA" ? visible.id : visible.kind === "LDO" ? visible.parentId! : visible.parent!.parentId!;
    const structural = ["PROGRAM", "ACTION", "OBJECTIVE", "INDICATOR"].includes(input.entity);
    const related = structural ? await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(and(planningInstrumentScope(context), or(eq(planningInstruments.id, rootId), eq(planningInstruments.parentId, rootId), sql`EXISTS (SELECT 1 FROM "PlanningInstrument" parent WHERE parent.id = ${planningInstruments.parentId} AND parent."parentId" = ${rootId})`))) : [{ id: visible.id }];
    const pieces = [];
    for (const id of related.map((piece) => piece.id).sort()) { const piece = await lockLegalInstrument(tx, context, id); await assertWholePiece(tx, context, piece.id); pieces.push(piece); }
    const piece = pieces.find((item) => item.id === visible.id)!;
    if (input.expectedRevision && piece.revision !== input.expectedRevision) throw new Error("O registro mudou. Recarregue a peça antes de salvar.");
    const closed = pieces.filter((item) => canonicalPiece(item)?.status !== "DRAFT");
    if (closed.length) {
      if (input.entity === "LINE" || input.entity === "INSTRUMENT" || input.mode === "DELETE") throw new Error("Peça fechada não admite alteração/exclusão de previsão original ou configuração. Utilize revisão legal.");
      if (closed.some((item) => !["SANCTIONED", "PUBLISHED"].includes(canonicalPiece(item)?.status ?? ""))) throw new Error("Conclua ou devolva a análise da peça antes de alterar seus cadastros.");
      assertPlanningLegalAuthority(context);
      if (!input.effectiveAt || !input.legalActNumber?.trim() || !input.legalText?.trim()) throw new Error("Manutenção de peça fechada exige data, ato e texto jurídico.");
      if (input.effectiveAt > new Date().toISOString().slice(0, 10) || closed.some((item) => new Date(input.effectiveAt!) < canonicalPiece(item)!.sanctionedAt!)) throw new Error("Data anterior à sanção ou ainda não vigente.");
      for (const item of pieces) await snapshotVersion(tx, context, item.id, new Date(input.effectiveAt), input.legalActNumber, "Antes da manutenção formal");
    }
    const root = pieces.find((item) => item.id === rootId);
    const ppaId = root?.multiYearPlanId ?? visible.multiYearPlanId ?? visible.parent?.multiYearPlanId ?? visible.parent?.parent?.multiYearPlanId;
    if (!ppaId) throw new Error("Cadeia canônica do PPA não localizada.");
    if (structural && closed.length) await tx.execute(sql`SELECT set_config('planning.formal_revision_ppa', ${ppaId}, true)`);
    let id = input.recordId ?? piece.id;
    if (input.mode === "DELETE" && input.entity !== "LINE") {
      if (!input.recordId || input.entity === "INSTRUMENT") throw new Error("Selecione um registro de elaboração para excluir.");
      if (input.entity === "PROGRAM") {
        required(await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, id), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
        if ((await tx.select({ id: planningLines.id }).from(planningLines).where(eq(planningLines.programId, id)).limit(1)).length || (await tx.select({ id: planningAppropriations.id }).from(planningAppropriations).where(eq(planningAppropriations.programPPAId, id)).limit(1)).length || (await tx.select({ id: planningActions.id }).from(planningActions).where(eq(planningActions.programId, id)).limit(1)).length || (await tx.select({ id: planningObjectives.id }).from(planningObjectives).where(eq(planningObjectives.programId, id)).limit(1)).length) throw new Error("Programa possui dependências; não pode ser excluído.");
        await tx.delete(planningPrograms).where(eq(planningPrograms.id, id));
      } else if (input.entity === "ACTION") {
        required(await tx.select({ id: planningActions.id }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).where(and(eq(planningActions.id, id), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
        if ((await tx.select({ id: planningLines.id }).from(planningLines).where(eq(planningLines.actionId, id)).limit(1)).length || (await tx.select({ id: planningAppropriations.id }).from(planningAppropriations).where(eq(planningAppropriations.actionPPAId, id)).limit(1)).length || (await tx.select({ id: planningGoals.id }).from(planningGoals).where(eq(planningGoals.actionId, id)).limit(1)).length) throw new Error("Ação possui metas/orçamento.");
        await tx.delete(planningActions).where(eq(planningActions.id, id));
      } else if (input.entity === "OBJECTIVE") {
        required(await tx.select({ id: planningObjectives.id }).from(planningObjectives).innerJoin(planningPrograms, eq(planningPrograms.id, planningObjectives.programId)).where(and(eq(planningObjectives.id, id), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
        if ((await tx.select({ id: planningIndicators.id }).from(planningIndicators).where(eq(planningIndicators.objectiveId, id)).limit(1)).length) throw new Error("Objetivo possui indicadores.");
        await tx.delete(planningObjectives).where(eq(planningObjectives.id, id));
      } else if (input.entity === "INDICATOR") {
        required(await tx.select({ id: planningIndicators.id }).from(planningIndicators).innerJoin(planningObjectives, eq(planningObjectives.id, planningIndicators.objectiveId)).innerJoin(planningPrograms, eq(planningPrograms.id, planningObjectives.programId)).where(and(eq(planningIndicators.id, id), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
        await tx.delete(planningIndicators).where(eq(planningIndicators.id, id));
      } else if (input.entity === "WORK") { required(await tx.select().from(planningPlannedWorks).where(and(eq(planningPlannedWorks.id, id), eq(planningPlannedWorks.instrumentId, piece.id))).limit(1)); await tx.delete(planningPlannedWorks).where(eq(planningPlannedWorks.id, id)); }
      else if (input.entity === "MEMORY") { required(await tx.select().from(planningMemories).where(and(eq(planningMemories.id, id), eq(planningMemories.instrumentId, piece.id))).limit(1)); await tx.delete(planningMemories).where(eq(planningMemories.id, id)); }
      else if (input.entity === "WAIVER") { required(await tx.select().from(planningWaivers).where(and(eq(planningWaivers.id, id), eq(planningWaivers.instrumentId, piece.id))).limit(1)); await tx.delete(planningWaivers).where(eq(planningWaivers.id, id)); }
      else if (input.entity === "PRIORITY") { required(await tx.select().from(planningPriorities).where(and(eq(planningPriorities.id, id), eq(planningPriorities.budgetGuidelineId, piece.budgetGuidelineId ?? ""))).limit(1)); await tx.delete(planningPriorities).where(eq(planningPriorities.id, id)); }
      else if (input.entity === "RISK") { required(await tx.select().from(planningRisks).where(and(eq(planningRisks.id, id), eq(planningRisks.budgetGuidelineId, piece.budgetGuidelineId ?? ""))).limit(1)); await tx.delete(planningRisks).where(eq(planningRisks.id, id)); }
      else { required(await tx.select().from(planningAnnualPrograms).where(and(eq(planningAnnualPrograms.id, id), eq(planningAnnualPrograms.instrumentId, piece.id))).limit(1)); await tx.delete(planningAnnualPrograms).where(eq(planningAnnualPrograms.id, id)); }
    } else if (input.entity === "INSTRUMENT") {
      const data = z.object({ title: text.max(200), projectNumber: z.string().max(100).optional(), legalText: z.string().max(20000).optional(), revenueDegree: z.coerce.number().int().min(1).max(10), expenseDegree: z.coerce.number().int().min(1).max(10), expenseLevel: z.enum(["ELEMENT_SOURCE", "SOURCE"]), catalogVersionId: z.string().optional() }).parse(input);
      if (piece.kind === "LOA" && data.expenseLevel !== "ELEMENT_SOURCE") throw new Error("A LOA exige elemento de despesa para disponibilizar dotações à execução.");
      if (data.catalogVersionId !== (piece.catalogVersionId ?? undefined) && (await tx.select({ id: planningLines.id }).from(planningLines).where(eq(planningLines.instrumentId, piece.id)).limit(1)).length) throw new Error("Defina a versão do catálogo antes de cadastrar previsões; não reclassifique originais silenciosamente.");
      if (data.catalogVersionId) { const version = required(await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, data.catalogVersionId)).limit(1)); if (version.status !== "PUBLISHED" || version.year < piece.startYear || version.year > piece.endYear) throw new Error("Catálogo não publicado ou fora da vigência."); }
      await tx.update(planningInstruments).set(data).where(eq(planningInstruments.id, piece.id));
    } else if (input.entity === "PROGRAM") {
      const data = programInput.omit({ instrumentId: true, objectiveCode: true, objective: true, indicatorName: true, indicatorUnit: true, baselineValue: true, targetValue: true }).parse(input);
      const record = input.recordId ? required(await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, input.recordId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1)) : null;
      if (record && closed.length && record.code !== data.code) throw new Error("Código de programa da peça fechada é preservado; inclua nova classificação por revisão formal.");
      id = record ? required(await tx.update(planningPrograms).set(data).where(eq(planningPrograms.id, record.id)).returning()).id : required(await tx.insert(planningPrograms).values({ ...data, multiYearPlanId: ppaId }).returning()).id;
    } else if (input.entity === "ACTION") {
      const data = actionInput.omit({ instrumentId: true }).parse(input);
      required(await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, data.programId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
      const record = input.recordId ? (required(await tx.select({ record: planningActions }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).where(and(eq(planningActions.id, input.recordId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1))).record : null;
      if (record && closed.length && (record.code !== data.code || record.programId !== data.programId)) throw new Error("Código e programa da ação fechada são preservados.");
      id = record ? required(await tx.update(planningActions).set(data).where(eq(planningActions.id, record.id)).returning()).id : required(await tx.insert(planningActions).values(data).returning()).id;
    } else if (input.entity === "OBJECTIVE") {
      const data = z.object({ programId: z.string().min(1), code: text.max(60), description: text }).parse(input);
      required(await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, data.programId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
      const record = input.recordId ? required(await tx.select({ record: planningObjectives }).from(planningObjectives).innerJoin(planningPrograms, eq(planningPrograms.id, planningObjectives.programId)).where(and(eq(planningObjectives.id, input.recordId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1)).record : null;
      id = record ? required(await tx.update(planningObjectives).set(data).where(eq(planningObjectives.id, record.id)).returning()).id : required(await tx.insert(planningObjectives).values(data).returning()).id;
    } else if (input.entity === "INDICATOR") {
      const data = z.object({ objectiveId: z.string().min(1), name: text.max(200), unit: text.max(100), baselineValue: z.coerce.number().finite().nonnegative(), targetValue: z.coerce.number().finite().nonnegative() }).parse(input);
      required(await tx.select({ id: planningObjectives.id }).from(planningObjectives).innerJoin(planningPrograms, eq(planningPrograms.id, planningObjectives.programId)).where(and(eq(planningObjectives.id, data.objectiveId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
      const record = input.recordId ? required(await tx.select({ record: planningIndicators }).from(planningIndicators).innerJoin(planningObjectives, eq(planningObjectives.id, planningIndicators.objectiveId)).innerJoin(planningPrograms, eq(planningPrograms.id, planningObjectives.programId)).where(and(eq(planningIndicators.id, input.recordId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1)).record : null;
      id = record ? required(await tx.update(planningIndicators).set(data).where(eq(planningIndicators.id, record.id)).returning()).id : required(await tx.insert(planningIndicators).values(data).returning()).id;
    } else if (input.entity === "LINE") {
      if (!input.recordId) throw new Error("Selecione a previsão a manter.");
      await lockCatalogDraftInstrument(tx, context, piece.id);
      const record = await requireCatalogLine(tx, context, and(eq(planningLines.id, input.recordId), eq(planningLines.instrumentId, piece.id))!);
      if ((await tx.select({ id: planningMovements.id }).from(planningMovements).where(eq(planningMovements.lineId, record.id)).limit(1)).length || record.appropriationId) throw new Error("Previsão possui histórico/execução e não pode ser sobrescrita.");
      if (input.mode === "DELETE") {
        if ((await tx.select({ id: planningQuotas.id }).from(planningQuotas).where(eq(planningQuotas.lineId, record.id)).limit(1)).length) throw new Error("Previsão possui programação vinculada.");
        await tx.delete(planningLines).where(eq(planningLines.id, record.id));
      } else {
        const data = lineInput.parse({ ...input, kind: record.kind, expenseBudgetLevel: piece.kind === "LOA" ? "ELEMENT_SOURCE" : piece.expenseLevel });
        if (data.year < piece.startYear || data.year > piece.endYear || data.budgetUnitId !== record.budgetUnitId) throw new Error("Mantenha a unidade autorizada e a vigência da previsão.");
        if (data.kind === "EXPENSE") required(await tx.select({ id: planningActions.id }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).where(and(eq(planningActions.id, data.actionId!), eq(planningActions.programId, data.programId!), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
        const values = planningLineData(data);
        await tx.update(planningLines).set({ ...values, originalValue: new Decimal(values.originalValue), physicalTarget: new Decimal(values.physicalTarget), reducedCode: await automaticPlanningReducedCode(tx, piece.id, data), classificationSnapshot: await planningLineClassification(tx, piece, data) ?? null }).where(eq(planningLines.id, record.id));
      }
      if (piece.annualBudgetLawId) {
        if (record.kind === "REVENUE") { await tx.delete(planningForecasts).where(and(eq(planningForecasts.annualBudgetLawId, piece.annualBudgetLawId), eq(planningForecasts.code, record.code))); if (input.mode === "SAVE") { const current = required(await tx.select().from(planningLines).where(eq(planningLines.id, record.id)).limit(1)); await tx.insert(planningForecasts).values({ annualBudgetLawId: piece.annualBudgetLawId, code: current.code, name: current.description, estimatedValue: current.originalValue }); } }
        else { await tx.delete(planningFixations).where(and(eq(planningFixations.annualBudgetLawId, piece.annualBudgetLawId), eq(planningFixations.code, record.code))); if (input.mode === "SAVE") { const current = required(await tx.select().from(planningLines).where(eq(planningLines.id, record.id)).limit(1)); await tx.insert(planningFixations).values({ annualBudgetLawId: piece.annualBudgetLawId, code: current.code, name: current.description, fixedValue: current.originalValue }); } }
        const totals = await tx.select({ kind: planningLines.kind, value: sql<string | null>`sum(${planningLines.originalValue})::text` }).from(planningLines).where(eq(planningLines.instrumentId, piece.id)).groupBy(planningLines.kind);
        await tx.update(planningBudgetLaws).set({ totalRevenue: new Decimal(totals.find(row => row.kind === "REVENUE")?.value ?? "0"), totalExpense: new Decimal(totals.find(row => row.kind === "EXPENSE")?.value ?? "0") }).where(eq(planningBudgetLaws.id, piece.annualBudgetLawId));
      }
    } else if (input.entity === "PRIORITY" || input.entity === "RISK") {
      if (!piece.budgetGuidelineId) throw new Error("Prioridades e riscos exigem LDO.");
      if (input.entity === "PRIORITY") {
        const data = z.object({ description: text, targetValue: moneySchema.optional() }).parse(input);
        const record = input.recordId ? required(await tx.select().from(planningPriorities).where(and(eq(planningPriorities.id, input.recordId), eq(planningPriorities.budgetGuidelineId, piece.budgetGuidelineId))).limit(1)) : null;
        const values = { ...data, targetValue: data.targetValue === undefined ? undefined : new Decimal(data.targetValue) };
        id = record ? required(await tx.update(planningPriorities).set(values).where(eq(planningPriorities.id, record.id)).returning()).id : required(await tx.insert(planningPriorities).values({ ...values, budgetGuidelineId: piece.budgetGuidelineId }).returning()).id;
      } else {
        const data = z.object({ description: text, estimatedImpact: moneySchema, mitigation: text }).parse(input);
        const record = input.recordId ? required(await tx.select().from(planningRisks).where(and(eq(planningRisks.id, input.recordId), eq(planningRisks.budgetGuidelineId, piece.budgetGuidelineId))).limit(1)) : null;
        const values = { ...data, estimatedImpact: new Decimal(data.estimatedImpact) };
        id = record ? required(await tx.update(planningRisks).set(values).where(eq(planningRisks.id, record.id)).returning()).id : required(await tx.insert(planningRisks).values({ ...values, budgetGuidelineId: piece.budgetGuidelineId }).returning()).id;
      }
    } else if (input.entity === "ANNUAL_PROGRAM") {
      const data = z.object({ programId: z.string().min(1), year: z.coerce.number().int(), priority: z.string().optional() }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Programa anual fora da vigência.");
      required(await tx.select().from(planningPrograms).where(and(eq(planningPrograms.id, data.programId), eq(planningPrograms.multiYearPlanId, ppaId))).limit(1));
      const [record] = await tx.insert(planningAnnualPrograms).values({ instrumentId: piece.id, ...data }).onConflictDoUpdate({ target: [planningAnnualPrograms.instrumentId, planningAnnualPrograms.programId, planningAnnualPrograms.year], set: { priority: data.priority ?? sql`${planningAnnualPrograms.priority}` } }).returning();
      id = record.id;
    } else if (input.entity === "WORK") {
      const data = z.object({ title: text.max(200), type: z.enum(["WORK", "CONSERVATION"]), location: text, legalReference: text, year: z.coerce.number().int(), value: moneySchema, startsAt: planningDateSchema, conservationValue: moneySchema, newProjectsValue: moneySchema }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear || Number(data.startsAt.slice(0, 4)) > data.year) throw new Error("Revise exercício e início da obra.");
      const record = input.recordId ? required(await tx.select().from(planningPlannedWorks).where(and(eq(planningPlannedWorks.id, input.recordId), eq(planningPlannedWorks.instrumentId, piece.id))).limit(1)) : null;
      const values = { ...data, startsAt: new Date(data.startsAt), value: new Decimal(data.value), conservationValue: new Decimal(data.conservationValue), newProjectsValue: new Decimal(data.newProjectsValue) };
      id = record ? required(await tx.update(planningPlannedWorks).set(values).where(eq(planningPlannedWorks.id, record.id)).returning()).id : required(await tx.insert(planningPlannedWorks).values({ ...values, instrumentId: piece.id, createdById: context.user.id }).returning()).id;
    } else if (input.entity === "MEMORY") {
      const data = z.object({ title: text, normativeReference: text, methodology: text, assumptions: text, year: z.coerce.number().int(), baseValue: moneySchema, rate: z.string().regex(/^-?\d{1,5}(\.\d{1,6})?$/) }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Memória fora da vigência.");
      const resultValue = projectedValue(data.baseValue, data.rate);
      if (resultValue.isNegative()) throw new Error("Projeção negativa.");
      const record = input.recordId ? required(await tx.select().from(planningMemories).where(and(eq(planningMemories.id, input.recordId), eq(planningMemories.instrumentId, piece.id))).limit(1)) : null;
      const values = { ...data, baseValue: new Decimal(data.baseValue), rate: new Decimal(data.rate), resultValue, calculation: jsonValue({ formula: "BASE*(1+RATE/100)", rounding: "HALF_UP_CENTS", base: data.baseValue, rate: data.rate, year: data.year }) };
      id = record ? required(await tx.update(planningMemories).set(values).where(eq(planningMemories.id, record.id)).returning()).id : required(await tx.insert(planningMemories).values({ ...values, instrumentId: piece.id, createdById: context.user.id }).returning()).id;
    } else if (input.entity === "WAIVER") {
      const data = z.object({ year: z.coerce.number().int(), description: text, legalReference: text, modality: text, estimatedValue: moneySchema, compensation: text, compensationValue: moneySchema, methodology: text, taxId: z.string().optional() }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Renúncia fora da vigência.");
      if (data.taxId) required(await tx.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.id, data.taxId), eq(taxes.isActive, true))).limit(1));
      const record = input.recordId ? required(await tx.select().from(planningWaivers).where(and(eq(planningWaivers.id, input.recordId), eq(planningWaivers.instrumentId, piece.id))).limit(1)) : null;
      const values = { ...data, estimatedValue: new Decimal(data.estimatedValue), compensationValue: new Decimal(data.compensationValue) };
      id = record ? required(await tx.update(planningWaivers).set(values).where(eq(planningWaivers.id, record.id)).returning()).id : required(await tx.insert(planningWaivers).values({ ...values, instrumentId: piece.id, createdById: context.user.id }).returning()).id;
    }
    for (const item of pieces) {
      if (closed.length) await finalizeLegalRevision(tx, context, item, new Date(input.effectiveAt!), input.legalActNumber!, input.reason);
      else await tx.update(planningInstruments).set({ revision: sql`${planningInstruments.revision} + 1` }).where(eq(planningInstruments.id, item.id));
    }
    await planningAudit(tx, context, piece.id, "PLANNING_MAINTENANCE", { entity: input.entity, mode: input.mode, recordId: id, reason: input.reason, legalActNumber: input.legalActNumber ?? null });
    return id;
  }, { timeoutMs: 60000 });
}
