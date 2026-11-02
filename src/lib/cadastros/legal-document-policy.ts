import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const legalDocumentInput = z.object({ legalTextId: id, legalTextVersionId: id, expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), documentId: id, documentVersionId: id, role: z.enum(["ORIGINAL", "ATTACHMENT"]) });
export class LegalDocumentError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
