"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { socialCatalogKinds } from "@/lib/social/catalog-policy";
import { saveSocialCatalogEntry, saveSocialMinimumWage } from "./actions";

type Entry = { id: string; kind: string; name: string; description: string | null; isActive: boolean; allowedUnitTypes: string[] };
type Wage = { id: string; validFrom: string; value: string };
type Kind = keyof typeof socialCatalogKinds;
const field = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const PAGE_SIZE = 20;

export default function SocialCatalogsClient({ entries, wages }: { entries: Entry[]; wages: Wage[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("INCOME");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [wagePage, setWagePage] = useState(1);
  const [status, setStatus] = useState("Todos");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [allowedUnitTypes, setAllowedUnitTypes] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const rows = entries.filter((entry) => entry.kind === kind && entry.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) && (status === "Todos" || entry.isActive === (status === "Ativos")));
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const visibleRows = rows.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const activeWagePage = Math.min(wagePage, Math.max(1, Math.ceil(wages.length / PAGE_SIZE)));
  const visibleWages = wages.slice((activeWagePage - 1) * PAGE_SIZE, activeWagePage * PAGE_SIZE);
  function reset() { setEditing(null); setName(""); setDescription(""); setActive(true); setAllowedUnitTypes([]); }
  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveSocialCatalogEntry({ id: editing?.id, kind, name, description, isActive: active, allowedUnitTypes });
      if (result.error) { setMessage(result.error); return; }
      reset(); setMessage("Cadastro salvo."); router.refresh();
    } finally { setPending(false); }
  }
  async function submitWage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveSocialMinimumWage({ validFrom, value });
      if (result.error) { setMessage(result.error); return; }
      setValidFrom(""); setValue(""); setMessage("Vigência registrada."); router.refresh();
    } finally { setPending(false); }
  }
  return <PageFrame className="space-y-4 p-3">
    <PageHeader title="Configurações SUAS" icon={<Settings className="size-4" />} />
    {message && <p role="status" className="rounded-md border bg-slate-50 p-3 text-sm">{message}</p>}
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Catálogos socioassistenciais</h2>
      <label className="flex flex-col gap-1 text-sm">Catálogo<select className={field} value={kind} disabled={pending} onChange={(event) => { setKind(event.target.value as Kind); setSearch(""); setPage(1); reset(); }}>
        {Object.entries(socialCatalogKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <form onSubmit={submitEntry} className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">Nome<input required minLength={2} maxLength={160} className={field} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">Descrição<input maxLength={2000} className={field} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Ativo</label>
        <div className="flex gap-2"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{editing ? "Salvar alterações" : "Cadastrar"}</button>{editing && <button type="button" disabled={pending} onClick={reset} className={field}>Cancelar edição</button>}</div>
      </form>
      {kind === "VULNERABILITY" && <fieldset className="rounded border p-2"><legend className="text-xs">Tipos de equipamento autorizados a identificar (sem seleção: todos)</legend><div className="flex flex-wrap gap-3">{["CRAS", "CREAS", "Secretaria", "Centro POP", "Centro DIA", "Acolhimento", "Saúde", "Judiciário", "Outros"].map((type) => <label key={type} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={pending} checked={allowedUnitTypes.includes(type)} onChange={(event) => setAllowedUnitTypes(event.target.checked ? [...allowedUnitTypes, type] : allowedUnitTypes.filter((item) => item !== type))} />{type}</label>)}</div></fieldset>}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <label className="flex flex-col gap-1 text-sm">Buscar<input type="search" className={field} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <label className="flex flex-col gap-1 text-sm">Situação<select className={field} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>Todos</option><option>Ativos</option><option>Inativos</option></select></label>
      </div>
      <div className="min-w-0 rounded-lg border border-slate-200">
        <p className="border-b bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">{rows.length} registros encontrados</p>
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-slate-100 text-[10px] uppercase text-slate-500"><tr><th className="w-[35%] p-2">Nome</th><th className="hidden p-2 sm:table-cell">Descrição</th><th className="w-20 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead>
          <tbody>{visibleRows.map((entry) => <tr key={entry.id} className="h-9 border-t hover:bg-slate-50">
            <td className="truncate p-2 font-medium" title={entry.name}>{entry.name}</td>
            <td className="hidden truncate p-2 sm:table-cell" title={entry.description || undefined}>{entry.description || "—"}</td>
            <td className="p-2"><span className={entry.isActive ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700" : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-600"}>{entry.isActive ? "Ativo" : "Inativo"}</span></td>
            <td className="p-2 text-right"><button type="button" disabled={pending} onClick={() => {
              setEditing(entry); setName(entry.name); setDescription(entry.description || ""); setActive(entry.isActive); setAllowedUnitTypes(entry.allowedUnitTypes);
            }} className="text-blue-700 underline">Editar</button></td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-slate-500">Nenhum registro neste catálogo.</p>}
        <div className="border-t px-3 py-1.5"><ErpPagination page={activePage} total={rows.length} pageSize={PAGE_SIZE} previousHref="#" nextHref="#" label="registros" onPageChange={setPage} /></div>
      </div>
    </section>
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Histórico do salário mínimo</h2>
      <p className="text-sm text-slate-500">Cada valor é registrado por início de vigência, preservando os valores anteriores.</p>
      <form onSubmit={submitWage} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">Início da vigência<input required type="date" className={field} value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">Valor (R$)<input required type="number" min="0.01" step="0.01" className={field} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Registrar vigência</button>
      </form>
      <div className="rounded-lg border border-slate-200"><table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500"><tr><th className="p-2">Início da vigência</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>{visibleWages.map((wage) => <tr key={wage.id} className="h-9 border-t hover:bg-slate-50"><td className="p-2">{wage.validFrom.split("-").reverse().join("/")}</td><td className="p-2 text-right">{Number(wage.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td></tr>)}</tbody></table>{!wages.length && <p className="p-4 text-sm text-slate-500">Nenhuma vigência registrada.</p>}<div className="border-t px-3 py-1.5"><ErpPagination page={activeWagePage} total={wages.length} pageSize={PAGE_SIZE} previousHref="#" nextHref="#" label="vigências" onPageChange={setWagePage} /></div></div>
    </section>
  </PageFrame>;
}
