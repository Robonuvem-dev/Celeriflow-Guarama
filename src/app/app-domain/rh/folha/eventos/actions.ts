"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payrollEvents } from "@/db/schema/personnel-workforce";

async function getTenantDatabase(operation: "create" | "update") {
  return (await getTenantContextForModuleOperation("RH", operation)).database ?? db;
}

export async function saveEvent(formData: FormData) {
  const id = formData.get("id") as string;
  const database = await getTenantDatabase(id ? "update" : "create");
  try {
    const code = formData.get("code") as string;
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const formula = formData.get("formula") as string;
    const isActive = formData.get("isActive") === "true";

    if (!code || !name || !type) {
      return { success: false, error: "Código, Nome e Tipo são obrigatórios." };
    }

    // Verificar se código já existe (se for novo ou se mudou de código)
    const [existing] = await database.select().from(payrollEvents).where(eq(payrollEvents.code, code)).limit(1);

    if (existing && existing.id !== id) {
      return { success: false, error: "Este código já está em uso por outro evento." };
    }

    const data = {
      code,
      name,
      type,
      formula: formula || null,
      isActive,
    };

    if (id) {
      const rows = await database.update(payrollEvents).set(data).where(eq(payrollEvents.id, id)).returning({ id: payrollEvents.id });
      if (!rows.length) throw new Error("Evento não encontrado.");
    } else {
      await database.insert(payrollEvents).values(data);
    }

    revalidatePath("/rh/folha/eventos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar evento:", error);
    return { success: false, error: error instanceof Error ? error.message : "Ocorreu um erro ao salvar." };
  }
}
