import assert from "node:assert/strict";
import { config } from "dotenv";
import * as queries from "../src/db/repositories/administration/queries";
import type { AdministrativeUnitRecord, DepartmentRecord, EmployeeRecord, RoleRecord, SecretariatRecord } from "../src/lib/contracts/administration";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const oracle = openReadOnlySqlOracle(sqlOracleUrl()), { db, pool } = oracle;
  let comparisons = 0;
  const check = (actual: unknown, expected: unknown, name: string) => { assert.deepEqual(actual, expected, name); comparisons++; };
  try {
    const secretariats = await oracle.rows<SecretariatRecord>('SELECT * FROM "Secretariat" ORDER BY name ASC');
    const departments = await oracle.rows<DepartmentRecord>('SELECT * FROM "Department" ORDER BY name ASC');
    const units = await oracle.rows<AdministrativeUnitRecord>('SELECT * FROM "AdministrativeUnit" ORDER BY name ASC');
    const employees = await oracle.rows<EmployeeRecord>('SELECT * FROM "Employee" ORDER BY name ASC');
    const roles = await oracle.rows<RoleRecord>('SELECT * FROM "Role" ORDER BY name ASC');
    check(await queries.listSecretariats(db), secretariats, "Secretariats");
    check(await queries.listSecretariatDetails(db), secretariats.map(row => {
      const manager = employees.find(employee => employee.id === row.managerId), role = roles.find(role => role.id === manager?.roleId);
      return { ...row, manager: manager ? { id: manager.id, name: manager.name, registration: manager.registration, isActive: manager.isActive, role: role ? { name: role.name } : null } : null, _count: { departments: departments.filter(department => department.secretariatId === row.id).length } };
    }), "Secretariat details");
    const managers = await oracle.rows<{ id: string; name: string; registration: string | null; secretariatId: string | null; roleName: string }>('SELECT e.id,e.name,e.registration,e."secretariatId",r.name AS "roleName" FROM "Employee" e JOIN "Role" r ON r.id=e."roleId" WHERE e."isActive" AND r."isActive" ORDER BY e.name ASC');
    check(await queries.listManagerOptions(db), managers.map(({ roleName, ...row }) => ({ ...row, role: { name: roleName } })), "Manager options");
    const unassigned = await oracle.rows<{ id: string; name: string; roleName: string }>('SELECT e.id,e.name,r.name AS "roleName" FROM "Employee" e JOIN "Role" r ON r.id=e."roleId" WHERE e."isActive" AND r."isActive" AND e."secretariatId" IS NULL AND e."departmentId" IS NULL AND e."unitId" IS NULL ORDER BY e.name ASC');
    check(await queries.listUnassignedManagerOptions(db), unassigned.map(({ roleName, ...row }) => ({ ...row, role: { name: roleName } })), "Unassigned manager options");
    check(await queries.listDepartments(db), departments, "Departments");
    check(await queries.listDepartmentDetails(db), departments.map(row => ({ ...row, secretariat: secretariats.find(item => item.id === row.secretariatId) })), "Department details");
    check(await queries.listUnits(db), units, "Units");
    check(await queries.listUnitDetails(db), units.map(row => ({ ...row, secretariat: secretariats.find(item => item.id === row.secretariatId) })), "Unit details");
    check(await queries.listActiveSecretariatOptions(db, true), secretariats.filter(row => row.isActive).map(({ id, name }) => ({ id, name })), "Ordered active secretariats");
    // These legacy option queries have no ordering contract. Compare membership.
    const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    check(byId(await queries.listActiveSecretariatOptions(db)), byId(secretariats.filter(row => row.isActive).map(({ id, name }) => ({ id, name }))), "Active secretariats");
    check(await queries.listRoles(db), roles, "Roles");
    const actualRoles = await queries.listRoleDetails(db);
    const expectedRoles = roles.map(role => ({ ...role, _count: { employees: employees.filter(employee => employee.roleId === role.id).length } }));
    // Duplicate names have no secondary ordering in the existing contract.
    // Verify the promised order, then compare every complete row by identity.
    check(actualRoles.map(role => role.name), expectedRoles.map(role => role.name), "Role details name ordering");
    check(byId(actualRoles), byId(expectedRoles), "Role details complete rows");
    check(await queries.listEmployeeDetails(db), employees.map(row => ({ ...row, role: roles.find(role => role.id === row.roleId) ?? null, secretariat: secretariats.find(item => item.id === row.secretariatId) ?? null, department: departments.find(item => item.id === row.departmentId) ?? null })), "Employee details");
    check(byId(await queries.listActiveRoleOptions(db)), byId(roles.filter(row => row.isActive).map(({ id, name }) => ({ id, name }))), "Active roles");
    check(byId(await queries.listActiveDepartmentOptions(db)), byId(departments.filter(row => row.isActive).map(({ id, name, secretariatId }) => ({ id, name, secretariatId }))), "Active departments");
    check(await queries.listCalendarEvents(db), await oracle.rows('SELECT * FROM "CalendarEvent" ORDER BY date ASC'), "Calendar events");
    check(await queries.findFirstInstitution(db), await oracle.first('SELECT * FROM "Institution" LIMIT 1'), "Institution");
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "All Administration page queries; complete projections, relations, dates and nulls" }, null, 2));
  } finally { await pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
