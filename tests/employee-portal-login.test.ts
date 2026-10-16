import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { AccessError, type AppContext } from "../src/lib/platform/tenant-context";
import { assertEmployeePortalLogin } from "../src/lib/portal-servidor/login-policy";

function fixture(active = true, moduleActive = true) {
  const calls: unknown[] = [];
  const db = {
    configuracaoModulo: { findUnique: async () => ({ ativo: moduleActive }) },
    employee: { findFirst: async (query: unknown) => { calls.push(query); return active ? { id: "own-employee" } : null; } },
  } as unknown as PrismaClient;
  const user: AppContext["user"] = { id: "own-user", firebaseUid: "verified-uid", email: "own@example.test", name: "Servidor", role: "Servidor", profileCode: "SERVIDOR", permissions: JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: false } } }), modulePermissions: [], allowedBudgetUnitIds: [], employeeId: "own-employee", departmentId: null, secretariatId: null };
  return { db, user, calls };
}

test("login funcional consulta somente o cadastro ativo vinculado à identidade verificada", async () => {
  const { db, user, calls } = fixture();
  assert.deepEqual(await assertEmployeePortalLogin(db, user), { id: "own-employee" });
  assert.deepEqual(calls, [{ where: { id: "own-employee", isActive: true }, select: { id: true } }]);
});

test("cadastro inativo é recusado antes da criação de sessão funcional", async () => {
  const { db, user } = fixture(false);
  await assert.rejects(assertEmployeePortalLogin(db, user), error => error instanceof AccessError && error.status === 403);
});

test("módulo inativo, perfil bloqueado e conta sem vínculo não consultam registros funcionais", async () => {
  const disabled = fixture(true, false);
  await assert.rejects(assertEmployeePortalLogin(disabled.db, disabled.user), error => error instanceof AccessError && error.status === 423);
  assert.equal(disabled.calls.length, 0);
  const blocked = fixture();
  blocked.user.permissions = JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: true } } });
  await assert.rejects(assertEmployeePortalLogin(blocked.db, blocked.user), /autorização funcional/);
  assert.equal(blocked.calls.length, 0);
  const unlinked = fixture();
  unlinked.user.employeeId = null;
  await assert.rejects(assertEmployeePortalLogin(unlinked.db, unlinked.user), /autorização funcional/);
  assert.equal(unlinked.calls.length, 0);
});
