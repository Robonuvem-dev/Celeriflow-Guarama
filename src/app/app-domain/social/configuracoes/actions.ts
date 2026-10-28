"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { catalogEntrySchema, minimumWageSchema } from "@/lib/social/catalog-policy";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { and, eq, ne, sql } from "drizzle-orm";
import { socialCatalogEntries, socialMinimumWages } from "@/db/schema/social";

export async function saveSocialCatalogEntry(input: unknown) {
  try {
    const data = catalogEntrySchema.parse(input);
    const context = await getTenantContextForModuleOperation("SOCIAL", data.id ? "update" : "create");
    const database = context.database ?? db;
    if (data.id) {
      const [current] = await database.select({ kind: socialCatalogEntries.kind }).from(socialCatalogEntries).where(eq(socialCatalogEntries.id, data.id));
      if (!current || current.kind !== data.kind) return { error: "Um cadastro existente não pode mudar de catálogo." };
    }
    const [duplicate] = await database.select({ id: socialCatalogEntries.id }).from(socialCatalogEntries).where(and(eq(socialCatalogEntries.kind, data.kind), sql`lower(${socialCatalogEntries.name}) = lower(${data.name})`, data.id ? ne(socialCatalogEntries.id, data.id) : undefined)).limit(1);
    if (duplicate) return { error: "Já existe um registro com esse nome neste catálogo." };
    const values = { kind: data.kind, name: data.name, description: data.description || null, isActive: data.isActive, allowedUnitTypes: data.allowedUnitTypes };
    if (data.id) {
      await database.update(socialCatalogEntries).set(values).where(eq(socialCatalogEntries.id, data.id));
    } else {
      await database.insert(socialCatalogEntries).values(values);
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
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const database = context.database ?? db;
    const validFrom = new Date(`${data.validFrom}T00:00:00.000Z`);
    if ((await database.select({ id: socialMinimumWages.id }).from(socialMinimumWages).where(eq(socialMinimumWages.validFrom, validFrom))).length) {
      return { error: "Já existe um valor registrado para esta vigência. Registre uma nova vigência para preservar o histórico." };
    }
    await database.insert(socialMinimumWages).values({ validFrom, value: new Decimal(data.value) });
    revalidatePath("/social/configuracoes");
    return { success: true };
  } catch {
    return { error: "Não foi possível registrar o salário mínimo. Confira vigência, valor e permissão." };
  }
}
