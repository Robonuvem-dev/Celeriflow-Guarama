import { and, asc, eq, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";

export function selectRemunerationAverage(values: { month: string; amount: Decimal }[], percent: Decimal, rounding: "FLOOR" | "CEIL") {
  if (!values.length || !percent.isFinite() || percent.lte(0) || percent.gt(100) || values.some(value => !value.amount.isFinite() || value.amount.lt(0))) throw new Error("Histórico/percentual inválido para média.");
  const rawCount = new Decimal(values.length).mul(percent).div(100);
  const count = (rounding === "FLOOR" ? rawCount.floor() : rawCount.ceil()).toNumber();
  if (!count) throw new Error("Política selecionou zero competências para a média.");
  const selected = [...values].sort((a, b) => b.amount.cmp(a.amount) || a.month.localeCompare(b.month)).slice(0, count);
  const total = selected.reduce((value, row) => value.add(row.amount), new Decimal(0));
  return { selected, excluded: values.filter(value => !selected.includes(value)), total, average: total.div(count).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) };
}

const policySchema = z.object({
  origin: z.literal("MEDIA_REMUNERACOES"), rubricCodes: z.array(z.string().min(1)).min(1),
  highestPercent: z.string().regex(/^\d+(?:\.\d+)?$/), selectionRounding: z.enum(["FLOOR", "CEIL"]),
  missingMonths: z.enum(["ZERO", "BLOQUEAR"]), method: z.enum(["NOMINAL", "ATUALIZADA"]),
  indexationFactors: z.record(z.string(), z.string().regex(/^\d+(?:\.\d+)?$/)).optional(),
  legalReference: z.string().trim().min(3),
}).strict();

export async function calculateRemunerationAverage(db: DatabaseExecutor, raw: unknown, payrollScope?: SQL) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), from: z.string(), until: z.string() }).strict().parse(raw);
  const first = payrollPeriod(input.from).start; const last = payrollPeriod(input.until).start;
  if (last < first) throw new Error("Janela da média inválida.");
  const rule = await requirePayrollRule(db, input.ruleId);
  if (!rule.isActive || rule.ruleSet.status !== "ATIVA") throw new Error("Regra de média ativa obrigatória.");
  const policy = policySchema.parse(rule.value);
  const statementRows = await db.select({ statement: hrPayrollStatements, competence: payrolls.competence }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(eq(hrPayrollStatements.contractId, input.contractId), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"), eq(hrPayrollRuns.scope, rule.ruleSet.scope), eq(payrolls.type, "Mensal"), payrollScope)).orderBy(asc(hrPayrollStatements.id));
  const statements = statementRows.map(row => ({ ...row.statement, run: { payroll: { competence: row.competence } } }));
  const monthly = new Map<string, { amount: Decimal; sources: { statementId: string; rubricCode: string; value: string }[] }>();
  for (const statement of statements) {
    const month = statement.run.payroll.competence; const date = payrollPeriod(month).start;
    if (date < first || date > last) continue;
    const items = z.object({ items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot).items;
    const aggregate = monthly.get(month) || { amount: new Decimal(0), sources: [] };
    for (const item of items.filter(item => policy.rubricCodes.includes(item.code))) {
      if (item.type !== "PROVENTO") throw new Error("A política de média deve selecionar apenas rubricas de remuneração.");
      aggregate.amount = aggregate.amount.add(item.value); aggregate.sources.push({ statementId: statement.id, rubricCode: item.code, value: item.value });
    }
    monthly.set(month, aggregate);
  }
  const memory: { month: string; nominal: string; factor: string; amount: Decimal; sources: { statementId: string; rubricCode: string; value: string }[] }[] = [];
  for (let date = new Date(first); date <= last; date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))) {
    const month = `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
    const aggregate = monthly.get(month);
    if (!aggregate && policy.missingMonths === "BLOQUEAR") throw new Error(`Competência ${month} sem histórico autorizado na janela da média.`);
    const factor = policy.method === "NOMINAL" ? "1" : policy.indexationFactors?.[month];
    if (!factor || new Decimal(factor).lte(0)) throw new Error(`Fator de atualização explícito obrigatório para ${month}.`);
    const nominal = aggregate?.amount || new Decimal(0);
    memory.push({ month, nominal: nominal.toFixed(2), factor, amount: nominal.mul(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), sources: aggregate?.sources || [] });
  }
  const result = selectRemunerationAverage(memory, new Decimal(policy.highestPercent), policy.selectionRounding);
  return { policy, ruleId: rule.id, scope: rule.ruleSet.scope, contractId: input.contractId, from: input.from, until: input.until, average: result.average.toFixed(2), total: result.total.toFixed(2), selected: result.selected.map(value => value.month), excluded: result.excluded.map(value => value.month), memory: memory.map(row => ({ ...row, amount: row.amount.toFixed(2) })) };
}
