"use server"

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { portalPages } from "@/db/schema/portal-content";

const reservedPortalSlugs = new Set(["noticias"]);

function createPortalSlug(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function createPage(data: FormData) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
  const title = data.get("title") as string;
  const content = data.get("content") as string;
  const status = data.get("status") as string;

  if (!title || !content) {
    throw new Error("Título e conteúdo são obrigatórios.");
  }

  const slug = createPortalSlug(title);
  if (!slug) {
    throw new Error("Informe um título com caracteres que possam compor a URL da página.");
  }
  if (reservedPortalSlugs.has(slug)) {
    throw new Error("Este título usa uma URL reservada pelo portal. Escolha outro título para a página.");
  }

  await db.insert(portalPages).values({
      title,
      content,
      status,
      slug,
  });

  revalidatePath("/transparencia/paginas");
  revalidatePath("/portal");
  revalidatePath(`/portal/${slug}`);
}

export async function deletePage(id: string) {
  await getTenantContextForModuleOperation("TRANSPARENCIA", "delete");
  const [page] = await db.select({ slug: portalPages.slug }).from(portalPages).where(eq(portalPages.id, id)).limit(1);
  if (!page) {
    throw new Error("Página institucional não encontrada.");
  }
  if (!(await db.delete(portalPages).where(eq(portalPages.id, id)).returning({ id: portalPages.id })).length) throw new Error("Página institucional não encontrada.");
  revalidatePath("/transparencia/paginas");
  revalidatePath("/portal");
  revalidatePath(`/portal/${page.slug}`);
}
