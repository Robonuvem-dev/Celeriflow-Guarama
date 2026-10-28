"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { recordSchoolMealInTransaction } from "@/lib/educacao/school-meal-service";

export async function createSchoolMeal(formData: FormData) {
  await getTenantContextForModuleOperation("EDUCACAO", "create");
  const schoolId = formData.get("schoolId") as string;
  const menu = formData.get("menu") as string;
  const servedQuantity = Number(formData.get("servedQuantity")) || 0;
  const totalCost = Number(formData.get("totalCost")) || 0;
  const notes = formData.get("notes") as string;

  if (!schoolId || !menu || servedQuantity <= 0) {
    throw new Error("Escola, Cardápio e Quantidade são obrigatórios.");
  }

  try {
    await withDatabaseTransaction(databaseConnection, tx => recordSchoolMealInTransaction(tx, { schoolId, menu, servedQuantity, totalCost, notes }));

  } catch (error) {
    console.error("Erro ao registrar merenda:", error);
    throw new Error("Ocorreu um erro ao registrar a merenda e integrar com financeiro.");
  }

  revalidatePath("/app-domain/educacao/merenda");
  redirect("/educacao/merenda");
}
