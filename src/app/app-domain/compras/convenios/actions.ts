"use server";

import { Decimal } from "@/db/decimal";
import { and, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction } from "@/db/transaction";
import { procurementCovenants, instrumentMeasurements, instrumentInstallments } from "@/db/schema/procurement-instruments";
import { procurementLifecycleEvents } from "@/db/schema/procurement-requests";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  ContractLifecycleError,
  assertInstrumentAggregateTotalWithinCurrentValue,
  calculateInclusiveContractTermDays,
  parseContractDate,
  requiredLifecycleText,
} from "@/lib/compras/contract-lifecycle";

type CovenantActionResult = { success: true } | { success: false; error: string };

const covenantStatuses = ["Ativo", "Suspenso", "Encerrado", "Rescindido", "Em análise"];
const activeMeasurementStatuses = ["Rascunho", "Em análise", "Atestada"];

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formDecimal(formData: FormData, name: string, label: string) {
  const value = formString(formData, name);
  if (!/^\d{1,16}(?:[.,]\d{1,2})?$/.test(value)) {
    throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")} com até duas casas decimais.`);
  }
  const numericValue = Number(value.replace(",", "."));
  if (!Number.isFinite(numericValue) || numericValue < 0) throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")} válido.`);
  return new Decimal(value.replace(",", "."));
}

function idempotencyKey(formData: FormData, scope: string) {
  const value = formString(formData, "idempotencyKey");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new ContractLifecycleError("Não foi possível validar a repetição segura da ação. Atualize a página e tente novamente.");
  }
  return `${scope}:${value}`;
}

function revalidateCovenantPaths(id?: string) {
  revalidatePath("/compras/convenios");
  if (id) {
    revalidatePath(`/compras/convenios/${id}`);
    revalidatePath(`/compras/convenios/${id}/editar`);
    revalidatePath(`/compras/convenios/${id}/relatorio`);
  }
}

function actionFailure(error: unknown, fallback: string): CovenantActionResult {
  if (error instanceof ContractLifecycleError || error instanceof AccessError) return { success: false, error: error.message };
  if (getPostgresError(error)?.code === "23505") {
    return { success: false, error: "Já existe um convênio com esse número." };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

export async function saveCovenant(formData: FormData): Promise<CovenantActionResult> {
  try {
    const id = formString(formData, "id") || null;
    const number = requiredLifecycleText(formString(formData, "number"), "o número do convênio", 120);
    const grantor = requiredLifecycleText(formString(formData, "grantor"), "o concedente", 300);
    const description = requiredLifecycleText(formString(formData, "description"), "a descrição", 2_000);
    const totalValueDecimal = formDecimal(formData, "totalValueDecimal", "o valor total");
    const startDate = parseContractDate(formString(formData, "startDate"));
    const endDate = parseContractDate(formString(formData, "endDate"));
    const status = formString(formData, "status") || "Ativo";
    if (!startDate || !endDate) return { success: false, error: "Informe a vigência do convênio." };
    calculateInclusiveContractTermDays(startDate, endDate);
    if (!covenantStatuses.includes(status)) return { success: false, error: "Situação do convênio inválida." };

    const context = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");
    const key = idempotencyKey(formData, id ? `COVENANT_UPDATE:${id}` : "COVENANT_CREATE");
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const [existingEvent] = await tx.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, key)).limit(1);
      if (existingEvent) {
        if (existingEvent.entityType !== "COVENANT" || existingEvent.sourceType !== "COVENANT") {
          throw new ContractLifecycleError("A chave de repetição já foi usada em outro ato.");
        }
        return { id: existingEvent.sourceId ?? existingEvent.entityId };
      }

      const data = { number, grantor, description, totalValueDecimal, startDate, endDate, status };
      if (!id) {
        const [created] = await tx.insert(procurementCovenants).values(data).returning({ id: procurementCovenants.id });
        await tx.insert(procurementLifecycleEvents).values({
            eventType: "COVENANT_CREATED",
            entityType: "COVENANT",
            entityId: created.id,
            sourceType: "COVENANT",
            sourceId: created.id,
            actorUsuarioId: context.user.id,
            idempotencyKey: key,
        });
        return { id: created.id };
      }

      const [existing] = await tx.select().from(procurementCovenants).where(eq(procurementCovenants.id, id)).limit(1).for("update");
      if (!existing) throw new ContractLifecycleError("Convênio não encontrado.");
      const [[measurementAggregate], [installmentAggregate]] = await Promise.all([
        tx.select({ value: sql<string>`coalesce(sum(${instrumentMeasurements.valueDecimal}), 0)::text` }).from(instrumentMeasurements).where(and(eq(instrumentMeasurements.covenantId, existing.id), inArray(instrumentMeasurements.status, activeMeasurementStatuses))),
        tx.select({ value: sql<string>`coalesce(sum(${instrumentInstallments.valueDecimal}), 0)::text` }).from(instrumentInstallments).where(and(eq(instrumentInstallments.covenantId, existing.id), eq(instrumentInstallments.status, "Programada"))),
      ]);
      assertInstrumentAggregateTotalWithinCurrentValue(
        totalValueDecimal,
        measurementAggregate.value,
        "medições ativas",
      );
      assertInstrumentAggregateTotalWithinCurrentValue(
        totalValueDecimal,
        installmentAggregate.value,
        "parcelas programadas",
      );
      const updated = await tx.update(procurementCovenants).set(data).where(and(eq(procurementCovenants.id, existing.id), eq(procurementCovenants.updatedAt, existing.updatedAt))).returning({ id: procurementCovenants.id });
      if (updated.length !== 1) throw new ContractLifecycleError("O convênio foi alterado por outra operação. Atualize e tente novamente.");
      await tx.insert(procurementLifecycleEvents).values({
          eventType: existing.status === status ? "COVENANT_UPDATED" : "COVENANT_STATUS_UPDATED",
          entityType: "COVENANT",
          entityId: existing.id,
          sourceType: "COVENANT",
          sourceId: existing.id,
          actorUsuarioId: context.user.id,
          idempotencyKey: key,
      });
      return { id: existing.id };
    });

    revalidateCovenantPaths(result.id);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar o convênio.");
  }
}

export async function deleteCovenant(id: string): Promise<CovenantActionResult> {
  try {
    const covenantId = String(id || "").trim();
    if (!covenantId) return { success: false, error: "Convênio inválido." };
    const context = await getTenantContextForModuleOperation("COMPRAS", "delete");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const key = `COVENANT_DELETE:${covenantId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const [existingEvent] = await tx.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, key)).limit(1);
      if (existingEvent) {
        if (existingEvent.entityType !== "COVENANT" || existingEvent.sourceType !== "COVENANT" || existingEvent.sourceId !== covenantId) {
          throw new ContractLifecycleError("A chave de repetição já foi usada em outro ato.");
        }
        return;
      }

      const [covenant] = await tx.select().from(procurementCovenants).where(eq(procurementCovenants.id, covenantId)).limit(1).for("update");
      if (!covenant) throw new ContractLifecycleError("Convênio não encontrado.");
      const dependencies = await tx.execute<{ present: boolean }>(sql`SELECT
        EXISTS (SELECT 1 FROM "Commitment" WHERE "covenantId" = ${covenantId}) OR
        EXISTS (SELECT 1 FROM "InstrumentParty" WHERE "covenantId" = ${covenantId}) OR
        EXISTS (SELECT 1 FROM "InstrumentResponsibilityGroup" WHERE "covenantId" = ${covenantId}) OR
        EXISTS (SELECT 1 FROM "InstrumentMeasurement" WHERE "covenantId" = ${covenantId}) OR
        EXISTS (SELECT 1 FROM "InstrumentInstallment" WHERE "covenantId" = ${covenantId}) AS present`);
      if (dependencies.rows[0].present) throw new ContractLifecycleError("Convênio com execução, partes, parcelas ou empenhos vinculados não pode ser excluído. Use o encerramento do instrumento.");

      const deleted = await tx.delete(procurementCovenants).where(and(eq(procurementCovenants.id, covenant.id), eq(procurementCovenants.updatedAt, covenant.updatedAt))).returning({ id: procurementCovenants.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("O convênio foi alterado por outra operação. Atualize e tente novamente.");
      await tx.insert(procurementLifecycleEvents).values({
          eventType: "COVENANT_DELETED",
          entityType: "COVENANT",
          entityId: covenant.id,
          sourceType: "COVENANT",
          sourceId: covenant.id,
          actorUsuarioId: context.user.id,
          idempotencyKey: key,
      });
    });

    revalidateCovenantPaths(covenantId);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir o convênio.");
  }
}
