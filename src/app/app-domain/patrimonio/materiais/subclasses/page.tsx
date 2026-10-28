import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { asc, eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { materialCategories, materialSubcategories } from "@/db/schema/assets-stock";
import { activeMaterialCategory } from "@/db/repositories/assets/material-catalog";

const subclassInput = z.object({ id: z.string().optional(), categoryId: z.string().min(1), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(300), isActive: z.boolean() });
export default async function MaterialSubcategoriesPage() {
  await getTenantContextForModule("PATRIMONIO");
  const [categories, subclasses] = await Promise.all([
    db.select().from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(asc(materialCategories.code)),
    db.select({ subcategory: materialSubcategories, category: materialCategories, materials: sql<number>`(SELECT count(*)::int FROM "Material" WHERE "subcategoryId"=${materialSubcategories.id})` }).from(materialSubcategories)
      .innerJoin(materialCategories, eq(materialCategories.id, materialSubcategories.categoryId)).orderBy(asc(materialSubcategories.categoryId), asc(materialSubcategories.code))
      .then(rows => rows.map(row => ({ ...row.subcategory, category: row.category, _count: { materials: row.materials } }))),
  ]);
  async function save(form: FormData): Promise<void> {
    "use server";
    const input = subclassInput.parse({ id: form.get("id") || undefined, categoryId: form.get("categoryId"), code: form.get("code"), name: form.get("name"), isActive: form.get("isActive") === "on" });
    const context = await getTenantContextForModuleOperation("PATRIMONIO", input.id ? "update" : "create");
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT id FROM "MaterialCategory" WHERE id=${input.categoryId} FOR SHARE`);
      if (!await activeMaterialCategory(tx, input.categoryId)) throw new Error("Selecione classe ativa.");
      let id: string;
      if (input.id) {
        const [previous] = await tx.select().from(materialSubcategories).where(eq(materialSubcategories.id, input.id)).limit(1);
        if (!previous) throw new Error("Subclasse não encontrada.");
        if (previous.categoryId !== input.categoryId || previous.code !== input.code) throw new Error("Classe/código da subclasse são permanentes; altere descrição ou situação.");
        id = (await tx.update(materialSubcategories).set({ name: input.name, isActive: input.isActive }).where(eq(materialSubcategories.id, previous.id)).returning({ id: materialSubcategories.id }))[0].id;
      } else id = (await tx.insert(materialSubcategories).values({ categoryId: input.categoryId, code: input.code, name: input.name, isActive: input.isActive }).returning({ id: materialSubcategories.id }))[0].id;
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "MATERIAL_SUBCATEGORY", targetId: id });
    });
    revalidatePath("/patrimonio/materiais/subclasses"); revalidatePath("/patrimonio/materiais"); revalidatePath("/patrimonio/materiais/novo"); revalidatePath("/financeiro/custos");
  }
  const style = "rounded border p-2";
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Classes e subclasses de materiais</h1><Link href="/patrimonio/materiais" className="underline">Voltar ao estoque</Link><p>Subclasse pertence a uma classe canônica. Produtos sem subclasse permanecem sem atribuição até classificação explícita. Custos novos congelam a classificação usada no consumo.</p><form action={save} className="flex flex-wrap gap-3"><select required name="categoryId" className={style}><option value="">Selecione classe</option>{categories.map(category => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select><input required name="code" aria-label="Código da subclasse" placeholder="Código" className={style} /><input required name="name" aria-label="Descrição da subclasse" placeholder="Descrição" className={style} /><label><input type="checkbox" name="isActive" defaultChecked /> Ativa</label><button className={style}>Cadastrar subclasse</button></form>{subclasses.map(row => <form key={row.id} action={save} className="flex flex-wrap items-center gap-3 rounded border p-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="categoryId" value={row.categoryId} /><input type="hidden" name="code" value={row.code} /><span>{row.category.code} · {row.code} · {row._count.materials} produtos</span><input required name="name" aria-label={`Descrição ${row.code}`} defaultValue={row.name} className={style} /><label><input type="checkbox" name="isActive" defaultChecked={row.isActive} /> Ativa</label><button className={style}>Salvar descrição/situação</button></form>)}</section>;
}
