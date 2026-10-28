import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const medicines = pgTable("Medicine", {
  id: id(), name: text("name").notNull(), activePrinciple: text("activePrinciple"), presentation: text("presentation"), concentration: text("concentration"), isControlled: boolean("isControlled").notNull().default(false), currentStock: integer("currentStock").notNull().default(0), minStock: integer("minStock").notNull().default(0), isActive: boolean("isActive").notNull().default(true), materialId: text("materialId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("Medicine_materialId_key").on(t.materialId)]);
export const healthPrescriptions = pgTable("HealthPrescription", {
  id: id(), prescriptionType: text("prescriptionType").notNull().default("SIMPLE"), manualGroup: text("manualGroup"), barcode: text("barcode"), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), content: text("content").notNull(), validUntil: timestamp("validUntil", { precision: 3 }), patientId: text("patientId").notNull(), professionalId: text("professionalId").notNull(), unitId: text("unitId"), medicalRecordId: text("medicalRecordId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthPrescription_barcode_key").on(t.barcode)]);
export const healthPrescriptionItems = pgTable("HealthPrescriptionItem", {
  id: id(), usageType: text("usageType").notNull().default("ACUTE"), treatmentDays: integer("treatmentDays"), prescriptionId: text("prescriptionId").notNull(), medicineId: text("medicineId"), medicineName: text("medicineName").notNull(), presentation: text("presentation"), dose: text("dose").notNull(), route: text("route"), frequency: text("frequency").notNull(), duration: text("duration"), quantity: doublePrecision("quantity"), instructions: text("instructions"), createdAt: createdAt(),
});
export const healthPrescriptionTemplates = pgTable("HealthPrescriptionTemplate", {
  id: id(), name: text("name").notNull(), prescriptionType: text("prescriptionType").notNull(), items: jsonb("items").notNull(), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(),
});
