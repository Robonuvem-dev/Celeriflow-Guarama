import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, canViewModule, canPerformModuleOperation, type AppContext } from "../src/lib/platform/tenant-context";
import { getSystemAdministrationPageAccess } from "../src/lib/administration/system-administration-page-access";

test("profile page renders an expected access denial without exposing profile data", async () => {
  const result = await getSystemAdministrationPageAccess(async () => { throw new AccessError("Acesso negado ao módulo CONFIGURACOES.", 403); });
  assert.equal(result.allowed, false);
  assert.equal("context" in result, false);
  if (!result.allowed) assert.match(result.message, /CONFIGURACOES/);
});
test("management profile with Configuration access can view profiles while CRUD remains granular", async () => {
  const user: AppContext["user"] = {
    id: "management", firebaseUid: "management", email: "management@example.invalid", name: "Gestão", role: "Gestão", profileCode: "GESTAO_GERAL",
    modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null,
    permissions: JSON.stringify({ modules: { CONFIGURACOES: { blocked: false, create: false, update: true, delete: false } } }),
  };
  assert.equal(canViewModule(user, "CONFIGURACOES"), true);
  assert.equal(canPerformModuleOperation(user, "CONFIGURACOES", "create"), false);
  assert.equal(canPerformModuleOperation(user, "CONFIGURACOES", "update"), true);
  assert.equal(canPerformModuleOperation(user, "CONFIGURACOES", "delete"), false);
  const context = { user } as AppContext;
  assert.deepEqual(await getSystemAdministrationPageAccess(async () => context), { allowed: true, context });
});
test("unexpected database and server errors are not disguised as permission denials", async () => {
  const failure = new Error("Database unavailable");
  await assert.rejects(getSystemAdministrationPageAccess(async () => { throw failure; }), (error) => error === failure);
});
