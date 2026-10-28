"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, count } from "drizzle-orm";
import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { sstBenefitConfigs, sstPayrollBenefits } from "@/db/schema/sst-benefits";

async function getTenantDatabase(operation: "create" | "update" | "delete") {
  return (await getTenantContextForModuleOperation("RH", operation)).database ?? db;
}

export async function saveBeneficio(formData: FormData) {
  const id = formData.get("id") as string;
  const database = await getTenantDatabase(id ? "update" : "create");
  try {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const baseValue = parseFloat(formData.get("baseValue") as string);
    const supplierId = formData.get("supplierId") as string;
    const isActive = formData.get("isActive") === "true";

    if (!name || !type || isNaN(baseValue)) {
      return { success: false, error: "Nome, Tipo e Valor Base são obrigatórios." };
    }

    const data = {
      name,
      type,
      baseValue,
      supplierId: supplierId && supplierId !== 'none' ? supplierId : null,
      isActive,
    };

    if (id) {
      const rows = await database.update(sstBenefitConfigs).set(data).where(eq(sstBenefitConfigs.id, id)).returning({ id: sstBenefitConfigs.id });
      if (!rows.length) throw new Error("Benefício não encontrado.");
    } else {
      await database.insert(sstBenefitConfigs).values({ id: createId(), ...data });
    }

    revalidatePath("/rh/beneficios");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar benefício master:", error);
    return { success: false, error: error instanceof Error ? error.message : "Ocorreu um erro ao salvar." };
  }
}

export async function toggleBeneficioStatus(id: string, isActive: boolean) {
  const database = await getTenantDatabase("update");
  try {
    const rows = await database.update(sstBenefitConfigs).set({ isActive }).where(eq(sstBenefitConfigs.id, id)).returning({ id: sstBenefitConfigs.id });
    if (!rows.length) throw new Error("Benefício não encontrado.");
    revalidatePath("/rh/beneficios");
    return { success: true };
  } catch (error) {
    console.error("Erro ao alternar status do benefício:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao alternar status do benefício." };
  }
}

export async function deleteBeneficio(id: string) {
  const database = await getTenantDatabase("delete");
  try {
    // Should check if it has payroll benefits linked before deleting
    const [linked] = await database.select({ count: count() }).from(sstPayrollBenefits).where(eq(sstPayrollBenefits.benefitConfigId, id));
    if (linked.count > 0) {
      return { success: false, error: "Este benefício já está vinculado a servidores e não pode ser excluído. Inative-o em vez disso." };
    }

    const rows = await database.delete(sstBenefitConfigs).where(eq(sstBenefitConfigs.id, id)).returning({ id: sstBenefitConfigs.id });
    if (!rows.length) throw new Error("Benefício não encontrado.");
    revalidatePath("/rh/beneficios");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir benefício:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao excluir benefício." };
  }
}
