import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { createDatabaseConnection } from "../src/db/connection";
import { listActiveConstructionRoles, listConstructionPropertyUpdates } from "../src/db/repositories/registry/construction-updates";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  // Execute the trusted original read-only module without changing tracked code.
  const original = execFileSync("git", ["show", "3f05dcd:src/lib/obras/construction-lifecycle-list.ts"], { encoding: "utf8" });
  const compiled = ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { listConstructionPropertyUpdates?: (...args: unknown[]) => Promise<unknown> } = {};
  new Function("exports", "require", compiled)(exports, (id: string) => { assert.equal(id, "@prisma/client"); return { Prisma }; });
  assert.ok(exports.listConstructionPropertyUpdates);
  let comparisons = 0;
  try {
    const departments = await legacy.department.findMany({ select: { id: true }, take: 4 });
    const accesses = [true, false].flatMap(administrator => [null, "missing-drizzle-department", ...departments.map(row => row.id)].map(departmentId => ({ administrator, employeeId: null, departmentId, roles: [] })));
    for (const access of accesses) for (const query of [{}, { status: "PENDING" }, { status: "APPLIED", page: "999" }, { q: "100%" }, { q: "_" }, { q: "' OR 1=1 --" }]) {
      const actual = await listConstructionPropertyUpdates(connection.db, access, query);
      const expected = await exports.listConstructionPropertyUpdates(legacy, access, query);
      assert.deepEqual(actual, expected);
      comparisons++;
    }
    const employees = await legacy.employee.findMany({ where: { departmentId: { not: null } }, select: { id: true, departmentId: true }, take: 25 });
    for (const today of [new Date("2026-10-28T00:00:00Z"), new Date("2024-01-01T00:00:00Z")]) for (const employee of employees) {
      const expected = await legacy.constructionStaffRole.findMany({ where: { employeeId: employee.id, departmentId: employee.departmentId!, isActive: true, employee: { isActive: true, departmentId: employee.departmentId! }, department: { isActive: true }, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] }, select: { role: true } });
      assert.deepEqual((await listActiveConstructionRoles(connection.db, employee.id, employee.departmentId!, today)).sort(), expected.map(row => row.role).sort());
      comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "Cadastral/construction updates: administrator/sector scopes, filters, pagination and roles by effective date" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
