import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningBudgetLaws, planningInstruments, planningLines } from "@/db/schema/planning-budget";
import { planningActions, planningAnnualPrograms, planningFixations, planningForecasts, planningInstrumentSources, planningPrograms, planningResourceSources } from "@/db/schema/planning-legal";
import { catalogImportBatches } from "@/db/schema/planning-catalog-operations";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { copyCatalogProgram, lockCatalogDraftInstrument, readCatalogLinePosition, readCatalogProgram } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection, planningDatabase } from "./database";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { automaticPlanningReducedCode, planningLineClassification } from "./classification";
import { assertWholePiece, contentHash, linePosition, planningProgramCatalog } from "./operations-core";
import { readPlanningFinancialExecution } from "./execution-bridge";

const inputSchema = z.object({ sourceInstrumentId: z.string().min(1), targetInstrumentId: z.string().min(1), sourceYear: z.coerce.number().int().optional(), targetYear: z.coerce.number().int(), mode: z.enum(["STRUCTURE", "VALUES", "REALIZED"]), realizedStage: z.enum(["EMPENHADA", "PAGA_BRUTA"]).default("EMPENHADA"), valuePosition: z.enum(["ORIGINAL", "UPDATED"]).default("ORIGINAL"), expenseNatureId: z.string().optional(), programConflict: z.enum(["REJECT", "REUSE_TARGET"]).default("REJECT"), expectedValuesHash: z.string().optional(), expectedSourceRevision: z.coerce.number().int().optional(), expectedTargetRevision: z.coerce.number().int().optional(), lineCodes: z.string().trim().default(""), submissionKey: z.string().uuid() });

export async function importPlanningLines(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = inputSchema.parse(raw);
  if (input.sourceInstrumentId === input.targetInstrumentId) throw new Error("Origem e destino devem ser diferentes.");
  const selectedCodes = [...new Set(input.lineCodes.split(",").map((code) => code.trim()).filter(Boolean))].sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({ source: input.sourceInstrumentId, target: input.targetInstrumentId, year: input.targetYear, sourceYear: input.sourceYear ?? null, mode: input.mode, realizedStage: input.realizedStage, valuePosition: input.valuePosition, expenseNatureId: input.expenseNatureId ?? null, programConflict: input.programConflict, selectedCodes })).digest("hex");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const instruments = await tx.select().from(planningInstruments).where(and(inArray(planningInstruments.id, [input.sourceInstrumentId, input.targetInstrumentId]), planningInstrumentScope(context)));
    if (instruments.length !== 2) throw new AccessError("Origem ou destino fora do escopo autorizado.", 403);
    if (instruments[0].governmentEntityId !== instruments[1].governmentEntityId) throw new Error("A importação exige a mesma entidade; use a consolidação para consulta entre entidades.");
    const source = instruments.find((piece) => piece.id === input.sourceInstrumentId)!;
    const sourceYear = input.sourceYear ?? (source.kind === "PPA" ? input.targetYear : source.startYear);
    if (sourceYear < source.startYear || sourceYear > source.endYear) throw new Error("Informe explicitamente um exercício de origem dentro da vigência.");
    if (input.mode === "REALIZED" && (source.kind !== "LOA" || sourceYear !== input.targetYear - 1)) throw new Error("O realizado exige LOA do exercício imediatamente anterior.");
    await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(inArray(planningInstruments.id, [input.sourceInstrumentId, input.targetInstrumentId])).orderBy(asc(planningInstruments.id)).for("update");
    const [existing] = await tx.select().from(catalogImportBatches).where(eq(catalogImportBatches.submissionKey, input.submissionKey)).limit(1);
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.createdById !== context.user.id) throw new Error("Chave de solicitação já utilizada com outros dados.");
      return existing.id;
    }
    const target = await lockCatalogDraftInstrument(tx, context, input.targetInstrumentId);
    const [lockedSource] = await tx.select().from(planningInstruments).where(eq(planningInstruments.id, source.id)).limit(1);
    if (!lockedSource) throw new Error("Origem não encontrada.");
    if (input.expectedSourceRevision !== undefined && lockedSource.revision !== input.expectedSourceRevision || input.expectedTargetRevision !== undefined && target.revision !== input.expectedTargetRevision) throw new Error("A prévia mudou; consulte novamente antes de importar.");
    if (input.targetYear < target.startYear || input.targetYear > target.endYear) throw new Error("Exercício de destino fora da vigência.");
    const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, input.sourceInstrumentId), eq(planningLines.year, sourceYear), planningLineScope(context), selectedCodes.length ? inArray(planningLines.code, selectedCodes) : undefined)).orderBy(asc(planningLines.code), asc(planningLines.id));
    if (!lines.length) throw new Error("Nenhuma previsão autorizada selecionada.");
    if (selectedCodes.length && lines.length !== selectedCodes.length) throw new Error("Um ou mais códigos não foram encontrados no escopo autorizado.");
    const targetPpaId = target.multiYearPlanId ?? target.parent?.multiYearPlanId ?? target.parent?.parent?.multiYearPlanId;
    if (input.mode === "REALIZED" && target.kind !== "LOA") throw new Error("O realizado anterior deve alimentar a elaboração da LOA.");
    const execution = input.mode === "REALIZED" ? await readPlanningFinancialExecution({ user: context.user, database: tx }, lines.filter((line) => line.kind !== "TRANSFER"), new Date(`${sourceYear}-12-31T23:59:59.999Z`)) : null;
    if (execution && (execution.status !== "CONNECTED" || execution.rows.some((row) => row.status !== "CONNECTED"))) throw new Error("Execução anterior restrita, ambígua ou não reconciliada; não será importada como zero.");
    const sourcePrograms = new Map<string, string>(), sourceActions = new Map<string, string>();
    const importedValues: { code: string; kind: string; value: string }[] = [];
    for (const line of lines) {
      const realized = execution?.rows.find((row) => row.lineId === line.id);
      const value = input.mode === "REALIZED" && line.kind !== "TRANSFER" ? new Decimal(line.kind === "REVENUE" ? realized?.collected ?? "0" : input.realizedStage === "PAGA_BRUTA" ? realized?.paidGross ?? "0" : realized?.committed ?? "0") : input.mode === "VALUES" ? input.valuePosition === "UPDATED" ? await linePosition(tx, line.id) : line.originalValue : new Decimal(0);
      if (value.isNegative()) throw new Error("Realizado líquido negativo exige memória específica; não será convertido silenciosamente em previsão.");
      importedValues.push({ code: line.code, kind: line.kind, value: value.toFixed(2) });
      let programId: string | null = null, actionId: string | null = null;
      if (line.kind === "EXPENSE") {
        if (!targetPpaId || !line.programId || !line.actionId) throw new Error("Despesa sem programa/ação canônicos.");
        if (!sourcePrograms.has(line.programId)) {
          const source = await readCatalogProgram(tx, line.programId);
           let [program] = await tx.select().from(planningPrograms).where(and(eq(planningPrograms.multiYearPlanId, targetPpaId), eq(planningPrograms.code, source.code))).limit(1);
           if (program && program.id !== source.id && input.programConflict === "REJECT" && contentHash([program.name, program.type, program.origin, program.guidelines, program.targetAudience, program.financing, program.managerName]) !== contentHash([source.name, source.type, source.origin, source.guidelines, source.targetAudience, source.financing, source.managerName])) throw new Error(`Programa ${source.code} já existe com outra definição; confirme o remapeamento para reutilizar o destino.`);
          if (!program && target.kind !== "PPA") throw new Error("Importe o programa no PPA de destino antes de utilizar a LDO/LOA.");
          if (!program) program = await copyCatalogProgram(tx, targetPpaId, source);
          sourcePrograms.set(source.id, program.id);
        }
        programId = sourcePrograms.get(line.programId)!;
        if (!sourceActions.has(line.actionId)) {
          const [source] = await tx.select().from(planningActions).where(eq(planningActions.id, line.actionId)).limit(1);
          if (!source) throw new Error("Ação de origem não encontrada.");
           let [action] = await tx.select().from(planningActions).where(and(eq(planningActions.programId, programId), eq(planningActions.code, source.code))).limit(1);
           if (action && action.id !== source.id && input.programConflict === "REJECT" && (action.name !== source.name || action.type !== source.type)) throw new Error(`Ação ${source.code} possui definição diferente no destino.`);
          if (!action && target.kind !== "PPA") throw new Error("Importe a ação no PPA de destino antes de utilizar a LDO/LOA.");
          if (!action) [action] = await tx.insert(planningActions).values({ programId, code: source.code, name: source.name, type: source.type }).returning();
          sourceActions.set(source.id, action.id);
        }
        actionId = sourceActions.get(line.actionId)!;
      }
      const classification = { year: input.targetYear, resourceSourceId: line.resourceSourceId, revenueNatureId: line.revenueNatureId, expenseNatureId: line.expenseNatureId ?? input.expenseNatureId };
      if (line.kind === "EXPENSE" && target.kind === "LOA" && !classification.expenseNatureId) throw new Error("Mapeie o elemento das despesas orçadas só por fonte antes de importar para a LOA.");
      const reducedCode = await automaticPlanningReducedCode(tx, target.id, { ...line, year: input.targetYear, programId, actionId });
      const [imported] = await tx.insert(planningLines).values({ instrumentId: target.id, kind: line.kind, code: line.code, description: line.description, year: input.targetYear, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, destinationEntityId: line.destinationEntityId, transferDirection: line.transferDirection, revenueNatureId: line.revenueNatureId, expenseNatureId: classification.expenseNatureId, programId, actionId, functionCode: line.functionCode, subfunctionCode: line.subfunctionCode, product: line.product, productUnit: line.productUnit, physicalTarget: input.mode === "VALUES" ? line.physicalTarget : new Decimal(0), originalValue: value, reducedCode, classificationSnapshot: await planningLineClassification(tx, target, classification) ?? undefined }).returning();
      if (target.annualBudgetLawId) {
        if (imported.kind === "REVENUE") {
          await tx.insert(planningForecasts).values({ annualBudgetLawId: target.annualBudgetLawId, code: imported.code, name: imported.description, estimatedValue: value });
          await tx.update(planningBudgetLaws).set({ totalRevenue: sql`${planningBudgetLaws.totalRevenue} + ${value.toString()}::numeric` }).where(eq(planningBudgetLaws.id, target.annualBudgetLawId));
        } else if (imported.kind === "EXPENSE") {
          await tx.insert(planningFixations).values({ annualBudgetLawId: target.annualBudgetLawId, code: imported.code, name: imported.description, fixedValue: value });
          await tx.update(planningBudgetLaws).set({ totalExpense: sql`${planningBudgetLaws.totalExpense} + ${value.toString()}::numeric` }).where(eq(planningBudgetLaws.id, target.annualBudgetLawId));
        }
      }
    }
    if (input.expectedValuesHash && contentHash(importedValues) !== input.expectedValuesHash) throw new Error("Os valores/realizados mudaram após a prévia; consulte novamente. O lote foi revertido.");
    const [batch] = await tx.insert(catalogImportBatches).values({ sourceInstrumentId: input.sourceInstrumentId, targetInstrumentId: target.id, sourceYear, targetYear: input.targetYear, mode: input.mode, realizedStage: input.mode === "REALIZED" ? input.realizedStage : null, mapping: { valuePosition: input.valuePosition, stage: input.realizedStage, valuesHash: contentHash(importedValues), sourceLineIds: lines.map(line => line.id), sourceRevision: source.revision, sourceYear, targetYear: input.targetYear }, selectedLineIds: lines.map(line => line.id), fingerprint, submissionKey: input.submissionKey, importedCount: lines.length, createdById: context.user.id }).returning();
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_IMPORT", entityType: "PLANNING_IMPORT_BATCH", entityId: batch.id, payload: { sourceInstrumentId: input.sourceInstrumentId, targetInstrumentId: target.id, mode: input.mode, count: lines.length } });
    await tx.update(planningInstruments).set({ revision: sql`${planningInstruments.revision} + 1` }).where(eq(planningInstruments.id, target.id));
    return batch.id;
  });
}

export async function previewPlanningImport(context: PlanningContext, raw: unknown) {
  const input = inputSchema.omit({ submissionKey: true }).parse(raw);
  const db = planningDatabase(context);
  const pieces = await db.select().from(planningInstruments).where(and(inArray(planningInstruments.id, [input.sourceInstrumentId, input.targetInstrumentId]), planningInstrumentScope(context)));
  const source = pieces.find((piece) => piece.id === input.sourceInstrumentId), target = pieces.find((piece) => piece.id === input.targetInstrumentId);
  if (!source || !target || source.id === target.id || source.governmentEntityId !== target.governmentEntityId) throw new Error("Selecione origem/destino distintos da mesma entidade autorizada.");
  const sourceYear = input.sourceYear ?? (source.kind === "PPA" ? input.targetYear : source.startYear);
  if (sourceYear < source.startYear || sourceYear > source.endYear || input.targetYear < target.startYear || input.targetYear > target.endYear) throw new Error("Exercício fora da vigência.");
  const codes = input.lineCodes.split(",").map((code) => code.trim()).filter(Boolean);
  const lines = await db.select().from(planningLines).where(and(eq(planningLines.instrumentId, source.id), eq(planningLines.year, sourceYear), planningLineScope(context), codes.length ? inArray(planningLines.code, codes) : undefined)).orderBy(asc(planningLines.code), asc(planningLines.id));
  const conflicts = await db.select({ code: planningLines.code }).from(planningLines).where(and(eq(planningLines.instrumentId, target.id), inArray(planningLines.code, lines.map(line => line.code))));
  const execution = input.mode === "REALIZED" ? await readPlanningFinancialExecution({ user: context.user, database: db }, lines.filter((line) => line.kind !== "TRANSFER"), new Date(`${sourceYear}-12-31T23:59:59.999Z`)) : null;
  if (input.mode === "REALIZED" && (source.kind !== "LOA" || sourceYear !== input.targetYear - 1 || execution?.status !== "CONNECTED")) throw new Error("Realizado exige LOA anterior e autorização/estrutura financeira.");
  const rows = await Promise.all(lines.map(async (line) => { const fact = execution?.rows.find((row) => row.lineId === line.id); const value = input.mode === "STRUCTURE" ? "0.00" : input.mode === "REALIZED" ? line.kind === "TRANSFER" ? "0.00" : fact?.status !== "CONNECTED" ? null : line.kind === "REVENUE" ? fact.collected : input.realizedStage === "PAGA_BRUTA" ? fact.paidGross : fact.committed : input.valuePosition === "UPDATED" ? (await readCatalogLinePosition(db, line.id)).toFixed(2) : line.originalValue.toFixed(2); return { code: line.code, kind: line.kind, sourceYear, targetYear: input.targetYear, value, problem: conflicts.some((row) => row.code === line.code) ? "Código já existe no destino" : value === null ? "Realizado não apurado" : line.kind === "EXPENSE" && target.kind === "LOA" && !line.expenseNatureId && !input.expenseNatureId ? "Elemento da despesa precisa de mapeamento" : null }; }));
  const sum = (kind: string) => rows.filter((row) => row.kind === kind && row.value !== null).reduce((value, row) => value.plus(row.value!), new Decimal(0)).toFixed(2);
  return { sourceRevision: source.revision, targetRevision: target.revision, valuesHash: contentHash(rows.map((row) => ({ code: row.code, kind: row.kind, value: row.value }))), count: rows.length, revenue: sum("REVENUE"), expense: sum("EXPENSE"), problems: rows.filter((row) => row.problem).length, rows: rows.slice(0, 20) };
}

export async function importPlanningStructure(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ sourceInstrumentId: z.string().min(1), targetInstrumentId: z.string().min(1), kind: z.enum(["PROGRAMS", "SOURCES"]), selectedCodes: z.string().default(""), programCodes: z.string().optional(), sourceCodes: z.string().optional() }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const pieces = await tx.select().from(planningInstruments).where(and(inArray(planningInstruments.id, [input.sourceInstrumentId, input.targetInstrumentId]), planningInstrumentScope(context)));
    const source = pieces.find((piece) => piece.id === input.sourceInstrumentId), target = pieces.find((piece) => piece.id === input.targetInstrumentId);
    if (!source || !target || source.id === target.id || source.governmentEntityId !== target.governmentEntityId) throw new Error("Origem/destino devem ser distintos e da mesma entidade autorizada.");
    for (const id of [source.id, target.id].sort()) await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(eq(planningInstruments.id, id)).for("update");
    await assertWholePiece(tx, context, source.id);
    const editable = await lockCatalogDraftInstrument(tx, context, target.id);
    const selected = (input.selectedCodes || (input.kind === "PROGRAMS" ? input.programCodes : input.sourceCodes) || "").split(",").map((code) => code.trim()).filter(Boolean);
    let count = 0;
    if (input.kind === "SOURCES") {
      const bindings = await tx.select().from(planningInstrumentSources).where(eq(planningInstrumentSources.instrumentId, source.id));
      const sources = await tx.select().from(planningResourceSources).where(and(inArray(planningResourceSources.id, bindings.map(binding => binding.resourceSourceId)), selected.length ? inArray(planningResourceSources.code, selected) : undefined));
      if (selected.length && sources.length !== new Set(selected).size) throw new Error("Vínculo selecionado ausente na origem.");
      for (const row of sources) { await planningLineClassification(tx, editable, { year: editable.startYear, resourceSourceId: row.id }); count++; }
    } else {
      const ppaId = editable.multiYearPlanId ?? editable.parent?.multiYearPlanId ?? editable.parent?.parent?.multiYearPlanId;
      if (!ppaId) throw new Error("PPA de destino não localizado.");
      const programs = (await planningProgramCatalog(tx, source)).filter((program) => !selected.length || selected.includes(program.code));
      if (selected.length && programs.length !== new Set(selected).size) throw new Error("Programa selecionado ausente na origem.");
      for (const row of programs) {
        let [destination] = await tx.select().from(planningPrograms).where(and(eq(planningPrograms.multiYearPlanId, ppaId), eq(planningPrograms.code, row.code))).limit(1);
        if (destination && destination.id !== row.id && contentHash([destination.name, destination.type, destination.origin, destination.guidelines]) !== contentHash([row.name, row.type, row.origin, row.guidelines])) throw new Error(`Programa ${row.code} divergente no destino; mantenha/remapeie explicitamente antes de importar.`);
        if (!destination) destination = await copyCatalogProgram(tx, ppaId, row);
        for (const action of row.actions) { const [existing] = await tx.select().from(planningActions).where(and(eq(planningActions.programId, destination.id), eq(planningActions.code, action.code))).limit(1); if (existing && (existing.name !== action.name || existing.type !== action.type)) throw new Error(`Ação ${action.code} divergente.`); if (!existing) await tx.insert(planningActions).values({ programId: destination.id, code: action.code, name: action.name, type: action.type }); }
        if (target.kind !== "PPA") await tx.insert(planningAnnualPrograms).values({ instrumentId: target.id, programId: destination.id, year: target.startYear }).onConflictDoNothing({ target: [planningAnnualPrograms.instrumentId, planningAnnualPrograms.programId, planningAnnualPrograms.year] });
        count++;
      }
    }
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, entityType: "PLANNING_INSTRUMENT", entityId: target.id, action: "PLANNING_STRUCTURE_IMPORT", payload: { sourceId: source.id, kind: input.kind, count, selectedCodes: selected } });
    return target.id;
  }, { timeoutMs: 60000 });
}
