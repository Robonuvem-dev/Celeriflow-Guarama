import { z } from "zod";

export const functionalDocumentKinds = ["IRRF_ANUAL", "TEMPO_SERVICO", "MAGISTERIO", "TERMO_RESCISAO", "FICHA_REGISTRO", "DECLARACAO_VINCULO", "RECIBO_FERIAS", "ADICIONAL_TEMPO_SERVICO", "PPP"] as const;
export const functionalPublicationSchema = z.object({ employeeId: z.string().min(1), budgetUnitId: z.string().min(1), contractId: z.string().nullable(), kind: z.enum(functionalDocumentKinds), year: z.number().int().min(1900).max(2200).nullable(), documentVersionId: z.string().min(1), sourceReference: z.string().trim().min(5).max(2000), releaseAt: z.iso.datetime({ offset: true }) }).strict();
export const publicationPayloadSchema = functionalPublicationSchema.extend({ title: z.string(), publisherId: z.string(), hashSha256: z.string(), fileUrl: z.string(), documentId: z.string() });
