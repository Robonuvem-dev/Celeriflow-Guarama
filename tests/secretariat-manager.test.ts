import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { employees, roles, secretariats } from "../src/db/schema/administration";
import { assertManagerEmployeeChange, resolveSecretariatManager } from "../src/lib/administration/secretariat-manager";

test("responsável é servidor cadastrado com cargo e lotação válida; alterações preservam o vínculo", { timeout: 300000 }, async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  try {
    for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    const [role] = await db.insert(roles).values({ name: "Secretário Municipal de Educação" }).returning();
    const [education] = await db.insert(secretariats).values({ name: "Educação" }).returning();
    const [health] = await db.insert(secretariats).values({ name: "Saúde" }).returning();
    const [employee] = await db.insert(employees).values({ name: "Antônio Nunes", roleId: role.id, secretariatId: education.id }).returning();
    const manager = await db.transaction(tx => resolveSecretariatManager(tx, education.id, employee.id));
    await db.update(secretariats).set(manager).where(eq(secretariats.id, education.id));
    const [appointed] = await db.select({ managerId: secretariats.managerId, employeeId: employees.id }).from(secretariats).leftJoin(employees, eq(secretariats.managerId, employees.id)).where(eq(secretariats.id, education.id));
    assert.equal(appointed.employeeId, employee.id);
    await assert.rejects(db.transaction(tx => resolveSecretariatManager(tx, health.id, employee.id)), /lotado nesta secretaria/);
    await assert.rejects(db.transaction(tx => assertManagerEmployeeChange(tx, employee.id, { isActive: false })), /Substitua/);
    await assert.rejects(db.transaction(tx => assertManagerEmployeeChange(tx, employee.id, { secretariatId: health.id })), /lotação/);
    await assert.rejects(db.transaction(tx => assertManagerEmployeeChange(tx, employee.id, { roleId: null })), /cargo ativo/);
    const [unassigned] = await db.insert(employees).values({ name: "Bruna Almeida", roleId: role.id }).returning();
    await db.transaction(tx => resolveSecretariatManager(tx, health.id, unassigned.id));
    const [assigned] = await db.select().from(employees).where(eq(employees.id, unassigned.id));
    assert.equal(assigned.secretariatId, health.id);
    const [inactive] = await db.insert(employees).values({ name: "Servidor inativo", isActive: false }).returning();
    await assert.rejects(db.transaction(tx => resolveSecretariatManager(tx, education.id, inactive.id)), /servidor ativo/);
  } finally { await fixture.close(); }
});
