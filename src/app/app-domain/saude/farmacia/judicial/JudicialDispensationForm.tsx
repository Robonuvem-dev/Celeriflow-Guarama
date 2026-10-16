import { randomUUID } from "node:crypto";
import { dispenseJudicialCaseAction } from "./actions";
const field = "min-w-0 rounded border bg-white p-2 text-sm";
export function JudicialDispensationForm({ item, stocks, professionals }: { item: { id: string; prescriptionItemId: string | null; medicine: { materialId: string | null; isControlled: boolean } }; stocks: { id: string; materialId: string; batchNumber: string; quantity: number; warehouse: { name: string } }[]; professionals: { id: string; employee: { name: string } }[] }) {
  return <form action={dispenseJudicialCaseAction} className="mt-2 grid gap-2 sm:grid-cols-2">
    <input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
    <label className="grid gap-1">Estoque e lote<select name="stockId" required className={field}><option value="">Selecione</option>{stocks.filter(stock => stock.materialId === item.medicine.materialId).map(stock => <option key={stock.id} value={stock.id}>{stock.warehouse.name} · lote {stock.batchNumber} · saldo {stock.quantity}</option>)}</select></label>
    <label className="grid gap-1">Quantidade a dispensar<input name="quantity" type="number" min="0.000001" step="any" required className={field} /></label>
    {!item.prescriptionItemId && <><label className="grid gap-1">Tipo de receituário<select name="prescriptionType" defaultValue={item.medicine.isControlled ? "CONTROLLED" : "SIMPLE"} className={field}><option value="SIMPLE">Simples</option><option value="SPECIAL">Especial</option><option value="CONTROLLED">Controlado</option><option value="MANIPULATED">Manipulado</option></select></label><label className="grid gap-1">Prescritor da receita externa<select name="prescriberProfessionalId" className={field}><option value="">Selecione; obrigatório em receita especial/controlada</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.employee.name}</option>)}</select></label></>}
    <button className={field}>Dispensar pelo processo aprovado</button>
  </form>;
}
