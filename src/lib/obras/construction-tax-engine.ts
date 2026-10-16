import { Prisma } from "@prisma/client";

export const constructionFeeKinds = { PERMIT: "Alvará", REANALYSIS: "Reanálise", HABITE_SE: "Habite-se", SUBDIVISION: "Parcelamento", INSPECTION: "Vistoria", CORRECTION: "Correção documental", RENEWAL: "Renovação de alvará" } as const;
export type ConstructionFeeKind = keyof typeof constructionFeeKinds;

export function calculateConstructionFee(area: string, fixedAmount: string, amountPerSquareMeter: string) {
  const values = [area, fixedAmount, amountPerSquareMeter].map((value) => new Prisma.Decimal(value));
  if (values.some((value) => !value.isFinite() || value.lessThan(0))) throw new Error("Valores da taxa devem ser finitos e não negativos.");
  const amount = values[0].mul(values[2]).plus(values[1]).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (amount.greaterThan("9999999999999999.99")) throw new Error("Taxa excede o limite monetário.");
  return { amount, memory: { area: values[0].toFixed(4), fixedAmount: values[1].toFixed(2), amountPerSquareMeter: values[2].toFixed(4), amount: amount.toFixed(2), formula: "valor fixo + área calculada × valor por m²" } };
}

export function confirmedConstructionBalance(total: Prisma.Decimal | string | number, payments: { amountPaidDecimal: Prisma.Decimal | null; amountPaid: number }[]) {
  const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal ?? payment.amountPaid), new Prisma.Decimal(0));
  return Prisma.Decimal.max(new Prisma.Decimal(total).minus(paid), 0);
}

// Arrecadação: segmento 1 (prefeituras), referência 6 (valor efetivo, módulo 10).
// Entidade 0000 é exclusivamente demonstrativa, sem convênio bancário.
export function demonstrationConstructionBarcode(amount: string, reference: string) {
  function digit(value: string) { let sum = 0; [...value].reverse().forEach((char, index) => { const product = Number(char) * (index % 2 ? 1 : 2); sum += Math.floor(product / 10) + product % 10; }); return String((10 - sum % 10) % 10); }
  const cents = new Prisma.Decimal(amount).mul(100).toFixed(0);
  if (!/^\d{1,11}$/.test(cents) || !/^\d{1,25}$/.test(reference)) throw new Error("Valor ou referência excede o formato da guia demonstrativa.");
  const raw = `816${cents.padStart(11, "0")}0000${reference.padStart(25, "0")}`;
  const barcode = raw.slice(0, 3) + digit(raw) + raw.slice(3);
  const line = [0, 11, 22, 33].map((offset) => { const block = barcode.slice(offset, offset + 11); return block + digit(block); }).join(" ");
  return { barcode, line, label: "DEMONSTRATIVO — sem convênio bancário; não utilizar para pagamento" };
}
