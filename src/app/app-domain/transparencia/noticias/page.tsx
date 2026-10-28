import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import NoticiasTable from "./NoticiasTable";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { portalNews } from "@/db/schema/portal-content";
import { employees, secretariats } from "@/db/schema/administration";

export const dynamic = "force-dynamic";

export default async function NoticiasPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const newsRows = await db.select({news:portalNews,author:{name:employees.name},secretariat:{name:secretariats.name}}).from(portalNews).leftJoin(employees,eq(employees.id,portalNews.authorId)).leftJoin(secretariats,eq(secretariats.id,portalNews.secretariatId)).orderBy(desc(portalNews.createdAt));
  const news=newsRows.map(row=>({...row.news,author:row.author,secretariat:row.secretariat}));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader
        title="Notícias"
        icon={<Newspaper className="size-4 shrink-0 text-blue-600" />}
        action={<Link href="/transparencia/noticias/novo" className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">Nova notícia</Link>}
      />
      <NoticiasTable news={news.map((item) => ({ id: item.id, title: item.title, subtitle: item.subtitle, content: item.content, imageUrl: item.imageUrl, status: item.status, publishedAt: item.publishedAt?.toISOString() || null, createdAt: item.createdAt.toISOString(), authorName: item.author?.name || null, category: item.secretariat?.name || "Institucional" }))} />
    </PageFrame>
  );
}
