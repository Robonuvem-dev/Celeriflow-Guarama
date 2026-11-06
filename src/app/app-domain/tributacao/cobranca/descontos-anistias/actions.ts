"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { withDatabaseTransaction } from "@/db/transaction";
import {
  saveDiscountAmnestyInTransaction,
  deleteDiscountAmnestyInTransaction,
  type DiscountAmnestyInput
} from "./repository";

export async function saveDiscountAmnestyAction(input: DiscountAmnestyInput) {
  try {
    const { connection, user } = await taxActionContext("update");
    const actor = {
      usuarioId: user.id,
      employeeId: user.employeeId,
      allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds
    };
    await withDatabaseTransaction(connection, async tx => {
      await saveDiscountAmnestyInTransaction(tx, actor, input);
    });
    revalidatePath("/tributacao/cobranca/descontos-anistias");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao salvar parametrização de descontos/anistias." };
  }
}

export async function deleteDiscountAmnestyAction(id: string) {
  try {
    const { connection, user } = await taxActionContext("delete");
    const actor = {
      usuarioId: user.id,
      employeeId: user.employeeId,
      allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds
    };
    await withDatabaseTransaction(connection, async tx => {
      await deleteDiscountAmnestyInTransaction(tx, actor, id);
    });
    revalidatePath("/tributacao/cobranca/descontos-anistias");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao excluir parametrização de descontos/anistias." };
  }
}
