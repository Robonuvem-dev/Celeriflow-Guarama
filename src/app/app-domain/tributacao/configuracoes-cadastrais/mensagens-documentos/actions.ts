"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { withDatabaseTransaction } from "@/db/transaction";
import {
  saveDocumentMessageInTransaction,
  deleteDocumentMessageInTransaction,
  type DocumentMessageInput
} from "./repository";

export async function saveDocumentMessageAction(input: DocumentMessageInput) {
  try {
    const { connection, user } = await taxActionContext("update");
    const actor = {
      usuarioId: user.id,
      employeeId: user.employeeId,
      allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds
    };
    await withDatabaseTransaction(connection, async tx => {
      await saveDocumentMessageInTransaction(tx, actor, input);
    });
    revalidatePath("/tributacao/configuracoes-cadastrais/mensagens-documentos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao salvar mensagem de documento." };
  }
}

export async function deleteDocumentMessageAction(id: string) {
  try {
    const { connection, user } = await taxActionContext("delete");
    const actor = {
      usuarioId: user.id,
      employeeId: user.employeeId,
      allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds
    };
    await withDatabaseTransaction(connection, async tx => {
      await deleteDocumentMessageInTransaction(tx, actor, id);
    });
    revalidatePath("/tributacao/configuracoes-cadastrais/mensagens-documentos");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao excluir mensagem de documento." };
  }
}
