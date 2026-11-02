import type { StockView } from "../../src/app/app-domain/meio-ambiente/residuos/estoque/StockView";

// Dados sintéticos exclusivos da fixture; nunca gravados na aplicação ou em banco real.
export const recyclingUiProps: Parameters<typeof StockView>[0] = {
  entries: [
    { kind: "materials", code: "M1", name: "Papel", address: "", description: "", active: true },
    { kind: "types", code: "REC", name: "Recicláveis", address: "", description: "", active: true },
    { kind: "units", code: "KG", name: "kg", address: "", description: "", active: true },
    { kind: "depots", code: "D1", name: "Depósito central", address: "Local", description: "", active: true },
    { kind: "centers", code: "DEST", name: "Centro ativo", address: "Local", description: "", active: true },
    { kind: "centers", code: "OLD", name: "Centro inativo", address: "Local antigo", description: "", active: false },
  ],
  positions: [{ materialCode: "M1", materialName: "Papel", typeName: "Recicláveis", unitCode: "KG", unitName: "kg", depotCode: "D1", depotName: "Depósito central", quantity: "6.100", materialTotal: "8.100", canDispatch: true, requestKey: "376f6ac0-ab52-4b5d-b19c-87e6bd32aed7" }],
  history: [{ id: "movement", kind: "EXIT", quantity: "4.025", amount: "9999999999999.90", quantityAfter: "6.100", occurredOn: "2026-11-01", origin: "", notes: "<script>não executar</script>", snapshot: { material: { code: "M1", name: "Papel" }, depot: { code: "D1", name: "Depósito central" }, materialType: { code: "REC", name: "Recicláveis" }, unit: { code: "KG", name: "kg" }, destination: { code: "DEST", name: "Centro ativo", address: "Local" } } }],
  stockPage: 1, historyPage: 1, stockTotal: 21, historyTotal: 21, pageSize: 20,
  canRecord: false, today: "2026-11-01", entryRequestKey: "3c0a6034-15ac-4668-b2f9-ad29c1cf582a",
  recordAction: async () => ({ success: true }),
};
