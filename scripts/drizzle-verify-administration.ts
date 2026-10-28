import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import * as queries from "../src/db/repositories/administration/queries";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(url);
  const { db, pool } = createDatabaseConnection(url);
  let comparisons = 0;
  const check = (actual: unknown, expected: unknown, name: string) => { assert.deepEqual(actual, expected, name); comparisons++; };
  try {
    check(await queries.listSecretariats(db), await legacy.secretariat.findMany({ orderBy: { name: "asc" } }), "Secretariats");
    check(await queries.listSecretariatDetails(db), await legacy.secretariat.findMany({ orderBy: { name: "asc" }, include: { manager: { select: { id: true, name: true, registration: true, isActive: true, role: { select: { name: true } } } }, _count: { select: { departments: true } } } }), "Secretariat details");
    check(await queries.listManagerOptions(db), await legacy.employee.findMany({ where: { isActive: true, role: { isActive: true } }, select: { id: true, name: true, registration: true, secretariatId: true, role: { select: { name: true } } }, orderBy: { name: "asc" } }), "Manager options");
    check(await queries.listUnassignedManagerOptions(db), await legacy.employee.findMany({ where: { isActive: true, secretariatId: null, departmentId: null, unitId: null, role: { isActive: true } }, select: { id: true, name: true, role: { select: { name: true } } }, orderBy: { name: "asc" } }), "Unassigned manager options");
    check(await queries.listDepartments(db), await legacy.department.findMany({ orderBy: { name: "asc" } }), "Departments");
    check(await queries.listDepartmentDetails(db), await legacy.department.findMany({ orderBy: { name: "asc" }, include: { secretariat: true } }), "Department details");
    check(await queries.listUnits(db), await legacy.administrativeUnit.findMany({ orderBy: { name: "asc" } }), "Units");
    check(await queries.listUnitDetails(db), await legacy.administrativeUnit.findMany({ orderBy: { name: "asc" }, include: { secretariat: true } }), "Unit details");
    check(await queries.listActiveSecretariatOptions(db, true), await legacy.secretariat.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), "Ordered active secretariats");
    // These legacy option queries have no ordering contract. Compare membership.
    const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    check(byId(await queries.listActiveSecretariatOptions(db)), byId(await legacy.secretariat.findMany({ where: { isActive: true }, select: { id: true, name: true } })), "Active secretariats");
    check(await queries.listRoles(db), await legacy.role.findMany({ orderBy: { name: "asc" } }), "Roles");
    const actualRoles = await queries.listRoleDetails(db);
    const expectedRoles = await legacy.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
    // Duplicate names have no secondary ordering in the existing contract.
    // Verify the promised order, then compare every complete row by identity.
    check(actualRoles.map(role => role.name), expectedRoles.map(role => role.name), "Role details name ordering");
    check(byId(actualRoles), byId(expectedRoles), "Role details complete rows");
    check(await queries.listEmployeeDetails(db), await legacy.employee.findMany({ orderBy: { name: "asc" }, include: { role: true, secretariat: true, department: true } }), "Employee details");
    check(byId(await queries.listActiveRoleOptions(db)), byId(await legacy.role.findMany({ where: { isActive: true }, select: { id: true, name: true } })), "Active roles");
    check(byId(await queries.listActiveDepartmentOptions(db)), byId(await legacy.department.findMany({ where: { isActive: true }, select: { id: true, name: true, secretariatId: true } })), "Active departments");
    check(await queries.listCalendarEvents(db), await legacy.calendarEvent.findMany({ orderBy: { date: "asc" } }), "Calendar events");
    check(await queries.findFirstInstitution(db), await legacy.institution.findFirst(), "Institution");
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "All Administration page queries; complete projections, relations, dates and nulls" }, null, 2));
  } finally { await legacy.$disconnect(); await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
