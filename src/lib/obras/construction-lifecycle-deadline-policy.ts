import { z } from "zod";
import { constructionDate } from "./construction-rules";

export const inspectionDeadlineExtensionSchema = z.object({ caseId: z.string().min(1), inspectionId: z.string().min(1), requestKey: z.uuid(), newDeadline: constructionDate, reason: z.string().trim().min(10).max(4000) });
export function inspectionDeadlineEnd(value: string) { return new Date(`${constructionDate.parse(value)}T23:59:59.999Z`); }
export function calculateInspectionCorrectionDeadline(input: { category: string; correctionDays: number; configurationId: string; configurationVersion: number; inspectedAt: string; requirementNote: string }, now = new Date()) {
  constructionDate.parse(input.inspectedAt);
  if (!["BUILDING", "SUBDIVISION"].includes(input.category)) throw new Error("Categoria de execução inválida.");
  if (!Number.isInteger(input.correctionDays) || input.correctionDays < 1 || input.correctionDays > 3650) throw new Error("Prazo de ajuste configurado inválido.");
  if (input.inspectedAt > now.toISOString().slice(0, 10)) throw new Error("Vistoria não pode ter data futura.");
  if (input.requirementNote.trim().length < 10) throw new Error("Descreva a exigência de ajuste da obra ou parcelamento.");
  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + input.correctionDays);
  deadline.setUTCHours(23, 59, 59, 999);
  return { deadline, memory: { ...input, notifiedAt: now.toISOString(), correctionDeadline: deadline.toISOString(), rule: "Dias corridos contados da comunicação do resultado; vencimento no fim do dia UTC.", timezone: "UTC" } };
}
export function assertInspectionCorrectionOpen(deadline: Date | null, now = new Date(), scheduledAt?: string) {
  if (!deadline) throw new Error("Exigência de vistoria sem prazo regularizado. Solicite regularização motivada ao gestor.");
  if (now > deadline) throw new Error("Prazo de ajuste da vistoria encerrado. Solicite regularização motivada ao gestor antes de nova vistoria.");
  if (scheduledAt && inspectionDeadlineEnd(scheduledAt) > deadline) throw new Error("Nova vistoria deve ser agendada dentro do prazo de ajuste regularizado.");
}
