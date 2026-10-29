import assert from "node:assert/strict";
import test from "node:test";
import { writeDiscoveryLinkDrafts } from "../src/components/transparencia/discovery-link-drafts";

const link = (index: number) => ({ id: `link-${index}`, title: `Destino ${index}`, sectionId: "receitas", description: `Descrição ${index}`, href: `/portal/documento-${index}`, responsible: "Equipe do portal", reviewedAt: "2026-10-29", order: index, enabled: true });

test("envia edições fora da página visível e todo o rascunho de 21 destinos", () => {
  const links = Array.from({ length: 21 }, (_, index) => link(index));
  links[0] = { ...links[0], title: "Editado antes de trocar a página", href: "https://portal.exemplo.gov.br/novo" };
  links[20] = { ...links[20], description: "Edição na segunda página", enabled: false, order: 99 };
  const form = new FormData();
  form.set("version", "versao-original");
  form.append("shortcuts", "link-0");
  writeDiscoveryLinkDrafts(form, links);
  assert.equal(form.getAll("linkIds").length, 21);
  assert.equal(form.get("link-0.title"), "Editado antes de trocar a página");
  assert.equal(form.get("link-0.href"), "https://portal.exemplo.gov.br/novo");
  assert.equal(form.get("link-20.description"), "Edição na segunda página");
  assert.equal(form.get("link-20.order"), "99");
  assert.equal(form.has("link-20.enabled"), false);
  assert.equal(form.get("link-0.enabled"), "on");
  assert.equal(form.get("version"), "versao-original");
  assert.deepEqual(form.getAll("shortcuts"), ["link-0"]);
});

test("remoção não ressuscita controles antigos e não duplica IDs ao serializar novamente", () => {
  const form = new FormData();
  writeDiscoveryLinkDrafts(form, [link(0), link(1)]);
  writeDiscoveryLinkDrafts(form, [{ ...link(1), responsible: "Responsável revisado", enabled: false }]);
  assert.deepEqual(form.getAll("linkIds"), ["link-1"]);
  assert.equal(form.has("link-0.title"), false);
  assert.equal(form.has("link-0.enabled"), false);
  assert.equal(form.get("link-1.responsible"), "Responsável revisado");
  assert.equal(form.has("link-1.enabled"), false);
});
