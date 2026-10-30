import { z } from "zod";
import type { CentralDocumentType } from "@/lib/contracts/signature-central";

export const documentTypeInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Informe o nome do tipo documental.").max(160, "O nome deve ter até 160 caracteres."),
  description: z.string().trim().max(2000, "A descrição deve ter até 2.000 caracteres."), active: z.boolean(),
});

export function serializeDocumentType(row: CentralDocumentType): CentralDocumentType {
  return { id: row.id, name: row.name, description: row.description, active: row.active };
}

export function filterDocumentTypes(rows: CentralDocumentType[], search: string, active: string) {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  return rows.filter(row => (active === "ALL" || row.active === (active === "ACTIVE"))
    && [row.name, row.description].some(value => value.toLocaleLowerCase("pt-BR").includes(term)));
}
