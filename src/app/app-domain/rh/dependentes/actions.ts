"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { saveCanonicalDependent } from "@/lib/rh/dependent-service";

async function getTenantPrisma(operation: "create" | "update" | "delete") {
  return (await getTenantContextForModuleOperation("RH", operation)).prisma;
}

export async function saveDependente(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    await saveCanonicalDependent(context.prisma, context.user.id, { id: id || undefined, employeeId: String(formData.get("employeeId") || ""), personId: String(formData.get("personId") || ""), relationship: String(formData.get("relationship") || ""), irrfDependent: formData.get("irrfDependent") === "on", familyWage: formData.get("familyWage") === "on" });

    revalidatePath("/rh/dependentes");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar dependente:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o dependente." };
  }
}

export async function deleteDependente(id: string) {
  const prisma = await getTenantPrisma("delete");
  try {
    await prisma.dependent.delete({
      where: { id },
    });
    revalidatePath("/rh/dependentes");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir dependente:", error);
    return { success: false, error: "Falha ao excluir o dependente." };
  }
}
