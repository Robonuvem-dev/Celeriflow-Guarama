import { Decimal } from "@/db/decimal";
import { z } from "zod";

export const cemeteryFeeEventType = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,79}$/, "Use um código de evento com letras, números e sublinhado.");
export const cemeteryFeeRuleSchema = z.object({
  cemeteryId: z.string().default(""),
  eventType: cemeteryFeeEventType,
  label: z.string().trim().min(3).max(200),
  formula: z.enum(["VALOR_FIXO", "BASE_X_QUANTIDADE"]),
  baseAmount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  dueDays: z.coerce.number().int().min(0).max(365),
  taxId: z.string().min(1),
  validFrom: z.iso.date(),
  validUntil: z.union([z.literal(""), z.iso.date()]).default(""),
  legalBasis: z.string().trim().min(3).max(4000),
}).refine((data) => !data.validUntil || data.validUntil >= data.validFrom, "Vigência final anterior à inicial.");

export function calculateCemeteryEventFee(formula: string, base: Decimal | string, quantity: Decimal | string = "1") {
  if (!["VALOR_FIXO", "BASE_X_QUANTIDADE"].includes(formula)) throw new Error("Fórmula de taxa não suportada.");
  const baseAmount = new Decimal(base);
  const units = new Decimal(quantity);
  if (!baseAmount.isFinite() || baseAmount.lte(0) || baseAmount.decimalPlaces() > 2 || baseAmount.gte("1000000000000")) throw new Error("Valor-base positivo, com até duas casas decimais, é obrigatório.");
  if (!units.isFinite() || units.lte(0) || units.decimalPlaces() > 4 || units.gte("100000000000000")) throw new Error("Quantidade positiva, com até quatro casas decimais, é obrigatória.");
  const amount = (formula === "VALOR_FIXO" ? baseAmount : baseAmount.mul(units)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (amount.lte(0) || amount.gte("10000000000000000")) throw new Error("Resultado monetário fora dos limites da taxa.");
  return { amount, baseAmount: baseAmount.toFixed(2), quantity: units.toFixed(4), formula };
}

export function cemeteryEventDueDate(occurredAt: Date, dueDays: number) {
  if (!Number.isFinite(occurredAt.getTime()) || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) throw new Error("Data do evento ou prazo inválido.");
  const result = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate(), 12));
  result.setUTCDate(result.getUTCDate() + dueDays);
  return result;
}

export function cemeteryFeeEventKey(eventType: string, sourceType: string, sourceId: string) {
  const event = cemeteryFeeEventType.parse(eventType);
  if (!sourceId.trim()) throw new Error("Fato gerador obrigatório.");
  return `CEMITERIOS:${event}:${sourceType}:${sourceId}`;
}
