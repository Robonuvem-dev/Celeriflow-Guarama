import { z } from "zod";
export const fiscalFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/), label: z.string().trim().min(1).max(120),
  type: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN", "LIST"]), required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  numberType: z.enum(["INTEGER", "DECIMAL", "CURRENCY"]).optional(),
  sequence: z.number().int().min(1).max(10000).optional(),
  maxLength: z.number().int().min(1).max(4000).optional(),
  visible: z.boolean().optional(), enabled: z.boolean().optional(),
}).refine(field => field.type !== "LIST" || field.options.length > 0, "Campo de lista exige opções.");
export type FiscalFieldDefinition = z.infer<typeof fiscalFieldSchema>;
export type FiscalFieldEditorDefinition = Omit<FiscalFieldDefinition, "options"> & { options?: string[] };
export function fiscalFieldTypeLabel(field: FiscalFieldEditorDefinition): string {
  if (field.type === "NUMBER") return field.numberType === "INTEGER" ? "Inteiro" : field.numberType === "CURRENCY" ? "Moeda" : "Decimal";
  return { TEXT: "Alfanumérico", DATE: "Data", BOOLEAN: "Sim / não", LIST: "Consulta" }[field.type];
}
export function orderedFiscalFields<T extends FiscalFieldEditorDefinition>(fields: T[]): T[] {
  return fields.map((field, index) => ({ field, index })).sort((a, b) => (a.field.sequence ?? a.index + 1) - (b.field.sequence ?? b.index + 1) || a.index - b.index).map(row => row.field);
}
export function matchesFiscalField(field: FiscalFieldEditorDefinition, filters: { type?: string; enabled?: string; required?: string; lookup?: string }) {
  const dataType = field.type === "NUMBER" ? field.numberType ?? "DECIMAL" : field.type;
  return (!filters.type || filters.type === dataType) && (!filters.enabled || String(field.enabled !== false) === filters.enabled)
    && (!filters.required || String(field.required) === filters.required) && (!filters.lookup || String(field.type === "LIST") === filters.lookup);
}
