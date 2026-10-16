import Link from "next/link";
import { cancelDispensationAction, correctDispensationAction } from "./actions";
const field = "min-w-0 rounded border bg-white p-2 text-sm";
type Row = { id: string; quantity: number; date: Date; status: string; movementId: string | null; cancellationReason: string | null; cancelledAt: Date | null; receiverRelationship: string | null; receiverPerson: { fullName: string } | null; patient: { person: { fullName: string } }; medicine: { name: string }; unit: { name: string }; stock: { batchNumber: string } | null; kitDeliveryItem: { deliveryId: string } | null; events: { id: string; createdAt: Date; kind: string; reason: string; actorUsuarioId: string }[] };
export function DispensationHistoryCard({ dispensation }: { dispensation: Row }) {
  return <article className="space-y-2 rounded border bg-white p-3 text-sm">
    <h3 className="font-semibold">{dispensation.patient.person.fullName} · {dispensation.medicine.name} · {dispensation.quantity} · {dispensation.status === "ACTIVE" ? "Ativa" : "Cancelada"}</h3>
    <p>{dispensation.date.toLocaleString("pt-BR")} · {dispensation.unit.name} · lote {dispensation.stock?.batchNumber} · retirante {dispensation.receiverPerson?.fullName || dispensation.patient.person.fullName} · {dispensation.receiverRelationship || "Próprio paciente"}</p>
    {dispensation.kitDeliveryItem && <p>Entrega de kit: <Link href={`/saude/farmacia/kits?deliveryId=${encodeURIComponent(dispensation.kitDeliveryItem.deliveryId)}`} className="underline">Abrir kit e registrar retorno dos itens</Link></p>}
    {dispensation.status === "ACTIVE" ? <>
      <Link href={`/api/saude/relatorios?reportType=DOC_DISPENSATION&recordId=${encodeURIComponent(dispensation.id)}&format=pdf`} className="underline">Declaração de recebimento</Link>
      {dispensation.movementId && !dispensation.kitDeliveryItem && <details><summary>Corrigir ou cancelar com recomposição de estoque</summary>
        <form action={correctDispensationAction} className="mt-2 grid gap-2 sm:grid-cols-2"><input type="hidden" name="dispensationId" value={dispensation.id} /><label className="grid gap-1">Quantidade correta<input name="quantity" type="number" step="any" defaultValue={dispensation.quantity} required className={field} /></label><label className="grid gap-1">Lote correto<input name="batchNumber" defaultValue={dispensation.stock?.batchNumber || ""} required className={field} /></label><label className="grid gap-1">Motivo da correção<input name="reason" required className={field} /></label><button className={field}>Corrigir preservando a origem</button></form>
        <form action={cancelDispensationAction} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="dispensationId" value={dispensation.id} /><label className="grid gap-1">Motivo do cancelamento<input name="reason" required className={field} /></label><button className={field}>Cancelar e recompor estoque</button></form>
      </details>}
    </> : <p>Cancelamento: {dispensation.cancellationReason} · {dispensation.cancelledAt?.toLocaleString("pt-BR")}</p>}
    <details><summary>Histórico da dispensação</summary>{dispensation.events.map(event => <p key={event.id}>{event.createdAt.toLocaleString("pt-BR")} · {event.kind} · {event.reason} · usuário {event.actorUsuarioId}</p>)}</details>
  </article>;
}
