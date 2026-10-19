import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TransparencySettings } from "./presentation-settings";
import { publishedTransparencyCatalog } from "./consultation-service";

export const documentSearchSchema = z.object({
  q: z.string().trim().max(200).default(""), year: z.string().regex(/^\d{4}$/).or(z.literal("")).default(""),
  entity: z.enum(["", "prefeitura", "camara"]).default(""), collection: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
export type DocumentSearch = z.infer<typeof documentSearchSchema>;
export type DocumentSearchRow = {
  publicKey: string; title: string; group: string; referencePeriod: string; entity: string;
  year: number; publishedAt: Date | null; documentKind: string; contentType: string | null;
  hasFile: boolean; linkUrl: string | null;
};

export async function searchPublishedDocuments(db: Pick<PrismaClient, "$queryRaw">, settings: TransparencySettings, input: DocumentSearch) {
  const query = documentSearchSchema.parse(input);
  const collections = publishedTransparencyCatalog(settings).map(item => item.slug);
  const entities = settings.entities.filter(item => item.enabled).map(item => item.key);
  if (query.year && !settings.availableYears.includes(Number(query.year)) || query.entity && !entities.includes(query.entity) || query.collection && !collections.includes(query.collection)) throw new Error("Filtros documentais não publicados.");
  if (!collections.length) return { records: [] as DocumentSearchRow[], total: 0, page: 1, pages: 1 };
  const terms = query.q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
  const conditions = [
    Prisma.sql`"status" = 'PUBLISHED'`,
    Prisma.sql`"collectionSlug" IN (${Prisma.join(collections)})`,
    Prisma.sql`"entity" IN (${Prisma.join(query.entity ? [query.entity] : entities)})`,
    Prisma.sql`"year" IN (${Prisma.join(query.year ? [Number(query.year)] : settings.availableYears)})`,
    ...terms.map(term => Prisma.sql`strpos(translate(lower(concat_ws(' ', "title", "group", "referencePeriod", "documentKind")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), ${term}) > 0`),
    ...(query.collection ? [Prisma.sql`"collectionSlug" = ${query.collection}`] : []),
  ];
  const where = Prisma.join(conditions, " AND ");
  const [count] = await db.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::integer AS total FROM "TransparencyPublication" WHERE ${where}`);
  const total = count.total, pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(query.page, pages);
  const records = await db.$queryRaw<DocumentSearchRow[]>(Prisma.sql`
    SELECT "publicKey", "title", "group", "referencePeriod", "entity", "year", "publishedAt", "documentKind", "contentType", ("fileUrl" IS NOT NULL) AS "hasFile", "linkUrl"
    FROM "TransparencyPublication" WHERE ${where}
    ORDER BY "publishedAt" DESC NULLS LAST, "order" ASC, "publicKey" ASC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { records, total, page, pages };
}
