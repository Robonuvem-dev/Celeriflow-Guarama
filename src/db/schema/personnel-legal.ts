import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

// Runtime mapping of 20261014120000_hr_role_legal_history. The installed
// append-only trigger remains the authority for legal history integrity.
export const hrRoleLegalHistory = pgTable("HrRoleLegalHistory", {
  id: text("id").primaryKey().$defaultFn(createId), governmentEntityId: text("governmentEntityId").notNull(), roleId: text("roleId").notNull(), effectiveFrom: timestamp("effectiveFrom", { precision: 3 }).notNull(),
  version: integer("version").notNull(), state: text("state").notNull(), designation: text("designation").notNull(), authorizedSeats: integer("authorizedSeats").notNull(), legalReference: text("legalReference").notNull(),
  legalTextVersionId: text("legalTextVersionId").notNull(), documentId: text("documentId").notNull(), documentVersionId: text("documentVersionId").notNull(), documentHash: text("documentHash").notNull(), documentFileUrl: text("documentFileUrl").notNull(),
  reason: text("reason").notNull(), rectification: boolean("rectification").notNull().default(false), previousEventId: text("previousEventId"), actorUsuarioId: text("actorUsuarioId").notNull(), idempotencyKey: text("idempotencyKey").notNull(), requestHash: text("requestHash").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [uniqueIndex("HrRoleLegalHistory_previousEventId_key").on(table.previousEventId), uniqueIndex("HrRoleLegalHistory_governmentEntityId_roleId_version_key").on(table.governmentEntityId, table.roleId, table.version), uniqueIndex("HrRoleLegalHistory_governmentEntityId_idempotencyKey_key").on(table.governmentEntityId, table.idempotencyKey)]);
