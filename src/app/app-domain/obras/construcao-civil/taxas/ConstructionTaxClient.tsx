"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueConstructionFeeAction, publishConstructionTaxRuleAction } from "../tax-actions";
import { constructionFeeKinds } from "@/lib/obras/construction-tax-engine";

type Option = { id: string; name: string };
export default function ConstructionTaxClient({ taxes, cases, canManage }: { taxes: Option[]; cases: { id: string; name: string; revision: number; documentRequests: Option[]; properties: Option[]; taxpayer: Option | null }[]; canManage: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState(cases[0]?.id || "");
  const current = cases.find((record) => record.id === caseId);
  async function submit(event: React.FormEvent<HTMLFormElement>, operation: "rule" | "fee") {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const result = operation === "rule" ? await publishConstructionTaxRuleAction({ ...data, demonstration: data.demonstration === "on" }) : await issueConstructionFeeAction({ ...data, requestKey: crypto.randomUUID(), revision: Number(data.revision) });
      if (result.error) setMessage(result.error); else { setMessage("Operação tributária registrada."); router.refresh(); }
    } catch { setMessage("Falha de comunicação. Atualize para verificar o lançamento antes de repetir."); }
    finally { setBusy(false); }
  }
  const inputClass = "w-full rounded border p-2 text-sm";
  return <div className="space-y-4">
    <p className="text-sm">Baixas, estornos e conciliação utilizam a Tributação e a integração financeira existentes. Guias demonstrativas não são títulos bancários.</p>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    {canManage && <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={(event) => submit(event, "rule")} className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Publicar regra de taxa</h2>
        <label className="block">Finalidade<select name="kind" className={inputClass}>{Object.entries(constructionFeeKinds).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="block">Tributo real<select required name="taxId" className={inputClass}>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></label>
        <label className="block">Início<input required type="date" name="startsAt" className={inputClass} /></label>
        <label className="block">Fim opcional<input type="date" name="endsAt" className={inputClass} /></label>
        <label className="block">Valor fixo (R$)<input required name="fixedAmount" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} /></label>
        <label className="block">Valor por m² (R$)<input required name="amountPerSquareMeter" type="number" min="0" step="0.0001" defaultValue="0" className={inputClass} /></label>
        <label className="block">Fundamento legal<textarea required name="legalBasis" className={inputClass} /></label>
        <label className="block">Instruções da guia<textarea required name="guideInstructions" className={inputClass} /></label>
        <label className="block"><input type="checkbox" name="demonstration" defaultChecked /> Ambiente demonstrativo (código FEBRABAN sem convênio, não pagável)</label>
        <p className="text-xs">Nova versão imutável; a publicação vigente mais recente prevalece. Modo real utiliza o DAM interno sem inventar convênio ou código bancário.</p>
        <button disabled={busy || !taxes.length} className="rounded border px-3 py-2">Publicar versão</button>
      </form>
      <form key={caseId} onSubmit={(event) => submit(event, "fee")} className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Lançar taxa / registrar isenção</h2>
        <label className="block">Processo<select name="caseId" value={caseId} onChange={(event) => setCaseId(event.target.value)} className={inputClass}>{cases.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
        <label className="block">Finalidade<select name="kind" className={inputClass}>{Object.entries(constructionFeeKinds).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="block">Revisão (0 para outras taxas; reanálise até {current?.revision || 0})<input name="revision" required type="number" min="0" max={current?.revision || 0} defaultValue="0" className={inputClass} /></label>
        <label className="block">Ciclo de correção/renovação<select name="documentRequestId" className={inputClass}><option value="">Taxa inicial ou reanálise técnica</option>{current?.documentRequests.map((request) => <option key={request.id} value={request.id}>{request.name}</option>)}</select></label>
        <label className="block">Contribuinte do requerente<select required name="taxpayerId" className={inputClass}>{current?.taxpayer && <option value={current.taxpayer.id}>{current.taxpayer.name}</option>}</select></label>
        <label className="block">Imóvel vinculado<select required name="realEstateId" className={inputClass}>{current?.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label className="block">Vencimento<input required name="dueDate" type="date" className={inputClass} /></label>
        <label className="block">Fundamento de isenção (opcional)<textarea name="exemptionReason" className={inputClass} /></label>
        <p className="text-xs">Sem contribuinte ativo vinculado ao requerente, regularize primeiro o cadastro geral. Uma taxa por finalidade/ciclo/revisão; correção e renovação exigem pedido documental pendente e regra própria. Repetições recuperam o lançamento existente.</p>
        <button disabled={busy || !current?.taxpayer} className="rounded border px-3 py-2">Registrar taxa</button>
      </form>
    </div>}
  </div>;
}
