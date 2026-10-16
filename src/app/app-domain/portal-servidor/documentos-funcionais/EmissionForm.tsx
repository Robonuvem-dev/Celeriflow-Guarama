"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueMyFunctionalDocument } from "./actions";
import { generatedDocumentKinds } from "@/lib/portal-servidor/document-policy";

export const documentLabels: Record<string, string> = { IRRF_ANUAL: "Informe anual de rendimentos / IRRF", RECIBO_FERIAS: "Recibo de férias", DECLARACAO_VINCULO: "Declaração de vínculo", TEMPO_SERVICO: "Declaração de tempo de serviço", MAGISTERIO: "Declaração de exercício no magistério", TERMO_RESCISAO: "Termo de rescisão", MARGEM: "Margem consignável por banco", PPP: "Perfil Profissiográfico Previdenciário" };
export function FunctionalEmissionForm({ initialKey, models, contracts, statements, suppliers }: { initialKey: string; models: { id: string; name: string; kinds: string[] }[]; contracts: { id: string; label: string }[]; statements: { id: string; label: string }[]; suppliers: { id: string; label: string }[] }) {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState(""), [id, setId] = useState(""), [requestKey, setRequestKey] = useState(initialKey), [kind, setKind] = useState("DECLARACAO_VINCULO");
  const router = useRouter(), today = new Date().toISOString().slice(0, 10), control = "h-9 rounded border bg-white px-2";
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setMessage(""); setId("");
    startTransition(async () => {
      try {
        const result = await issueMyFunctionalDocument({ requestKey, kind, policyId: String(data.get("policyId")), contractId: String(data.get("contractId") || "") || undefined, statementId: String(data.get("statementId") || "") || undefined, supplierId: String(data.get("supplierId") || "") || undefined, year: data.get("year") ? Number(data.get("year")) : undefined, from: String(data.get("from")), until: String(data.get("until")) });
        if (result.error) { setMessage(result.error); return; }
        setId(result.id || ""); setMessage("Documento registrado. Quando o modelo exigir assinatura, a emissão ficará disponível após a conclusão no GED."); setRequestKey(crypto.randomUUID()); router.refresh();
      } catch { setMessage("Não foi possível emitir o documento."); }
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded border bg-white p-4 text-xs"><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
    <label className="flex flex-col gap-1">Documento<select value={kind} onChange={event => setKind(event.target.value)} className={control}>{generatedDocumentKinds.map(value => <option key={value} value={value}>{documentLabels[value]}</option>)}</select></label>
    <label className="flex flex-col gap-1">Modelo publicado pelo RH<select name="policyId" required className={control}>{models.filter(model => model.kinds.includes(kind)).map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
    <label className="flex flex-col gap-1">Início do período<input name="from" type="date" defaultValue={`${today.slice(0, 4)}-01-01`} required className={control} /></label><label className="flex flex-col gap-1">Fim do período<input name="until" type="date" defaultValue={today} required className={control} /></label>
    {["DECLARACAO_VINCULO", "TEMPO_SERVICO", "MAGISTERIO"].includes(kind) && <label className="flex flex-col gap-1 sm:col-span-2">Vínculo próprio<select name="contractId" required className={control}>{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.label}</option>)}</select></label>}
    {["RECIBO_FERIAS", "TERMO_RESCISAO"].includes(kind) && <label className="flex flex-col gap-1 sm:col-span-2">Demonstrativo publicado correspondente<select name="statementId" required className={control}>{statements.map(statement => <option key={statement.id} value={statement.id}>{statement.label}</option>)}</select></label>}
    {kind === "IRRF_ANUAL" && <label className="flex flex-col gap-1">Ano do pagamento<input name="year" type="number" required defaultValue={Number(today.slice(0, 4)) - 1} min={1900} max={2200} className={control} /></label>}
    {kind === "MARGEM" && <label className="flex flex-col gap-1 sm:col-span-2">Banco/convenente<select name="supplierId" required className={control}>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.label}</option>)}</select></label>}
    <button className="rounded bg-emerald-800 px-4 py-2 font-semibold text-white sm:col-span-2">{pending ? "Emitindo…" : "Gerar documento de origem"}</button>
  </fieldset>{message && <p role="status">{message}</p>}{id && <a href={`/api/portal-servidor/documentos-funcionais/${id}`} className="inline-block font-semibold text-emerald-800 underline">Abrir documento registrado</a>}</form>;
}
