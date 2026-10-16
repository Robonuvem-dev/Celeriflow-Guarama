"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { savePlanningRecord, previewPlanningImportAction } from "@/app/app-domain/planejamento/actions";
import type { PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningLookupField } from "./PlanningLookupField";

const lookupFields = new Set(["governmentEntityId", "destinationEntityId", "budgetUnitId", "resourceSourceId", "revenueNatureId", "expenseNatureId", "programId", "programPPAId", "programCodes", "sourceCodes", "actionId", "actionPPAId", "objectiveId", "instrumentId", "sourceInstrumentId", "targetInstrumentId", "parentId", "catalogVersionId", "lineId", "lineCodes", "selectedCodes", "creditId", "waiverId", "taxId", "documentId", "hearingId", "signerIds", "linkId", "propositionId", "lawId"]);

export type PlanningField = {
  name: string; label: string; type?: "text" | "number" | "date" | "email" | "textarea" | "select" | "multiSelect" | "money" | "budgetItems" | "mapping" | "catalogMapping";
  required?: boolean; value?: string; options?: { id: string; name: string }[]; step?: string;
  mappingRows?: { sourceLineId: string; label: string; newCode: string; defaultTargetId?: string; targets: { id: string; name: string }[] }[];
  catalogRows?: { sourceEntryId: string; kind: string; label: string }[];
};

export function PlanningForm({ jurisdiction, operation, fields, hidden = {}, redirectTo }: {
  jurisdiction: PlanningJurisdiction; operation: string; fields: PlanningField[];
  hidden?: Record<string, string>; redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [resetKey, setResetKey] = useState(0);
  const [lookupInstrument, setLookupInstrument] = useState(hidden.instrumentId ?? "");
  const [lookupTarget, setLookupTarget] = useState("");
  const submissionKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewPlanningImportAction>>["data"]>();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = Object.fromEntries([...data].map(([key, value]) => [key, String(value)]));
    for (const field of fields.filter((field) => field.type === "multiSelect")) input[field.name] = data.getAll(field.name).map(String).join(",");
    if (operation === "import" && preview) { input.expectedSourceRevision = String(preview.sourceRevision); input.expectedTargetRevision = String(preview.targetRevision); input.expectedValuesHash = preview.valuesHash; }
    if (["import", "movement", "approvedLine", "compatibility", "compatibilityBatch", "physical", "quotaEvent", "contingency", "redistribute", "credit"].includes(operation)) {
      submissionKey.current ??= crypto.randomUUID();
      input.submissionKey = submissionKey.current;
    }
    setPending(true); setMessage({});
    try {
      const result = await savePlanningRecord(jurisdiction, operation, { ...input, ...hidden });
      if (result.error) setMessage({ error: result.error });
      else {
        setMessage({ success: "Registro salvo com sucesso." });
        form.reset();
        setResetKey((key) => key + 1);
        submissionKey.current = null;
        if (redirectTo && result.id) router.push(`${redirectTo}/${result.id}`);
        else router.refresh();
      }
    } catch { setMessage({ error: "Não foi possível concluir a solicitação. Tente novamente." }); }
    finally { setPending(false); }
  }
  return <form ref={formRef} onSubmit={submit} className="space-y-3">
    <fieldset key={resetKey} disabled={pending} className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => <div key={field.name} className={["textarea", "budgetItems", "mapping", "catalogMapping"].includes(field.type ?? "") ? "space-y-1 md:col-span-2" : "space-y-1"}>
        <Label htmlFor={`${operation}-${field.name}`}>{field.label}{field.required !== false && " *"}</Label>
        {(field.type === "select" || field.type === "multiSelect") && lookupFields.has(field.name) ? <PlanningLookupField jurisdiction={jurisdiction} name={field.name} label={field.label} value={field.value} options={field.options} required={field.required !== false} multiple={field.type === "multiSelect"} hidden={{ ...hidden, ...(operation === "import" && field.name === "expenseNatureId" && lookupTarget ? { instrumentId: lookupTarget } : lookupInstrument ? { instrumentId: lookupInstrument } : {}) }} operation={operation} onChange={["instrumentId", "sourceInstrumentId"].includes(field.name) ? setLookupInstrument : field.name === "targetInstrumentId" ? setLookupTarget : undefined} /> : field.type === "select" || field.type === "multiSelect" ? <select id={`${operation}-${field.name}`} name={field.name} multiple={field.type === "multiSelect"} required={field.required !== false} defaultValue={field.type === "multiSelect" ? field.value?.split(",") ?? [] : field.value ?? ""} className={`${field.type === "multiSelect" ? "min-h-24" : "h-9"} w-full rounded-md border bg-background px-2 text-sm`}>{field.type !== "multiSelect" && <option value="">Selecione</option>}{field.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          : field.type === "money" ? <PlanningMoneyField field={field} operation={operation} />
          : field.type === "budgetItems" ? <PlanningItemsField field={field} jurisdiction={jurisdiction} hidden={hidden} operation={operation} />
          : field.type === "mapping" ? <PlanningMappingField field={field} />
          : field.type === "catalogMapping" ? <PlanningCatalogMappingField field={field} jurisdiction={jurisdiction} />
          : field.type === "textarea" ? <Textarea id={`${operation}-${field.name}`} name={field.name} required={field.required !== false} defaultValue={field.value} />
          : <Input id={`${operation}-${field.name}`} name={field.name} type={field.type ?? "text"} step={field.step} required={field.required !== false} defaultValue={field.value} />}
      </div>)}
    </fieldset>
    {message.error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{message.error}</p>}
    {message.success && <p role="status" className="text-sm text-emerald-700">{message.success}</p>}
    {operation === "import" && <><Button type="button" variant="outline" disabled={pending} onClick={async () => { if (!formRef.current?.reportValidity()) return; const data = new FormData(formRef.current); const input = Object.fromEntries([...data].map(([key, value]) => [key, String(value)])); for (const field of fields.filter((field) => field.type === "multiSelect")) input[field.name] = data.getAll(field.name).map(String).join(","); setPending(true); try { const result = await previewPlanningImportAction(jurisdiction, { ...input, ...hidden }); setPreview(result.data); if (result.error) setMessage({ error: result.error }); } finally { setPending(false); } }}>Calcular prévia e conferir conflitos</Button>{preview && <div className="rounded border p-3 text-xs"><p>{preview.count} registros · Receita {preview.revenue} · Despesa {preview.expense} · {preview.problems} pendência(s)</p>{preview.rows.map((row) => <p key={row.code}>{row.code} · {row.sourceYear} → {row.targetYear} · {row.value ?? "Não apurado"} {row.problem ?? ""}</p>)}</div>}</>}
    <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
  </form>;
}

function PlanningMoneyField({ field, operation }: { field: PlanningField; operation: string }) {
  const [value, setValue] = useState(Number(field.value ?? "0"));
  return <><input type="hidden" name={field.name} value={value.toFixed(2)} /><MoneyInput id={`${operation}-${field.name}`} value={value} onChange={setValue} required={field.required !== false} /></>;
}

function PlanningItemsField({ field, jurisdiction, hidden, operation }: { field: PlanningField; jurisdiction: PlanningJurisdiction; hidden: Record<string, string>; operation: string }) {
  const [rows, setRows] = useState([{ id: 0, code: "", direction: "+", value: 0 }]);
  const [nextId, setNextId] = useState(1);
  const update = (index: number, patch: Partial<typeof rows[number]>) => setRows((values) => values.map((row, position) => position === index ? { ...row, ...patch } : row));
  return <div className="space-y-2">
    <input name={field.name} type="hidden" value={rows.map((row) => `${row.code};${row.direction};${row.value.toFixed(2)}`).join("\n")} />
    <datalist id={`planning-items-${field.name}`}>{field.options?.map((option) => <option key={option.id} value={option.id} label={option.name} />)}</datalist>
    {rows.map((row, index) => <div key={row.id} className="grid gap-2 rounded border p-2 md:grid-cols-4">
      <PlanningLookupField jurisdiction={jurisdiction} name="items" label={`Dotação do item ${index + 1}`} value={row.code} options={field.options} required hidden={hidden} operation={operation} submitName={false} onChange={(value) => update(index, { code: value })} />
      <select aria-label={`Tipo do item ${index + 1}`} value={row.direction} onChange={(event) => update(index, { direction: event.target.value })} className="rounded border bg-background p-2"><option value="+">Acréscimo</option><option value="-">Redução</option></select>
      <MoneyInput aria-label={`Valor do item ${index + 1}`} value={row.value} onChange={(value) => update(index, { value })} required />
      <Button type="button" variant="outline" disabled={rows.length === 1} onClick={() => setRows((values) => values.filter((_, position) => position !== index))}>Remover item</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={rows.length >= 200} onClick={() => { setRows((values) => [...values, { id: nextId, code: "", direction: "+", value: 0 }]); setNextId(nextId + 1); }}>Adicionar dotação</Button>
    <p className="text-xs text-muted-foreground">Pesquisa e paginação consultam todas as dotações autorizadas da peça; elegibilidade é novamente verificada ao salvar.</p>
  </div>;
}

function PlanningMappingField({ field }: { field: PlanningField }) {
  const definitions = field.mappingRows ?? [];
  const [selections, setSelections] = useState<Record<string, string>>(Object.fromEntries(definitions.map((row) => [row.sourceLineId, row.defaultTargetId ?? ""])));
  const [newCodes, setNewCodes] = useState<Record<string, string>>(Object.fromEntries(definitions.map((row) => [row.sourceLineId, row.newCode])));
  return <div className="space-y-2"><input type="hidden" name={field.name} value={JSON.stringify(definitions.map((row) => ({ sourceLineId: row.sourceLineId, targetLineId: selections[row.sourceLineId] || null, ...(!selections[row.sourceLineId] ? { newCode: newCodes[row.sourceLineId] } : {}) })))} />
    {definitions.map((row) => <div key={row.sourceLineId} className="grid gap-2 rounded border p-2 text-sm md:grid-cols-2"><label>{row.label}<select aria-label={`Destino de ${row.label}`} value={selections[row.sourceLineId]} onChange={(event) => setSelections((values) => ({ ...values, [row.sourceLineId]: event.target.value }))} className="mt-1 w-full rounded border bg-background p-2"><option value="">Criar classificação correspondente no destino</option>{row.targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>{!selections[row.sourceLineId] && <label>Código da nova dotação<Input value={newCodes[row.sourceLineId]} required onChange={(event) => setNewCodes((values) => ({ ...values, [row.sourceLineId]: event.target.value }))} /></label>}</div>)}
    <p className="text-xs text-muted-foreground">Dotações do destino sem origem mapeada serão compatibilizadas para valor previsto zero; realizado e histórico serão preservados.</p>
  </div>;
}

function PlanningCatalogMappingField({ field, jurisdiction }: { field: PlanningField; jurisdiction: PlanningJurisdiction }) {
  const [mappings, setMappings] = useState<Record<string, { canonicalId: string; predecessorEntryId?: string; redistributionDebitSource?: string }>>({});
  return <div className="space-y-3"><input type="hidden" name={field.name} value={JSON.stringify(Object.entries(mappings).filter(([, row]) => row.canonicalId).map(([sourceEntryId, row]) => ({ sourceEntryId, ...row })))} />
    {(field.catalogRows ?? []).map(row => <div key={row.sourceEntryId} className="space-y-2 rounded border p-3"><p className="text-sm font-medium">{row.kind} · {row.label}</p>
      <PlanningLookupField jurisdiction={jurisdiction} name="canonicalCatalogId" label={`Destino municipal de ${row.label}`} submitName={false} hidden={{ catalogKind: row.kind }} onChange={canonicalId => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { canonicalId } }))} />
      {mappings[row.sourceEntryId]?.canonicalId && <PlanningLookupField key={mappings[row.sourceEntryId].canonicalId} jurisdiction={jurisdiction} name="predecessorEntryId" label={`Edição predecessora de ${row.label} (se houver)`} submitName={false} hidden={{ catalogKind: row.kind, canonicalId: mappings[row.sourceEntryId].canonicalId }} onChange={predecessorEntryId => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { ...previous[row.sourceEntryId], ...(predecessorEntryId ? { predecessorEntryId } : { predecessorEntryId: undefined }) } }))} />}
      {row.kind === "ACCOUNT" && mappings[row.sourceEntryId]?.canonicalId && <label className="block text-sm">Fonte do débito em redistribuições<select aria-label={`Fonte do débito de ${row.label}`} value={mappings[row.sourceEntryId]?.redistributionDebitSource ?? ""} onChange={event => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { ...previous[row.sourceEntryId], redistributionDebitSource: event.target.value || undefined } }))} className="mt-1 w-full rounded border bg-background p-2"><option value="">Sem configuração de redistribuição</option><option value="ORIGIN">Fonte de origem (crédito no destino)</option><option value="DESTINATION">Fonte de destino (crédito na origem)</option></select></label>}
    </div>)}<p className="text-xs text-muted-foreground">Serão adotadas as entradas desta página com destino selecionado. Cada gravação preserva uma edição e sua decisão; vigência, conflitos e predecessoras são conferidos no servidor.</p>
  </div>;
}
