import type { ControlChecklistGroup } from "@/lib/c7/control-checklists";
import { draftRowsError } from "../financeiro/draft-rows";

export function checklistDraftError(groups: readonly ControlChecklistGroup[]): string | null {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const error = draftRowsError(groups[groupIndex].items, row => !Number.isInteger(row.number) || row.number < 1 || !row.question.trim() ? "Informe número inteiro positivo e pergunta." : null);
    if (error) return `Grupo ${groupIndex + 1}, ${error}`;
  }
  return null;
}
