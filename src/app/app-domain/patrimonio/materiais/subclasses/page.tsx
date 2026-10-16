import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

const subclassInput = z.object({ id: z.string().optional(), categoryId: z.string().min(1), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(300), isActive: z.boolean() });
export default async function MaterialSubcategoriesPage() {
  const { prisma } = await getTenantContextForModule("PATRIMONIO");
  const [categories, subclasses] = await Promise.all([prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }), prisma.materialSubcategory.findMany({ include: { category: true, _count: { select: { materials: true } } }, orderBy: [{ categoryId: "asc" }, { code: "asc" }] })]);
  async function save(form: FormData): Promise<void> {
    "use server";
    const input = subclassInput.parse({ id: form.get("id") || undefined, categoryId: form.get("categoryId"), code: form.get("code"), name: form.get("name"), isActive: form.get("isActive") === "on" });
    const context = await getTenantContextForModuleOperation("PATRIMONIO", input.id ? "update" : "create");
    await context.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "MaterialCategory" WHERE id=${input.categoryId} FOR SHARE`;
      if (!await tx.materialCategory.count({ where: { id: input.categoryId, isActive: true } })) throw new Error("Selecione classe ativa.");
      let id: string;
      if (input.id) {
        const previous = await tx.materialSubcategory.findUniqueOrThrow({ where: { id: input.id } });
        if (previous.categoryId !== input.categoryId || previous.code !== input.code) throw new Error("Classe/código da subclasse são permanentes; altere descrição ou situação.");
        id = (await tx.materialSubcategory.update({ where: { id: previous.id }, data: { name: input.name, isActive: input.isActive } })).id;
      } else id = (await tx.materialSubcategory.create({ data: { categoryId: input.categoryId, code: input.code, name: input.name, isActive: input.isActive } })).id;
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "MATERIAL_SUBCATEGORY", targetId: id });
    });
    revalidatePath("/patrimonio/materiais/subclasses"); revalidatePath("/patrimonio/materiais"); revalidatePath("/patrimonio/materiais/novo"); revalidatePath("/financeiro/custos");
  }
  const style = "rounded border p-2";
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Classes e subclasses de materiais</h1><Link href="/patrimonio/materiais" className="underline">Voltar ao estoque</Link><p>Subclasse pertence a uma classe canônica. Produtos sem subclasse permanecem sem atribuição até classificação explícita. Custos novos congelam a classificação usada no consumo.</p><form action={save} className="flex flex-wrap gap-3"><select required name="categoryId" className={style}><option value="">Selecione classe</option>{categories.map(category => <option key={category.id} value={category.id}>{category.code} · {category.name}</option>)}</select><input required name="code" aria-label="Código da subclasse" placeholder="Código" className={style} /><input required name="name" aria-label="Descrição da subclasse" placeholder="Descrição" className={style} /><label><input type="checkbox" name="isActive" defaultChecked /> Ativa</label><button className={style}>Cadastrar subclasse</button></form>{subclasses.map(row => <form key={row.id} action={save} className="flex flex-wrap items-center gap-3 rounded border p-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="categoryId" value={row.categoryId} /><input type="hidden" name="code" value={row.code} /><span>{row.category.code} · {row.code} · {row._count.materials} produtos</span><input required name="name" aria-label={`Descrição ${row.code}`} defaultValue={row.name} className={style} /><label><input type="checkbox" name="isActive" defaultChecked={row.isActive} /> Ativa</label><button className={style}>Salvar descrição/situação</button></form>)}</section>;
}
