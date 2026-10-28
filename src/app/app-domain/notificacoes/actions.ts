"use server";

import { revalidatePath } from "next/cache";
import { markInternalNotificationRead } from "@/lib/notifications/internal-notifications";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  try {
    const { user } = await getCurrentTenantContext();
    const marked = await withDatabaseTransaction(databaseConnection, tx => markInternalNotificationRead(tx, notificationId, user.id));
    if (!marked) throw new Error("Notificacao nao encontrada ou ja lida.");
    revalidatePath("/notificacoes");
    revalidatePath("/protocolos/notificacoes");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao atualizar notificacao." };
  }
}
