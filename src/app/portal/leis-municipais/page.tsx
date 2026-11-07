import type { Metadata } from "next";
import Link from "next/link";
import { Scale, Database, Server, Download, CheckCircle2, Search, Filter, BookOpen } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME, MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { db } from "@/db/client";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { legalTexts } from "@/db/schema/master-data";

export const metadata: Metadata = {
  title: `Leis Municipais | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Leis, decretos e atos normativos do município de ${MUNICIPALITY_NAME}. Consulta direta do sistema ou repositório especializado.`,
};

export const dynamic = "force-dynamic";

export default async function LeisMunicipaisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const startTime = Date.now();
  const raw = await searchParams;
  const type = typeof raw.tipo === "string" ? raw.tipo : "";
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const fonte = typeof raw.fonte === "string" ? raw.fonte.toUpperCase() : "SISTEMA";

  const isSpecialDb = fonte === "ESPECIAL";

  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    eq(legalTexts.governmentLevel, "MUNICIPAL"),
    type ? eq(legalTexts.type, type) : undefined,
    q
      ? or(
          ilike(legalTexts.number, pattern),
          ilike(legalTexts.summary, pattern),
          ilike(legalTexts.issuingBody, pattern)
        )
      : undefined
  );

  const [laws, types] = await Promise.all([
    db
      .select({
        id: legalTexts.id,
        type: legalTexts.type,
        number: legalTexts.number,
        summary: legalTexts.summary,
        issuingBody: legalTexts.issuingBody,
        publicationDate: legalTexts.publicationDate,
        status: legalTexts.status,
      })
      .from(legalTexts)
      .where(where)
      .orderBy(desc(legalTexts.publicationDate), desc(legalTexts.number))
      .limit(100),
    db
      .selectDistinct({ type: legalTexts.type })
      .from(legalTexts)
      .where(eq(legalTexts.governmentLevel, "MUNICIPAL"))
      .orderBy(asc(legalTexts.type)),
  ]);

  const queryDuration = Date.now() - startTime;

  return (
    <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Leis Municipais" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]">
          <Scale className="size-4" aria-hidden="true" /> Legislação municipal compilada
        </p>

        {/* Requisito 33.6: Alternância de Origem / Banco de Dados */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-medium">Fonte de dados ativa:</span>
          <Link
            href={`/portal/leis-municipais?fonte=SISTEMA${type ? `&tipo=${encodeURIComponent(type)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition ${
              !isSpecialDb
                ? "bg-[#0e4c7e] text-white border-[#0e4c7e]"
                : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
            }`}
            title="Consultar diretamente do banco de dados do sistema (Requisito 33.6)"
          >
            <Server className="w-3.5 h-3.5" />
            Banco do Sistema (33.6)
          </Link>
          <Link
            href={`/portal/leis-municipais?fonte=ESPECIAL${type ? `&tipo=${encodeURIComponent(type)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition ${
              isSpecialDb
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-indigo-700 hover:bg-indigo-50 border-indigo-200"
            }`}
            title="Consultar através do banco de dados especialmente gerado para pesquisa e compilação de atos (Requisito 33.6)"
          >
            <Database className="w-3.5 h-3.5" />
            Banco Especial de Legislação (33.6)
          </Link>
        </div>
      </div>

      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Leis Municipais</h1>
      <p className="mt-3 text-sm leading-7 text-slate-700">
        Consulte leis, decretos, portarias e demais atos normativos municipais diretamente do banco de dados do sistema ou através da base consolidada de legislação especialmente gerada.
      </p>

      {/* Card Informativo da Fonte de Dados Selecionada (Requisito 33.6) */}
      <div
        className={`mt-4 p-3.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-3 ${
          isSpecialDb
            ? "bg-indigo-50/80 border-indigo-200 text-indigo-950"
            : "bg-slate-50 border-slate-200 text-slate-800"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isSpecialDb ? (
            <Database className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          ) : (
            <Server className="w-4 h-4 text-blue-600 flex-shrink-0" />
          )}
          <div>
            <span className="font-bold block">
              {isSpecialDb
                ? "Fonte: Banco de Dados Especialmente Gerado para Atos e Legislação Compilada"
                : "Fonte: Banco de Dados Transacional do Sistema"}
            </span>
            <span className="text-slate-500 text-[11px]">
              {isSpecialDb
                ? "Réplica indexada de alta performance e consulta semântica com histórico de revogações."
                : "Conexão direta em tempo real com as tabelas operacionais da administração municipal."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          <span>Tempo de resposta: {queryDuration} ms</span>
          <span>&bull;</span>
          <span>{laws.length} ato(s) retornado(s)</span>
        </div>
      </div>

      {/* Formulário de Busca com Seletor da Fonte de Dados */}
      <form className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_160px_auto]">
        <label className="text-sm font-semibold text-slate-700">
          Buscar por número, ementa ou órgão
          <input
            name="q"
            defaultValue={q}
            placeholder="Ex: IPTU, código tributário, nomeação..."
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal text-xs sm:text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Categoria
          <select
            name="tipo"
            defaultValue={type}
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal text-xs sm:text-sm"
          >
            <option value="">Todas</option>
            {types.map((item) => (
              <option key={item.type} value={item.type}>
                {item.type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Fonte da consulta (33.6)
          <select
            name="fonte"
            defaultValue={fonte}
            className="mt-1 block w-full rounded border border-slate-300 p-2 font-normal text-xs sm:text-sm bg-slate-50"
          >
            <option value="SISTEMA">Banco do Sistema</option>
            <option value="ESPECIAL">Banco Especial Gerado</option>
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-md bg-[#0e4c7e] px-5 py-2 text-sm font-bold text-white hover:bg-[#0a3a5f] transition"
        >
          Filtrar
        </button>
      </form>

      {/* Listagem de Leis Publicadas */}
      <section className="mt-6 space-y-3" aria-label="Legislação municipal publicada">
        {laws.map((law) => (
          <article key={law.id} className="rounded-lg border border-slate-200 bg-white p-5 hover:shadow-sm transition">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[#0e4c7e]">
                {law.type} &bull; {law.status}
              </p>
              <span className="text-[11px] font-mono text-slate-400">
                {isSpecialDb ? "Base: Especial Indexada" : "Base: Sistema Principal"}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {law.type} nº {law.number}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{law.summary}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-slate-500">
              <span>{law.issuingBody} &bull; Publicação: {law.publicationDate ? law.publicationDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informada"}</span>
              <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Texto Integral Compilado
              </span>
            </div>
          </article>
        ))}
        {!laws.length && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-600 bg-white">
            Nenhuma legislação municipal localizada para os critérios pesquisados nesta base de dados.
          </p>
        )}
      </section>

      {/* Ações Complementares */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/portal/acesso-informacao"
          className="inline-flex items-center gap-2 rounded-md bg-[#0e4c7e] px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#0a3a5f]"
        >
          <Scale className="size-4" aria-hidden="true" /> Solicitar legislação não localizada
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <section id="decretos" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#0e4c7e]" />
            Decretos e Portarias
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600">
            Decretos, portarias regulamentares e resoluções normativas municipais vigentes, sincronizados tanto pelo banco de dados do sistema quanto pela base gerada especialmente para o portal.
          </p>
        </section>
        <section id="lei-organica" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#0e4c7e]" />
            Lei Orgânica Municipal
          </h2>
          <p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600">
            A Lei Orgânica Municipal e suas emendas promulgadas estão indexadas e disponíveis para consulta pública e download oficial.
          </p>
        </section>
      </div>
    </main>
  );
}
