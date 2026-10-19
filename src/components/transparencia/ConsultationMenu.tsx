"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { Menu, ChevronDown } from "lucide-react";

export function ConsultationMenu({ items, current }: { items: { slug: string; title: string; group: string; href: string }[]; current: string }) {
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const id = useId();
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const filtered = items.filter(item => normalize(`${item.title} ${item.group}`).includes(normalize(search)));
  const groups = [...new Set(filtered.map(item => item.group))];
  return <nav aria-label="Consultas por assunto" className="h-fit min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <button type="button" aria-expanded={mobileOpen} aria-controls={id} onClick={() => setMobileOpen(!mobileOpen)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-bold text-[#0e4c7e] focus-visible:outline-3 focus-visible:outline-offset-3 lg:hidden"><span className="flex items-center gap-2"><Menu className="size-5" aria-hidden="true" />Escolher outra consulta</span><ChevronDown className="size-4" aria-hidden="true" /></button>
    <div id={id} className={`${mobileOpen ? "block" : "hidden"} space-y-4 lg:block`}>
      <label className="block text-sm font-bold text-slate-800">Localizar consulta<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800" placeholder="Ex.: obras, pessoal, contas" /></label>
      {groups.map(group => <details key={group} open={Boolean(search) || filtered.some(item => item.group === group && item.slug === current)}><summary className="cursor-pointer py-2 text-sm font-bold text-slate-800">{group}</summary><ul className="mt-1 space-y-1">{filtered.filter(item => item.group === group).map(item => <li key={item.slug}><Link prefetch={false} aria-current={current === item.slug ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm leading-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800 ${current === item.slug ? "bg-[#0e4c7e] font-semibold text-white" : "text-slate-700 hover:bg-sky-50"}`} href={item.href}>{item.title}</Link></li>)}</ul></details>)}
      {!filtered.length && <p role="status" className="text-sm text-slate-600">Nenhuma consulta localizada.</p>}
    </div>
  </nav>;
}
