import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, planningInstrumentWhere, planningLineWhere, type PlanningContext } from "./access";
import { lockPlanningInstrument } from "./service";
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
  return context.prisma.$transaction(async (tx) => {
    const instruments = await tx.planningInstrument.findMany({ where: { id: { in: [input.sourceInstrumentId, input.targetInstrumentId] }, ...planningInstrumentWhere(context) } });
    if (instruments.length !== 2) throw new AccessError("Origem ou destino fora do escopo autorizado.", 403);
    if (instruments[0].governmentEntityId !== instruments[1].governmentEntityId) throw new Error("A importação exige a mesma entidade; use a consolidação para consulta entre entidades.");
    const source = instruments.find((piece) => piece.id === input.sourceInstrumentId)!;
    const sourceYear = input.sourceYear ?? (source.kind === "PPA" ? input.targetYear : source.startYear);
    if (sourceYear < source.startYear || sourceYear > source.endYear) throw new Error("Informe explicitamente um exercício de origem dentro da vigência.");
    if (input.mode === "REALIZED" && (source.kind !== "LOA" || sourceYear !== input.targetYear - 1)) throw new Error("O realizado exige LOA do exercício imediatamente anterior.");
    await tx.$queryRaw`SELECT id FROM "PlanningInstrument" WHERE id IN (${input.sourceInstrumentId}, ${input.targetInstrumentId}) ORDER BY id FOR UPDATE`;
    const existing = await tx.planningImportBatch.findUnique({ where: { submissionKey: input.submissionKey } });
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.createdById !== context.user.id) throw new Error("Chave de solicitação já utilizada com outros dados.");
      return existing.id;
    }
    const target = await lockPlanningInstrument(tx, context, input.targetInstrumentId);
    const lockedSource = await tx.planningInstrument.findUniqueOrThrow({ where: { id: source.id } });
    if (input.expectedSourceRevision !== undefined && lockedSource.revision !== input.expectedSourceRevision || input.expectedTargetRevision !== undefined && target.revision !== input.expectedTargetRevision) throw new Error("A prévia mudou; consulte novamente antes de importar.");
    if (input.targetYear < target.startYear || input.targetYear > target.endYear) throw new Error("Exercício de destino fora da vigência.");
    const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId: input.sourceInstrumentId, year: sourceYear, ...planningLineWhere(context), ...(selectedCodes.length ? { code: { in: selectedCodes } } : {}) }, orderBy: [{ code: "asc" }, { id: "asc" }] });
    if (!lines.length) throw new Error("Nenhuma previsão autorizada selecionada.");
    if (selectedCodes.length && lines.length !== selectedCodes.length) throw new Error("Um ou mais códigos não foram encontrados no escopo autorizado.");
    const targetPpaId = target.multiYearPlanId ?? target.parent?.multiYearPlanId ?? target.parent?.parent?.multiYearPlanId;
    if (input.mode === "REALIZED" && target.kind !== "LOA") throw new Error("O realizado anterior deve alimentar a elaboração da LOA.");
    const execution = input.mode === "REALIZED" ? await readPlanningFinancialExecution({ ...context, prisma: tx } as PlanningContext, lines.filter((line) => line.kind !== "TRANSFER"), new Date(`${sourceYear}-12-31T23:59:59.999Z`)) : null;
    if (execution && (execution.status !== "CONNECTED" || execution.rows.some((row) => row.status !== "CONNECTED"))) throw new Error("Execução anterior restrita, ambígua ou não reconciliada; não será importada como zero.");
    const sourcePrograms = new Map<string, string>(), sourceActions = new Map<string, string>();
    const importedValues: { code: string; kind: string; value: string }[] = [];
    for (const line of lines) {
      const realized = execution?.rows.find((row) => row.lineId === line.id);
      const value = input.mode === "REALIZED" && line.kind !== "TRANSFER" ? new Prisma.Decimal(line.kind === "REVENUE" ? realized?.collected ?? "0" : input.realizedStage === "PAGA_BRUTA" ? realized?.paidGross ?? "0" : realized?.committed ?? "0") : input.mode === "VALUES" ? input.valuePosition === "UPDATED" ? await linePosition(tx, line.id) : line.originalValue : new Prisma.Decimal(0);
      if (value.isNegative()) throw new Error("Realizado líquido negativo exige memória específica; não será convertido silenciosamente em previsão.");
      importedValues.push({ code: line.code, kind: line.kind, value: value.toFixed(2) });
      let programId: string | null = null, actionId: string | null = null;
      if (line.kind === "EXPENSE") {
        if (!targetPpaId || !line.programId || !line.actionId) throw new Error("Despesa sem programa/ação canônicos.");
        if (!sourcePrograms.has(line.programId)) {
          const source = await tx.programPPA.findUniqueOrThrow({ where: { id: line.programId }, include: { objectives: { include: { indicators: true } } } });
           let program = await tx.programPPA.findUnique({ where: { multiYearPlanId_code: { multiYearPlanId: targetPpaId, code: source.code } } });
           if (program && program.id !== source.id && input.programConflict === "REJECT" && contentHash([program.name, program.type, program.origin, program.guidelines, program.targetAudience, program.financing, program.managerName]) !== contentHash([source.name, source.type, source.origin, source.guidelines, source.targetAudience, source.financing, source.managerName])) throw new Error(`Programa ${source.code} já existe com outra definição; confirme o remapeamento para reutilizar o destino.`);
          if (!program && target.kind !== "PPA") throw new Error("Importe o programa no PPA de destino antes de utilizar a LDO/LOA.");
          if (!program) program = await tx.programPPA.create({ data: { multiYearPlanId: targetPpaId, code: source.code, name: source.name, type: source.type, origin: source.origin, guidelines: source.guidelines, targetAudience: source.targetAudience, financing: source.financing, managerName: source.managerName, objectives: { create: source.objectives.map((o) => ({ code: o.code, description: o.description, indicators: { create: o.indicators.map((i) => ({ name: i.name, unit: i.unit, baselineValue: i.baselineValue, targetValue: i.targetValue })) } })) } } });
          sourcePrograms.set(source.id, program.id);
        }
        programId = sourcePrograms.get(line.programId)!;
        if (!sourceActions.has(line.actionId)) {
          const source = await tx.actionPPA.findUniqueOrThrow({ where: { id: line.actionId } });
           let action = await tx.actionPPA.findFirst({ where: { programId, code: source.code } });
           if (action && action.id !== source.id && input.programConflict === "REJECT" && (action.name !== source.name || action.type !== source.type)) throw new Error(`Ação ${source.code} possui definição diferente no destino.`);
          if (!action && target.kind !== "PPA") throw new Error("Importe a ação no PPA de destino antes de utilizar a LDO/LOA.");
          if (!action) action = await tx.actionPPA.create({ data: { programId, code: source.code, name: source.name, type: source.type } });
          sourceActions.set(source.id, action.id);
        }
        actionId = sourceActions.get(line.actionId)!;
      }
      const classification = { year: input.targetYear, resourceSourceId: line.resourceSourceId, revenueNatureId: line.revenueNatureId, expenseNatureId: line.expenseNatureId ?? input.expenseNatureId };
      if (line.kind === "EXPENSE" && target.kind === "LOA" && !classification.expenseNatureId) throw new Error("Mapeie o elemento das despesas orçadas só por fonte antes de importar para a LOA.");
      const reducedCode = await automaticPlanningReducedCode(tx, target.id, { ...line, year: input.targetYear, programId, actionId });
      const imported = await tx.planningBudgetLine.create({ data: { instrumentId: target.id, kind: line.kind, code: line.code, description: line.description, year: input.targetYear, budgetUnitId: line.budgetUnitId, resourceSourceId: line.resourceSourceId, destinationEntityId: line.destinationEntityId, transferDirection: line.transferDirection, revenueNatureId: line.revenueNatureId, expenseNatureId: classification.expenseNatureId, programId, actionId, functionCode: line.functionCode, subfunctionCode: line.subfunctionCode, product: line.product, productUnit: line.productUnit, physicalTarget: input.mode === "VALUES" ? line.physicalTarget : 0, originalValue: value, reducedCode, classificationSnapshot: await planningLineClassification(tx, target, classification) ?? undefined } });
      if (target.annualBudgetLawId) {
        if (imported.kind === "REVENUE") {
          await tx.annualBudgetRevenueForecast.create({ data: { annualBudgetLawId: target.annualBudgetLawId, code: imported.code, name: imported.description, estimatedValue: value } });
          await tx.annualBudgetLaw.update({ where: { id: target.annualBudgetLawId }, data: { totalRevenue: { increment: value } } });
        } else if (imported.kind === "EXPENSE") {
          await tx.annualBudgetExpenseFixation.create({ data: { annualBudgetLawId: target.annualBudgetLawId, code: imported.code, name: imported.description, fixedValue: value } });
          await tx.annualBudgetLaw.update({ where: { id: target.annualBudgetLawId }, data: { totalExpense: { increment: value } } });
        }
      }
    }
    if (input.expectedValuesHash && contentHash(importedValues) !== input.expectedValuesHash) throw new Error("Os valores/realizados mudaram após a prévia; consulte novamente. O lote foi revertido.");
    const batch = await tx.planningImportBatch.create({ data: { sourceInstrumentId: input.sourceInstrumentId, targetInstrumentId: target.id, sourceYear, targetYear: input.targetYear, mode: input.mode, realizedStage: input.mode === "REALIZED" ? input.realizedStage : null, mapping: { valuePosition: input.valuePosition, stage: input.realizedStage, valuesHash: contentHash(importedValues), sourceLineIds: lines.map((line) => line.id), sourceRevision: source.revision, sourceYear, targetYear: input.targetYear }, selectedLineIds: lines.map((line) => line.id), fingerprint, submissionKey: input.submissionKey, importedCount: lines.length, createdById: context.user.id } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_IMPORT", entityType: "PLANNING_IMPORT_BATCH", entityId: batch.id, payload: { sourceInstrumentId: input.sourceInstrumentId, targetInstrumentId: target.id, mode: input.mode, count: lines.length } } });
    await tx.planningInstrument.update({ where: { id: target.id }, data: { revision: { increment: 1 } } });
    return batch.id;
  });
}

export async function previewPlanningImport(context: PlanningContext, raw: unknown) {
  const input = inputSchema.omit({ submissionKey: true }).parse(raw);
  const pieces = await context.prisma.planningInstrument.findMany({ where: { id: { in: [input.sourceInstrumentId, input.targetInstrumentId] }, ...planningInstrumentWhere(context) } });
  const source = pieces.find((piece) => piece.id === input.sourceInstrumentId), target = pieces.find((piece) => piece.id === input.targetInstrumentId);
  if (!source || !target || source.id === target.id || source.governmentEntityId !== target.governmentEntityId) throw new Error("Selecione origem/destino distintos da mesma entidade autorizada.");
  const sourceYear = input.sourceYear ?? (source.kind === "PPA" ? input.targetYear : source.startYear);
  if (sourceYear < source.startYear || sourceYear > source.endYear || input.targetYear < target.startYear || input.targetYear > target.endYear) throw new Error("Exercício fora da vigência.");
  const codes = input.lineCodes.split(",").map((code) => code.trim()).filter(Boolean);
  const lines = await context.prisma.planningBudgetLine.findMany({ where: { instrumentId: source.id, year: sourceYear, ...planningLineWhere(context), ...(codes.length ? { code: { in: codes } } : {}) }, orderBy: [{ code: "asc" }, { id: "asc" }] });
  const conflicts = await context.prisma.planningBudgetLine.findMany({ where: { instrumentId: target.id, code: { in: lines.map((line) => line.code) } }, select: { code: true } });
  const execution = input.mode === "REALIZED" ? await readPlanningFinancialExecution(context, lines.filter((line) => line.kind !== "TRANSFER"), new Date(`${sourceYear}-12-31T23:59:59.999Z`)) : null;
  if (input.mode === "REALIZED" && (source.kind !== "LOA" || sourceYear !== input.targetYear - 1 || execution?.status !== "CONNECTED")) throw new Error("Realizado exige LOA anterior e autorização/estrutura financeira.");
  const rows = await Promise.all(lines.map(async (line) => { const fact = execution?.rows.find((row) => row.lineId === line.id); const value = input.mode === "STRUCTURE" ? "0.00" : input.mode === "REALIZED" ? line.kind === "TRANSFER" ? "0.00" : fact?.status !== "CONNECTED" ? null : line.kind === "REVENUE" ? fact.collected : input.realizedStage === "PAGA_BRUTA" ? fact.paidGross : fact.committed : input.valuePosition === "UPDATED" ? (await linePosition(context.prisma, line.id)).toFixed(2) : line.originalValue.toFixed(2); return { code: line.code, kind: line.kind, sourceYear, targetYear: input.targetYear, value, problem: conflicts.some((row) => row.code === line.code) ? "Código já existe no destino" : value === null ? "Realizado não apurado" : line.kind === "EXPENSE" && target.kind === "LOA" && !line.expenseNatureId && !input.expenseNatureId ? "Elemento da despesa precisa de mapeamento" : null }; }));
  const sum = (kind: string) => rows.filter((row) => row.kind === kind && row.value !== null).reduce((value, row) => value.plus(row.value!), new Prisma.Decimal(0)).toFixed(2);
  return { sourceRevision: source.revision, targetRevision: target.revision, valuesHash: contentHash(rows.map((row) => ({ code: row.code, kind: row.kind, value: row.value }))), count: rows.length, revenue: sum("REVENUE"), expense: sum("EXPENSE"), problems: rows.filter((row) => row.problem).length, rows: rows.slice(0, 20) };
}

export async function importPlanningStructure(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ sourceInstrumentId: z.string().min(1), targetInstrumentId: z.string().min(1), kind: z.enum(["PROGRAMS", "SOURCES"]), selectedCodes: z.string().default(""), programCodes: z.string().optional(), sourceCodes: z.string().optional() }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const pieces = await tx.planningInstrument.findMany({ where: { id: { in: [input.sourceInstrumentId, input.targetInstrumentId] }, ...planningInstrumentWhere(context) } });
    const source = pieces.find((piece) => piece.id === input.sourceInstrumentId), target = pieces.find((piece) => piece.id === input.targetInstrumentId);
    if (!source || !target || source.id === target.id || source.governmentEntityId !== target.governmentEntityId) throw new Error("Origem/destino devem ser distintos e da mesma entidade autorizada.");
    for (const id of [source.id, target.id].sort()) await tx.$queryRaw`SELECT id FROM "PlanningInstrument" WHERE id=${id} FOR UPDATE`;
    await assertWholePiece(tx, context, source.id);
    const editable = await lockPlanningInstrument(tx, context, target.id);
    const selected = (input.selectedCodes || (input.kind === "PROGRAMS" ? input.programCodes : input.sourceCodes) || "").split(",").map((code) => code.trim()).filter(Boolean);
    let count = 0;
    if (input.kind === "SOURCES") {
      const bindings = await tx.planningInstrumentSource.findMany({ where: { instrumentId: source.id } });
      const sources = await tx.resourceSource.findMany({ where: { id: { in: bindings.map((binding) => binding.resourceSourceId) }, ...(selected.length ? { code: { in: selected } } : {}) } });
      if (selected.length && sources.length !== new Set(selected).size) throw new Error("Vínculo selecionado ausente na origem.");
      for (const row of sources) { await planningLineClassification(tx, editable, { year: editable.startYear, resourceSourceId: row.id }); count++; }
    } else {
      const ppaId = editable.multiYearPlanId ?? editable.parent?.multiYearPlanId ?? editable.parent?.parent?.multiYearPlanId;
      if (!ppaId) throw new Error("PPA de destino não localizado.");
      const programs = (await planningProgramCatalog(tx, source)).filter((program) => !selected.length || selected.includes(program.code));
      if (selected.length && programs.length !== new Set(selected).size) throw new Error("Programa selecionado ausente na origem.");
      for (const row of programs) {
        let destination = await tx.programPPA.findUnique({ where: { multiYearPlanId_code: { multiYearPlanId: ppaId, code: row.code } } });
        if (destination && destination.id !== row.id && contentHash([destination.name, destination.type, destination.origin, destination.guidelines]) !== contentHash([row.name, row.type, row.origin, row.guidelines])) throw new Error(`Programa ${row.code} divergente no destino; mantenha/remapeie explicitamente antes de importar.`);
        if (!destination) destination = await tx.programPPA.create({ data: { multiYearPlanId: ppaId, code: row.code, name: row.name, type: row.type, origin: row.origin, guidelines: row.guidelines, targetAudience: row.targetAudience, financing: row.financing, managerName: row.managerName, objectives: { create: row.objectives.map((objective) => ({ code: objective.code, description: objective.description, indicators: { create: objective.indicators.map((indicator) => ({ name: indicator.name, unit: indicator.unit, baselineValue: indicator.baselineValue, targetValue: indicator.targetValue })) } })) } } });
        for (const action of row.actions) { const existing = await tx.actionPPA.findFirst({ where: { programId: destination.id, code: action.code } }); if (existing && (existing.name !== action.name || existing.type !== action.type)) throw new Error(`Ação ${action.code} divergente.`); if (!existing) await tx.actionPPA.create({ data: { programId: destination.id, code: action.code, name: action.name, type: action.type } }); }
        if (target.kind !== "PPA") await tx.planningAnnualProgram.upsert({ where: { instrumentId_programId_year: { instrumentId: target.id, programId: destination.id, year: target.startYear } }, create: { instrumentId: target.id, programId: destination.id, year: target.startYear }, update: {} });
        count++;
      }
    }
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, entityType: "PLANNING_INSTRUMENT", entityId: target.id, action: "PLANNING_STRUCTURE_IMPORT", payload: { sourceId: source.id, kind: input.kind, count, selectedCodes: selected } } });
    return target.id;
  }, { timeout: 60000 });
}
