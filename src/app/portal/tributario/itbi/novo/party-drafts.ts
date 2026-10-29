export type ItbiPartyDraft = { draftId: string; document: string; sharePercent: number };

export function updateItbiParty(rows: ItbiPartyDraft[], draftId: string, patch: Partial<Pick<ItbiPartyDraft, "document" | "sharePercent">>) {
  return rows.map((row) => row.draftId === draftId ? { ...row, ...patch } : row);
}

export function itbiPartiesPayload(rows: ItbiPartyDraft[]) {
  return rows.map(({ document, sharePercent }) => ({ document, sharePercent }));
}

export function itbiPartiesError(rows: ItbiPartyDraft[], title: string): string | null {
  if (!rows.length || rows.length > 100) return `${title}: informe de 1 a 100 partes.`;
  for (const [index, row] of rows.entries()) {
    const document = row.document.replace(/\D/g, "");
    if (document.length !== 11 && document.length !== 14) return `${title}, parte ${index + 1}: informe CPF ou CNPJ.`;
    const scaled = row.sharePercent * 1000000;
    if (!Number.isFinite(row.sharePercent) || row.sharePercent < 0.000001 || row.sharePercent > 100 || Math.abs(scaled - Math.round(scaled)) > 0.000001) return `${title}, parte ${index + 1}: informe uma participação de 0,000001% até 100%, com até seis casas decimais.`;
  }
  return null;
}

export function onlineItbiSubmissionFields(form: FormData, sellers: ItbiPartyDraft[], buyers: ItbiPartyDraft[]) {
  return {
    transactionTypeId: String(form.get("type") ?? ""),
    declaredValue: Number(form.get("value")),
    fractionPercent: Number(form.get("fraction")),
    sellers: itbiPartiesPayload(sellers),
    buyers: itbiPartiesPayload(buyers),
    debtorDocument: String(form.get("debtor") ?? ""),
    contestationReason: String(form.get("contestation") ?? ""),
    description: String(form.get("description") ?? ""),
  };
}
