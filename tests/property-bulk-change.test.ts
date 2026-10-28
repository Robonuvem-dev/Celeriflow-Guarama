import assert from "node:assert/strict";
import test from "node:test";
import { asc, count, sql } from "drizzle-orm";
import { createPropertyDrizzleFixture, propertyError } from "../src/db/repositories/tax-property/test-fixture";
import { readLatestPropertyProfile } from "../src/db/repositories/tax-property/records";
import { realEstates, taxpayers } from "../src/db/schema/registry";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { taxAuditLogs } from "../src/db/schema/taxation-audit";
import { createPropertyWithProfile, publishPropertyRegistrationPolicy } from "../src/lib/tributacao/property-profile";
import { bulkChangeProperties, readPropertyBulkSelection } from "../src/lib/tributacao/property-bulk-change";
import { publishFiscalCatalog } from "../src/lib/tributacao/configurable-cadastres";
import { taxScopeSnapshot } from "../src/lib/tributacao/scope";

test("IPTU: alteração avançada revalida fingerprint/catálogo e reverte perfil, cadastro, formulário e auditoria juntos", async () => {
  const f = await createPropertyDrizzleFixture();
  try {
    await f.db.insert(taxpayers).values({ id: "owner", taxpayerType: "PF", status: "Ativo" });
    await publishPropertyRegistrationPolicy(f.connection, f.actor, {
      governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0,
      segments: [{ key: "lot", label: "Lote", width: 3, numeric: true }], separator: "",
      requireProcess: false, restrictRiskAreas: false, legalBasis: "Composição municipal",
    });
    const cadastral = { registration: "", streetName: "Rua alvo", streetId: null, neighborhoodId: null, number: "1", complement: "", lot: "1", block: "1", landArea: 100, builtArea: 0, propertyUse: "Residencial", fiscalZone: "Z1" };
    for (const lot of ["1", "2"]) {
      await createPropertyWithProfile(f.connection, f.actor, { cadastral, profile: {
        propertyId: "assigned-by-service", expectedVersion: 0, expectedUpdatedAt: new Date().toISOString(),
        governmentEntityId: "ente", budgetUnitId: "ug", kind: "Terreno", parentId: null, unitMode: null,
        owners: [{ taxpayerId: "owner", sharePercent: "100", primary: true }], inscriptionParts: { lot },
        correspondenceAddress: { street: "Rua alvo", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" },
        latitude: null, longitude: null, floors: 0, frontSetback: "0", sideSetback: "0", riskArea: false, environmentalProtection: false,
        documentIds: [], processId: null, reason: "Cadastro conferido",
      } });
    }
    const catalogInput = { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", kind: "BCI_TERRENO" as const, code: "BULK-BCI", name: "Boletim territorial", active: true, fields: [{ key: "paving", label: "Pavimentação", type: "LIST" as const, required: true, options: ["Asfalto", "Calçamento"] }], neighborhoodId: null, streetId: null, landUnitValue: null, legalBasis: "Boletim municipal" };
    const catalog = await publishFiscalCatalog(f.connection, f.actor, catalogInput);
    const filter = { governmentEntityId: "ente", budgetUnitId: "ug", streetId: null, neighborhoodId: null, kind: "Terreno" as const, status: "", propertyUse: "", fieldFilter: null };
    const before = await readPropertyBulkSelection(f.db, f.actor, filter);
    assert.equal(before.selection.length, 2);
    const fieldFilter = { catalogId: catalog.entityId, key: "paving", value: "Asfalto" };
    assert.equal((await readPropertyBulkSelection(f.db, f.actor, { ...filter, fieldFilter })).selection.length, 0);
    await assert.rejects(readPropertyBulkSelection(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, filter), /autorizado/);
    const input = { filter, expectedFingerprint: before.fingerprint, native: { propertyUse: "Comercial" }, profile: { floors: 2 }, form: { catalogId: catalog.entityId, expectedCatalogVersion: 1, values: { paving: "Asfalto" } }, processId: null, reason: "Revisão geral conferida" };
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, { ...input, expectedFingerprint: "0".repeat(64) }), /prévia/);
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, { ...input, form: { ...input.form, expectedCatalogVersion: 2 } }), /Boletim alterado/);
    const estates = () => f.db.select().from(realEstates).orderBy(asc(realEstates.id));
    const registryCount = () => f.db.select({ count: count() }).from(taxRegistryEntries);
    const auditCount = () => f.db.select({ count: count() }).from(taxAuditLogs);
    const beforeRows = await estates(), beforeRegistry = await registryCount(), beforeAudit = await auditCount();
    await f.database.exec(`CREATE FUNCTION reject_property_bulk() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='BULK_CHANGE_PROPERTIES' THEN RAISE EXCEPTION 'rollback property bulk'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_property_bulk BEFORE INSERT ON "TaxAuditLog" FOR EACH ROW EXECUTE FUNCTION reject_property_bulk();`);
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, input), propertyError(/rollback property bulk/));
    assert.deepEqual(await estates(), beforeRows);
    assert.deepEqual(await registryCount(), beforeRegistry);
    assert.deepEqual(await auditCount(), beforeAudit);
    assert.equal((await readPropertyBulkSelection(f.db, f.actor, filter)).fingerprint, before.fingerprint);
    await f.database.exec('DROP TRIGGER reject_property_bulk ON "TaxAuditLog"; DROP FUNCTION reject_property_bulk();');
    const result = await bulkChangeProperties(f.connection, f.actor, input);
    assert.equal(result.changed, 2);
    assert.deepEqual(result.propertyIds, before.selection.map(row => row.property.id));
    const after = await readPropertyBulkSelection(f.db, f.actor, { ...filter, fieldFilter });
    assert.equal(after.selection.length, 2);
    assert.notEqual(after.fingerprint, before.fingerprint);
    for (const row of after.selection) {
      assert.equal(row.property.propertyUse, "Comercial");
      assert.equal(row.profile.version, 2);
      assert.equal(taxScopeSnapshot((await readLatestPropertyProfile(f.db, row.property.id))?.data).floors, 2);
      assert.equal(taxScopeSnapshot(taxScopeSnapshot(row.records[0].data).values).paving, "Asfalto");
    }
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, input), /prévia/);
    const next = { ...input, expectedFingerprint: after.fingerprint, profile: {}, form: null, native: { status: "Situação inexistente" } };
    await assert.rejects(bulkChangeProperties(f.connection, f.actor, next), /situação imobiliária ativa/);
    assert.equal((await readPropertyBulkSelection(f.db, f.actor, filter)).fingerprint, after.fingerprint);
    // SQL-state oracle: both historical profile positions are retained.
    const positions = await f.db.execute<{ total: number }>(sql`SELECT count(*)::integer AS total FROM "TaxRegistryEntry" WHERE category='PROPERTY_PROFILE'`);
    assert.equal(positions.rows[0].total, 4);
  } finally { await f.close(); }
});
