export type AdministrationSupplyDraft = {
  id: string;
  materialId: string;
  warehouseId: string;
  batchNumber: string;
  quantity: string;
};

export type AdministrationSupplyIssue = {
  id: string;
  index: number;
  field: "materialId" | "warehouseId" | "batchNumber" | "quantity";
  message: string;
};

/** The action accepts exactly these four properties, never the client row ID. */
export function administrationSuppliesPayload(supplies: readonly AdministrationSupplyDraft[]) {
  return supplies.map(({ materialId, warehouseId, batchNumber, quantity }) => ({
    materialId, warehouseId, batchNumber, quantity: Number(quantity),
  }));
}

/** Validate the entire draft, independently of the mounted table page. */
export function validateAdministrationSupplies(
  supplies: readonly AdministrationSupplyDraft[],
  materialIds: ReadonlySet<string>,
  warehouseIds: ReadonlySet<string>,
): AdministrationSupplyIssue | null {
  for (const [index, item] of supplies.entries()) {
    const issue = (field: AdministrationSupplyIssue["field"], message: string): AdministrationSupplyIssue => ({
      id: item.id, index, field, message: `Material ${index + 1}: ${message}`,
    });
    if (!materialIds.has(item.materialId)) return issue("materialId", "selecione um produto disponível.");
    if (!warehouseIds.has(item.warehouseId)) return issue("warehouseId", "selecione um estoque disponível.");
    if (!item.batchNumber.trim()) return issue("batchNumber", "informe o lote utilizado.");
    const quantity = Number(item.quantity);
    if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity < 0.000001) {
      return issue("quantity", "informe uma quantidade finita de pelo menos 0,000001.");
    }
  }
  return null;
}
