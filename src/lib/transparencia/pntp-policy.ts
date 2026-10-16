import { z } from "zod";
export function pntpApplicableEntities(matrix: string): ("prefeitura" | "camara")[] {
  const value = matrix.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (value.startsWith("COMUM")) return ["prefeitura", "camara"];
  if (value.includes("EXECUTIVO")) return ["prefeitura"];
  if (value.includes("LEGISLATIVO")) return ["camara"];
  return [];
}
export const pntpEvidenceSchema = z.object({ criterionId: z.string().min(1), entity: z.enum(["prefeitura", "camara"]), year: z.coerce.number().int().min(1900).max(2200), status: z.enum(["UNVERIFIED", "PARTIAL", "SATISFIED", "NOT_APPLICABLE"]), urls: z.array(z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol))).max(20), notes: z.string().trim().min(10).max(8000) }).strict().refine(value => value.status !== "SATISFIED" || value.urls.length > 0, "Critério atendido exige URL de evidência.");
