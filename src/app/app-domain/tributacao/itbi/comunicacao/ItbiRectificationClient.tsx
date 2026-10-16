"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rectifyTransferredItbiAction } from "./actions";

export default function ItbiRectificationClient(props: { declarationId: string; updatedAt: string; declaredValue: string; documents: { id: string; title: string }[] }) {
  const router = useRouter(); const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <details className="rounded border p-3 print:hidden"><summary className="cursor-pointer text-sm font-semibold">Retificar ITBI com transferência fiscal realizada</summary><p className="mt-2 text-xs">A retificação gera novo identificador, preserva as partes e a fração transferida e reaproveita o crédito com seus pagamentos. Havendo diferença a recolher, será emitida guia retificadora.</p>{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}<form action={form => startTransition(async () => {
    const text = (key: string) => String(form.get(key) ?? "");
    const result = await rectifyTransferredItbiAction({ declarationId: props.declarationId, expectedUpdatedAt: props.updatedAt, declaredValue: text("declared"), assessedPropertyValue: text("assessed"), registryOffice: text("office"), dueDate: text("due"), reason: text("reason"), legalBasis: text("basis"), documentIds: form.getAll("documents").map(String) });
    if ("error" in result) { setNotice(result.error); return; }
    router.push(`/tributacao/itbi/comunicacao?id=${encodeURIComponent(result.declarationId!)}`);
  })} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Valor declarado integral retificado (R$)<input name="declared" type="number" min="0.01" step="0.01" defaultValue={props.declaredValue} required className={field}/></label><label className="text-xs">Avaliação integral própria do ITBI retificador (R$)<input name="assessed" type="number" min="0.01" step="0.01" required className={field}/></label><label className="text-xs">Cartório<input name="office" maxLength={240} required className={field}/></label><label className="text-xs">Vencimento da diferença<input name="due" type="date" required className={field}/></label><label className="text-xs">Fundamento legal<textarea name="basis" required maxLength={4000} className={field}/></label><label className="text-xs">Motivo da retificação<textarea name="reason" required maxLength={8000} className={field}/></label><label className="text-xs sm:col-span-2">Documentos comprobatórios do processo<select name="documents" multiple required className={field}>{props.documents.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><button disabled={pending} className="rounded border p-2 text-xs">Retificar e emitir documentos</button></form></details>;
}
