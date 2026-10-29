/** Validate the complete draft, never just the mounted page of inputs. */
export function draftRowsError<T>(rows: readonly T[], validate: (row: T, index: number) => string | null): string | null {
  if (!rows.length) return "Inclua ao menos uma linha.";
  for (let index = 0; index < rows.length; index++) {
    const error = validate(rows[index], index);
    if (error) return `Linha ${index + 1}: ${error}`;
  }
  return null;
}

export function distributionError(rows: readonly { objectId: string; itemId: string; value: string }[]) {
  return draftRowsError(rows, row => !row.objectId || !row.itemId || !row.value.trim() ? "Preencha objeto, item e valor/percentual." : null);
}

export async function submitDraft<T, R extends { error?: string }>(rows: readonly T[], validate: (row: T, index: number) => string | null, send: () => Promise<R>): Promise<R | { error: string }> {
  const error = draftRowsError(rows, validate);
  return error ? { error } : send();
}

export function distributionPayload(rows: readonly { objectId: string; itemId: string; value: string }[], percentages: true): { objectId: string; itemId: string; percentage: string }[];
export function distributionPayload(rows: readonly { objectId: string; itemId: string; value: string }[], percentages: false): { objectId: string; itemId: string; amount: string }[];
export function distributionPayload(rows: readonly { objectId: string; itemId: string; value: string }[], percentages: boolean) {
  return rows.map(row => ({ objectId: row.objectId, itemId: row.itemId, ...(percentages ? { percentage: row.value } : { amount: row.value }) }));
}

export function creditItemsError(rows: readonly { appropriationId: string; value: number }[]) {
  return draftRowsError(rows, row => !row.appropriationId || !Number.isFinite(row.value) || row.value <= 0 ? "Informe dotação e valor positivo." : null);
}

export function fiscalTermsError(rows: readonly { label: string; accountIds: string[] }[]) {
  return draftRowsError(rows, row => !row.label.trim() || !row.accountIds.length ? "Informe o componente e ao menos uma conta analítica." : null);
}

export function budgetRowsError(rows: readonly { code: string; name: string; value: number }[]) {
  return draftRowsError(rows, row => !row.code.trim() || !row.name.trim() || !Number.isFinite(row.value) ? "Informe código, nome e valor válido." : null);
}

export const draftField = "h-5 w-full min-w-0 rounded border px-1 text-[13px] leading-5";
