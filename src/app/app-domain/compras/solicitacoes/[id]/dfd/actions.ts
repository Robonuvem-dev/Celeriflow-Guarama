"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { loadDemandDraft, recordDemandVersion } from "@/db/repositories/procurement/purchase-demand";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { withDatabaseTransaction } from "@/db/transaction";
import { assertPurchaseRequestOrigin } from "@/lib/compras/purchase-request-policy";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export async function formalizeDemand(id: string, expectedVersion: number): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("COMPRAS", "update");
  const version = await withDatabaseTransaction(databaseConnection, async tx => {
    const [source] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update");
    if (!source?.approvedAt || source.status === "Rascunho") {
      throw new Error("A solicitação precisa estar aprovada para formalizar o DFD.");
    }
    assertPurchaseRequestOrigin(user, source);
    const draft = await loadDemandDraft(tx, id);
    if (!draft) throw new Error("Solicitação indisponível.");
    return recordDemandVersion(tx, id, user.id, expectedVersion, draft.snapshot);
  });
  redirect(`/compras/solicitacoes/${id}/dfd?versao=${version}`);
}
