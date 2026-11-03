"use client";
import { useState } from "react";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";
import { RhTablePanel } from "../_components/RhTablePanel";
import { rhColumn } from "../_components/operational-columns";
import { processRightsAction } from "./actions";

export function RightsProcessingForm({ canApply }: { canApply: boolean }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof processRightsAction>> | null>(null), [pending, setPending] = useState(false);
  async function submit(data: FormData) {
    setPending(true);
    try { setResult(await processRightsAction({ contractIds: String(data.get("contractIds") ?? "").split(",").filter(Boolean), referenceDate: String(data.get("referenceDate") ?? ""), mode: String(data.get("mode") ?? "PREVIA") })); }
    catch { setResult({ rows: [], applied: false, error: "Falha de comunicação. Os contratos selecionados foram preservados." }); }
    finally { setPending(false); }
  }
  return <div className="space-y-3"><form action={submit} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-2"><label>Contratos selecionados<ReferenceLookup kind="contract" name="contractIds" multiple required /></label><label>Data de referência<input className="block rounded border p-2" type="date" name="referenceDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><div className="flex gap-3 md:col-span-2"><button disabled={pending} name="mode" value="PREVIA" className="rounded border px-3 py-2">Consultar direitos e próximas aquisições</button>{canApply && <button disabled={pending} name="mode" value="APLICAR" className="rounded bg-blue-700 px-3 py-2 text-white">Processar concessões devidas</button>}</div></form>
    {result?.error && <p role="alert">{result.error}</p>}
    {result && !result.error && <><p>{result.applied ? "Processamento concluído. Concessões já registradas foram preservadas." : "Previsão calculada sem alterar contratos ou saldos."}</p><RhTablePanel title="Direitos e aquisições" preferenceId="rh-processamentos-direitos" columns={[rhColumn("registration", "Matrícula", 120, 90), rhColumn("kind", "Direito", 130, 90), rhColumn("period", "Aquisição / prazo", 230, 130), rhColumn("quantity", "Quantidade / referência", 150, 100), rhColumn("status", "Situação", 180, 110), rhColumn("evidence", "Memória integral", 400, 180)]} rows={result.rows.map((row, index) => ({ id: `${row.contractId}:${row.ruleId}:${row.kind}:${row.start}:${index}`, label: row.registration, values: { registration: row.registration, kind: row.kind, period: `${row.start} a ${row.acquiredAt}${row.deadline ? `; utilizar até ${row.deadline}` : ""}`, quantity: row.quantity, status: row.status, evidence: row.evidence } }))} /></>}
  </div>;
}
