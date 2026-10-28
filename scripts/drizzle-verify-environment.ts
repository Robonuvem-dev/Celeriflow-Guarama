import assert from "node:assert/strict";
import { config } from "dotenv";
import * as queries from "../src/db/repositories/environment/queries";
import type { EnvironmentComplaint, EnvironmentDocument, EnvironmentEducationProgram, EnvironmentEnterprise, EnvironmentGreenArea, EnvironmentInspection, EnvironmentLicense, EnvironmentRequest, EnvironmentWaste } from "../src/lib/contracts/environment";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const oracle = openReadOnlySqlOracle(sqlOracleUrl()), { db, pool } = oracle;
  let comparisons = 0;
  function orderedRows<T extends { id: string }, U extends { id: string }>(actual: T[], expected: U[], key: keyof T & keyof U, name: string) {
    // Preserve primary ordering; equal keys have no secondary legacy contract.
    assert.deepEqual(actual.map(row => row[key]), expected.map(row => row[key]), `${name}: ordering`);
    assert.deepEqual([...actual].sort((a, b) => a.id.localeCompare(b.id)), [...expected].sort((a, b) => a.id.localeCompare(b.id)), `${name}: complete rows`);
    comparisons++;
  }
  try {
    const enterprises = await oracle.rows<EnvironmentEnterprise>('SELECT * FROM "EnvEnterprise"');
    const enterprise = (id: string | null) => enterprises.find(row => row.id === id) ?? null;
    assert.deepEqual(await queries.getEnvironmentTotals(db), { totalEnterprises: await oracle.scalarCount('SELECT count(*)::int AS count FROM "EnvEnterprise"'), totalLicenses: await oracle.scalarCount('SELECT count(*)::int AS count FROM "EnvLicense"'), totalComplaints: await oracle.scalarCount('SELECT count(*)::int AS count FROM "EnvComplaint"'), totalGreenAreas: await oracle.scalarCount('SELECT count(*)::int AS count FROM "EnvGreenArea"') });
    comparisons++;
    orderedRows(await queries.listEnterpriseOptions(db), await oracle.rows<{ id: string; name: string }>('SELECT id,name FROM "EnvEnterprise" ORDER BY name ASC'), "name", "Enterprise options");
    for (const filters of [{}, { atividade: "com", risco: "Baixo", status: "Ativo" }, { atividade: "%_", risco: "Alto" }]) {
      orderedRows(await queries.listEnterprises(db, filters), await oracle.rows<EnvironmentEnterprise>('SELECT * FROM "EnvEnterprise" WHERE ($1::text IS NULL OR "activityType" ILIKE $1) AND ($2::text IS NULL OR "potentialRisk"=$2) AND ($3::text IS NULL OR status=$3) ORDER BY "createdAt" DESC', [filters.atividade ? `%${filters.atividade}%` : null, filters.risco || null, filters.status || null]), "createdAt", "Enterprises");
    }
    for (const filters of [{}, { status: "Emitida" }, { status: "missing-status" }]) {
      const rows = await oracle.rows<EnvironmentLicense>('SELECT * FROM "EnvLicense" WHERE ($1::text IS NULL OR status=$1) ORDER BY "createdAt" DESC', [filters.status || null]);
      orderedRows(await queries.listLicenses(db, filters), rows.map(row => ({ ...row, enterprise: enterprise(row.enterpriseId) })), "createdAt", "Licenses");
    }
    for (const filters of [{}, { tipo: "poda", status: "Solicitado" }]) {
      orderedRows(await queries.listRequests(db, filters), await oracle.rows<EnvironmentRequest>('SELECT * FROM "EnvRequest" WHERE ($1::text IS NULL OR "requestType" ILIKE $1) AND ($2::text IS NULL OR status=$2) ORDER BY "createdAt" DESC', [filters.tipo ? `%${filters.tipo}%` : null, filters.status || null]), "createdAt", "Requests");
      orderedRows(await queries.listComplaints(db, filters), await oracle.rows<EnvironmentComplaint>('SELECT * FROM "EnvComplaint" WHERE ($1::text IS NULL OR "complaintType" ILIKE $1) AND ($2::text IS NULL OR status=$2) ORDER BY "createdAt" DESC', [filters.tipo ? `%${filters.tipo}%` : null, filters.status || null]), "createdAt", "Complaints");
    }
    for (const filters of [{}, { status: "Agendada" }]) {
      const rows = await oracle.rows<EnvironmentInspection>('SELECT * FROM "EnvInspection" WHERE ($1::text IS NULL OR status=$1) ORDER BY "dateScheduled" DESC', [filters.status || null]);
      orderedRows(await queries.listInspections(db, filters), rows.map(row => ({ ...row, enterprise: enterprise(row.enterpriseId) })), "dateScheduled", "Inspections");
    }
    for (const filters of [{}, { status: "Preservado" }]) {
      orderedRows(await queries.listGreenAreas(db, filters), await oracle.rows<EnvironmentGreenArea>('SELECT * FROM "EnvGreenArea" WHERE ($1::text IS NULL OR status=$1) ORDER BY name ASC', [filters.status || null]), "name", "Green areas");
    }
    for (const filters of [{}, { tipo: "recicl" }]) {
      const rows = await oracle.rows<EnvironmentWaste>('SELECT * FROM "EnvWaste" WHERE ($1::text IS NULL OR "wasteType" ILIKE $1) ORDER BY date DESC', [filters.tipo ? `%${filters.tipo}%` : null]);
      orderedRows(await queries.listWastes(db, filters), rows.map(row => ({ ...row, enterprise: enterprise(row.enterpriseId) })), "date", "Waste");
    }
    for (const filters of [{}, { status: "Planejado" }]) {
      orderedRows(await queries.listEducationPrograms(db, filters), await oracle.rows<EnvironmentEducationProgram>('SELECT * FROM "EnvEduProgram" WHERE ($1::text IS NULL OR status=$1) ORDER BY "startDate" DESC', [filters.status || null]), "startDate", "Education programs");
    }
    for (const filters of [{}, { tipo: "Relatório" }]) {
      const rows = await oracle.rows<EnvironmentDocument>('SELECT * FROM "EnvDocument" WHERE ($1::text IS NULL OR "docType"=$1) ORDER BY "createdAt" DESC', [filters.tipo || null]);
      orderedRows(await queries.listDocuments(db, filters), rows.map(row => ({ ...row, enterprise: enterprise(row.enterpriseId) })), "createdAt", "Documents");
    }
    assert.deepEqual(await queries.listIssuedLicenses(db), await oracle.rows('SELECT * FROM "EnvironmentalLicense" ORDER BY "createdAt" DESC LIMIT 15'));
    comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "All environment page queries, filters, complete nullable relations and issued licenses" }, null, 2));
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
