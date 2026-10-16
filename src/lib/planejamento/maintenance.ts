import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, planningInstrumentWhere, planningLineWhere, type PlanningContext } from "./access";
import { assertWholePiece, canonicalPiece, finalizeLegalRevision, jsonValue, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";
import { lockPlanningInstrument } from "./service";
import { actionInput, lineInput, moneySchema, planningLineData, programInput, projectedValue } from "./policy";
import { automaticPlanningReducedCode, planningLineClassification } from "./classification";
import { planningDateSchema } from "./revisions";

const inputSchema = z.object({ instrumentId: z.string().min(1), recordId: z.string().optional(), entity: z.enum(["INSTRUMENT", "PROGRAM", "ACTION", "OBJECTIVE", "INDICATOR", "LINE", "MEMORY", "WAIVER", "PRIORITY", "RISK", "WORK", "ANNUAL_PROGRAM"]), mode: z.enum(["SAVE", "DELETE"]).default("SAVE"), expectedRevision: z.coerce.number().int().positive().optional(), effectiveAt: planningDateSchema.optional(), legalActNumber: z.string().optional(), legalText: z.string().optional(), reason: z.string().trim().min(1).default("Manutenção da elaboração") }).passthrough();
const text = z.string().trim().min(1).max(4000);

export async function maintainPlanningRecord(context: PlanningContext, raw: unknown) {
  const input = inputSchema.parse(raw);
  assertPlanningOperation(context, input.mode === "DELETE" ? "delete" : "update");
  return context.prisma.$transaction(async (tx) => {
    const visible = await tx.planningInstrument.findFirstOrThrow({ where: { id: input.instrumentId, ...planningInstrumentWhere(context) }, include: { parent: { include: { parent: true } } } });
    const rootId = visible.kind === "PPA" ? visible.id : visible.kind === "LDO" ? visible.parentId! : visible.parent!.parentId!;
    const structural = ["PROGRAM", "ACTION", "OBJECTIVE", "INDICATOR"].includes(input.entity);
    const related = structural ? await tx.planningInstrument.findMany({ where: { ...planningInstrumentWhere(context), OR: [{ id: rootId }, { parentId: rootId }, { parent: { is: { parentId: rootId } } }] }, select: { id: true } }) : [{ id: visible.id }];
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
    if (structural && closed.length) await tx.$executeRaw`SELECT set_config('planning.formal_revision_ppa', ${ppaId}, true)`;
    let id = input.recordId ?? piece.id;
    if (input.mode === "DELETE" && input.entity !== "LINE") {
      if (!input.recordId || input.entity === "INSTRUMENT") throw new Error("Selecione um registro de elaboração para excluir.");
      if (input.entity === "PROGRAM") { await tx.programPPA.findFirstOrThrow({ where: { id, multiYearPlanId: ppaId } }); if (await tx.planningBudgetLine.count({ where: { programId: id } }) || await tx.budgetAppropriation.count({ where: { programPPAId: id } }) || await tx.actionPPA.count({ where: { programId: id } }) || await tx.objectivePPA.count({ where: { programId: id } })) throw new Error("Programa possui dependências; não pode ser excluído."); await tx.programPPA.delete({ where: { id } }); }
      else if (input.entity === "ACTION") { await tx.actionPPA.findFirstOrThrow({ where: { id, program: { multiYearPlanId: ppaId } } }); if (await tx.planningBudgetLine.count({ where: { actionId: id } }) || await tx.budgetAppropriation.count({ where: { actionPPAId: id } }) || await tx.goalPPA.count({ where: { actionId: id } })) throw new Error("Ação possui metas/orçamento."); await tx.actionPPA.delete({ where: { id } }); }
      else if (input.entity === "OBJECTIVE") { await tx.objectivePPA.findFirstOrThrow({ where: { id, program: { multiYearPlanId: ppaId } } }); if (await tx.indicatorPPA.count({ where: { objectiveId: id } })) throw new Error("Objetivo possui indicadores."); await tx.objectivePPA.delete({ where: { id } }); }
      else if (input.entity === "INDICATOR") { await tx.indicatorPPA.findFirstOrThrow({ where: { id, objective: { program: { multiYearPlanId: ppaId } } } }); await tx.indicatorPPA.delete({ where: { id } }); }
      else if (input.entity === "WORK") { await tx.planningPlannedWork.findFirstOrThrow({ where: { id, instrumentId: piece.id } }); await tx.planningPlannedWork.delete({ where: { id } }); }
      else if (input.entity === "MEMORY") { await tx.planningCalculationMemory.findFirstOrThrow({ where: { id, instrumentId: piece.id } }); await tx.planningCalculationMemory.delete({ where: { id } }); }
      else if (input.entity === "WAIVER") { await tx.planningRevenueWaiver.findFirstOrThrow({ where: { id, instrumentId: piece.id } }); await tx.planningRevenueWaiver.delete({ where: { id } }); }
      else if (input.entity === "PRIORITY") { await tx.budgetGuidelinePriority.findFirstOrThrow({ where: { id, budgetGuidelineId: piece.budgetGuidelineId ?? "" } }); await tx.budgetGuidelinePriority.delete({ where: { id } }); }
      else if (input.entity === "RISK") { await tx.budgetGuidelineRisk.findFirstOrThrow({ where: { id, budgetGuidelineId: piece.budgetGuidelineId ?? "" } }); await tx.budgetGuidelineRisk.delete({ where: { id } }); }
      else { await tx.planningAnnualProgram.findFirstOrThrow({ where: { id, instrumentId: piece.id } }); await tx.planningAnnualProgram.delete({ where: { id } }); }
    } else if (input.entity === "INSTRUMENT") {
      const data = z.object({ title: text.max(200), projectNumber: z.string().max(100).optional(), legalText: z.string().max(20000).optional(), revenueDegree: z.coerce.number().int().min(1).max(10), expenseDegree: z.coerce.number().int().min(1).max(10), expenseLevel: z.enum(["ELEMENT_SOURCE", "SOURCE"]), catalogVersionId: z.string().optional() }).parse(input);
      if (piece.kind === "LOA" && data.expenseLevel !== "ELEMENT_SOURCE") throw new Error("A LOA exige elemento de despesa para disponibilizar dotações à execução.");
      if (data.catalogVersionId !== (piece.catalogVersionId ?? undefined) && await tx.planningBudgetLine.count({ where: { instrumentId: piece.id } })) throw new Error("Defina a versão do catálogo antes de cadastrar previsões; não reclassifique originais silenciosamente.");
      if (data.catalogVersionId) { const version = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: data.catalogVersionId } }); if (version.status !== "PUBLISHED" || version.year < piece.startYear || version.year > piece.endYear) throw new Error("Catálogo não publicado ou fora da vigência."); }
      await tx.planningInstrument.update({ where: { id: piece.id }, data });
    } else if (input.entity === "PROGRAM") {
      const data = programInput.omit({ instrumentId: true, objectiveCode: true, objective: true, indicatorName: true, indicatorUnit: true, baselineValue: true, targetValue: true }).parse(input);
      const record = input.recordId ? await tx.programPPA.findFirstOrThrow({ where: { id: input.recordId, multiYearPlanId: ppaId } }) : null;
      if (record && closed.length && record.code !== data.code) throw new Error("Código de programa da peça fechada é preservado; inclua nova classificação por revisão formal.");
      if (input.mode === "DELETE") { if (!record || await tx.planningBudgetLine.count({ where: { programId: record.id } }) || await tx.budgetAppropriation.count({ where: { programPPAId: record.id } }) || await tx.actionPPA.count({ where: { programId: record.id } }) || await tx.objectivePPA.count({ where: { programId: record.id } })) throw new Error("Programa possui ações, objetivos ou orçamento; remova as dependências não utilizadas primeiro."); await tx.programPPA.delete({ where: { id: record.id } }); }
      else { id = record ? (await tx.programPPA.update({ where: { id: record.id }, data })).id : (await tx.programPPA.create({ data: { ...data, multiYearPlanId: ppaId } })).id; }
    } else if (input.entity === "ACTION") {
      const data = actionInput.omit({ instrumentId: true }).parse(input);
      await tx.programPPA.findFirstOrThrow({ where: { id: data.programId, multiYearPlanId: ppaId } });
      const record = input.recordId ? await tx.actionPPA.findFirstOrThrow({ where: { id: input.recordId, program: { multiYearPlanId: ppaId } } }) : null;
      if (record && closed.length && (record.code !== data.code || record.programId !== data.programId)) throw new Error("Código e programa da ação fechada são preservados.");
      if (input.mode === "DELETE") { if (!record || await tx.planningBudgetLine.count({ where: { actionId: record.id } }) || await tx.goalPPA.count({ where: { actionId: record.id } }) || await tx.budgetAppropriation.count({ where: { actionPPAId: record.id } })) throw new Error("Ação possui metas ou orçamento vinculados."); await tx.actionPPA.delete({ where: { id: record.id } }); }
      else { id = record ? (await tx.actionPPA.update({ where: { id: record.id }, data })).id : (await tx.actionPPA.create({ data })).id; }
    } else if (input.entity === "OBJECTIVE") {
      const data = z.object({ programId: z.string().min(1), code: text.max(60), description: text }).parse(input);
      await tx.programPPA.findFirstOrThrow({ where: { id: data.programId, multiYearPlanId: ppaId } });
      const record = input.recordId ? await tx.objectivePPA.findFirstOrThrow({ where: { id: input.recordId, program: { multiYearPlanId: ppaId } } }) : null;
      if (input.mode === "DELETE") { if (!record || await tx.indicatorPPA.count({ where: { objectiveId: record.id } })) throw new Error("Objetivo possui indicadores."); await tx.objectivePPA.delete({ where: { id: record.id } }); }
      else id = record ? (await tx.objectivePPA.update({ where: { id: record.id }, data })).id : (await tx.objectivePPA.create({ data })).id;
    } else if (input.entity === "INDICATOR") {
      const data = z.object({ objectiveId: z.string().min(1), name: text.max(200), unit: text.max(100), baselineValue: z.coerce.number().finite().nonnegative(), targetValue: z.coerce.number().finite().nonnegative() }).parse(input);
      await tx.objectivePPA.findFirstOrThrow({ where: { id: data.objectiveId, program: { multiYearPlanId: ppaId } } });
      const record = input.recordId ? await tx.indicatorPPA.findFirstOrThrow({ where: { id: input.recordId, objective: { program: { multiYearPlanId: ppaId } } } }) : null;
      if (input.mode === "DELETE") { if (!record) throw new Error("Indicador não localizado."); await tx.indicatorPPA.delete({ where: { id: record.id } }); }
      else id = record ? (await tx.indicatorPPA.update({ where: { id: record.id }, data })).id : (await tx.indicatorPPA.create({ data })).id;
    } else if (input.entity === "LINE") {
      if (!input.recordId) throw new Error("Selecione a previsão a manter.");
      await lockPlanningInstrument(tx, context, piece.id);
      const record = await tx.planningBudgetLine.findFirstOrThrow({ where: { id: input.recordId, instrumentId: piece.id, ...planningLineWhere(context) } });
      if (await tx.planningLineMovement.count({ where: { lineId: record.id } }) || record.appropriationId) throw new Error("Previsão possui histórico/execução e não pode ser sobrescrita.");
      if (input.mode === "DELETE") {
        if (await tx.planningQuota.count({ where: { lineId: record.id } })) throw new Error("Previsão possui programação vinculada.");
        await tx.planningBudgetLine.delete({ where: { id: record.id } });
      } else {
        const data = lineInput.parse({ ...input, kind: record.kind, expenseBudgetLevel: piece.kind === "LOA" ? "ELEMENT_SOURCE" : piece.expenseLevel });
        if (data.year < piece.startYear || data.year > piece.endYear || data.budgetUnitId !== record.budgetUnitId) throw new Error("Mantenha a unidade autorizada e a vigência da previsão.");
        if (data.kind === "EXPENSE") await tx.actionPPA.findFirstOrThrow({ where: { id: data.actionId, programId: data.programId, program: { multiYearPlanId: ppaId } } });
        const values = planningLineData(data);
        await tx.planningBudgetLine.update({ where: { id: record.id }, data: { ...values, reducedCode: await automaticPlanningReducedCode(tx, piece.id, data), classificationSnapshot: await planningLineClassification(tx, piece, data) ?? Prisma.DbNull } });
      }
      if (piece.annualBudgetLawId) {
        if (record.kind === "REVENUE") { await tx.annualBudgetRevenueForecast.deleteMany({ where: { annualBudgetLawId: piece.annualBudgetLawId, code: record.code } }); if (input.mode === "SAVE") { const current = await tx.planningBudgetLine.findUniqueOrThrow({ where: { id: record.id } }); await tx.annualBudgetRevenueForecast.create({ data: { annualBudgetLawId: piece.annualBudgetLawId, code: current.code, name: current.description, estimatedValue: current.originalValue } }); } }
        else { await tx.annualBudgetExpenseFixation.deleteMany({ where: { annualBudgetLawId: piece.annualBudgetLawId, code: record.code } }); if (input.mode === "SAVE") { const current = await tx.planningBudgetLine.findUniqueOrThrow({ where: { id: record.id } }); await tx.annualBudgetExpenseFixation.create({ data: { annualBudgetLawId: piece.annualBudgetLawId, code: current.code, name: current.description, fixedValue: current.originalValue } }); } }
        const totals = await tx.planningBudgetLine.groupBy({ by: ["kind"], where: { instrumentId: piece.id }, _sum: { originalValue: true } });
        await tx.annualBudgetLaw.update({ where: { id: piece.annualBudgetLawId }, data: { totalRevenue: totals.find((row) => row.kind === "REVENUE")?._sum.originalValue ?? 0, totalExpense: totals.find((row) => row.kind === "EXPENSE")?._sum.originalValue ?? 0 } });
      }
    } else if (input.entity === "PRIORITY" || input.entity === "RISK") {
      if (!piece.budgetGuidelineId) throw new Error("Prioridades e riscos exigem LDO.");
      if (input.entity === "PRIORITY") {
        const data = z.object({ description: text, targetValue: moneySchema.optional() }).parse(input);
        const record = input.recordId ? await tx.budgetGuidelinePriority.findFirstOrThrow({ where: { id: input.recordId, budgetGuidelineId: piece.budgetGuidelineId } }) : null;
        if (input.mode === "DELETE" && record) await tx.budgetGuidelinePriority.delete({ where: { id: record.id } }); else id = record ? (await tx.budgetGuidelinePriority.update({ where: { id: record.id }, data })).id : (await tx.budgetGuidelinePriority.create({ data: { ...data, budgetGuidelineId: piece.budgetGuidelineId } })).id;
      } else {
        const data = z.object({ description: text, estimatedImpact: moneySchema, mitigation: text }).parse(input);
        const record = input.recordId ? await tx.budgetGuidelineRisk.findFirstOrThrow({ where: { id: input.recordId, budgetGuidelineId: piece.budgetGuidelineId } }) : null;
        if (input.mode === "DELETE" && record) await tx.budgetGuidelineRisk.delete({ where: { id: record.id } }); else id = record ? (await tx.budgetGuidelineRisk.update({ where: { id: record.id }, data })).id : (await tx.budgetGuidelineRisk.create({ data: { ...data, budgetGuidelineId: piece.budgetGuidelineId } })).id;
      }
    } else if (input.entity === "ANNUAL_PROGRAM") {
      const data = z.object({ programId: z.string().min(1), year: z.coerce.number().int(), priority: z.string().optional() }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Programa anual fora da vigência.");
      await tx.programPPA.findFirstOrThrow({ where: { id: data.programId, multiYearPlanId: ppaId } });
      const record = await tx.planningAnnualProgram.upsert({ where: { instrumentId_programId_year: { instrumentId: piece.id, programId: data.programId, year: data.year } }, create: { instrumentId: piece.id, ...data }, update: { priority: data.priority } });
      id = record.id;
      if (input.mode === "DELETE") await tx.planningAnnualProgram.delete({ where: { id: record.id } });
    } else if (input.entity === "WORK") {
      const data = z.object({ title: text.max(200), type: z.enum(["WORK", "CONSERVATION"]), location: text, legalReference: text, year: z.coerce.number().int(), value: moneySchema, startsAt: planningDateSchema, conservationValue: moneySchema, newProjectsValue: moneySchema }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear || Number(data.startsAt.slice(0, 4)) > data.year) throw new Error("Revise exercício e início da obra.");
      const record = input.recordId ? await tx.planningPlannedWork.findFirstOrThrow({ where: { id: input.recordId, instrumentId: piece.id } }) : null;
      if (input.mode === "DELETE" && record) await tx.planningPlannedWork.delete({ where: { id: record.id } }); else id = record ? (await tx.planningPlannedWork.update({ where: { id: record.id }, data: { ...data, startsAt: new Date(data.startsAt) } })).id : (await tx.planningPlannedWork.create({ data: { ...data, startsAt: new Date(data.startsAt), instrumentId: piece.id, createdById: context.user.id } })).id;
    } else if (input.entity === "MEMORY") {
      const data = z.object({ title: text, normativeReference: text, methodology: text, assumptions: text, year: z.coerce.number().int(), baseValue: moneySchema, rate: z.string().regex(/^-?\d{1,5}(\.\d{1,6})?$/) }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Memória fora da vigência.");
      const resultValue = projectedValue(data.baseValue, data.rate);
      if (resultValue.isNegative()) throw new Error("Projeção negativa.");
      const record = input.recordId ? await tx.planningCalculationMemory.findFirstOrThrow({ where: { id: input.recordId, instrumentId: piece.id } }) : null;
      const values = { ...data, resultValue, calculation: jsonValue({ formula: "BASE*(1+RATE/100)", rounding: "HALF_UP_CENTS", base: data.baseValue, rate: data.rate, year: data.year }) };
      if (input.mode === "DELETE" && record) await tx.planningCalculationMemory.delete({ where: { id: record.id } }); else id = record ? (await tx.planningCalculationMemory.update({ where: { id: record.id }, data: values })).id : (await tx.planningCalculationMemory.create({ data: { ...values, instrumentId: piece.id, createdById: context.user.id } })).id;
    } else if (input.entity === "WAIVER") {
      const data = z.object({ year: z.coerce.number().int(), description: text, legalReference: text, modality: text, estimatedValue: moneySchema, compensation: text, compensationValue: moneySchema, methodology: text, taxId: z.string().optional() }).parse(input);
      if (data.year < piece.startYear || data.year > piece.endYear) throw new Error("Renúncia fora da vigência.");
      if (data.taxId) await tx.tax.findFirstOrThrow({ where: { id: data.taxId, isActive: true } });
      const record = input.recordId ? await tx.planningRevenueWaiver.findFirstOrThrow({ where: { id: input.recordId, instrumentId: piece.id } }) : null;
      if (input.mode === "DELETE" && record) await tx.planningRevenueWaiver.delete({ where: { id: record.id } }); else id = record ? (await tx.planningRevenueWaiver.update({ where: { id: record.id }, data })).id : (await tx.planningRevenueWaiver.create({ data: { ...data, instrumentId: piece.id, createdById: context.user.id } })).id;
    }
    for (const item of pieces) {
      if (closed.length) await finalizeLegalRevision(tx, context, item, new Date(input.effectiveAt!), input.legalActNumber!, input.reason);
      else await tx.planningInstrument.update({ where: { id: item.id }, data: { revision: { increment: 1 } } });
    }
    await planningAudit(tx, context, piece.id, "PLANNING_MAINTENANCE", { entity: input.entity, mode: input.mode, recordId: id, reason: input.reason, legalActNumber: input.legalActNumber ?? null });
    return id;
  }, { timeout: 60000 });
}
