import { and, asc, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { transparencyPublications } from "../../schema/transparency";
import type { TransparencyPublication } from "@/lib/contracts/transparency";
import type { TransparencyQuery } from "@/lib/transparencia/query-contract";

export async function readPublication(db: DatabaseExecutor, id: string): Promise<TransparencyPublication | null> {
  const [row] = await db.select().from(transparencyPublications).where(eq(transparencyPublications.id, id)).limit(1);
  return row ?? null;
}
export async function readPublicPublication(db: DatabaseExecutor, publicKey: string): Promise<TransparencyPublication | null> {
  const [row] = await db.select().from(transparencyPublications).where(and(eq(transparencyPublications.publicKey, publicKey), eq(transparencyPublications.status, "PUBLISHED"))).limit(1);
  return row ?? null;
}
export async function readPublicationByPublicKey(db: DatabaseExecutor, publicKey: string): Promise<TransparencyPublication | null> {
  const [row] = await db.select().from(transparencyPublications).where(eq(transparencyPublications.publicKey, publicKey)).limit(1);
  return row ?? null;
}
export async function listPublishedDocuments(db: DatabaseExecutor, collectionSlug: string, query: TransparencyQuery): Promise<TransparencyPublication[]> {
  return db.select().from(transparencyPublications).where(and(
    collectionSlug !== "publicacoes" ? eq(transparencyPublications.collectionSlug, collectionSlug) : undefined,
    eq(transparencyPublications.year, query.year), eq(transparencyPublications.status, "PUBLISHED"),
    query.entity !== "consolidado" ? eq(transparencyPublications.entity, query.entity) : undefined,
  )).orderBy(desc(transparencyPublications.publishedAt), asc(transparencyPublications.order), asc(transparencyPublications.publicKey));
}
export async function insertPublicationUpload(db: DatabaseExecutor, input: {
  id: string; collectionSlug: string; entity: string; year: number; title: string; group: string; referencePeriod: string;
  documentKind: string; legalStage: string; order: number; values: unknown; fileUrl: string; filePathname: string; filename: string; contentType: string; sha256: string;
}): Promise<TransparencyPublication> {
  // An empty legacy upsert never overwrote a previously registered identity.
  const [created] = await db.insert(transparencyPublications).values(input).onConflictDoNothing({ target: transparencyPublications.id }).returning();
  if (created) return created;
  const previous = await readPublication(db, input.id);
  if (!previous || previous.filePathname !== input.filePathname) throw new Error("Identidade de upload divergente.");
  return previous;
}
