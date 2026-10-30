import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { materialRequests, materialRequestItems } from "@/db/schema/assets-requests";
import { materialRequestRevisions } from "@/db/schema/assets-catalogs";
import type { PermissionUser } from "@/lib/contracts/identity";
import { canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

const inputSchema = z.object({ requestId: z.string().min(1), operation: z.enum(["edit", "cancel", "restore"]), reason: z.string().trim().min(3).max(2000), justification: z.string().trim().max(2000).default(""), items: z.array(z.object({ id: z.string().min(1), quantity: z.number().finite().positive() })).default([]) });
export async function reviseMaterialRequest(connection: DatabaseConnection, user: PermissionUser, raw: unknown) {
  const input = inputSchema.parse(raw);
  if (!canPerformModuleOperation(user, "PATRIMONIO", "update")) throw new Error("Sem permissão para alterar requisições.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "MaterialRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const [request] = await tx.select().from(materialRequests).where(eq(materialRequests.id, input.requestId)).limit(1);
    if (!request || !isSystemAdministrator(user) && request.departmentId !== user.departmentId) throw new Error("Requisição fora do seu setor.");
    const items = await tx.select().from(materialRequestItems).where(eq(materialRequestItems.requestId, request.id));
    if (items.some(item => item.quantityDelivered > 0) || request.issuedAt) throw new Error("Requisição com entrega não pode ser alterada ou cancelada; use os estornos de estoque.");
    let status = request.status;
    if (input.operation === "cancel") {
      if (!["Pendente", "Aprovada", "Recusada"].includes(status)) throw new Error("Situação não permite cancelamento.");
      status = "Cancelada";
    } else if (input.operation === "restore") {
      if (status !== "Cancelada") throw new Error("Somente requisição cancelada permite estorno do cancelamento.");
      const [revision] = await tx.select().from(materialRequestRevisions).where(and(eq(materialRequestRevisions.requestId, request.id), eq(materialRequestRevisions.operation, "cancel"))).orderBy(desc(materialRequestRevisions.createdAt), desc(materialRequestRevisions.id)).limit(1);
      if (!revision || !["Pendente", "Aprovada", "Recusada"].includes(revision.previousStatus)) throw new Error("Cancelamento de origem não encontrado.");
      status = revision.previousStatus;
    } else {
      if (status !== "Pendente") throw new Error("Somente requisição pendente permite alteração.");
      if (input.items.length !== items.length || new Set(input.items.map(item => item.id)).size !== items.length || input.items.some(item => !items.some(existing => existing.id === item.id))) throw new Error("Informe exatamente os itens existentes da requisição.");
      for (const item of input.items) await tx.update(materialRequestItems).set({ quantityRequested: item.quantity }).where(and(eq(materialRequestItems.id, item.id), eq(materialRequestItems.requestId, request.id)));
    }
    await tx.update(materialRequests).set({ status, ...(input.operation === "edit" ? { justification: input.justification } : {}), updatedAt: new Date() }).where(eq(materialRequests.id, request.id));
    await tx.insert(materialRequestRevisions).values({ requestId: request.id, operation: input.operation, previousStatus: request.status, reason: input.reason, actorId: user.id });
    await insertAuditEvent(tx, { actorUsuarioId: user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "MaterialRequest", targetId: request.id });
    return { status };
  });
}
