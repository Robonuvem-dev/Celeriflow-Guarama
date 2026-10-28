import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { JsonValue } from "../json";
import { createId } from "../ids";

export const integrationConnections = pgTable("IntegrationConnection", {
  id: text("id").primaryKey().$defaultFn(createId),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  provider: text("provider").notNull(),
  environment: text("environment").notNull().default("MOCK"),
  status: text("status").notNull().default("CONFIGURANDO"),
  baseUrl: text("baseUrl"),
  credentialReference: text("credentialReference"),
  configuration: jsonb("configuration").$type<JsonValue>(),
  mockScenario: jsonb("mockScenario").$type<JsonValue>(),
  lastTestedAt: timestamp("lastTestedAt", { precision: 3 }),
  lastTestStatus: text("lastTestStatus"),
  lastTestMessage: text("lastTestMessage"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, table => [
  uniqueIndex("IntegrationConnection_code_key").on(table.code),
  index("IntegrationConnection_category_environment_status_idx").on(table.category, table.environment, table.status),
]);

export const integrationRuns = pgTable("IntegrationRun", {
  id: text("id").primaryKey().$defaultFn(createId),
  connectionId: text("connectionId").notNull().references(() => integrationConnections.id, { onDelete: "cascade", onUpdate: "cascade" }),
  operation: text("operation").notNull(),
  environment: text("environment").notNull(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  externalId: text("externalId"),
  payload: jsonb("payload").$type<JsonValue>(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
}, table => [index("IntegrationRun_connectionId_createdAt_idx").on(table.connectionId, table.createdAt)]);
