"use client";

import { useState } from "react";
export function GedFolderPicker({ onSelect, disabled }: { onSelect: (id: string | null) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([]), [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  async function browse(nextPath: typeof path) {
    setBusy(true); setMessage("");
    try {
      const parent = nextPath.at(-1)?.id;
      const response = await fetch(`/api/assinatura-digital/ged?folders=1${parent ? `&parentId=${encodeURIComponent(parent)}` : ""}`);
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setFolders(result); setPath(nextPath); setOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível abrir as pastas."); }
    finally { setBusy(false); }
  }
  return <div className="grid max-w-xl gap-2 text-sm"><button type="button" className="w-fit rounded border px-3 py-2" disabled={disabled || busy} onClick={() => { if (open) setOpen(false); else void browse([]); }}>Mover documento para outra pasta</button>
    {open && <div className="grid gap-2 rounded border p-3"><nav aria-label="Pasta de destino" className="flex flex-wrap gap-1"><button type="button" onClick={() => void browse([])}>Raiz</button>{path.map((folder, index) => <button type="button" key={folder.id} onClick={() => void browse(path.slice(0, index + 1))}> / {folder.name}</button>)}</nav>
      <select size={Math.min(6, Math.max(2, folders.length))} className="w-full rounded border p-2" value="" aria-label="Expandir subpasta de destino" disabled={busy} onChange={event => { const folder = folders.find(item => item.id === event.target.value); if (folder) void browse([...path, folder]); }}><option value="" disabled>Expanda uma subpasta</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
      <button type="button" className="w-fit rounded bg-slate-900 px-3 py-2 text-white" disabled={disabled || busy} onClick={() => { onSelect(path.at(-1)?.id || null); setOpen(false); }}>Mover para {path.at(-1)?.name || "Raiz"}</button>
    </div>}{message && <p role="alert">{message}</p>}
  </div>;
}
