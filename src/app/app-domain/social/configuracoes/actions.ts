"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { catalogEntrySchema, minimumWageSchema } from "@/lib/social/catalog-policy";

export async function saveSocialCatalogEntry(input: unknown) {
  try {
    const data = catalogEntrySchema.parse(input);
    const { prisma } = await getTenantContextForModuleOperation("SOCIAL", data.id ? "update" : "create");
    if (data.id) {
      const current = await prisma.socialCatalogEntry.findUnique({ where: { id: data.id }, select: { kind: true } });
      if (!current || current.kind !== data.kind) return { error: "Um cadastro existente não pode mudar de catálogo." };
    }
    const duplicate = await prisma.socialCatalogEntry.findFirst({
      where: { kind: data.kind, name: { equals: data.name, mode: "insensitive" }, ...(data.id ? { id: { not: data.id } } : {}) },
    });
    if (duplicate) return { error: "Já existe um registro com esse nome neste catálogo." };
    const values = { kind: data.kind, name: data.name, description: data.description || null, isActive: data.isActive, allowedUnitTypes: data.allowedUnitTypes };
    if (data.id) {
      await prisma.socialCatalogEntry.update({ where: { id: data.id }, data: values });
    } else {
      await prisma.socialCatalogEntry.create({ data: values });
    }
    revalidatePath("/social/configuracoes");
    return { success: true };
  } catch {
    return { error: "Não foi possível salvar. Confira os dados e sua permissão de acesso." };
  }
}

export async function saveSocialMinimumWage(input: unknown) {
  try {
    const data = minimumWageSchema.parse(input);
    const { prisma } = await getTenantContextForModuleOperation("SOCIAL", "create");
    const validFrom = new Date(`${data.validFrom}T00:00:00.000Z`);
    if (await prisma.socialMinimumWage.findUnique({ where: { validFrom } })) {
      return { error: "Já existe um valor registrado para esta vigência. Registre uma nova vigência para preservar o histórico." };
    }
    await prisma.socialMinimumWage.create({ data: { validFrom, value: data.value } });
    revalidatePath("/social/configuracoes");
    return { success: true };
  } catch {
    return { error: "Não foi possível registrar o salário mínimo. Confira vigência, valor e permissão." };
  }
}
