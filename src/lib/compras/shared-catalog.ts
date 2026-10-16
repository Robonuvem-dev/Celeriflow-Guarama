import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { nextMaterialCode } from "@/lib/patrimonio/identifiers";
import { materialUnitValues } from "@/lib/patrimonio/material-units";

type Tx = Prisma.TransactionClient;
export type ProcurementItemKind = "MATERIAL" | "PATRIMONIO" | "SERVICO";

export async function syncMaterialCatalog(tx: Tx, materialId: string) {
  const material = await tx.material.findUniqueOrThrow({ where: { id: materialId }, include: { category: true } });
  if (material.catalogItemId) await tx.$queryRaw`SELECT id FROM "CatalogItem" WHERE id=${material.catalogItemId} FOR UPDATE`;
  const catalog = material.catalogItemId
    ? await tx.catalogItem.findUniqueOrThrow({ where: { id: material.catalogItemId }, include: { materials: { select: { id: true } } } })
    : await tx.catalogItem.findUnique({ where: { code: material.code }, include: { materials: { select: { id: true } } } });
  if (catalog?.materials.some(row => row.id !== material.id)) throw new Error("O item de Compras já identifica outro material. Revise o vínculo do catálogo.");
  if (catalog && await tx.catalogItem.count({ where: { code: material.code, id: { not: catalog.id } } })) throw new Error("O código do material já está associado a outro item de Compras.");
  const data = { code: material.code, name: material.name, description: material.description, productKind: material.type, unit: material.unitOfMeasure, category: material.category.name, isActive: material.isActive };
  const result = catalog
    ? await tx.catalogItem.update({ where: { id: catalog.id }, data: { ...data, externalCode: catalog.externalCode || (catalog.code !== material.code ? catalog.code : null) } })
    : await tx.catalogItem.create({ data });
  if (material.catalogItemId !== result.id) await tx.material.update({ where: { id: material.id }, data: { catalogItemId: result.id } });
  return result;
}

async function serviceCode(tx: Tx) {
  const codes = await tx.catalogItem.findMany({ where: { code: { startsWith: "SRV" } }, select: { code: true } });
  const maximum = codes.reduce((max, row) => Math.max(max, Number(/^SRV(\d+)$/.exec(row.code || "")?.[1]) || 0), 0);
  const key = "compras-catalogo-servico";
  await tx.sequenceCounter.updateMany({ where: { key, value: { lt: maximum } }, data: { value: maximum } });
  const counter = await tx.sequenceCounter.upsert({ where: { key }, create: { key, value: maximum + 1 }, update: { value: { increment: 1 } }, select: { value: true } });
  if (counter.value > 999999) throw new Error("A sequência de serviços atingiu o limite.");
  return `SRV${String(counter.value).padStart(6, "0")}`;
}

export async function saveSharedCatalogItem(tx: Tx, input: { id?: string | null; name: string; description: string; category: string; unit: string; estimatedValue: number; isActive: boolean; productKind: ProcurementItemKind }) {
  const current = input.id ? await tx.catalogItem.findUniqueOrThrow({ where: { id: input.id }, include: { materials: true } }) : null;
  if (current && current.materials.length > 1) throw new Error("O catálogo está vinculado a mais de um material. Revise o cadastro.");
  if (current && current.productKind !== input.productKind) throw new Error("O tipo de um item cadastrado deve ser preservado. Cadastre outro item para um tipo diferente.");
  if (input.productKind === "SERVICO") {
    if (current?.materials.length) throw new Error("Serviços não podem ter vínculo com estoque físico.");
    const code = current?.code || await serviceCode(tx);
    const data = { ...input, id: undefined, code, productKind: "SERVICO" };
    return current ? tx.catalogItem.update({ where: { id: current.id }, data }) : tx.catalogItem.create({ data });
  }
  const existing = current?.materials[0];
  if (!materialUnitValues.some(unit => unit === input.unit) && input.unit !== existing?.unitOfMeasure) throw new Error("Selecione UN, KG, m ou KT para itens físicos.");
  if (existing && existing.unitOfMeasure !== input.unit && (await tx.materialStock.count({ where: { materialId: existing.id } }) || await tx.purchaseRequestItem.count({ where: { materialId: existing.id } }) || await tx.purchaseProcessItem.count({ where: { materialId: existing.id } }) || await tx.materialMovement.count({ where: { materialId: existing.id } }))) throw new Error("Não altere a unidade de um material com estoque ou documentos vinculados.");
  const categoryName = input.category || (input.productKind === "PATRIMONIO" ? "Equipamentos" : "Materiais de consumo");
  const category = await tx.materialCategory.findFirst({ where: { name: { equals: categoryName, mode: "insensitive" } } })
    || await tx.materialCategory.create({ data: { code: `COMP-${createHash("sha256").update(categoryName).digest("hex").slice(0, 12)}`, name: categoryName } });
  const data = { name: input.name, description: input.description || null, categoryId: category.id, type: input.productKind, unitOfMeasure: input.unit, isActive: input.isActive };
  const material = existing
    ? await tx.material.update({ where: { id: existing.id }, data })
    : await tx.material.create({ data: { ...data, code: await nextMaterialCode(tx, input.productKind), catalogItemId: current?.id } });
  const catalog = await syncMaterialCatalog(tx, material.id);
  return tx.catalogItem.update({ where: { id: catalog.id }, data: { estimatedValue: input.estimatedValue } });
}
