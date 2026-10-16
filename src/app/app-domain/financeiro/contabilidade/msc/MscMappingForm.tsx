"use client";

import { useEffect, useState } from "react";
import { lookupMscChoice, saveMscMapping } from "./actions";

type Kind = "ACCOUNT" | "SOURCE" | "REVENUE" | "EXPENSE";
type Field = Kind | "MSC_ACCOUNT" | "MSC_FR" | "MSC_NR" | "MSC_ND" | "MSC_PO" | "MSC_FP" | "MSC_DC" | "MSC_CO" | "PREDECESSOR";
type Scope = { governmentEntityId: string; budgetUnitId: string; financialYearId: string; year: number };

function Lookup({ name, label, field, kind, scope, canonicalId = "", required = false, onSelect }: { name: string; label: string; field: Field; kind: Kind; scope: Scope; canonicalId?: string; required?: boolean; onSelect?: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ options: Array<{ id: string; name: string }>; total: number; page: number }>({ options: [], total: 0, page: 1 });
  const [selected, setSelected] = useState<{ id: string; name: string }>({ id: "", name: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      lookupMscChoice({ field, kind, governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId, financialYearId: scope.financialYearId, canonicalId, q, page }).then(value => { if (current) { if ("error" in value) setError(value.error); else { setResult(value); setError(""); } } }).catch(() => { if (current) setError("Não foi possível pesquisar. Verifique a conexão e tente novamente."); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [field, kind, scope.governmentEntityId, scope.budgetUnitId, scope.financialYearId, canonicalId, q, page]);
  const fieldStyle = "block w-full rounded border p-2 text-sm";
  return <div className="space-y-1"><label className="block text-sm font-medium">{label}<input value={q} onChange={event => { setQ(event.target.value); setPage(1); }} maxLength={150} placeholder="Pesquisar por código ou descrição" aria-label={`Pesquisar ${label}`} className={fieldStyle} /></label>
    <select name={name} required={required} aria-label={label} value={selected.id} onChange={event => { const option = result.options.find(item => item.id === event.target.value) ?? { id: "", name: "" }; setSelected(option); onSelect?.(option.id); }} className={fieldStyle}>
      <option value="">Selecionar</option>{selected.id && !result.options.some(item => item.id === selected.id) && <option value={selected.id}>{selected.name}</option>}{result.options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <div className="flex items-center gap-2 text-xs"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Anterior</button><span>{result.total} opções · página {result.page}</span><button type="button" disabled={result.page * 20 >= result.total} onClick={() => setPage(result.page + 1)}>Próxima</button></div>{error && <p className="text-xs text-red-700">{error}</p>}
  </div>;
}

export default function MscMappingForm({ scope }: { scope: Scope }) {
  const [kind, setKind] = useState<Kind>("ACCOUNT");
  const [canonicalId, setCanonicalId] = useState("");
  const target: Record<Kind, Field> = { ACCOUNT: "MSC_ACCOUNT", SOURCE: "MSC_FR", REVENUE: "MSC_NR", EXPENSE: "MSC_ND" };
  return <form action={saveMscMapping} className="space-y-4 rounded border bg-white p-4">
    <h2 className="font-semibold">Publicar edição municipal de de-para MSC</h2>
    <input type="hidden" name="governmentEntityId" value={scope.governmentEntityId} /><input type="hidden" name="budgetUnitId" value={scope.budgetUnitId} /><input type="hidden" name="financialYearId" value={scope.financialYearId} />
    <label className="block text-sm">Tipo<select name="kind" value={kind} onChange={event => { setKind(event.target.value as Kind); setCanonicalId(""); }} className="block w-full rounded border p-2">{[["ACCOUNT", "Conta contábil"], ["SOURCE", "Fonte ou destinação"], ["REVENUE", "Natureza de receita"], ["EXPENSE", "Natureza de despesa"]].map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
    <div className="grid gap-4 md:grid-cols-2"><Lookup key={`canonical:${kind}`} name="canonicalId" label="Cadastro canônico de origem" field={kind} kind={kind} scope={scope} required onSelect={setCanonicalId} /><Lookup key={`reference:${kind}`} name="referenceEntryId" label="Destino oficial STN / MSC" field={target[kind]} kind={kind} scope={scope} required /></div>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">Vigência inicial<input required type="date" name="effectiveFrom" defaultValue={`${scope.year}-01-01`} className="block w-full rounded border p-2" /></label><label className="text-sm">Vigência final<input required type="date" name="effectiveUntil" defaultValue={`${scope.year}-12-31`} className="block w-full rounded border p-2" /></label></div>
    <Lookup key={`predecessor:${kind}:${canonicalId}`} name="predecessorEntryId" label="Edição predecessora (para sucessão)" field="PREDECESSOR" kind={kind} canonicalId={canonicalId} scope={scope} />
    {kind === "ACCOUNT" && <fieldset className="space-y-3 rounded border p-3"><legend className="px-1 text-sm font-semibold">Informações fixas admitidas pela conta</legend><div className="grid gap-4 md:grid-cols-2">
      <Lookup name="poEntryId" label="PO — Poder/Órgão" field="MSC_PO" kind={kind} scope={scope} required /><Lookup name="fpEntryId" label="FP — Financeiro/Permanente" field="MSC_FP" kind={kind} scope={scope} />
      <Lookup name="dcEntryId" label="DC — parcela não integrante da dívida consolidada" field="MSC_DC" kind={kind} scope={scope} /><Lookup name="coEntryId" label="CO — acompanhamento da execução" field="MSC_CO" kind={kind} scope={scope} />
    </div><label className="block text-sm"><input type="checkbox" name="omitCo" /> CO não se aplica à origem desta edição; fundamentar abaixo</label><label className="block text-sm"><input type="checkbox" name="omitDc" /> Marcador DC não se aplica à origem desta edição; fundamentar abaixo</label><p className="text-xs">FR/NR/ND vêm dos de-paras dos cadastros canônicos. FS vem da função/subfunção documentada na origem. AI exige o ano documental da inscrição em restos a pagar.</p></fieldset>}
    <label className="block text-sm">Fundamento e motivo da edição<textarea required name="reason" minLength={10} maxLength={4000} className="block min-h-24 w-full rounded border p-2" /></label>
    <button className="rounded bg-emerald-700 px-4 py-2 text-white">Publicar edição e preservar anteriores</button>
  </form>;
}
