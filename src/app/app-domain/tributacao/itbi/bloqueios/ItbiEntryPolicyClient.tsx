"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import type { itbiEntryPolicySchema } from "@/lib/tributacao/itbi-entry-policy";
import { publishItbiEntryPolicyAction } from "./actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../../TaxDraftControls";

type Policy = z.infer<typeof itbiEntryPolicySchema>;
const conditions: Record<Policy["rules"][number]["condition"], string> = { TAX_DEBT: "Débito tributário do imóvel", NON_TAX_DEBT: "Débito não tributário", RISK_AREA: "Área de risco", PROTECTED_AREA: "Área de proteção ambiental", MISSING_COORDINATES: "Localização sem coordenadas", DECLARED_BELOW_VALUATION: "Declarado inferior à avaliação", INACTIVE_PROPERTY: "Imóvel inativo ou baixado", PARTIAL_TRANSFER: "Transferência parcial", LEASEHOLD: "Imóvel foreiro" };

function RuleTypes({ types, value, onChange }: { types: { id: string; label: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  return <OperationalTablePanel title="Modalidades da regra ITBI" triggerLabel={`Modalidades (${value.length})`} description="Sem seleção, a regra abrange todas as modalidades da origem."><TaxOperationalTable id="itbi-regra-modalidades" columns={[["selected", "Aplicar", 64, 80], ["name", "Modalidade", 120, 750]]} rows={types.map(type => ({ id: type.id, label: type.label, values: { selected: value.includes(type.id) ? "Sim" : "Não", name: type.label }, cells: { selected: <input type="checkbox" aria-label={`Aplicar a ${type.label}`} checked={value.includes(type.id)} onChange={event => onChange(event.target.checked ? [...value, type.id] : value.filter(id => id !== type.id))} /> } }))} /></OperationalTablePanel>;
}

export default function ItbiEntryPolicyClient({ units, policies, types }: { units: { id: string; entityId: string; label: string }[]; policies: { unitId: string; version: number; data: Policy }[]; types: { id: string; label: string; unitId: string }[] }) {
  const router = useRouter(); const [unitId, setUnitId] = useState(""); const [rules, setRules] = useState<Policy["rules"]>([]); const [active, setActive] = useState(true); const [basis, setBasis] = useState(""); const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const policy = policies.find(row => row.unitId === unitId); const unit = units.find(row => row.id === unitId); const field = "mt-1 w-full rounded border p-2 text-xs";
  const change = (index: number, patch: Partial<Policy["rules"][number]>) => setRules(rows => rows.map((row, at) => at === index ? { ...row, ...patch } : row));
  const add = () => setRules(rows => [...rows, { code: "", condition: "TAX_DEBT", action: "WARN", message: "", transactionTypeIds: [] }]);
  return <div className="h-full space-y-4 overflow-auto p-4"><h1 className="text-lg font-bold">ITBI · bloqueios e avisos de inclusão</h1><p className="text-xs">Regras aplicadas à inclusão interna, pelo portal e pelos tabelionatos, inclusive a cada imóvel de um conjunto. Avisos são preservados no histórico. Sem modalidades selecionadas, a regra abrange todas as modalidades da origem.</p>{notice && <p role="status" className="rounded border p-2 text-sm">{notice}</p>}
    <label className="text-xs">Origem municipal<select className={field} value={unitId} onChange={event => { const id = event.target.value; const data = policies.find(row => row.unitId === id)?.data; setUnitId(id); setRules(data?.rules ?? []); setActive(data?.active ?? true); setBasis(data?.legalBasis ?? ""); }}><option value="">Selecione</option>{units.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
    {unit && <form className="space-y-3" action={() => startTransition(async () => { const result = await publishItbiEntryPolicyAction({ governmentEntityId: unit.entityId, budgetUnitId: unit.id, expectedVersion: policy?.version ?? 0, active, legalBasis: basis, rules }); setNotice(result.error ?? "Nova versão da política publicada."); if (!result.error) router.refresh(); })}>
      <p className="text-xs">Versão atual: {policy?.version ?? 0}</p><label className="flex gap-2 text-xs"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Aplicar política às novas inclusões</label>
      <OperationalTablePanel title="Regras de bloqueio e aviso ITBI" triggerLabel={`Editar regras (${rules.length})`}><TaxOperationalTable id="itbi-politica-regras-rascunho" resetKey={unitId} actions={<button type="button" disabled={rules.length >= 100} onClick={add}>Adicionar regra</button>}
        columns={[["code", "Código", 64, 110], ["condition", "Condição", 100, 230], ["action", "Ação", 90, 180], ["message", "Mensagem", 100, 260], ["types", "Modalidades", 140, 180], ["actions", "Remover", 72, 72, "actions"]]}
        rows={rules.map((row, index) => ({ id: String(index), label: row.code || `Regra ${index + 1}`, values: { code: row.code, condition: conditions[row.condition], action: row.action === "WARN" ? "Avisar e registrar" : "Bloquear gravação", message: row.message, types: row.transactionTypeIds.map(id => types.find(type => type.id === id)?.label ?? id).join("; ") || "Todas as modalidades da origem" }, cells: {
          code: <input aria-label={`Código da regra ${index + 1}`} maxLength={60} value={row.code} onChange={event => change(index, { code: event.target.value })} className={taxDraftInput} />,
          condition: <select aria-label={`Condição da regra ${index + 1}`} value={row.condition} onChange={event => change(index, { condition: event.target.value as typeof row.condition })} className={taxDraftInput}>{Object.entries(conditions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>,
          action: <select aria-label={`Ação da regra ${index + 1}`} value={row.action} onChange={event => change(index, { action: event.target.value as typeof row.action })} className={taxDraftInput}><option value="WARN">Avisar e registrar</option><option value="BLOCK">Bloquear gravação</option></select>,
          message: <TaxDraftText label={`Mensagem da regra ${index + 1}`} maxLength={2000} value={row.message} onChange={value => change(index, { message: value })} />,
          types: <span className="[&>button]:h-6! [&>button]:max-w-full [&>button]:px-1"><RuleTypes types={types.filter(type => type.unitId === unit.id)} value={row.transactionTypeIds} onChange={ids => change(index, { transactionTypeIds: ids })} /></span>,
        }, actions: <button type="button" onClick={() => setRules(rows => rows.filter((_row, at) => at !== index))} className="h-6 rounded border px-1 text-[13px]">Remover</button> }))} /></OperationalTablePanel>
      <button type="button" disabled={rules.length >= 100} onClick={add} className="rounded border p-2 text-xs">Adicionar regra</button>
      <label className="block text-xs">Fundamento legal<textarea required maxLength={4000} value={basis} onChange={event => setBasis(event.target.value)} className={field} /></label><button disabled={pending} className="rounded bg-emerald-700 p-2 text-xs text-white">Publicar nova versão</button>
    </form>}
  </div>;
}
