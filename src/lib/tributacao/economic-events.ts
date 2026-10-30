import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, listEconomicVehicles, listEventLicenseIssuances, lockEconomicKey, readEconomicEvent, readEconomicEventType, readEconomicEventTypeByTitle, readEconomicProfile } from "@/db/repositories/tax-economic/registry";
import { hasEconomicOrigin, readEconomicRegistration, readEconomicTaxpayer } from "@/db/repositories/tax-economic/registrations";
import { countUncancelledEconomicLicenses, insertEconomicLicense } from "@/db/repositories/tax-economic/licenses";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { fiscalFieldSchema, validateFiscalFields } from "./configurable-cadastres";
import { propertyAddressSchema } from "./property-profile-schema";
import { taxScopeSnapshot } from "./scope";

const origin = { governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1) };
export const economicEventTypeSchema = z.object({ ...origin, typeId: z.string().optional(), expectedVersion: z.number().int().nonnegative(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160), active: z.boolean(), fields: z.array(fiscalFieldSchema).max(100), layoutTitle: z.string().trim().min(1).max(240), layoutText: z.string().trim().min(1).max(12000), legalBasis: z.string().trim().min(1).max(4000) }).refine(input => new Set(input.fields.map(field => field.key)).size === input.fields.length, "Chaves adicionais repetidas.");
export const economicEventSchema = z.object({ ...origin, eventId: z.string().optional(), expectedVersion: z.number().int().nonnegative(), typeId: z.string().min(1), expectedTypeVersion: z.number().int().positive(), name: z.string().trim().min(1).max(240), responsibleTaxpayerId: z.string().min(1), registrationId: z.string().nullable(), startDate: z.iso.date(), endDate: z.iso.date(), address: propertyAddressSchema, values: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])), active: z.boolean(), reason: z.string().trim().min(1).max(4000) }).refine(input => input.startDate <= input.endDate, "Fim do evento deve ser igual ou posterior ao início.");

async function authorize(tx: DatabaseTransaction, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await hasEconomicOrigin(tx, scope)) throw new Error("Ente/UG não conciliados.");
}

async function assertRegistration(tx: DatabaseTransaction, id: string, scope: { governmentEntityId: string; budgetUnitId: string }, activeRequired = true) {
  const registration = await readEconomicRegistration(tx, id);
  const profile = await readEconomicProfile(tx, id);
  const data = taxScopeSnapshot(profile?.data);
  if (activeRequired && registration.status !== "Ativo" || data.governmentEntityId !== scope.governmentEntityId || data.budgetUnitId !== scope.budgetUnitId) throw new Error("Inscrição econômica inativa ou de outra origem.");
  return registration;
}

async function taxpayer(tx: DatabaseTransaction, id: string, activeRequired = true) {
  const row = await readEconomicTaxpayer(tx, id, activeRequired);
  if (!row) throw new Error("Selecione um contribuinte ativo.");
  return { row, name: row.company?.corporateName ?? row.person?.fullName ?? row.id };
}

export async function publishEconomicEventType(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof economicEventTypeSchema>) {
  const input = economicEventTypeSchema.parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    await lockEconomicKey(tx, `ECONOMIC_EVENT_TYPE:${input.budgetUnitId}:${input.code}`);
    const title = `${input.budgetUnitId}:${input.code}`;
    const previous = await readEconomicEventTypeByTitle(tx, title);
    if ((previous?.version ?? 0) !== input.expectedVersion || input.typeId && previous?.entityId !== input.typeId) throw new Error("Tipo de evento alterado. Recarregue antes de publicar.");
    if (previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Origem do tipo divergente.");
    const entry = await appendEconomicEntry(tx, { entityType: "ECONOMIC_EVENT_TYPE", entityId: previous?.entityId ?? randomUUID(), category: "ECONOMIC_EVENT_TYPE", title, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: economicSnapshot({ ...input, previousId: previous?.id ?? null }) });
    await appendEconomicAudit(tx, { action: "PUBLISH_ECONOMIC_EVENT_TYPE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, legalBasis: input.legalBasis } });
    return entry;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });
}

export async function saveEconomicEvent(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof economicEventSchema>) {
  const input = economicEventSchema.parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const id = input.eventId ?? randomUUID();
    await lockEconomicKey(tx, `ECONOMIC_EVENT:${id}`);
    const previous = await readEconomicEvent(tx, id);
    if ((previous?.version ?? 0) !== input.expectedVersion || input.eventId && !previous) throw new Error("Evento alterado. Recarregue antes de salvar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Origem do evento é imutável."); }
    const emissions = await listEventLicenseIssuances(tx, id);
    if (await countUncancelledEconomicLicenses(tx, emissions.map(entry => entry.entityId))) throw new Error("Cancele o alvará do evento antes de alterar o cadastro.");
    const definition = await readEconomicEventType(tx, input.typeId);
    const type = economicEventTypeSchema.parse(definition.data);
    if (!type.active || definition.version !== input.expectedTypeVersion || type.governmentEntityId !== input.governmentEntityId || type.budgetUnitId !== input.budgetUnitId) throw new Error("Tipo de evento inativo, alterado ou de outra origem.");
    const responsible = await taxpayer(tx, input.responsibleTaxpayerId);
    if (input.registrationId) await assertRegistration(tx, input.registrationId, input);
    const values = validateFiscalFields(type.fields, input.values, taxScopeSnapshot(taxScopeSnapshot(previous?.data).values));
    const entry = await appendEconomicEntry(tx, { entityType: "ECONOMIC_EVENT", entityId: id, category: "ECONOMIC_EVENT", title: input.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: economicSnapshot({ ...input, values, typeVersionId: definition.id, typeVersion: definition.version, fields: type.fields, responsibleName: responsible.name, previousId: previous?.id ?? null }) });
    await appendEconomicAudit(tx, { action: "SAVE_ECONOMIC_EVENT", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, reason: input.reason } });
    return entry;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });
}

export async function issueEconomicEventLicense(db: DatabaseConnection, actor: TaxActor, raw: { eventId: string; expectedVersion: number; expectedTypeVersion: number; reason: string }) {
  const input = z.object({ eventId: z.string().min(1), expectedVersion: z.number().int().positive(), expectedTypeVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockEconomicKey(tx, `ECONOMIC_EVENT:${input.eventId}`);
    const event = await readEconomicEvent(tx, input.eventId);
    if (!event) throw new Error("Evento não encontrado.");
    const data = economicEventSchema.parse(event.data);
    await authorize(tx, actor, { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId });
    if (event.version !== input.expectedVersion || !data.active || data.endDate < new Date().toISOString().slice(0, 10)) throw new Error("Evento alterado, inativo ou encerrado.");
    const definition = await readEconomicEventType(tx, data.typeId);
    const type = economicEventTypeSchema.parse(definition.data);
    if (!type.active || definition.version !== input.expectedTypeVersion || type.governmentEntityId !== data.governmentEntityId || type.budgetUnitId !== data.budgetUnitId) throw new Error("Tipo de evento inativo, alterado ou de outra origem.");
    const values = validateFiscalFields(type.fields, data.values);
    const responsible = await taxpayer(tx, data.responsibleTaxpayerId);
    const registration = data.registrationId ? await assertRegistration(tx, data.registrationId, data) : null;
    const prior = await listEventLicenseIssuances(tx, input.eventId);
    if (await countUncancelledEconomicLicenses(tx, prior.map(entry => entry.entityId))) throw new Error("Já existe alvará vigente ou suspenso para o evento.");
    const now = new Date(); const validUntil = new Date(`${data.endDate}T23:59:59.999Z`); const authCode = randomUUID();
    const license = await insertEconomicLicense(tx, { licenseType: `Evento · ${type.name}`, taxpayerId: data.responsibleTaxpayerId, economicRegistrationId: data.registrationId, issueDate: now, validUntil, qrCode: authCode, status: "Emitido" });
    const details = `Evento: ${data.name}\nResponsável: ${responsible.name}\nPeríodo: ${data.startDate} a ${data.endDate}\nLocal: ${data.address.street}, ${data.address.number} ${data.address.complement} · ${data.address.neighborhood} · ${data.address.city}/${data.address.state}`;
    await appendEconomicEntry(tx, { entityType: "LICENSE", entityId: license.id, category: "LICENSE_ISSUANCE", title: `${type.name} · ${data.name}`, actorUsuarioId: actor.usuarioId, data: economicSnapshot({ governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId, eventId: input.eventId, eventVersionId: event.id, event: event.data, values, policyId: `EVENT:${definition.entityId}`, policyVersionId: definition.id, policyVersion: definition.version, year: now.getUTCFullYear(), registrationId: data.registrationId, inscription: registration?.municipalInsc ?? "Evento sem inscrição econômica", taxpayerName: responsible.name, layoutTitle: type.layoutTitle, layoutText: `${type.layoutText}\n\n${details}`, legalBasis: type.legalBasis, reason: input.reason, authCode, issuedAt: now.toISOString(), validUntil: validUntil.toISOString() }) });
    await appendEconomicAudit(tx, { action: "ISSUE_ECONOMIC_EVENT_LICENSE", entityType: "License", entityId: license.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { eventId: input.eventId, eventVersionId: event.id, typeVersionId: definition.id, reason: input.reason } });
    return license;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });
}

export const economicVehicleSchema = z.object({ ...origin, vehicleId: z.string().optional(), expectedVersion: z.number().int().nonnegative(), brand: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(160), prefix: z.string().trim().max(80), plate: z.string().trim().toUpperCase(), plateType: z.enum(["BRASILEIRA", "MERCOSUL"]), registrationId: z.string().min(1), driverTaxpayerId: z.string().min(1), purpose: z.string().trim().min(1).max(240), active: z.boolean(), reason: z.string().trim().min(1).max(4000) }).refine(input => input.plateType === "BRASILEIRA" ? /^[A-Z]{3}-?\d{4}$/.test(input.plate) : /^[A-Z]{3}\d[A-Z]\d{2}$/.test(input.plate), "Placa incompatível com o padrão brasileiro ou MERCOSUL selecionado.");

export async function saveEconomicVehicle(db: DatabaseConnection, actor: TaxActor, raw: z.input<typeof economicVehicleSchema>) {
  const input = economicVehicleSchema.parse(raw); const plate = input.plate.replace("-", "");
  return withDatabaseTransaction(db, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const id = input.vehicleId ?? randomUUID();
    await lockEconomicKey(tx, `ECONOMIC_VEHICLE:${id}`);
    await lockEconomicKey(tx, `ECONOMIC_VEHICLE_PLATE:${input.budgetUnitId}:${plate}`);
    const entries = await listEconomicVehicles(tx, input.budgetUnitId);
    const latest = new Map<string, typeof entries[number]>(); for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
    const previous = latest.get(id);
    if ((previous?.version ?? 0) !== input.expectedVersion || input.vehicleId && !previous) throw new Error("Veículo alterado ou de outra origem. Recarregue.");
    if (previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Origem do veículo é imutável.");
    if (input.active && [...latest.values()].some(entry => entry.entityId !== id && taxScopeSnapshot(entry.data).active === true && taxScopeSnapshot(entry.data).plate === plate)) throw new Error("Placa já vinculada a outro veículo ativo na origem.");
    const registration = await assertRegistration(tx, input.registrationId, input, input.active);
    const company = await taxpayer(tx, registration.taxpayerId, input.active); const driver = await taxpayer(tx, input.driverTaxpayerId, input.active);
    if (driver.row.taxpayerType !== "PF") throw new Error("O condutor deve ser pessoa física ativa.");
    const entry = await appendEconomicEntry(tx, { entityType: "ECONOMIC_VEHICLE", entityId: id, category: "ECONOMIC_VEHICLE", title: plate, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: economicSnapshot({ ...input, plate, companyTaxpayerId: registration.taxpayerId, companyName: company.name, inscription: registration.municipalInsc, driverName: driver.name, previousId: previous?.id ?? null }) });
    await appendEconomicAudit(tx, { action: "SAVE_ECONOMIC_VEHICLE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { previousId: previous?.id ?? null, reason: input.reason } });
    return entry;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });
}
