import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getEquipmentDelivery } from "@/lib/sst/equipment-queries";
import { equipmentDate } from "../../../EquipmentUi";
import { PrintEquipment } from "../../../PrintEquipment";
import { writeAuditEvent,auditEventTypes } from "@/lib/platform/audit-evidence";

export default async function EquipmentReceipt({params}:{params:Promise<{id:string}>}) {
  const context=await getTenantContextForModuleOperation("SST","issueReports"); const {id}=await params; const record=await getEquipmentDelivery(context,id); if(!record) notFound();
  const unit=await context.prisma.budgetUnit.findUniqueOrThrow({where:{id:record.delivery.budgetUnitId},select:{name:true}});
  await writeAuditEvent(context.prisma,{actorUsuarioId:context.user.id,eventType:auditEventTypes.reportIssued,targetType:"SST_EQUIPMENT_RECEIPT",targetId:id});
  return <div className="space-y-6 p-4"><PrintEquipment/><h1 className="text-xl font-semibold">Comprovante de entrega EPI/EPC</h1><p>{unit.name} · Documento {id} · Entrega {equipmentDate(record.delivery.deliveredAt)}</p><p>Local: {record.delivery.location||"—"}</p><p className="whitespace-pre-wrap">{record.delivery.notes}</p>{record.items.map(i=><section key={i.id} className="break-inside-avoid space-y-3 rounded border p-4"><h2 className="font-semibold">{i.snapshot.employee} — matrícula {i.snapshot.registration||"—"}</h2><p>{i.snapshot.code} — {i.snapshot.equipment} · CA {i.snapshot.ca||"Não aplicável"}</p><p>Quantidade entregue: {i.quantity} · Validade de uso: {equipmentDate(i.expiresAt)}</p><p>Cargo {i.snapshot.role} · Local {i.snapshot.department} · GHE {i.snapshot.ghe.join(", ")||"Sem grupo"}</p><p>Movimento de estoque: {i.movementId||"Sem integração"}</p><p className="pt-8">________________________________________<br/>Assinatura manuscrita do recebedor no documento impresso</p></section>)}<p>Biometria: integração pendente. Este comprovante não contém assinatura biométrica nem assinatura digital verificada.</p><h2 className="font-semibold">Baixas de uso registradas</h2>{record.events.filter(e=>e.kind==="WRITE_OFF").map(e=><p key={e.id}>{record.items.find(i=>i.id===e.itemId)?.snapshot.employee} · {equipmentDate(e.occurredAt)} · {e.quantity} · {e.responsible} · {e.notes}</p>)}</div>;
}
