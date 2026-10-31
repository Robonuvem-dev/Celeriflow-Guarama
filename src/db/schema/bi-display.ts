import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { DisplayConfig, DisplayDataset } from "@/lib/bi/display-model";

export const biDisplayChannels = pgTable("BiDisplayChannel", {
  id: text("id").primaryKey(), revision: integer("revision").notNull().default(0),
  draft: jsonb("draft").$type<DisplayConfig>().notNull(), publishedVersionId: text("publishedVersionId"),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow(), updatedBy: text("updatedBy").notNull(),
});
export const biDisplayVersions = pgTable("BiDisplayChannelVersion", {
  id: text("id").primaryKey(), channelId: text("channelId").notNull().references(() => biDisplayChannels.id),
  number: integer("number").notNull(), config: jsonb("config").$type<DisplayConfig>().notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), createdBy: text("createdBy").notNull(),
}, table => [uniqueIndex("BiDisplayChannelVersion_number_key").on(table.channelId, table.number), uniqueIndex("BiDisplayChannelVersion_channel_id_key").on(table.channelId, table.id)]);
export const biDisplayAssets = pgTable("BiMediaAsset", {
  id: text("id").primaryKey(), url: text("url").notNull(), name: text("name").notNull(),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), createdBy: text("createdBy").notNull(),
});
export const biDisplaySnapshots = pgTable("BiDisplaySnapshot", {
  versionId: text("versionId").primaryKey().references(() => biDisplayVersions.id),
  datasets: jsonb("datasets").$type<Record<string, DisplayDataset>>().notNull(),
  capturedAt: timestamp("capturedAt", { precision: 3 }).notNull(), expiresAt: timestamp("expiresAt", { precision: 3 }).notNull(),
});
