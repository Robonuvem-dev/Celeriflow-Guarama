import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { FileOutput } from "lucide-react";
import PaginasTable from "./PaginasTable";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { desc } from "drizzle-orm";
import { portalPages } from "@/db/schema/portal-content";

export const dynamic = "force-dynamic";

export default async function PaginasPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const pages = await db.select().from(portalPages).orderBy(desc(portalPages.createdAt));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader
        title="Páginas institucionais"
        icon={<FileOutput className="size-4 shrink-0 text-purple-600" />}
        action={<Link href="/transparencia/paginas/novo" className="rounded-md bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-purple-700">Nova página</Link>}
      />
      <PaginasTable pages={pages.map((page) => ({ id: page.id, title: page.title, slug: page.slug, content: page.content, status: page.status, updatedAt: page.updatedAt.toISOString(), section: page.slug.split("/").filter(Boolean)[0] || "Institucional" }))} />
    </PageFrame>
  );
}
