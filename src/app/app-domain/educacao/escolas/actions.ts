"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { schools } from "@/db/schema/education-core";

export async function createSchool(formData: FormData) {
  await getTenantContextForModuleOperation("EDUCACAO", "create");
  const name = formData.get("name") as string;
  const inepCode = formData.get("inepCode") as string;
  const cnpj = formData.get("cnpj") as string;
  const capacity = Number(formData.get("capacity")) || 0;
  const directorId = formData.get("directorId") as string;
  const realEstateId = formData.get("realEstateId") as string;

  if (!name) {
    throw new Error("O nome da escola é obrigatório.");
  }

  try {
    await db.insert(schools).values({
        name,
        inepCode: inepCode || null,
        cnpj: cnpj || null,
        capacity,
        directorId: directorId || null,
        realEstateId: realEstateId || null,
        isActive: true,
    });
  } catch (error) {
    console.error("Erro ao criar escola:", error);
    throw new Error("Erro ao cadastrar escola. Verifique se o INEP já existe.");
  }

  revalidatePath("/app-domain/educacao/escolas");
  redirect("/educacao/escolas");
}
