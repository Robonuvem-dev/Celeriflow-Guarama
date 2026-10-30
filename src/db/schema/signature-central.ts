import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { employees } from "./administration";
import { people } from "./people";
import type { CentralEvidence } from "@/lib/signatures/central-evidence";

const instant = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });
export const centralSigners = pgTable("SignatureCentralSigner", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), name: text("name").notNull(), role: text("role").notNull(),
  documentId: text("documentId").notNull(), phone: text("phone").notNull(), mobile: text("mobile").notNull(), email: text("email").notNull(),
  validUntil: instant("validUntil").notNull(), active: boolean("active").notNull(), passwordHash: text("passwordHash").notNull(),
  employeeId: text("employeeId").references(() => employees.id, { onDelete: "restrict" }),
  personId: text("personId").references(() => people.id, { onDelete: "restrict" }),
  accountUserId: text("accountUserId").references(() => users.id, { onDelete: "restrict" }),
  createdAt: instant("createdAt").notNull().defaultNow(), updatedAt: instant("updatedAt").notNull().defaultNow(),
}, t => [uniqueIndex("SignatureCentralSigner_document_key").on(t.documentId), index("SignatureCentralSigner_account_idx").on(t.accountUserId),
  check("SignatureCentralSigner_origin_check", sql`(${t.kind} = 'SERVIDOR' AND ${t.employeeId} IS NOT NULL) OR (${t.kind} = 'CIDADAO' AND ${t.employeeId} IS NULL)`)]);

export const centralDocumentTypes = pgTable("SignatureCentralDocumentType", {
  id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull(), active: boolean("active").notNull(),
}, t => [uniqueIndex("SignatureCentralDocumentType_name_key").on(t.name)]);

// PENDING is a durable upload intent: its deterministic path survives rollback,
// process death and uncertain Blob responses, allowing cleanup and safe retries.
export const centralRecords = pgTable("SignatureCentralRecord", {
  id: text("id").primaryKey(), requestId: text("requestId").notNull(), requestDigest: text("requestDigest").notNull(),
  actorId: text("actorId").notNull().references(() => users.id, { onDelete: "restrict" }),
  signerId: text("signerId").notNull().references(() => centralSigners.id, { onDelete: "restrict" }),
  accountUserId: text("accountUserId").references(() => users.id, { onDelete: "restrict" }),
  documentTypeId: text("documentTypeId").notNull().references(() => centralDocumentTypes.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("PENDING"), code: text("code").notNull(),
  filename: text("filename").notNull(), mimeType: text("mimeType").notNull(), byteLength: integer("byteLength").notNull(), hashSha256: text("hashSha256").notNull(),
  blobPath: text("blobPath").notNull(), evidence: jsonb("evidence").$type<CentralEvidence>(),
  createdAt: instant("createdAt").notNull().defaultNow(), signedAt: instant("signedAt"), expiresAt: instant("expiresAt").notNull(),
  storageDeletedAt: instant("storageDeletedAt"),
}, t => [uniqueIndex("SignatureCentralRecord_request_key").on(t.actorId, t.requestId), uniqueIndex("SignatureCentralRecord_code_key").on(t.code),
  uniqueIndex("SignatureCentralRecord_path_key").on(t.blobPath), index("SignatureCentralRecord_hash_idx").on(t.hashSha256),
  index("SignatureCentralRecord_retention_idx").on(t.status, t.expiresAt, t.storageDeletedAt), index("SignatureCentralRecord_actor_idx").on(t.actorId, t.createdAt),
  index("SignatureCentralRecord_account_idx").on(t.accountUserId),
  check("SignatureCentralRecord_status_check", sql`${t.status} IN ('PENDING','SIGNED')`),
  check("SignatureCentralRecord_size_check", sql`${t.byteLength} > 0 AND ${t.byteLength} <= 3145728`),
  check("SignatureCentralRecord_proof_check", sql`(${t.status} = 'PENDING' AND ${t.evidence} IS NULL AND ${t.signedAt} IS NULL) OR (${t.status} = 'SIGNED' AND ${t.evidence} IS NOT NULL AND ${t.signedAt} IS NOT NULL)`),
]);
export type CentralRecordRow = typeof centralRecords.$inferSelect;
