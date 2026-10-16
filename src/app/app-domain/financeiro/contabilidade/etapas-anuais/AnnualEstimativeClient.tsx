"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { executeEstimativeBalances } from "../actions";

type Year = { id: string; year: number; status: string; entityName: string };
type Stage = { id: string; year: number; operation: string; reason: string; createdAt: string; summary: string };

export default function AnnualEstimativeClient({ years, stages }: { years: Year[]; stages: Stage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestKey, setRequestKey] = useState("");
  const [notice, setNotice] = useState("");
  return <section className="space-y-3 rounded border bg-white p-4"><h2 className="font-bold">Saldos de empenhos estimativos</h2><p className="text-sm text-slate-600">Antes de fechar dezembro, escolha manter os saldos para inscrição em RAP ou anular automaticamente a parcela não liquidada. A parcela já liquidada permanece exigível. Se dezembro estiver fechado, solicite sua reabertura autorizada em Contabilidade e feche-o novamente após esta etapa.</p>
    <form className="grid gap-3 sm:grid-cols-2" onChange={() => setRequestKey("")} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const key = requestKey || crypto.randomUUID();
        setRequestKey(key);
        const result = await executeEstimativeBalances({ financialYearId: String(data.get("financialYearId")), operation: data.get("operation") === "CANCEL_UNSETTLED" ? "CANCEL_UNSETTLED" : "KEEP", reason: String(data.get("reason")), requestKey: key });
        setNotice(result.error ?? `Etapa ${result.stageId}: ${result.replay ? "já registrada" : "concluída"}. Após fechar as competências, reapure as inscrições de RAP.`);
        if (!result.error) { setRequestKey(""); router.refresh(); }
      });
    }}><fieldset disabled={pending} className="contents"><label className="grid gap-1 text-sm">Exercício<select required name="financialYearId" className="rounded border p-2"><option value="">Selecione</option>{years.filter(year => year.status === "Aberto").map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year}</option>)}</select></label><label className="grid gap-1 text-sm">Opção<select required name="operation" className="rounded border p-2"><option value="KEEP">Manter saldos para inscrição em RAP</option><option value="CANCEL_UNSETTLED">Anular saldos não liquidados</option></select></label><label className="grid gap-1 text-sm sm:col-span-2">Justificativa<input required name="reason" className="rounded border p-2" /></label><button className="w-fit rounded border px-3 py-2 font-semibold">{pending ? "Preparando saldos…" : "Executar etapa estimativa"}</button></fieldset></form>
    {notice && <p role="status" className="rounded bg-amber-50 p-3 text-sm">{notice}</p>}
    <details><summary className="font-semibold">Histórico documental dos saldos estimativos</summary><div className="space-y-2 pt-2">{stages.map(stage => <article key={stage.id} className="rounded border p-3 text-sm"><h3 className="font-semibold">{stage.year} · {stage.operation === "CANCEL_UNSETTLED" ? "Anulação dos saldos não liquidados" : "Manutenção para RAP"}</h3><p>{stage.reason}</p><p>{new Date(stage.createdAt).toLocaleString("pt-BR")} · {stage.id}</p><pre className="mt-2 overflow-x-auto text-xs">{stage.summary}</pre></article>)}{!stages.length && <p className="text-sm text-slate-500">Nenhuma etapa estimativa registrada.</p>}</div></details>
  </section>;
}
