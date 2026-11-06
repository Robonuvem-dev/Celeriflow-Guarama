import { and, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { taxRegistrySnapshot } from "@/lib/tributacao/registry-data";
import { z } from "zod";
import type { TaxActor } from "@/lib/tributacao";

export const documentTypeEnum = z.enum([
  "CARNE",
  "GUIA",
  "ALVARA",
  "CERTIDAO",
  "NOTIFICACAO",
  "AVISO",
  "ORDEM_FISCALIZACAO",
  "TERMO_ACAO_FISCAL"
]);

export const documentMessageSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  documentType: documentTypeEnum,
  targetScope: z.enum(["TODOS", "IMOBILIARIO", "ECONOMICO", "DIVIDA_ATIVA", "GERAL"]).default("GERAL"),
  competenceYear: z.number().int().min(1900).max(2100).optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  placement: z.enum(["CABECALHO", "RODAPE", "CORPO", "VERSO", "INSTRUCOES"]).default("INSTRUCOES"),
  messageContent: z.string().trim().min(1).max(5000),
  active: z.boolean().default(true),
  legalReference: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().min(1).max(4000)
});

export type DocumentMessageInput = z.infer<typeof documentMessageSchema>;

export type DocumentMessageItem = Awaited<ReturnType<typeof listDocumentMessages>>[number];

export async function listDocumentMessages(db: DatabaseExecutor) {
  const rows = await db
    .select()
    .from(taxRegistryEntries)
    .where(
      and(
        eq(taxRegistryEntries.entityType, "TAX_CONFIGURATION"),
        eq(taxRegistryEntries.category, "DOCUMENT_MESSAGE")
      )
    )
    .orderBy(desc(taxRegistryEntries.createdAt));

  return rows.map(r => {
    const data = taxRegistrySnapshot(r.data);
    return {
      id: r.id,
      title: r.title,
      documentType: String(data.documentType ?? "GUIA"),
      targetScope: String(data.targetScope ?? "GERAL"),
      competenceYear: data.competenceYear ? Number(data.competenceYear) : null,
      validFrom: data.validFrom ? String(data.validFrom) : null,
      validUntil: data.validUntil ? String(data.validUntil) : null,
      placement: String(data.placement ?? "INSTRUCOES"),
      messageContent: String(data.messageContent ?? ""),
      legalReference: data.legalReference ? String(data.legalReference) : null,
      active: r.status === "ATIVO",
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      actorUsuarioId: r.actorUsuarioId
    };
  });
}

export async function saveDocumentMessageInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  raw: DocumentMessageInput
) {
  const input = documentMessageSchema.parse(raw);
  const now = new Date();
  const effectiveFrom = input.validFrom ? new Date(input.validFrom) : now;
  const effectiveUntil = input.validUntil ? new Date(input.validUntil) : null;

  let previous = null;
  if (input.id) {
    [previous] = await tx
      .select()
      .from(taxRegistryEntries)
      .where(
        and(
          eq(taxRegistryEntries.id, input.id),
          eq(taxRegistryEntries.entityType, "TAX_CONFIGURATION"),
          eq(taxRegistryEntries.category, "DOCUMENT_MESSAGE")
        )
      )
      .limit(1);
  }

  const payloadData = {
    documentType: input.documentType,
    targetScope: input.targetScope,
    competenceYear: input.competenceYear ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    placement: input.placement,
    messageContent: input.messageContent,
    legalReference: input.legalReference ?? null,
    reason: input.reason,
    previousId: previous?.id ?? null
  };

  let entryId: string;
  if (previous) {
    // Atualiza mantendo versão incremental
    const [updated] = await tx
      .update(taxRegistryEntries)
      .set({
        title: input.title,
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
        entityType: "TAX_CONFIGURATION",
        entityId: "SYSTEM_MESSAGES",
        category: "DOCUMENT_MESSAGE",
        title: input.title,
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
    action: previous ? "UPDATE_DOCUMENT_MESSAGE" : "CREATE_DOCUMENT_MESSAGE",
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

export async function deleteDocumentMessageInTransaction(
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
        eq(taxRegistryEntries.entityType, "TAX_CONFIGURATION"),
        eq(taxRegistryEntries.category, "DOCUMENT_MESSAGE")
      )
    )
    .limit(1);

  if (!existing) throw new Error("Mensagem de documento não encontrada.");

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
    action: "DELETE_DOCUMENT_MESSAGE",
    entityType: "TaxRegistryEntry",
    entityId: id,
    authorUsuarioId: actor.usuarioId,
    authorEmployeeId: actor.employeeId,
    payload: { deleted: true, title: existing.title }
  });

  await insertAuditEvent(tx, {
    actorUsuarioId: actor.usuarioId,
    eventType: "ADMINISTRATIVE_MUTATION",
    targetType: "TaxRegistryEntry",
    targetId: id
  });
}
