import Link from "next/link";
import { ArrowRight, Search, ShieldCheck } from "lucide-react";
import type { DiscoverySection } from "@/lib/transparencia/discovery";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";
import { TransparencyHelp, TransparencySection } from "./TransparencyCard";
import type { DiscoverySettings } from "@/lib/transparencia/discovery-settings";
import { PageFeedbackForm } from "./PageFeedbackForm";

export function TransparencySearchForm({ query = "" }: { query?: string }) {
  return (
    <form action={`${publicTransparencyPath}/pesquisa`} role="search" aria-label="Buscar assuntos da transparência" className="mx-auto w-full max-w-2xl text-left">
      <label htmlFor="transparency-discovery-search" className="mb-2 block text-sm font-semibold text-slate-700">O que você procura?</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-3.5 size-5 text-slate-500" aria-hidden="true" />
          <input id="transparency-discovery-search" type="search" name="q" defaultValue={query} maxLength={200} placeholder="Ex.: contratos, salários, medicamentos" className="min-h-12 w-full rounded-lg border border-slate-300 bg-white py-3 pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800" aria-describedby="transparency-search-hint" />
        </div>
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#0e4c7e] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a3a5c] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sky-800">Buscar assuntos <ArrowRight className="size-4" aria-hidden="true" /></button>
      </div>
      <p id="transparency-search-hint" className="mt-2 text-sm leading-6 text-slate-600">Encontre assuntos, serviços e documentos publicados. Para pesquisar registros, escolha uma consulta.</p>
    </form>
  );
}

export function TransparencyHome({ sections, presentation }: { sections: DiscoverySection[]; presentation: DiscoverySettings }) {
  const items = sections.flatMap(section => section.items);
  const shortcuts = presentation.shortcuts.flatMap(id => {
    const item = items.find(item => item.id === id);
    return item ? [item] : [];
  });
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Caminho percorrido" className="flex flex-wrap gap-2 text-sm text-slate-600"><Link href="/portal" className="rounded underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Transparência</span></nav>
      <section aria-labelledby="transparency-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50 px-5 py-3 text-sm font-semibold text-[#0e4c7e] sm:px-8"><ShieldCheck className="size-4" aria-hidden="true" /> Informação pública · acesso sem cadastro</div>
        <div className="px-5 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-sm font-bold uppercase tracking-widest text-[#0e4c7e]">Acesso à informação</p>
          <h1 id="transparency-title" className="mt-3 text-3xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-4xl">{presentation.title}</h1>
          <p className="mx-auto mb-7 mt-4 max-w-2xl text-base leading-7 text-slate-600">{presentation.intro}</p>
          <TransparencySearchForm />
          <nav aria-label="Acessos rápidos da transparência" className="mt-6 flex flex-wrap justify-center gap-2">
            {shortcuts.map(item => <Link key={item.id} prefetch={false} href={item.href} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-[#0e4c7e] hover:border-sky-700 hover:bg-sky-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800">{({ receitas: "Receitas", despesas: "Despesas", licitacoes: "Licitações", contratos: "Contratos", servidores: "Servidores", "acesso-informacao": "e-SIC" } as Record<string, string>)[item.id] || item.title}</Link>)}
          </nav>
        </div>
      </section>
      <nav aria-label="Índice de assuntos" className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <details className="group">
          <summary className="min-h-6 cursor-pointer text-sm font-bold text-slate-800">Navegar por assunto <span className="ml-1 font-normal text-slate-600">— veja as seções do portal</span></summary>
          <ul className="mt-3 flex flex-wrap gap-2">{sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-[#0e4c7e] underline decoration-sky-200 underline-offset-4 hover:bg-sky-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800">{section.title}</a></li>)}</ul>
        </details>
      </nav>
      {sections.map(section => <TransparencySection key={section.id} section={section} />)}
      <TransparencyHelp />
      {presentation.feedbackEnabled && <PageFeedbackForm page="HOME" />}
    </main>
  );
}
