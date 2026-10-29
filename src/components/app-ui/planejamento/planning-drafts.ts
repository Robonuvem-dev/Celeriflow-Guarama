export type PlanningDraftItem = { id: number; code: string; direction: string; value: number };
export type PlanningMappingDefinition = { sourceLineId: string; label: string; newCode: string; defaultTargetId?: string; targets: { id: string; name: string }[] };
export type PlanningDraftIssue = { index: number; field: string; message: string };

export function serializePlanningItems(rows: PlanningDraftItem[]) {
  return rows.map(row => `${row.code};${row.direction};${row.value.toFixed(2)}`).join("\n");
}

export function validatePlanningItems(rows: PlanningDraftItem[]): PlanningDraftIssue | undefined {
  const codes = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!row.code.trim() || row.code.includes(";") || codes.has(row.code.trim())) return { index, field: "code", message: `Item ${index + 1}: selecione uma dotação distinta.` };
    codes.add(row.code.trim());
    if (!["+", "-"].includes(row.direction)) return { index, field: "direction", message: `Item ${index + 1}: selecione acréscimo ou redução.` };
    if (!Number.isFinite(row.value) || row.value <= 0 || !/^\d{1,15}(\.\d{1,2})?$/.test(row.value.toFixed(2))) return { index, field: "value", message: `Item ${index + 1}: informe valor maior que zero, com até 15 dígitos inteiros.` };
  }
}

export function serializePlanningMappings(definitions: PlanningMappingDefinition[], selections: Record<string, string>, codes: Record<string, string>) {
  return JSON.stringify(definitions.map(row => ({ sourceLineId: row.sourceLineId, targetLineId: selections[row.sourceLineId] || null, ...(!selections[row.sourceLineId] ? { newCode: codes[row.sourceLineId] } : {}) })));
}

export function validatePlanningMappings(definitions: PlanningMappingDefinition[], selections: Record<string, string>, codes: Record<string, string>): PlanningDraftIssue | undefined {
  for (const [index, row] of definitions.entries()) {
    const selected = selections[row.sourceLineId];
    if (selected && !row.targets.some(target => target.id === selected)) return { index, field: "target", message: `Mapeamento ${index + 1}: selecione um destino válido para ${row.label}.` };
    if (!selected && (!codes[row.sourceLineId]?.trim() || codes[row.sourceLineId].trim().length > 60)) return { index, field: "newCode", message: `Mapeamento ${index + 1}: informe o código da nova dotação de ${row.label}, com até 60 caracteres.` };
  }
}
