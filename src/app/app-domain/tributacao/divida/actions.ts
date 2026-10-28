"use server";

import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { insertActionDebt, updateActionDebt } from "@/db/repositories/tax-actions/records";
import { revalidatePath } from "next/cache";

export async function createActiveDebt(data: {
  cdaNumber: string;
  year: number;
  originDebtType: string;
  originalValue: number;
  updatedValue: number;
  taxpayerId: string;
}) {
  const { database } = await taxActionContext("create");
  const result = await insertActionDebt(database, {
      cdaNumber: data.cdaNumber,
      year: data.year,
      originDebtType: data.originDebtType,
      originalValue: data.originalValue,
      updatedValue: data.updatedValue,
      taxpayerId: data.taxpayerId,
      status: "Inscrita"
  });

  revalidatePath("/tributacao/divida");
  return result;
}

export async function updateActiveDebt(id: string, data: {
  cdaNumber?: string | null;
  year?: number;
  originDebtType?: string;
  originalValue?: number;
  updatedValue?: number;
}) {
  const { database } = await taxActionContext("update");
  const result = await updateActionDebt(database, id, data);

  revalidatePath("/tributacao/divida");
  return result;
}

export async function cancelActiveDebt(id: string) {
  const { database } = await taxActionContext("update");
  const result = await updateActionDebt(database, id, { status: "Cancelada" });

  revalidatePath("/tributacao/divida");
  return result;
}

export async function reactivateActiveDebt(id: string) {
  const { database } = await taxActionContext("update");
  const result = await updateActionDebt(database, id, { status: "Inscrita" });

  revalidatePath("/tributacao/divida");
  return result;
}
