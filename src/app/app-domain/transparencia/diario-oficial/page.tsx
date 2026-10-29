import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import DiarioTable from "./DiarioTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { db } from "@/db/client";
import { desc } from "drizzle-orm";
import { officialDiaries } from "@/db/schema/portal-content";

export const dynamic = "force-dynamic";

export default async function DiarioOficialPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const diaries = await db.select().from(officialDiaries).orderBy(desc(officialDiaries.editionNumber));

  return (
    <>
      <OperationalHeaderActions><Link href="/transparencia/diario-oficial/novo" className={styles.newButton}>Nova edição</Link></OperationalHeaderActions>
      <DiarioTable diaries={diaries.map((diary) => ({ id: diary.id, editionNumber: diary.editionNumber, publishDate: diary.publishDate.toISOString(), status: diary.status, pdfUrl: diary.pdfUrl }))} />
    </>
  );
}
