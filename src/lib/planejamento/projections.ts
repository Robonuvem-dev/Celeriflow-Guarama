import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningInstruments, planningLines } from "@/db/schema/planning-budget";
import { planningMemories, planningRevenueNatures } from "@/db/schema/planning-legal";
import { planningInstrumentScope, planningLineScope } from "@/db/repositories/planning/scope";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { planningConnection } from "./database";
import { lockPlanningInstrument } from "./service";
import { readPlanningFinancialExecution } from "./execution-bridge";
import { contentHash, jsonValue, planningAudit } from "./operations-core";
import { moneySchema, projectedValue } from "./policy";

export async function projectPlanningAnnualMemory(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = z.object({ instrumentId: z.string().min(1), sourceInstrumentId: z.string().optional(), kind: z.enum(["REVENUE", "EXPENSE"]), baseValue: moneySchema.optional(), normativeReference: z.string().trim().min(3), methodology: z.string().trim().min(3), rates: z.string().min(1) }).parse(raw);
  const rates = input.rates.split(/[;\s]+/).filter(Boolean);
  if (rates.some((rate) => !/^-?\d{1,5}(\.\d{1,6})?$/.test(rate))) throw new Error("Informe taxas anuais numéricas separadas por ponto e vírgula.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (rates.length !== piece.endYear - piece.startYear + 1) throw new Error("Informe uma taxa para cada exercício da peça.");
    let base = input.baseValue === undefined ? null : new Decimal(input.baseValue); let origin = "BASE_INFORMADA"; let sourceHash: string | null = null;
    if (input.sourceInstrumentId) {
      const [source] = await tx.select().from(planningInstruments).where(and(eq(planningInstruments.id, input.sourceInstrumentId), eq(planningInstruments.governmentEntityId, piece.governmentEntityId), eq(planningInstruments.kind, "LOA"), planningInstrumentScope(context))).limit(1);
      if (!source) throw new Error("Histórico financeiro não encontrado neste escopo.");
      if (`${source.endYear}-12-31` > new Date().toISOString().slice(0, 10)) throw new Error("Histórico anual ainda não completo; informe base de implantação com premissas explícitas ou selecione exercício finalizado.");
      const lines = (await tx.select({ line: planningLines, revenueNature: { id: planningRevenueNatures.id } }).from(planningLines).leftJoin(planningRevenueNatures, eq(planningRevenueNatures.id, planningLines.revenueNatureId)).where(and(eq(planningLines.instrumentId, source.id), eq(planningLines.kind, input.kind), planningLineScope(context)))).map(row => ({ ...row.line, revenueNature: row.revenueNature }));
      const execution = await readPlanningFinancialExecution({ ...context, database: tx }, lines, new Date(`${source.endYear}-12-31T23:59:59.999Z`));
      if (execution.status !== "CONNECTED" || execution.rows.some((row) => row.status !== "CONNECTED")) throw new Error("Histórico financeiro não reconciliado para projeção.");
      base = execution.rows.reduce((sum, row) => sum.plus(input.kind === "REVENUE" ? row.collected! : row.committed!), new Decimal("0")); origin = `LOA:${source.id}:${source.startYear}`; sourceHash = contentHash(execution.rows);
    }
    if (base === null) throw new Error("Informe base de implantação ou selecione histórico financeiro.");
    const originalBase = base.toFixed(2);
    for (let index = 0; index < rates.length; index++) {
      const result = projectedValue(base.toFixed(2), rates[index]); if (result.isNegative()) throw new Error("A projeção não pode gerar valor negativo.");
      await tx.insert(planningMemories).values({ instrumentId: piece.id, title: `${input.kind === "REVENUE" ? "Receita" : "Despesa"} projetada ${piece.startYear + index}`, year: piece.startYear + index, normativeReference: input.normativeReference, methodology: input.methodology, assumptions: `Base ${origin}; taxa anual ${rates[index]}%; arredondamento HALF_UP em centavos.`, baseValue: base, rate: new Decimal(rates[index]), resultValue: result, calculation: jsonValue({ originalBase, origin, sourceHash, year: piece.startYear + index, formula: "PREVIOUS_YEAR*(1+RATE/100)", rate: rates[index], rounding: "HALF_UP_CENTS" }), createdById: context.user.id });
      base = result;
    }
    await planningAudit(tx, context, piece.id, "PLANNING_ANNUAL_PROJECTION", { kind: input.kind, origin, sourceHash, originalBase, rates });
    return piece.id;
  }, { timeoutMs: 60000 });
}
