"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { definitionKinds } from "@/lib/obras/construction-rules";
import { publishConstructionDefinition, publishConstructionDistribution, publishConstructionZone, linkConstructionPropertyZone } from "../rules-actions";

type Option = { id: string; name: string };
type Definition = { fields: { key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "CHOICE"; required: boolean; options: string[] }[]; checks: { key: string; label: string; required: boolean }[]; documents: { label: string; required: boolean }[] };
type Props = { tab: string; kind: keyof typeof definitionKinds; page: number; total: number; canManage: boolean; rows: { id: string; name: string; version: number; summary: string; date: string }[]; definition: Definition; purposes: Option[]; properties: Option[]; zoneOptions: Option[]; departments: Option[]; employees: (Option & { departmentId: string | null })[] };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";

export default function ConstructionRulesClient({ tab, kind, canManage, definition, purposes, properties, zoneOptions, departments, employees }: Props) {
  const router = useRouter();
  const [data, setData] = useState(definition);
  const [distribution, setDistribution] = useState({ departmentId: departments[0]?.id || "", strategy: "SECTOR", employeeId: "" });
  const [zone, setZone] = useState({ code: "", name: "", legalBasis: "", startsAt: "", endsAt: "", allowedPurposeIds: [] as string[], allowedCategories: ["BUILDING"] as string[], minimumLandArea: "0", maxFloorAreaRatio: "1", automatic: false });
  const [binding, setBinding] = useState({ realEstateId: "", zoneId: "" });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const nextId = useRef(definition.fields.length + definition.checks.length + definition.documents.length);
  const [fieldIds, setFieldIds] = useState(() => definition.fields.map((_, index) => `field-${index}`));
  const [checkIds, setCheckIds] = useState(() => definition.checks.map((_, index) => `check-${index}`));
  const [documentIds, setDocumentIds] = useState(() => definition.documents.map((_, index) => `document-${index}`));
  const [fieldPage, setFieldPage] = useState(1), [checkPage, setCheckPage] = useState(1), [documentPage, setDocumentPage] = useState(1);
  const [optionsId, setOptionsId] = useState<string | null>(null);
  const disabled = pending || !canManage;
  const activeFieldPage = Math.min(fieldPage, Math.max(1, Math.ceil(data.fields.length / OPERATIONAL_PAGE_SIZE)));
  const activeCheckPage = Math.min(checkPage, Math.max(1, Math.ceil(data.checks.length / OPERATIONAL_PAGE_SIZE)));
  const activeDocumentPage = Math.min(documentPage, Math.max(1, Math.ceil(data.documents.length / OPERATIONAL_PAGE_SIZE)));
  const optionIndex = fieldIds.findIndex(id => id === optionsId);
  const optionsField = data.fields[optionIndex];
  const definitionFeedback = message && <OperationalFilters label="Resultado da publicação"><p role="status">{message}</p></OperationalFilters>;
  const cellInput = "h-6 w-full min-w-0 rounded border bg-transparent px-1";
  function addField() {
    if (disabled || data.fields.length >= 50) return;
    const id = `field-${nextId.current++}`;
    setFieldIds(ids => [...ids, id]);
    setData(current => ({ ...current, fields: [...current.fields, { key: "", label: "", type: "TEXT", required: false, options: [] }] }));
    setFieldPage(Math.ceil((data.fields.length + 1) / OPERATIONAL_PAGE_SIZE));
  }
  function addCheck() {
    if (disabled || data.checks.length >= 100) return;
    const id = `check-${nextId.current++}`;
    setCheckIds(ids => [...ids, id]);
    setData(current => ({ ...current, checks: [...current.checks, { key: "", label: "", required: true }] }));
    setCheckPage(Math.ceil((data.checks.length + 1) / OPERATIONAL_PAGE_SIZE));
  }
  function addDocument() {
    if (disabled || data.documents.length >= 50) return;
    const id = `document-${nextId.current++}`;
    setDocumentIds(ids => [...ids, id]);
    setData(current => ({ ...current, documents: [...current.documents, { label: "", required: true }] }));
    setDocumentPage(Math.ceil((data.documents.length + 1) / OPERATIONAL_PAGE_SIZE));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>, operation: "definition" | "distribution" | "zone" | "binding") {
    event.preventDefault();
    if (disabled) return;
    setMessage("");
    if (operation === "definition") {
      const fieldIndex = data.fields.findIndex(entry => !entry.key.trim() || !entry.label.trim());
      const checkIndex = data.checks.findIndex(entry => !entry.key.trim() || !entry.label.trim());
      const documentIndex = data.documents.findIndex(entry => !entry.label.trim());
      if (fieldIndex >= 0) { setFieldPage(Math.floor(fieldIndex / OPERATIONAL_PAGE_SIZE) + 1); setMessage(`Preencha chave e rótulo do campo ${fieldIndex + 1}, inclusive nas outras páginas.`); return; }
      if (checkIndex >= 0) { setCheckPage(Math.floor(checkIndex / OPERATIONAL_PAGE_SIZE) + 1); setMessage(`Preencha chave e descrição do critério ${checkIndex + 1}, inclusive nas outras páginas.`); return; }
      if (documentIndex >= 0) { setDocumentPage(Math.floor(documentIndex / OPERATIONAL_PAGE_SIZE) + 1); setMessage(`Preencha o nome do documento ${documentIndex + 1}, inclusive nas outras páginas.`); return; }
    }
    setPending(true);
    try {
      const result = operation === "definition" ? await publishConstructionDefinition({ kind, definition: data }) : operation === "distribution" ? await publishConstructionDistribution(distribution) : operation === "zone" ? await publishConstructionZone(zone) : await linkConstructionPropertyZone(binding);
      if (result.error) { setMessage(result.error); return; }
      setMessage(operation === "binding" ? "Zoneamento vinculado ao imóvel." : "Nova versão publicada, preservando as anteriores."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <div className="space-y-3 p-3"><div className="flex flex-wrap gap-3 text-xs"><Link href={`?tab=${tab}&kind=${kind}`} className="text-blue-700 underline">Voltar ao histórico publicado</Link><Link href="?tab=definitions&view=editar" className="text-blue-700 underline">Formulários e checklists</Link><Link href="?tab=zones&view=editar" className="text-blue-700 underline">Zoneamento</Link><Link href="?tab=distribution&view=editar" className="text-blue-700 underline">Distribuição</Link></div>
    {message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    {tab === "definitions" && <>
      <form method="GET" className="flex gap-2"><input type="hidden" name="view" value="editar" /><input type="hidden" name="tab" value={tab} /><select name="kind" defaultValue={kind} aria-label="Etapa" className={field}>{Object.entries(definitionKinds).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button className="rounded bg-blue-600 px-3 text-xs text-white">Selecionar</button></form>
      <form id="construction-definition" onSubmit={(event) => submit(event, "definition")} className="space-y-3 rounded-lg border p-3"><fieldset className="space-y-3">
        <h2 className="text-sm font-semibold">Campos adicionais — {definitionKinds[kind]}</h2>
        <OperationalTablePanel title="Campos adicionais" description="Rascunho integral no formulário; fechar ou paginar não descarta alterações.">
          <OperationalListFrame label="Campos adicionais" actions={<><button type="button" disabled={disabled || data.fields.length >= 50} className={styles.newButton} onClick={addField}>Adicionar campo</button>{canManage && <button type="submit" form="construction-definition" disabled={pending} className={styles.dialogButton}>Publicar nova versão</button>}{definitionFeedback}</>}
            pagination={<OperationalPagination page={activeFieldPage} total={data.fields.length} onPageChange={setFieldPage} />}>
            <OperationalTable preferenceId="obras-regras-campos-edicao" caption="Campos adicionais" columns={operationalColumns([["key", "Chave", 160, 90, "identifier"], ["label", "Rótulo", 300, 120], ["type", "Tipo", 140, 100], ["options", "Opções", 250, 130], ["required", "Obrigatório", 110, 80], ["actions", "Remover", 60, 50, "actions"]])}
              rows={data.fields.slice((activeFieldPage - 1) * OPERATIONAL_PAGE_SIZE, activeFieldPage * OPERATIONAL_PAGE_SIZE).map((entry, offset) => {
                const index = (activeFieldPage - 1) * OPERATIONAL_PAGE_SIZE + offset;
                return { id: fieldIds[index], label: entry.label || `Campo ${index + 1}`, values: { key: entry.key, label: entry.label, type: entry.type, options: entry.options.join("\n") || "Sem opções", required: entry.required ? "Sim" : "Não" }, cells: {
                  key: <input form="construction-definition" required disabled={disabled} aria-label={`Chave do campo ${index + 1}`} className={cellInput} value={entry.key} onChange={event => setData(current => ({ ...current, fields: current.fields.map((row, i) => i === index ? { ...row, key: event.target.value } : row) }))} />,
                  label: <input form="construction-definition" required disabled={disabled} aria-label={`Rótulo do campo ${index + 1}`} className={cellInput} value={entry.label} onChange={event => setData(current => ({ ...current, fields: current.fields.map((row, i) => i === index ? { ...row, label: event.target.value } : row) }))} />,
                  type: <select form="construction-definition" disabled={disabled} aria-label={`Tipo do campo ${index + 1}`} className={cellInput} value={entry.type} onChange={event => setData(current => ({ ...current, fields: current.fields.map((row, i) => i === index ? { ...row, type: event.target.value as typeof entry.type } : row) }))}><option value="TEXT">Texto</option><option value="NUMBER">Número</option><option value="DATE">Data</option><option value="CHOICE">Seleção</option></select>,
                  options: entry.type === "CHOICE" ? <button type="button" className="inline-flex h-6 max-w-full items-center gap-1" aria-label={`Editar opções do campo ${index + 1}`} onClick={() => setOptionsId(fieldIds[index])}><List className="size-4 shrink-0" /><span className="truncate">{entry.options.length} opções</span></button> : "Não se aplica",
                  required: <input form="construction-definition" type="checkbox" disabled={disabled} aria-label={`Campo ${index + 1} obrigatório`} checked={entry.required} onChange={event => setData(current => ({ ...current, fields: current.fields.map((row, i) => i === index ? { ...row, required: event.target.checked } : row) }))} />,
                }, actions: <button type="button" disabled={disabled} className={styles.iconButton} aria-label={`Remover campo ${index + 1}`} onClick={() => { setFieldIds(ids => ids.filter((_, i) => i !== index)); setData(current => ({ ...current, fields: current.fields.filter((_, i) => i !== index) })); }}><Trash2 /></button> };
              })} />
          </OperationalListFrame>
          <Dialog open={Boolean(optionsField)} onOpenChange={open => { if (!open) setOptionsId(null); }}><DialogContent><DialogHeader><DialogTitle>Opções do campo</DialogTitle><DialogDescription>{optionsField?.label || "Uma opção por linha. O rascunho é mantido no formulário."}</DialogDescription></DialogHeader>{optionsField && <label>Opções (uma por linha)<textarea form="construction-definition" disabled={disabled} aria-label="Opções do campo" rows={6} className="w-full rounded border p-2" value={optionsField.options.join("\n")} onChange={event => setData(current => ({ ...current, fields: current.fields.map((row, i) => i === optionIndex ? { ...row, options: event.target.value.split("\n") } : row) }))} /></label>}</DialogContent></Dialog>
        </OperationalTablePanel>
        <OperationalTablePanel title="Critérios para deferimento">
          <OperationalListFrame label="Critérios para deferimento" actions={<><button type="button" disabled={disabled || data.checks.length >= 100} className={styles.newButton} onClick={addCheck}>Adicionar critério</button>{canManage && <button type="submit" form="construction-definition" disabled={pending} className={styles.dialogButton}>Publicar nova versão</button>}{definitionFeedback}</>}
            pagination={<OperationalPagination page={activeCheckPage} total={data.checks.length} onPageChange={setCheckPage} />}>
            <OperationalTable preferenceId="obras-regras-criterios-edicao" caption="Critérios para deferimento" columns={operationalColumns([["key", "Chave", 200, 90, "identifier"], ["label", "Descrição", 500, 150], ["required", "Obrigatório", 110, 80], ["actions", "Remover", 60, 50, "actions"]])}
              rows={data.checks.slice((activeCheckPage - 1) * OPERATIONAL_PAGE_SIZE, activeCheckPage * OPERATIONAL_PAGE_SIZE).map((entry, offset) => {
                const index = (activeCheckPage - 1) * OPERATIONAL_PAGE_SIZE + offset;
                return { id: checkIds[index], label: entry.label || `Critério ${index + 1}`, values: { key: entry.key, label: entry.label, required: entry.required ? "Sim" : "Não" }, cells: {
                  key: <input form="construction-definition" required disabled={disabled} aria-label={`Chave do critério ${index + 1}`} className={cellInput} value={entry.key} onChange={event => setData(current => ({ ...current, checks: current.checks.map((row, i) => i === index ? { ...row, key: event.target.value } : row) }))} />,
                  label: <input form="construction-definition" required disabled={disabled} aria-label={`Descrição do critério ${index + 1}`} className={cellInput} value={entry.label} onChange={event => setData(current => ({ ...current, checks: current.checks.map((row, i) => i === index ? { ...row, label: event.target.value } : row) }))} />,
                  required: <input form="construction-definition" type="checkbox" disabled={disabled} aria-label={`Critério ${index + 1} obrigatório`} checked={entry.required} onChange={event => setData(current => ({ ...current, checks: current.checks.map((row, i) => i === index ? { ...row, required: event.target.checked } : row) }))} />,
                }, actions: <button type="button" disabled={disabled} className={styles.iconButton} aria-label={`Remover critério ${index + 1}`} onClick={() => { setCheckIds(ids => ids.filter((_, i) => i !== index)); setData(current => ({ ...current, checks: current.checks.filter((_, i) => i !== index) })); }}><Trash2 /></button> };
              })} />
          </OperationalListFrame>
        </OperationalTablePanel>
        <OperationalTablePanel title="Documentos da etapa">
          <OperationalListFrame label="Documentos da etapa" actions={<><button type="button" disabled={disabled || data.documents.length >= 50} className={styles.newButton} onClick={addDocument}>Adicionar documento</button>{canManage && <button type="submit" form="construction-definition" disabled={pending} className={styles.dialogButton}>Publicar nova versão</button>}{definitionFeedback}</>}
            pagination={<OperationalPagination page={activeDocumentPage} total={data.documents.length} onPageChange={setDocumentPage} />}>
            <OperationalTable preferenceId="obras-regras-documentos-edicao" caption="Documentos da etapa" columns={operationalColumns([["label", "Documento", 600, 180, "identifier"], ["required", "Obrigatório", 110, 80], ["actions", "Remover", 60, 50, "actions"]])}
              rows={data.documents.slice((activeDocumentPage - 1) * OPERATIONAL_PAGE_SIZE, activeDocumentPage * OPERATIONAL_PAGE_SIZE).map((entry, offset) => {
                const index = (activeDocumentPage - 1) * OPERATIONAL_PAGE_SIZE + offset;
                return { id: documentIds[index], label: entry.label || `Documento ${index + 1}`, values: { label: entry.label, required: entry.required ? "Sim" : "Não" }, cells: {
                  label: <input form="construction-definition" required disabled={disabled} aria-label={`Nome do documento ${index + 1}`} className={cellInput} value={entry.label} onChange={event => setData(current => ({ ...current, documents: current.documents.map((row, i) => i === index ? { ...row, label: event.target.value } : row) }))} />,
                  required: <input form="construction-definition" type="checkbox" disabled={disabled} aria-label={`Documento ${index + 1} obrigatório`} checked={entry.required} onChange={event => setData(current => ({ ...current, documents: current.documents.map((row, i) => i === index ? { ...row, required: event.target.checked } : row) }))} />,
                }, actions: <button type="button" disabled={disabled} className={styles.iconButton} aria-label={`Remover documento ${index + 1}`} onClick={() => { setDocumentIds(ids => ids.filter((_, i) => i !== index)); setData(current => ({ ...current, documents: current.documents.filter((_, i) => i !== index) })); }}><Trash2 /></button> };
              })} />
          </OperationalListFrame>
        </OperationalTablePanel>
        {canManage && <div className="text-right"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Publicar nova versão</button></div>}
      </fieldset></form>
    </>}
    {tab === "distribution" && <form onSubmit={(event) => submit(event, "distribution")} className="rounded-lg border p-3"><fieldset disabled={pending || !canManage} className="grid gap-3 sm:grid-cols-3"><label className="text-xs">Setor<select required className={field} value={distribution.departmentId} onChange={(event) => setDistribution({ ...distribution, departmentId: event.target.value, employeeId: "" })}><option value="">Selecione</option>{departments.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="text-xs">Distribuição<select className={field} value={distribution.strategy} onChange={(event) => setDistribution({ ...distribution, strategy: event.target.value })}><option value="SECTOR">Ao setor</option><option value="USER">Usuário específico</option><option value="MANAGER">Gestor vigente</option><option value="LOWEST_LOAD">Analista com menor demanda</option></select></label>{distribution.strategy === "USER" && <label className="text-xs">Analista<select required className={field} value={distribution.employeeId} onChange={(event) => setDistribution({ ...distribution, employeeId: event.target.value })}><option value="">Selecione</option>{employees.filter((option) => option.departmentId === distribution.departmentId).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}{canManage && <div className="text-right sm:col-span-3"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Publicar estratégia</button></div>}</fieldset></form>}
    {tab === "zones" && <>
      <form onSubmit={(event) => submit(event, "zone")} className="rounded-lg border p-3"><fieldset disabled={pending || !canManage} className="grid gap-3 sm:grid-cols-2"><h2 className="text-sm font-semibold sm:col-span-2">Publicar regra de zoneamento</h2>{([['code','Código'],['name','Nome'],['legalBasis','Base legal / referência do plano diretor'],['minimumLandArea','Área mínima do terreno (m²)'],['maxFloorAreaRatio','Coeficiente máximo de aproveitamento']] as const).map(([key,label]) => <label key={key} className="text-xs">{label}<input required className={field} value={zone[key]} onChange={(event) => setZone({ ...zone, [key]: event.target.value })} /></label>)}<label className="text-xs">Início<input required type="date" className={field} value={zone.startsAt} onChange={(event) => setZone({ ...zone, startsAt: event.target.value })} /></label><label className="text-xs">Fim<input type="date" className={field} value={zone.endsAt} onChange={(event) => setZone({ ...zone, endsAt: event.target.value })} /></label><fieldset className="space-y-1 rounded border p-2"><legend className="text-xs">Finalidades permitidas</legend>{purposes.map((purpose) => <label key={purpose.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={zone.allowedPurposeIds.includes(purpose.id)} onChange={(event) => setZone({ ...zone, allowedPurposeIds: event.target.checked ? [...zone.allowedPurposeIds, purpose.id] : zone.allowedPurposeIds.filter((id) => id !== purpose.id) })} />{purpose.name}</label>)}</fieldset><fieldset className="space-y-1 rounded border p-2"><legend className="text-xs">Categorias permitidas</legend>{[['BUILDING','Obra'],['SUBDIVISION','Parcelamento']] .map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={zone.allowedCategories.includes(key)} onChange={(event) => setZone({ ...zone, allowedCategories: event.target.checked ? [...zone.allowedCategories, key] : zone.allowedCategories.filter((id) => id !== key) })} />{label}</label>)}</fieldset><label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={zone.automatic} onChange={(event) => setZone({ ...zone, automatic: event.target.checked })} />Permitir avaliação automática dos parâmetros cadastrados</label>{canManage && <div className="text-right sm:col-span-2"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Publicar zoneamento</button></div>}</fieldset></form>
      <form onSubmit={(event) => submit(event, "binding")} className="rounded-lg border p-3"><fieldset disabled={pending || !canManage} className="grid gap-3 sm:grid-cols-2"><h2 className="text-sm font-semibold sm:col-span-2">Vincular imóvel à versão urbanística</h2><label className="text-xs">Imóvel<select required className={field} value={binding.realEstateId} onChange={(event) => setBinding({ ...binding, realEstateId: event.target.value })}><option value="">Selecione</option>{properties.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label className="text-xs">Zoneamento<select required className={field} value={binding.zoneId} onChange={(event) => setBinding({ ...binding, zoneId: event.target.value })}><option value="">Selecione</option>{zoneOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>{canManage && <div className="text-right sm:col-span-2"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Vincular versão</button></div>}</fieldset></form>
    </>}
  </div>;
}
