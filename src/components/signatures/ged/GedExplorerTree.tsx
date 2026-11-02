"use client";
import { useEffect, useState } from "react";

type Folder = { id: string; name: string; children: number; files: number; totalFiles: number };
export function GedExplorerTree({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return <aside className="min-w-48 rounded border bg-white p-3" aria-label="Árvore do acervo"><button className="mb-2 font-semibold" onClick={() => onSelect("")}>Acervo / raiz</button><Branch parentId={null} selected={selected} onSelect={onSelect} /></aside>;
}
function Branch({ parentId, selected, onSelect }: { parentId: string | null; selected: string; onSelect: (id: string) => void }) {
  const [folders, setFolders] = useState<Folder[]>([]), [expanded, setExpanded] = useState<string[]>([]), [error, setError] = useState("");
  useEffect(() => { let cancelled = false; fetch(`/api/assinatura-digital/ged?folders=1${parentId ? `&parentId=${encodeURIComponent(parentId)}` : ""}`).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!cancelled) setFolders(data); }).catch(error => { if (!cancelled) setError(error.message); }); return () => { cancelled = true; }; }, [parentId]);
  return <ul className="space-y-1 pl-2">{error && <li role="alert">{error}</li>}{folders.map(folder => <li key={folder.id}><div className="flex items-start gap-1"><button aria-label={`Expandir ${folder.name}`} aria-expanded={expanded.includes(folder.id)} disabled={!folder.children} onClick={() => setExpanded(current => current.includes(folder.id) ? current.filter(id => id !== folder.id) : [...current, folder.id])}>{folder.children ? expanded.includes(folder.id) ? "▾" : "▸" : "·"}</button><button className={`text-left text-sm ${selected === folder.id ? "font-bold text-indigo-700" : ""}`} title={`${folder.children} subpastas; ${folder.files} arquivos; ${folder.totalFiles} documentos no ramo`} onClick={() => onSelect(folder.id)}>{folder.name} <small>({folder.totalFiles})</small></button></div>{expanded.includes(folder.id) && <Branch parentId={folder.id} selected={selected} onSelect={onSelect} />}</li>)}</ul>;
}
