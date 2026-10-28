import { and, eq, gte, ilike, inArray, isNotNull, lt, or, type SQL } from "drizzle-orm";
import { cemeteryDeceased, cemeteryProcesses } from "../../schema/cemeteries";
import { cemeteryEventDayStart, type CemeteryQuery } from "@/lib/cemeteries/query-policy";

function nextDay(day: string): string { return new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10); }
const literalContains = (value: string) => `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`;

// Every caller joins the deceased row by its required FK before applying this
// predicate. Civil death dates are UTC, performed events use São Paulo days.
export function cemeteryProcessPredicate(query: CemeteryQuery, report = false): SQL | undefined {
  const filters: (SQL | undefined)[] = [
    query.cemetery ? eq(cemeteryProcesses.cemeteryId, query.cemetery) : undefined,
    query.funeralHome ? eq(cemeteryProcesses.funeralHomeId, query.funeralHome) : undefined,
    query.deceased ? eq(cemeteryProcesses.deceasedId, query.deceased) : undefined,
    query.cause ? eq(cemeteryDeceased.causeId, query.cause) : undefined,
    query.deathStart ? gte(cemeteryDeceased.deathDate, new Date(`${query.deathStart}T00:00:00Z`)) : undefined,
    query.deathEnd ? lt(cemeteryDeceased.deathDate, new Date(`${nextDay(query.deathEnd)}T00:00:00Z`)) : undefined,
    query.start || query.end ? eq(cemeteryProcesses.processType, "SEPULTAMENTO") : undefined,
    query.start ? gte(cemeteryProcesses.performedAt, cemeteryEventDayStart(query.start)) : undefined,
    query.end ? lt(cemeteryProcesses.performedAt, cemeteryEventDayStart(nextDay(query.end))) : undefined,
    query.q ? or(ilike(cemeteryProcesses.receiptCode, literalContains(query.q)), ilike(cemeteryDeceased.fullName, literalContains(query.q))) : undefined,
  ];
  if (report) filters.push(eq(cemeteryProcesses.processType, "SEPULTAMENTO"), isNotNull(cemeteryProcesses.performedAt), inArray(cemeteryProcesses.status, ["SEPULTADO", "CREMADO", "DESAPROPRIADO", "EXUMADO", "TRANSFERIDO"]));
  else filters.push(query.status ? eq(cemeteryProcesses.status, query.status) : undefined, query.type ? eq(cemeteryProcesses.processType, query.type) : undefined);
  return and(...filters);
}
