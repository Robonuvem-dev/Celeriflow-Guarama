import { SstForm } from "../SstForm";
import { saveEquipment } from "./actions";
import { EquipmentField, equipmentControl as control } from "./EquipmentUi";

export function EquipmentCatalogForm({ budgetUnitId, materials, suppliers }: {
  budgetUnitId: string; materials: { id: string; name: string; code: string }[]; suppliers: { id: string; name: string }[];
}) {
  return <SstForm action={saveEquipment} redirectBase="/sst/equipamentos">
    <input type="hidden" name="budgetUnitId" value={budgetUnitId}/>
    <div className="grid gap-3 sm:grid-cols-2">
      <EquipmentField label="Material canônico"><select className={control} name="materialId" required><option value="">Selecione após buscar</option>{materials.map(m=><option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}</select></EquipmentField>
      <EquipmentField label="Tipo"><select className={control} name="kind"><option>EPI</option><option>EPC</option></select></EquipmentField>
      <EquipmentField label="Certificado de aprovação (obrigatório para EPI)"><input className={control} name="ca" maxLength={100}/></EquipmentField>
      <EquipmentField label="Vencimento do CA"><input className={control} name="caValidUntil" type="date"/></EquipmentField>
      <EquipmentField label="Validade de uso (dias)"><input className={control} name="validityDays" type="number" min={1} max={36500} required/></EquipmentField>
      <EquipmentField label="Intervalo de revisão (dias)"><input className={control} name="reviewDays" type="number" min={1} max={36500} required/></EquipmentField>
      <EquipmentField label="Fornecedor canônico (opcional)"><select name="supplierId" className={control}><option value="">Não informado</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></EquipmentField>
    </div><p>O complemento e os snapshots da entrega preservam o histórico ocupacional.</p>
  </SstForm>;
}
