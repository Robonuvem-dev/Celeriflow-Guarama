import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Landmark,
  Newspaper,
} from "lucide-react";
import {
  contentExcerpt,
  formatPortalDate,
  getInstitutionalPortalHome,
} from "@/lib/portal-institucional/public-content";
import { MUNICIPALITY_NAME, MUNICIPALITY_STATE } from "@/lib/municipality-identity";

export const dynamic = "force-dynamic";

// ---------- POC demo data ----------

const DEMO_SLIDES = [
  {
    id: 1,
    category: "Educação",
    title: `${MUNICIPALITY_NAME} celebra o Dia das Crianças com atividades especiais`,
    summary: "Escolas municipais organizaram festividades com jogos, teatro e distribuição de brindes para celebrar a data.",
    color: "from-[#1a3a5c]/80 to-[#1a3a5c]/40",
    accent: "bg-[#1e8449]",
  },
  {
    id: 2,
    category: "Saúde",
    title: "Outubro Rosa: prefeitura realiza mutirão de exames preventivos",
    summary: "Unidades de saúde oferecem mamografia e exames ginecológicos gratuitos durante todo o mês de outubro.",
    color: "from-[#7b2a4a]/80 to-[#7b2a4a]/40",
    accent: "bg-[#c0392b]",
  },
  {
    id: 3,
    category: "Transparência",
    title: `${MUNICIPALITY_NAME} conquista Selo Diamante em Transparência Pública`,
    summary: "O município alcançou 96,74% no Índice de Transparência da Administração Pública, figurando entre os melhores do estado.",
    color: "from-[#1a4a1a]/80 to-[#1a4a1a]/40",
    accent: "bg-[#1e8449]",
  },
];

const DEMO_NEWS = [
  { id: 1, category: "Obras", bg: "bg-[#2471a3]", title: "Prefeitura inicia pavimentação de ruas no bairro Centro", date: "09/10/2026" },
  { id: 2, category: "Social", bg: "bg-[#1e8449]", title: "Assistência Social realiza entrega de cestas básicas", date: "07/10/2026" },
  { id: 3, category: "Saúde", bg: "bg-[#c0392b]", title: "Campanha de vacinação contra a gripe atinge meta", date: "05/10/2026" },
  { id: 4, category: "Edital", bg: "bg-[#d68910]", title: "Processo Seletivo Simplificado — Inscrições abertas", date: "01/10/2026" },
];

const DEMO_SECRETARIES = [
  { name: "Pedro Zeni", role: "Secretário", dept: "Viação, Obras e Urbanismo", phone: "(XX) 9-9125-4369" },
  { name: "Saulo Filippini", role: "Secretário", dept: "Assistência Social", phone: "(XX) 9-9925-4630" },
  { name: "Ivan Gonçalves", role: "Secretário", dept: "Administração e Finanças", phone: "(XX) 9-9810-2977" },
  { name: "Melissa Barros", role: "Secretária", dept: "Educação, Cultura e Esporte", phone: "(XX) 9-9930-2920" },
  { name: "Neusa Treviso Monari", role: "Secretária", dept: "Agr., Abastecimento e Meio Ambiente", phone: "(XX) 9-9974-9012" },
  { name: "João Batista de Almeida", role: "Secretário", dept: "Planejamento", phone: "(XX) 8-9971-7015" },
];

const MUNICIPALITY_SHORTCUTS = [
  { label: "História do Município", href: "/portal/historia", icon: BookOpen, bg: "bg-[#1a5276]" },
  { label: "Dados do Município", href: "/portal/historia#dados", icon: Globe, bg: "bg-[#1e8449]" },
  { label: "Símbolos do Município", href: "/portal/historia#simbolos", icon: Landmark, bg: "bg-[#6c3483]" },
];

// ---------- Components ----------

function HeroSlider() {
  // Static for SSR; interactive version would use client component with useState
  const slide = DEMO_SLIDES[0];
  return (
    <section className="relative overflow-hidden bg-slate-900" aria-label="Notícias em destaque">
      {/* Decorative gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-r ${slide.color}`} aria-hidden="true" />

      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <span className={`inline-flex items-center rounded px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white ${slide.accent}`}>
            {slide.category}
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            {slide.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/85">
            {slide.summary}
          </p>
          <Link
            href="/portal/noticias"
            className="mt-7 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-bold text-[#1a5276] shadow transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-white"
          >
            Continuar lendo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Slider controls */}
      <div className="absolute bottom-4 right-4 flex gap-2" aria-label="Navegação do slider">
        <button
          type="button"
          aria-label="Notícia anterior"
          className="flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Próxima notícia"
          className="flex size-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/35"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
        <span className="flex items-center gap-1.5 pl-1">
          {DEMO_SLIDES.map((s, i) => (
            <span key={s.id} className={`block size-2 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} aria-hidden="true" />
          ))}
        </span>
      </div>
    </section>
  );
}

function LatestNewsCard({ news }: { news: { id: number; category: string; bg: string; title: string; date: string } }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`${news.bg} px-4 py-2`}>
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">{news.category}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-slate-500">{news.date}</p>
        <h3 className="mt-2 text-sm font-bold leading-6 text-slate-900">{news.title}</h3>
        <Link
          href="/portal/noticias"
          className="mt-auto pt-4 text-xs font-bold text-[#1a5276] hover:text-[#0e4c7e] hover:underline"
        >
          Continuar lendo →
        </Link>
      </div>
    </article>
  );
}

function SecretaryCard({ secretary }: { secretary: typeof DEMO_SECRETARIES[number] }) {
  const initials = secretary.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#eaf3fa] text-sm font-bold text-[#1a5276]">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-900">{secretary.dept}</p>
        <p className="truncate text-[13px] text-slate-600">{secretary.role}: {secretary.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">📞 {secretary.phone}</p>
      </div>
    </div>
  );
}

// ---------- Page ----------

export default async function InstitutionalPortalHome() {
  const { latestNews, pages } = await getInstitutionalPortalHome();

  return (
    <main>
      {/* ── Hero Slider ── */}
      <HeroSlider />

      {/* ── Featured news + latest news grid ── */}
      <section className="bg-white border-b border-slate-200" aria-labelledby="noticias-titulo">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">

          {/* Latest news from DB if any, else demo */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#1a5276]">Comunicação</p>
              <h2 id="noticias-titulo" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Últimas Notícias</h2>
            </div>
            <Link href="/portal/noticias" className="inline-flex items-center gap-1 text-sm font-bold text-[#1a5276] hover:underline">
              Mais notícias <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {latestNews.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {latestNews.map((news) => (
                <article key={news.slug} className="flex min-h-52 flex-col rounded-xl border border-slate-200 bg-[#fbfcfd] p-5 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">{formatPortalDate(news.publishedAt)}</p>
                  <h3 className="mt-3 text-base font-bold leading-6 text-slate-900">
                    <Link href={`/portal/noticias/${encodeURIComponent(news.slug)}`} className="hover:text-[#1a5276] hover:underline">
                      {news.title}
                    </Link>
                  </h3>
                  {news.subtitle && <p className="mt-2 text-sm font-medium text-[#1a5276]">{news.subtitle}</p>}
                  <p className="mt-3 text-sm leading-6 text-slate-600">{contentExcerpt(news.content)}</p>
                  <Link href={`/portal/noticias/${encodeURIComponent(news.slug)}`} className="mt-auto pt-4 text-sm font-bold text-[#1a5276] hover:underline">
                    Ler notícia →
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            /* Demo news cards when DB is empty */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_NEWS.map((news) => (
                <LatestNewsCard key={news.id} news={news} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Municipality shortcuts ── */}
      <section className="bg-[#f0f4f8] border-b border-slate-200" aria-label="Atalhos do município">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {MUNICIPALITY_SHORTCUTS.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="group flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`${shortcut.bg} flex size-14 items-center justify-center rounded-full text-white transition group-hover:scale-110`}>
                  <shortcut.icon className="size-7" aria-hidden="true" />
                </div>
                <span className="text-sm font-bold text-slate-800 group-hover:text-[#1a5276]">{shortcut.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Secretaries ── */}
      <section className="bg-white border-b border-slate-200" aria-labelledby="secretarias-titulo">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#1a5276]">Administração</p>
              <h2 id="secretarias-titulo" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Secretarias</h2>
            </div>
            <Link href="/portal/secretarias" className="inline-flex items-center gap-1 text-sm font-bold text-[#1a5276] hover:underline">
              Ver todas <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DEMO_SECRETARIES.map((sec) => (
              <SecretaryCard key={sec.dept} secretary={sec} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Institutional pages ── */}
      {pages.length > 0 && (
        <section className="bg-white border-b border-slate-200" aria-labelledby="paginas-titulo">
          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#1a5276]">Informações institucionais</p>
              <h2 id="paginas-titulo" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Páginas publicadas</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/portal/${encodeURIComponent(page.slug)}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 shadow-sm transition hover:border-[#1a5276]/30 hover:text-[#1a5276]"
                >
                  <span>{page.title}</span>
                  <ArrowRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1a5276]" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Informativos POC ── */}
      <section className="bg-white border-b border-slate-200" aria-labelledby="informativos-titulo">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#1a5276]">Prestação de contas</p>
            <h2 id="informativos-titulo" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Informativos</h2>
          </div>
          <div className="rounded-xl border border-[#1a5276]/20 bg-[#eaf3fa] p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#1a5276] text-white">
                <Building2 className="size-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1a5276]">
                  {MUNICIPALITY_NAME} é Selo Diamante em Transparência Pública
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  O município de {MUNICIPALITY_NAME}-{MUNICIPALITY_STATE} alcançou uma das maiores certificações de transparência pública do estado, obtendo 96,74% no Índice de Transparência da Administração Pública (ITP 2025). Com o resultado, conquistou o Selo Diamante, a categoria mais alta, ficando entre os 399 municípios premiados.
                </p>
                <Link href="/portal/portaldatransparencia" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#1a5276] hover:underline">
                  Continuar lendo <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Eventos POC ── */}
      <section className="bg-[#f0f4f8]" aria-labelledby="eventos-titulo">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#1a5276]">Agenda</p>
            <h2 id="eventos-titulo" className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Eventos</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Audiência Pública — PDUI", cat: "Planejamento", date: "20/10/2026", bg: "bg-[#1a5276]" },
              { title: "Curso Gratuito de Informática", cat: "Educação", date: "25/10/2026", bg: "bg-[#1e8449]" },
              { title: "Plano Diretor — Consulta Pública", cat: "Urbanismo", date: "30/10/2026", bg: "bg-[#6c3483]" },
            ].map((ev) => (
              <Link
                key={ev.title}
                href="/portal/noticias"
                className="group flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`${ev.bg} w-1.5 shrink-0`} aria-hidden="true" />
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{ev.cat}</span>
                  <h3 className="mt-1.5 text-sm font-bold text-slate-900 group-hover:text-[#1a5276]">{ev.title}</h3>
                  <p className="mt-2 text-xs text-slate-500">📅 {ev.date}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link href="/portal/noticias" className="inline-flex items-center gap-2 text-sm font-bold text-[#1a5276] hover:underline">
              <Newspaper className="size-4" aria-hidden="true" />
              Ver todas as notícias e eventos
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
