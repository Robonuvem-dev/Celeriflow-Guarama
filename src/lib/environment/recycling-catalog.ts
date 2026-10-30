import { z } from "zod";

export const recyclingCatalogs = {
  units: "Unidades de medida",
  types: "Tipos de materiais recicláveis",
  materials: "Materiais recicláveis",
  depots: "Áreas de armazenamento e depósitos",
  centers: "Centros de reciclagem e destinação final",
} as const;
export const recyclingEntrySchema = z.object({
  kind: z.enum(["units", "types", "materials", "depots", "centers"]),
  code: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}._-]+$/u, "Use letras, números, ponto, hífen ou sublinhado."),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  address: z.string().trim().max(500),
  active: z.boolean(),
});
export type RecyclingEntry = z.infer<typeof recyclingEntrySchema>;
export function recyclingEntryKey(entry: Pick<RecyclingEntry, "kind" | "code">) {
  return `RECYCLING_CATALOG:${entry.kind}:${entry.code.toLocaleUpperCase("pt-BR")}`;
}
export function parseRecyclingEntries(values: unknown[]): RecyclingEntry[] {
  return values.flatMap(value => {
    const parsed = recyclingEntrySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
