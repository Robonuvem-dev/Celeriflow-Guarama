import { createHash } from "node:crypto";
import { and, eq, ilike, lt, ne, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { PersistenceError } from "@/db/errors";
import { catalogItems } from "@/db/schema/master-data";
import { materials, materialCategories } from "@/db/schema/assets-stock";
import { sequenceCounters } from "@/db/schema/sequences";
import type { ProcurementCatalogItem } from "@/lib/contracts/procurement-catalog";
import { nextMaterialCode } from "@/lib/patrimonio/identifiers";
import { materialUnitValues } from "@/lib/patrimonio/material-units";

type Tx = DatabaseTransaction;
export type ProcurementItemKind = "MATERIAL" | "PATRIMONIO" | "SERVICO";

export async function syncMaterialCatalog(tx: Tx, materialId: string): Promise<ProcurementCatalogItem> {
  const [source] = await tx.select({ material: materials, category: { name: materialCategories.name } }).from(materials).innerJoin(materialCategories, eq(materialCategories.id, materials.categoryId)).where(eq(materials.id, materialId));
  if (!source) throw new PersistenceError("not-found", "Material não encontrado.");
  const material = { ...source.material, category: source.category };
  if (material.catalogItemId) await tx.execute(sql`SELECT id FROM "CatalogItem" WHERE id=${material.catalogItemId} FOR UPDATE`);
  const [catalog] = await tx.select().from(catalogItems).where(material.catalogItemId ? eq(catalogItems.id, material.catalogItemId) : eq(catalogItems.code, material.code));
  if (material.catalogItemId && !catalog) throw new PersistenceError("not-found", "Item de catálogo não encontrado.");
  if (catalog) {
    const [otherMaterial] = await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.catalogItemId, catalog.id), ne(materials.id, material.id))).limit(1);
    if (otherMaterial) throw new Error("O item de Compras já identifica outro material. Revise o vínculo do catálogo.");
    const [otherCatalog] = await tx.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.code, material.code), ne(catalogItems.id, catalog.id))).limit(1);
    if (otherCatalog) throw new Error("O código do material já está associado a outro item de Compras.");
  }
  const data = { code: material.code, name: material.name, description: material.description, productKind: material.type, unit: material.unitOfMeasure, category: material.category.name, isActive: material.isActive };
  const [result] = catalog
    ? await tx.update(catalogItems).set({ ...data, externalCode: catalog.externalCode || (catalog.code !== material.code ? catalog.code : null) }).where(eq(catalogItems.id, catalog.id)).returning()
    : await tx.insert(catalogItems).values(data).returning();
  if (material.catalogItemId !== result.id) await tx.update(materials).set({ catalogItemId: result.id }).where(eq(materials.id, material.id));
  return result;
}

async function serviceCode(tx: Tx) {
  const codes = await tx.select({ code: catalogItems.code }).from(catalogItems).where(sql`starts_with(${catalogItems.code}, 'SRV')`);
  const maximum = codes.reduce((max, row) => Math.max(max, Number(/^SRV(\d+)$/.exec(row.code || "")?.[1]) || 0), 0);
  const key = "compras-catalogo-servico";
  await tx.update(sequenceCounters).set({ value: maximum }).where(and(eq(sequenceCounters.key, key), lt(sequenceCounters.value, maximum)));
  const [counter] = await tx.insert(sequenceCounters).values({ key, value: maximum + 1 }).onConflictDoUpdate({ target: sequenceCounters.key, set: { value: sql`${sequenceCounters.value} + 1` } }).returning({ value: sequenceCounters.value });
  if (counter.value > 999999) throw new Error("A sequência de serviços atingiu o limite.");
  return `SRV${String(counter.value).padStart(6, "0")}`;
}

export async function saveSharedCatalogItem(tx: Tx, input: { id?: string | null; name: string; description: string; category: string; unit: string; estimatedValue: number; isActive: boolean; productKind: ProcurementItemKind }): Promise<ProcurementCatalogItem> {
  const [current] = input.id ? await tx.select().from(catalogItems).where(eq(catalogItems.id, input.id)) : [];
  if (input.id && !current) throw new PersistenceError("not-found", "Item de catálogo não encontrado.");
  const linkedMaterials = current ? await tx.select().from(materials).where(eq(materials.catalogItemId, current.id)) : [];
  if (linkedMaterials.length > 1) throw new Error("O catálogo está vinculado a mais de um material. Revise o cadastro.");
  if (current && current.productKind !== input.productKind) throw new Error("O tipo de um item cadastrado deve ser preservado. Cadastre outro item para um tipo diferente.");
  if (input.productKind === "SERVICO") {
    if (linkedMaterials.length) throw new Error("Serviços não podem ter vínculo com estoque físico.");
    const code = current?.code || await serviceCode(tx);
    const data = { code, name: input.name, description: input.description, category: input.category, unit: input.unit, estimatedValue: input.estimatedValue, isActive: input.isActive, productKind: "SERVICO" };
    const [result] = current ? await tx.update(catalogItems).set(data).where(eq(catalogItems.id, current.id)).returning() : await tx.insert(catalogItems).values(data).returning();
    return result;
  }
  const existing = linkedMaterials[0];
  if (!materialUnitValues.some(unit => unit === input.unit) && input.unit !== existing?.unitOfMeasure) throw new Error("Selecione UN, KG, m ou KT para itens físicos.");
  if (existing && existing.unitOfMeasure !== input.unit) {
    const usage = await tx.execute<{ used: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "MaterialStock" WHERE "materialId"=${existing.id}) OR EXISTS(SELECT 1 FROM "PurchaseRequestItem" WHERE "materialId"=${existing.id}) OR EXISTS(SELECT 1 FROM "PurchaseProcessItem" WHERE "materialId"=${existing.id}) OR EXISTS(SELECT 1 FROM "MaterialMovement" WHERE "materialId"=${existing.id}) AS used`);
    if (usage.rows[0].used) throw new Error("Não altere a unidade de um material com estoque ou documentos vinculados.");
  }
  const categoryName = input.category || (input.productKind === "PATRIMONIO" ? "Equipamentos" : "Materiais de consumo");
  let [category] = await tx.select().from(materialCategories).where(ilike(materialCategories.name, categoryName.replace(/[\\%_]/g, "\\$&"))).limit(1);
  if (!category) [category] = await tx.insert(materialCategories).values({ code: `COMP-${createHash("sha256").update(categoryName).digest("hex").slice(0, 12)}`, name: categoryName }).returning();
  const data = { name: input.name, description: input.description || null, categoryId: category.id, type: input.productKind, unitOfMeasure: input.unit, isActive: input.isActive };
  const [material] = existing
    ? await tx.update(materials).set(data).where(eq(materials.id, existing.id)).returning()
    : await tx.insert(materials).values({ ...data, code: await nextMaterialCode(tx, input.productKind), catalogItemId: current?.id }).returning();
  const catalog = await syncMaterialCatalog(tx, material.id);
  const [result] = await tx.update(catalogItems).set({ estimatedValue: input.estimatedValue }).where(eq(catalogItems.id, catalog.id)).returning();
  return result;
}
