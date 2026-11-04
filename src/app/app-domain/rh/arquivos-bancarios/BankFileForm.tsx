"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";
import { generateBankFileAction } from "./actions";
import { PERSONNEL_ISSUER } from "@/lib/rh/personnel-presentation";

export function BankFileForm({ today }: { today: string }) {
  const router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(data: FormData) {
    setPending(true); setError("");
    try {
      const result = await generateBankFileAction(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
      if (result.error) setError(result.error); else { router.push(`/rh/arquivos-bancarios?generated=${result.id}`); router.refresh(); }
    } catch { setError("Falha de comunicação. Os parâmetros permanecem no formulário."); }
    finally { setPending(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="grid gap-4 rounded border bg-white p-4 md:grid-cols-2">
    <p className="text-sm md:col-span-2">Selecione a execução encerrada e informe os parâmetros do convênio. Agência e conta dos destinatários são lidas em Convênios bancários; use número-DV para crédito CNAB240. O arquivo e a relação ficam preservados com SHA-256. A geração não registra pagamento nem transmite ao banco.</p>
    <label>Execução oficial fechada<ReferenceLookup kind="payroll-run" name="runId" required /></label>
    <label>Convênio BB vigente<ReferenceLookup kind="bank-credit-convention" name="conventionId" required /></label>
    <label>Leiaute<select name="layout" className="block w-full rounded border p-2"><option value="BB_EDO001">Contracheques BB — EDO001 (100 posições)</option><option value="BB_CNAB240_2026_06">Crédito em conta — BB CNAB240 junho/2026</option></select></label>
    <label>Nome do órgão no arquivo<input name="payerName" required defaultValue={PERSONNEL_ISSUER} className="block w-full rounded border p-2" maxLength={100} /></label>
    {[['payerCnpj','CNPJ pagador (14 algarismos)'],['payerAgency','Agência pagadora sem DV'],['payerAgencyDv','DV da agência pagadora'],['payerAccount','Conta pagadora sem DV'],['payerAccountDv','DV da conta pagadora'],['contract','Contrato EDO (até 12 algarismos) ou convênio CNAB (até 9)'],['sequence','Sequência da remessa (1 a 999999)'],['extra','Remessa extraordinária EDO (0 a 99)']].map(([name,label]) => <label key={name}>{label}<input name={name} required defaultValue={name === 'extra' ? '0' : undefined} className="block w-full rounded border p-2" /></label>)}
    <label>Data programada de crédito<input name="paymentDate" type="date" required className="block w-full rounded border p-2" /></label>
    <label>Data de geração<input name="generationDate" type="date" required defaultValue={today} className="block w-full rounded border p-2" /></label>
    <p className="text-sm md:col-span-2">EDO utiliza matrícula numérica e conta BB vinculada ao convênio selecionado. CNAB utiliza a única conta corrente/salário vigente de cada titular, com lotes próprios para BB e TED de outros bancos. Líquidos zero são identificados na memória de geração e não geram crédito. Os campos de nome bancário seguem os limites de 30/40 posições; a relação mantém o nome integral.</p>
    {error && <p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p>}
    <button disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white">{pending ? "Gerando…" : "Gerar e preservar arquivo"}</button>
  </form>;
}
