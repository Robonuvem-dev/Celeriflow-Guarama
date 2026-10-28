import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createPropertyDrizzleFixture, propertyError } from "../src/db/repositories/tax-property/test-fixture";
import { readProperty, readPropertyRegistryEntry, mutateProperty } from "../src/db/repositories/tax-property/records";
import { withDatabaseTransaction } from "../src/db/transaction";
import { realEstates } from "../src/db/schema/registry";
import { users } from "../src/db/schema/identity";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { publishPropertyEditRestriction, approvePropertyEdit } from "../src/lib/tributacao/property-edit-restrictions";
import { updatePropertyWithHistory, attributePropertyHistory } from "../src/lib/tributacao/property-history";

test("IPTU: bloqueio vale para todos os produtores; autorização é pontual, por operador e posição", async () => {
  const f = await createPropertyDrizzleFixture();
  try {
    await f.db.insert(users).values({ id: "operator", nome: "Operador", email: "operator@example.invalid", perfilId: "property-profile" });
    const [property] = await f.db.insert(realEstates).values({ id: "property", municipalInsc: "LOCKED", landArea: 100, builtArea: 0 }).returning();
    const input = { propertyId: property.id, governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, enabled: true, reason: "Imóvel em área de restrição cadastral" };
    const restriction = await publishPropertyEditRestriction(f.connection, f.actor, input);
    await assert.rejects(updatePropertyWithHistory(f.connection, "operator", property.id, { builtArea: 1 }), propertyError(/bloqueado/));
    await assert.rejects(f.db.update(realEstates).set({ status: "Inativo" }).where(eq(realEstates.id, property.id)), propertyError(/bloqueado/));
    const approval = await approvePropertyEdit(f.connection, f.actor, { propertyId: property.id, expectedUpdatedAt: property.updatedAt.toISOString(), operatorId: "operator", validMinutes: 60, reason: "Liberação fundamentada pelo supervisor" });
    await assert.rejects(updatePropertyWithHistory(f.connection, "other-operator", property.id, { builtArea: 1 }), propertyError(/bloqueado/));
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => { await attributePropertyHistory(tx, "operator"); await mutateProperty(tx, property.id, { builtArea: 2 }); throw new Error("operation rollback"); }), /operation rollback/);
    assert.equal((await readPropertyRegistryEntry(f.db, approval.id)).status, "DISPONIVEL");
    await updatePropertyWithHistory(f.connection, "operator", property.id, { builtArea: 2 });
    assert.equal((await readPropertyRegistryEntry(f.db, approval.id)).status, "CONSUMIDO");
    await assert.rejects(updatePropertyWithHistory(f.connection, "operator", property.id, { builtArea: 3 }), propertyError(/bloqueado/));
    await assert.rejects(f.db.update(taxRegistryEntries).set({ status: "DISPONIVEL" }).where(eq(taxRegistryEntries.id, approval.id)), propertyError(/não pode/));
    await assert.rejects(f.db.delete(taxRegistryEntries).where(eq(taxRegistryEntries.id, restriction.id)), propertyError(/imutável/));
    await publishPropertyEditRestriction(f.connection, f.actor, { ...input, expectedVersion: 1, enabled: false, reason: "Restrição removida com fundamento" });
    await updatePropertyWithHistory(f.connection, "operator", property.id, { builtArea: 3 });
    assert.equal((await readProperty(f.db, property.id)).builtArea, 3);
  } finally { await f.close(); }
});
