import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";

export const portalPages = pgTable("PortalPage", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(), slug: text("slug").notNull().unique(), content: text("content").notNull(),
  status: text("status").notNull().default("Rascunho"), authorId: text("authorId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const portalNews = pgTable("PortalNews", {
  id: text("id").primaryKey().$defaultFn(createId),
  title: text("title").notNull(), subtitle: text("subtitle"), slug: text("slug").notNull().unique(), content: text("content").notNull(),
  imageUrl: text("imageUrl"), status: text("status").notNull().default("Rascunho"), publishedAt: timestamp("publishedAt", { precision: 3 }),
  authorId: text("authorId"), secretariatId: text("secretariatId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const portalBanners = pgTable("PortalBanner", {
  id: text("id").primaryKey().$defaultFn(createId), title: text("title").notNull(), imageUrl: text("imageUrl").notNull(), linkUrl: text("linkUrl"),
  position: text("position").notNull().default("Principal"), order: integer("order").notNull().default(0), status: text("status").notNull().default("Ativo"),
  startDate: timestamp("startDate", { precision: 3 }), endDate: timestamp("endDate", { precision: 3 }),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const officialDiaries = pgTable("OfficialDiary", {
  id: text("id").primaryKey().$defaultFn(createId), editionNumber: integer("editionNumber").notNull().unique(),
  publishDate: timestamp("publishDate", { precision: 3 }).notNull(), pdfUrl: text("pdfUrl").notNull(), status: text("status").notNull().default("Rascunho"), authorId: text("authorId"),
  createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
