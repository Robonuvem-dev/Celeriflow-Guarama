"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { usePanelPage, type PanelReply } from "../../_components/usePanelPage";
import { SstTablePanel } from "../../_components/SstTablePanel";
import { sstColumn } from "../../_components/operational-columns";
import { SstForm } from "../../SstForm";
import { saveEquipmentEvent } from "../actions";

type DeliveryItem = { id: string; deliveryId: string; employee: string; equipment: string; quantity: number; writtenOffQuantity: number; deliveredAt: string; nextReviewAt: string; expiresAt: string };

export function DeliveryEventEditor({ items, page, total, loadPageAction, children }: { items: DeliveryItem[]; page: number; total: number; loadPageAction: (page: number) => Promise<PanelReply<DeliveryItem>>; children: ReactNode }) {
  // This owner is outside the panel. Neither route pagination nor closing it
  // remounts the command form or restricts its payload to the visible page.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data, pending, error, changePage, retry } = usePanelPage({ rows: items, page, total }, loadPageAction);
  const commandKey = useRef<string | null>(null);
  async function submitEvent(form: FormData) {
    commandKey.current ??= crypto.randomUUID();
    form.set("submissionKey", commandKey.current);
    const submittedIds = new Set(form.getAll("itemIds").map(String));
    const result = await saveEquipmentEvent(form);
    if (!result.error) {
      commandKey.current = null;
      setSelectedIds(current => current.filter(id => !submittedIds.has(id)));
      await changePage(data.page);
    }
    return result;
  }
  return <section className="space-y-3"><SstForm action={submitEvent} label="Registrar evento nos itens selecionados">
    {children}
    {selectedIds.map(id => <input key={id} type="hidden" name="itemIds" value={id} />)}
    <div className="flex items-center gap-3"><span role="status">{selectedIds.length} itens selecionados em todas as páginas</span><button type="button" onClick={() => setSelectedIds([])}>Limpar seleção</button></div>
    </SstForm>
    <SstTablePanel title="Entregas, baixas e revisões" triggerLabel="Selecionar entregas em tela cheia" description="Seleção acumulada por ID em todas as páginas. Feche a consulta para preencher e enviar o evento; campos e seleção permanecem no formulário." preferenceId="sst-equipamentos-entregas"
      columns={[sstColumn("selection", "Sel.", 55, 45), sstColumn("employee", "Servidor", 190, 110), sstColumn("equipment", "Material", 190, 110), sstColumn("inUse", "Em uso", 80, 65, "text", "right"), sstColumn("quantity", "Entregue", 90, 70, "text", "right"), sstColumn("status", "Situação", 110, 80, "status"), sstColumn("deliveredAt", "Entrega", 120, 90), sstColumn("review", "Revisão", 120, 90), sstColumn("expires", "Validade", 120, 90), sstColumn("actions", "Ficha", 70, 60, "actions")]}
      rows={data.rows.map(item => ({ id: item.id, label: item.employee, values: { selection: selectedIds.includes(item.id) ? "Selecionado" : "Não selecionado", employee: item.employee, equipment: item.equipment, inUse: String(item.quantity - item.writtenOffQuantity), quantity: String(item.quantity), status: item.quantity === item.writtenOffQuantity ? "Baixado" : "Em uso", deliveredAt: item.deliveredAt, review: item.nextReviewAt, expires: item.expiresAt }, cells: { selection: <input type="checkbox" aria-label={`Selecionar entrega de ${item.employee}`} checked={selectedIds.includes(item.id)} disabled={item.quantity === item.writtenOffQuantity} onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))} /> }, actions: <Link href={`/sst/equipamentos/entregas/${item.deliveryId}`}>Abrir</Link> }))}
      toolbar={error && <><span role="alert">{error}</span><button type="button" onClick={retry}>Tentar novamente</button></>}
      pagination={<OperationalPagination page={data.page} total={data.total} pending={pending} onPageChange={value => void changePage(value)} />} emptyMessage="Nenhuma entrega encontrada." />
  </section>;
}
