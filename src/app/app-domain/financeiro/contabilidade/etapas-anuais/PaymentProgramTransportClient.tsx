"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prepareAnnualPrograms, transportAnnualPrograms, undoAnnualPrograms } from "../actions";
import { submitPaymentToBank } from "../../pagamentos/actions";

type Year = { id: string; year: number; status: string; governmentEntityId: string; entityName: string };
type Program = { id: string; orderNumber: string; financialYearId: string; value: string; bankStatus: string | null };
type Copy = { sourcePaymentId: string; targetPaymentId: string; paymentOrderExternalId: string; netValue: string; bankStatus: string | null; status: string };
type Stage = { id: string; year: number; reason: string; undone: boolean; copies: Copy[] };
export default function PaymentProgramTransportClient({ years, programs, stages }: { years: Year[]; programs: Program[]; stages: Stage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const source = years.find(year => year.id === sourceId);
  return <section className="m-3 space-y-3 rounded border bg-white p-4"><h2 className="font-bold">Transporte de programações de pagamento</h2><p className="text-sm text-slate-600">Selecione todas as ordens pendentes das liquidações a transportar. A baixa na origem e a cópia no destino preservam líquido, retenções, documentos e correlação bancária. A inscrição RAP é transportada junto quando necessário. Ordens já remetidas aguardam o retorno original, sem outra remessa.</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => {
    const key = requestKey || crypto.randomUUID(); setRequestKey(key);
    const execute = source?.status === "Encerrado" ? transportAnnualPrograms : prepareAnnualPrograms;
    const result = await execute({ sourceFinancialYearId: sourceId, targetFinancialYearId: String(data.get("targetId")), paymentIds: data.getAll("paymentId").map(String), reason: String(data.get("reason")), requestKey: key });
    setNotice(result.error ?? `Programações ${source?.status === "Encerrado" ? "transportadas" : "preparadas para transporte após encerramento"} na edição ${result.stageId}.`);
    if (!result.error) { setRequestKey(""); router.refresh(); }
  }); }} onChange={() => setRequestKey("")}><fieldset disabled={pending} className="contents"><label className="grid gap-1 text-sm">Exercício de origem<select required className="rounded border p-2" value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Selecione</option>{years.filter(year => ["Aberto", "Em Encerramento", "Encerrado"].includes(year.status)).map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year} · {year.status}</option>)}</select></label><label className="grid gap-1 text-sm">Destino aberto<select required name="targetId" className="rounded border p-2"><option value="">Selecione</option>{years.filter(year => source && year.year === source.year + 1 && year.governmentEntityId === source.governmentEntityId && year.status === "Aberto").map(year => <option key={year.id} value={year.id}>{year.year}</option>)}</select></label><div className="grid gap-2 sm:col-span-2">{programs.filter(program => program.financialYearId === sourceId).map(program => <label key={program.id} className="flex gap-2 text-sm"><input type="checkbox" name="paymentId" value={program.id} />{program.orderNumber} · R$ {program.value} · {program.bankStatus ?? "Em aberto"}</label>)}</div><label className="grid gap-1 text-sm sm:col-span-2">Justificativa<input required name="reason" className="rounded border p-2" /></label><p className="text-xs text-slate-600 sm:col-span-2">Antes do fechamento mensal, prepare as ordens com seu destino documental. Após encerrar a origem, execute a baixa/cópia com a mesma seleção. Ordens alteradas ou com retorno financeiro não são dispensadas pelo fechamento.</p><button className="w-fit rounded border px-3 py-2 font-semibold">{source?.status === "Encerrado" ? "Baixar e copiar programações" : "Preparar para o encerramento"}</button></fieldset></form>{notice && <p role="status" className="rounded bg-amber-50 p-3 text-sm">{notice}</p>}
    <form className="grid gap-3 border-t pt-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(async () => {
      const result = await undoAnnualPrograms({ stageId: String(data.get("stageId")), reason: String(data.get("reason")) });
      setNotice(result.error ?? "Programações desmovimentadas; transporte RAP permanece como etapa independente.");
      if (!result.error) router.refresh();
    }); }}><fieldset disabled={pending} className="contents"><label className="grid gap-1 text-sm">Edição<select required name="stageId" className="rounded border p-2"><option value="">Selecione</option>{stages.filter(stage => !stage.undone).map(stage => <option key={stage.id} value={stage.id}>{stage.year} · {stage.id}</option>)}</select></label><label className="grid gap-1 text-sm">Justificativa<input required name="reason" className="rounded border p-2" /></label><button className="w-fit rounded border border-amber-700 px-3 py-2 text-sm">Desmovimentar programações</button></fieldset></form>
    {stages.map(stage => <details key={stage.id} className="rounded border p-3 text-sm"><summary>{stage.year} · {stage.undone ? "Desmovimentada" : "Transportada"} · {stage.id}</summary><p>{stage.reason}</p>{stage.copies.map(copy => <div key={copy.targetPaymentId} className="mt-2 border-t pt-2"><p>Origem {copy.sourcePaymentId} → destino {copy.targetPaymentId}</p><p>Correlação {copy.paymentOrderExternalId} · R$ {copy.netValue} · {copy.status} · {copy.bankStatus ?? "Sem integração bancária"}</p>{!stage.undone && copy.status === "Emitida" && copy.bankStatus === "PENDING_SUBMISSION" && <button disabled={pending} className="mt-2 rounded border px-2 py-1" onClick={() => startTransition(async () => { const result = await submitPaymentToBank(copy.targetPaymentId); setNotice(result.error ?? "Ordem enviada ao banco com sua chave original."); if (!result.error) router.refresh(); })}>Enviar ordem em aberto ao banco</button>}</div>)}</details>)}
  </section>;
}
