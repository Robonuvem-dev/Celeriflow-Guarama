import { z } from "zod";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { reconcileCanonicalIdentityInTransaction } from "@/db/repositories/registry/reconciliation";

/** Adds missing canonical links without merging records or reassigning their history. */
export async function reconcileCanonicalIdentity(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "CADASTROS", "update")) throw new AccessError("Reconciliação cadastral não autorizada.", 403);
  const input = z.object({ identityType: z.enum(["PF", "PJ"]), identityId: z.string().trim().min(1), taxpayerId: z.string().trim().min(1).optional(), supplierId: z.string().trim().min(1).optional(), creditorId: z.string().trim().min(1).optional(), reason: z.string().trim().min(3).max(4000), idempotencyKey: z.string().trim().min(1).max(200) }).parse(raw);
  if (!input.taxpayerId && !input.supplierId && !input.creditorId) throw new Error("Selecione ao menos um cadastro a reconciliar.");
  if (input.creditorId && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Vincular credor exige autorização financeira.", 403);
  return withDatabaseTransaction(databaseConnection, tx => reconcileCanonicalIdentityInTransaction(tx, context.user.id, input));
}
