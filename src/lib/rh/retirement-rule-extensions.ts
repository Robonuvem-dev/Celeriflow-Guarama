import { Decimal } from "@/db/decimal";

/** Municipal transitions provide their cutoffs and increments explicitly. */
export function retirementTransitionThresholds(data: Record<string, string>, reference: string) {
  const years = data.escalationFrom && reference >= data.escalationFrom ? Math.max(0, Number(reference.slice(0, 4)) - Number(data.escalationFrom.slice(0, 4))) : 0;
  const increment = (base: string, step: string, ceiling: string) => {
    const value = new Decimal(base || 0).add(new Decimal(step || 0).mul(years));
    return ceiling ? Decimal.min(value, ceiling) : value;
  };
  return { age: increment(data.minimumAge, data.annualAgeIncrease, data.maximumAge), points: increment(data.minimumPoints, data.annualPointsIncrease, data.maximumPoints), years, reference };
}

export function retirementAgeReached(birth: Date, at: Date, age: Decimal) {
  const months = age.mul(12);
  if (!months.isInteger()) throw new Error("Idade mínima deve corresponder a meses civis inteiros.");
  const target = new Date(Date.UTC(birth.getUTCFullYear(), birth.getUTCMonth() + months.toNumber(), 1));
  target.setUTCDate(Math.min(birth.getUTCDate(), new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return at >= target;
}

/** Points include the elapsed civil-age fraction, rather than truncating age to completed years. */
export function retirementAgeForPoints(birth: Date, at: Date) {
  const birthday = (year: number) => new Date(Date.UTC(year, birth.getUTCMonth(), Math.min(birth.getUTCDate(), new Date(Date.UTC(year, birth.getUTCMonth() + 1, 0)).getUTCDate())));
  let year = at.getUTCFullYear();
  if (at < birthday(year)) year--;
  const previous = birthday(year), next = birthday(year + 1);
  return new Decimal(year - birth.getUTCFullYear()).add(new Decimal(at.getTime() - previous.getTime()).div(next.getTime() - previous.getTime()));
}
