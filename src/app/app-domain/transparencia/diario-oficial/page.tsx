import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { FileText } from "lucide-react";
import DiarioTable from "./DiarioTable";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { desc } from "drizzle-orm";
import { officialDiaries } from "@/db/schema/portal-content";

export const dynamic = "force-dynamic";

export default async function DiarioOficialPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const diaries = await db.select().from(officialDiaries).orderBy(desc(officialDiaries.editionNumber));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader
        title="Diário Oficial"
        icon={<FileText className="size-4 shrink-0 text-emerald-600" />}
        action={<Link href="/transparencia/diario-oficial/novo" className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Nova edição</Link>}
      />
      <DiarioTable diaries={diaries.map((diary) => ({ id: diary.id, editionNumber: diary.editionNumber, publishDate: diary.publishDate.toISOString(), status: diary.status, pdfUrl: diary.pdfUrl }))} />
    </PageFrame>
  );
}
