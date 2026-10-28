import assert from "node:assert/strict";
import { config } from "dotenv";
import { loadAdministrationBiSource } from "../src/db/repositories/administration/bi";
import type { AdministrationBiSource } from "../src/lib/contracts/administration-bi";
import { openReadOnlySqlOracle, sqlOracleUrl, type SqlOracle } from "./sql-oracle";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Six independent SQL datasets; expected values never come from the reader.
async function sqlSource(oracle: SqlOracle, selection: string): Promise<AdministrationBiSource> {
  const [institution, secretariats, departments, roles, demands, unassignedEmployees] = await Promise.all([
    oracle.first<{ name: string }>('SELECT name FROM "Institution" LIMIT 1'),
    oracle.rows<AdministrationBiSource["secretariats"][number]>(`SELECT s.id,s.name,s.acronym,s."isActive",
      CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object('name',e.name,'isActive',e."isActive",'secretariatId',e."secretariatId",'role',CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('name',r.name,'isActive',r."isActive") END) END AS manager,
      json_build_object('employees',(SELECT count(*)::int FROM "Employee" x WHERE x."secretariatId"=s.id AND x."isActive"),'departments',(SELECT count(*)::int FROM "Department" d WHERE d."secretariatId"=s.id AND d."isActive"),'units',(SELECT count(*)::int FROM "AdministrativeUnit" u WHERE u."secretariatId"=s.id AND u."isActive")) AS "_count"
      FROM "Secretariat" s LEFT JOIN "Employee" e ON e.id=s."managerId" LEFT JOIN "Role" r ON r.id=e."roleId" ORDER BY s.name ASC`),
    oracle.rows<AdministrationBiSource["departments"][number]>(`SELECT d.id,d.name,json_build_object('employees',(SELECT count(*)::int FROM "Employee" e WHERE e."departmentId"=d.id AND e."isActive")) AS "_count" FROM "Department" d WHERE d."isActive" AND ($1='' OR d."secretariatId"=$1) ORDER BY d.name ASC`, [selection]),
    oracle.rows<AdministrationBiSource["roles"][number]>(`SELECT COALESCE(r.name, 'Sem cargo informado') AS name, count(*)::int AS employees FROM "Employee" e LEFT JOIN "Role" r ON r.id=e."roleId" WHERE e."isActive" AND ($1='' OR e."secretariatId"=$1) GROUP BY r.name ORDER BY count(*) DESC,r.name`, [selection]),
    oracle.rows<AdministrationBiSource["demands"][number]>(`SELECT d."secretariatId",CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('secretariatId',p."secretariatId") END AS department,d.status,d.deadline,d."createdAt" FROM "InternalDemand" d LEFT JOIN "Department" p ON p.id=d."departmentId"`),
    oracle.rows<AdministrationBiSource["unassignedEmployees"][number]>(`SELECT "secretariatId","isActive",json_build_object('_all',count(*)::int) AS "_count" FROM "Employee" GROUP BY "secretariatId","isActive"`),
  ]);
  return { institution, secretariats, departments, roles, demands, unassignedEmployees };
}

function unorderedRows<T>(rows: T[]): T[] {
  const key = (value: unknown) => JSON.stringify(value, (_name, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  try {
   const options = await connection.rows<{ id: string }>('SELECT id FROM "Secretariat"');
  const selections = ["", ...options.map(option => option.id), "missing-secretariat"];
  for (const selection of selections) {
    const expected = await sqlSource(connection, selection);
    const actual = await loadAdministrationBiSource(connection.db, selection);
    // No order was promised by these two legacy queries. Ordered collections
    // (departments, secretariats, roles) remain order-sensitive in the assertion.
    expected.demands = unorderedRows(expected.demands);
    actual.demands = unorderedRows(actual.demands);
    expected.unassignedEmployees = unorderedRows(expected.unassignedEmployees);
    actual.unassignedEmployees = unorderedRows(actual.unassignedEmployees);
    assert.deepEqual(actual, expected, `BI parity failed for ${selection || "consolidated"}`);
  }
   console.log(JSON.stringify({ result: "PASS", scopes: selections.length, secretariats: options.length, mode: "READ ONLY SQL ORACLE", compared: "All six BI source datasets including date/null values, counts, manager/role links and ordered collections" }, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
