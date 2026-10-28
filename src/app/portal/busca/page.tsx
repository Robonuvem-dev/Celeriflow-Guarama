import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/db/client";
import { and, asc, desc, eq, like, lte, or } from "drizzle-orm";
import { portalNews, portalPages } from "@/db/schema/portal-content";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return {
    title: q ? `Busca por “${q}” | ${MUNICIPALITY_INSTITUTION_NAME}` : `Busca | ${MUNICIPALITY_INSTITUTION_NAME}`,
    description: `Pesquisa institucional no portal oficial de ${MUNICIPALITY_INSTITUTION_NAME}.`,
  };
}

export default async function PortalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let news: { title: string; slug: string; subtitle: string | null }[] = [];
  let pages: { title: string; slug: string }[] = [];

  if (query) {
    const pattern=`%${query.replace(/[\\%_]/g,"\\$&")}%`;
    try {
      const [foundNews, foundPages] = await Promise.all([
        db.select({title:portalNews.title,slug:portalNews.slug,subtitle:portalNews.subtitle}).from(portalNews).where(and(eq(portalNews.status,"Publicado"),lte(portalNews.publishedAt,new Date()),or(like(portalNews.title,pattern),like(portalNews.subtitle,pattern),like(portalNews.content,pattern)))).orderBy(desc(portalNews.publishedAt)).limit(20),
        db.select({title:portalPages.title,slug:portalPages.slug}).from(portalPages).where(and(eq(portalPages.status,"Publicado"),or(like(portalPages.title,pattern),like(portalPages.content,pattern)))).orderBy(asc(portalPages.title)).limit(20),
      ]);
      news = foundNews;
      pages = foundPages;
    } catch {
      news = [];
      pages = [];
    }
  }

  const total = news.length + pages.length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Busca" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">Pesquisa institucional</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Pesquise notícias e páginas publicadas no portal oficial da Prefeitura.</p>

      <form role="search" method="get" action="/portal/busca" className="mt-6 flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-[#0e4c7e] focus-within:ring-2 focus-within:ring-[#0e4c7e]/25">
        <label htmlFor="q" className="sr-only">Termo da pesquisa</label>
        <input id="q" name="q" type="search" defaultValue={query} placeholder="Ex.: saúde, licitação, IPTU…" className="min-w-0 flex-1 px-4 py-3 text-sm focus:outline-none" />
        <button type="submit" className="inline-flex items-center gap-2 bg-[#0e4c7e] px-5 text-sm font-bold text-white hover:bg-[#0a3a5f]">
          <Search className="size-4" aria-hidden="true" /> Buscar
        </button>
      </form>

      {query ? (
        <section aria-live="polite" className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">
            {total > 0 ? `${total} resultado(s) para “${query}”` : `Nenhum resultado para “${query}”`}
          </h2>
          {news.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]">Notícias</h3>
              <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {news.map((item) => (
                  <li key={item.slug} className="px-4 py-3">
                    <Link href={`/portal/noticias/${encodeURIComponent(item.slug)}`} className="font-bold text-slate-900 hover:text-[#0e4c7e] hover:underline">{item.title}</Link>
                    {item.subtitle && <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pages.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]">Páginas institucionais</h3>
              <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {pages.map((item) => (
                  <li key={item.slug} className="px-4 py-3">
                    <Link href={`/portal/${encodeURIComponent(item.slug)}`} className="font-bold text-slate-900 hover:text-[#0e4c7e] hover:underline">{item.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {total === 0 && (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
              Tente outro termo ou acesse o <Link href="/portal/mapa-do-site" className="font-bold text-[#0e4c7e] hover:underline">Mapa do Site</Link>.
            </p>
          )}
        </section>
      ) : (
        <p className="mt-6 text-sm text-slate-600">Digite um termo acima para pesquisar em notícias e páginas publicadas.</p>
      )}
    </main>
  );
}
