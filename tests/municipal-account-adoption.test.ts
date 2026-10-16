import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { assertPublishedAccountClassification, resolveAccountClassificationSnapshots } from "../src/lib/financeiro/account-catalog";

test("Classificação municipal sucede referência imutável e opera fora do modo de ensaio; versões conflitantes continuam recusadas", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  try {
    const attributes = { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" };
    const reference = { id: "reference-entry", canonicalId: "cash", version: { year: 2026 }, attributes: { ...attributes, pocOnly: true } };
    const municipal = { id: "municipal-entry", canonicalId: "cash", version: { year: 2026 }, attributes: { ...attributes, operational: true, pocOnly: false, predecessorEntryId: reference.id } };
    const bindings = [reference];
    const tx = { planningCatalogEntry: { findMany: async () => bindings } } as unknown as Prisma.TransactionClient;
    await assert.rejects(assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-03-01")), /modo POC/i);
    bindings.push(municipal);
    await assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-03-01"));
    assert.equal(reference.attributes.pocOnly, true);
    bindings.push({ ...municipal, id: "conflicting-municipal-entry" });
    await assert.rejects(assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-03-01")), /versão vigente única/i);
  } finally {
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});

test("Classificação isola entes e respeita o início da edição sucessora, preservando a memória anterior", async () => {
  const attributes = { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", operational: true, pocOnly: false };
  const version = { year: 2026, sourceHash: "a".repeat(64), normativeReference: "Configuração municipal documentada" };
  const entries = [
    { id: "exe-original", versionId: "exe-v1", canonicalId: "cash", code: "1.1", version, attributes: { ...attributes, governmentEntityId: "exe" } },
    { id: "exe-revision", versionId: "exe-v2", canonicalId: "cash", code: "1.1", version, attributes: { ...attributes, effectiveFrom: "2026-07-01", predecessorEntryId: "exe-original", governmentEntityId: "exe" } },
    { id: "leg-original", versionId: "leg-v1", canonicalId: "cash", code: "1.1", version, attributes: { ...attributes, governmentEntityId: "leg" } },
  ];
  const tx = { planningCatalogEntry: { findMany: async () => entries } } as unknown as Prisma.TransactionClient;
  const june = await resolveAccountClassificationSnapshots(tx, [{ id: "cash" }], new Date("2026-06-30"), { governmentEntityId: "exe", budgetUnitId: "exe-ug" });
  const july = await resolveAccountClassificationSnapshots(tx, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "exe", budgetUnitId: "exe-ug" });
  const chamber = await resolveAccountClassificationSnapshots(tx, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "leg", budgetUnitId: "leg-ug" });
  assert.equal(june.get("cash")?.entryId, "exe-original");
  assert.equal(july.get("cash")?.entryId, "exe-revision");
  assert.equal(chamber.get("cash")?.entryId, "leg-original");
  assert.equal(june.get("cash")?.entryId, "exe-original");
  await assert.rejects(resolveAccountClassificationSnapshots(tx, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "other", budgetUnitId: "other-ug" }), /versão vigente única/);
});

test("Operação municipal recusa conta sem catálogo; conta fora da vigência e natureza inválida também são recusadas", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  try {
    const entries: unknown[] = [];
    const tx = { planningCatalogEntry: { findMany: async () => entries } } as unknown as Prisma.TransactionClient;
    await assert.rejects(assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-03-01")), /sem classificação publicada/);
    const entry = { id: "cash-edition", versionId: "v1", canonicalId: "cash", code: "1.1", version: { year: 2026 }, attributes: { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-02-28" } };
    entries.push(entry);
    await assert.rejects(assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-03-01")), /versão vigente única/);
    entry.attributes.balanceNature = "INVALID";
    await assert.rejects(assertPublishedAccountClassification(tx, [{ id: "cash" }], new Date("2026-02-01")), /Natureza D\/C/);
  } finally {
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
