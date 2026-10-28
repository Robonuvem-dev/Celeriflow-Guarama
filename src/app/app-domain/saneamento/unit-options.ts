"use server";

import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { searchConsumerUnitOptions } from "@/db/repositories/sanitation/operations";

export async function searchConsumerUnits(search: string, activeOnly = false) {
  const context = await getTenantContextForModule("SANEAMENTO");
  const q = typeof search === "string" ? search.trim().slice(0, 120) : "";
  try {
    const units = await searchConsumerUnitOptions(context.database ?? db, q, activeOnly);
    return { units };
  } catch {
    return { units: [], error: "Não foi possível buscar as unidades consumidoras." };
  }
}
