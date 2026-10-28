import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const documentClasses = pgTable("DocumentClass", {
  id: text("id").primaryKey().$defaultFn(createId), code: text("code").notNull().unique(), label: text("label").notNull(),
  signaturePolicy: text("signaturePolicy").notNull().default("EXTERNAL_PROVIDER_REQUIRED"), isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const documentVersions = pgTable("DocumentVersion", {
  id: text("id").primaryKey().$defaultFn(createId), documentId: text("documentId").notNull(), versionNumber: integer("versionNumber").notNull(),
  fileUrl: text("fileUrl").notNull(), hashSha256: text("hashSha256").notNull(), status: text("status").notNull().default("FINAL"),
  lockedAt: timestamp("lockedAt", { precision: 3 }), finalizedAt: timestamp("finalizedAt", { precision: 3 }).notNull().defaultNow(),
  publicValidationCode: text("publicValidationCode").unique(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("DocumentVersion_documentId_versionNumber_key").on(t.documentId, t.versionNumber)]);
export const documentSignatures = pgTable("DocumentSignature", {
  id: text("id").primaryKey().$defaultFn(createId), documentId: text("documentId").notNull(), documentVersionId: text("documentVersionId").notNull(),
  signerUsuarioId: text("signerUsuarioId").notNull(), signerEmployeeId: text("signerEmployeeId"), signerName: text("signerName").notNull(), signerEmail: text("signerEmail").notNull(),
  signatureType: text("signatureType").notNull().default("SIGN"), provider: text("provider").notNull().default("INTERNAL"), isRequired: boolean("isRequired").notNull().default(true),
  requestedByUsuarioId: text("requestedByUsuarioId"), authenticationMethod: text("authenticationMethod").notNull(), reauthenticatedAt: timestamp("reauthenticatedAt", { precision: 3 }),
  documentHash: text("documentHash").notNull(), verificationCode: text("verificationCode").notNull().unique(), status: text("status").notNull().default("PENDING"),
  requestedAt: timestamp("requestedAt", { precision: 3 }).notNull().defaultNow(), signedAt: timestamp("signedAt", { precision: 3 }), rejectedAt: timestamp("rejectedAt", { precision: 3 }), cancelledAt: timestamp("cancelledAt", { precision: 3 }),
  ipAddress: text("ipAddress"), userAgent: text("userAgent"), metadata: text("metadata"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [uniqueIndex("DocumentSignature_documentVersionId_signerUsuarioId_key").on(t.documentVersionId, t.signerUsuarioId)]);
export const digitalCertificates = pgTable("DigitalCertificate", {
  id: text("id").primaryKey().$defaultFn(createId), alias: text("alias").notNull().unique(), ownerName: text("ownerName").notNull(), provider: text("provider").notNull().default("ENV_REFERENCE"),
  credentialReference: text("credentialReference").notNull(), certificatePem: text("certificatePem").notNull(), intermediatePems: jsonb("intermediatePems").notNull().default([]), trustedRootPem: text("trustedRootPem").notNull(),
  subject: text("subject").notNull(), issuer: text("issuer").notNull(), serialNumber: text("serialNumber").notNull(), fingerprint256: text("fingerprint256").notNull().unique(),
  validFrom: timestamp("validFrom", { precision: 3 }).notNull(), validTo: timestamp("validTo", { precision: 3 }).notNull(), status: text("status").notNull().default("ACTIVE"), purposes: jsonb("purposes").notNull().default([]),
  createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const documentIcpEvidence = pgTable("DocumentIcpEvidence", {
  id: text("id").primaryKey().$defaultFn(createId), documentVersionId: text("documentVersionId").notNull().unique(), documentSignatureId: text("documentSignatureId").notNull().unique(), certificateId: text("certificateId").notNull(),
  documentHash: text("documentHash").notNull(), canonicalPayload: text("canonicalPayload").notNull(), signatureBase64: text("signatureBase64").notNull(), algorithm: text("algorithm").notNull(),
  certificateSubject: text("certificateSubject").notNull(), certificateIssuer: text("certificateIssuer").notNull(), certificateSerial: text("certificateSerial").notNull(), certificateFingerprint: text("certificateFingerprint").notNull(),
  certificatePemSnapshot: text("certificatePemSnapshot").notNull(), intermediatePemsSnapshot: jsonb("intermediatePemsSnapshot").notNull(), trustedRootPemSnapshot: text("trustedRootPemSnapshot").notNull(),
  signedAt: timestamp("signedAt", { precision: 3 }).notNull(), validationStatus: text("validationStatus").notNull().default("VALID_AT_SIGNING"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const certificateUseAudits = pgTable("CertificateUseAudit", {
  id: text("id").primaryKey().$defaultFn(createId), certificateId: text("certificateId"), documentVersionId: text("documentVersionId"), actorUsuarioId: text("actorUsuarioId").notNull(),
  purpose: text("purpose").notNull(), documentHash: text("documentHash"), correlationId: text("correlationId").notNull(), outcome: text("outcome").notNull(), errorCode: text("errorCode"), createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
});
export const documentFolders = pgTable("Folder", {
  id: text("id").primaryKey().$defaultFn(createId), name: text("name").notNull(), description: text("description"), parentId: text("parentId"), departmentId: text("departmentId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
