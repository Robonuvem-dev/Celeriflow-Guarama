import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { institutions } from "../../schema/administration";
import { portalNews, portalPages } from "../../schema/portal-content";
import type { InstitutionalContact, PublicPortalNews, PublicPortalPage } from "@/lib/portal-institucional/public-content";

const newsProjection = { title: portalNews.title, subtitle: portalNews.subtitle, slug: portalNews.slug, content: portalNews.content, publishedAt: portalNews.publishedAt };
const pageProjection = { title: portalPages.title, slug: portalPages.slug, content: portalPages.content };
const publishedNews = (now: Date) => and(eq(portalNews.status, "Publicado"), lte(portalNews.publishedAt, now));

export async function readInstitutionalContact(db: DatabaseExecutor): Promise<InstitutionalContact | null> {
  const [row] = await db.select({ name: institutions.name, address: institutions.address, city: institutions.city, state: institutions.state, phone: institutions.phone, email: institutions.email, website: institutions.website }).from(institutions).limit(1);
  return row ?? null;
}
export async function readPublishedNews(db: DatabaseExecutor, now: Date, limit: number, offset = 0): Promise<PublicPortalNews[]> {
  const rows = await db.select(newsProjection).from(portalNews).where(publishedNews(now)).orderBy(desc(portalNews.publishedAt), desc(portalNews.createdAt)).limit(limit).offset(offset);
  return rows.flatMap(row => row.publishedAt ? [{ ...row, publishedAt: row.publishedAt }] : []);
}
export async function countPublishedNews(db: DatabaseExecutor, now: Date): Promise<number> {
  const [row] = await db.select({ total: count() }).from(portalNews).where(publishedNews(now));
  return row.total;
}
export async function readPublishedNewsBySlug(db: DatabaseExecutor, slug: string, now: Date): Promise<PublicPortalNews | null> {
  const [row] = await db.select(newsProjection).from(portalNews).where(and(eq(portalNews.slug, slug), publishedNews(now))).limit(1);
  return row?.publishedAt ? { ...row, publishedAt: row.publishedAt } : null;
}
export async function readPublishedPages(db: DatabaseExecutor): Promise<PublicPortalPage[]> {
  return db.select(pageProjection).from(portalPages).where(eq(portalPages.status, "Publicado")).orderBy(desc(portalPages.updatedAt), asc(portalPages.title)).limit(6);
}
export async function readPublishedPageBySlug(db: DatabaseExecutor, slug: string): Promise<PublicPortalPage | null> {
  const [row] = await db.select(pageProjection).from(portalPages).where(and(eq(portalPages.slug, slug), eq(portalPages.status, "Publicado"))).limit(1);
  return row ?? null;
}
