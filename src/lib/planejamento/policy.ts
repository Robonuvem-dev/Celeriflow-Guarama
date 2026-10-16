import { Prisma } from "@prisma/client";
import { z } from "zod";

export const jurisdictionSchema = z.enum(["EXECUTIVE", "LEGISLATIVE"]);
export type PlanningJurisdiction = z.infer<typeof jurisdictionSchema>;
export const instrumentKindSchema = z.enum(["PPA", "LDO", "LOA"]);
const text = z.string().trim().min(1).max(4000);
const id = z.string().trim().min(1).max(100);
export const moneySchema = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, "Informe um valor monetário válido.");
export const instrumentInput = z.object({
  governmentEntityId: id, kind: instrumentKindSchema, code: text.max(60), title: text.max(200),
  startYear: z.coerce.number().int().min(1900).max(2197), endYear: z.coerce.number().int().min(1900).max(2200),
  revenueDegree: z.coerce.number().int().min(1).max(10), expenseLevel: z.enum(["ELEMENT_SOURCE", "SOURCE"]),
  expenseDegree: z.coerce.number().int().min(1).max(10).default(6), catalogVersionId: id.optional(),
  projectNumber: z.string().trim().max(100).optional(), legalText: z.string().trim().max(20000).optional(),
  parentId: id.optional(),
}).superRefine((input, ctx) => {
  if (input.endYear !== input.startYear + (input.kind === "PPA" ? 3 : 0)) {
    ctx.addIssue({ code: "custom", path: ["endYear"], message: "PPA exige quatro anos; LDO e LOA exigem um exercício." });
  }
  if ((input.kind === "PPA") === Boolean(input.parentId)) {
    ctx.addIssue({ code: "custom", path: ["parentId"], message: "Selecione a peça anterior da cadeia PPA → LDO → LOA." });
  }
});

export const lineInput = z.object({
  instrumentId: id, kind: z.enum(["REVENUE", "EXPENSE"]), code: text.max(60), description: text,
  year: z.coerce.number().int(), budgetUnitId: id, resourceSourceId: id,
  revenueNatureId: id.optional(), expenseNatureId: id.optional(), programId: id.optional(), actionId: id.optional(),
  functionCode: z.string().regex(/^\d{2}$/).optional(), subfunctionCode: z.string().regex(/^\d{3}$/).optional(),
  product: text.optional(), productUnit: text.optional(),
  physicalTarget: z.string().regex(/^\d{1,14}(\.\d{1,4})?$/).default("0"), originalValue: moneySchema,
  expenseBudgetLevel: z.enum(["ELEMENT_SOURCE", "SOURCE"]).default("ELEMENT_SOURCE"),
}).superRefine((input, ctx) => {
  if (input.kind === "REVENUE" && (!input.revenueNatureId || input.expenseNatureId)) {
    ctx.addIssue({ code: "custom", path: ["revenueNatureId"], message: "Selecione a natureza de receita." });
  }
  if (input.kind === "EXPENSE" && (input.expenseBudgetLevel === "ELEMENT_SOURCE" && !input.expenseNatureId || input.revenueNatureId || !input.programId || !input.actionId || !input.functionCode || !input.subfunctionCode || !input.product || !input.productUnit)) {
    ctx.addIssue({ code: "custom", path: ["expenseNatureId"], message: "Complete natureza, programa, ação, função, subfunção, produto e unidade." });
  }
});

export const programInput = z.object({
  instrumentId: id, code: text.max(60), name: text.max(200), type: z.enum(["Finalístico", "Gestão", "Serviço ao Estado"]),
  origin: text, objectiveCode: text.max(60), objective: text, guidelines: text, targetAudience: text,
  financing: text, managerName: text.max(200), indicatorName: text.max(200), indicatorUnit: text.max(100),
  baselineValue: z.coerce.number().finite().nonnegative(), targetValue: z.coerce.number().finite().nonnegative(),
});

export function planningLineData(input: z.infer<typeof lineInput>) {
  return { instrumentId: input.instrumentId, kind: input.kind, code: input.code, description: input.description, year: input.year, budgetUnitId: input.budgetUnitId, resourceSourceId: input.resourceSourceId, revenueNatureId: input.revenueNatureId, expenseNatureId: input.expenseNatureId, programId: input.programId, actionId: input.actionId, functionCode: input.functionCode, subfunctionCode: input.subfunctionCode, product: input.product, productUnit: input.productUnit, physicalTarget: input.physicalTarget, originalValue: input.originalValue };
}
export const actionInput = z.object({
  instrumentId: id, programId: id, code: text.max(60), name: text.max(200),
  type: z.enum(["Projeto", "Atividade", "Operação Especial"]),
});
export const memoryInput = z.object({
  instrumentId: id, title: text.max(200), normativeReference: text, methodology: text, assumptions: text,
  baseValue: moneySchema, rate: z.string().regex(/^-?\d{1,5}(\.\d{1,6})?$/),
});
export const waiverInput = z.object({
  instrumentId: id, year: z.coerce.number().int(), description: text, legalReference: text,
  modality: text.max(100), estimatedValue: moneySchema, compensation: text, compensationValue: moneySchema, methodology: text,
});

export function planningBasePath(jurisdiction: PlanningJurisdiction) {
  return jurisdiction === "LEGISLATIVE" ? "/camara/planejamento" : "/planejamento";
}

export function projectedValue(base: string, rate: string) {
  return new Prisma.Decimal(base).mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(rate).div(100)))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Largest-remainder allocation conserves cents; stable source ID breaks ties. */
export function allocateRevenue(value: string, sources: { id: string; percentage: string }[]) {
  moneySchema.parse(value);
  if (!sources.length || new Set(sources.map((source) => source.id)).size !== sources.length) throw new Error("Informe fontes distintas.");
  const weights = sources.map((source) => {
    if (!/^\d{1,3}(\.\d{1,6})?$/.test(source.percentage)) throw new Error("Percentual inválido.");
    const weight = new Prisma.Decimal(source.percentage);
    if (weight.lessThanOrEqualTo(0) || weight.greaterThan(100)) throw new Error("Percentual deve ser maior que zero e até 100%.");
    return { ...source, weight };
  });
  if (!weights.reduce((sum, row) => sum.plus(row.weight), new Prisma.Decimal(0)).equals(100)) throw new Error("O rateio exige total de 100%.");
  const cents = new Prisma.Decimal(value).mul(100);
  const rows = weights.map((row) => {
    const raw = cents.mul(row.weight).div(100);
    return { id: row.id, cents: raw.floor(), remainder: raw.minus(raw.floor()) };
  });
  const remaining = cents.minus(rows.reduce((sum, row) => sum.plus(row.cents), new Prisma.Decimal(0))).toNumber();
  const order = [...rows].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.id.localeCompare(b.id));
  for (let i = 0; i < remaining; i++) order[i].cents = order[i].cents.plus(1);
  return rows.map((row) => ({ id: row.id, value: row.cents.div(100).toFixed(2) }));
}
