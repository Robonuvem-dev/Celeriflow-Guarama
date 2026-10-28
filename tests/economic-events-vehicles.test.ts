import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { taxpayers } from "../src/db/schema/registry";
import { economicRegistrations } from "../src/db/schema/taxation-core";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { createTaxResidualFixture } from "./helpers/tax-residual-drizzle-fixture";
import { financeDatabaseError } from "./helpers/finance-database-error";
import { publishEconomicEventType, saveEconomicEvent, issueEconomicEventLicense, saveEconomicVehicle } from "../src/lib/tributacao/economic-events";
import { transitionConfiguredLicense } from "../src/lib/tributacao/license-lifecycle";

test("ISS: evento congela tipo/layout, exige cancelar licença para alterar e veículos preservam placas e versões", async () => {
  const f = await createTaxResidualFixture();
  try {
    for (const id of ["responsible", "driver"]) await f.db.insert(taxpayers).values({ id, taxpayerType: "PF", status: "Ativo" });
    await f.db.insert(economicRegistrations).values({ id: "event-registration", municipalInsc: "EVENT-1", taxpayerId: "responsible", status: "Ativo" });
    await f.db.insert(taxRegistryEntries).values({ entityType: "ECONOMIC_REGISTRATION", entityId: "event-registration", category: "ECONOMIC_PROFILE", title: "Origem conferida", data: { governmentEntityId: "ente", budgetUnitId: "ug" } });
    const typeInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, code: "FEIRA", name: "Feira", active: true, fields: [{ key: "capacity", label: "Capacidade", type: "NUMBER" as const, required: true, options: [] }], layoutTitle: "Alvará de evento", layoutText: "Condições do evento", legalBasis: "Regulamento municipal" };
    const type = await publishEconomicEventType(f.connection, f.actor, typeInput);
    const eventInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, typeId: type.entityId, expectedTypeVersion: 1, name: "Feira municipal", responsibleTaxpayerId: "responsible", registrationId: "event-registration", startDate: "2026-01-01", endDate: "2026-12-31", address: { street: "Praça municipal", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" }, values: { capacity: "100" }, active: true, reason: "Evento cadastrado" };
    await assert.rejects(saveEconomicEvent(f.connection, f.actor, { ...eventInput, values: {} }), /Capacidade/);
    const event = await saveEconomicEvent(f.connection, f.actor, eventInput);
    const issue = { eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 1, reason: "Emissão conferida" };
    await assert.rejects(issueEconomicEventLicense(f.connection, { ...f.actor, allowedBudgetUnitIds: [] }, issue), /autorizado/);
    const license = await issueEconomicEventLicense(f.connection, f.actor, issue);
    const [issuance] = await f.db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityId, license.id), eq(taxRegistryEntries.category, "LICENSE_ISSUANCE")));
    await assert.rejects(issueEconomicEventLicense(f.connection, f.actor, issue), /Já existe/);
    await assert.rejects(saveEconomicEvent(f.connection, f.actor, { ...eventInput, eventId: event.entityId, expectedVersion: 1, name: "Novo nome" }), /Cancele o alvará/);
    await publishEconomicEventType(f.connection, f.actor, { ...typeInput, typeId: type.entityId, expectedVersion: 1, layoutText: "Novas condições" });
    assert.match((issuance.data as { layoutText: string }).layoutText, /Condições do evento/);
    await transitionConfiguredLicense(f.connection, f.actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Cancelado", reason: "Substituição fundamentada" });
    await saveEconomicEvent(f.connection, f.actor, { ...eventInput, eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 2, name: "Novo nome" });
    const vehicleInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, brand: "Marca", model: "Modelo", prefix: "01", plate: "ABC-1234", plateType: "BRASILEIRA" as const, registrationId: "event-registration", driverTaxpayerId: "driver", purpose: "Transporte municipal autorizado", active: true, reason: "Vínculo conferido" };
    const vehicle = await saveEconomicVehicle(f.connection, f.actor, vehicleInput);
    assert.equal((vehicle.data as { plate: string }).plate, "ABC1234");
    await assert.rejects(saveEconomicVehicle(f.connection, f.actor, vehicleInput), /Placa já vinculada/);
    await saveEconomicVehicle(f.connection, f.actor, { ...vehicleInput, vehicleId: vehicle.entityId, expectedVersion: 1, plate: "ABC1D23", plateType: "MERCOSUL" });
    assert.equal((vehicle.data as { plate: string }).plate, "ABC1234");
    await assert.rejects(f.db.delete(taxRegistryEntries).where(eq(taxRegistryEntries.id, vehicle.id)), financeDatabaseError(/imutável/));
  } finally { await f.close(); }
});
