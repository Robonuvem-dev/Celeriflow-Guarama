import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import PaginasTable from "./PaginasTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { db } from "@/db/client";
import { desc } from "drizzle-orm";
import { portalPages } from "@/db/schema/portal-content";

export const dynamic = "force-dynamic";

export default async function PaginasPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const pages = await db.select().from(portalPages).orderBy(desc(portalPages.createdAt));

  return (
    <>
      <OperationalHeaderActions><Link href="/transparencia/paginas/novo" className={styles.newButton}>Nova página</Link></OperationalHeaderActions>
      <PaginasTable pages={pages.map((page) => ({ id: page.id, title: page.title, slug: page.slug, content: page.content, status: page.status, updatedAt: page.updatedAt.toISOString(), section: page.slug.split("/").filter(Boolean)[0] || "Institucional" }))} />
    </>
  );
}
