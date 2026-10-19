import assert from "node:assert/strict";
import test from "node:test";
import { buildTransparencyDiscovery, isTransparencyConsultation, searchTransparencyDiscovery } from "../src/lib/transparencia/discovery";
import { publishedTransparencyCatalog } from "../src/lib/transparencia/consultation-service";
import { defaultTransparencySettings } from "../src/lib/transparencia/presentation-settings";
import { parseTransparencyQuery } from "../src/lib/transparencia/query-contract";

test("entrada temática não captura URLs antigas de consulta ou filtros", () => {
  assert.equal(isTransparencyConsultation({}), false);
  assert.equal(isTransparencyConsultation({ utm_source: "prefeitura" }), false);
  for (const params of [{ view: "receitas" }, { search: "saúde" }, { year: "2025" }, { "f.group": "Saúde" }, { record: "registro-1" }, { entity: ["prefeitura", "camara"] }]) {
    assert.equal(isTransparencyConsultation(params), true);
  }
});

test("descoberta e busca respeitam catálogo publicado, títulos e ordem editorial", () => {
  const settings = defaultTransparencySettings();
  settings.queries = { contratos: { enabled: false }, servidores: { enabled: true, title: "Folha municipal", order: 1 }, diarias: { enabled: true, order: 2 } };
  const sections = buildTransparencyDiscovery(publishedTransparencyCatalog(settings), settings);
  const items = sections.flatMap(section => section.items);
  assert.ok(!items.some(item => item.id === "contratos"));
  assert.equal(searchTransparencyDiscovery(sections, "contratos").some(result => result.item.id === "contratos"), false);
  assert.equal(items.find(item => item.id === "servidores")?.title, "Folha municipal");
  assert.ok(items.findIndex(item => item.id === "servidores") < items.findIndex(item => item.id === "diarias"));
});

test("destinos respeitam entidade habilitada e origem documental das consultas personalizadas", () => {
  const settings = defaultTransparencySettings();
  settings.entities[0].enabled = false;
  settings.defaultSource = "NATIVO";
  settings.customQueries = [{ slug: "doc-plano-saude", title: "Plano municipal de saúde", group: "Planos setoriais", description: "Planejamento publicado", enabled: true }];
  const sections = buildTransparencyDiscovery(publishedTransparencyCatalog(settings), settings);
  const items = sections.flatMap(section => section.items);
  for (const slug of ["doc-plano-saude", "publicacoes", "receitas"]) {
    const item = items.find(item => item.id === slug)!;
    const params = new URL(item.href, "https://example.com").searchParams;
    const query = parseTransparencyQuery(params);
    assert.equal(query.entity, "camara");
    assert.equal(query.source, slug === "receitas" ? "NATIVO" : "DOCUMENTOS");
    assert.ok(settings.availableYears.includes(query.year));
    assert.equal(params.get("view"), slug);
  }
  assert.ok(sections.find(section => section.id === "outros-assuntos")?.items.some(item => item.id === "doc-plano-saude"));
  assert.ok(searchTransparencyDiscovery(sections, "Planos setoriais").some(result => result.item.id === "doc-plano-saude"));
});

test("busca aceita acentos, sinônimos, vários termos e mantém acesso aos serviços", () => {
  const settings = defaultTransparencySettings();
  const sections = buildTransparencyDiscovery(publishedTransparencyCatalog(settings), settings);
  assert.ok(searchTransparencyDiscovery(sections, "SALÁRIOS").some(result => result.item.id === "servidores"));
  assert.ok(searchTransparencyDiscovery(sections, "remédios farmacia").some(result => result.item.id === "medicamentos"));
  assert.ok(searchTransparencyDiscovery(sections, "e-sic").some(result => result.item.href === "/portal/acesso-informacao"));
  assert.deepEqual(searchTransparencyDiscovery(sections, "   "), []);
  assert.deepEqual(searchTransparencyDiscovery(sections, "termo-inexistente-xyz"), []);
});
