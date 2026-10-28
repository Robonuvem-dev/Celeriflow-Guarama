import assert from "node:assert/strict";
import { config } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import { createDatabaseConnection } from "../src/db/connection";
import { loadAdministrationBiSource } from "../src/db/repositories/administration/bi";
import type { AdministrationBiSource } from "../src/lib/contracts/administration-bi";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Temporary read-only parity oracle. Remove this legacy client at the final
// Prisma-removal lot, retaining the recorded result and fixture-based tests.
async function legacySource(legacy: PrismaClient, selection: string): Promise<AdministrationBiSource> {
  const [institution, secretariats, departments, roles, demands, unassignedEmployees] = await Promise.all([
    legacy.institution.findFirst({ select: { name: true } }),
    legacy.secretariat.findMany({ orderBy: { name: "asc" }, select: {
      id: true, name: true, acronym: true, isActive: true,
      manager: { select: { name: true, isActive: true, secretariatId: true, role: { select: { name: true, isActive: true } } } },
      _count: { select: { employees: { where: { isActive: true } }, departments: { where: { isActive: true } }, units: { where: { isActive: true } } } },
    } }),
    legacy.department.findMany({ where: { isActive: true, ...(selection ? { secretariatId: selection } : {}) }, select: { id: true, name: true, _count: { select: { employees: { where: { isActive: true } } } } }, orderBy: { name: "asc" } }),
    legacy.$queryRaw<{ name: string; employees: number }[]>`SELECT COALESCE(r.name, 'Sem cargo informado') AS name, count(*)::int AS employees FROM "Employee" e LEFT JOIN "Role" r ON r.id=e."roleId" WHERE e."isActive"=true AND (${selection}='' OR e."secretariatId"=${selection}) GROUP BY r.name ORDER BY count(*) DESC, r.name`,
    legacy.internalDemand.findMany({ select: { secretariatId: true, department: { select: { secretariatId: true } }, status: true, deadline: true, createdAt: true } }),
    legacy.employee.groupBy({ by: ["secretariatId", "isActive"], _count: { _all: true } }),
  ]);
  return { institution, secretariats, departments, roles, demands, unassignedEmployees };
}

function unorderedRows<T>(rows: T[]): T[] {
  const key = (value: unknown) => JSON.stringify(value, (_name, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(url);
  const connection = createDatabaseConnection(url);
  try {
  const options = await legacy.secretariat.findMany({ select: { id: true } });
  const selections = ["", ...options.map(option => option.id), "missing-secretariat"];
  for (const selection of selections) {
    const expected = await legacySource(legacy, selection);
    const actual = await loadAdministrationBiSource(connection.db, selection);
    // No order was promised by these two legacy queries. Ordered collections
    // (departments, secretariats, roles) remain order-sensitive in the assertion.
    expected.demands = unorderedRows(expected.demands);
    actual.demands = unorderedRows(actual.demands);
    expected.unassignedEmployees = unorderedRows(expected.unassignedEmployees);
    actual.unassignedEmployees = unorderedRows(actual.unassignedEmployees);
    assert.deepEqual(actual, expected, `BI parity failed for ${selection || "consolidated"}`);
  }
  console.log(JSON.stringify({ result: "PASS", scopes: selections.length, secretariats: options.length, mode: "READ ONLY", compared: "All six BI source datasets including date/null values, counts, manager/role links and ordered collections" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
