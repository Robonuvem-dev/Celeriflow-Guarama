import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { departments, employees } from "./administration";
import { materials, warehouses } from "./assets-stock";

export const materialRequests = pgTable("MaterialRequest", {
  id: text("id").primaryKey().$defaultFn(createId), number: text("number").notNull(), idempotencyKey: text("idempotencyKey"), status: text("status").notNull().default("Pendente"), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), justification: text("justification"),
  sourceWarehouseId: text("sourceWarehouseId").references(() => warehouses.id, { onDelete: "restrict", onUpdate: "cascade" }), departmentId: text("departmentId").notNull().references(() => departments.id, { onDelete: "restrict", onUpdate: "cascade" }), requesterId: text("requesterId").notNull().references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }),
  approvedByEmployeeId: text("approvedByEmployeeId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), approvedAt: timestamp("approvedAt", { precision: 3 }), issuedByEmployeeId: text("issuedByEmployeeId").references(() => employees.id, { onDelete: "restrict", onUpdate: "cascade" }), issuedAt: timestamp("issuedAt", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [uniqueIndex("MaterialRequest_number_key").on(table.number), uniqueIndex("MaterialRequest_idempotencyKey_key").on(table.idempotencyKey), index("MaterialRequest_sourceWarehouseId_status_idx").on(table.sourceWarehouseId, table.status)]);

export const materialRequestItems = pgTable("MaterialRequestItem", {
  id: text("id").primaryKey().$defaultFn(createId), quantityRequested: doublePrecision("quantityRequested").notNull(), quantityApproved: doublePrecision("quantityApproved").notNull().default(0), quantityDelivered: doublePrecision("quantityDelivered").notNull().default(0),
  requestId: text("requestId").notNull().references(() => materialRequests.id, { onDelete: "cascade", onUpdate: "cascade" }), materialId: text("materialId").notNull().references(() => materials.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
