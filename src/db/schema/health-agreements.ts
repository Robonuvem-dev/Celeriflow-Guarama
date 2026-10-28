import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const healthCareAgreements = pgTable("HealthCareAgreement", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), covenantId: text("covenantId"), validFrom: timestamp("validFrom", { precision: 3 }).notNull(), validUntil: timestamp("validUntil", { precision: 3 }), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("HealthCareAgreement_code_key").on(t.code)]);
export const healthCareCoverages = pgTable("HealthCareCoverage", {
  id: id(), agreementId: text("agreementId").notNull(), unitId: text("unitId").notNull(), specialtyId: text("specialtyId"), procedureId: text("procedureId"), validFrom: timestamp("validFrom", { precision: 3 }).notNull(), validUntil: timestamp("validUntil", { precision: 3 }), unitValue: exactNumeric("unitValue", { precision: 18, scale: 6 }), auxiliaryTable: text("auxiliaryTable"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
