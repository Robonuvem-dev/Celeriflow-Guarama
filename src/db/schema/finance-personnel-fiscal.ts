import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import { createId } from "../ids";
import type { JsonValue } from "../json";

export const personnelFiscalDefinitions = pgTable("MunicipalPersonnelFiscalDefinition", {
  id: text("id").primaryKey().$defaultFn(createId), financialYearId: text("financialYearId").notNull(), revision: integer("revision").notNull(), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(), legalReference: text("legalReference").notNull(),
  legalLimit: exactNumeric("legalLimit", { precision: 9, scale: 4 }).notNull(), prudentialLimit: exactNumeric("prudentialLimit", { precision: 9, scale: 4 }).notNull(), alertLimit: exactNumeric("alertLimit", { precision: 9, scale: 4 }).notNull(),
  definition: jsonb("definition").$type<JsonValue>().notNull(), reason: text("reason").notNull(), actorId: text("actorId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("MunicipalPersonnelFiscalDefinition_financialYearId_revision_key").on(t.financialYearId, t.revision)]);
