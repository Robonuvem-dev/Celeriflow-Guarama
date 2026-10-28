import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { employees } from "../src/db/schema/administration";
import { modules } from "../src/db/schema/identity";
import { AccessError } from "../src/lib/platform/tenant-context";
import { assertEmployeePortalLogin } from "../src/lib/portal-servidor/login-policy";
import { createEmployeePortalFixture, employeePortalUser } from "./helpers/employee-portal-fixture";

async function fixture(active = true, moduleActive = true) {
  const fixture = await createEmployeePortalFixture("login"), db = fixture.connection.db;
  try {
    await db.insert(modules).values({ codigo: "PORTAL_SERVIDOR", nome: "Portal do Servidor", ativo: moduleActive });
    await db.insert(employees).values([{ id: "own-employee", name: "Titular", isActive: active }, { id: "other-employee", name: "Outro servidor", isActive: true }]);
    return { ...fixture, db, user: employeePortalUser() };
  } catch (error) { await fixture.close(); throw error; }
}

test("login funcional consulta somente o cadastro ativo vinculado à identidade verificada", async () => {
  const { db, user, close } = await fixture();
  try {
    assert.deepEqual(await assertEmployeePortalLogin(db, user), { id: "own-employee" });
    await db.delete(employees).where(eq(employees.id, "own-employee"));
    await assert.rejects(assertEmployeePortalLogin(db, user), error => error instanceof AccessError && error.status === 403);
  } finally { await close(); }
});

test("cadastro inativo é recusado antes da criação de sessão funcional", async () => {
  const { db, user, close } = await fixture(false);
  try { await assert.rejects(assertEmployeePortalLogin(db, user), error => error instanceof AccessError && error.status === 403); }
  finally { await close(); }
});

test("módulo inativo, perfil bloqueado e conta sem vínculo não consultam registros funcionais", async () => {
  const { db, user, close } = await fixture(true, false);
  try {
    // A functional query would now fail with a database error. Each refusal must
    // therefore happen at the authorization boundary before touching Employee.
    await db.execute(sql`DROP TABLE "Employee"`);
    await assert.rejects(assertEmployeePortalLogin(db, user), error => error instanceof AccessError && error.status === 423);
    await db.update(modules).set({ ativo: true }).where(eq(modules.codigo, "PORTAL_SERVIDOR"));
    await assert.rejects(assertEmployeePortalLogin(db, { ...user, permissions: JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: true } } }) }), /autorização funcional/);
    await assert.rejects(assertEmployeePortalLogin(db, { ...user, employeeId: null }), /autorização funcional/);
  } finally { await close(); }
});
