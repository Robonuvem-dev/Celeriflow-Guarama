import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME, MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: `Leis Municipais | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Leis, decretos e atos normativos do município de ${MUNICIPALITY_NAME}.`,
};

export const dynamic = "force-dynamic";

export default async function LeisMunicipaisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams, type = typeof raw.tipo === "string" ? raw.tipo : "", q = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const where = { governmentLevel: "MUNICIPAL", ...(type ? { type } : {}), ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" as const } }, { summary: { contains: q, mode: "insensitive" as const } }, { issuingBody: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [laws, types] = await Promise.all([
    prisma.legalText.findMany({ where, select: { id: true, type: true, number: true, summary: true, issuingBody: true, publicationDate: true, status: true }, orderBy: [{ publicationDate: "desc" }, { number: "desc" }], take: 100 }),
    prisma.legalText.findMany({ where: { governmentLevel: "MUNICIPAL" }, distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } }),
  ]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Leis Municipais" />
      <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]"><Scale className="size-4" aria-hidden="true" /> Legislação compilada</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Leis Municipais</h1>
      <p className="mt-3 text-sm leading-7 text-slate-700">Consulte leis, decretos, portarias e demais atos normativos municipais por categoria.</p>
      <form className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_220px_auto]">
        <label className="text-sm font-semibold text-slate-700">Buscar por número, ementa ou órgão<input name="q" defaultValue={q} className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal" /></label>
        <label className="text-sm font-semibold text-slate-700">Categoria<select name="tipo" defaultValue={type} className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal"><option value="">Todas</option>{types.map(item => <option key={item.type} value={item.type}>{item.type}</option>)}</select></label>
        <button className="self-end rounded-md bg-[#0e4c7e] px-5 py-2 text-sm font-bold text-white hover:bg-[#0a3a5f]">Filtrar</button>
      </form>
      <section className="mt-6 space-y-3" aria-label="Legislação municipal publicada">
        {laws.map(law => <article key={law.id} className="rounded-lg border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#0e4c7e]">{law.type} · {law.status}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{law.type} nº {law.number}</h2><p className="mt-2 text-sm leading-6 text-slate-700">{law.summary}</p><p className="mt-3 text-xs text-slate-500">{law.issuingBody} · Publicação: {law.publicationDate ? law.publicationDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informada"}</p></article>)}
        {!laws.length && <p className="rounded-lg border border-dashed p-5 text-sm text-slate-600">Nenhuma legislação municipal publicada para este filtro.</p>}
      </section>
      <Link href="/portal/acesso-informacao" className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#0e4c7e] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a3a5f]">
        <Scale className="size-4" aria-hidden="true" /> Solicitar legislação não localizada
      </Link>
      <div className="mt-6 grid gap-3">
        <section id="decretos" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Decretos e portarias</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Decretos e portarias vigentes serão publicados nos canais oficiais da Prefeitura.</p>
        </section>
        <section id="lei-organica" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Lei Orgânica Municipal</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">A Lei Orgânica será disponibilizada para consulta quando publicada pela administração.</p>
        </section>
      </div>
    </main>
  );
}
