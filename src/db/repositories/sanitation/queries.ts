import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { ConsumerUnitListItem, LegacyWaterReading, SanitationInvoiceListItem, SanitationOrderListItem, SanitationReadingListItem, SanitationReportListItem, SanitationRequestListItem, WaterQualityListItem } from "@/lib/contracts/sanitation";
import { clampSanitationPage, type SanitationListQuery } from "@/lib/saneamento/list-query";
import type { DatabaseExecutor } from "../../transaction";
import { consumerUnits, legacyWaterReadings, meterReadings, sanitationInvoices, sanitationPortalRequests, sanitationSavedReports, sanitationServiceOrders, waterQualityAnalyses } from "../../schema/sanitation";

type ListResult<T> = { records: T[]; query: SanitationListQuery; total: number };

export async function listConsumerUnits(db: DatabaseExecutor, requested: SanitationListQuery): Promise<ListResult<ConsumerUnitListItem>> {
  const where = and(
    requested.status ? eq(consumerUnits.status, requested.status) : undefined,
    requested.category ? eq(consumerUnits.category, requested.category) : undefined,
    requested.q ? or(ilike(consumerUnits.code, `%${requested.q}%`), ilike(consumerUnits.address, `%${requested.q}%`), ilike(consumerUnits.ownerName, `%${requested.q}%`), ilike(consumerUnits.neighborhood, `%${requested.q}%`), ilike(consumerUnits.postalCode, `%${requested.q}%`)) : undefined,
  );
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(consumerUnits).where(where);
  const total = count.total;
  const query = clampSanitationPage(requested, total);
  const records = await db.select({
    id: consumerUnits.id, code: consumerUnits.code, address: consumerUnits.address, streetAddress: consumerUnits.streetAddress,
    neighborhood: consumerUnits.neighborhood, postalCode: consumerUnits.postalCode, category: consumerUnits.category,
    status: consumerUnits.status, ownerName: consumerUnits.ownerName,
  }).from(consumerUnits).where(where).orderBy(desc(consumerUnits.createdAt), asc(consumerUnits.id)).offset((query.page - 1) * query.pageSize).limit(query.pageSize);
  return { records, total, query };
}

export async function listMeterReadings(db: DatabaseExecutor, requested: SanitationListQuery): Promise<ListResult<SanitationReadingListItem>> {
  const where = and(
    eq(meterReadings.competence, `${requested.month}/${requested.year}`),
    requested.status ? eq(meterReadings.status, requested.status) : undefined,
    requested.q ? or(ilike(consumerUnits.code, `%${requested.q}%`), ilike(meterReadings.competence, `%${requested.q}%`), ilike(meterReadings.readerName, `%${requested.q}%`)) : undefined,
  );
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(meterReadings).innerJoin(consumerUnits, eq(meterReadings.unitId, consumerUnits.id)).where(where);
  const total = count.total;
  const query = clampSanitationPage(requested, total);
  const rows = await db.select({ record: meterReadings, unit: { code: consumerUnits.code } }).from(meterReadings)
    .innerJoin(consumerUnits, eq(meterReadings.unitId, consumerUnits.id)).where(where)
    .orderBy(desc(meterReadings.readingDate), asc(meterReadings.id)).offset((query.page - 1) * query.pageSize).limit(query.pageSize);
  return { records: rows.map(row => ({ ...row.record, unit: row.unit })), total, query };
}

export async function listInvoices(db: DatabaseExecutor, requested: SanitationListQuery): Promise<ListResult<SanitationInvoiceListItem>> {
  const where = and(
    requested.status ? eq(sanitationInvoices.status, requested.status) : undefined,
    requested.q ? or(ilike(consumerUnits.code, `%${requested.q}%`), ilike(sanitationInvoices.invoiceNumber, `%${requested.q}%`), ilike(sanitationInvoices.competence, `%${requested.q}%`)) : undefined,
  );
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(sanitationInvoices).innerJoin(consumerUnits, eq(sanitationInvoices.unitId, consumerUnits.id)).where(where);
  const total = count.total;
  const query = clampSanitationPage(requested, total);
  const records = await db.select({ id: sanitationInvoices.id, invoiceNumber: sanitationInvoices.invoiceNumber, competence: sanitationInvoices.competence,
    totalAmount: sanitationInvoices.totalAmount, dueDate: sanitationInvoices.dueDate, status: sanitationInvoices.status, unit: { code: consumerUnits.code },
  }).from(sanitationInvoices).innerJoin(consumerUnits, eq(sanitationInvoices.unitId, consumerUnits.id)).where(where)
    .orderBy(desc(sanitationInvoices.dueDate), asc(sanitationInvoices.id)).offset((query.page - 1) * query.pageSize).limit(query.pageSize);
  return { records, total, query };
}

export async function listServiceOrders(db: DatabaseExecutor, requested: SanitationListQuery): Promise<ListResult<SanitationOrderListItem>> {
  const where = and(
    requested.status ? eq(sanitationServiceOrders.status, requested.status) : undefined,
    requested.type ? eq(sanitationServiceOrders.orderType, requested.type) : undefined,
    requested.q ? or(ilike(consumerUnits.code, `%${requested.q}%`), ilike(sanitationServiceOrders.orderNumber, `%${requested.q}%`), ilike(sanitationServiceOrders.orderType, `%${requested.q}%`), ilike(sanitationServiceOrders.technician, `%${requested.q}%`)) : undefined,
  );
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(sanitationServiceOrders).leftJoin(consumerUnits, eq(sanitationServiceOrders.unitId, consumerUnits.id)).where(where);
  const total = count.total;
  const query = clampSanitationPage(requested, total);
  const rows = await db.select({ record: sanitationServiceOrders, unit: { code: consumerUnits.code } }).from(sanitationServiceOrders)
    .leftJoin(consumerUnits, eq(sanitationServiceOrders.unitId, consumerUnits.id)).where(where)
    .orderBy(desc(sanitationServiceOrders.createdAt), asc(sanitationServiceOrders.id)).offset((query.page - 1) * query.pageSize).limit(query.pageSize);
  return { records: rows.map(row => ({ ...row.record, unit: row.unit })), total, query };
}

export async function listWaterQualityAnalyses(db: DatabaseExecutor): Promise<WaterQualityListItem[]> {
  return db.select({ id: waterQualityAnalyses.id, collectionPoint: waterQualityAnalyses.collectionPoint, collectedAt: waterQualityAnalyses.collectedAt,
    parameter: waterQualityAnalyses.parameter, result: waterQualityAnalyses.result, limit: waterQualityAnalyses.limit, compliance: waterQualityAnalyses.compliance, active: waterQualityAnalyses.active,
  }).from(waterQualityAnalyses).orderBy(desc(waterQualityAnalyses.collectedAt));
}

export async function listPortalRequests(db: DatabaseExecutor): Promise<SanitationRequestListItem[]> {
  return db.select({ id: sanitationPortalRequests.id, requestType: sanitationPortalRequests.requestType, requesterName: sanitationPortalRequests.requesterName,
    requestedAt: sanitationPortalRequests.requestedAt, source: sanitationPortalRequests.source, status: sanitationPortalRequests.status, active: sanitationPortalRequests.active,
  }).from(sanitationPortalRequests).orderBy(desc(sanitationPortalRequests.requestedAt));
}

export async function listSavedReports(db: DatabaseExecutor): Promise<SanitationReportListItem[]> {
  return db.select({ id: sanitationSavedReports.id, name: sanitationSavedReports.name, type: sanitationSavedReports.type,
    period: sanitationSavedReports.period, format: sanitationSavedReports.format, active: sanitationSavedReports.active,
  }).from(sanitationSavedReports).orderBy(desc(sanitationSavedReports.createdAt));
}

export async function getSanitationTotals(db: DatabaseExecutor): Promise<{ totalUnits: number; totalReadings: number; totalOS: number }> {
  const [units, readings, orders] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(consumerUnits),
    db.select({ count: sql<number>`count(*)::int` }).from(meterReadings),
    db.select({ count: sql<number>`count(*)::int` }).from(sanitationServiceOrders),
  ]);
  return { totalUnits: units[0].count, totalReadings: readings[0].count, totalOS: orders[0].count };
}

export async function listLegacyWaterReadings(db: DatabaseExecutor): Promise<LegacyWaterReading[]> {
  return db.select().from(legacyWaterReadings).orderBy(desc(legacyWaterReadings.createdAt)).limit(15);
}
