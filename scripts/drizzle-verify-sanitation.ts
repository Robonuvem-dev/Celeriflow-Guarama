import assert from "node:assert/strict";
import { config } from "dotenv";
import { getSanitationTotals, listConsumerUnits, listInvoices, listMeterReadings, listPortalRequests, listSavedReports, listServiceOrders, listWaterQualityAnalyses } from "../src/db/repositories/sanitation/queries";
import { parseSanitationQuery, type SanitationListQuery } from "../src/lib/saneamento/list-query";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  const clamp = (query: SanitationListQuery, total: number) => ({ ...query, page: Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize))) });
  let comparisons = 0;
  try {
    const totals = await getSanitationTotals(connection.db);
    assert.deepEqual(totals, { totalUnits: await connection.count('SELECT count(*)::int AS count FROM "SanConsumerUnit"'), totalReadings: await connection.count('SELECT count(*)::int AS count FROM "SanMeterReading"'), totalOS: await connection.count('SELECT count(*)::int AS count FROM "SanServiceOrder"') });
    comparisons++;
    for (const params of [{}, { page: "2" }, { page: "999999", q: "Rua", category: "Residencial" }, { q: "%_" }]) {
      const requested = parseSanitationQuery(params);
      const where = `($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR category=$2) AND ($3::text IS NULL OR code ILIKE $3 OR address ILIKE $3 OR "ownerName" ILIKE $3 OR neighborhood ILIKE $3 OR "postalCode" ILIKE $3)`;
      const values = [requested.status || null, requested.category || null, requested.q ? `%${requested.q}%` : null];
      const total = await connection.count(`SELECT count(*)::int AS count FROM "SanConsumerUnit" WHERE ${where}`, values);
      const query = clamp(requested, total);
      const records = await connection.rows(`SELECT id,code,address,"streetAddress",neighborhood,"postalCode",category,status,"ownerName" FROM "SanConsumerUnit" WHERE ${where} ORDER BY "createdAt" DESC,id ASC LIMIT $4 OFFSET $5`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      assert.deepEqual(await listConsumerUnits(connection.db, requested), { records, query, total });
      comparisons++;
    }
    const months: { year: string; month: string; total: number }[] = [];
    for (const params of [{ year: "2026", month: "08" }, { year: "2026", month: "09", page: "2" }, { year: "2026", month: "10", q: "2026" }, { year: "2024", month: "10" }, { year: "2025", month: "10" }]) {
      const requested = parseSanitationQuery(params);
      const from = `FROM "SanMeterReading" r JOIN "SanConsumerUnit" u ON u.id=r."unitId" WHERE r.competence=$1 AND ($2::text IS NULL OR r.status=$2) AND ($3::text IS NULL OR u.code ILIKE $3 OR r.competence ILIKE $3 OR r."readerName" ILIKE $3)`;
      const values = [`${requested.month}/${requested.year}`, requested.status || null, requested.q ? `%${requested.q}%` : null];
      const total = await connection.count(`SELECT count(*)::int AS count ${from}`, values);
      const query = clamp(requested, total);
      const records = await connection.rows(`SELECT r.*,json_build_object('code',u.code) AS unit ${from} ORDER BY r."readingDate" DESC,r.id ASC LIMIT $4 OFFSET $5`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      assert.deepEqual(await listMeterReadings(connection.db, requested), { records, query, total });
      months.push({ year: query.year, month: query.month, total });
      comparisons++;
    }
    for (const params of [{}, { q: "2026", page: "2", status: "Emitida" }]) {
      const requested = parseSanitationQuery(params);
      const from = `FROM "SanInvoice" i JOIN "SanConsumerUnit" u ON u.id=i."unitId" WHERE ($1::text IS NULL OR i.status=$1) AND ($2::text IS NULL OR u.code ILIKE $2 OR i."invoiceNumber" ILIKE $2 OR i.competence ILIKE $2)`;
      const values = [requested.status || null, requested.q ? `%${requested.q}%` : null];
      const total = await connection.count(`SELECT count(*)::int AS count ${from}`, values);
      const query = clamp(requested, total);
      const records = await connection.rows(`SELECT i.id,i."invoiceNumber",i.competence,i."totalAmount",i."dueDate",i.status,json_build_object('code',u.code) AS unit ${from} ORDER BY i."dueDate" DESC,i.id ASC LIMIT $3 OFFSET $4`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      assert.deepEqual(await listInvoices(connection.db, requested), { records, query, total });
      comparisons++;
    }
    for (const params of [{}, { q: "Manutenção", type: "Manutenção" }]) {
      const requested = parseSanitationQuery(params);
      const from = `FROM "SanServiceOrder" o LEFT JOIN "SanConsumerUnit" u ON u.id=o."unitId" WHERE ($1::text IS NULL OR o.status=$1) AND ($2::text IS NULL OR o."orderType"=$2) AND ($3::text IS NULL OR u.code ILIKE $3 OR o."orderNumber" ILIKE $3 OR o."orderType" ILIKE $3 OR o.technician ILIKE $3)`;
      const values = [requested.status || null, requested.type || null, requested.q ? `%${requested.q}%` : null];
      const total = await connection.count(`SELECT count(*)::int AS count ${from}`, values);
      const query = clamp(requested, total);
      const records = await connection.rows(`SELECT o.*,CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('code',u.code) END AS unit ${from} ORDER BY o."createdAt" DESC,o.id ASC LIMIT $4 OFFSET $5`, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
      assert.deepEqual(await listServiceOrders(connection.db, requested), { records, query, total });
      comparisons++;
    }
    assert.deepEqual(await listWaterQualityAnalyses(connection.db), await connection.rows('SELECT id,"collectionPoint","collectedAt",parameter,result,"limit",compliance,active FROM "SanWaterQualityAnalysis" ORDER BY "collectedAt" DESC'));
    assert.deepEqual(await listPortalRequests(connection.db), await connection.rows('SELECT id,"requestType","requesterName","requestedAt",source,status,active FROM "SanPortalRequest" ORDER BY "requestedAt" DESC'));
    assert.deepEqual(await listSavedReports(connection.db), await connection.rows('SELECT id,name,type,period,format,active FROM "SanSavedReport" ORDER BY "createdAt" DESC'));
    comparisons += 3;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, totals, months }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
