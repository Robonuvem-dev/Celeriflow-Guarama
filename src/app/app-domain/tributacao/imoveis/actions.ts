"use server";

import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { createPropertyWithHistory } from "@/lib/tributacao/property-history";
import { attributePropertyHistory } from "@/lib/tributacao/property-history";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { lockProperty, mutateProperty as updateProperty, readLatestPropertyProfile, propertyProcessExists } from "@/db/repositories/tax-property/records";
import type { PropertyMutation } from "@/db/repositories/tax-property/contracts";

async function mutateProperty(id: string, data: PropertyMutation, processId?: string) {
  try {
    const { connection, user } = await taxActionContext("update");
    const result = await withDatabaseTransaction(connection, async tx => {
      await lockProperty(tx, id);
      const profile = await readLatestPropertyProfile(tx, id);
      const scope = taxScopeSnapshot(profile?.data);
      if (!isSystemAdministrator(user) && (typeof scope.budgetUnitId !== "string" || !user.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Imóvel fora da UG autorizada ou sem origem conciliada.");
      if (processId && !await propertyProcessExists(tx, processId)) throw new Error("Protocolo não encontrado.");
      await attributePropertyHistory(tx, user.id);
      await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process',${processId?.trim() ?? ""},true)`);
      return updateProperty(tx, id, data);
    }, { timeoutMs: 5000 });
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
  const { connection, user } = await taxActionContext("create");
  const result = await createPropertyWithHistory(connection, user.id, {
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
