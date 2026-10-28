import DecimalJs from "decimal.js";
import { customType } from "drizzle-orm/pg-core";

// Isolated constructor with the existing Prisma decimal defaults. Never mutate
// decimal.js global settings, and never use Number() for persisted numerics.
export const Decimal = DecimalJs.clone({ precision: 20, rounding: DecimalJs.ROUND_HALF_UP, toExpNeg: -7, toExpPos: 21 });
export type Decimal = DecimalJs;

export const exactNumeric = customType<{
  data: Decimal;
  driverData: string;
  config: { precision: number; scale: number };
  configRequired: true;
}>({
  dataType: ({ precision, scale }) => `numeric(${precision},${scale})`,
  fromDriver: value => new Decimal(value),
  toDriver: value => value.toString(),
});
