import { z } from "zod";

export const constructionRequestKinds = { READJUSTMENT: "Readequação e reenvio", CORRECTION: "Correção de projeto e reenvio", DOCUMENT_CORRECTION: "Correção de alvará emitido", RENEWAL: "Renovação de alvará", INSPECTION: "Vistoria", START: "Comunicação de início", COMPLETION: "Conclusão / habite-se" } as const;
export const constructionServiceRequestSchema = z.object({
  caseId: z.string().min(1), requestKey: z.uuid(), kind: z.enum(["READJUSTMENT", "CORRECTION", "DOCUMENT_CORRECTION", "RENEWAL", "INSPECTION", "START", "COMPLETION"]),
  revision: z.number().int().nonnegative(), termId: z.string().min(1), notes: z.string().trim().min(10).max(4000),
  documentIds: z.array(z.string().min(1)).max(50).refine((ids) => ids.length === new Set(ids).size, "Não repita documentos."),
  additionalValues: z.record(z.string(), z.string().max(4000)).default({}),
  sourceIssuedDocumentId: z.string().default(""),
}).refine((data) => !["RENEWAL", "DOCUMENT_CORRECTION"].includes(data.kind) || Boolean(data.sourceIssuedDocumentId), "Selecione o alvará de origem.");

export function assertConstructionRequestState(input: { kind: string; revision: number }, record: { revisionCount: number; reviewStatus: string; correctionDeadline: Date | null; process: { status: string; completedAt: Date | null } }, now = new Date()) {
  if (record.process.completedAt || ["Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("Processo encerrado para novos pedidos.");
  if (record.revisionCount !== input.revision) throw new Error("A revisão mudou. Atualize a solicitação.");
  if (["READJUSTMENT", "CORRECTION"].includes(input.kind)) {
    if (record.reviewStatus !== "CORRECTION_REQUIRED") throw new Error("Não há exigência de ajuste pendente nesta revisão.");
    if (record.process.status === "Aguardando Recebimento") throw new Error("O processo precisa estar recebido para reenvio.");
    if (record.correctionDeadline && record.correctionDeadline < now) throw new Error("Prazo de correção encerrado. Solicite regularização ao setor responsável.");
  } else if (["RENEWAL", "DOCUMENT_CORRECTION", "START", "COMPLETION"].includes(input.kind) && record.reviewStatus !== "APPROVED") throw new Error("Este pedido exige projeto aprovado.");
}
