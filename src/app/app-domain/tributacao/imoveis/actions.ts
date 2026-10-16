"use server";

import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { createPropertyWithHistory } from "@/lib/tributacao/property-history";
import { attributePropertyHistory } from "@/lib/tributacao/property-history";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import type { Prisma } from "@prisma/client";

async function mutateProperty(id: string, data: Prisma.RealEstateUncheckedUpdateInput, processId?: string) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${id} FOR UPDATE`;
      const profile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
      const scope = taxScopeSnapshot(profile?.data);
      if (!isSystemAdministrator(user) && (typeof scope.budgetUnitId !== "string" || !user.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Imóvel fora da UG autorizada ou sem origem conciliada.");
      if (processId && !await tx.process.findUnique({ where: { id: processId } })) throw new Error("Protocolo não encontrado.");
      await attributePropertyHistory(tx, user.id);
      await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process',${processId?.trim() ?? ""},true)`;
      return tx.realEstate.update({ where: { id }, data });
    });
    revalidatePath("/tributacao/imoveis"); revalidatePath(`/tributacao/imoveis/${id}`); return { id: result.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar o imóvel." }; }
}

export async function createRealEstate(data: {
  municipalInsc: string;
  streetName: string;
  number: string;
  propertyType: string;
  landArea: number;
  builtArea: number;
  taxpayerId?: string;
  registration?: string;
  propertyUse?: string;
  fiscalZone?: string;
  lot?: string;
  block?: string;
}) {
  const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
  const result = await createPropertyWithHistory(prisma, user.id, {
      municipalInsc: data.municipalInsc || undefined,
      streetName: data.streetName,
      number: data.number,
      propertyType: data.propertyType,
      landArea: data.landArea,
      builtArea: data.builtArea,
      taxpayerId: data.taxpayerId || undefined,
      registration: data.registration || undefined,
      propertyUse: data.propertyUse || undefined,
      fiscalZone: data.fiscalZone || undefined,
      lot: data.lot || undefined,
      block: data.block || undefined,
      status: "Regular"
  });

  revalidatePath("/tributacao/imoveis");
  return result;
}

export async function updateRealEstate(id: string, data: {
  municipalInsc?: string | null;
  streetName?: string | null;
  number?: string | null;
  propertyType?: string;
  landArea?: number | null;
  builtArea?: number | null;
}, processId?: string) {
  return mutateProperty(id, data, processId);
}

export async function deactivateRealEstate(id: string, processId?: string) {
  return mutateProperty(id, { status: "Inativo" }, processId);
}

export async function activateRealEstate(id: string, processId?: string) {
  return mutateProperty(id, { status: "Ativo" }, processId);
}
