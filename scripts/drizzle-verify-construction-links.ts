import assert from "node:assert/strict";
import { config } from "dotenv";
import { listActiveConstructionRoles, listConstructionPropertyUpdates } from "../src/db/repositories/registry/construction-updates";
import type { ConstructionAccess, ConstructionPropertyUpdateList, ConstructionPropertyUpdateRecord } from "../src/lib/contracts/construction";
import { literalContains, openReadOnlySqlOracle, sqlOracleUrl, type SqlOracle } from "./sql-oracle";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function expectedUpdates(oracle: SqlOracle, access: ConstructionAccess, query: Record<string, string | undefined>): Promise<ConstructionPropertyUpdateList> {
  const search = (query.q || "").trim().slice(0, 160), status = ["PENDING", "APPLIED"].includes(query.status || "") ? query.status : null;
  const from = `FROM "ConstructionPropertyUpdate" u JOIN "Process" p ON p.id=u."processId" JOIN "ConstructionCompletion" c ON c.id=u."completionId" WHERE ($1::boolean OR p."currentDepartmentId"=$2) AND ($3::text IS NULL OR u.status=$3) AND ($4::text IS NULL OR p."protocolNumber" ILIKE $4 OR c.number ILIKE $4)`;
  const values = [access.administrator, access.departmentId || "__NONE__", status, search ? literalContains(search) : null];
  const total = await oracle.scalarCount(`SELECT count(*)::int AS count ${from}`, values);
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const rows = await oracle.rows<Omit<ConstructionPropertyUpdateRecord, "completion"> & { completionNumber: string; completionKind: string }>(`SELECT u.*,c.number AS "completionNumber",c.kind AS "completionKind" ${from} ORDER BY u."createdAt" DESC,u.id ASC LIMIT 20 OFFSET $5`, [...values, (page - 1) * 20]);
  const updates = rows.map(({ completionNumber, completionKind, ...row }) => ({ ...row, completion: { number: completionNumber, kind: completionKind } }));
  const processes = updates.length ? await oracle.rows<{ id: string; protocolNumber: string }>('SELECT id,"protocolNumber" FROM "Process" WHERE id=ANY($1::text[]) LIMIT 20', [updates.map(row => row.processId)]) : [];
  return { updates, processes, total, page };
}

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  let comparisons = 0;
  try {
    const departments = await connection.rows<{ id: string }>('SELECT id FROM "Department" LIMIT 4');
    const accesses = [true, false].flatMap(administrator => [null, "missing-drizzle-department", ...departments.map(row => row.id)].map(departmentId => ({ administrator, employeeId: null, departmentId, roles: [] })));
    for (const access of accesses) for (const query of [{}, { status: "PENDING" }, { status: "APPLIED", page: "999" }, { q: "100%" }, { q: "_" }, { q: "' OR 1=1 --" }]) {
      const actual = await listConstructionPropertyUpdates(connection.db, access, query);
      const expected = await expectedUpdates(connection, access, query);
      assert.deepEqual(actual, expected);
      comparisons++;
    }
    const employees = await connection.rows<{ id: string; departmentId: string }>('SELECT id,"departmentId" FROM "Employee" WHERE "departmentId" IS NOT NULL LIMIT 25');
    for (const today of [new Date("2026-10-28T00:00:00Z"), new Date("2024-01-01T00:00:00Z")]) for (const employee of employees) {
      const expected = await connection.rows<{ role: string }>('SELECT r.role FROM "ConstructionStaffRole" r JOIN "Employee" e ON e.id=r."employeeId" JOIN "Department" d ON d.id=r."departmentId" WHERE r."employeeId"=$1 AND r."departmentId"=$2 AND r."isActive" AND e."isActive" AND e."departmentId"=$2 AND d."isActive" AND r."startsAt"<=$3::date AND (r."endsAt" IS NULL OR r."endsAt">=$3::date)', [employee.id, employee.departmentId, today.toISOString().slice(0, 10)]);
      assert.deepEqual((await listActiveConstructionRoles(connection.db, employee.id, employee.departmentId, today)).sort(), expected.map(row => row.role).sort());
      comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "Cadastral/construction updates: administrator/sector scopes, literal ILIKE filters, pagination and roles by effective date" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
