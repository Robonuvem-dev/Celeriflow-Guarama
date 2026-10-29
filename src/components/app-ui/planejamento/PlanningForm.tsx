"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { savePlanningRecord, previewPlanningImportAction } from "@/app/app-domain/planejamento/actions";
import type { PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningLookupField } from "./PlanningLookupField";
import { PlanningDraftTable } from "./PlanningDraftTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { serializePlanningItems, serializePlanningMappings, validatePlanningItems, validatePlanningMappings } from "./planning-drafts";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Trash2 } from "lucide-react";

const DraftValidation = createContext<{ validators: Map<string, () => string | undefined>; pending: boolean } | null>(null);
const editClass = "h-6 w-full min-w-0 rounded border bg-background px-1 text-[13px]";
const draftColumn = (key: string, label: string, minWidth: number, initialWidth: number, extra: Partial<OperationalColumn> = {}): OperationalColumn => ({ key, label, minWidth, initialWidth, type: "text", details: "overflow", resizable: true, sortable: false, ...extra });

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
  const [validators] = useState(() => new Map<string, () => string | undefined>());
  function validateForm() {
    for (const validate of validators.values()) {
      const error = validate();
      if (error) { setMessage({ error }); return false; }
    }
    return formRef.current?.reportValidity() ?? false;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!validateForm()) return;
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
  return <DraftValidation.Provider value={{ validators, pending }}><form ref={formRef} noValidate onSubmit={submit} className="space-y-3">
    <fieldset key={resetKey} disabled={pending} className="grid gap-3 md:grid-cols-2">
      {fields.map((field) => <div key={field.name} className={["textarea", "budgetItems", "mapping", "catalogMapping"].includes(field.type ?? "") ? "space-y-1 md:col-span-2" : "space-y-1"}>
        <Label htmlFor={`${operation}-${field.name}`}>{field.label}{field.required !== false && " *"}</Label>
        {(field.type === "select" || field.type === "multiSelect") && lookupFields.has(field.name) ? <PlanningLookupField disabled={pending} jurisdiction={jurisdiction} name={field.name} label={field.label} value={field.value} options={field.options} required={field.required !== false} multiple={field.type === "multiSelect"} hidden={{ ...hidden, ...(operation === "import" && field.name === "expenseNatureId" && lookupTarget ? { instrumentId: lookupTarget } : lookupInstrument ? { instrumentId: lookupInstrument } : {}) }} operation={operation} onChange={["instrumentId", "sourceInstrumentId"].includes(field.name) ? setLookupInstrument : field.name === "targetInstrumentId" ? setLookupTarget : undefined} /> : field.type === "select" || field.type === "multiSelect" ? <select id={`${operation}-${field.name}`} name={field.name} multiple={field.type === "multiSelect"} required={field.required !== false} defaultValue={field.type === "multiSelect" ? field.value?.split(",") ?? [] : field.value ?? ""} className={`${field.type === "multiSelect" ? "min-h-24" : "h-9"} w-full rounded-md border bg-background px-2 text-sm`}>{field.type !== "multiSelect" && <option value="">Selecione</option>}{field.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
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
    {operation === "import" && <><Button type="button" variant="outline" disabled={pending} onClick={async () => { if (!validateForm() || !formRef.current) return; const data = new FormData(formRef.current); const input = Object.fromEntries([...data].map(([key, value]) => [key, String(value)])); for (const field of fields.filter((field) => field.type === "multiSelect")) input[field.name] = data.getAll(field.name).map(String).join(","); setPending(true); try { const result = await previewPlanningImportAction(jurisdiction, { ...input, ...hidden }); setPreview(result.data); if (result.error) setMessage({ error: result.error }); } finally { setPending(false); } }}>Calcular prévia e conferir conflitos</Button>{preview && <PlanningImportPreview preview={preview} />}</>}
    <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
  </form></DraftValidation.Provider>;
}

function PlanningMoneyField({ field, operation }: { field: PlanningField; operation: string }) {
  const [value, setValue] = useState(Number(field.value ?? "0"));
  return <><input type="hidden" name={field.name} value={value.toFixed(2)} /><MoneyInput id={`${operation}-${field.name}`} value={value} onChange={setValue} required={field.required !== false} /></>;
}

function PlanningItemsField({ field, jurisdiction, hidden, operation }: { field: PlanningField; jurisdiction: PlanningJurisdiction; hidden: Record<string, string>; operation: string }) {
  const [rows, setRows] = useState([{ id: 0, code: "", direction: "+", value: 0 }]);
  const [nextId, setNextId] = useState(1);
  const update = (index: number, patch: Partial<typeof rows[number]>) => setRows((values) => values.map((row, position) => position === index ? { ...row, ...patch } : row));
  const context = useContext(DraftValidation);
  const gridId = useId();
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<{ id: string; message: string }>();
  useEffect(() => {
    const validators = context?.validators;
    validators?.set(field.name, () => {
      const invalid = validatePlanningItems(rows);
      if (!invalid) { setIssue(undefined); return; }
      setPage(Math.floor(invalid.index / OPERATIONAL_PAGE_SIZE) + 1);
      setIssue({ id: `${gridId}-${rows[invalid.index].id}-${invalid.field}`, message: invalid.message });
      return invalid.message;
    });
    return () => { validators?.delete(field.name); };
  }, [context?.validators, field.name, rows, gridId]);
  return <div className="space-y-2">
    <input name={field.name} type="hidden" value={serializePlanningItems(rows)} />
    <PlanningDraftTable title={field.label} id="planning:budget-items-edit" page={page} onPageChange={setPage} focusRequest={issue}
      actions={<button type="button" className={styles.newButton} disabled={context?.pending || rows.length >= 200} onClick={() => { setRows(values => [...values, { id: nextId, code: "", direction: "+", value: 0 }]); setNextId(nextId + 1); setPage(Math.floor(rows.length / OPERATIONAL_PAGE_SIZE) + 1); }}>Adicionar dotação</button>}
      columns={[draftColumn("code", "Dotação", 200, 500), draftColumn("direction", "Alteração", 120, 170), draftColumn("value", "Valor (R$)", 130, 200, { align: "right" }), draftColumn("actions", "Remover", 80, 90, { type: "actions", details: "none", resizable: false })]}
      rows={rows.map((row, index) => ({ id: String(row.id), label: `Item ${index + 1}`, values: { code: field.options?.find(option => option.id === row.code)?.name ?? row.code, direction: row.direction === "+" ? "Acréscimo" : "Redução", value: row.value.toFixed(2) }, cells: {
        code: <PlanningLookupField compact disabled={context?.pending} controlId={`${gridId}-${row.id}-code`} jurisdiction={jurisdiction} name="items" label={`Dotação do item ${index + 1}`} value={row.code} options={field.options} required hidden={hidden} operation={operation} submitName={false} onChange={value => update(index, { code: value })} />,
        direction: <select id={`${gridId}-${row.id}-direction`} disabled={context?.pending} aria-label={`Tipo do item ${index + 1}`} className={editClass} value={row.direction} onChange={event => update(index, { direction: event.target.value })}><option value="+">Acréscimo</option><option value="-">Redução</option></select>,
        value: <MoneyInput id={`${gridId}-${row.id}-value`} className={editClass} disabled={context?.pending} aria-label={`Valor do item ${index + 1}`} value={row.value} onChange={value => update(index, { value })} required />,
      }, actions: <button type="button" className={styles.iconButton} disabled={context?.pending || rows.length === 1} aria-label={`Remover item ${index + 1}`} onClick={() => setRows(values => values.filter(item => item.id !== row.id))}><Trash2 /></button> }))} />
    <p className="text-xs text-muted-foreground">Pesquisa e paginação consultam todas as dotações autorizadas da peça; elegibilidade é novamente verificada ao salvar.</p>
  </div>;
}

function PlanningMappingField({ field }: { field: PlanningField }) {
  const definitions = useMemo(() => field.mappingRows ?? [], [field.mappingRows]);
  const [selections, setSelections] = useState<Record<string, string>>(Object.fromEntries(definitions.map((row) => [row.sourceLineId, row.defaultTargetId ?? ""])));
  const [newCodes, setNewCodes] = useState<Record<string, string>>(Object.fromEntries(definitions.map((row) => [row.sourceLineId, row.newCode])));
  const context = useContext(DraftValidation);
  const gridId = useId();
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<{ id: string; message: string }>();
  useEffect(() => {
    const validators = context?.validators;
    validators?.set(field.name, () => {
      const invalid = validatePlanningMappings(definitions, selections, newCodes);
      if (!invalid) { setIssue(undefined); return; }
      setPage(Math.floor(invalid.index / OPERATIONAL_PAGE_SIZE) + 1);
      setIssue({ id: `${gridId}-${definitions[invalid.index].sourceLineId}-${invalid.field}`, message: invalid.message });
      return invalid.message;
    });
    return () => { validators?.delete(field.name); };
  }, [context?.validators, field.name, definitions, selections, newCodes, gridId]);
  return <div className="space-y-2"><input type="hidden" name={field.name} value={serializePlanningMappings(definitions, selections, newCodes)} />
    <PlanningDraftTable title={field.label} id="planning:compatibility-mapping-edit" page={page} onPageChange={setPage} focusRequest={issue}
      columns={[draftColumn("source", "Origem", 200, 420), draftColumn("target", "Destino municipal", 220, 420), draftColumn("newCode", "Código da nova dotação", 180, 220)]}
      rows={definitions.map(row => ({ id: row.sourceLineId, label: row.label, values: { source: row.label, target: row.targets.find(target => target.id === selections[row.sourceLineId])?.name ?? "Criar classificação correspondente no destino", newCode: !selections[row.sourceLineId] ? newCodes[row.sourceLineId] : "Não se aplica" }, cells: {
        target: <select id={`${gridId}-${row.sourceLineId}-target`} className={editClass} disabled={context?.pending} aria-label={`Destino de ${row.label}`} value={selections[row.sourceLineId]} onChange={event => setSelections(values => ({ ...values, [row.sourceLineId]: event.target.value }))}><option value="">Criar classificação correspondente no destino</option>{row.targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select>,
        newCode: !selections[row.sourceLineId] ? <Input id={`${gridId}-${row.sourceLineId}-newCode`} className={editClass} disabled={context?.pending} aria-label={`Código da nova dotação de ${row.label}`} value={newCodes[row.sourceLineId]} maxLength={60} required onChange={event => setNewCodes(values => ({ ...values, [row.sourceLineId]: event.target.value }))} /> : "Não se aplica",
      } }))} />
    <p className="text-xs text-muted-foreground">Dotações do destino sem origem mapeada serão compatibilizadas para valor previsto zero; realizado e histórico serão preservados.</p>
  </div>;
}

function PlanningCatalogMappingField({ field, jurisdiction }: { field: PlanningField; jurisdiction: PlanningJurisdiction }) {
  const [mappings, setMappings] = useState<Record<string, { canonicalId: string; predecessorEntryId?: string; redistributionDebitSource?: string }>>({});
  const [page, setPage] = useState(1);
  const context = useContext(DraftValidation);
  return <div className="space-y-3"><input type="hidden" name={field.name} value={JSON.stringify(Object.entries(mappings).filter(([, row]) => row.canonicalId).map(([sourceEntryId, row]) => ({ sourceEntryId, ...row })))} />
    <PlanningDraftTable title={field.label} id="planning:catalog-mapping-edit" page={page} onPageChange={setPage}
      columns={[draftColumn("kind", "Tipo", 80, 100), draftColumn("label", "Entrada de origem", 160, 320), draftColumn("canonical", "Destino municipal", 170, 260), draftColumn("predecessor", "Edição predecessora", 170, 240), draftColumn("debit", "Fonte do débito", 160, 220)]}
      rows={(field.catalogRows ?? []).map(row => ({ id: row.sourceEntryId, label: row.label, values: { kind: row.kind, label: row.label, canonical: mappings[row.sourceEntryId]?.canonicalId ?? "Não selecionado", predecessor: mappings[row.sourceEntryId]?.predecessorEntryId ?? "Sem predecessora", debit: mappings[row.sourceEntryId]?.redistributionDebitSource ?? "Sem configuração de redistribuição" }, cells: {
        canonical: <PlanningLookupField compact disabled={context?.pending} jurisdiction={jurisdiction} name="canonicalCatalogId" label={`Destino municipal de ${row.label}`} value={mappings[row.sourceEntryId]?.canonicalId} submitName={false} hidden={{ catalogKind: row.kind }} onChange={canonicalId => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { canonicalId } }))} />,
        predecessor: mappings[row.sourceEntryId]?.canonicalId ? <PlanningLookupField compact disabled={context?.pending} key={mappings[row.sourceEntryId].canonicalId} jurisdiction={jurisdiction} name="predecessorEntryId" label={`Edição predecessora de ${row.label} (se houver)`} value={mappings[row.sourceEntryId]?.predecessorEntryId} submitName={false} hidden={{ catalogKind: row.kind, canonicalId: mappings[row.sourceEntryId].canonicalId }} onChange={predecessorEntryId => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { ...previous[row.sourceEntryId], predecessorEntryId: predecessorEntryId || undefined } }))} /> : "Selecione o destino",
        debit: row.kind === "ACCOUNT" && mappings[row.sourceEntryId]?.canonicalId ? <select className={editClass} disabled={context?.pending} aria-label={`Fonte do débito de ${row.label}`} value={mappings[row.sourceEntryId]?.redistributionDebitSource ?? ""} onChange={event => setMappings(previous => ({ ...previous, [row.sourceEntryId]: { ...previous[row.sourceEntryId], redistributionDebitSource: event.target.value || undefined } }))}><option value="">Sem configuração de redistribuição</option><option value="ORIGIN">Fonte de origem (crédito no destino)</option><option value="DESTINATION">Fonte de destino (crédito na origem)</option></select> : "Não se aplica",
      } }))} />
    <p className="text-xs text-muted-foreground">Serão adotadas todas as entradas deste rascunho com destino selecionado, inclusive fora da página visível. Cada gravação preserva uma edição e sua decisão; vigência, conflitos e predecessoras são conferidos no servidor.</p>
  </div>;
}

function PlanningImportPreview({ preview }: { preview: NonNullable<Awaited<ReturnType<typeof previewPlanningImportAction>>["data"]> }) {
  const [page, setPage] = useState(1);
  return <div className="space-y-2"><p>{preview.count} registros · Receita {preview.revenue} · Despesa {preview.expense} · {preview.problems} pendência(s)</p>
    <PlanningDraftTable title="Prévia da importação" id="planning:import-preview" page={page} onPageChange={setPage}
      columns={[draftColumn("code", "Código", 100, 140), draftColumn("source", "Exercício de origem", 150, 170), draftColumn("target", "Exercício de destino", 150, 170), draftColumn("value", "Valor", 120, 180), draftColumn("problem", "Pendência", 180, 350)]}
      rows={preview.rows.map((row, index) => ({ id: `${row.code}:${index}`, label: row.code, values: { code: row.code, source: String(row.sourceYear), target: String(row.targetYear), value: String(row.value ?? "Não apurado"), problem: row.problem ?? "—" } }))} />
  </div>;
}
