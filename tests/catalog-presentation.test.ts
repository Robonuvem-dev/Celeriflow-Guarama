import assert from "node:assert/strict";
import test from "node:test";
import { currentPresentationEntries } from "../src/lib/planejamento/catalog-presentation";

const original = { id: "original", kind: "ACCOUNT", code: "1.1", name: "Disponibilidades", canonicalId: "account", parentCode: null, degree: 1, attributes: { pocOnly: true, postingAllowed: false, effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" }, version: { year: 2026 } };
const revision = { ...original, id: "revision", attributes: { ...original.attributes, presentationPredecessorEntryId: original.id, presentationPredecessorVersionId: "source", presentationEffectiveFrom: "2026-10-14" } };
test("revisão de nome mantém vigência histórica e edição atual única", () => {
  assert.deepEqual(currentPresentationEntries([original, revision], "2026-10-13").map(row => row.id), ["original"]);
  assert.deepEqual(currentPresentationEntries([original, revision], "2026-10-14").map(row => row.id), ["revision"]);
});
test("revisão de apresentação não autoriza escrituração nem muda alcance", () => {
  assert.throws(() => currentPresentationEntries([original, { ...revision, attributes: { ...revision.attributes, postingAllowed: true } }], "2026-10-14"), /semântica/);
  assert.throws(() => currentPresentationEntries([original, { ...revision, attributes: { ...revision.attributes, governmentEntityId: "outro" } }], "2026-10-14"), /semântica/);
});
test("adoção municipal que já sucedia a referência continua prevalecendo", () => {
  const adopted = { ...original, id: "adopted", attributes: { ...original.attributes, operational: true, pocOnly: false, predecessorEntryId: original.id } };
  const current = currentPresentationEntries([original, revision, adopted], "2026-10-14");
  const predecessors = current.flatMap(row => "predecessorEntryId" in row.attributes ? [row.attributes.predecessorEntryId] : []);
  assert.deepEqual(current.filter(row => !predecessors.includes(row.id)).map(row => row.id), ["adopted"]);
});
