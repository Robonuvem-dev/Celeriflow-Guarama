"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GedBootstrap } from "@/lib/contracts/ged";
import { GedIndexFields } from "./GedIndexFields";
import { GedFolderPicker } from "./GedFolderPicker";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "title", label: "Documento de origem", type: "text", initialWidth: 360, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "version", label: "Versão de origem", type: "identifier", initialWidth: 280, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ação", type: "actions", initialWidth: 100, minWidth: 90, resizable: false, sortable: false, details: "none" },
];

export function GedSourceWorkspace({ bootstrap, initialModule }: { bootstrap: GedBootstrap; initialModule: string }) {
  const [module, setModule] = useState(initialModule), [jurisdiction, setJurisdiction] = useState("EXECUTIVE"), [text, setText] = useState(""), [result, setResult] = useState<{ rows: { id: string; title: string; versionId: string }[]; total: number; page: number }>({ rows: [], total: 0, page: 1 });
  const [classCode, setClassCode] = useState(bootstrap.classes[0]?.code ?? ""), [indexValues, setIndexValues] = useState<Record<string, string | number | boolean>>({}), [folderId, setFolderId] = useState<string | null>(null), [selected, setSelected] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [links, setLinks] = useState<{ id: string; title: string }[]>([]);
  const appliedText = useRef("");
  const [open, setOpen] = useState(false);
  const read = useCallback(async (page: number, searchText: string) => { const response = await fetch(`/api/assinatura-digital/ged/sources?${new URLSearchParams({ module, jurisdiction, text: searchText, page: String(page) })}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as typeof result; }, [module, jurisdiction]);
  async function load(page = 1) {
    appliedText.current = text;
    setBusy(true); setMessage("");
    try { setResult(await read(page, text)); }
    catch (error) { setResult({ rows: [], total: 0, page: 1 }); setMessage(error instanceof Error ? error.message : "Falha ao consultar origem."); } finally { setBusy(false); }
  }
  useEffect(() => { let active = true; void read(1, appliedText.current).then(data => { if (active) { setResult(data); setSelected(""); setLinks([]); setMessage(""); } }).catch(error => { if (active) { setResult({ rows: [], total: 0, page: 1 }); setMessage(error instanceof Error ? error.message : "Falha ao consultar origem."); } }); return () => { active = false; }; }, [read]);
  async function choose(id: string) { setSelected(id); setOpen(true); setLinks([]); try { const response = await fetch(`/api/assinatura-digital/ged/sources?${new URLSearchParams({ module, jurisdiction, id })}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setLinks(data); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na consulta."); } }
  return <><OperationalListFrame label="Origens internas do GED" actions={selected && <button type="button" className={styles.dialogButton} onClick={() => setOpen(true)}>Retomar ingresso</button>}
    toolbar={<><form className={styles.searchForm} onSubmit={e => { e.preventDefault(); void load(); }}><select aria-label="Origem" value={module} onChange={e => setModule(e.target.value)}>{["PROCESSOS", "PLANEJAMENTO", "FINANCEIRO", "OBRAS", "RH"].map(m => <option key={m}>{m}</option>)}</select><input aria-label="Título" className={styles.searchInput} value={text} onChange={e => setText(e.target.value)} /><button disabled={busy} className={styles.filterButton}>Consultar</button></form>{module === "PLANEJAMENTO" && <OperationalFilters label="Jurisdição"><label>Jurisdição<select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)}><option value="EXECUTIVE">Executivo</option><option value="LEGISLATIVE">Legislativo</option></select></label></OperationalFilters>}{message && <span role="status">{message}</span>}</>}
    pagination={<OperationalPagination page={result.page} total={result.total} onPageChange={page => { if (!busy) void load(page); }} />}>
    <OperationalTable columns={columns} preferenceId="ged.internal.sources.v1" state={busy ? "loading" : "ready"} rows={result.rows.map(row => ({ id: row.id, label: row.title, values: { title: row.title, version: row.versionId }, actions: <button type="button" disabled={busy} className={styles.dialogButton} onClick={() => void choose(row.id)}>Selecionar</button> }))} />
  </OperationalListFrame><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Ingresso de origem interna</DialogTitle><DialogDescription>A permissão da origem será conferida novamente. Origem e hash são preservados.</DialogDescription></DialogHeader>{message && <p role="status">{message}</p>}
    {selected && <form className="space-y-3 rounded border bg-white p-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const response = await fetch("/api/assinatura-digital/ged/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, jurisdiction, sourceId: selected, classCode, folderId, indexValues }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setLinks(current => [...current, { id: data.documentId, title: "Abrir documento gerenciado" }]); setMessage("Ingresso concluído e enfileirado para processamento."); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no ingresso."); } finally { setBusy(false); } }}><h2 className="font-semibold">Versão selecionada</h2>{links.map(link => <p key={link.id}><Link className="underline" href={`/assinatura-digital/acervo/${link.id}`}>{link.title}</Link></p>)}<label>Tipo documental<select required className="block w-full rounded border p-2" value={classCode} onChange={e => { setClassCode(e.target.value); setIndexValues({}); }}>{bootstrap.classes.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label><GedIndexFields fields={bootstrap.classes.find(c => c.code === classCode)?.fields ?? []} values={indexValues} onChange={setIndexValues} /><GedFolderPicker onSelect={value => setFolderId(value || null)} disabled={busy} /><button disabled={busy || !bootstrap.capabilities.import} className="rounded border p-2">Registrar cópia no GED</button></form>}
  </DialogContent></Dialog></>;
}
