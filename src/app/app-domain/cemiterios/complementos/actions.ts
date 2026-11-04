"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { cemeteryChangeHistory, cemeteryGraves } from "@/db/schema/cemeteries";
import { taxpayers } from "@/db/schema/registry";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export async function changeGraveOwner(form: FormData): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("CEMITERIOS", "update");
  const input = z.object({ graveId: z.string().min(1), taxpayerId: z.string().min(1), reason: z.string().trim().min(5).max(2000) }).parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT id FROM "TaxGrave" WHERE id=${input.graveId} FOR UPDATE`);
    const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.graveId)).limit(1);
    const [owner] = await tx.select().from(taxpayers).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
    if (!grave?.active || !owner) throw new Error("Selecione sepultura e contribuinte ativos.");
    if (grave.ownerTaxpayerId === owner.id) throw new Error("O contribuinte já é o proprietário.");
    await tx.update(cemeteryGraves).set({ ownerTaxpayerId: owner.id }).where(eq(cemeteryGraves.id, grave.id));
    await tx.insert(cemeteryChangeHistory).values({ targetType: "SEPULTURA", targetId: grave.id, fieldName: "transferenciaProprietario", previousValue: grave.ownerTaxpayerId, newValue: { taxpayerId: owner.id, reason: input.reason }, actorUsuarioId: user.id });
  });
  revalidatePath("/cemiterios", "layout");
}

export async function cancelGraveOwnerChange(form: FormData): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("CEMITERIOS", "update");
  const input = z.object({ historyId: z.string().min(1), reason: z.string().trim().min(5).max(2000) }).parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [change] = await tx.select().from(cemeteryChangeHistory).where(and(eq(cemeteryChangeHistory.id, input.historyId), eq(cemeteryChangeHistory.fieldName, "transferenciaProprietario"))).limit(1);
    if (!change || change.targetType !== "SEPULTURA") throw new Error("Transferência não encontrada.");
    await tx.execute(sql`SELECT id FROM "TaxGrave" WHERE id=${change.targetId} FOR UPDATE`);
    const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, change.targetId)).limit(1);
    const [latest] = await tx.select().from(cemeteryChangeHistory).where(and(eq(cemeteryChangeHistory.targetType, "SEPULTURA"), eq(cemeteryChangeHistory.targetId, change.targetId), sql`${cemeteryChangeHistory.fieldName} IN ('transferenciaProprietario','cancelamentoTransferencia','ownerTaxpayerId')`)).orderBy(desc(cemeteryChangeHistory.createdAt), desc(cemeteryChangeHistory.id)).limit(1);
    const value = change.newValue;
    if (!grave || latest?.id !== change.id || !value || typeof value !== "object" || Array.isArray(value) || value.taxpayerId !== grave.ownerTaxpayerId) throw new Error("Somente a última transferência vigente pode ser cancelada.");
    const previous = typeof change.previousValue === "string" ? change.previousValue : null;
    await tx.update(cemeteryGraves).set({ ownerTaxpayerId: previous }).where(eq(cemeteryGraves.id, grave.id));
    await tx.insert(cemeteryChangeHistory).values({ targetType: "SEPULTURA", targetId: grave.id, fieldName: "cancelamentoTransferencia", previousValue: grave.ownerTaxpayerId, newValue: { transferId: change.id, taxpayerId: previous, reason: input.reason }, actorUsuarioId: user.id });
  });
  revalidatePath("/cemiterios", "layout");
}

export async function saveGraveMap(form: FormData): Promise<void> {
  const { user } = await getTenantContextForModuleOperation("CEMITERIOS", "update");
  const input = z.object({ graveId: z.string().min(1), x: z.coerce.number().int().min(0).max(1000), y: z.coerce.number().int().min(0).max(1000), floor: z.string().trim().max(30), removalDue: z.union([z.literal(""), z.iso.date()]) }).parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT id FROM "TaxGrave" WHERE id=${input.graveId} FOR UPDATE`);
    const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.graveId)).limit(1);
    if (!grave) throw new Error("Sepultura não encontrada.");
    const existing = grave.additionalData && typeof grave.additionalData === "object" && !Array.isArray(grave.additionalData) ? grave.additionalData : {};
    const metadata = { x: input.x, y: input.y, floor: input.floor, removalDue: input.removalDue };
    await tx.update(cemeteryGraves).set({ additionalData: { ...existing, cf23: metadata } }).where(eq(cemeteryGraves.id, grave.id));
    await tx.insert(cemeteryChangeHistory).values({ targetType: "SEPULTURA", targetId: grave.id, fieldName: "additionalData.cf23", previousValue: existing.cf23 ?? null, newValue: metadata, actorUsuarioId: user.id });
  });
  revalidatePath("/cemiterios", "layout");
}
