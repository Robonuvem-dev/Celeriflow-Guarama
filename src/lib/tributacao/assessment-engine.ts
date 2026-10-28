import { Decimal } from "@/db/decimal";

export class TaxError extends Error {}

function amount(value: Decimal | string | number) {
  const decimal = new Decimal(String(value)).toDecimalPlaces(2);
  if (!decimal.isFinite() || decimal.lessThan(0)) throw new TaxError("Informe um valor monetário válido.");
  return decimal;
}

export function calculateTaxAssessment(input: {
  taxableBase: Decimal | string | number; rate: Decimal | string | number;
  discount?: Decimal | string | number; interest?: Decimal | string | number;
  penalty?: Decimal | string | number; correction?: Decimal | string | number;
}) {
  const taxableBase = amount(input.taxableBase);
  const rate = new Decimal(String(input.rate));
  if (!rate.isFinite() || rate.lessThan(0)) throw new TaxError("Informe uma alíquota válida.");
  const discount = amount(input.discount ?? 0);
  const interest = amount(input.interest ?? 0);
  const penalty = amount(input.penalty ?? 0);
  const correction = amount(input.correction ?? 0);
  const principal = taxableBase.mul(rate).div(100).toDecimalPlaces(2);
  const finalValue = principal.plus(interest).plus(penalty).plus(correction).minus(discount).toDecimalPlaces(2);
  if (finalValue.lessThanOrEqualTo(0)) throw new TaxError("O cálculo tributário deve resultar em valor positivo.");
  return { taxableBase, rate, principal, discount, interest, penalty, correction, finalValue };
}
