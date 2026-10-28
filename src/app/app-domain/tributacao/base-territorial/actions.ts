"use server";

import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { withDatabaseTransaction } from "@/db/transaction";
import { latestActionRegistryEntry, insertActionRegistryEntries, insertActionAudit } from "@/db/repositories/tax-actions/registry";

type Result = { error?: string };
function required(value: unknown, label: string) { const text = String(value ?? "").trim(); if (!text) throw new Error(`${label} é obrigatório.`); return text; }

export async function saveTerritorialRecord(input: { code: string; recordType: string; sectorCode: string; neighborhood: string; streetName: string; side?: string; rangeStart?: string; rangeEnd?: string; effectiveFrom: string }): Promise<Result> {
  try {
    const code = required(input.code, "Código").toUpperCase(); const recordType = required(input.recordType, "Tipo").toUpperCase();
    if (!["SETOR", "FACE", "FAIXA"].includes(recordType)) throw new Error("Tipo territorial inválido.");
    const effectiveFrom = new Date(`${required(input.effectiveFrom, "Vigência")}T12:00:00.000Z`); if (Number.isNaN(effectiveFrom.getTime())) throw new Error("Vigência inválida.");
    const context = await taxActionContext("create");
    await withDatabaseTransaction(context.connection, async (tx) => {
      const previous = await latestActionRegistryEntry(tx, "TERRITORIAL_BASE", code, recordType);
      const [entry] = await insertActionRegistryEntries(tx, [{ entityType: "TERRITORIAL_BASE", entityId: code, category: recordType, title: `${recordType} ${code}`, data: { details: `${input.streetName} · ${input.neighborhood}`, sectorCode: input.sectorCode, neighborhood: input.neighborhood, streetName: input.streetName, side: input.side || null, rangeStart: input.rangeStart || null, rangeEnd: input.rangeEnd || null }, status: "ATIVO", source: "INTERNO", effectiveFrom, actorUsuarioId: context.user.id, version: (previous?.version ?? 0) + 1 }]);
      await insertActionAudit(tx, { action: "UPSERT_TERRITORIAL_BASE", entityType: "TaxRegistryEntry", entityId: entry.id, payload: { code, recordType, version: entry.version }, authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId });
    }, { timeoutMs: 5000 });
    revalidatePath("/tributacao/base-territorial"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o registro territorial." }; }
}
