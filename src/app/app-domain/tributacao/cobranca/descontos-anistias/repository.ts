import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { taxRegistrySnapshot } from "@/lib/tributacao/registry-data";
import { z } from "zod";
import type { TaxActor } from "@/lib/tributacao";

export const discountAmnestyScopeEnum = z.enum(["TODOS", "IMOBILIARIO", "ECONOMICO", "DIVERSOS"]);
export const debtOriginTypeEnum = z.enum(["DIVIDA_DO_ANO", "DIVIDA_ATIVA", "DIVIDA_AJUIZADA", "SEGUNDA_VIA", "PORTAL"]);

export const discountAmnestySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  scopeType: discountAmnestyScopeEnum.default("TODOS"),
  originType: debtOriginTypeEnum.default("DIVIDA_DO_ANO"),
  debtStatus: z.enum(["TODOS", "EM_ABERTO", "VENCIDO", "PARCELADO", "AJUIZADO"]).default("TODOS"),
  validFrom: z.string().min(1),
  validUntil: z.string().min(1),
  dueDateLimit: z.string().optional().nullable(),
  referenceMessage: z.string().trim().max(1000).optional().nullable(),
  principalDiscountPercent: z.number().min(0).max(100).default(0),
  penaltyDiscountPercent: z.number().min(0).max(100).default(0),
  interestDiscountPercent: z.number().min(0).max(100).default(0),
  correctionDiscountPercent: z.number().min(0).max(100).default(0),
  active: z.boolean().default(true),
  legalReference: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(4000)
});

export type DiscountAmnestyInput = z.infer<typeof discountAmnestySchema>;

export type DiscountAmnestyItem = Awaited<ReturnType<typeof listDiscountAmnesties>>[number];

export async function listDiscountAmnesties(db: DatabaseExecutor) {
  const rows = await db
    .select()
    .from(taxRegistryEntries)
    .where(
      and(
        eq(taxRegistryEntries.entityType, "TAX_COLLECTION"),
        eq(taxRegistryEntries.category, "DISCOUNT_AMNESTY_RULE")
      )
    )
    .orderBy(desc(taxRegistryEntries.createdAt));

  return rows.map(r => {
    const data = taxRegistrySnapshot(r.data);
    return {
      id: r.id,
      name: r.title,
      scopeType: String(data.scopeType ?? "TODOS"),
      originType: String(data.originType ?? "DIVIDA_DO_ANO"),
      debtStatus: String(data.debtStatus ?? "TODOS"),
      validFrom: String(data.validFrom ?? ""),
      validUntil: String(data.validUntil ?? ""),
      dueDateLimit: data.dueDateLimit ? String(data.dueDateLimit) : null,
      referenceMessage: data.referenceMessage ? String(data.referenceMessage) : null,
      principalDiscountPercent: Number(data.principalDiscountPercent ?? 0),
      penaltyDiscountPercent: Number(data.penaltyDiscountPercent ?? 0),
      interestDiscountPercent: Number(data.interestDiscountPercent ?? 0),
      correctionDiscountPercent: Number(data.correctionDiscountPercent ?? 0),
      active: r.status === "ATIVO",
      legalReference: String(data.legalReference ?? ""),
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      actorUsuarioId: r.actorUsuarioId
    };
  });
}

export async function saveDiscountAmnestyInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  raw: DiscountAmnestyInput
) {
  const input = discountAmnestySchema.parse(raw);
  const now = new Date();
  const effectiveFrom = new Date(input.validFrom);
  const effectiveUntil = new Date(input.validUntil);

  let previous = null;
  if (input.id) {
    [previous] = await tx
      .select()
      .from(taxRegistryEntries)
      .where(
        and(
          eq(taxRegistryEntries.id, input.id),
          eq(taxRegistryEntries.entityType, "TAX_COLLECTION"),
          eq(taxRegistryEntries.category, "DISCOUNT_AMNESTY_RULE")
        )
      )
      .limit(1);
  }

  const payloadData = {
    scopeType: input.scopeType,
    originType: input.originType,
    debtStatus: input.debtStatus,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    dueDateLimit: input.dueDateLimit ?? null,
    referenceMessage: input.referenceMessage ?? null,
    principalDiscountPercent: input.principalDiscountPercent,
    penaltyDiscountPercent: input.penaltyDiscountPercent,
    interestDiscountPercent: input.interestDiscountPercent,
    correctionDiscountPercent: input.correctionDiscountPercent,
    legalReference: input.legalReference,
    reason: input.reason,
    previousId: previous?.id ?? null
  };

  let entryId: string;
  if (previous) {
    const [updated] = await tx
      .update(taxRegistryEntries)
      .set({
        title: input.name,
        version: previous.version + 1,
        status: input.active ? "ATIVO" : "INATIVO",
        effectiveFrom,
        effectiveUntil,
        actorUsuarioId: actor.usuarioId,
        data: payloadData,
        updatedAt: now
      })
      .where(eq(taxRegistryEntries.id, previous.id))
      .returning();
    entryId = updated.id;
  } else {
    const [inserted] = await tx
      .insert(taxRegistryEntries)
      .values({
        entityType: "TAX_COLLECTION",
        entityId: "SYSTEM_AMNESTIES",
        category: "DISCOUNT_AMNESTY_RULE",
        title: input.name,
        status: input.active ? "ATIVO" : "INATIVO",
        effectiveFrom,
        effectiveUntil,
        version: 1,
        actorUsuarioId: actor.usuarioId,
        data: payloadData
      })
      .returning();
    entryId = inserted.id;
  }

  await tx.insert(taxAuditLogs).values({
    action: previous ? "UPDATE_DISCOUNT_AMNESTY" : "CREATE_DISCOUNT_AMNESTY",
    entityType: "TaxRegistryEntry",
    entityId: entryId,
    authorUsuarioId: actor.usuarioId,
    authorEmployeeId: actor.employeeId,
    payload: {
      before: previous ? taxRegistrySnapshot(previous.data) : null,
      after: payloadData
    }
  });

  await insertAuditEvent(tx, {
    actorUsuarioId: actor.usuarioId,
    eventType: "ADMINISTRATIVE_MUTATION",
    targetType: "TaxRegistryEntry",
    targetId: entryId
  });

  return { id: entryId };
}

export async function deleteDiscountAmnestyInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  id: string
) {
  const [existing] = await tx
    .select()
    .from(taxRegistryEntries)
    .where(
      and(
        eq(taxRegistryEntries.id, id),
        eq(taxRegistryEntries.entityType, "TAX_COLLECTION"),
        eq(taxRegistryEntries.category, "DISCOUNT_AMNESTY_RULE")
      )
    )
    .limit(1);

  if (!existing) throw new Error("Parametrização não encontrada.");

  await tx
    .update(taxRegistryEntries)
    .set({
      status: "EXCLUIDO",
      effectiveUntil: new Date(),
      actorUsuarioId: actor.usuarioId,
      updatedAt: new Date()
    })
    .where(eq(taxRegistryEntries.id, id));

  await tx.insert(taxAuditLogs).values({
    action: "DELETE_DISCOUNT_AMNESTY",
    entityType: "TaxRegistryEntry",
    entityId: id,
    authorUsuarioId: actor.usuarioId,
    authorEmployeeId: actor.employeeId,
    payload: { deleted: true, name: existing.title }
  });

  await insertAuditEvent(tx, {
    actorUsuarioId: actor.usuarioId,
    eventType: "ADMINISTRATIVE_MUTATION",
    targetType: "TaxRegistryEntry",
    targetId: id
  });
}
