import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import { getSanitationTotals, listConsumerUnits, listInvoices, listMeterReadings, listPortalRequests, listSavedReports, listServiceOrders, listWaterQualityAnalyses } from "../src/db/repositories/sanitation/queries";
import { clampSanitationPage, parseSanitationQuery } from "../src/lib/saneamento/list-query";
import type { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(url);
  const connection = createDatabaseConnection(url);
  let comparisons = 0;
  try {
    const totals = await getSanitationTotals(connection.db);
    assert.deepEqual(totals, { totalUnits: await legacy.sanConsumerUnit.count(), totalReadings: await legacy.sanMeterReading.count(), totalOS: await legacy.sanServiceOrder.count() });
    comparisons++;
    for (const params of [{}, { page: "2" }, { page: "999999", q: "Rua", category: "Residencial" }, { q: "%_" }]) {
      const requested = parseSanitationQuery(params);
      const where: Prisma.SanConsumerUnitWhereInput = {
        ...(requested.status ? { status: requested.status } : {}), ...(requested.category ? { category: requested.category } : {}),
        ...(requested.q ? { OR: ["code", "address", "ownerName", "neighborhood", "postalCode"].map(field => ({ [field]: { contains: requested.q, mode: "insensitive" } })) } : {}),
      };
      const total = await legacy.sanConsumerUnit.count({ where });
      const query = clampSanitationPage(requested, total);
      const records = await legacy.sanConsumerUnit.findMany({ where, select: { id: true, code: true, address: true, streetAddress: true, neighborhood: true, postalCode: true, category: true, status: true, ownerName: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      assert.deepEqual(await listConsumerUnits(connection.db, requested), { records, query, total });
      comparisons++;
    }
    const months: { year: string; month: string; total: number }[] = [];
    for (const params of [{ year: "2026", month: "08" }, { year: "2026", month: "09", page: "2" }, { year: "2026", month: "10", q: "2026" }, { year: "2024", month: "10" }, { year: "2025", month: "10" }]) {
      const requested = parseSanitationQuery(params);
      const where: Prisma.SanMeterReadingWhereInput = { competence: `${requested.month}/${requested.year}`,
        ...(requested.status ? { status: requested.status } : {}), ...(requested.q ? { OR: [{ unit: { code: { contains: requested.q, mode: "insensitive" } } }, { competence: { contains: requested.q, mode: "insensitive" } }, { readerName: { contains: requested.q, mode: "insensitive" } }] } : {}),
      };
      const total = await legacy.sanMeterReading.count({ where });
      const query = clampSanitationPage(requested, total);
      const records = await legacy.sanMeterReading.findMany({ where, include: { unit: { select: { code: true } } }, orderBy: [{ readingDate: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      assert.deepEqual(await listMeterReadings(connection.db, requested), { records, query, total });
      months.push({ year: query.year, month: query.month, total });
      comparisons++;
    }
    for (const params of [{}, { q: "2026", page: "2", status: "Emitida" }]) {
      const requested = parseSanitationQuery(params);
      const where: Prisma.SanInvoiceWhereInput = { ...(requested.status ? { status: requested.status } : {}), ...(requested.q ? { OR: [{ unit: { code: { contains: requested.q, mode: "insensitive" } } }, { invoiceNumber: { contains: requested.q, mode: "insensitive" } }, { competence: { contains: requested.q, mode: "insensitive" } }] } : {}) };
      const total = await legacy.sanInvoice.count({ where });
      const query = clampSanitationPage(requested, total);
      const records = await legacy.sanInvoice.findMany({ where, select: { id: true, invoiceNumber: true, competence: true, totalAmount: true, dueDate: true, status: true, unit: { select: { code: true } } }, orderBy: [{ dueDate: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      assert.deepEqual(await listInvoices(connection.db, requested), { records, query, total });
      comparisons++;
    }
    for (const params of [{}, { q: "Manutenção", type: "Manutenção" }]) {
      const requested = parseSanitationQuery(params);
      const where: Prisma.SanServiceOrderWhereInput = { ...(requested.status ? { status: requested.status } : {}), ...(requested.type ? { orderType: requested.type } : {}), ...(requested.q ? { OR: [{ unit: { code: { contains: requested.q, mode: "insensitive" } } }, ...["orderNumber", "orderType", "technician"].map(field => ({ [field]: { contains: requested.q, mode: "insensitive" } }))] } : {}) };
      const total = await legacy.sanServiceOrder.count({ where });
      const query = clampSanitationPage(requested, total);
      const records = await legacy.sanServiceOrder.findMany({ where, include: { unit: { select: { code: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      assert.deepEqual(await listServiceOrders(connection.db, requested), { records, query, total });
      comparisons++;
    }
    assert.deepEqual(await listWaterQualityAnalyses(connection.db), await legacy.sanWaterQualityAnalysis.findMany({ select: { id: true, collectionPoint: true, collectedAt: true, parameter: true, result: true, limit: true, compliance: true, active: true }, orderBy: { collectedAt: "desc" } }));
    assert.deepEqual(await listPortalRequests(connection.db), await legacy.sanPortalRequest.findMany({ select: { id: true, requestType: true, requesterName: true, requestedAt: true, source: true, status: true, active: true }, orderBy: { requestedAt: "desc" } }));
    assert.deepEqual(await listSavedReports(connection.db), await legacy.sanSavedReport.findMany({ select: { id: true, name: true, type: true, period: true, format: true, active: true }, orderBy: { createdAt: "desc" } }));
    comparisons += 3;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, totals, months }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
