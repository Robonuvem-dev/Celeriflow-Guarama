/** POC convention: an anniversary originating on Feb 29 falls on Feb 28 in
 * non-leap years. Kept explicit for replacement by the municipality's rule. */
export function civilAnniversary(start: Date, years: number) {
  const year = start.getUTCFullYear() + years, month = start.getUTCMonth();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
}

export function completedCivilServiceYears(start: Date, through: Date) {
  if (through < start) return 0;
  const candidate = through.getUTCFullYear() - start.getUTCFullYear();
  return Math.max(0, civilAnniversary(start, candidate) <= through ? candidate : candidate - 1);
}
