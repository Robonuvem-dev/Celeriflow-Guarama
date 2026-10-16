import assert from "node:assert/strict";
import test from "node:test";
import { employeePortalDestination, isEmployeePublicRoute } from "../src/lib/portal-servidor/routes";

test("retorno de login preserva somente destinos funcionais locais", () => {
  assert.equal(employeePortalDestination("/portal-servidor/demonstrativos?competence=10%2F2026&page=2"), "/portal-servidor/demonstrativos?competence=10%2F2026&page=2");
  assert.equal(employeePortalDestination("/portal-servidor?view=consultas"), "/portal-servidor?view=consultas");
  for (const value of [null, "https://outside.example/portal-servidor", "//outside.example/portal-servidor", "/rh", "/portal-servidor-outside", "/portal-servidor/../login", "/portal-servidor/%2e%2e/login", "/portal-servidor/\\outside.example", "/portal-servidor/entrar", "/portal-servidor/recuperar-senha", "/portal-servidor/%2foutside", "/portal-servidor/\nlogin"]) {
    assert.equal(employeePortalDestination(value), "/portal-servidor");
  }
});

test("somente login e recuperação de senha são rotas funcionais públicas", () => {
  assert.equal(isEmployeePublicRoute("/portal-servidor/entrar"), true);
  assert.equal(isEmployeePublicRoute("/portal-servidor/recuperar-senha"), true);
  for (const path of ["/portal-servidor", "/portal-servidor/demonstrativos", "/portal-servidor/seguranca", "/portal-servidor/recuperar-senha-extra"]) assert.equal(isEmployeePublicRoute(path), false);
});
