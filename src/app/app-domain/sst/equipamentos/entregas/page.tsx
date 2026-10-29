import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listEquipmentDeliveries } from "@/lib/sst/equipment-queries";
import { sstDatabase } from "@/lib/sst/database";
import { readSstEquipmentDeliveryOptions, searchSstPageEquipment, readSstEquipmentLots, findSstEquipmentPolicy } from "@/db/repositories/sst-pages/equipment";
import { SstForm } from "../../SstForm";
import { saveEquipmentDelivery } from "../actions";
import { DeliveryEventEditor } from "./DeliveryEventEditor";
import { SstSelectionField } from "../../_components/SstSelectionField";
import { readPanelPage } from "../../_components/read-panel-page";
import { EquipmentNav,EquipmentField,equipmentControl as control,equipmentDate } from "../EquipmentUi";

function deliveryRows(records: Awaited<ReturnType<typeof listEquipmentDeliveries>>["records"]) {
  return records.map(item => ({ id: item.id, deliveryId: item.deliveryId, employee: item.snapshot.employee, equipment: item.snapshot.equipment, quantity: item.quantity, writtenOffQuantity: item.writtenOffQuantity, deliveredAt: equipmentDate(item.deliveredAt), nextReviewAt: equipmentDate(item.nextReviewAt), expiresAt: equipmentDate(item.expiresAt) }));
}

export default async function EquipmentDeliveriesPage({searchParams}:{searchParams:Promise<{budgetUnitId?:string;q?:string;employeeQ?:string;personQ?:string;equipmentQ?:string;page?:string;due?:string;warehouseId?:string}>}) {
  const context=await getTenantContextForModule("SST"); const params=await searchParams;
  const data=await listEquipmentDeliveries(context,params); const unit=data.units.find(u=>u.id===params.budgetUnitId);
  const database=sstDatabase(context);
  const {employees,people,warehouses,warehouse}=await readSstEquipmentDeliveryOptions(database,unit,params);
  const equipment=unit ? await searchSstPageEquipment(database,unit.id,params.equipmentQ||""):[];
  const lots=warehouse ? await readSstEquipmentLots(database,warehouse.id,new Date()):[];
  const policy=unit ? await findSstEquipmentPolicy(database,unit.id):undefined;
  async function loadDeliveryPage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("SST");
      const next = await listEquipmentDeliveries(current, { ...params, page: String(requestedPage) });
      return { rows: deliveryRows(next.records), page: next.page, total: next.total };
    });
  }
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Entregas, baixas e revisões</h1><EquipmentNav/>
    <form className="grid gap-3 sm:grid-cols-3"><EquipmentField label="UG"><select name="budgetUnitId" defaultValue={params.budgetUnitId} className={control}><option value="">Todas autorizadas</option>{data.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></EquipmentField><EquipmentField label="Buscar entrega (servidor ou equipamento)"><input name="q" defaultValue={params.q} className={control}/></EquipmentField><EquipmentField label="Pendências"><select name="due" defaultValue={params.due} className={control}><option value="">Todas</option><option value="review">Revisão vencida</option><option value="expiry">Uso vencido</option></select></EquipmentField><EquipmentField label="Buscar servidores (3 letras, até 20)"><input name="employeeQ" defaultValue={params.employeeQ} className={control}/></EquipmentField><EquipmentField label="Buscar responsável Person (3 letras)"><input name="personQ" defaultValue={params.personQ} className={control}/></EquipmentField><EquipmentField label="Buscar equipamento (até 20)"><input name="equipmentQ" defaultValue={params.equipmentQ} className={control}/></EquipmentField><EquipmentField label="Depósito para carregar lotes"><select name="warehouseId" defaultValue={params.warehouseId} className={control}><option value="">Selecione</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></EquipmentField><button className="self-end rounded border p-2">Consultar / carregar opções</button></form>
    {unit&&<details className="rounded border p-3"><summary>Nova entrega individual ou coletiva</summary><SstForm action={saveEquipmentDelivery} redirectBase="/sst/equipamentos/entregas"><input type="hidden" name="budgetUnitId" value={unit.id}/><div className="grid gap-3 sm:grid-cols-2"><EquipmentField label="Equipamento"><select name="equipmentId" required className={control}><option value="">Selecione</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.code} — {e.name} ({e.kind})</option>)}</select></EquipmentField><EquipmentField label="Quantidade por servidor"><input name="quantity" type="number" min="0.001" step="any" required className={control}/></EquipmentField><EquipmentField label="Data e hora da entrega"><input name="deliveredAt" type="datetime-local" required className={control}/></EquipmentField><EquipmentField label="Local de instalação / uso coletivo"><input name="location" className={control} maxLength={300}/></EquipmentField></div><SstSelectionField title="Servidores recebedores / responsáveis" preferenceId="sst-entrega-recebedores-edicao" name="employeeIds" options={employees.map(employee => ({ id: employee.id, name: employee.name, code: employee.registration || "Sem matrícula" }))} />{!employees.length&&<p>Busque servidores da secretaria da UG acima.</p>}<p>Integração de estoque: {policy?.integrateStock?"Ativada — saída real obrigatória":"Desativada — entrega ocupacional sem movimento de estoque"}. Biometria: integração pendente.</p>{policy?.integrateStock&&<><EquipmentField label="Depósito"><select name="warehouseId" required defaultValue={warehouse?.id} className={control}><option value="">Selecione</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></EquipmentField><EquipmentField label="Lote exato (vazio para lote sem número)"><input name="batchNumber" className={control} maxLength={100} list="stock-lots"/><datalist id="stock-lots">{lots.map(l=><option key={l.id} value={l.batchNumber}>{l.material.name} — saldo {l.quantity}</option>)}</datalist></EquipmentField><p>Opções de lote: primeiros 20 disponíveis do depósito carregado; o código exato pode ser informado. Saldo/lote/material são novamente validados no servidor.</p></>}<EquipmentField label="Observações"><textarea name="notes" className={control} maxLength={2000}/></EquipmentField></SstForm></details>}
    <p className="text-sm">{data.total} itens de entrega. Baixas encerram o uso; devolução física exige fluxo próprio do Almoxarifado.</p>
    <DeliveryEventEditor page={data.page} total={data.total} loadPageAction={loadDeliveryPage} items={deliveryRows(data.records)}>
      <div className="grid gap-3 sm:grid-cols-3"><EquipmentField label="Operação"><select name="kind" className={control}><option value="WRITE_OFF">Baixa de uso</option><option value="REVIEW">Revisão</option></select></EquipmentField><EquipmentField label="Quantidade de baixa por item"><input name="quantity" type="number" min="0.001" step="any" defaultValue={1} required className={control}/></EquipmentField><EquipmentField label="Data e hora"><input name="occurredAt" type="datetime-local" required className={control}/></EquipmentField><EquipmentField label="Próxima revisão (para revisão)"><input name="nextReviewAt" type="datetime-local" className={control}/></EquipmentField><EquipmentField label="Responsável canônico"><select name="responsiblePersonId" required className={control}><option value="">Busque Person acima</option>{people.map(p=><option key={p.id} value={p.id}>{p.fullName}</option>)}</select></EquipmentField><EquipmentField label="Motivo / observações"><textarea name="notes" minLength={3} maxLength={2000} required className={control}/></EquipmentField></div>
    </DeliveryEventEditor>
  </div>;
}
