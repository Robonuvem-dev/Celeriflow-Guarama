import "server-only";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { and, eq, inArray } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningConnection, planningDatabase } from "./database";
import { planningDataset, planningReportLine, planningReportPiece, type PlanningReportLine as ReportLine, type PlanningReportPiece as PieceData } from "@/lib/contracts/planning-pages";
import { pagePreservedReport, pageReportCredit, pageReportCredits, pageReportLines, pageReportPieces, pageReportPrograms, pageSnapshotUnits, pageVisiblePieceCount } from "@/db/repositories/planning-pages/reports";
import { planningFiscalRules, planningPlannedWorks } from "@/db/schema/planning-legal";
import { planningLines } from "@/db/schema/planning-budget";
import { pageReportSnapshots } from "@/db/schema/planning-pages";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { InternalReportDataset, ReportRow, ReportSection } from "@/lib/financeiro/report-delivery";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { assertWholePiece, contentHash, jsonValue, planningAudit } from "./operations-core";
import { planningDateSchema } from "./revisions";
import { planningReportCatalog, type PlanningReportType } from "./report-catalog";
import { readPlanningVersion } from "./versions";
import { lockPlanningInstrument } from "./service";
import { readPlanningFinancialExecution } from "./execution-bridge";
import { readPlanningRclExecution, readPlanningWaiverRealization } from "./fiscal-execution";

export const planningReportFilters = z.object({
  instrumentIds: z.string().min(1), type: z.enum(planningReportCatalog.map((row) => row.type) as [PlanningReportType, ...PlanningReportType[]]),
  asOf: planningDateSchema, from: planningDateSchema.optional(), year: z.coerce.number().int().min(1900).max(2200).optional(), version: z.coerce.number().int().positive().optional(),
  unitId: z.string().optional(), sourceId: z.string().optional(), programId: z.string().optional(), actionId: z.string().optional(),
  functionCode: z.string().optional(), subfunctionCode: z.string().optional(), nature: z.string().optional(), product: z.string().optional(),
  revenueDegree: z.coerce.number().int().min(1).max(10).optional(), groupBy: z.enum(["ENTITY", "CONSOLIDATED", "UNIT", "PROGRAM", "ACTION", "FUNCTION", "SUBFUNCTION", "SOURCE", "NATURE"]).default("ENTITY"),
  transferPresentation: z.enum(["GROSS", "NET"]).default("GROSS"),
  creditId: z.string().optional(), origin: z.enum(["CANCELLATION", "SURPLUS", "EXCESS", "LOAN"]).optional(), targetId: z.string().optional(),
});
export type PlanningReportFilters = z.infer<typeof planningReportFilters>;
type PositionedLine = ReportLine & { entity: string; current: Decimal; target: Decimal; actual: Decimal };

async function reportSource(context: PlanningContext, input: PlanningReportFilters) {
  const ids = [...new Set(input.instrumentIds.split(",").filter(Boolean))];
  if (!ids.length || ids.length > 30) throw new Error("Selecione de uma a trinta peças.");
  const database = planningDatabase(context);
  const pieces = await pageReportPieces(database, context, ids);
  if (pieces.length !== ids.length) throw new AccessError("Uma peça não pertence ao escopo autorizado.", 403);
  if (input.year && pieces.some((piece) => input.year! < piece.startYear || input.year! > piece.endYear)) throw new Error("O exercício selecionado deve pertencer à vigência de todas as peças.");
  if (new Set(pieces.map((piece) => piece.kind)).size !== 1) throw new Error("A consolidação exige peças do mesmo tipo.");
  if (new Set(pieces.map((piece) => piece.governmentEntityId)).size !== pieces.length) throw new Error("Selecione uma peça por entidade para evitar dupla contagem.");
  const all: PositionedLine[] = []; const metadata: PieceData[] = [];
  for (const piece of pieces) {
    let lines: ReportLine[]; let details: PieceData;
    if (input.version) {
      const version = await readPlanningVersion(context, piece.id, input.version);
      const snapshot = z.object({ piece: planningReportPiece, lines: z.array(planningReportLine) }).parse(version.snapshot);
      details = snapshot.piece;
      lines = snapshot.lines;
    } else {
      const programs = await pageReportPrograms(database, piece);
      details = planningReportPiece.parse(jsonValue({ ...piece, programs }));
      const records = await pageReportLines(database, context, piece.id, input);
      lines = z.array(planningReportLine).parse(jsonValue(records));
    }
    metadata.push(details);
    for (const line of lines) {
      if (line.classificationSnapshot) { line.resourceSource = { ...line.resourceSource, code: line.classificationSnapshot.source.code, name: line.classificationSnapshot.source.name }; if (line.revenueNature && line.classificationSnapshot.revenue) line.revenueNature = { ...line.revenueNature, code: line.classificationSnapshot.revenue.code, name: line.classificationSnapshot.revenue.name }; if (line.expenseNature && line.classificationSnapshot.expense) line.expenseNature = { ...line.expenseNature, code: line.classificationSnapshot.expense.code, name: line.classificationSnapshot.expense.name }; }
      if ((!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) || input.year && line.year !== input.year || input.unitId && line.budgetUnitId !== input.unitId || input.sourceId && line.resourceSourceId !== input.sourceId || input.programId && line.programId !== input.programId || input.actionId && line.actionId !== input.actionId || input.functionCode && line.functionCode !== input.functionCode || input.subfunctionCode && line.subfunctionCode !== input.subfunctionCode || input.nature && !(line.revenueNature?.code ?? line.expenseNature?.code ?? "").startsWith(input.nature) || input.product && !(line.product ?? "").toLocaleLowerCase().includes(input.product.toLocaleLowerCase())) continue;
      const physical = [...line.physicalEvents].reverse().find((event) => event.effectiveAt.slice(0, 10) <= input.asOf);
      const current = line.movements.filter((row) => row.effectiveAt.slice(0, 10) <= input.asOf).reduce((sum, row) => sum.plus(row.value), new Decimal(line.originalValue));
      const quotas = line.quotas.map((quota) => {
        const events = quota.events.filter((event) => event.effectiveAt.slice(0, 10) <= input.asOf).sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.createdAt.localeCompare(b.createdAt));
        const sum = (types: string[]) => events.filter((event) => types.includes(event.type)).reduce((value, event) => value.plus(event.value), new Decimal("0"));
        const cash = [...events].reverse().find((event) => event.type === "SET_DISBURSEMENT");
        const startsAt = quota.calculation.generatedAt;
        return { ...quota, planned: startsAt && startsAt.slice(0, 10) > input.asOf ? "0.00" : new Decimal(quota.calculation.initialPlanned).plus(sum(["LEGAL_ADJUSTMENT", "REDISTRIBUTE_OUT", "REDISTRIBUTE_IN", "PERIOD_TRANSFER_OUT", "PERIOD_TRANSFER_IN"])).toFixed(2), consumed: sum(["CONSUME", "REVENUE_SOURCE_IN"]).minus(sum(["REVERSE", "REVENUE_SOURCE_OUT"])).toFixed(2), blocked: sum(["BLOCK"]).minus(sum(["RELEASE"])).toFixed(2), disbursementPlanned: startsAt && startsAt.slice(0, 10) > input.asOf ? "0.00" : cash?.value ?? quota.calculation.initialDisbursement, disbursementPaid: sum(["PAY"]).minus(sum(["REVERSE_PAYMENT"])).toFixed(2), closedAt: events.find((event) => event.type === "CLOSE")?.effectiveAt ?? null };
      });
      all.push({ ...line, quotas, entity: details.governmentEntity.name, current, target: new Decimal(physical?.target ?? line.originalPhysicalTarget ?? line.physicalTarget), actual: new Decimal(physical?.actual ?? line.originalPhysicalActual ?? line.physicalActual) });
    }
  }
  return { lines: all, pieces: metadata };
}

function summarize(lines: PositionedLine[], dimension: (line: PositionedLine) => ReportRow) {
  const groups = new Map<string, { labels: ReportRow; original: Decimal; updated: Decimal }>();
  for (const line of lines) { const labels = dimension(line); const key = JSON.stringify(labels); const row = groups.get(key) ?? { labels, original: new Decimal("0"), updated: new Decimal("0") }; row.original = row.original.plus(line.originalValue); row.updated = row.updated.plus(line.current); groups.set(key, row); }
  return [...groups.values()].map(({ original, updated, labels }) => ({ ...labels, original: original.toFixed(2), atualizado: updated.toFixed(2) }));
}
const fiscalDefinition = z.object({ revenueCodes: z.array(z.string()).min(1), expenseCodes: z.array(z.string()), excludedRevenueCodes: z.array(z.string()).default([]), excludedExpenseCodes: z.array(z.string()).default([]), threshold: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/).optional().refine((value) => value === undefined || new Decimal(value).lessThanOrEqualTo(100), "Parâmetro percentual deve estar entre zero e 100%."), comparison: z.enum(["MINIMUM", "MAXIMUM"]).default("MINIMUM") });

export async function generatePlanningReport(context: PlanningContext, raw: unknown): Promise<InternalReportDataset> {
  assertPlanningOperation(context, "issueReports");
  const input = planningReportFilters.parse(raw);
  if (input.from && input.from > input.asOf) throw new Error("A data inicial deve ser anterior ao corte.");
  const definition = planningReportCatalog.find((row) => row.type === input.type)!;
  const data = await reportSource(context, input);
  const lines = data.lines; const expenses = lines.filter((line) => line.kind === "EXPENSE"); const revenues = lines.filter((line) => line.kind === "REVENUE");
  const sections: ReportSection[] = [];
  const add = (title: string, rows: ReportRow[]) => sections.push({ title, rows });
  const group = (line: PositionedLine): ReportRow => ({ entidade: input.groupBy === "CONSOLIDATED" ? "Consolidado das entidades selecionadas" : line.entity, ...(input.groupBy === "UNIT" ? { órgão: line.budgetUnit.secretariat.name, unidade: line.budgetUnit.name } : input.groupBy === "PROGRAM" ? { programa: line.program?.name ?? "" } : input.groupBy === "ACTION" ? { ação: line.action?.name ?? "" } : input.groupBy === "FUNCTION" ? { função: line.functionCode ?? "" } : input.groupBy === "SUBFUNCTION" ? { subfunção: line.subfunctionCode ?? "" } : input.groupBy === "SOURCE" ? { fonte: line.resourceSource.name } : input.groupBy === "NATURE" ? { natureza: line.expenseNature?.code ?? line.revenueNature?.code ?? "" } : {}) });
  switch (definition.family) {
    case "REVENUE": case "REVENUE_YEAR": case "REVENUE_GLOBAL": {
      const degree = input.revenueDegree;
       add(definition.title, summarize(revenues, (line) => { const leaf = line.revenueNature?.code ?? ""; let code = leaf; if (degree && line.classificationSnapshot) { const node = line.classificationSnapshot.tree.find((entry) => entry.kind === "REVENUE" && entry.degree === degree); if (!node) throw new Error(`A árvore preservada não contém grau ${degree} para ${leaf}.`); code = node.code; } else if (degree) code = leaf.replace(/\D/g, "").slice(0, degree); return { ...group(line), ...(definition.family !== "REVENUE_GLOBAL" ? { exercício: line.year } : {}), natureza: code, fonte: line.resourceSource.name }; })); break;
    }
    case "EXPENSE": case "FINANCIAL": case "ANALYTIC": case "WORK_PROGRAM":
      add(definition.title, summarize(definition.family === "ANALYTIC" ? lines : expenses, (line) => ({ ...group(line), exercício: line.year, unidade: line.budgetUnit.name, programa: line.program?.code ?? "", ação: line.action?.code ?? "", natureza: line.expenseNature?.code ?? line.revenueNature?.code ?? "", fonte: line.resourceSource.name }))); break;
    case "TRANSFER": {
      const transfers = lines.filter((line) => line.kind === "TRANSFER");
      if (transfers.some((line) => !line.destinationEntityId || !line.transferDirection)) throw new Error("Reconcilie as contrapartes das transferências legadas antes de consolidar.");
      const entities = new Set(data.pieces.map((piece) => piece.governmentEntityId));
      const origin = (line: PositionedLine) => data.pieces.find((piece) => piece.id === line.instrumentId)!.governmentEntityId;
      const eliminated = new Map<string, Decimal>();
      for (const outgoing of transfers.filter((line) => line.transferDirection === "OUT" && entities.has(line.destinationEntityId ?? ""))) {
        let remaining = outgoing.current;
        for (const incoming of transfers.filter((line) => line.transferDirection === "IN" && origin(line) === outgoing.destinationEntityId && line.destinationEntityId === origin(outgoing) && line.year === outgoing.year && line.resourceSourceId === outgoing.resourceSourceId)) {
          const matched = Decimal.min(remaining, incoming.current.minus(eliminated.get(incoming.id) ?? 0));
          eliminated.set(incoming.id, (eliminated.get(incoming.id) ?? new Decimal("0")).plus(matched));
          eliminated.set(outgoing.id, (eliminated.get(outgoing.id) ?? new Decimal("0")).plus(matched));
          remaining = remaining.minus(matched);
        }
      }
      add(definition.title, transfers.map((line) => ({ ...group(line), exercício: line.year, fonte: line.resourceSource.name, contraparte: line.destinationEntity?.name ?? "", direção: line.transferDirection === "IN" ? "Recebida" : "Concedida", bruto: line.current.toFixed(2), eliminação: (eliminated.get(line.id) ?? new Decimal("0")).toFixed(2), apresentado: (input.transferPresentation === "NET" ? line.current.minus(eliminated.get(line.id) ?? 0) : line.current).toFixed(2) })));
      break;
    }
    case "SYNTHETIC": add(definition.title, summarize(lines, (line) => ({ ...group(line), exercício: line.year, tipo: line.kind, programa: line.program?.name ?? "" }))); break;
    case "PHYSICAL": case "EVALUATION":
      { const physical = new Map<string, { labels: ReportRow; target: Decimal; actual: Decimal }>();
        for (const line of expenses) { const labels = { entidade: input.groupBy === "CONSOLIDATED" ? "Consolidado das entidades selecionadas" : line.entity, exercício: line.year, programa: line.program?.name ?? "", ação: line.action?.name ?? "", produto: line.product ?? "", unidade: line.productUnit ?? "" }; const key = JSON.stringify(labels); const row = physical.get(key) ?? { labels, target: new Decimal("0"), actual: new Decimal("0") }; row.target = row.target.plus(line.target); row.actual = row.actual.plus(line.actual); physical.set(key, row); }
        add("Metas físicas previstas e realizadas", [...physical.values()].map((row) => ({ ...row.labels, prevista: row.target.toFixed(4), realizada: row.actual.toFixed(4), alcancePercentual: row.target.isZero() ? "Sem base" : row.actual.div(row.target).mul(100).toFixed(2) })));
      }
      add("Programação financeira", summarize(expenses, (line) => ({ entidade: input.groupBy === "CONSOLIDATED" ? "Consolidado das entidades selecionadas" : line.entity, exercício: line.year, programa: line.program?.name ?? "", ação: line.action?.name ?? "" })));
      if (definition.family === "EVALUATION") {
        const execution = await readPlanningFinancialExecution(context, expenses, new Date(`${input.asOf}T23:59:59.999Z`));
        if (execution.status !== "CONNECTED") add("Execução financeira", [{ situação: execution.status === "RESTRICTED" ? "Consulta de execução exige autorização financeira." : "A estrutura financeira não está implantada nesta instância." }]);
        else add("Execução financeira canônica", execution.rows.map((row) => { const line = expenses.find((line) => line.id === row.lineId)!; return { entidade: line.entity, exercício: line.year, programa: line.program?.name ?? "", ação: line.action?.name ?? "", dotação: line.code, empenhadoLíquido: row.committed ?? "Não apurado", desembolsoLíquidoTesouraria: row.paidNet ?? "Não apurado", origem: row.status === "CONNECTED" ? "Financeiro · dotação LOA implantada" : row.status === "AMBIGUOUS" ? "Mapeamento ambíguo — reconciliação necessária" : row.status === "UNRECONCILED" ? "Valores financeiros não reconciliados" : "Sem vínculo LOA anual — execução não apurada" }; }));
      } break;
    case "PROGRAM": case "PROGRAM_DETAIL": {
      const programs = data.pieces.flatMap((piece) => (piece.programs ?? [...new Map(expenses.filter((line) => line.instrumentId === piece.id && line.program).map((line) => [line.programId, line.program!])).values()]).filter((program) => (!input.programId || program.id === input.programId) && (!input.actionId || expenses.some((line) => line.programId === program.id && line.actionId === input.actionId))).map((program) => ({ entity: piece.governmentEntity.name, program })));
      add("Programas", programs.map(({ entity, program }) => ({ entidade: entity, código: program.code ?? "", programa: program.name, origem: program.origin ?? "", gerente: program.managerName ?? "" })));
      if (definition.family === "PROGRAM_DETAIL") { add("Diretrizes e público", programs.map(({ entity, program }) => ({ entidade: entity, programa: program.name, diretrizes: program.guidelines ?? "", público: program.targetAudience ?? "", financiamento: program.financing ?? "" }))); add("Objetivos e indicadores", programs.flatMap(({ entity, program }) => program.objectives.flatMap((objective) => objective.indicators.map((indicator) => ({ entidade: entity, programa: program.name, objetivo: objective.description, indicador: indicator.name, unidade: indicator.unit, referência: indicator.baselineValue, meta: indicator.targetValue }))))); } break;
    }
    case "BALANCE": {
      const groups = new Map<string, { entity: string; source: string; revenue: Decimal; expense: Decimal }>();
      for (const line of lines.filter((row) => row.kind !== "TRANSFER")) { const entity = input.groupBy === "CONSOLIDATED" ? "Consolidado das entidades selecionadas" : line.entity; const key = `${entity}:${line.resourceSourceId}`; const row = groups.get(key) ?? { entity, source: line.resourceSource.name, revenue: new Decimal("0"), expense: new Decimal("0") }; if (line.kind === "REVENUE") row.revenue = row.revenue.plus(line.current); else row.expense = row.expense.plus(line.current); groups.set(key, row); }
      add(definition.title, [...groups.values()].map((row) => ({ entidade: row.entity, fonte: row.source, receita: row.revenue.toFixed(2), despesa: row.expense.toFixed(2), diferença: row.revenue.minus(row.expense).toFixed(2) }))); break;
    }
    case "ECONOMIC": case "NATURE": case "FUNCTION_PROGRAM": case "PROGRAM_SOURCE": case "UNIT_FUNCTION":
      add(definition.title, summarize(definition.family === "ECONOMIC" ? lines.filter((row) => row.kind !== "TRANSFER") : expenses, (line) => { const nature = (line.expenseNature?.code ?? "").replace(/\D/g, ""); return { ...group(line), exercício: line.year, ...(definition.family === "ECONOMIC" ? { tipo: line.kind, categoria: (line.revenueNature?.code ?? line.expenseNature?.code ?? "").replace(/\D/g, "").slice(0, 1) } : definition.family === "NATURE" ? { órgão: line.budgetUnit.secretariat.name, unidade: line.budgetUnit.name, categoriaEconômica: nature.slice(0, 1), grupoNatureza: nature.slice(1, 2), modalidadeAplicação: nature.slice(2, 4), elemento: nature.slice(4, 6), natureza: line.expenseNature?.code ?? "Não detalhada" } : definition.family === "PROGRAM_SOURCE" ? { programa: line.program?.name ?? "", fonte: line.resourceSource.name } : definition.family === "UNIT_FUNCTION" ? { órgão: line.budgetUnit.secretariat.name, unidade: line.budgetUnit.name, função: line.functionCode ?? "" } : { função: line.functionCode ?? "", subfunção: line.subfunctionCode ?? "", programa: line.program?.name ?? "", categoriaAção: line.action?.type ?? "Não informada" }) }; })); break;
    case "CMD": case "REVENUE_TARGETS": case "QUOTA":
      add(definition.title, (definition.family === "REVENUE_TARGETS" ? revenues : expenses).flatMap((line) => line.quotas.map((quota) => ({ entidade: line.entity, exercício: line.year, dotação: line.code, fonte: line.resourceSource.name, mês: quota.month, período: `${Math.ceil(quota.month / quota.periodMonths)} (${quota.periodMonths} meses)`, previsto: definition.family === "CMD" ? quota.disbursementPlanned : quota.planned, realizado: definition.family === "CMD" ? quota.disbursementPaid : quota.consumed, contingenciado: quota.blocked, disponível: new Decimal(quota.planned).minus(quota.consumed).minus(quota.blocked).toFixed(2), situação: quota.closedAt ? "Fechado" : "Aberto" }))));
      if (definition.family === "CMD") add("Estágio de execução", [{ informação: "Cronograma mede despesa paga bruta, separada do empenhamento. LOA com execução interna conectada recebe eventos transacionais do Financeiro; a avaliação financeira apresenta tesouraria líquida em coluna distinta." }]); break;
    case "CHANGES": {
      const credits = await pageReportCredits(planningDatabase(context), data.pieces.map(piece => piece.id), input);
      const keys = new Set(credits.flatMap((batch) => batch.items.map((item) => `credit:${batch.id}:${item.id}`)));
      add(definition.title, lines.flatMap((line) => line.movements.filter((row) => row.effectiveAt.slice(0, 10) <= input.asOf && (!input.from || row.effectiveAt.slice(0, 10) >= input.from) && (!(input.creditId || input.origin) || keys.has(row.idempotencyKey))).map((row) => ({ ...group(line), dotação: line.code, data: row.effectiveAt.slice(0, 10), ato: row.legalActNumber, alteração: row.value, motivo: row.reason })))); break;
    }
    case "MEMORY": add(definition.title, data.pieces.flatMap((piece) => piece.memories.filter((row) => !input.year || !row.year || row.year === input.year).map((row) => ({ entidade: piece.governmentEntity.name, exercício: row.year ?? "Base não anualizada", título: row.title, referência: row.normativeReference, base: row.baseValue, taxa: row.rate, resultado: row.resultValue, metodologia: row.methodology, premissas: row.assumptions, memória: row.calculation ? JSON.stringify(row.calculation) : "Base/taxa informadas" })))); break;
    case "WAIVER": {
      const rows: ReportRow[] = [];
      for (const piece of data.pieces) for (const waiver of piece.waivers.filter((row) => !input.year || row.year === input.year)) {
        const actual = input.version ? { status: waiver.realizedValue === undefined || waiver.realizedValue === null ? "UNMAPPED" : "PRESERVED", value: waiver.realizedValue ?? null } : await readPlanningWaiverRealization(context, piece.governmentEntityId, waiver.taxId, waiver.year, input.asOf);
        rows.push({ entidade: piece.governmentEntity.name, exercício: waiver.year, renúncia: waiver.description, fundamento: waiver.legalReference, estimativa: waiver.estimatedValue, realizada: actual.value ?? "Não apurada", situaçãoRealizado: actual.status, compensação: waiver.compensation, valorCompensação: waiver.compensationValue, metodologia: waiver.methodology });
      }
      add(definition.title, rows); break;
    }
    case "WORKS": add(definition.title, data.pieces.flatMap((piece) => piece.plannedWorks.filter((row) => !input.year || row.year === input.year).map((row) => ({ entidade: piece.governmentEntity.name, exercício: row.year, obra: row.title, tipo: row.type === "WORK" ? "Obra" : "Conservação", local: row.location, início: row.startsAt?.slice(0, 10) ?? "Não informado no legado", valorPrevistoAnoLdo: row.value, conservação: row.conservationValue ?? "Não informada", novosProjetos: row.newProjectsValue ?? "Não informados", fundamento: row.legalReference })))); break;
    case "RCL_EXECUTED": {
      for (const piece of data.pieces) {
        const rule = piece.fiscalRules.find((row) => row.type === "RCL"); if (!rule) throw new Error("Configure a composição/exclusões da RCL antes de emitir a execução.");
        const config = fiscalDefinition.parse(rule.definition);
        const references = revenues.filter((line) => line.instrumentId === piece.id && config.revenueCodes.includes(line.code) && !config.excludedRevenueCodes.includes(line.code));
        const result = await readPlanningRclExecution(context, piece.governmentEntityId, references, input.asOf);
        add(`RCL executada — ${piece.governmentEntity.name}`, result.rows);
        add("Composição e período", [{ entidade: piece.governmentEntity.name, referência: rule.normativeReference, situação: result.status, totalDozeCompetências: result.total ?? "Não apurado", corte: input.asOf, exclusões: config.excludedRevenueCodes.join(", ") }]);
      }
      break;
    }
    case "FISCAL":
      for (const piece of data.pieces) {
        const rule = piece.fiscalRules.find((row) => row.type === input.type);
        if (!rule) throw new Error(`Configure a composição legal de ${input.type} para ${piece.governmentEntity.name}.`);
        const config = fiscalDefinition.parse(rule.definition); const scoped = lines.filter((line) => line.instrumentId === piece.id);
        const includedRevenue = scoped.filter((line) => line.kind === "REVENUE" && config.revenueCodes.includes(line.code) && !config.excludedRevenueCodes.includes(line.code));
        const includedExpense = scoped.filter((line) => line.kind === "EXPENSE" && config.expenseCodes.includes(line.code) && !config.excludedExpenseCodes.includes(line.code));
        const base = includedRevenue.reduce((sum, line) => sum.plus(line.current), new Decimal("0")); const application = includedExpense.reduce((sum, line) => sum.plus(line.current), new Decimal("0"));
        const percentage = base.isZero() ? null : application.div(base).mul(100);
        add(`Composição ${piece.governmentEntity.name}`, [{ referência: rule.normativeReference, baseOrçada: base.toFixed(2), aplicaçãoOrçada: application.toFixed(2), percentual: percentage?.toFixed(2) ?? "Sem base", parâmetro: config.threshold ?? "Não definido", verificação: !config.threshold || !percentage ? "Sem parâmetro/base" : (config.comparison === "MINIMUM" ? percentage.greaterThanOrEqualTo(config.threshold) : percentage.lessThanOrEqualTo(config.threshold)) ? "Dentro do parâmetro" : "Fora do parâmetro" }]);
        add("Memória de inclusão e exclusão", scoped.filter((line) => config.revenueCodes.includes(line.code) || config.expenseCodes.includes(line.code)).map((line) => ({ entidade: line.entity, código: line.code, descrição: line.description, valorOrçado: line.current.toFixed(2), composição: config.excludedRevenueCodes.includes(line.code) || config.excludedExpenseCodes.includes(line.code) ? "Excluído" : "Incluído" })));
      } break;
    case "DECREE": case "BILL": {
      if (!input.creditId) throw new Error("Selecione um lote para gerar a minuta a partir dos itens reais.");
      const batch = await pageReportCredit(planningDatabase(context), data.pieces.map(piece => piece.id), input.creditId);
      add("Minuta — sujeita à aprovação e publicação", [{ número: batch.creditRequest.number, modalidade: batch.creditRequest.type, origem: batch.origin, fundamentoOrigem: batch.originEvidence, justificativa: batch.creditRequest.justification, texto: `Art. 1º Fica autorizada a alteração das dotações discriminadas neste documento, nos valores e fontes indicados. Art. 2º Os recursos decorrem da origem documentada no lote. Art. 3º A vigência será estabelecida no ato aprovado.` }]);
      add("Dotações do lote", batch.items.filter((item) => lines.some((line) => line.id === item.lineId)).map((item) => ({ código: item.line.code, fonte: item.line.resourceSourceId, tipo: item.value.isPositive() ? "Acréscimo" : "Anulação", valor: item.value.abs().toFixed(2) }))); break;
    }
    case "COMPATIBILITY": case "COMPATIBILITY_TARGET": {
      if (!input.targetId) throw new Error("Selecione a peça de comparação.");
      const target = await reportSource(context, { ...input, instrumentIds: input.targetId });
      const dimensions = (line: PositionedLine) => JSON.stringify([line.year, line.kind, line.budgetUnitId, line.resourceSourceId, line.programId, line.actionId, line.expenseNature?.code, line.revenueNature?.code, line.product, line.productUnit]);
      const keys = new Set([...lines, ...target.lines].map(dimensions));
      add(definition.title, [...keys].map((key) => { const sourceRows = lines.filter((line) => dimensions(line) === key); const targetRows = target.lines.filter((line) => dimensions(line) === key); const ref = sourceRows[0] ?? targetRows[0]; const value = (rows: PositionedLine[]) => rows.reduce((sum, line) => sum.plus(definition.family === "COMPATIBILITY" ? line.current : line.target), new Decimal("0")); return { entidade: ref.entity, exercício: ref.year, dotação: ref.code, fonte: ref.resourceSource.name, origem: value(sourceRows).toFixed(4), destino: value(targetRows).toFixed(4), diferença: value(sourceRows).minus(value(targetRows)).toFixed(4) }; })); break;
    }
  }
  const dataset: InternalReportDataset = { title: definition.title, year: input.year ?? Math.min(...lines.map((line) => line.year), new Date(input.asOf).getUTCFullYear()), warnings: ["Documento de Planejamento sujeito à conferência e homologação do leiaute oficial. Valores orçados não representam execução financeira."], metadata: { status: "INTERNAL_REVIEW", scope: data.pieces.map((piece) => `${piece.governmentEntity.name} · ${piece.code} · versão ${input.version ?? piece.revision}`).join("; "), referencePeriod: `Corte ${input.asOf}`, statutoryCompleteness: "NOT_STATUTORY", publicSnapshotEligible: false, publicSnapshotCondition: "Documento gerado; publicação e validação oficial serão conectadas em F9." }, sections };
  for (const piece of data.pieces) {
    const layout = piece.fiscalRules.find((rule) => rule.type === `LAYOUT:${input.type}`);
    if (!layout) continue;
    const config = z.object({ title: z.string(), versionId: z.string(), fileHash: z.string(), footnotes: z.string() }).parse(layout.definition);
    if (data.pieces.length === 1) dataset.title = config.title;
    add("Modelo e referência normativa preservados", [{ entidade: piece.governmentEntity.name, referência: layout.normativeReference, versãoGed: config.versionId, hashModelo: config.fileHash, notas: config.footnotes, situação: "Modelo referenciado; conferência do leiaute e aceite individual permanecem necessários" }]);
  }
  return Object.assign(dataset, { planningIdentity: { name: data.pieces.length === 1 ? data.pieces[0].governmentEntity.name : "Consolidado orçamentário das entidades selecionadas", legalName: null, cnpj: data.pieces.length === 1 ? data.pieces[0].governmentEntity.cnpj ?? null : null, address: null, city: null, state: null }, planningEmission: { issuedAt: new Date().toISOString(), issuedBy: context.user.name } });
}

export async function persistPlanningReport(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "issueReports");
  const filters = planningReportFilters.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const scoped = { ...context, database: tx };
    const dataset = await generatePlanningReport(scoped, filters);
    const units = await pageSnapshotUnits(tx, context, [...filters.instrumentIds.split(","), ...(filters.targetId ? [filters.targetId] : [])]);
    const [snapshot] = await tx.insert(pageReportSnapshots).values({ instrumentId: filters.instrumentIds.split(",")[0], reportType: filters.type, filters: jsonValue({ ...filters, snapshotUnitIds: units.map((unit) => unit.budgetUnitId) }), dataset: jsonValue(dataset), hash: contentHash(dataset), createdById: context.user.id }).returning();
    return snapshot;
  }, { isolationLevel: "repeatable read", timeoutMs: 30000 });
}

export async function readPreservedPlanningReport(context: PlanningContext, id: string) {
  assertPlanningOperation(context, "issueReports");
  const database = planningDatabase(context);
  const snapshot = await pagePreservedReport(database, context, id);
  if (!snapshot) throw new AccessError("Documento não encontrado neste escopo.", 404);
  const filters = planningReportFilters.extend({ snapshotUnitIds: z.array(z.string()) }).parse(snapshot.filters);
  const ids = [...new Set([...filters.instrumentIds.split(","), ...(filters.targetId ? [filters.targetId] : [])])];
  if (await pageVisiblePieceCount(database, context, ids) !== ids.length || !isSystemAdministrator(context.user) && filters.snapshotUnitIds.some((unitId) => !context.user.allowedBudgetUnitIds.includes(unitId))) throw new AccessError("O documento contém dados fora das unidades autorizadas.", 403);
  if (contentHash(snapshot.dataset) !== snapshot.hash) throw new Error("Conteúdo do documento não corresponde ao hash preservado.");
  return { ...snapshot, dataset: planningDataset.parse(snapshot.dataset) };
}

export async function configurePlanningFiscalReport(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), type: z.enum(["MDE", "HEALTH", "PERSONNEL", "RCL"]), normativeReference: z.string().trim().min(1), definition: z.string().min(1).optional(), revenueCodes: z.string().optional(), expenseCodes: z.string().optional(), excludedRevenueCodes: z.string().optional(), excludedExpenseCodes: z.string().optional(), threshold: z.string().optional(), comparison: z.enum(["MINIMUM", "MAXIMUM"]).optional() }).parse(raw);
  const codesOf = (value?: string) => [...new Set((value ?? "").split(/[,;\s]+/).filter(Boolean))];
  const definition = fiscalDefinition.parse(input.definition ? JSON.parse(input.definition) : { revenueCodes: codesOf(input.revenueCodes), expenseCodes: codesOf(input.expenseCodes), excludedRevenueCodes: codesOf(input.excludedRevenueCodes), excludedExpenseCodes: codesOf(input.excludedExpenseCodes), threshold: input.threshold, comparison: input.comparison });
  if (definition.excludedRevenueCodes.some((code) => !definition.revenueCodes.includes(code)) || definition.excludedExpenseCodes.some((code) => !definition.expenseCodes.includes(code))) throw new Error("Exclusões devem pertencer à composição correspondente de receitas/despesas.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    await assertWholePiece(tx, context, piece.id);
    const codes = [...new Set([...definition.revenueCodes, ...definition.expenseCodes, ...definition.excludedRevenueCodes, ...definition.excludedExpenseCodes])];
    const rows = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), inArray(planningLines.code, codes)));
    if (rows.length !== codes.length || definition.revenueCodes.some((code) => rows.find((row) => row.code === code)?.kind !== "REVENUE") || definition.expenseCodes.some((code) => rows.find((row) => row.code === code)?.kind !== "EXPENSE")) throw new Error("A composição deve utilizar códigos existentes e do tipo correto nesta peça.");
    const [rule] = await tx.insert(planningFiscalRules).values({ instrumentId: piece.id, type: input.type, normativeReference: input.normativeReference, definition: jsonValue(definition), updatedById: context.user.id }).onConflictDoUpdate({ target: [planningFiscalRules.instrumentId, planningFiscalRules.type], set: { normativeReference: input.normativeReference, definition: jsonValue(definition), updatedById: context.user.id } }).returning();
    await planningAudit(tx, context, piece.id, "PLANNING_FISCAL_RULE", input);
    return rule.id;
  });
}

export async function addPlanningWork(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), title: z.string().trim().min(1), type: z.enum(["WORK", "CONSERVATION"]), location: z.string().trim().min(1), legalReference: z.string().trim().min(1), year: z.coerce.number().int(), value: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/), startsAt: planningDateSchema.optional(), conservationValue: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/).optional(), newProjectsValue: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/).optional() }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId); await assertWholePiece(tx, context, piece.id);
    if (input.year < piece.startYear || input.year > piece.endYear || input.startsAt && Number(input.startsAt.slice(0, 4)) > input.year) throw new Error("Exercício/início fora da vigência.");
    const [work] = await tx.insert(planningPlannedWorks).values({ ...input, value: new Decimal(input.value), startsAt: input.startsAt ? new Date(input.startsAt) : null, conservationValue: new Decimal(input.conservationValue ?? (input.type === "CONSERVATION" ? input.value : "0")), newProjectsValue: new Decimal(input.newProjectsValue ?? "0"), createdById: context.user.id }).returning();
    await planningAudit(tx, context, piece.id, "PLANNING_WORK_CREATE", { workId: work.id }); return work.id;
  });
}
