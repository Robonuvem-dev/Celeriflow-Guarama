"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { costCenters } from "@/db/schema/master-data";

const costCenterInput = z.object({
  code: z.string().trim().min(1, "Informe o código do centro de custo.").max(60),
  name: z.string().trim().min(1, "Informe o nome do centro de custo.").max(180),
  description: z.string().trim().max(2000).optional(),
});

type CostCenterActionResult = { error?: string };

function parse(formData: FormData) {
  return costCenterInput.safeParse({ code: String(formData.get("code") || "").toUpperCase(), name: formData.get("name"), description: formData.get("description") });
}

function revalidateCostCenters() {
  revalidatePath("/patrimonio/centros-custo");
  revalidatePath("/patrimonio/almoxarifados");
  revalidatePath("/patrimonio", "layout");
}

export async function createCostCenterAction(formData: FormData): Promise<void> {
  const parsed = parse(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Dados do centro de custo inválidos.");
  await getTenantContextForModuleOperation("PATRIMONIO", "create");
  const [existing] = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.code, parsed.data.code)).limit(1);
  if (existing) throw new Error("Já existe um centro de custo com este código.");
  await db.insert(costCenters).values({ code: parsed.data.code, name: parsed.data.name, description: parsed.data.description || null });
  revalidateCostCenters();
  redirect("/patrimonio/centros-custo");
}

export async function updateCostCenterAction(id: string, formData: FormData): Promise<void> {
  const parsed = parse(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Dados do centro de custo inválidos.");
  await getTenantContextForModuleOperation("PATRIMONIO", "update");
  const [existing] = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.id, id)).limit(1);
  const [duplicate] = await db.select({ id: costCenters.id }).from(costCenters).where(and(eq(costCenters.code, parsed.data.code), ne(costCenters.id, id))).limit(1);
  if (!existing) throw new Error("Centro de custo não encontrado.");
  if (duplicate) throw new Error("Já existe um centro de custo com este código.");
  await db.update(costCenters).set({ code: parsed.data.code, name: parsed.data.name, description: parsed.data.description || null }).where(eq(costCenters.id, id));
  revalidateCostCenters();
  redirect("/patrimonio/centros-custo");
}

export async function setCostCenterActiveAction(id: string, active: boolean): Promise<CostCenterActionResult> {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const [costCenter] = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.id, id)).limit(1);
    if (!costCenter) throw new Error("Centro de custo não encontrado.");
    await db.update(costCenters).set({ isActive: active }).where(eq(costCenters.id, id));
    revalidateCostCenters();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a situação do centro de custo." };
  }
}

export async function deleteCostCenterAction(id: string): Promise<CostCenterActionResult> {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "delete");
    const [costCenter] = await db.select({ id: costCenters.id, warehouseCount: sql<number>`(SELECT count(*)::int FROM "Warehouse" WHERE "costCenterId"=${costCenters.id})` }).from(costCenters).where(eq(costCenters.id, id)).limit(1);
    if (!costCenter) throw new Error("Centro de custo não encontrado.");
    if (costCenter.warehouseCount > 0) throw new Error("Este centro de custo está vinculado a almoxarifados. Inative-o ou remova os vínculos antes de excluir.");
    await db.delete(costCenters).where(eq(costCenters.id, id));
    revalidateCostCenters();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível excluir o centro de custo." };
  }
}
