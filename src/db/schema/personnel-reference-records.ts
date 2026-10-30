import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const hrReferenceRecords = pgTable("HrReferenceRecord", {
  id: text("id").primaryKey().$defaultFn(createId), kind: text("kind").notNull(),
  code: text("code").notNull(), name: text("name").notNull(), details: jsonb("details").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("HrReferenceRecord_kind_code_key").on(t.kind, t.code)]);

export const hrEmployeeDocuments = pgTable("HrEmployeeDocument", {
  id: text("id").primaryKey().$defaultFn(createId), employeeId: text("employeeId").notNull(),
  templateId: text("templateId").notNull(), templateUpdatedAt: timestamp("templateUpdatedAt", {precision:3}).notNull(),
  documentType: text("documentType").notNull(), title: text("title").notNull(), body: text("body").notNull(),
  createdAt: timestamp("createdAt", {precision:3}).notNull().defaultNow(),
});
