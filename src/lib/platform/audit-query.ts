import { and, asc, desc, eq, gt, gte, lt, lte, or, type SQL } from "drizzle-orm";
import { auditEvents } from "@/db/schema/audit";
import { z } from "zod";
import { auditEventTypes, type AuditEventType } from "@/lib/contracts/audit";

export const auditEventPageSize = 20;

export type AuditEventFilters = {
  actorUsuarioId?: string;
  eventType?: AuditEventType;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};

export type AuditEventCursor = {
  id: string;
  createdAt: Date;
};

export type AuditEventQuery = {
  filters: AuditEventFilters;
  cursor?: AuditEventCursor;
  direction: "next" | "previous";
};

type AuditSearchParams = Record<string, string | string[] | undefined>;

const eventTypes = Object.values(auditEventTypes) as [AuditEventType, ...AuditEventType[]];
const identifierSchema = z.string().trim().min(1).max(191);
const targetTypeSchema = z.string().trim().min(1).max(100);
const targetIdSchema = z.string().trim().min(1).max(400);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function readSingleValue(searchParams: AuditSearchParams, name: string) {
  const value = searchParams[name];
  if (Array.isArray(value)) throw new Error(`Parâmetro ${name} inválido.`);
  return value?.trim() || undefined;
}

function parseOptionalValue<T extends string>(
  searchParams: AuditSearchParams,
  name: string,
  schema: z.ZodType<T>,
) {
  const value = readSingleValue(searchParams, name);
  if (!value) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Parâmetro ${name} inválido.`);
  return parsed.data;
}

function parseDate(value: string, name: "from" | "to") {
  if (!dateSchema.safeParse(value).success) throw new Error(`Parâmetro ${name} inválido.`);

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Parâmetro ${name} inválido.`);
  }
  return date;
}

function parseCursor(value: string): AuditEventCursor {
  const separator = value.lastIndexOf("|");
  if (separator <= 0 || separator === value.length - 1) throw new Error("Parâmetro cursor inválido.");

  const createdAt = new Date(value.slice(0, separator));
  const id = value.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== value.slice(0, separator) || !identifierSchema.safeParse(id).success) {
    throw new Error("Parâmetro cursor inválido.");
  }
  return { createdAt, id };
}

export function encodeAuditEventCursor(cursor: AuditEventCursor) {
  return `${cursor.createdAt.toISOString()}|${cursor.id}`;
}

export function normalizeAuditEventFilters(searchParams: AuditSearchParams): AuditEventFilters {
  const eventType = parseOptionalValue(searchParams, "eventType", z.enum(eventTypes));
  const from = parseOptionalValue(searchParams, "from", dateSchema);
  const to = parseOptionalValue(searchParams, "to", dateSchema);
  if (from && to && parseDate(from, "from") > parseDate(to, "to")) {
    throw new Error("O período de auditoria é inválido.");
  }

  return {
    actorUsuarioId: parseOptionalValue(searchParams, "actorUsuarioId", identifierSchema),
    eventType,
    targetType: parseOptionalValue(searchParams, "targetType", targetTypeSchema),
    targetId: parseOptionalValue(searchParams, "targetId", targetIdSchema),
    from,
    to,
  };
}

export function parseAuditEventQuery(searchParams: AuditSearchParams): AuditEventQuery {
  const cursorValue = readSingleValue(searchParams, "cursor");
  const direction = readSingleValue(searchParams, "direction");
  if (direction && direction !== "previous") throw new Error("Parâmetro direction inválido.");

  return {
    filters: normalizeAuditEventFilters(searchParams),
    cursor: cursorValue ? parseCursor(cursorValue) : undefined,
    direction: direction === "previous" ? "previous" : "next",
  };
}

export function buildAuditEventWhere(filters: AuditEventFilters): SQL | undefined {
  return and(
    filters.actorUsuarioId ? eq(auditEvents.actorUsuarioId, filters.actorUsuarioId) : undefined,
    filters.eventType ? eq(auditEvents.eventType, filters.eventType) : undefined,
    filters.targetType ? eq(auditEvents.targetType, filters.targetType) : undefined,
    filters.targetId ? eq(auditEvents.targetId, filters.targetId) : undefined,
    filters.from ? gte(auditEvents.createdAt, parseDate(filters.from, "from")) : undefined,
    filters.to ? lte(auditEvents.createdAt, new Date(parseDate(filters.to, "to").getTime() + 24 * 60 * 60 * 1000 - 1)) : undefined,
  );
}

export function buildAuditEventPageQuery(query: AuditEventQuery): { where: SQL | undefined; orderBy: SQL[]; take: number } {
  const baseWhere = buildAuditEventWhere(query.filters);
  const cursorWhere = query.cursor ? query.direction === "previous"
    ? or(gt(auditEvents.createdAt, query.cursor.createdAt), and(eq(auditEvents.createdAt, query.cursor.createdAt), gt(auditEvents.id, query.cursor.id)))
    : or(lt(auditEvents.createdAt, query.cursor.createdAt), and(eq(auditEvents.createdAt, query.cursor.createdAt), lt(auditEvents.id, query.cursor.id)))
    : undefined;

  return {
    where: and(baseWhere, cursorWhere),
    orderBy: query.direction === "previous"
      ? [asc(auditEvents.createdAt), asc(auditEvents.id)]
      : [desc(auditEvents.createdAt), desc(auditEvents.id)],
    take: auditEventPageSize + 1,
  };
}

type CursorRecord = AuditEventCursor;

export function createAuditEventPage<T extends CursorRecord>(records: T[], query: AuditEventQuery) {
  const hasAdjacentPage = records.length > auditEventPageSize;
  const events = records.slice(0, auditEventPageSize);
  if (query.direction === "previous") events.reverse();
  const firstEvent = events[0];
  const lastEvent = events.at(-1);

  const hasPrevious = query.direction === "previous" ? hasAdjacentPage : Boolean(query.cursor);
  const hasNext = query.direction === "previous" ? Boolean(query.cursor) : hasAdjacentPage;
  return {
    events,
    previousCursor: hasPrevious && firstEvent ? encodeAuditEventCursor(firstEvent) : undefined,
    nextCursor: hasNext && lastEvent ? encodeAuditEventCursor(lastEvent) : undefined,
  };
}

export function createAuditEventSearchParams(
  filters: AuditEventFilters,
  pagination?: { cursor?: AuditEventCursor | string; direction?: AuditEventQuery["direction"] },
) {
  const searchParams = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value) searchParams.set(name, value);
  }
  if (pagination?.cursor) {
    searchParams.set("cursor", typeof pagination.cursor === "string" ? pagination.cursor : encodeAuditEventCursor(pagination.cursor));
  }
  if (pagination?.direction === "previous") searchParams.set("direction", "previous");
  return searchParams;
}
