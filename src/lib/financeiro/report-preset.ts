import { z } from "zod";

export const reportPresetSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
  name: z.string().trim().min(2).max(160),
  purpose: z.string().trim().max(1500),
  reportType: z.enum(["BALANCETE", "CONCILIACAO_TESOURARIA", "BALANCO_FINANCEIRO", "RGF"]),
  format: z.enum(["PDF", "CSV", "XLSX", "TXT", "print", "preview"]),
  active: z.boolean(),
});
export type ReportPreset = z.infer<typeof reportPresetSchema>;
export function parseReportPresets(values: unknown[]): ReportPreset[] {
  return values.flatMap(value => { const result = reportPresetSchema.safeParse(value); return result.success ? [result.data] : []; }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
