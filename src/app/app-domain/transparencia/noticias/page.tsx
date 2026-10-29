import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import NoticiasTable from "./NoticiasTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
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
    <>
      <OperationalHeaderActions><Link href="/transparencia/noticias/novo" className={styles.newButton}>Nova notícia</Link></OperationalHeaderActions>
      <NoticiasTable news={news.map((item) => ({ id: item.id, title: item.title, subtitle: item.subtitle, content: item.content, imageUrl: item.imageUrl, status: item.status, publishedAt: item.publishedAt?.toISOString() || null, createdAt: item.createdAt.toISOString(), authorName: item.author?.name || null, category: item.secretariat?.name || "Institucional" }))} />
    </>
  );
}
