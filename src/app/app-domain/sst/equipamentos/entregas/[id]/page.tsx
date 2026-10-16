import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getEquipmentDelivery } from "@/lib/sst/equipment-queries";
import { EquipmentNav,equipmentDate } from "../../EquipmentUi";

export default async function DeliveryDetail({params}:{params:Promise<{id:string}>}) {
  const context=await getTenantContextForModule("SST"); const {id}=await params; const record=await getEquipmentDelivery(context,id); if(!record) notFound();
  const {delivery,items,events}=record;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Entrega {delivery.id}</h1><EquipmentNav/><Link className="inline-block rounded border p-2" href={`/sst/equipamentos/entregas/${id}/comprovante`}>Emitir comprovante</Link><dl className="grid gap-2 text-sm"><dt>Entrega</dt><dd>{equipmentDate(delivery.deliveredAt)}</dd><dt>Estoque</dt><dd>{delivery.integratedStock?"Saídas reais registradas na mesma transação":"Integração desativada na emissão"}</dd><dt>Local / observações</dt><dd className="whitespace-pre-wrap break-words">{delivery.location} — {delivery.notes}</dd><dt>Biometria</dt><dd>Integração pendente; não há assinatura biométrica aceita.</dd></dl>
    {items.map(i=><section key={i.id} className="space-y-2 rounded border p-3 text-sm"><h2 className="font-semibold">{i.snapshot.employee} — {i.snapshot.equipment}</h2><p>Matrícula {i.snapshot.registration||"—"} · {i.snapshot.code} · CA {i.snapshot.ca||"—"}</p><p>Cargo: {i.snapshot.role} · Local: {i.snapshot.department} · Centro: {i.snapshot.costCenter} · GHE: {i.snapshot.ghe.join(", ")||"Sem grupo"}</p><p>Entregue {i.quantity} · Baixado {i.writtenOffQuantity} · Em uso {i.quantity-i.writtenOffQuantity}</p><p>Validade {equipmentDate(i.expiresAt)} · Próxima revisão {equipmentDate(i.nextReviewAt)}</p><p>Movimento real de estoque: {i.movementId||"Não integrado"}</p><h3 className="font-semibold">Histórico</h3>{events.filter(e=>e.itemId===i.id).map(e=><article key={e.id} className="border-t pt-2"><p>{equipmentDate(e.occurredAt)} — {e.kind==="REVIEW"?"Revisão":"Baixa de uso"} · {e.responsible}{e.kind==="WRITE_OFF"?` · quantidade ${e.quantity}`:` · próxima ${equipmentDate(e.nextReviewAt)}`}</p><p className="whitespace-pre-wrap break-words">{e.notes}</p></article>)}</section>)}
  </div>;
}
