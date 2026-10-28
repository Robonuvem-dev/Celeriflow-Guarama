import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import type { JsonObject } from "../src/db/json";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { assertPublishedAccountClassification, resolveAccountClassificationSnapshots } from "../src/lib/financeiro/account-catalog";

async function catalogFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`
      CREATE TABLE "PlanningCatalogVersion" (
        id text PRIMARY KEY, year integer NOT NULL, label text NOT NULL, "sourceHash" text NOT NULL,
        "normativeReference" text NOT NULL, status text NOT NULL DEFAULT 'DRAFT', "createdById" text NOT NULL,
        "createdAt" timestamp(3) NOT NULL DEFAULT now(), UNIQUE (year, "sourceHash")
      );
      CREATE TABLE "PlanningCatalogEntry" (
        id text PRIMARY KEY, "versionId" text NOT NULL REFERENCES "PlanningCatalogVersion", kind text NOT NULL,
        code text NOT NULL, name text NOT NULL, "parentCode" text, degree integer NOT NULL,
        "canonicalId" text NOT NULL, attributes jsonb NOT NULL,
        UNIQUE ("versionId", kind, code), UNIQUE ("versionId", kind, "canonicalId")
      );
    `);
    const db = fixture.connection.db;
    const edition = async (id: string, attributes: JsonObject) => db.transaction(async tx => {
      await tx.insert(planningCatalogVersions).values({ id: `${id}:version`, year: 2026, label: id, sourceHash: `${id}:source`, normativeReference: "Configuração municipal documentada", status: "PUBLISHED", createdById: "ana" });
      await tx.insert(planningCatalogEntries).values({ id, versionId: `${id}:version`, kind: "ACCOUNT", canonicalId: "cash", code: "1.1", name: "Caixa", degree: 2, attributes });
    });
    return { ...fixture, db, edition };
  } catch (error) { await fixture.close(); throw error; }
}

test("Classificação municipal sucede referência imutável e opera fora do modo de ensaio; versões conflitantes continuam recusadas", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  let fixture: Awaited<ReturnType<typeof catalogFixture>> | undefined;
  try {
    fixture = await catalogFixture();
    const { db, edition } = fixture;
    const attributes = { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" };
    const reference = { ...attributes, pocOnly: true };
    const municipal = { ...attributes, operational: true, pocOnly: false, predecessorEntryId: "reference-entry" };
    await edition("reference-entry", reference);
    await assert.rejects(assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-03-01")), /modo POC/i);
    await edition("municipal-entry", municipal);
    await assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-03-01"));
    assert.deepEqual((await db.select({ attributes: planningCatalogEntries.attributes }).from(planningCatalogEntries).where(eq(planningCatalogEntries.id, "reference-entry")))[0].attributes, reference);
    await edition("conflicting-municipal-entry", municipal);
    await assert.rejects(assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-03-01")), /versão vigente única/i);
  } finally {
    try { await fixture?.close(); } finally {
      if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
      else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
    }
  }
});

test("Classificação isola entes e respeita o início da edição sucessora, preservando a memória anterior", async () => {
  const fixture = await catalogFixture();
  try {
    const { db, edition } = fixture;
    const attributes = { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", operational: true, pocOnly: false };
    await edition("exe-original", { ...attributes, governmentEntityId: "exe" });
    await edition("exe-revision", { ...attributes, effectiveFrom: "2026-07-01", predecessorEntryId: "exe-original", governmentEntityId: "exe" });
    await edition("leg-original", { ...attributes, governmentEntityId: "leg" });
    const june = await resolveAccountClassificationSnapshots(db, [{ id: "cash" }], new Date("2026-06-30"), { governmentEntityId: "exe", budgetUnitId: "exe-ug" });
    const july = await resolveAccountClassificationSnapshots(db, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "exe", budgetUnitId: "exe-ug" });
    const chamber = await resolveAccountClassificationSnapshots(db, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "leg", budgetUnitId: "leg-ug" });
    assert.equal(june.get("cash")?.entryId, "exe-original");
    assert.equal(july.get("cash")?.entryId, "exe-revision");
    assert.equal(chamber.get("cash")?.entryId, "leg-original");
    assert.equal(june.get("cash")?.entryId, "exe-original");
    await assert.rejects(resolveAccountClassificationSnapshots(db, [{ id: "cash" }], new Date("2026-07-01"), { governmentEntityId: "other", budgetUnitId: "other-ug" }), /versão vigente única/);
  } finally { await fixture.close(); }
});

test("Operação municipal recusa conta sem catálogo; conta fora da vigência e natureza inválida também são recusadas", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  let fixture: Awaited<ReturnType<typeof catalogFixture>> | undefined;
  try {
    fixture = await catalogFixture();
    const { db, edition } = fixture;
    await assert.rejects(assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-03-01")), /sem classificação publicada/);
    const attributes = { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-02-28" };
    await edition("cash-edition", attributes);
    await assert.rejects(assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-03-01")), /versão vigente única/);
    await db.update(planningCatalogEntries).set({ attributes: { ...attributes, balanceNature: "INVALID" } }).where(eq(planningCatalogEntries.id, "cash-edition"));
    await assert.rejects(assertPublishedAccountClassification(db, [{ id: "cash" }], new Date("2026-02-01")), /Natureza D\/C/);
  } finally {
    try { await fixture?.close(); } finally {
      if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
      else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
    }
  }
});
