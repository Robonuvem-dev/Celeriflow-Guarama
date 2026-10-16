import { Prisma } from "@prisma/client";
import { z } from "zod";

export const consignmentPolicySchema = z.object({
  origin: z.literal("MARGEM_CONSIGNAVEL"),
  remunerationRubricCodes: z.array(z.string().min(1)).min(1),
  compulsoryDeductionRubricCodes: z.array(z.string().min(1)),
  consignmentRubricCodes: z.array(z.string().min(1)).min(1),
  legalReference: z.string().trim().min(3),
}).strict().superRefine((value, context) => {
  const codes = [...value.remunerationRubricCodes, ...value.compulsoryDeductionRubricCodes, ...value.consignmentRubricCodes];
  if (new Set(codes).size !== codes.length) context.addIssue({ code: "custom", message: "Rubricas de margem devem ser únicas e ter uma única finalidade." });
});

export const consignmentMarginSchema = z.object({
  policy: consignmentPolicySchema, rate: z.string(), remuneration: z.string(), compulsoryDeductions: z.string(),
  base: z.string(), limit: z.string(), used: z.string(), available: z.string(), excess: z.string(),
  contractIds: z.array(z.string()),
  memory: z.array(z.object({ contractId: z.string(), rubricCode: z.string(), purpose: z.enum(["REMUNERACAO", "OBRIGATORIO", "CONSIGNACAO"]), value: z.string() })),
});

type MarginRow = { contractId: string; items: { code: string; type: string; value: string }[] };

/** One limit per PF and calculation, never one duplicated limit per contract. */
export function calculateConsignmentMargin(rows: MarginRow[], rawPolicy: unknown, maximumRate: Prisma.Decimal.Value) {
  const policy = consignmentPolicySchema.parse(rawPolicy);
  const rate = new Prisma.Decimal(maximumRate);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) throw new Error("Margem consignável exige percentual entre 0 e 100.");
  if (!rows.length || new Set(rows.map(row => row.contractId)).size !== rows.length) throw new Error("Contratos da margem ausentes ou duplicados.");
  const memory: z.infer<typeof consignmentMarginSchema>["memory"] = [];
  let remuneration = new Prisma.Decimal(0); let compulsory = new Prisma.Decimal(0); let used = new Prisma.Decimal(0);
  for (const row of rows) {
    if (new Set(row.items.map(item => item.code)).size !== row.items.length) throw new Error("Rubrica duplicada na memória da margem.");
    for (const [codes, purpose, type] of [
      [policy.remunerationRubricCodes, "REMUNERACAO", "PROVENTO"],
      [policy.compulsoryDeductionRubricCodes, "OBRIGATORIO", "DESCONTO"],
      [policy.consignmentRubricCodes, "CONSIGNACAO", "DESCONTO"],
    ] as const) {
      for (const code of codes) {
        const item = row.items.find(item => item.code === code);
        if (!item) throw new Error(`Rubrica ${code} não encontrada na memória para margem consignável.`);
        const value = new Prisma.Decimal(item.value);
        if (item.type !== type || !value.isFinite() || value.lt(0)) throw new Error(`Rubrica ${code} incompatível com sua finalidade na margem consignável.`);
        memory.push({ contractId: row.contractId, rubricCode: code, purpose, value: value.toFixed(2) });
        if (purpose === "REMUNERACAO") remuneration = remuneration.add(value);
        else if (purpose === "OBRIGATORIO") compulsory = compulsory.add(value);
        else used = used.add(value);
      }
    }
  }
  const base = Prisma.Decimal.max(0, remuneration.sub(compulsory));
  const limit = base.mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return consignmentMarginSchema.parse({ policy, rate: rate.toString(), remuneration: remuneration.toFixed(2), compulsoryDeductions: compulsory.toFixed(2), base: base.toFixed(2), limit: limit.toFixed(2), used: used.toFixed(2), available: Prisma.Decimal.max(0, limit.sub(used)).toFixed(2), excess: Prisma.Decimal.max(0, used.sub(limit)).toFixed(2), contractIds: rows.map(row => row.contractId).sort(), memory });
}
