import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const citizenAccessApplications = pgTable("CitizenAccessApplication", {
  id: text("id").primaryKey().$defaultFn(createId), firebaseUid: text("firebaseUid").notNull().unique(), email: text("email").notNull(), name: text("name").notNull(), declaredDocument: text("declaredDocument").notNull(), requestHash: text("requestHash").notNull(), processId: text("processId").notNull().unique(), status: text("status").notNull().default("PENDENTE"), reason: text("reason"), decidedById: text("decidedById"), decidedAt: timestamp("decidedAt", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const citizenRegistryIdentities = pgTable("CitizenRegistryIdentity", {
  id: text("id").primaryKey().$defaultFn(createId), usuarioId: text("usuarioId").notNull().unique(), personId: text("personId"), companyId: text("companyId"), grantedById: text("grantedById").notNull(), evidence: text("evidence").notNull(), revokedAt: timestamp("revokedAt", { precision: 3 }), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const citizenTaxpayerAccesses = pgTable("TaxpayerPortalAccess", {
  id: text("id").primaryKey().$defaultFn(createId), usuarioId: text("usuarioId").notNull(), taxpayerId: text("taxpayerId").notNull(), accessType: text("accessType").notNull().default("TITULAR"), scopes: jsonb("scopes").notNull(), status: text("status").notNull().default("ATIVO"), grantedByUsuarioId: text("grantedByUsuarioId").notNull(), grantedAt: timestamp("grantedAt", { precision: 3 }).notNull().defaultNow(), revokedAt: timestamp("revokedAt", { precision: 3 }),
}, t => [uniqueIndex("TaxpayerPortalAccess_usuarioId_taxpayerId_key").on(t.usuarioId, t.taxpayerId)]);
export const processCitizenAccesses = pgTable("ProcessCitizenAccess", {
  id: text("id").primaryKey().$defaultFn(createId), processId: text("processId").notNull(), usuarioId: text("usuarioId").notNull(), grantedByUsuarioId: text("grantedByUsuarioId").notNull(), reason: text("reason").notNull(), grantedAt: timestamp("grantedAt", { precision: 3 }).notNull().defaultNow(), expiresAt: timestamp("expiresAt", { precision: 3 }), revokedAt: timestamp("revokedAt", { precision: 3 }),
}, t => [uniqueIndex("ProcessCitizenAccess_processId_usuarioId_key").on(t.processId, t.usuarioId)]);
