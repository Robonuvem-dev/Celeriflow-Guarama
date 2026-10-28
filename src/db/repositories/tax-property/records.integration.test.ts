import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { companies, documents, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { processes } from "@/db/schema/processes";
import { neighborhoods, streets } from "@/db/schema/localities";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { taxes, taxAssessments } from "@/db/schema/taxation-core";
import { pageValuations } from "@/db/schema/taxation-pages";
import { createPropertyDrizzleFixture } from "./test-fixture";
import { propertySnapshot } from "./snapshot";
import * as records from "./records";

// This suite exercises only this repository: it can enter the central queue
// before the external Tax scope/catalog/assessment helpers finish migrating.
test("Imóveis: SQL histórico, driver Neon real, JSON/Date/Decimal e leitores explícitos", { timeout: 240_000 }, async t => {
  const f = await createPropertyDrizzleFixture();
  const db = f.db;
  try {
    await t.test("mapeamentos correspondem ao catálogo físico derivado do SQL histórico", async () => {
      const catalog = await db.execute<{ table_name: string; column_name: string; type: string; not_null: boolean }>(sql`
        SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`);
      for (const table of [companies, documents, realEstates, taxpayers, people, processes, neighborhoods, streets, planningEntityUnits, taxRegistryEntries, taxAuditLogs, taxes, taxAssessments, pageValuations]) {
        for (const column of Object.values(getTableColumns(table))) {
          const key = `${getTableName(table)}.${column.name}`;
          const physical = catalog.rows.find(row => row.table_name === getTableName(table) && row.column_name === column.name);
          assert.ok(physical, key);
          assert.equal(physical.not_null, column.notNull, key);
          assert.equal(physical.type.replace(/\s+/g, "").replace(/withouttimezone$/, ""), column.getSQLType().replace(/\s+/g, ""), key);
        }
      }
    });
    await t.test("leitores aceitam IDs/listas ausentes e distinguem origem inexistente", async () => {
      assert.equal(await records.propertyOriginExists(db, "ente", "ug"), true);
      assert.equal(await records.propertyOriginExists(db, "outro-ente", "ug"), false);
      assert.equal(await records.readLatestPropertyProfile(db, "missing"), null);
      assert.equal(await records.readPropertyRegistrationPolicy(db, "missing"), null);
      assert.equal(await records.readPropertyOwnership(db, "missing"), null);
      assert.deepEqual(await records.listPropertyProfileChildren(db, "missing"), []);
      assert.deepEqual(await records.listMunicipalPropertyProfiles(db, "ug", "ente"), []);
      assert.deepEqual(await records.listPropertyCatalogs(db, "ug", "ente", "PGV"), []);
      assert.deepEqual(await records.listPropertyFiscalRecords(db, []), []);
      assert.deepEqual(await records.listPropertyCopyCharacteristics(db, "missing"), []);
      assert.deepEqual(await records.listSelectedProperties(db, records.propertySelectionPredicate({ query: "A%_", streetId: "missing", neighborhoodId: "missing", status: "Ativo", propertyUse: "Residencial" }, []), "inscription"), []);
      assert.deepEqual(await records.listPropertyOwners(db, []), []);
      assert.equal(await records.propertyTaxpayerExists(db, "missing"), false);
      assert.equal(await records.propertyProcessExists(db, "missing"), false);
      assert.equal(await records.propertyNeighborhoodExists(db, "missing"), false);
      assert.equal(await records.propertyStreetExists(db, "missing"), false);
      assert.equal(await records.countValidPropertyDocuments(db, []), 0);
      assert.equal(await records.readLatestPropertyValuationRule(db, "missing", "PROPERTY_VALUATION_RULE", "missing"), null);
      assert.equal(await records.readPropertyValuationMemory(db, "missing", "CONFIGURED_VALUATION_IPTU", { year: 2026 }), null);
      assert.equal(await records.readPropertyValuationMemory(db, "missing", "CONFIGURED_VALUATION_IPTU", { valuationId: "missing" }), null);
      assert.equal(await records.readAnnualPropertyValuation(db, "missing", 2026), null);
      assert.equal(await records.hasPropertyAssessment(db, { ids: [], taxId: "missing", year: 2026, assessmentId: "missing" }), false);
      assert.deepEqual(await records.listPropertyAssessedSimulations(db, 2026, "missing"), []);
      await assert.rejects(records.readProperty(db, "missing"), /Imóvel não encontrado/);
      await assert.rejects(records.readPropertyCatalog(db, "missing"), /Catálogo fiscal/);
      await assert.rejects(records.readPropertyRegistryEntry(db, "missing"), /Registro fiscal/);
      await assert.rejects(records.readPropertyTax(db, "missing"), /Tributo não encontrado/);
      await withDatabaseTransaction(f.connection, async tx => { await records.lockProperty(tx, "missing"); await records.lockPropertyKey(tx, "PROPERTY_REPOSITORY_TEST"); });
    });
    await t.test("snapshots preservam null, arrays, Date/Decimal e upsert anual mantém identidade", async () => {
      const instant = "2026-10-01T12:34:56.123Z";
      const observed = new Date(instant);
      const snapshot = propertySnapshot({ observed, amount: new Decimal("999999999999.123456"), nullable: null, omitted: undefined, array: [undefined, null, new Decimal("0.000001")] });
      assert.deepEqual(snapshot, { observed: instant, amount: "999999999999.123456", nullable: null, array: [null, null, "0.000001"] });
      const saved = await withDatabaseTransaction(f.connection, async tx => {
        const property = await records.insertProperty(tx, { id: "scalar-property", municipalInsc: "SCALAR", createdAt: observed, updatedAt: observed });
        const entry = await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category: "REPOSITORY_SCALARS", title: "Snapshot", data: snapshot, effectiveFrom: observed });
        const nullEntry = await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category: "REPOSITORY_NULL", title: "JSON null", data: null });
        await records.appendPropertyAudit(tx, { action: "REPOSITORY_SCALARS", entityType: "RealEstate", entityId: property.id, authorUsuarioId: "ana", payload: snapshot });
        const valuation = await records.saveAnnualPropertyValuation(tx, { realEstateId: property.id, year: 2026, landUnitValue: "999999999999.123456", constructionUnitValue: "0.000001", venalValueDecimal: new Decimal("9999999999999999.99"), source: "REGRA_MUNICIPAL", notes: "Precisão conferida" });
        return { property, entry, nullEntry, valuation };
      });
      assert.equal(saved.property.createdAt.toISOString(), instant);
      assert.equal(saved.property.updatedAt.toISOString(), instant);
      assert.equal(saved.entry.effectiveFrom.toISOString(), instant);
      assert.ok(saved.entry.createdAt instanceof Date);
      assert.deepEqual((await records.readPropertyRegistryEntry(db, saved.entry.id)).data, snapshot);
      assert.equal((await records.readPropertyRegistryEntry(db, saved.nullEntry.id)).data, null);
      const nullKind = await db.execute<{ isSqlNull: boolean; kind: string }>(sql`SELECT data IS NULL AS "isSqlNull",jsonb_typeof(data) AS kind FROM "TaxRegistryEntry" WHERE id=${saved.nullEntry.id}`);
      assert.deepEqual(nullKind.rows[0], { isSqlNull: false, kind: "null" });
      const annual = await records.readAnnualPropertyValuation(db, saved.property.id, 2026);
      assert.ok(annual);
      assert.equal(annual.landUnitValue?.toFixed(6), "999999999999.123456");
      assert.equal(annual.constructionUnitValue?.toFixed(6), "0.000001");
      assert.equal(annual.venalValueDecimal.toFixed(2), "9999999999999999.99");
      assert.ok(annual.updatedAt instanceof Date);
      const updated = await withDatabaseTransaction(f.connection, tx => records.saveAnnualPropertyValuation(tx, { realEstateId: saved.property.id, year: 2026, landUnitValue: "1.000001", constructionUnitValue: "0", venalValueDecimal: new Decimal("100.01"), source: "REGRA_MUNICIPAL", notes: "Nova posição" }));
      assert.equal(updated.id, annual.id);
      assert.equal(updated.createdAt.toISOString(), annual.createdAt.toISOString());
      assert.equal(updated.venalValueDecimal.toFixed(2), "100.01");
    });
    await t.test("proprietários ativos mantêm relação nullable e titularidade fecha apenas a posição anterior", async () => {
      await db.insert(people).values({ id: "owner-person", fullName: "Ana Proprietária" });
      await db.insert(companies).values({ id: "owner-company", corporateName: "Empresa Proprietária", cnpj: "11222333000181" });
      await db.insert(taxpayers).values([
        { id: "owner-pf", taxpayerType: "PF", personId: "owner-person" },
        { id: "owner-pj", taxpayerType: "PJ", companyId: "owner-company" },
        { id: "owner-inactive", taxpayerType: "PF", status: "Inativo" },
      ]);
      assert.deepEqual((await records.listPropertyOwners(db, ["owner-inactive", "owner-pj", "owner-pf"])).sort((a, b) => a.id.localeCompare(b.id)), [
        { id: "owner-pf", person: { fullName: "Ana Proprietária" }, company: null },
        { id: "owner-pj", person: null, company: { corporateName: "Empresa Proprietária" } },
      ]);
      assert.equal(await records.propertyTaxpayerExists(db, "owner-inactive"), true);
      await db.insert(documents).values([
        { id: "valid-document", title: "Matrícula", documentType: "MATRICULA", fileUrl: "/ged/valid", status: "Válido" },
        { id: "invalid-document", title: "Revogado", documentType: "MATRICULA", fileUrl: "/ged/invalid", status: "Revogado" },
      ]);
      assert.equal(await records.countValidPropertyDocuments(db, ["valid-document", "invalid-document", "missing"]), 1);
      const positions = await withDatabaseTransaction(f.connection, async tx => {
        const before = await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: "scalar-property", category: "FISCAL_OWNERSHIP", title: "Titularidade", data: { owners: [{ taxpayerId: "owner-pf", sharePercent: "100" }] }, effectiveFrom: new Date("2026-01-01T00:00:00.000Z") });
        const changedAt = new Date();
        await records.closePropertyOwnership(tx, before.id, changedAt);
        const after = await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: "scalar-property", category: "FISCAL_OWNERSHIP", title: "Titularidade", version: 2, effectiveFrom: changedAt, data: { owners: [{ taxpayerId: "owner-pj", sharePercent: "100" }] } });
        return { before, after };
      });
      assert.equal((await records.readPropertyOwnership(db, "scalar-property"))?.id, positions.after.id);
      const previous = await records.readPropertyRegistryEntry(db, positions.before.id);
      assert.equal(previous.status, "HISTORICO");
      assert.ok(previous.effectiveUntil instanceof Date);
      assert.deepEqual(previous.data, positions.before.data);
    });
    await t.test("escopos JSON distinguem número de texto e categorias mantêm seus filtros", async () => {
      await withDatabaseTransaction(f.connection, async tx => {
        await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: "numeric-origin", category: "PROPERTY_PROFILE", title: "Perfil", data: { governmentEntityId: "ente", budgetUnitId: 7 } });
        await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: "text-origin", category: "PROPERTY_PROFILE", title: "Perfil", data: { governmentEntityId: "ente", budgetUnitId: "7", parentId: "scalar-property" } });
        await records.appendPropertyRegistryEntry(tx, { entityType: "FISCAL_CATALOG", entityId: "pgv-catalog", category: "TYPED_FISCAL_CATALOG", title: "PGV", data: { governmentEntityId: "ente", budgetUnitId: "ug", kind: "PGV" } });
        await records.appendPropertyRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: "scalar-property", category: "TYPED_FISCAL_RECORD", title: "pgv-catalog", data: { frontage: "10" } });
        await records.appendPropertyRegistryEntry(tx, { entityType: "TAX_ASSESSMENT", entityId: "simulated-assessment", category: "PROPERTY_SIMULATION_ASSESSMENT", title: "Simulação", data: { year: 2026, propertyIds: ["scalar-property"] } });
      });
      assert.deepEqual((await records.listMunicipalPropertyProfiles(db, "7", "ente")).map(row => row.entityId), ["text-origin"]);
      assert.deepEqual(await records.listMunicipalPropertyProfiles(db, "7", "other-ente"), []);
      assert.deepEqual(await records.listPropertyProfileChildren(db, "scalar-property"), [{ entityId: "text-origin" }]);
      assert.equal((await records.readPropertyCatalog(db, "pgv-catalog")).entityId, "pgv-catalog");
      assert.equal((await records.listPropertyCatalogs(db, "ug", "ente", "PGV")).length, 1);
      assert.deepEqual(await records.listPropertyCatalogs(db, "ug", "ente", "BCI_TERRENO"), []);
      assert.equal((await records.listPropertyFiscalRecords(db, ["scalar-property"])).length, 1);
      assert.equal((await records.listPropertyAssessedSimulations(db, 2026, "scalar-property")).length, 1);
      assert.deepEqual(await records.listPropertyAssessedSimulations(db, 2025, "scalar-property"), []);
      assert.deepEqual(await records.listPropertyAssessedSimulations(db, 2026, "not-covered"), []);
    });
  } finally { await f.close(); }
});
