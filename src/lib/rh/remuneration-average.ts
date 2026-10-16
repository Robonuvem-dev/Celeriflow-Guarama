import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";

export function selectRemunerationAverage(values: { month: string; amount: Prisma.Decimal }[], percent: Prisma.Decimal, rounding: "FLOOR" | "CEIL") {
  if (!values.length || !percent.isFinite() || percent.lte(0) || percent.gt(100) || values.some(value => !value.amount.isFinite() || value.amount.lt(0))) throw new Error("Histórico/percentual inválido para média.");
  const rawCount = new Prisma.Decimal(values.length).mul(percent).div(100);
  const count = (rounding === "FLOOR" ? rawCount.floor() : rawCount.ceil()).toNumber();
  if (!count) throw new Error("Política selecionou zero competências para a média.");
  const selected = [...values].sort((a, b) => b.amount.cmp(a.amount) || a.month.localeCompare(b.month)).slice(0, count);
  const total = selected.reduce((value, row) => value.add(row.amount), new Prisma.Decimal(0));
  return { selected, excluded: values.filter(value => !selected.includes(value)), total, average: total.div(count).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
}

const policySchema = z.object({
  origin: z.literal("MEDIA_REMUNERACOES"), rubricCodes: z.array(z.string().min(1)).min(1),
  highestPercent: z.string().regex(/^\d+(?:\.\d+)?$/), selectionRounding: z.enum(["FLOOR", "CEIL"]),
  missingMonths: z.enum(["ZERO", "BLOQUEAR"]), method: z.enum(["NOMINAL", "ATUALIZADA"]),
  indexationFactors: z.record(z.string(), z.string().regex(/^\d+(?:\.\d+)?$/)).optional(),
  legalReference: z.string().trim().min(3),
}).strict();

export async function calculateRemunerationAverage(db: PrismaClient, raw: unknown, payrollScope: Prisma.PayrollWhereInput = {}) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), from: z.string(), until: z.string() }).strict().parse(raw);
  const first = payrollPeriod(input.from).start; const last = payrollPeriod(input.until).start;
  if (last < first) throw new Error("Janela da média inválida.");
  const rule = await db.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
  if (!rule.isActive || rule.ruleSet.status !== "ATIVA") throw new Error("Regra de média ativa obrigatória.");
  const policy = policySchema.parse(rule.value);
  const statements = await db.hrPayrollStatement.findMany({ where: { contractId: input.contractId, run: { mode: "OFICIAL", status: "FECHADA", scope: rule.ruleSet.scope, payroll: { AND: [payrollScope, { type: "Mensal" }] } } }, include: { run: { select: { payroll: { select: { competence: true } } } } }, orderBy: { id: "asc" } });
  const monthly = new Map<string, { amount: Prisma.Decimal; sources: { statementId: string; rubricCode: string; value: string }[] }>();
  for (const statement of statements) {
    const month = statement.run.payroll.competence; const date = payrollPeriod(month).start;
    if (date < first || date > last) continue;
    const items = z.object({ items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot).items;
    const aggregate = monthly.get(month) || { amount: new Prisma.Decimal(0), sources: [] };
    for (const item of items.filter(item => policy.rubricCodes.includes(item.code))) {
      if (item.type !== "PROVENTO") throw new Error("A política de média deve selecionar apenas rubricas de remuneração.");
      aggregate.amount = aggregate.amount.add(item.value); aggregate.sources.push({ statementId: statement.id, rubricCode: item.code, value: item.value });
    }
    monthly.set(month, aggregate);
  }
  const memory: { month: string; nominal: string; factor: string; amount: Prisma.Decimal; sources: { statementId: string; rubricCode: string; value: string }[] }[] = [];
  for (let date = new Date(first); date <= last; date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))) {
    const month = `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
    const aggregate = monthly.get(month);
    if (!aggregate && policy.missingMonths === "BLOQUEAR") throw new Error(`Competência ${month} sem histórico autorizado na janela da média.`);
    const factor = policy.method === "NOMINAL" ? "1" : policy.indexationFactors?.[month];
    if (!factor || new Prisma.Decimal(factor).lte(0)) throw new Error(`Fator de atualização explícito obrigatório para ${month}.`);
    const nominal = aggregate?.amount || new Prisma.Decimal(0);
    memory.push({ month, nominal: nominal.toFixed(2), factor, amount: nominal.mul(factor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), sources: aggregate?.sources || [] });
  }
  const result = selectRemunerationAverage(memory, new Prisma.Decimal(policy.highestPercent), policy.selectionRounding);
  return { policy, ruleId: rule.id, scope: rule.ruleSet.scope, contractId: input.contractId, from: input.from, until: input.until, average: result.average.toFixed(2), total: result.total.toFixed(2), selected: result.selected.map(value => value.month), excluded: result.excluded.map(value => value.month), memory: memory.map(row => ({ ...row, amount: row.amount.toFixed(2) })) };
}
