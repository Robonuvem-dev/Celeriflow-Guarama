import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthRiskProtocols = pgTable("HealthRiskProtocol", {
  id: id(), level: integer("level").notNull(), label: text("label").notNull(), colorHex: text("colorHex").notNull().default("#64748b"), maxWaitMinutes: integer("maxWaitMinutes").notNull().default(0), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthRiskProtocol_level_key").on(t.level)]);
export const healthDestinations = pgTable("HealthDestination", {
  id: id(), name: text("name").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthDestination_name_key").on(t.name)]);
export const healthRooms = pgTable("HealthRoom", {
  id: id(), unitId: text("unitId").notNull(), name: text("name").notNull(), kind: text("kind").notNull().default("Atendimento"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
}, t => [uniqueIndex("HealthRoom_unitId_name_key").on(t.unitId, t.name)]);
export const healthReceptions = pgTable("HealthReception", {
  id: id(), patientId: text("patientId"), unidentifiedName: text("unidentifiedName"), unitId: text("unitId").notNull(), arrivalAt: timestamp("arrivalAt", { precision: 3 }).notNull().defaultNow(), priorityFlags: text("priorityFlags"), companionName: text("companionName"), companionKinship: text("companionKinship"), companionPhone: text("companionPhone"), transportMode: text("transportMode"), agreement: text("agreement"), roomId: text("roomId"), destinationId: text("destinationId"), status: text("status").notNull().default("Aguardando"), outcome: text("outcome"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const healthBeds = pgTable("HealthBed", {
  id: id(), unitId: text("unitId").notNull(), room: text("room"), code: text("code").notNull(), status: text("status").notNull().default("Livre"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthBed_unitId_code_key").on(t.unitId, t.code)]);
export const healthBedOccupancies = pgTable("HealthBedOccupancy", {
  id: id(), bedId: text("bedId").notNull(), patientId: text("patientId").notNull(), admittedAt: timestamp("admittedAt", { precision: 3 }).notNull().defaultNow(), dischargedAt: timestamp("dischargedAt", { precision: 3 }), notes: text("notes"),
});
