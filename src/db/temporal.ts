/** Decode PostgreSQL temporal values returned by an unmapped execute() query.
 * Drizzle's typed column selects already perform this conversion. Raw timestamp
 * without time zone represents the same UTC wall time used by the old runtime;
 * JavaScript's local-time parsing would move it on non-UTC developer hosts. */
export function databaseTimestamp(value: string | Date): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Timestamp inválido retornado pelo banco de dados.");
    return new Date(value.getTime());
  }
  let normalized = value.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += "T00:00:00.000Z";
  else if (/[+-]\d{2}$/.test(normalized)) normalized += ":00";
  else if (/[+-]\d{4}$/.test(normalized)) normalized = `${normalized.slice(0, -2)}:${normalized.slice(-2)}`;
  else if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) normalized += "Z";
  const result = new Date(normalized);
  if (!Number.isFinite(result.getTime())) throw new Error("Timestamp inválido retornado pelo banco de dados.");
  return result;
}
