export type BenefitRequestItemDraft = { draftId: string; benefitId: string; quantity: number; value: string };
type BenefitOption = { id: string; name: string; dispensingMode: string };

export function updateBenefitRequestItem(items: BenefitRequestItemDraft[], draftId: string, patch: Partial<Pick<BenefitRequestItemDraft, "benefitId" | "quantity" | "value">>) {
  return items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item);
}

export function benefitRequestItemsPayload(items: BenefitRequestItemDraft[]) {
  return items.map(({ benefitId, quantity, value }) => ({ benefitId, quantity, value }));
}

// The panel may be closed and most controls unmounted at submission time.
// Validate the complete parent draft, never just the current page's DOM inputs.
export function benefitRequestItemsError(items: BenefitRequestItemDraft[], benefits: BenefitOption[]): string | null {
  if (!items.length || items.length > 30) return "Informe de 1 a 30 benefícios.";
  const selected = new Set<string>();
  for (const [index, item] of items.entries()) {
    const benefit = benefits.find((option) => option.id === item.benefitId);
    if (!benefit) return `Item ${index + 1}: selecione o benefício.`;
    if (selected.has(item.benefitId)) return `Item ${index + 1}: informe cada benefício uma única vez.`;
    selected.add(item.benefitId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000000) return `Item ${index + 1}: informe uma quantidade inteira válida.`;
    if ((benefit.dispensingMode === "VALUE" || item.value !== "") && (!/^\d{1,12}(\.\d{1,2})?$/.test(item.value) || Number(item.value) <= 0)) return `Item ${index + 1}: informe o valor financeiro válido.`;
  }
  return null;
}
