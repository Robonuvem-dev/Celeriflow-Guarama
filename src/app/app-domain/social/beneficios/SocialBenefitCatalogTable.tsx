"use client";
import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { SocialOperationalList } from "../OperationalList";
export function SocialBenefitCatalogTable({ title, items }: { title: string; items: { id: string; name: string; description: string; tag: string }[] }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState("");
  const rows = items.filter(item => `${item.name} ${item.description} ${item.tag}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <OperationalTablePanel title={title} triggerLabel={`Consultar ${items.length} registros`}><SocialOperationalList id={`catalogo-${title}`} page={page} total={rows.length} onPageChange={setPage} toolbar={<input aria-label={`Buscar ${title}`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-7 w-full rounded border px-2 text-sm" />} columns={[["name", "Nome", 240, 100, "identifier"], ["description", "Descrição", 400, 140], ["tag", "Classificação", 160, 90]]} rows={rows.slice((page - 1) * 20, page * 20).map(item => ({ id: item.id, label: item.name, values: { name: item.name, description: item.description, tag: item.tag } }))} /></OperationalTablePanel>;
}
