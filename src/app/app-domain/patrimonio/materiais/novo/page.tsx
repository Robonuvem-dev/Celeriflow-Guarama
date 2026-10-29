import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Button } from "@/components/ui/button";
import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { nextMaterialCode } from "@/lib/patrimonio/identifiers";
import { materialUnits, materialUnitValues } from "@/lib/patrimonio/material-units";
import { syncMaterialCatalog } from "@/lib/compras/shared-catalog";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { materials, materialCategories, materialSubcategories } from "@/db/schema/assets-stock";
import { catalogItems as catalogItemTable } from "@/db/schema/master-data";
import { activeMaterialCategory, activeMaterialSubcategory } from "@/db/repositories/assets/material-catalog";

const materialInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do material."),
  description: z.string().trim().optional(),
  type: z.enum(["MATERIAL", "PATRIMONIO"]),
  unitOfMeasure: z.enum(materialUnitValues),
  categoryId: z.string().trim().min(1, "Selecione a categoria."),
  subcategoryId: z.string().trim().optional(),
  catalogItemId: z.string().trim().optional(),
  minStock: z.number().finite().nonnegative("O estoque mínimo deve ser maior ou igual a zero."),
  maxStock: z.number().finite().nonnegative("O estoque máximo deve ser maior ou igual a zero."),
  isPerishable: z.boolean(),
});

export default async function NovoMaterialPage({ searchParams }: { searchParams?: Promise<{ type?: string }> }) {
  const equipmentOnly = (await searchParams)?.type === "PATRIMONIO";
  const returnPath = equipmentOnly ? "/patrimonio/bens/estoque" : "/patrimonio/materiais";
  await getTenantContextForModule("PATRIMONIO");
  const [categories, catalogItems, subcategories] = await Promise.all([
    db.select({ id: materialCategories.id, code: materialCategories.code, name: materialCategories.name }).from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(asc(materialCategories.name)),
    db.select({ id: catalogItemTable.id, code: catalogItemTable.code, name: catalogItemTable.name }).from(catalogItemTable).where(and(eq(catalogItemTable.isActive, true), inArray(catalogItemTable.productKind, ["MATERIAL", "PATRIMONIO"]), sql`NOT EXISTS (SELECT 1 FROM "Material" m WHERE m."catalogItemId"=${catalogItemTable.id})`)).orderBy(asc(catalogItemTable.name)),
    db.select({ subcategory: materialSubcategories, category: { name: materialCategories.name } }).from(materialSubcategories).innerJoin(materialCategories, eq(materialCategories.id, materialSubcategories.categoryId)).where(and(eq(materialSubcategories.isActive, true), eq(materialCategories.isActive, true))).orderBy(asc(materialSubcategories.categoryId), asc(materialSubcategories.code)).then(rows => rows.map(row => ({ ...row.subcategory, category: row.category }))),
  ]);

  async function createMaterial(formData: FormData): Promise<void> {
    "use server";

    const parsed = materialInput.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      type: formData.get("type"),
      unitOfMeasure: formData.get("unitOfMeasure"),
      categoryId: formData.get("categoryId"),
      subcategoryId: formData.get("subcategoryId") || "",
      catalogItemId: formData.get("catalogItemId"),
      minStock: Number(formData.get("minStock") || 0),
      maxStock: Number(formData.get("maxStock") || 0),
      isPerishable: formData.get("isPerishable") === "on",
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados do material inválidos.");
    if (parsed.data.maxStock > 0 && parsed.data.maxStock < parsed.data.minStock) {
      throw new Error("O estoque máximo deve ser maior ou igual ao estoque mínimo.");
    }

    await getTenantContextForModuleOperation("PATRIMONIO", "create");
    const catalogItemId = parsed.data.catalogItemId || undefined;
    const [category, catalogItem] = await Promise.all([
      activeMaterialCategory(db, parsed.data.categoryId),
      catalogItemId
        ? db.select({ id: catalogItemTable.id, productKind: catalogItemTable.productKind, linked: sql<boolean>`EXISTS (SELECT 1 FROM "Material" m WHERE m."catalogItemId"="CatalogItem"."id")` }).from(catalogItemTable).where(and(eq(catalogItemTable.id, catalogItemId), eq(catalogItemTable.isActive, true))).limit(1).then(rows => rows[0])
        : null,
    ]);
    if (!category) throw new Error("Selecione uma categoria de material ativa.");
    if (parsed.data.subcategoryId && !await activeMaterialSubcategory(db, parsed.data.subcategoryId, category.id)) throw new Error("Selecione subclasse ativa pertencente à categoria do material.");
    if (catalogItemId && !catalogItem) throw new Error("Selecione um item de catálogo ativo.");
    if (catalogItem?.linked) throw new Error("O item de catálogo já está vinculado a outro material.");
    if (catalogItem?.productKind === "SERVICO") throw new Error("Serviço não pode ser cadastrado como estoque físico.");

    await withDatabaseTransaction(databaseConnection, async tx => {
    const code = await nextMaterialCode(tx, parsed.data.type);
    const [material] = await tx.insert(materials).values({
        code,
        name: parsed.data.name,
        description: parsed.data.description || null,
        type: parsed.data.type,
        unitOfMeasure: parsed.data.unitOfMeasure,
        categoryId: category.id,
        subcategoryId: parsed.data.subcategoryId || null,
        catalogItemId,
        minStock: parsed.data.minStock,
        maxStock: parsed.data.maxStock,
        isPerishable: parsed.data.isPerishable,
    }).returning({ id: materials.id });
    await syncMaterialCatalog(tx, material.id);
    });
    revalidatePath("/patrimonio/materiais");
    revalidatePath("/patrimonio/bens/estoque");
    revalidatePath("/compras/catalogo");
    revalidatePath("/compras/solicitacoes/nova");
    redirect(parsed.data.type === "PATRIMONIO" ? "/patrimonio/bens/estoque" : "/patrimonio/materiais");
  }

  return (
    <PageFrame className="min-h-0 max-w-3xl flex-1 space-y-2 overflow-y-auto p-3">
      <PageHeader title={equipmentOnly ? "Novo equipamento" : "Novo material"} action={<Link href={returnPath}><Button size="sm" variant="outline">Cancelar</Button></Link>} />
      <form action={createMaterial} className="grid gap-3 rounded-md border bg-white p-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Tipo de material
          <input type="hidden" name="type" value={equipmentOnly ? "PATRIMONIO" : "MATERIAL"} /><span>{equipmentOnly ? "Equipamento" : "Material"}</span>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Unidade de medida
          <select name="unitOfMeasure" required defaultValue="UN" className="h-9 rounded-md border bg-background px-3 text-sm">{materialUnits.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select>
        </label>
        <div className="grid gap-1 text-sm font-medium md:col-span-2"><span>Código</span><p className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">Gerado automaticamente no padrão MAT000001 (material) ou EQP000001 (equipamento).</p></div>
        <label className="grid gap-1 text-sm font-medium md:col-span-2">
          Nome
          <input name="name" required className="h-9 rounded-md border bg-background px-3 text-sm" placeholder="Ex.: Papel A4" />
        </label>
        <label className="grid gap-1 text-sm font-medium md:col-span-2">
          Descrição detalhada
          <textarea name="description" rows={5} className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Especificações técnicas e demais informações do material." />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Categoria
          <select name="categoryId" required className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Selecione</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.code} - {category.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Item compartilhado de compras
          <select name="catalogItemId" className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Não vincular agora</option>
            {catalogItems.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ""}{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium md:col-span-2">Subclasse da categoria<select name="subcategoryId" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Sem subclasse</option>{subcategories.map(row => <option key={row.id} value={row.id}>{row.category.name} · {row.code} — {row.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">
          Estoque mínimo
          <input name="minStock" type="number" min="0" step="any" defaultValue="0" className="h-9 rounded-md border bg-background px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Estoque máximo
          <input name="maxStock" type="number" min="0" step="any" defaultValue="0" className="h-9 rounded-md border bg-background px-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
          <input name="isPerishable" type="checkbox" className="size-4" />
          Material perecível ou sujeito a validade
        </label>
        <div className="flex justify-end gap-2 border-t pt-3 md:col-span-2">
          <Link href="/patrimonio/materiais"><Button type="button" variant="outline">Cancelar</Button></Link>
          <Button type="submit">Salvar material</Button>
        </div>
      </form>
    </PageFrame>
  );
}
