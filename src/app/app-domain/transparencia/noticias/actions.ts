"use server"

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { portalNews } from "@/db/schema/portal-content";

export async function createNews(data: FormData) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
  const title = data.get("title") as string;
  const subtitle = data.get("subtitle") as string;
  const content = data.get("content") as string;
  const status = data.get("status") as string;

  if (!title || !content) {
    throw new Error("Título e conteúdo são obrigatórios.");
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  await db.insert(portalNews).values({
      title,
      subtitle,
      content,
      status,
      slug,
      publishedAt: status === 'Publicado' ? new Date() : null,
  });

  revalidatePath("/transparencia/noticias");
}

export async function deleteNews(id: string) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "delete");
  if (!(await db.delete(portalNews).where(eq(portalNews.id, id)).returning({ id: portalNews.id })).length) throw new Error("Notícia não encontrada.");
  revalidatePath("/transparencia/noticias");
}
