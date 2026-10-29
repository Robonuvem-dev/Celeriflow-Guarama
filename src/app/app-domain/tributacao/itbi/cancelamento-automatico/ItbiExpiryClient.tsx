"use client";

import { useState, useTransition } from "react";
import type { z } from "zod";
import type { itbiExpiryPolicySchema } from "@/lib/tributacao/itbi-expiry";
import { publishItbiExpiryPolicyAction, executeItbiExpiryAction } from "./actions";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../../TaxOperationalTable";

export default function ItbiExpiryClient(props: { units: { id: string; entityId: string; label: string }[]; policies: { version: number; data: z.infer<typeof itbiExpiryPolicySchema> }[] }) {
  const [unitId, setUnitId] = useState(""); const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<{ id: string; status: string; detail?: string }[]>([]);
  const unit = props.units.find(row => row.id === unitId); const policy = props.policies.find(row => row.data.budgetUnitId === unitId);
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <TaxOperationalTable id="itbi-cancelamento-automatico" resetKey={unitId} state={pending ? "loading" : "ready"}
    columns={[["id", "ITBI", 170, 250, "identifier"], ["status", "Resultado", 130, 200, "status"], ["detail", "Detalhe", 180, 400]]}
    rows={results.map(row => ({ id: row.id, label: row.id, values: { id: row.id, status: row.status, detail: row.detail ?? "—" } }))}
    actions={policy?.data.active && <button disabled={pending} onClick={() => startTransition(async () => { const response = await executeItbiExpiryAction({ governmentEntityId: policy.data.governmentEntityId, budgetUnitId: policy.data.budgetUnitId, expectedPolicyVersion: policy.version }); setNotice(response.error ?? `${response.result?.cancelled ?? 0} processos cancelados.`); setResults(response.result?.results ?? []); })} className="h-7 rounded border px-2 text-xs">Executar política vigente agora</button>}
    toolbar={<><label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">Ente / UG<select value={unitId} onChange={event => { setUnitId(event.target.value); setResults([]); }} className="h-7 min-w-0 flex-1 rounded border"><option value="">Selecione</option>{props.units.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label><OperationalFilters label="Política de cancelamento / resultado">{notice && <p role="status">{notice}</p>}{unit && <form key={`${unitId}:${policy?.version ?? 0}`} action={form => startTransition(async () => { const result = await publishItbiExpiryPolicyAction({ governmentEntityId: unit.entityId, budgetUnitId: unit.id, expectedVersion: policy?.version ?? 0, active: form.get("active") === "on", overdueDays: Number(form.get("days")), extinguishUnpaidAssessment: form.get("extinguish") === "on", legalBasis: String(form.get("legalBasis") ?? "") }); setNotice(result.error ?? "Política publicada."); })} className="space-y-3"><label className="flex gap-2"><input name="active" type="checkbox" defaultChecked={policy?.data.active ?? false} />Habilitar cancelamento automático nesta UG</label><label className="block">Cancelar após mais de quantos dias do vencimento?<input name="days" type="number" min="1" max="3650" required defaultValue={policy?.data.overdueDays ?? 30} className={field} /></label><label className="flex gap-2"><input name="extinguish" type="checkbox" defaultChecked={policy?.data.extinguishUnpaidAssessment ?? false} />Incluir crédito lançado e integralmente não pago, com extinção contábil fundamentada</label><p>Processos sem vencimento conciliado, com pagamento, compensação, transferência ou crédito indisponível são preservados.</p><label className="block">Fundamento legal da política<textarea name="legalBasis" required defaultValue={policy?.data.legalBasis} className={field} /></label><button disabled={pending} className="rounded border p-2">Publicar política</button></form>}</OperationalFilters></>} />;
}
