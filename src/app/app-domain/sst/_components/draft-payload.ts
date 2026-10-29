/** Repeated-name fields must retain empty positions for action-side zip by index. */
export function parallelDraftEntries<T extends object>(rows: readonly T[], names: readonly (keyof T & string)[]): [string, string][] {
  return rows.flatMap(row => names.map(name => [name, String(row[name] ?? "")] as [string, string]));
}

/** Serialize the owner's entire selection, independently of the displayed page. */
export function selectionDraftEntries(name: string, selected: readonly string[], itemOrder?: readonly string[]): [string, string][] {
  const known = new Set(itemOrder);
  const ids = itemOrder ? [...itemOrder.filter(id => selected.includes(id)), ...selected.filter(id => !known.has(id))] : selected;
  return ids.map(id => [name, id] as [string, string]);
}

/** Checkbox true is "on", false is absent; textual "false" remains a value. */
export function programDraftEntries(draft: Readonly<Record<string, string | boolean>>, selected: readonly string[], kind: string): [string, string][] {
  return Object.entries(draft).flatMap(([name, content]) => {
    if (content === false || !selected.some(id => name.startsWith(`${id}.`)) || (kind === "PCMSO" ? !name.includes(".exam.") : name.includes(".exam."))) return [];
    return [[name, content === true ? "on" : content] as [string, string]];
  });
}
