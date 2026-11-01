"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { recordRecyclingMovement } from "@/db/repositories/environment/recycling-stock";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { normalizeRecyclingMovementInput, RecyclingStockError, type RecyclingMovementResult } from "@/lib/environment/recycling-stock";

// Called with await by MovementForm; keep structured errors for its alert.
export async function recordRecyclingMovementAction(form: FormData): Promise<RecyclingMovementResult> {
  try {
    const context = await getTenantContextForModuleOperation("MEIO_AMBIENTE", "create");
    const text = (name: string, fallback = "") => {
      const value = form.get(name);
      return typeof value === "string" ? value : fallback;
    };
    const input = normalizeRecyclingMovementInput({
      kind: text("kind"), materialCode: text("materialCode"), depotCode: text("depotCode"),
      typeCode: text("typeCode"), unitCode: text("unitCode"), destinationCode: text("destinationCode"),
      quantity: text("quantity"), amount: text("amount", "0"), occurredOn: text("occurredOn"),
      origin: text("origin"), notes: text("notes"), idempotencyKey: text("idempotencyKey"),
    });
    const instance = await findOperationalInstance(context.database ?? db);
    if (!instance) return { error: "Configure a instância municipal antes de registrar a movimentação." };
    await withDatabaseTransaction(databaseConnection, tx => recordRecyclingMovement(tx, instance.id, context.user.id, input));
    revalidatePath("/app-domain/meio-ambiente/residuos/estoque");
    revalidatePath("/meio-ambiente/residuos/estoque");
    return { success: true };
  } catch (error) {
    if (error instanceof AccessError || error instanceof RecyclingStockError) return { error: error.message };
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Confira os campos da movimentação." };
    console.error("Falha ao registrar movimento de reciclagem", { name: error instanceof Error ? error.name : "Unknown" });
    return { error: "Não foi possível registrar a movimentação. Tente novamente com os mesmos dados para evitar duplicidade." };
  }
}
