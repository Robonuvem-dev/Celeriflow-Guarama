import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { publishPropertyEditRestriction, approvePropertyEdit } from "../src/lib/tributacao/property-edit-restrictions";
import { updatePropertyWithHistory } from "../src/lib/tributacao/property-history";

test("IPTU: bloqueio vale para todos os produtores; autorização é pontual, por operador e posição", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    for (const migration of ["20261015100000_tax_property_cadastral_history", "20261015110000_real_estate_cadastral_history", "20261015140000_property_edit_restrictions", "20261015150000_property_profiles_and_registration"]) await f.pg.exec(await readFile(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await f.db.configuracaoPerfil.create({ data: { id: "profile", codigo: "OPERATOR", nome: "Operador", permissoes: "{}" } });
    await f.db.usuario.create({ data: { id: "operator", nome: "Operador", email: "operator@example.invalid", perfilId: "profile" } });
    const property = await f.db.realEstate.create({ data: { id: "property", municipalInsc: "LOCKED", landArea: 100, builtArea: 0 } });
    const input = { propertyId: property.id, governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, enabled: true, reason: "Imóvel em área de restrição cadastral" };
    const restriction = await publishPropertyEditRestriction(f.db, f.actor, input);
    await assert.rejects(updatePropertyWithHistory(f.db, "operator", property.id, { builtArea: 1 }), /bloqueado/);
    await assert.rejects(f.db.realEstate.update({ where: { id: property.id }, data: { status: "Inativo" } }), /bloqueado/);
    const approval = await approvePropertyEdit(f.db, f.actor, { propertyId: property.id, expectedUpdatedAt: property.updatedAt.toISOString(), operatorId: "operator", validMinutes: 60, reason: "Liberação fundamentada pelo supervisor" });
    await assert.rejects(updatePropertyWithHistory(f.db, "other-operator", property.id, { builtArea: 1 }), /bloqueado/);
    await assert.rejects(f.db.$transaction(async tx => { await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_actor','operator',true)`; await tx.realEstate.update({ where: { id: property.id }, data: { builtArea: 2 } }); throw new Error("operation rollback"); }), /operation rollback/);
    assert.equal((await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: approval.id } })).status, "DISPONIVEL");
    await updatePropertyWithHistory(f.db, "operator", property.id, { builtArea: 2 });
    assert.equal((await f.db.taxRegistryEntry.findUniqueOrThrow({ where: { id: approval.id } })).status, "CONSUMIDO");
    await assert.rejects(updatePropertyWithHistory(f.db, "operator", property.id, { builtArea: 3 }), /bloqueado/);
    await assert.rejects(f.db.taxRegistryEntry.update({ where: { id: approval.id }, data: { status: "DISPONIVEL" } }), /não pode/);
    await assert.rejects(f.db.taxRegistryEntry.delete({ where: { id: restriction.id } }), /imutável/);
    await publishPropertyEditRestriction(f.db, f.actor, { ...input, expectedVersion: 1, enabled: false, reason: "Restrição removida com fundamento" });
    await updatePropertyWithHistory(f.db, "operator", property.id, { builtArea: 3 });
    assert.equal((await f.db.realEstate.findUniqueOrThrow({ where: { id: property.id } })).builtArea, 3);
  } finally { await f.close(); }
});
