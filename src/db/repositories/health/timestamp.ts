/** Prisma DateTime columns are PostgreSQL timestamp(3) without time zone.
 * Drizzle raw execution deliberately leaves their wire values as strings. */
export function healthTimestamp(value: string): Date {
  return new Date(value.length === 10 ? `${value}T00:00:00.000Z` : `${value.replace(" ", "T")}Z`);
}
