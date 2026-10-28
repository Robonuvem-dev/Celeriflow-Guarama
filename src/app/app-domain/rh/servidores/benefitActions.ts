"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createId } from "@/db/ids";
import { sstPayrollBenefits } from "@/db/schema/sst-benefits";

async function getTenantDatabase(operation: "create" | "delete") {
  return (await getTenantContextForModuleOperation("RH", operation)).database ?? db;
}

export async function addBenefitToEmployee(formData: FormData) {
  const database = await getTenantDatabase("create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const benefitConfigId = formData.get("benefitConfigId") as string;
    const customValueStr = formData.get("customValue") as string;
    
    if (!employeeId || !benefitConfigId) {
      return { success: false, error: "Servidor e Benefício são obrigatórios." };
    }

    const customValue = customValueStr ? parseFloat(customValueStr) : null;

    await database.insert(sstPayrollBenefits).values({
         id: createId(),
        employeeId,
        benefitConfigId,
        customValue,
    });

    revalidatePath(`/rh/servidores/${employeeId}/editar`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao conceder benefício:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao conceder benefício." };
  }
}

export async function removeBenefitFromEmployee(benefitId: string, employeeId: string) {
  const database = await getTenantDatabase("delete");
  try {
    const rows = await database.delete(sstPayrollBenefits).where(eq(sstPayrollBenefits.id, benefitId)).returning({ id: sstPayrollBenefits.id });
    if (!rows.length) throw new Error("Benefício do servidor não encontrado.");
    revalidatePath(`/rh/servidores/${employeeId}/editar`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao remover benefício:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao remover benefício." };
  }
}
