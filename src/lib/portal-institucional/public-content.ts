import { db } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { countPublishedNews, readInstitutionalContact, readPublishedNews, readPublishedNewsBySlug, readPublishedPageBySlug, readPublishedPages } from "@/db/repositories/portal-content/public";
import {
  LEGACY_MUNICIPALITY_PATTERN,
  MUNICIPALITY_ADDRESS,
  MUNICIPALITY_INSTITUTION_NAME,
  MUNICIPALITY_NAME,
  MUNICIPALITY_STATE,
} from "@/lib/municipality-identity";

export type InstitutionalContact = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type PublicPortalNews = {
  title: string;
  subtitle: string | null;
  slug: string;
  content: string;
  publishedAt: Date;
};

export type PublicPortalPage = {
  title: string;
  slug: string;
  content: string;
};

const defaultInstitution: InstitutionalContact = {
  name: MUNICIPALITY_INSTITUTION_NAME,
  address: MUNICIPALITY_ADDRESS,
  city: MUNICIPALITY_NAME,
  state: MUNICIPALITY_STATE,
  phone: null,
  email: null,
  website: null,
};

function publicInstitutionOrFallback(institution: InstitutionalContact | null) {
  if (!institution) return defaultInstitution;
  const searchableValues = Object.values(institution).filter((value): value is string => typeof value === "string");
  return searchableValues.some((value) => LEGACY_MUNICIPALITY_PATTERN.test(value))
    ? defaultInstitution
    : {
        ...institution,
        name: MUNICIPALITY_INSTITUTION_NAME,
        address: institution.address?.trim() || MUNICIPALITY_ADDRESS,
        city: MUNICIPALITY_NAME,
        state: MUNICIPALITY_STATE,
      };
}

function isUnavailablePortalSchema(error: unknown) {
  return ["42P01", "42703"].includes(getPostgresError(error)?.code ?? "");
}

async function publishedDataOrFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isUnavailablePortalSchema(error)) return fallback;
    throw error;
  }
}

export async function getInstitutionalPortalHome() {
  const now = new Date();
  const [institution, latestNews, pages] = await Promise.all([
    publishedDataOrFallback(
      () => readInstitutionalContact(db),
      null,
    ),
    publishedDataOrFallback<PublicPortalNews[]>(
      () => readPublishedNews(db, now, 3),
      [],
    ),
    publishedDataOrFallback(
      () => readPublishedPages(db),
      [] as PublicPortalPage[],
    ),
  ]);

  return {
    institution: publicInstitutionOrFallback(institution),
    latestNews,
    pages,
  };
}

export async function getInstitutionalContact(): Promise<InstitutionalContact> {
  try {
    const institution = await readInstitutionalContact(db);
    return publicInstitutionOrFallback(institution);
  } catch {
    return defaultInstitution;
  }
}

export async function getPublishedNewsPage(requestedPage: number, pageSize = 12) {
  const now = new Date();
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await publishedDataOrFallback<{ items: PublicPortalNews[]; total: number; currentPage: number; totalPages: number }>(
    async () => {
      const total = await countPublishedNews(db, now);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(page, totalPages);
      const items = await readPublishedNews(db, now, pageSize, (currentPage - 1) * pageSize);
      return { items, total, currentPage, totalPages };
    },
    { items: [] as PublicPortalNews[], total: 0, currentPage: 1, totalPages: 1 },
  );

  return result;
}

export async function getPublishedNewsBySlug(slug: string) {
  return publishedDataOrFallback<PublicPortalNews | null>(
    () => readPublishedNewsBySlug(db, slug, new Date()),
    null,
  );
}

export async function getPublishedPortalPageBySlug(slug: string) {
  return publishedDataOrFallback(
    () => readPublishedPageBySlug(db, slug),
    null,
  );
}

export function formatPortalDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(value);
}

export function contentExcerpt(content: string, maximumLength = 156) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength).trimEnd()}…`;
}

export function safeExternalUrl(value: string | null) {
  if (!value?.trim()) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
