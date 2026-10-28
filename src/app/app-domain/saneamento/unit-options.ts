"use server";

import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export async function searchConsumerUnits(search: string, activeOnly = false) {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const q = typeof search === "string" ? search.trim().slice(0, 120) : "";
  try {
    const units = await prisma.sanConsumerUnit.findMany({
      where: {
        ...(activeOnly ? { status: "Ativa" } : {}),
        ...(q ? { OR: ["code", "address", "ownerName"].map((field) => ({ [field]: { contains: q, mode: "insensitive" as const } })) } : {}),
      },
      select: { id: true, code: true, address: true }, orderBy: { code: "asc" }, take: 20,
    });
    return { units };
  } catch {
    return { units: [], error: "Não foi possível buscar as unidades consumidoras." };
  }
}
