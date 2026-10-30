import { Decimal } from "@/db/decimal";

export function validateDecennialCut(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Informe a data final do decêndio.");
  const date = new Date(`${value}T23:59:59.999Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data inválida.");
  const finalDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (![10, 20, finalDay].includes(date.getUTCDate())) throw new Error("Selecione dia 10, 20 ou o último dia do mês.");
  if (date > new Date()) throw new Error("O decêndio ainda não foi encerrado.");
  return date;
}
export function decennialEducationSummary(input: { numerator: string | null; denominator: string | null; minimum: string | null }) {
  const base = input.denominator === null ? null : new Decimal(input.denominator);
  const applied = input.numerator === null ? null : new Decimal(input.numerator);
  return { applied: input.numerator, base: input.denominator, preliminaryPercentage: base?.gt(0) && applied !== null ? applied.mul(100).div(base).toFixed(4) : null, minimum: input.minimum, provisional: true as const };
}
