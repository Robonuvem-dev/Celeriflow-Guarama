import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { people } from "./people";
import { companies, suppliers } from "./registry";
import { users } from "./identity";

export const creditors = pgTable("Creditor", {
  id: text("id").primaryKey().$defaultFn(createId), type: text("type").notNull().default("Fornecedor"), name: text("name").notNull(), document: text("document"), status: text("status").notNull().default("Ativo"),
  personId: text("personId").references(() => people.id, { onDelete: "set null", onUpdate: "cascade" }), companyId: text("companyId").references(() => companies.id, { onDelete: "set null", onUpdate: "cascade" }), supplierId: text("supplierId").references(() => suppliers.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("Creditor_document_key").on(table.document), uniqueIndex("Creditor_personId_key").on(table.personId), uniqueIndex("Creditor_companyId_key").on(table.companyId), uniqueIndex("Creditor_supplierId_key").on(table.supplierId)]);

export const financialAuditLogs = pgTable("FinancialAuditLog", {
  id: text("id").primaryKey().$defaultFn(createId), action: text("action").notNull(), entityType: text("entityType").notNull(), entityId: text("entityId").notNull(), financialYearId: text("financialYearId"), budgetUnitId: text("budgetUnitId"), payload: jsonb("payload"),
  authorUsuarioId: text("authorUsuarioId").notNull().references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }), authorEmployeeId: text("authorEmployeeId"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
