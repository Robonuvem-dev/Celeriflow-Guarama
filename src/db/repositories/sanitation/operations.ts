import { and, asc, desc, eq, ilike, like, or, sql } from "drizzle-orm";
import type { ConsumerUnitInput, SanitationReading, SanitationServiceOrder } from "@/lib/contracts/sanitation";
import { consumerUnitPeriod, formatConsumerUnitIdentifier } from "@/lib/saneamento/unit-code";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { consumerUnits, meterReadings, sanitationPortalRequests, sanitationSavedReports, sanitationServiceOrders, waterQualityAnalyses } from "../../schema/sanitation";

function requireUpdated(rows: { id: string }[]): void {
  if (!rows.length) throw new PersistenceError("not-found", "Registro não encontrado.");
}

export async function reserveConsumerUnitIdentifiers(tx: DatabaseTransaction, date: Date, count = 1): Promise<{ period: string; start: number }> {
  const period = consumerUnitPeriod(date);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`san-consumer-unit:${period}`}))`);
  const [last] = await tx.select({ code: consumerUnits.code }).from(consumerUnits).where(like(consumerUnits.code, `${period}%`)).orderBy(desc(consumerUnits.code)).limit(1);
  const start = last ? Number(last.code.slice(6)) + 1 : 1;
  formatConsumerUnitIdentifier(period, start + count - 1);
  return { period, start };
}

export async function insertConsumerUnit(tx: DatabaseTransaction, input: ConsumerUnitInput, createdAt: Date): Promise<void> {
  const { period, start } = await reserveConsumerUnitIdentifiers(tx, createdAt);
  await tx.insert(consumerUnits).values({ ...input, code: formatConsumerUnitIdentifier(period, start), createdAt, status: "Ativa" });
}

export async function updateConsumerUnit(db: DatabaseExecutor, id: string, input: ConsumerUnitInput): Promise<void> {
  requireUpdated(await db.update(consumerUnits).set(input).where(eq(consumerUnits.id, id)).returning({ id: consumerUnits.id }));
}

export async function setConsumerUnitStatus(db: DatabaseExecutor, id: string, status: string): Promise<void> {
  requireUpdated(await db.update(consumerUnits).set({ status }).where(eq(consumerUnits.id, id)).returning({ id: consumerUnits.id }));
}

export async function findConsumerUnitStatus(db: DatabaseExecutor, id: string): Promise<{ status: string } | null> {
  const [unit] = await db.select({ status: consumerUnits.status }).from(consumerUnits).where(eq(consumerUnits.id, id)).limit(1);
  return unit ?? null;
}

export async function searchConsumerUnitOptions(db: DatabaseExecutor, query: string, activeOnly: boolean): Promise<{ id: string; code: string; address: string }[]> {
  return db.select({ id: consumerUnits.id, code: consumerUnits.code, address: consumerUnits.address }).from(consumerUnits)
    .where(and(activeOnly ? eq(consumerUnits.status, "Ativa") : undefined, query ? or(ilike(consumerUnits.code, `%${query}%`), ilike(consumerUnits.address, `%${query}%`), ilike(consumerUnits.ownerName, `%${query}%`)) : undefined))
    .orderBy(asc(consumerUnits.code)).limit(20);
}

export async function insertMeterReading(db: DatabaseExecutor, input: { unitId: string; competence: string; previousValue: number; currentValue: number; readerName: string }): Promise<void> {
  await db.insert(meterReadings).values({ ...input, consumption: input.currentValue - input.previousValue, status: "Registrada" });
}

export async function findMeterReading(db: DatabaseExecutor, id: string): Promise<SanitationReading | null> {
  const [reading] = await db.select().from(meterReadings).where(eq(meterReadings.id, id)).limit(1);
  return reading ?? null;
}

export async function updateMeterReading(db: DatabaseExecutor, id: string, input: { currentValue: number; consumption: number; status: string; readerName: string }): Promise<void> {
  requireUpdated(await db.update(meterReadings).set(input).where(eq(meterReadings.id, id)).returning({ id: meterReadings.id }));
}

export async function insertServiceOrder(db: DatabaseExecutor, input: { orderNumber: string; orderType: string; description: string; priority: string; unitId: string | null; technician: string | null; status: string }): Promise<void> {
  await db.insert(sanitationServiceOrders).values(input);
}

export async function findServiceOrder(db: DatabaseExecutor, id: string): Promise<SanitationServiceOrder | null> {
  const [order] = await db.select().from(sanitationServiceOrders).where(eq(sanitationServiceOrders.id, id)).limit(1);
  return order ?? null;
}

export async function updateServiceOrder(tx: DatabaseTransaction, id: string, input: { orderType: string; description: string; priority: string; status: string; technician: string | null }, unitId: string | null): Promise<void> {
  requireUpdated(await tx.update(sanitationServiceOrders).set(input).where(eq(sanitationServiceOrders.id, id)).returning({ id: sanitationServiceOrders.id }));
  if (input.status === "Concluída" && unitId) {
    const status = input.orderType === "Corte" ? "Cortada" : input.orderType === "Religação" ? "Ativa" : null;
    if (status) await setConsumerUnitStatus(tx, unitId, status);
  }
}

export async function updateWaterQualityAnalysis(db: DatabaseExecutor, id: string, input: { collectionPoint: string; collectedAt: Date; parameter: string; result: string; limit: string; compliance: string }): Promise<void> {
  requireUpdated(await db.update(waterQualityAnalyses).set(input).where(eq(waterQualityAnalyses.id, id)).returning({ id: waterQualityAnalyses.id }));
}

export async function inactivateWaterQualityAnalysis(db: DatabaseExecutor, id: string): Promise<void> {
  requireUpdated(await db.update(waterQualityAnalyses).set({ active: false }).where(eq(waterQualityAnalyses.id, id)).returning({ id: waterQualityAnalyses.id }));
}

export async function updatePortalRequest(db: DatabaseExecutor, id: string, input: { requestType: string; requesterName: string; requestedAt: Date; source: string; status: string }): Promise<void> {
  requireUpdated(await db.update(sanitationPortalRequests).set(input).where(eq(sanitationPortalRequests.id, id)).returning({ id: sanitationPortalRequests.id }));
}

export async function inactivatePortalRequest(db: DatabaseExecutor, id: string): Promise<void> {
  requireUpdated(await db.update(sanitationPortalRequests).set({ active: false }).where(eq(sanitationPortalRequests.id, id)).returning({ id: sanitationPortalRequests.id }));
}

export async function updateSavedReport(db: DatabaseExecutor, id: string, input: { name: string; type: string; period: string; format: string }): Promise<void> {
  requireUpdated(await db.update(sanitationSavedReports).set(input).where(eq(sanitationSavedReports.id, id)).returning({ id: sanitationSavedReports.id }));
}

export async function inactivateSavedReport(db: DatabaseExecutor, id: string): Promise<void> {
  requireUpdated(await db.update(sanitationSavedReports).set({ active: false }).where(eq(sanitationSavedReports.id, id)).returning({ id: sanitationSavedReports.id }));
}
