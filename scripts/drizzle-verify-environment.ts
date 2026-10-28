import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import * as queries from "../src/db/repositories/environment/queries";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(url);
  const { db, pool } = createDatabaseConnection(url);
  let comparisons = 0;
  function orderedRows<T extends { id: string }>(actual: T[], expected: T[], key: keyof T, name: string) {
    // Preserve primary ordering; equal keys have no secondary legacy contract.
    assert.deepEqual(actual.map(row => row[key]), expected.map(row => row[key]), `${name}: ordering`);
    assert.deepEqual([...actual].sort((a, b) => a.id.localeCompare(b.id)), [...expected].sort((a, b) => a.id.localeCompare(b.id)), `${name}: complete rows`);
    comparisons++;
  }
  try {
    assert.deepEqual(await queries.getEnvironmentTotals(db), { totalEnterprises: await legacy.envEnterprise.count(), totalLicenses: await legacy.envLicense.count(), totalComplaints: await legacy.envComplaint.count(), totalGreenAreas: await legacy.envGreenArea.count() });
    comparisons++;
    orderedRows(await queries.listEnterpriseOptions(db), await legacy.envEnterprise.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }), "name", "Enterprise options");
    for (const filters of [{}, { atividade: "com", risco: "Baixo", status: "Ativo" }, { atividade: "%_", risco: "Alto" }]) {
      orderedRows(await queries.listEnterprises(db, filters), await legacy.envEnterprise.findMany({ where: { ...(filters.atividade ? { activityType: { contains: filters.atividade, mode: "insensitive" } } : {}), ...(filters.risco ? { potentialRisk: filters.risco } : {}), ...(filters.status ? { status: filters.status } : {}) }, orderBy: { createdAt: "desc" } }), "createdAt", "Enterprises");
    }
    for (const filters of [{}, { status: "Emitida" }, { status: "missing-status" }]) {
      orderedRows(await queries.listLicenses(db, filters), await legacy.envLicense.findMany({ where: filters.status ? { status: filters.status } : {}, include: { enterprise: true }, orderBy: { createdAt: "desc" } }), "createdAt", "Licenses");
    }
    for (const filters of [{}, { tipo: "poda", status: "Solicitado" }]) {
      orderedRows(await queries.listRequests(db, filters), await legacy.envRequest.findMany({ where: { ...(filters.tipo ? { requestType: { contains: filters.tipo, mode: "insensitive" } } : {}), ...(filters.status ? { status: filters.status } : {}) }, orderBy: { createdAt: "desc" } }), "createdAt", "Requests");
      orderedRows(await queries.listComplaints(db, filters), await legacy.envComplaint.findMany({ where: { ...(filters.tipo ? { complaintType: { contains: filters.tipo, mode: "insensitive" } } : {}), ...(filters.status ? { status: filters.status } : {}) }, orderBy: { createdAt: "desc" } }), "createdAt", "Complaints");
    }
    for (const filters of [{}, { status: "Agendada" }]) {
      orderedRows(await queries.listInspections(db, filters), await legacy.envInspection.findMany({ where: filters.status ? { status: filters.status } : {}, include: { enterprise: true }, orderBy: { dateScheduled: "desc" } }), "dateScheduled", "Inspections");
    }
    for (const filters of [{}, { status: "Preservado" }]) {
      orderedRows(await queries.listGreenAreas(db, filters), await legacy.envGreenArea.findMany({ where: filters.status ? { status: filters.status } : {}, orderBy: { name: "asc" } }), "name", "Green areas");
    }
    for (const filters of [{}, { tipo: "recicl" }]) {
      orderedRows(await queries.listWastes(db, filters), await legacy.envWaste.findMany({ where: filters.tipo ? { wasteType: { contains: filters.tipo, mode: "insensitive" } } : {}, include: { enterprise: true }, orderBy: { date: "desc" } }), "date", "Waste");
    }
    for (const filters of [{}, { status: "Planejado" }]) {
      orderedRows(await queries.listEducationPrograms(db, filters), await legacy.envEduProgram.findMany({ where: filters.status ? { status: filters.status } : {}, orderBy: { startDate: "desc" } }), "startDate", "Education programs");
    }
    for (const filters of [{}, { tipo: "Relatório" }]) {
      orderedRows(await queries.listDocuments(db, filters), await legacy.envDocument.findMany({ where: filters.tipo ? { docType: filters.tipo } : {}, include: { enterprise: true }, orderBy: { createdAt: "desc" } }), "createdAt", "Documents");
    }
    assert.deepEqual(await queries.listIssuedLicenses(db), await legacy.environmentalLicense.findMany({ orderBy: { createdAt: "desc" }, take: 15 }));
    comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "All environment page queries, filters, complete nullable relations and legacy issued licenses" }, null, 2));
  } finally { await legacy.$disconnect(); await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
