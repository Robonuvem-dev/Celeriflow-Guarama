import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { BannersClient, type BannerRow } from "./BannersClient";
import { db } from "@/db/client";
import { asc } from "drizzle-orm";
import { portalBanners } from "@/db/schema/portal-content";

export const dynamic = "force-dynamic";

export default async function BannersPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const banners = await db.select().from(portalBanners).orderBy(asc(portalBanners.order));
  const rows: BannerRow[] = banners.map((banner) => ({
    id: banner.id,
    title: banner.title,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    position: banner.position,
    order: banner.order,
    status: banner.status,
    startDate: banner.startDate?.toISOString() || null,
    endDate: banner.endDate?.toISOString() || null,
  }));

  return (
    <>
      <OperationalHeaderActions><Link href="/transparencia/banners/novo" className={styles.newButton}>Novo banner</Link></OperationalHeaderActions>
      <BannersClient rows={rows} />
    </>
  );
}
