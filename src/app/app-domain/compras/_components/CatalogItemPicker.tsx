"use client";

import { useState } from "react";
import Link from "next/link";

type Option = { id: string; code?: string | null; name: string; unit?: string; productKind?: string };
export function CatalogItemPicker({ items, value, onChange, disabled = false }: { items: Option[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(!value);
  const selected = items.find(item => item.id === value);
  const filtered = items.filter(item => (!kind || item.productKind === kind) && `${item.code || ""} ${item.name} ${item.unit || ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const label = (item: Option) => `${item.code || "Sem código"} · ${item.name}${item.unit ? ` · ${item.unit}` : ""}`;
  return <div className="space-y-2">
    {selected || value === "custom" ? <div className="flex items-center justify-between gap-2 rounded border bg-emerald-50 p-2 text-xs"><span>{selected ? label(selected) : "Item livre do registro anterior"}</span>{!disabled && <button type="button" onClick={() => setOpen(!open)} className="underline">Alterar</button>}</div> : null}
    {!disabled && open && <>
      <input aria-label="Buscar material, equipamento ou serviço" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar por código ou descrição" className="h-8 w-full rounded border bg-white px-2 text-sm" />
      <select aria-label="Tipo do item de compras" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }} className="h-8 w-full rounded border bg-white px-2 text-xs"><option value="">Materiais, equipamentos e serviços</option><option value="MATERIAL">Materiais</option><option value="PATRIMONIO">Equipamentos</option><option value="SERVICO">Serviços</option></select>
      <div className="max-h-48 overflow-y-auto rounded border bg-white">{filtered.slice((currentPage - 1) * 20, currentPage * 20).map(item => <button key={item.id} type="button" onClick={() => { onChange(item.id); setOpen(false); }} className="block w-full border-b p-2 text-left text-xs hover:bg-emerald-50">{label(item)} · {item.productKind === "SERVICO" ? "Serviço" : item.productKind === "PATRIMONIO" ? "Equipamento" : "Material"}</button>)}{!filtered.length && <p className="p-2 text-xs text-slate-500">Nenhum item encontrado. Cadastre-o no catálogo compartilhado.</p>}</div>
      <div className="flex items-center justify-between text-xs"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>{currentPage} de {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</button></div>
      <Link href="/compras/catalogo?kind=SERVICO&new=1" target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-800 underline">Cadastrar serviço a contratar</Link>
    </>}
  </div>;
}
