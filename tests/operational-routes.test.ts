import assert from "node:assert/strict";
import test from "node:test";
import { operationalModules } from "../src/components/app-ui/operational/modules";
import { findOperationalRoute, findOperationalShell } from "../src/components/app-ui/operational/routes";

test("the module menu remains the same in list, management and nested form routes", () => {
  for (const [base, form] of [
    ["/rh/publicacao-funcional", "/rh/servidores/123/editar"],
    ["/compras/contratos", "/compras/contratos/123"],
    ["/protocolos/processos", "/protocolos/processos/123"],
    ["/financeiro/empenhos", "/financeiro/empenhos/novo"],
    ["/tributacao/imoveis", "/tributacao/imoveis/123/perfil"],
    ["/educacao/escolas", "/educacao/matriculas"],
    ["/transparencia/noticias", "/transparencia/apresentacao"],
    ["/portal-servidor/folha", "/portal-servidor/seguranca"],
    ["/controle-interno/consultas/rh", "/controle-interno"],
  ]) {
    const list = findOperationalShell(operationalModules, base);
    const detail = findOperationalShell(operationalModules, form);
    assert.ok(list, base);
    assert.equal(detail?.module.key, list.module.key, form);
    assert.deepEqual(detail.module.navigation, list.module.navigation);
  }
  assert.equal(findOperationalRoute(operationalModules, "/rh/publicacao-funcional", new URLSearchParams("view=manage")), null);
  assert.equal(findOperationalShell(operationalModules, "/rh/publicacao-funcional")?.module.key, "rh");
});

test("specialized owners and public boundaries are preserved", () => {
  assert.equal(findOperationalShell(operationalModules, "/camara/planejamento/ppa/123/editar")?.module.key, "compartilhados-planejamento-camara");
  assert.equal(findOperationalShell(operationalModules, "/cemiterios/complementos")?.module.key, "cemiterios");
  assert.equal(findOperationalShell(operationalModules, "/rh-outro"), null);
  assert.equal(findOperationalShell(operationalModules, "/portal/portaldatransparencia"), null);
  assert.equal(findOperationalShell(operationalModules, "/dashboard"), null);
  assert.equal(findOperationalShell(operationalModules, "/iluminacao-publica")?.module.key, "iluminacao-publica");
  assert.equal(findOperationalRoute(operationalModules, "/rh/pasta-funcional/123", new URLSearchParams())?.module.key, "rh");
});
