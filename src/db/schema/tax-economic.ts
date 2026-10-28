import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";

// Exclusive read projections. Physical SQL history/catalog, not this file, is
// the DDL authority. No global relations registration or schema generation.
export const economicPortalAccess = pgTable("TaxpayerPortalAccess", {
  id: text("id").notNull(), usuarioId: text("usuarioId").notNull(), taxpayerId: text("taxpayerId").notNull(), accessType: text("accessType").notNull(), scopes: jsonb("scopes").$type<JsonValue>().notNull(), status: text("status").notNull(), grantedByUsuarioId: text("grantedByUsuarioId").notNull(), grantedAt: timestamp("grantedAt", { precision: 3 }).notNull(), revokedAt: timestamp("revokedAt", { precision: 3 }),
});
export const economicSignatureEvidence = pgTable("DocumentIcpEvidence", {
  id: text("id").notNull(), documentVersionId: text("documentVersionId").notNull(), documentSignatureId: text("documentSignatureId").notNull(), certificateId: text("certificateId").notNull(), documentHash: text("documentHash").notNull(), canonicalPayload: text("canonicalPayload").notNull(), signatureBase64: text("signatureBase64").notNull(), algorithm: text("algorithm").notNull(), certificateSubject: text("certificateSubject").notNull(), certificateIssuer: text("certificateIssuer").notNull(), certificateSerial: text("certificateSerial").notNull(), certificateFingerprint: text("certificateFingerprint").notNull(), certificatePemSnapshot: text("certificatePemSnapshot").notNull(), intermediatePemsSnapshot: jsonb("intermediatePemsSnapshot").$type<JsonValue>().notNull(), trustedRootPemSnapshot: text("trustedRootPemSnapshot").notNull(), signedAt: timestamp("signedAt", { precision: 3 }).notNull(), validationStatus: text("validationStatus").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull(),
});
