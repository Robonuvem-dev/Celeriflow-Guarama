import Link from "next/link";
import { 
  Newspaper, 
  FileOutput, 
  Image as ImageIcon, 
  Globe, 
  ArrowUpRight, 
  FileText, 
  Building2, 
  ClipboardList, 
  HeadphonesIcon,
  ExternalLink,
  Plus
} from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

export default async function PortalCidadaoPage() {
  const { prisma } = await getTenantContextForModule("TRANSPARENCIA");

  const [newsCount, pagesCount, bannersCount, servicesCount, diariesCount] = await Promise.all([
    prisma.portalNews.count().catch(() => 0),
    prisma.portalPage.count().catch(() => 0),
    prisma.portalBanner.count().catch(() => 0),
    prisma.publicService.count().catch(() => 0),
    prisma.officialDiary.count().catch(() => 0),
  ]);

  const latestNews = await prisma.portalNews.findMany({
    take: 4,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, publishedAt: true, createdAt: true },
  }).catch(() => []);

  const latestPages = await prisma.portalPage.findMany({
    take: 4,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, slug: true, status: true, updatedAt: true },
  }).catch(() => []);

  return (
    <PageFrame className="space-y-4">
      <PageHeader 
        title="Portal do Cidadão — Gestão de Conteúdo e Serviços" 
        icon={<Globe className="size-5 shrink-0 text-[#0284C7]" />}
        action={
          <Link 
            href="/portal" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0284C7] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#0369a1]"
          >
            Abrir Portal Público <ExternalLink className="size-3.5" />
          </Link>
        }
      />

      {/* Banner / Boas-vindas */}
      <section className="relative overflow-hidden rounded-xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-blue-50 p-5 shadow-xs">
        <div className="max-w-3xl space-y-2">
          <span className="inline-block rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
            ibema.celeriflow.com.br/portal
          </span>
          <h2 className="text-lg font-bold text-slate-900">
            Gerenciamento centralizado da presença digital do Município
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Aqui você administra as notícias, páginas institucionais, banners da página inicial, 
            carta de serviços públicos e as informações gerais que os cidadãos acessam no portal oficial.
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link
              href="/transparencia/noticias/novo"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Plus className="size-3.5 text-emerald-600" /> Nova Notícia
            </Link>
            <Link
              href="/transparencia/paginas/novo"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Plus className="size-3.5 text-sky-600" /> Nova Página
            </Link>
            <Link
              href="/protocolos/servicos"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <ClipboardList className="size-3.5 text-amber-600" /> Catálogo de Serviços
            </Link>
          </div>
        </div>
      </section>

      {/* Grid de Contadores Principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link href="/transparencia/noticias" className="group block">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Notícias</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:scale-105">
                <Newspaper className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{newsCount}</p>
            <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-blue-700">
              Gerenciar publicações <ArrowUpRight className="size-3" />
            </span>
          </div>
        </Link>

        <Link href="/transparencia/paginas" className="group block">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Páginas & Textos</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition group-hover:scale-105">
                <FileOutput className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{pagesCount}</p>
            <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-purple-700">
              Editar páginas <ArrowUpRight className="size-3" />
            </span>
          </div>
        </Link>

        <Link href="/transparencia/banners" className="group block">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Banners</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition group-hover:scale-105">
                <ImageIcon className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{bannersCount}</p>
            <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-amber-700">
              Destaques visuais <ArrowUpRight className="size-3" />
            </span>
          </div>
        </Link>

        <Link href="/protocolos/servicos" className="group block">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Serviços</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition group-hover:scale-105">
                <ClipboardList className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{servicesCount}</p>
            <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700">
              Carta ao cidadão <ArrowUpRight className="size-3" />
            </span>
          </div>
        </Link>

        <Link href="/transparencia/diario-oficial" className="group block">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-sky-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Diário Oficial</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-stone-100 text-stone-600 transition group-hover:scale-105">
                <FileText className="size-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{diariesCount}</p>
            <span className="mt-1 flex items-center gap-0.5 text-[11px] font-semibold text-stone-700">
              Edições oficiais <ArrowUpRight className="size-3" />
            </span>
          </div>
        </Link>
      </div>

      {/* Duas colunas: Notícias Recentes e Páginas Institucionais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Coluna 1: Notícias Recentes */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="size-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Notícias e Comunicados Recentes</h3>
            </div>
            <Link href="/transparencia/noticias" className="text-xs font-semibold text-blue-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {latestNews.length > 0 ? (
              latestNews.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-xs font-semibold text-slate-800" title={item.title}>
                      {item.title}
                    </p>
                    <span className="text-[11px] text-slate-500">
                      {new Date(item.publishedAt || item.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${item.status === "Publicado" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {item.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-slate-500">Nenhuma notícia cadastrada.</p>
            )}
          </div>
        </div>

        {/* Coluna 2: Páginas e Conteúdo */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileOutput className="size-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">Páginas Institucionais do Portal</h3>
            </div>
            <Link href="/transparencia/paginas" className="text-xs font-semibold text-purple-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {latestPages.length > 0 ? (
              latestPages.map((page) => (
                <div key={page.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-xs font-semibold text-slate-800" title={page.title}>
                      {page.title}
                    </p>
                    <p className="truncate font-mono text-[10px] text-slate-500">
                      /portal/{page.slug}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${page.status === "Publicado" ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
                    {page.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-slate-500">Nenhuma página cadastrada.</p>
            )}
          </div>
        </div>
      </div>

      {/* Atalhos Operacionais e Módulos Integrados */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Atalhos e Gestão de Módulos do Cidadão</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/administracao/secretarias"
            className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <Building2 className="size-4.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Secretarias e Contatos</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Gestão das secretarias exibidas no portal institucional</p>
            </div>
          </Link>

          <Link
            href="/transparencia/solicitacoes"
            className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <HeadphonesIcon className="size-4.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">e-SIC e Ouvidoria</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Acompanhamento dos chamados e manifestações públicas</p>
            </div>
          </Link>

          <Link
            href="/transparencia/publicacoes"
            className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <FileText className="size-4.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Documentos Públicos</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Upload de relatórios, editais e publicações oficiais</p>
            </div>
          </Link>
        </div>
      </section>
    </PageFrame>
  );
}
