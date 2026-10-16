import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { publishEconomicEventType, saveEconomicEvent, issueEconomicEventLicense, saveEconomicVehicle } from "../src/lib/tributacao/economic-events";
import { transitionConfiguredLicense } from "../src/lib/tributacao/license-lifecycle";

test("ISS: evento congela tipo/layout, exige cancelar licença para alterar e veículos preservam placas e versões", async () => {
  const f = await createPlanningExecutionFixture();
  try {
    for (const name of ["20261015180000_configured_license_policy", "20261015210000_economic_events_vehicles"]) await f.pg.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    for (const id of ["responsible", "driver"]) await f.db.taxpayer.create({ data: { id, taxpayerType: "PF", status: "Ativo" } });
    await f.db.economicRegistration.create({ data: { id: "event-registration", municipalInsc: "EVENT-1", taxpayerId: "responsible", status: "Ativo" } });
    await f.db.taxRegistryEntry.create({ data: { entityType: "ECONOMIC_REGISTRATION", entityId: "event-registration", category: "ECONOMIC_PROFILE", title: "Origem conferida", data: { governmentEntityId: "ente", budgetUnitId: "ug" } } });
    const typeInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, code: "FEIRA", name: "Feira", active: true, fields: [{ key: "capacity", label: "Capacidade", type: "NUMBER" as const, required: true, options: [] }], layoutTitle: "Alvará de evento", layoutText: "Condições do evento", legalBasis: "Regulamento municipal" };
    const type = await publishEconomicEventType(f.db, f.actor, typeInput);
    const eventInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, typeId: type.entityId, expectedTypeVersion: 1, name: "Feira municipal", responsibleTaxpayerId: "responsible", registrationId: "event-registration", startDate: "2026-01-01", endDate: "2026-12-31", address: { street: "Praça municipal", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" }, values: { capacity: "100" }, active: true, reason: "Evento cadastrado" };
    await assert.rejects(saveEconomicEvent(f.db, f.actor, { ...eventInput, values: {} }), /Capacidade/);
    const event = await saveEconomicEvent(f.db, f.actor, eventInput);
    const issue = { eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 1, reason: "Emissão conferida" };
    await assert.rejects(issueEconomicEventLicense(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, issue), /autorizado/);
    const license = await issueEconomicEventLicense(f.db, f.actor, issue);
    const issuance = await f.db.taxRegistryEntry.findFirstOrThrow({ where: { entityId: license.id, category: "LICENSE_ISSUANCE" } });
    await assert.rejects(issueEconomicEventLicense(f.db, f.actor, issue), /Já existe/);
    await assert.rejects(saveEconomicEvent(f.db, f.actor, { ...eventInput, eventId: event.entityId, expectedVersion: 1, name: "Novo nome" }), /Cancele o alvará/);
    await publishEconomicEventType(f.db, f.actor, { ...typeInput, typeId: type.entityId, expectedVersion: 1, layoutText: "Novas condições" });
    assert.match((issuance.data as { layoutText: string }).layoutText, /Condições do evento/);
    await transitionConfiguredLicense(f.db, f.actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Cancelado", reason: "Substituição fundamentada" });
    await saveEconomicEvent(f.db, f.actor, { ...eventInput, eventId: event.entityId, expectedVersion: 1, expectedTypeVersion: 2, name: "Novo nome" });
    const vehicleInput = { governmentEntityId: "ente", budgetUnitId: "ug", expectedVersion: 0, brand: "Marca", model: "Modelo", prefix: "01", plate: "ABC-1234", plateType: "BRASILEIRA" as const, registrationId: "event-registration", driverTaxpayerId: "driver", purpose: "Transporte municipal autorizado", active: true, reason: "Vínculo conferido" };
    const vehicle = await saveEconomicVehicle(f.db, f.actor, vehicleInput);
    assert.equal((vehicle.data as { plate: string }).plate, "ABC1234");
    await assert.rejects(saveEconomicVehicle(f.db, f.actor, vehicleInput), /Placa já vinculada/);
    await saveEconomicVehicle(f.db, f.actor, { ...vehicleInput, vehicleId: vehicle.entityId, expectedVersion: 1, plate: "ABC1D23", plateType: "MERCOSUL" });
    assert.equal((vehicle.data as { plate: string }).plate, "ABC1234");
    await assert.rejects(f.db.taxRegistryEntry.delete({ where: { id: vehicle.id } }), /imutável/);
  } finally { await f.close(); }
});
