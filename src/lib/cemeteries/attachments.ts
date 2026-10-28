import "server-only";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { insertCemeteryAttachment, readCemeteryAttachments, requireCemeteryAttachmentTarget } from "@/db/repositories/cemeteries/attachments";

export const cemeteryAttachmentTargetSchema = z.object({ targetType: z.enum(["LOTE", "SEPULTURA", "SEPULTAMENTO", "VELORIO", "CREMACAO"]), targetId: z.string().min(1).max(100) });
export type CemeteryAttachmentTarget = z.infer<typeof cemeteryAttachmentTargetSchema>;
export async function assertCemeteryAttachmentTarget(db: DatabaseExecutor, target: CemeteryAttachmentTarget): Promise<void> {
  await requireCemeteryAttachmentTarget(db, target);
}
export async function ingestCemeteryAttachment(connection: DatabaseConnection, actorId: string, target: CemeteryAttachmentTarget, input: { requestKey: string; title: string; fileUrl: string; hashSha256: string }): Promise<{ id: string; created: boolean }> {
  return insertCemeteryAttachment(connection, actorId, target, input);
}
export async function listCemeteryAttachments(db: DatabaseExecutor, target: CemeteryAttachmentTarget, requestedPage = 1): Promise<{ total: number; page: number; items: { id: string; title: string; createdAt: string; authorId: string }[] }> {
  return readCemeteryAttachments(db, target, requestedPage);
}
